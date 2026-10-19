import { prisma } from '../../config/database';
import { getFirebaseMessaging } from '../../config/firebase';

export type PushNotificationPayload = {
    title: string;
    body: string;
    data?: Record<string, string>;
};

export const dispatchNotificationPush = async (userId: string, payload: PushNotificationPayload): Promise<{
    sent: number;
    failed: number;
    invalidTokenIds: string[];
}> => {
    const messaging = getFirebaseMessaging();
    if (!messaging) {
        return { sent: 0, failed: 0, invalidTokenIds: [] };
    }

    const deviceTokens = await prisma.deviceToken.findMany({
        where: { userId, isActive: true },
        select: { id: true, token: true },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (deviceTokens.length === 0) {
        return { sent: 0, failed: 0, invalidTokenIds: [] };
    }

    try {
        const result = await messaging.sendEachForMulticast({
            tokens: deviceTokens.map((deviceToken) => deviceToken.token),
            notification: {
                title: payload.title,
                body: payload.body,
            },
            data: payload.data ?? {},
        });

        const invalidTokenIds = deviceTokens
            .filter((deviceToken, index) => {
                const response = result.responses[index];
                return response?.error && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(response.error.code);
            })
            .map((deviceToken) => deviceToken.id);

        if (invalidTokenIds.length > 0) {
            await prisma.deviceToken.updateMany({
                where: { id: { in: invalidTokenIds } },
                data: { isActive: false },
            });
        }

        return {
            sent: result.successCount,
            failed: result.failureCount,
            invalidTokenIds,
        };
    } catch {
        return {
            sent: 0,
            failed: deviceTokens.length,
            invalidTokenIds: [],
        };
    }
};

export const dispatchNotificationPushSafely = async (
    userId: string,
    payload: PushNotificationPayload,
    dispatch: typeof dispatchNotificationPush = dispatchNotificationPush,
): Promise<{ sent: number; failed: number; invalidTokenIds: string[] }> => {
    try {
        return await dispatch(userId, payload);
    } catch {
        return { sent: 0, failed: 0, invalidTokenIds: [] };
    }
};
