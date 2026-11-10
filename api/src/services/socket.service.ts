import logger from '@shared/config/logger';
import type {JobStatus} from '@shared/types/rabbitmq';
import {type Server, type Socket} from 'socket.io';

import RabbitMQService from './rabbitmq.service';

let io: Server | null = null;
const jobStatuses = new Map<string, JobStatus>();
const statusCleanupTimers = new Map<string, NodeJS.Timeout>();
const terminalStatusRetentionMs = 5 * 60 * 1000;

const statusPriority: Record<JobStatus, number> = {
  submitted: 0,
  compiling: 1,
  executing: 2,
  failed: 3,
  finished: 3,
};

const emitJobStatus = (jobId: string, status: JobStatus): void => {
  const previousStatus = jobStatuses.get(jobId);

  if (
    previousStatus &&
    statusPriority[status] <= statusPriority[previousStatus]
  ) {
    return;
  }

  jobStatuses.set(jobId, status);
  const cleanupTimer = statusCleanupTimers.get(jobId);

  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    statusCleanupTimers.delete(jobId);
  }

  if (status === 'failed' || status === 'finished') {
    const timer = setTimeout(() => {
      jobStatuses.delete(jobId);
      statusCleanupTimers.delete(jobId);
    }, terminalStatusRetentionMs);

    timer.unref();
    statusCleanupTimers.set(jobId, timer);
  }

  io?.to(jobId).emit('job_status', {jobId, status});
};

const setupServerListeners = (ioInstance: Server): void => {
  ioInstance.on('connection', (socket: Socket) => {
    logger.info({socketId: socket.id}, 'Socket connected');

    socket.on('subscribe', async (jobId: string) => {
      await socket.join(jobId);

      logger.info({socketId: socket.id, jobId}, 'Socket subscribed to job');

      const status = jobStatuses.get(jobId);

      if (status) {
        socket.emit('job_status', {jobId, status});
      }
    });

    socket.on('unsubscribe', async (jobId: string) => {
      await socket.leave(jobId);

      logger.info({socketId: socket.id, jobId}, 'Socket unsubscribed from job');
    });

    socket.on('terminal_input', (payload: {jobId: string; data: string}) => {
      try {
        const {jobId, data} = payload;

        logger.info({jobId, data}, 'Routing terminal input to RabbitMQ');

        RabbitMQService.publishControlMessage(jobId, 'stdin', data);
      } catch (error) {
        logger.error(
          {error, socketId: socket.id},
          'Failed to route terminal input',
        );
      }
    });

    socket.on('disconnect', () => {
      logger.info({socketId: socket.id}, 'Socket disconnected');
    });

    socket.on('error', error => {
      logger.error({error, socketId: socket.id}, 'Socket error');
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
  emitJobStatus,
};
