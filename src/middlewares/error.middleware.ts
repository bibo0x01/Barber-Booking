import { ErrorRequestHandler } from 'express';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

export const errorMiddleware: ErrorRequestHandler = (error, _request, response, _next) => {
    const errorType =
        error && typeof error === 'object' && 'type' in error && typeof error.type === 'string'
            ? error.type
            : null;

    if (errorType === 'entity.parse.failed') {
        response.status(400).json({ success: false, message: 'Invalid JSON request body', errors: [] });
        return;
    }

    if (errorType === 'entity.too.large') {
        response.status(413).json({ success: false, message: 'Request body too large', errors: [] });
        return;
    }

    const apiError = error instanceof ApiError ? error : null;
    const statusCode = apiError?.statusCode ?? 500;
    const message = apiError?.message ?? 'Something went wrong';
    const errors = apiError?.errors ?? [];

    response.status(statusCode).json({
        success: false,
        message,
        errors:
            apiError && !apiError.exposeDetails
                ? []
                : apiError
                    ? env.nodeEnv === 'production'
                        ? errors
                        : errors.length > 0
                            ? errors
                            : [apiError.message]
                    : [],
    });
};