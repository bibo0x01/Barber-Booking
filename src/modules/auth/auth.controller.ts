import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { login, register } from './auth.service';
import { loginSchema, registerSchema } from './auth.validation';

const validationError = (error: { issues: Array<{ path: PropertyKey[]; message: string }> }): ApiError =>
    new ApiError(
        400,
        'Validation failed',
        error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    );

export const registerUser = async (request: Request, response: Response): Promise<void> => {
    const result = registerSchema.safeParse(request.body);

    if (!result.success) {
        throw validationError(result.error);
    }

    const data = await register(result.data, Role.USER);
    response.status(201).json({ success: true, data });
};

export const registerBarber = async (request: Request, response: Response): Promise<void> => {
    const result = registerSchema.safeParse(request.body);

    if (!result.success) {
        throw validationError(result.error);
    }

    const data = await register(result.data, Role.BARBER);
    response.status(201).json({ success: true, data });
};

export const loginUser = async (request: Request, response: Response): Promise<void> => {
    const result = loginSchema.safeParse(request.body);

    if (!result.success) {
        throw validationError(result.error);
    }

    const data = await login(result.data);
    response.json({ success: true, data });
};

export const getCurrentUser = (request: Request, response: Response): void => {
    response.json({ success: true, data: request.authUser });
};