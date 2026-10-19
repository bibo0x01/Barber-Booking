import { Request, Response } from 'express';
import { ApiError } from '../../../utils/ApiError';
import { createService, deleteService, getOwnServices, getPublicServices, updateService } from './service.service';
import { barberIdParamsSchema, createServiceSchema, serviceIdParamsSchema, updateServiceSchema } from './service.validation';

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

export const createCurrentBarberService = async (request: Request, response: Response): Promise<void> => {
    const result = createServiceSchema.safeParse(request.body);

    if (!result.success) {
        throw validationError(result.error);
    }

    const service = await createService(authenticatedUserId(request), result.data);
    response.status(201).json({ success: true, message: 'Service created successfully', data: service });
};

export const getCurrentBarberServices = async (request: Request, response: Response): Promise<void> => {
    const services = await getOwnServices(authenticatedUserId(request));
    response.json({ success: true, message: 'Services retrieved successfully', data: services });
};

export const getPublicBarberServices = async (request: Request, response: Response): Promise<void> => {
    const result = barberIdParamsSchema.safeParse(request.params);

    if (!result.success) {
        throw validationError(result.error);
    }

    const services = await getPublicServices(result.data.barberId);
    response.json({ success: true, message: 'Services retrieved successfully', data: services });
};

export const updateCurrentBarberService = async (request: Request, response: Response): Promise<void> => {
    const result = updateServiceSchema.safeParse(request.body);

    if (!result.success) {
        throw validationError(result.error);
    }

    const serviceIdResult = serviceIdParamsSchema.safeParse(request.params);

    if (!serviceIdResult.success) {
        throw validationError(serviceIdResult.error);
    }

    const service = await updateService(authenticatedUserId(request), serviceIdResult.data.serviceId, result.data);
    response.json({ success: true, message: 'Service updated successfully', data: service });
};

export const deleteCurrentBarberService = async (request: Request, response: Response): Promise<void> => {
    const result = serviceIdParamsSchema.safeParse(request.params);

    if (!result.success) {
        throw validationError(result.error);
    }

    await deleteService(authenticatedUserId(request), result.data.serviceId);
    response.json({ success: true, message: 'Service deactivated successfully', data: null });
};
