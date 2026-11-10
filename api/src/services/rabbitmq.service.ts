import logger from '@shared/config/logger';
import {type ControlAction, isJobStatus} from '@shared/types/rabbitmq';
import amqplib, {type Channel, type ChannelModel} from 'amqplib';

import AppError from '../utils/error';
import SocketService from './socket.service';

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

const rabbitMqUser = process.env.RABBITMQ_DEFAULT_USER ?? '';
const rabbitMqPass = process.env.RABBITMQ_DEFAULT_PASS ?? '';

const amqpUrl =
  rabbitMqUser && rabbitMqPass
    ? `amqp://${rabbitMqUser}:${rabbitMqPass}@localhost:5672`
    : 'amqp://localhost:5672';

const init = async (): Promise<void> => {
  try {
    logger.info({amqpUrl}, 'Connecting to RabbitMQ');
    connection = await amqplib.connect(amqpUrl);

    connection.on('error', error => {
      logger.error({error}, 'RabbitMQ connection error');
    });

    connection.on('close', () => {
      logger.error('RabbitMQ connection closed!');
    });

    channel = await connection.createChannel();

    await channel.assertQueue('execution_queue', {durable: true});
    await channel.assertExchange('execution_streams', 'topic', {
      durable: false,
    });
    await channel.assertExchange('execution_control', 'topic', {
      durable: true,
    });

    const {queue} = await channel.assertQueue('', {exclusive: true});
    await channel.bindQueue(queue, 'execution_streams', 'job.*.out');
    await channel.bindQueue(queue, 'execution_streams', 'job.*.status');

    await channel.consume(
      queue,
      message => {
        if (!message) {
          return;
        }

        const routingKey = message.fields.routingKey;
        const jobId = routingKey.split('.')[1];

        if (!jobId) {
          throw new AppError(500, 'Invalid routing key format');
        }

        const payload = message.content.toString();

        logger.info({jobId, payload}, 'Received stream from RabbitMQ');

        if (routingKey.endsWith('.status')) {
          if (!isJobStatus(payload)) {
            throw new AppError(500, 'Invalid job status');
          }

          SocketService.emitJobStatus(jobId, payload);

          return;
        }

        const io = SocketService.getIO();

        if (!io) {
          throw new AppError(500, 'Socket.IO server not initialized');
        }

        io.to(jobId).emit('execution_output', payload);
      },
      {
        noAck: true,
      },
    );

    logger.info('Connected to RabbitMQ and set up Socket.IO bridge');
  } catch (error) {
    logger.error({error}, 'Failed to initialize RabbitMQ');

    process.exit(1);
  }
};

const publishJob = (jobId: string, code: string): void => {
  if (!channel) {
    throw new AppError(500, 'RabbitMQ channel not initialized');
  }

  channel.sendToQueue('execution_queue', Buffer.from(code), {
    correlationId: jobId,
    persistent: true,
  });
};

const publishControlMessage = (
  jobId: string,
  action: ControlAction,
  payload: string,
): void => {
  if (!channel) {
    throw new AppError(500, 'RabbitMQ channel not initialized');
  }

  const routingKey = `job.${jobId}.${action}`;

  channel.publish('execution_control', routingKey, Buffer.from(payload));
};

export default {
  init,
  publishJob,
  publishControlMessage,
};
