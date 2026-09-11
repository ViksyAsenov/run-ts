import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import {createServer} from 'http';

import logger from './config/logger';
import setupWS from './config/ws';
import errorHandler from './middlewares/errorHandler';
import router from './routes';

const app = express();
const server = createServer(app);

app.use(cors());
app.use(bodyParser.json());

app.use('/', router);

app.use(errorHandler);

server.listen(3000, () => {
  logger.info('Server is running on port 3000');

  setupWS(server, app);
});
