import {type Application} from 'express';
import {type Server as HttpServer} from 'http';
import {Server} from 'socket.io';

import SocketService from '../services/socket.service';
import logger from './logger';

const setupWS = (server: HttpServer, app: Application): void => {
  const io = new Server(server);

  app.set('io', io);

  SocketService.setIO(io);

  logger.info('WebSocket server initialized');
};

export default setupWS;
