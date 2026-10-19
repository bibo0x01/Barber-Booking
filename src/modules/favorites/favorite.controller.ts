import { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError';
import { addFavoriteBarber, getFavoriteStatus, listFavoriteBarbers, removeFavoriteBarber } from './favorite.service';
import { favoriteBarberParamsSchema, favoritesQuerySchema } from './favorite.validation';

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

export const favoriteBarber = async (request: Request, response: Response): Promise<void> => {
    const result = favoriteBarberParamsSchema.safeParse(request.params);

    if (!result.success) {
        throw validationError(result.error);
    }

    const userId = authenticatedUserId(request);
    const favorite = await addFavoriteBarber(userId, result.data.barberId);

    response.json({
        success: true,
        message: favorite.alreadyExists ? 'Barber is already in favorites' : 'Barber added to favorites',
        data: { barberId: favorite.barberId, isFavorite: favorite.isFavorite },
    });
};

export const unfavoriteBarber = async (request: Request, response: Response): Promise<void> => {
    const result = favoriteBarberParamsSchema.safeParse(request.params);

    if (!result.success) {
        throw validationError(result.error);
    }

    const favorite = await removeFavoriteBarber(authenticatedUserId(request), result.data.barberId);
    response.json({
        success: true,
        message: 'Barber removed from favorites',
        data: { barberId: favorite.barberId, isFavorite: favorite.isFavorite },
    });
};

export const getBarberFavoriteStatus = async (request: Request, response: Response): Promise<void> => {
    const result = favoriteBarberParamsSchema.safeParse(request.params);

    if (!result.success) {
        throw validationError(result.error);
    }

    const data = await getFavoriteStatus(authenticatedUserId(request), result.data.barberId);
    response.json({
        success: true,
        message: 'Favorite status retrieved successfully',
        data,
    });
};

export const getMyFavoriteBarbers = async (request: Request, response: Response): Promise<void> => {
    const result = favoritesQuerySchema.safeParse(request.query);

    if (!result.success) {
        throw validationError(result.error);
    }

    const data = await listFavoriteBarbers(authenticatedUserId(request), result.data);
    response.json({
        success: true,
        message: 'Favorites retrieved successfully',
        data,
    });
};
