import {randomUUID} from 'crypto';

import logger from '../config/logger';
import RabbitMQService from './rabbitmq.service';

const submitJob = (code: string): string => {
  const jobId = randomUUID();

  RabbitMQService.publishJob(jobId, code);

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
