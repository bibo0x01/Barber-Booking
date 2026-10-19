import { BookingStatus, Prisma, QueueStatus, Role } from '@prisma/client';
import { prisma } from '../../config/database';

export const queueRoomName = (barberId: string): string => `queue:barber:${barberId}`;

const buildQueuePosition = (queueItems: Array<{ id: string; status: QueueStatus; joinedAt: Date }>, queueId: string) => {
    const ordered = [...queueItems].sort((left, right) => {
        const statusOrder = {
            [QueueStatus.IN_PROGRESS]: 0,
            [QueueStatus.WAITING]: 1,
            [QueueStatus.COMPLETED]: 2,
            [QueueStatus.CANCELLED]: 3,
        };
        const statusDiff = statusOrder[left.status] - statusOrder[right.status];
        if (statusDiff !== 0) {
            return statusDiff;
        }

        const joinedDiff = left.joinedAt.getTime() - right.joinedAt.getTime();
        if (joinedDiff !== 0) {
            return joinedDiff;
        }

        return left.id.localeCompare(right.id);
    });

    return ordered.findIndex((item) => item.id === queueId) + 1;
};

export const getBarberQueueForBarber = async (barberId: string) => {
    const queueEntries = await prisma.queueEntry.findMany({
        where: {
            booking: { barberId },
            status: { in: [QueueStatus.IN_PROGRESS, QueueStatus.WAITING] },
        },
        select: {
            id: true,
            bookingId: true,
            status: true,
            joinedAt: true,
            startedAt: true,
            completedAt: true,
            booking: {
                select: {
                    id: true,
                    startAt: true,
                    endAt: true,
                    serviceName: true,
                    servicePrice: true,
                    serviceDurationMin: true,
                    user: { select: { id: true, name: true } },
                    service: { select: { id: true, name: true, durationMinutes: true, price: true } },
                },
            },
        },
    });

    const orderedEntries = [...queueEntries].sort((left, right) => {
        const statusOrder = {
            [QueueStatus.IN_PROGRESS]: 0,
            [QueueStatus.WAITING]: 1,
            [QueueStatus.COMPLETED]: 2,
            [QueueStatus.CANCELLED]: 3,
        };
        const statusDiff = statusOrder[left.status] - statusOrder[right.status];
        if (statusDiff !== 0) {
            return statusDiff;
        }

        const joinedDiff = left.joinedAt.getTime() - right.joinedAt.getTime();
        if (joinedDiff !== 0) {
            return joinedDiff;
        }

        return left.id.localeCompare(right.id);
    });

    return {
        items: orderedEntries.map((entry) => ({
            queueId: entry.id,
            bookingId: entry.bookingId,
            status: entry.status,
            position: buildQueuePosition(orderedEntries, entry.id),
            joinedAt: entry.joinedAt.toISOString(),
            startedAt: entry.startedAt ? entry.startedAt.toISOString() : null,
            completedAt: entry.completedAt ? entry.completedAt.toISOString() : null,
            customer: { id: entry.booking.user.id, name: entry.booking.user.name },
            service: {
                id: entry.booking.service.id,
                name: entry.booking.service.name,
                durationMinutes: entry.booking.service.durationMinutes,
                price: Number(entry.booking.service.price.toString()),
            },
            startAt: entry.booking.startAt.toISOString(),
            endAt: entry.booking.endAt.toISOString(),
        })),
    };
};

export const getBarberQueueRoomPayload = async (barberId: string) => {
    const queue = await getBarberQueueForBarber(barberId);
    return {
        barberId,
        items: queue.items,
        updatedAt: new Date().toISOString(),
    };
};

export const userMayAccessQueueRoom = async (userId: string, role: Role, barberId: string): Promise<boolean> => {
    if (role === Role.BARBER || role === Role.ADMIN) {
        const barber = await prisma.barber.findUnique({
            where: { userId },
            select: { id: true },
        });

        return barber?.id === barberId;
    }

    const queueEntry = await prisma.queueEntry.findFirst({
        where: {
            booking: {
                barberId,
                userId,
                status: BookingStatus.CONFIRMED,
            },
            status: { in: [QueueStatus.WAITING, QueueStatus.IN_PROGRESS] },
        },
        select: { id: true },
    });

    return Boolean(queueEntry);
};

export const usersMayAccessQueueRoom = async (
    members: Array<{ userId: string; role: Role }>,
    barberId: string,
): Promise<Set<string>> => {
    const eligibleUserIds = [...new Set(members.filter((member) => member.role === Role.USER).map((member) => member.userId))];
    const eligibleBarberIds = [...new Set(members.filter((member) => member.role === Role.BARBER || member.role === Role.ADMIN).map((member) => member.userId))];
    const authorizedUserIds = new Set<string>();

    if (eligibleUserIds.length > 0) {
        const activeCustomers = await prisma.booking.findMany({
            where: {
                barberId,
                userId: { in: eligibleUserIds },
                status: BookingStatus.CONFIRMED,
                queueEntry: { is: { status: { in: [QueueStatus.WAITING, QueueStatus.IN_PROGRESS] } } },
            },
            select: { userId: true },
            distinct: ['userId'],
        });
        for (const customer of activeCustomers) authorizedUserIds.add(customer.userId);
    }

    if (eligibleBarberIds.length > 0) {
        const owner = await prisma.barber.findFirst({
            where: { id: barberId, userId: { in: eligibleBarberIds } },
            select: { userId: true },
        });
        if (owner) authorizedUserIds.add(owner.userId);
    }

    return authorizedUserIds;
};

export const serializeQueueState = <T extends { servicePrice: Prisma.Decimal; serviceName: string; serviceDescription: string | null; serviceDurationMin: number }>(booking: T) => {
    const { servicePrice, serviceName, serviceDescription, serviceDurationMin, ...rest } = booking;
    return {
        ...rest,
        service: {
            name: serviceName,
            description: serviceDescription,
            price: Number(servicePrice.toString()),
            durationMinutes: serviceDurationMin,
        },
    };
};
