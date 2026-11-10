import 'dotenv/config';

import logger from '@shared/config/logger';
import {isControlAction} from '@shared/types/rabbitmq';
import amqplib from 'amqplib';

import processJob from './executor';
import activeProcesses from './state';
import isString from './utils/isString';

const rabbitMqUser = process.env.RABBITMQ_DEFAULT_USER ?? '';
const rabbitMqPass = process.env.RABBITMQ_DEFAULT_PASS ?? '';

const amqpUrl =
  rabbitMqUser && rabbitMqPass
    ? `amqp://${rabbitMqUser}:${rabbitMqPass}@localhost:5672`
    : 'amqp://localhost:5672';

const startWorker = async (): Promise<void> => {
  try {
    const connection = await amqplib.connect(amqpUrl);
    logger.info('Connected to RabbitMQ');

    connection.on('error', error => {
      logger.error({error}, 'RabbitMQ connection error');
    });

    connection.on('close', () => {
      logger.error('RabbitMQ connection closed!');
    });

    const channel = await connection.createChannel();
    logger.info('RabbitMQ channel created');

    await channel.assertQueue('execution_queue', {durable: true});
    await channel.assertExchange('execution_streams', 'topic', {
      durable: false,
    });
    await channel.assertExchange('execution_control', 'topic', {
      durable: true,
    });

    const {queue: controlQueue} = await channel.assertQueue('', {
      exclusive: true,
    });

    await channel.bindQueue(controlQueue, 'execution_control', 'job.#');

    await channel.consume(controlQueue, message => {
      if (!message) {
        return;
      }

      const [prefix, jobId, action] = message.fields.routingKey.split('.');

      if (prefix !== 'job' || !jobId || !isControlAction(action)) {
        logger.error(
          {routingKey: message.fields.routingKey},
          'Received control message with invalid routing key',
        );
        channel.ack(message);

        return;
      }

      const child = activeProcesses.get(jobId);

      if (!child) {
        logger.warn(
          {jobId, action},
          'Received control message for job with no active process',
        );
        channel.ack(message);

        return;
      }

      if (action === 'stdin') {
        const data = message.content.toString();

        if (
          !child.stdin ||
          child.stdin.destroyed ||
          child.stdin.writableEnded
        ) {
          logger.warn({jobId}, 'Cannot write stdin to a closed process');
        } else {
          child.stdin.write(data);
          logger.info({jobId}, 'Forwarded stdin to job process');
        }
      } else {
        const killed = child.kill('SIGKILL');

        logger.info({jobId, killed}, 'Received cancel request for job process');
      }

      channel.ack(message);
    });

    await channel.recover();

    await channel.prefetch(1);

    logger.info('Listening for jobs on "execution_queue"');

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    await channel.consume('execution_queue', async message => {
      if (!message) {
        logger.error('Received empty message from RabbitMQ');

        return;
      }

      const jobId: unknown = message.properties.correlationId ?? null;

      if (!isString(jobId)) {
        logger.error({jobId}, 'Received message with invalid correlationId');

        return;
      }

      logger.info({jobId}, 'Received job from RabbitMQ');

      try {
        await processJob(channel, message);

        logger.info({jobId}, 'Job processed successfully');
      } catch (error) {
        logger.error({jobId, error}, 'Error processing job');

        channel.ack(message);
      }
    });
  } catch (error) {
    logger.error({error}, 'Failed to start RabbitMQ worker');
  }
};

void startWorker();
