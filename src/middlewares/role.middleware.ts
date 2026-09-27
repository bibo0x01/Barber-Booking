import { Role } from '@prisma/client';
import { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';

export const requireRole = (...roles: Role[]): RequestHandler => (request, _response, next) => {
    if (!request.authUser) {
        next(new ApiError(401, 'Authentication required'));
        return;
    }

    if (!roles.includes(request.authUser.role)) {
        next(new ApiError(403, 'Forbidden'));
        return;
    }

    next();
};