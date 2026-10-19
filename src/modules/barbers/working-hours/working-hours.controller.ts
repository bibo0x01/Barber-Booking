import { Request, Response } from 'express';
import { ApiError } from '../../../utils/ApiError';
import {
    createWorkingHour,
    deleteWorkingHour,
    getOwnWorkingHours,
    getPublicWorkingHours,
    updateWorkingHour,
} from './working-hours.service';
import { barberIdParamsSchema, createWorkingHourSchema, updateWorkingHourSchema, workingHourIdParamsSchema } from './working-hours.validation';

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

export const createCurrentBarberWorkingHour = async (request: Request, response: Response): Promise<void> => {
    const result = createWorkingHourSchema.safeParse(request.body);

    if (!result.success) {
        throw validationError(result.error);
    }

    const workingHour = await createWorkingHour(authenticatedUserId(request), result.data);
    response.status(201).json({ success: true, message: 'Working hour created successfully', data: workingHour });
};

export const getCurrentBarberWorkingHours = async (request: Request, response: Response): Promise<void> => {
    const workingHours = await getOwnWorkingHours(authenticatedUserId(request));
    response.json({ success: true, message: 'Working hours retrieved successfully', data: workingHours });
};

export const getPublicBarberWorkingHours = async (request: Request, response: Response): Promise<void> => {
    const result = barberIdParamsSchema.safeParse(request.params);

    if (!result.success) {
        throw validationError(result.error);
    }

    const workingHours = await getPublicWorkingHours(result.data.barberId);
    response.json({ success: true, message: 'Working hours retrieved successfully', data: workingHours });
};

export const updateCurrentBarberWorkingHour = async (request: Request, response: Response): Promise<void> => {
    const result = updateWorkingHourSchema.safeParse(request.body);

    if (!result.success) {
        throw validationError(result.error);
    }

    const params = workingHourIdParamsSchema.safeParse(request.params);

    if (!params.success) {
        throw validationError(params.error);
    }

    const workingHour = await updateWorkingHour(authenticatedUserId(request), params.data.workingHourId, result.data);
    response.json({ success: true, message: 'Working hour updated successfully', data: workingHour });
};

export const deleteCurrentBarberWorkingHour = async (request: Request, response: Response): Promise<void> => {
    const result = workingHourIdParamsSchema.safeParse(request.params);

    if (!result.success) {
        throw validationError(result.error);
    }

    await deleteWorkingHour(authenticatedUserId(request), result.data.workingHourId);
    response.json({ success: true, message: 'Working hour deactivated successfully', data: null });
};
