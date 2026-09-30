import {type NextFunction, type RequestHandler, type Response} from 'express';

import {type TypedRequest} from '../middlewares/validation';

const withValidation = <
  T extends {body?: unknown; query?: unknown; params?: unknown},
>(
  handler: (req: TypedRequest<T>, res: Response, next: NextFunction) => unknown,
): RequestHandler => {
  return (req, res, next) => handler(req as TypedRequest<T>, res, next);
};

export default withValidation;
