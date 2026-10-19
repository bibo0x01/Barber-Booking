import { z } from 'zod';

const devicePlatformSchema = z.enum(['ANDROID', 'IOS', 'WEB']);

export const listNotificationQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
});

export const notificationIdParamsSchema = z.object({
    notificationId: z.string().min(1),
});

export const registerDeviceTokenSchema = z.object({
    token: z.string().trim().min(1, 'Device token is required'),
    platform: devicePlatformSchema.default('WEB'),
});

export const deviceTokenIdParamsSchema = z.object({
    deviceTokenId: z.string().min(1, 'Device token id is required'),
});
