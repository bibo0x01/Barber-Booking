import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import {
    deleteCurrentUserDeviceToken,
    getCurrentUserNotifications,
    getCurrentUserUnreadNotificationCount,
    listCurrentUserDeviceTokens,
    markAllCurrentUserNotificationsAsRead,
    markCurrentUserNotificationAsRead,
    registerCurrentUserDeviceToken,
} from './notification.controller';

export const notificationRouter = Router();

notificationRouter.get('/', authenticate, getCurrentUserNotifications);
notificationRouter.get('/unread-count', authenticate, getCurrentUserUnreadNotificationCount);
notificationRouter.get('/devices', authenticate, listCurrentUserDeviceTokens);
notificationRouter.post('/devices', authenticate, registerCurrentUserDeviceToken);
notificationRouter.delete('/devices/:deviceTokenId', authenticate, deleteCurrentUserDeviceToken);
notificationRouter.patch('/read-all', authenticate, markAllCurrentUserNotificationsAsRead);
notificationRouter.patch('/:notificationId/read', authenticate, markCurrentUserNotificationAsRead);
