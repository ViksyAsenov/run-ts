import type {Response} from 'express';

type ApiResponse<T> =
  {success: true; data: T} | {success: false; error: {message: string}};

const sendSuccess = <T>(
  res: Response,
  data: T,
  status = 200,
): Response<ApiResponse<T>> => {
  return res.status(status).json({success: true, data}) as Response<
    ApiResponse<T>
  >;
};

const sendError = (
  res: Response,
  message: string,
  status = 400,
): Response<ApiResponse<never>> => {
  return res
    .status(status)
    .json({success: false, error: {message}}) as Response<ApiResponse<never>>;
};

export {sendError, sendSuccess};
