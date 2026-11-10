import logger from '@shared/config/logger';
import type {JobStatus} from '@shared/types/rabbitmq';
import {type Channel, type ConsumeMessage} from 'amqplib';
import {exec, spawn} from 'child_process';
import {mkdir, unlink, writeFile} from 'fs/promises';
import path from 'path';
import {promisify} from 'util';

import activeProcesses from './state';
import isString from './utils/isString';

const execAsync = promisify(exec);

const publishJobStatus = (
  channel: Channel,
  jobId: string,
  status: JobStatus,
): void => {
  channel.publish(
    'execution_streams',
    `job.${jobId}.status`,
    Buffer.from(status),
  );
};

const processJob = async (
  channel: Channel,
  message: ConsumeMessage,
): Promise<void> => {
  if (
    !message.properties.correlationId ||
    !isString(message.properties.correlationId)
  ) {
    logger.error('Message is missing a valid correlationId');

    throw new Error('Message is missing a valid correlationId');
  }

  const jobId = message.properties.correlationId;
  const tsCode = message.content.toString();
  const streamTopic = `job.${jobId}.out`;

  const workDir = path.join(process.cwd(), 'executions');
  await mkdir(workDir, {recursive: true}).catch(() => {
    /* empty */
  });

  const tsFilePath = path.join(workDir, `${jobId}.ts`);
  const jsFilePath = path.join(workDir, `${jobId}.js`);

  try {
    publishJobStatus(channel, jobId, 'compiling');
    await writeFile(tsFilePath, tsCode);

    try {
      await execAsync(
        `npx tsc ${tsFilePath} --target ES2022 --module CommonJS --ignoreConfig --types node`,
      );

      logger.info({jobId}, 'Compilation successful');
    } catch (compileError: unknown) {
      logger.error({jobId, compileError}, 'Compilation failed');
      publishJobStatus(channel, jobId, 'failed');

      const compilerOutput =
        compileError instanceof Error
          ? ((compileError as Error & {stdout?: string}).stdout ??
            compileError.message)
          : 'Unknown compilation error';

      channel.publish(
        'execution_streams',
        streamTopic,
        Buffer.from(`Compiler Error: ${compilerOutput}`),
      );

      return;
    }

    logger.info({jobId}, 'Spawning Node.js process for execution');
    publishJobStatus(channel, jobId, 'executing');

    const child = spawn('node', [jsFilePath]);

    activeProcesses.set(jobId, child);

    child.stdout.on('data', data => {
      if (Buffer.isBuffer(data)) {
        channel.publish('execution_streams', streamTopic, data);
      }
    });

    child.stderr.on('data', data => {
      if (Buffer.isBuffer(data)) {
        channel.publish('execution_streams', streamTopic, data);
      }
    });

    await new Promise(resolve => {
      child.on('error', error => {
        logger.error({jobId, error}, 'Process error');
        publishJobStatus(channel, jobId, 'failed');

        channel.publish(
          'execution_streams',
          streamTopic,
          Buffer.from(`Process error: ${error.message}`),
        );

        resolve(false);
      });

      child.on('close', (code, signal) => {
        if (code !== null || signal !== null) {
          if (signal) {
            publishJobStatus(channel, jobId, 'failed');
            const reason =
              signal === 'SIGKILL' ? 'Timeout or Force Kill' : signal;

            logger.info({jobId, reason}, 'Process terminated');

            channel.publish(
              'execution_streams',
              streamTopic,
              Buffer.from(`Process terminated: ${reason}`),
            );
          } else if (code === 0) {
            publishJobStatus(channel, jobId, 'finished');
            logger.info({jobId}, 'Process completed successfully');
          } else {
            publishJobStatus(channel, jobId, 'failed');
            logger.error({jobId, code}, 'Process exited with error code');

            channel.publish(
              'execution_streams',
              streamTopic,
              Buffer.from(
                `Process crashed with exit code ${String(code ?? 'unknown')}`,
              ),
            );
          }

          resolve(true);
        }

        const exitCode = code ?? 'unknown';
        let exitMessage = `Process exited with code ${String(exitCode)}`;

        if (signal === 'SIGKILL' || signal === 'SIGTERM') {
          exitMessage = 'Process forcibly terminated';
        }

        channel.publish(
          'execution_streams',
          streamTopic,
          Buffer.from(exitMessage),
        );

        resolve(true);
      });
    });
  } catch (systemError: unknown) {
    publishJobStatus(channel, jobId, 'failed');
    channel.publish(
      'execution_streams',
      streamTopic,
      Buffer.from(
        `System Error: ${systemError instanceof Error ? systemError.message : 'Unknown error occurred'}`,
      ),
    );
  } finally {
    activeProcesses.delete(jobId);

    await unlink(tsFilePath).catch(() => {
      /* empty */
    });
    await unlink(jsFilePath).catch(() => {
      /* empty */
    });

    channel.ack(message);
  }
};

export default processJob;
