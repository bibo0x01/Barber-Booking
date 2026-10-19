import { Request, Response } from 'express';
import { ApiError } from '../../../utils/ApiError';
import {
    addGalleryImage,
    deleteGalleryImage,
    getOwnGallery,
    getPublicGallery,
    reorderGallery,
} from './gallery.service';
import {
    addGalleryImageSchema,
    barberIdParamsSchema,
    galleryImageIdParamsSchema,
    reorderGallerySchema,
} from './gallery.validation';

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

export const addCurrentBarberGalleryImage = async (request: Request, response: Response): Promise<void> => {
    const result = addGalleryImageSchema.safeParse(request.body);

    if (!result.success) {
        throw validationError(result.error);
    }

    const image = await addGalleryImage(authenticatedUserId(request), result.data);
    response.status(201).json({ success: true, message: 'Gallery image added successfully', data: image });
};

export const getCurrentBarberGallery = async (request: Request, response: Response): Promise<void> => {
    const images = await getOwnGallery(authenticatedUserId(request));
    response.json({ success: true, message: 'Gallery retrieved successfully', data: images });
};

export const getPublicBarberGallery = async (request: Request, response: Response): Promise<void> => {
    const result = barberIdParamsSchema.safeParse(request.params);

    if (!result.success) {
        throw validationError(result.error);
    }

    const images = await getPublicGallery(result.data.barberId);
    response.json({ success: true, message: 'Gallery retrieved successfully', data: images });
};

export const reorderCurrentBarberGallery = async (request: Request, response: Response): Promise<void> => {
    const result = reorderGallerySchema.safeParse(request.body);

    if (!result.success) {
        throw validationError(result.error);
    }

    const images = await reorderGallery(authenticatedUserId(request), result.data);
    response.json({ success: true, message: 'Gallery reordered successfully', data: images });
};

export const deleteCurrentBarberGalleryImage = async (request: Request, response: Response): Promise<void> => {
    const result = galleryImageIdParamsSchema.safeParse(request.params);

    if (!result.success) {
        throw validationError(result.error);
    }

    await deleteGalleryImage(authenticatedUserId(request), result.data.imageId);
    response.json({ success: true, message: 'Gallery image deleted successfully', data: null });
};
