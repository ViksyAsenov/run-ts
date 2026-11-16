import logger from '@shared/config/logger';
import type {JobStatus} from '@shared/types/rabbitmq';
import {type Channel, type ConsumeMessage} from 'amqplib';
import {exec, spawn} from 'child_process';
import {mkdir, unlink, writeFile} from 'fs/promises';
import path from 'path';
import {promisify} from 'util';

import {activeProcesses, resetProcessTimeouts} from './state';
import isString from './utils/isString';

const inactivityTimeoutMs = 15 * 1000;

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

    let timedOut = false;
    const terminateAfterTimeout = (): void => {
      timedOut = true;
      const killed = child.kill('SIGKILL');

      logger.warn(
        {jobId, killed, timeoutMs: inactivityTimeoutMs},
        'Process inactive for too long; terminating process',
      );
    };
    let timeout = setTimeout(terminateAfterTimeout, inactivityTimeoutMs);
    const resetTimeout = (): void => {
      clearTimeout(timeout);
      timeout = setTimeout(terminateAfterTimeout, inactivityTimeoutMs);
    };
    resetProcessTimeouts.set(jobId, resetTimeout);

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

    await new Promise<void>(resolve => {
      let settled = false;
      const complete = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resetProcessTimeouts.delete(jobId);
        resolve();
      };

      child.on('error', error => {
        logger.error({jobId, error}, 'Process error');
        publishJobStatus(channel, jobId, 'failed');

        channel.publish(
          'execution_streams',
          streamTopic,
          Buffer.from(`Process error: ${error.message}`),
        );

        complete();
      });

      child.on('close', (code, signal) => {
        if (settled) {
          return;
        }

        if (timedOut) {
          publishJobStatus(channel, jobId, 'failed');
          logger.warn({jobId}, 'Process terminated after execution timeout');
          channel.publish(
            'execution_streams',
            streamTopic,
            Buffer.from(
              `Process timed out after ${String(inactivityTimeoutMs)} ms without input and was terminated`,
            ),
          );
        } else if (signal) {
          publishJobStatus(channel, jobId, 'failed');
          logger.info({jobId, signal}, 'Process terminated');
          channel.publish(
            'execution_streams',
            streamTopic,
            Buffer.from(`Process terminated: ${signal}`),
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

        complete();
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
    resetProcessTimeouts.delete(jobId);

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
