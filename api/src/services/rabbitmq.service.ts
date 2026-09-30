import ampqplib, {type Channel, type ChannelModel} from 'amqplib';

import logger from '../config/logger';
import AppError from '../utils/error';
import SocketService from './socket.service';

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

type ControlAction = 'stdin' | 'cancel';

const init = async (amqpUrl = 'amqp://localhost:5672'): Promise<void> => {
  try {
    connection = await ampqplib.connect(amqpUrl);

    channel = await connection.createChannel();

    await channel.assertQueue('execution_queue', {durable: true});

    await channel.assertExchange('execution_streams', 'topic', {
      durable: false,
    });

    const {queue} = await channel.assertQueue('', {exclusive: true});
    await channel.bindQueue(queue, 'execution_streams', 'job.*.out');

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

const publishJob = (jobId: string, payload: string): void => {
  if (!channel) {
    throw new AppError(500, 'RabbitMQ channel not initialized');
  }

  channel.sendToQueue('execution_queue', Buffer.from(payload), {
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
