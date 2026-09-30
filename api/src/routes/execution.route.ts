import Router from 'express';

import ExecutionController from '../controllers/execution.controller';
import validate from '../middlewares/validation';
import ExecutionSchema from '../schemas/execution.schema';
import withValidation from '../utils/controller';

const executionRouter = Router();

executionRouter.post(
  '/submit',
  validate(ExecutionSchema.submitJobSchema),
  withValidation(ExecutionController.submitJob),
);

executionRouter.delete(
  '/:jobId',
  validate(ExecutionSchema.cancelJobSchema),
  withValidation(ExecutionController.cancelJob),
);

export default executionRouter;
