import {type NextFunction, type Request, type Response} from 'express';

import logger from '../config/logger';
import AppError from '../utils/error';
import {sendError} from '../utils/response';

const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): Response => {
  if (error instanceof AppError) {
    return sendError(res, error.message, error.statusCode);
  }

  logger.error({error}, '[Unhandled Error]');

  return sendError(res, 'Internal server error', 500);
};

export default errorHandler;
