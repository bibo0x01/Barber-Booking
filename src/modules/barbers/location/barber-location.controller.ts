import { Request, Response } from 'express';
import { ApiError } from '../../../utils/ApiError';
import {
    getOwnBarberLocation,
    getPublicBarberLocation as getPublicBarberLocationData,
    upsertOwnBarberLocation,
} from './barber-location.service';
import { barberIdParamsSchema, upsertBarberLocationSchema } from './barber-location.validation';

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

export const putCurrentBarberLocation = async (request: Request, response: Response): Promise<void> => {
    const result = upsertBarberLocationSchema.safeParse(request.body);

    if (!result.success) {
        throw validationError(result.error);
    }

    const location = await upsertOwnBarberLocation(authenticatedUserId(request), result.data);
    response.json({ success: true, message: 'Location updated successfully', data: location });
};

export const getCurrentBarberLocation = async (request: Request, response: Response): Promise<void> => {
    const location = await getOwnBarberLocation(authenticatedUserId(request));
    response.json({ success: true, message: 'Location fetched successfully', data: location });
};

export const getPublicBarberLocation = async (request: Request, response: Response): Promise<void> => {
    const result = barberIdParamsSchema.safeParse(request.params);

    if (!result.success) {
        throw validationError(result.error);
    }

    const location = await getPublicBarberLocationData(result.data.barberId);
    response.json({ success: true, message: 'Location fetched successfully', data: location });
};
