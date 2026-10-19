import { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError';
import {
    deleteUserDeviceToken,
    getUserDeviceTokens,
    registerUserDeviceToken,
    getUnreadNotificationCount,
    listUserNotifications,
    markAllNotificationsAsRead,
    markNotificationAsRead,
} from './notification.service';
import { deviceTokenIdParamsSchema, listNotificationQuerySchema, notificationIdParamsSchema, registerDeviceTokenSchema } from './notification.validation';

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

const parseListQuery = (request: Request) => {
    const result = listNotificationQuerySchema.safeParse(request.query);
    if (!result.success) {
        throw validationError(result.error);
    }

    return result.data;
};

export const getCurrentUserNotifications = async (request: Request, response: Response): Promise<void> => {
    const notifications = await listUserNotifications(authenticatedUserId(request), parseListQuery(request));
    response.json({ success: true, message: 'Notifications retrieved successfully', data: notifications });
};

export const getCurrentUserUnreadNotificationCount = async (request: Request, response: Response): Promise<void> => {
    const count = await getUnreadNotificationCount(authenticatedUserId(request));
    response.json({ success: true, message: 'Unread notification count retrieved successfully', data: { count } });
};

export const markCurrentUserNotificationAsRead = async (request: Request, response: Response): Promise<void> => {
    const result = notificationIdParamsSchema.safeParse(request.params);
    if (!result.success) {
        throw validationError(result.error);
    }

    const notification = await markNotificationAsRead(authenticatedUserId(request), result.data.notificationId);
    response.json({ success: true, message: 'Notification marked as read', data: notification });
};

export const markAllCurrentUserNotificationsAsRead = async (request: Request, response: Response): Promise<void> => {
    const result = await markAllNotificationsAsRead(authenticatedUserId(request));
    response.json({ success: true, message: 'Notifications marked as read', data: result });
};

export const registerCurrentUserDeviceToken = async (request: Request, response: Response): Promise<void> => {
    const result = registerDeviceTokenSchema.safeParse(request.body);
    if (!result.success) {
        throw validationError(result.error);
    }

    const deviceToken = await registerUserDeviceToken(authenticatedUserId(request), result.data);
    response.status(201).json({ success: true, message: 'Device token registered successfully', data: deviceToken });
};

export const listCurrentUserDeviceTokens = async (request: Request, response: Response): Promise<void> => {
    const deviceTokens = await getUserDeviceTokens(authenticatedUserId(request));
    response.json({ success: true, message: 'Device tokens retrieved successfully', data: deviceTokens });
};

export const deleteCurrentUserDeviceToken = async (request: Request, response: Response): Promise<void> => {
    const result = deviceTokenIdParamsSchema.safeParse(request.params);
    if (!result.success) {
        throw validationError(result.error);
    }

    const deviceToken = await deleteUserDeviceToken(authenticatedUserId(request), result.data.deviceTokenId);
    response.json({ success: true, message: 'Device token removed successfully', data: deviceToken });
};
