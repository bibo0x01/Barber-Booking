import { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError';
import {
    createBarberProfile,
    getBarberProfile,
    getCurrentBarberPublicProfile,
    getPublicBarberProfile,
    updateBarberProfile,
} from './barber.service';
import { barberIdParamsSchema, createBarberSchema, updateBarberSchema } from './barber.validation';

const validationError = (error: { issues: Array<{ path: PropertyKey[]; message: string }> }): ApiError =>
    new ApiError(
        400,
        'Validation failed',
        error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    );

const authenticatedUserId = (request: Request): string => {
    if (!request.authUser) {
        throw new ApiError(401, 'Authentication required');
    }

    return request.authUser.id;
};

export const createCurrentBarber = async (request: Request, response: Response): Promise<void> => {
    const result = createBarberSchema.safeParse(request.body);

    if (!result.success) {
        throw validationError(result.error);
    }

    const barber = await createBarberProfile(authenticatedUserId(request), result.data);
    response.status(201).json({
        success: true,
        message: 'Barber profile created successfully',
        data: barber,
    });
};

export const getCurrentBarber = async (request: Request, response: Response): Promise<void> => {
    const barber = await getBarberProfile(authenticatedUserId(request));
    response.json({ success: true, data: barber });
};

export const getCurrentBarberProfile = async (request: Request, response: Response): Promise<void> => {
    const barber = await getCurrentBarberPublicProfile(authenticatedUserId(request));
    response.json({
        success: true,
        message: 'Barber profile retrieved successfully',
        data: barber,
    });
};

export const getPublicBarberProfileById = async (request: Request, response: Response): Promise<void> => {
    const result = barberIdParamsSchema.safeParse(request.params);

    if (!result.success) {
        throw validationError(result.error);
    }

    const barber = await getPublicBarberProfile(result.data.barberId);
    response.json({
        success: true,
        message: 'Barber profile retrieved successfully',
        data: barber,
    });
};

export const updateCurrentBarber = async (request: Request, response: Response): Promise<void> => {
    const result = updateBarberSchema.safeParse(request.body);

    if (!result.success) {
        throw validationError(result.error);
    }

    const barber = await updateBarberProfile(authenticatedUserId(request), result.data);
    response.json({
        success: true,
        message: 'Barber profile updated successfully',
        data: barber,
    });
};
