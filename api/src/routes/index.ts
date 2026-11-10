import Router from 'express';

import {sendSuccess} from '../utils/response';
import ExecutionRouter from './execution.route';
const router = Router();

router.get('/health', (req, res) => {
  return sendSuccess(res, {status: 'ok'});
});

router.use('/execution', ExecutionRouter);

export default router;
