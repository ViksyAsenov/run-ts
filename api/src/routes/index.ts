import Router from 'express';

import {sendSuccess} from '../utils/response';
const router = Router();

router.get('/health', (req, res) => {
  return sendSuccess(res, {status: 'ok'});
});

export default router;
