import { RequestHandler } from 'express';
import { Role } from '@prisma/client';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { findAuthenticatedUser } from '../modules/auth/auth.service';

type AccessTokenPayload = JwtPayload & {
    userId: string;
    role: Role;
};

const isAccessTokenPayload = (payload: string | JwtPayload): payload is AccessTokenPayload =>
    typeof payload !== 'string' &&
    typeof payload.userId === 'string' &&
    typeof payload.role === 'string' &&
    Object.values(Role).includes(payload.role as Role);

export const authenticate: RequestHandler = async (request, _response, next) => {
    const authorization = request.header('authorization');
    const parts = authorization?.trim().split(/\s+/) ?? [];
    const [scheme, token] = parts;

    if (parts.length !== 2 || scheme?.toLowerCase() !== 'bearer' || !token) {
        next(new ApiError(401, 'Authentication required'));
        return;
    }

    try {
        const payload = jwt.verify(token, env.jwtSecret);

        if (!isAccessTokenPayload(payload)) {
            next(new ApiError(401, 'Invalid or expired token'));
            return;
        }

        request.authUser = await findAuthenticatedUser(payload.userId);
        next();
    } catch (error: unknown) {
        next(error instanceof ApiError ? error : new ApiError(401, 'Invalid or expired token'));
    }
};