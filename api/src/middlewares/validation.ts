import {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import z, {ZodError, type ZodObject} from 'zod';

import AppError from '../utils/error';

interface TypedRequest<
  T extends {body?: unknown; query?: unknown; params?: unknown},
> extends Request {
  validatedBody: T['body'];
  validatedQuery: T['query'];
  validatedParams: T['params'];
}

const validate = (schema: ZodObject): RequestHandler => {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parsed = await schema.parseAsync({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        body: req.body,
        query: req.query,
        params: req.params,
      });

      req.validatedBody = parsed.body;
      req.validatedQuery = parsed.query;
      req.validatedParams = parsed.params;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = z.treeifyError(error).errors.join(', ');

        next(new AppError(400, `Validation failed: ${errorMessages}`));
      } else {
        next(error);
      }
    }
  };
};

export type {TypedRequest};

export default validate;
