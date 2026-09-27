import { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError';
import { changePassword, updateProfile } from './user.service';
import { changePasswordSchema, updateProfileSchema } from './user.validation';

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

export const updateCurrentUser = async (request: Request, response: Response): Promise<void> => {
    const result = updateProfileSchema.safeParse(request.body);

    if (!result.success) {
        throw validationError(result.error);
    }

    const user = await updateProfile(authenticatedUserId(request), result.data);
    response.json({ success: true, message: 'Profile updated successfully', data: user });
};

export const changeCurrentUserPassword = async (request: Request, response: Response): Promise<void> => {
    const result = changePasswordSchema.safeParse(request.body);

    if (!result.success) {
        throw validationError(result.error);
    }

    await changePassword(authenticatedUserId(request), result.data);
    response.json({ success: true, message: 'Password changed successfully', data: null });
};