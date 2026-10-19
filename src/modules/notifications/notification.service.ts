import { DevicePlatform, NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { dispatchNotificationPush } from './push.service';

const notificationSelect = {
    id: true,
    userId: true,
    type: true,
    title: true,
    message: true,
    metadata: true,
    isRead: true,
    readAt: true,
    createdAt: true,
    updatedAt: true,
} as const;

const deviceTokenSelect = {
    id: true,
    userId: true,
    token: true,
    platform: true,
    isActive: true,
    lastUsedAt: true,
    createdAt: true,
    updatedAt: true,
} as const;

export type NotificationListQuery = {
    page: number;
    limit: number;
};

export const createTransactionalNotification = (
    transaction: Prisma.TransactionClient,
    input: {
        userId: string;
        type: NotificationType;
        title: string;
        message: string;
        metadata?: Prisma.InputJsonValue;
    },
) => transaction.notification.create({
    data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: input.metadata ?? {},
    },
    select: {
        id: true,
        userId: true,
        type: true,
        title: true,
        message: true,
    },
});

export const serializeNotification = <T extends {
    id: string;
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata: Prisma.JsonValue | null;
    isRead: boolean;
    readAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}>(notification: T) => ({
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    metadata: notification.metadata ?? {},
    isRead: notification.isRead,
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
});

export const serializeDeviceToken = <T extends {
    id: string;
    userId: string;
    token: string;
    platform: DevicePlatform;
    isActive: boolean;
    lastUsedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}>(deviceToken: T) => ({
    id: deviceToken.id,
    userId: deviceToken.userId,
    token: deviceToken.token,
    platform: deviceToken.platform,
    isActive: deviceToken.isActive,
    lastUsedAt: deviceToken.lastUsedAt ? deviceToken.lastUsedAt.toISOString() : null,
    createdAt: deviceToken.createdAt.toISOString(),
    updatedAt: deviceToken.updatedAt.toISOString(),
});

export const createUserNotification = async (
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata: Prisma.InputJsonValue = {},
) => {
    const notification = await prisma.notification.create({
        data: { userId, type, title, message, metadata },
        select: notificationSelect,
    });

    await dispatchNotificationPush(userId, {
        title,
        body: message,
        data: {
            notificationId: notification.id,
            type: notification.type,
        },
    });

    return serializeNotification(notification);
};

export const registerUserDeviceToken = async (
    userId: string,
    input: { token: string; platform: DevicePlatform },
) => {
    const token = input.token.trim();
    if (!token) {
        throw new ApiError(400, 'Device token is required');
    }

    const existingToken = await prisma.deviceToken.findUnique({
        where: { token },
        select: deviceTokenSelect,
    });

    if (existingToken) {
        if (existingToken.userId !== userId) {
            throw new ApiError(409, 'Device token is already registered');
        }

        const updated = await prisma.deviceToken.update({
            where: { id: existingToken.id },
            data: {
                userId,
                platform: input.platform,
                isActive: true,
                lastUsedAt: new Date(),
            },
            select: deviceTokenSelect,
        });

        return serializeDeviceToken(updated);
    }

    const created = await prisma.deviceToken.create({
        data: {
            userId,
            token,
            platform: input.platform,
            isActive: true,
            lastUsedAt: new Date(),
        },
        select: deviceTokenSelect,
    });

    return serializeDeviceToken(created);
};

export const getUserDeviceTokens = async (userId: string) => {
    const deviceTokens = await prisma.deviceToken.findMany({
        where: { userId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: deviceTokenSelect,
    });

    return {
        items: deviceTokens.map(serializeDeviceToken),
    };
};

export const deleteUserDeviceToken = async (userId: string, deviceTokenId: string) => {
    const existing = await prisma.deviceToken.findFirst({
        where: { id: deviceTokenId, userId },
        select: deviceTokenSelect,
    });

    if (!existing) {
        throw new ApiError(404, 'Device token not found');
    }

    const deleted = await prisma.deviceToken.delete({
        where: { id: deviceTokenId },
        select: deviceTokenSelect,
    });

    return { deleted: true, device: serializeDeviceToken(deleted) };
};

export const listUserNotifications = async (userId: string, query: NotificationListQuery) => {
    const skip = (query.page - 1) * query.limit;
    const [total, notifications] = await prisma.$transaction([
        prisma.notification.count({ where: { userId } }),
        prisma.notification.findMany({
            where: { userId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip,
            take: query.limit,
            select: notificationSelect,
        }),
    ]);

    return {
        items: notifications.map(serializeNotification),
        pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
        },
    };
};

export const getUnreadNotificationCount = async (userId: string): Promise<number> =>
    prisma.notification.count({ where: { userId, isRead: false } });

export const markNotificationAsRead = async (userId: string, notificationId: string) => {
    const existing = await prisma.notification.findFirst({
        where: { id: notificationId, userId },
        select: notificationSelect,
    });

    if (!existing) {
        throw new ApiError(404, 'Notification not found');
    }

    if (existing.isRead) {
        return serializeNotification(existing);
    }

    const updated = await prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true, readAt: new Date() },
        select: notificationSelect,
    });

    return serializeNotification(updated);
};

export const markAllNotificationsAsRead = async (userId: string) => {
    const result = await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true, readAt: new Date() },
    });

    return { updatedCount: result.count };
};
