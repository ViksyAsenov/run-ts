import {type Server, type Socket} from 'socket.io';

import logger from '../config/logger';

let io: Server | null = null;

const setupServerListeners = (ioInstance: Server): void => {
  ioInstance.on('connection', (socket: Socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // socket.on('join_room', async ({value}: {value: string}) => {});

    // socket.on('leave_room', async ({value}: {value: string}) => {});

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
