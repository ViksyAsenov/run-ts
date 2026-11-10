import logger from '@shared/config/logger';
import {randomUUID} from 'crypto';

import RabbitMQService from './rabbitmq.service';
import SocketService from './socket.service';

const submitJob = (code: string): string => {
  const jobId = randomUUID();

  RabbitMQService.publishJob(jobId, code);
  SocketService.emitJobStatus(jobId, 'submitted');

  logger.info(`Submitted job ${jobId} to RabbitMQ`);

  return jobId;
};

const cancelJob = (jobId: string): void => {
  RabbitMQService.publishControlMessage(jobId, 'cancel', '');

  logger.info(`Sent cancel request for job ${jobId} to RabbitMQ`);
};

export default {
  submitJob,
  cancelJob,
};
