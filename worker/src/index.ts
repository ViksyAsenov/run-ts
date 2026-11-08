import logger from '@shared/config/logger';
import {isControlAction} from '@shared/types/rabbitmq';
import amqplib from 'amqplib';
import {type ChildProcess} from 'child_process';

import processJob from './executor';

const activeProcesses = new Map<string, ChildProcess>();
const amqpUrl = 'amqp://localhost:5672';

const startWorker = async (): Promise<void> => {
  const connection = await amqplib.connect(amqpUrl);

  const channel = await connection.createChannel();

  await channel.assertQueue('execution_queue', {durable: true});

  await channel.assertExchange('execution_streams', 'topic', {
    durable: false,
  });

  const {queue} = await channel.assertQueue('', {exclusive: true});

  await channel.bindQueue(queue, 'execution_control', 'job.#');

  await channel.consume(
    queue,
    msg => {
      if (!msg) {
        return;
      }

      const [_, jobId, action] = msg.fields.routingKey.split('.');

      if (!jobId || !action || !isControlAction(action)) {
        logger.error(
          {routingKey: msg.fields.routingKey},
          `Invalid routing key format`,
        );

        return;
      }

      const child = activeProcesses.get(jobId);
      if (!child) {
        return;
      }

      switch (action) {
        case 'cancel': {
          logger.info(`[${jobId}] Received kill signal`);
          child.kill('SIGKILL');

          break;
        }

        case 'stdin': {
          child.stdin?.write(msg.content.toString());

          break;
        }
      }
    },
    {noAck: true},
  );

  await channel.prefetch(1);

  logger.info('Worker initialized, listening for jobs...');

  await channel.consume('execution_queue', msg => {
    if (!msg) {
      return;
    }

    processJob(channel, msg).catch((error: unknown) => {
      logger.error({error}, 'Error processing job');

      channel.nack(msg, false, false);
    });
  });
};

startWorker().catch(logger.error);

export {activeProcesses};
