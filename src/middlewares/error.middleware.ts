import { ErrorRequestHandler } from 'express';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

export const errorMiddleware: ErrorRequestHandler = (error, _request, response, _next) => {
    const apiError = error instanceof ApiError ? error : null;
    const statusCode = apiError?.statusCode ?? 500;
    const message = apiError?.message ?? 'Something went wrong';
    const errors = apiError?.errors ?? [];

    response.status(statusCode).json({
        success: false,
        message,
        errors: env.nodeEnv === 'production' ? errors : errors.length > 0 ? errors : [error instanceof Error ? error.message : error],
    });
};