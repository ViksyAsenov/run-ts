import {type Server, type Socket} from 'socket.io';

import logger from '../config/logger';
import RabbitMQService from './rabbitmq.service';

let io: Server | null = null;

const setupServerListeners = (ioInstance: Server): void => {
  ioInstance.on('connection', (socket: Socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    socket.on('subscribe', async (jobId: string) => {
      await socket.join(jobId);
      logger.info(`Socket ${socket.id} subscribed to job ${jobId}`);
    });

    socket.on('terminal-input', (payload: {jobId: string; data: string}) => {
      try {
        const {jobId, data} = payload;

        RabbitMQService.publishControlMessage(jobId, 'stdin', data);
      } catch (error) {
        logger.error({error}, 'Failed to route terminal input');
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });

    socket.on('error', error => {
      logger.error({error}, 'Socket error');
    });
  });
};

const setIO = (ioInstance: Server): void => {
  io = ioInstance;
  setupServerListeners(ioInstance);
};

const getIO = (): Server | null => {
  return io;
};

export default {
  setIO,
  getIO,
};
