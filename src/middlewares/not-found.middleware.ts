import { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';

export const notFoundMiddleware: RequestHandler = (request, _response, next) => {
    next(new ApiError(404, `Route not found: ${request.method} ${request.originalUrl}`));
};