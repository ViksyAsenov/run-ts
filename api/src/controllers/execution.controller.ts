import {type Response} from 'express';
import type z from 'zod';

import {type TypedRequest} from '../middlewares/validation';
import type ExecutionSchema from '../schemas/execution.schema';
import ExecutionService from '../services/execution.service';
import {sendSuccess} from '../utils/response';

const submitJob = (
  req: TypedRequest<z.infer<typeof ExecutionSchema.submitJobSchema>>,
  res: Response,
): Response => {
  const {code} = req.validatedBody;

  const jobId = ExecutionService.submitJob(code);

  return sendSuccess(res, {jobId});
};

const cancelJob = (
  req: TypedRequest<z.infer<typeof ExecutionSchema.cancelJobSchema>>,
  res: Response,
): Response => {
  const {jobId} = req.validatedParams;

  ExecutionService.cancelJob(jobId);

  return sendSuccess(res, {jobId}, 202);
};

export default {submitJob, cancelJob};
