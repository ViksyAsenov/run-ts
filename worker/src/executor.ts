import {type Channel, type ConsumeMessage} from 'amqplib';
import {exec, spawn} from 'child_process';
import {unlink, writeFile} from 'fs/promises';
import os from 'os';
import path from 'path';
import {promisify} from 'util';

import logger from './config/logger';

const execAsync = promisify(exec);

const isString = (value: unknown): value is string => typeof value === 'string';

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

  const tsFilePath = path.join(os.tmpdir(), `${jobId}.ts`);
  const jsFilePath = path.join(os.tmpdir(), `${jobId}.js`);

  try {
    await writeFile(tsFilePath, tsCode);

    const {stderr: error} = await execAsync(
      `npx tsc ${tsFilePath} --target ES2022 --module CommonJS`,
    );

    if (error) {
      logger.error({error, jobId}, `TypeScript compilation error`);

      channel.publish('execution_streams', streamTopic, Buffer.from(error));

      return;
    }

    const child = spawn('node', [jsFilePath], {
      timeout: 10000,
      killSignal: 'SIGKILL',
    });

    // activeProcesses.set(jobId, child);

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
      child.on('close', (code, signal) => {
        if (code === null || signal === null) {
          logger.error({jobId}, 'Child process closed without code or signal');

          channel.publish(
            'execution_streams',
            streamTopic,
            Buffer.from(`Process closed unexpectedly`),
          );

          resolve(true);

          return;
        }

        let exitMessage = `Process exited with code ${code.toString()}`;

        if (signal === 'SIGKILL' || signal === 'SIGTERM') {
          exitMessage = `Process forcibly terminated`;
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
    if (systemError instanceof Error) {
      channel.publish(
        'execution_streams',
        streamTopic,
        Buffer.from(`System Error - ${systemError.message}`),
      );
    } else {
      channel.publish(
        'execution_streams',
        streamTopic,
        Buffer.from(`System Error - Unknown error occurred`),
      );
    }
  } finally {
    // activeProcesses.delete(jobId);

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
