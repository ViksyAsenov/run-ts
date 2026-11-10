import logger from '@shared/config/logger';
import {type Application} from 'express';
import {type Server as HttpServer} from 'http';
import {Server} from 'socket.io';

import SocketService from '../services/socket.service';

const setupWS = (server: HttpServer, app: Application): void => {
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'DELETE'],
    },
  });

  app.set('io', io);

  SocketService.setIO(io);

  logger.info('WebSocket server initialized');
};

export default setupWS;
