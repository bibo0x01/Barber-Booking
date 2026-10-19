import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import {
    createBarberProfile,
    getBarberProfile,
    getCurrentBarberStatus as fetchCurrentBarberStatus,
    getPublicBarberDetails as fetchPublicBarberDetails,
    getPublicBarberProfile as fetchPublicBarberProfile,
    getPublicBarbers as listPublicBarbers,
    updateBarberProfile,
    updateCurrentBarberStatus as updateOwnBarberStatus,
} from './barber.service';
import { barberIdParamsSchema, createBarberSchema, publicBarberQuerySchema, updateBarberSchema, updateBarberStatusSchema } from './barber.validation';

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

export const getBarberDirectory = async (request: Request, response: Response): Promise<void> => {
    const result = publicBarberQuerySchema.safeParse(request.query);

    if (!result.success) {
        throw validationError(result.error);
    }

    const currentUserId = request.authUser && request.authUser.role === Role.USER ? request.authUser.id : undefined;
    const data = await listPublicBarbers(result.data, currentUserId);
    response.json({ success: true, message: 'Barbers retrieved successfully', data });
};

export const getPublicBarber = async (request: Request, response: Response): Promise<void> => {
    const result = barberIdParamsSchema.safeParse(request.params);

    if (!result.success) {
        throw validationError(result.error);
    }

    const currentUserId = request.authUser && request.authUser.role === Role.USER ? request.authUser.id : undefined;
    const data = await fetchPublicBarberDetails(result.data.barberId, currentUserId);
    response.json({ success: true, message: 'Barber details fetched successfully', data });
};

export const getPublicBarberProfile = async (request: Request, response: Response): Promise<void> => {
    const result = barberIdParamsSchema.safeParse(request.params);

    if (!result.success) {
        throw validationError(result.error);
    }

    const currentUserId = request.authUser && request.authUser.role === Role.USER ? request.authUser.id : undefined;
    const data = await fetchPublicBarberProfile(result.data.barberId, currentUserId);
    response.json({ success: true, message: 'Barber profile fetched successfully', data });
};

export const getCurrentBarberStatus = async (request: Request, response: Response): Promise<void> => {
    const status = await fetchCurrentBarberStatus(authenticatedUserId(request));
    response.json({ success: true, message: 'Barber status retrieved successfully', data: status });
};

export const updateCurrentBarberStatus = async (request: Request, response: Response): Promise<void> => {
    const result = updateBarberStatusSchema.safeParse(request.body);

    if (!result.success) {
        throw validationError(result.error);
    }

    const status = await updateOwnBarberStatus(authenticatedUserId(request), result.data);
    response.json({ success: true, message: 'Barber status updated successfully', data: status });
};
