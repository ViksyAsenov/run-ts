import 'dotenv/config';

import logger from '@shared/config/logger';
import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import {createServer} from 'http';

import setupWS from './config/ws';
import errorHandler from './middlewares/errorHandler';
import router from './routes';
import RabbitMQService from './services/rabbitmq.service';

const app = express();
const server = createServer(app);

app.use(cors());
app.use(bodyParser.json());

app.use('/', router);

app.use(errorHandler);

// eslint-disable-next-line @typescript-eslint/no-misused-promises
server.listen(3000, async () => {
  await RabbitMQService.init();

  logger.info('Server is running on port 3000');

  setupWS(server, app);
});
