import { BookingStatus, NotificationType, Prisma, QueueStatus } from '@prisma/client';
import { emitQueueUpdate } from '../../config/socket';
import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { createTransactionalNotification } from '../notifications/notification.service';
import { dispatchNotificationPushSafely } from '../notifications/push.service';
import { ApiError } from '../../utils/ApiError';
import { BookingListQuery, CancelBookingInput, CreateBookingInput, CustomerBookingListQuery, RebookInput } from './booking.validation';

const serviceSnapshotSelect = {
    name: true,
    description: true,
    price: true,
    durationMinutes: true,
} as const;

const bookingSelect = {
    id: true,
    userId: true,
    barberId: true,
    serviceId: true,
    startAt: true,
    endAt: true,
    status: true,
    serviceName: true,
    serviceDescription: true,
    servicePrice: true,
    serviceDurationMin: true,
    createdAt: true,
    updatedAt: true,
} as const;

const customerBookingSelect = {
    id: true,
    barberId: true,
    serviceId: true,
    startAt: true,
    endAt: true,
    status: true,
    serviceName: true,
    serviceDescription: true,
    servicePrice: true,
    serviceDurationMin: true,
    createdAt: true,
    updatedAt: true,
    barber: {
        select: { id: true, businessName: true },
    },
} as const;

const barberBookingSelect = {
    id: true,
    userId: true,
    barberId: true,
    serviceId: true,
    startAt: true,
    endAt: true,
    status: true,
    serviceName: true,
    serviceDescription: true,
    servicePrice: true,
    serviceDurationMin: true,
    createdAt: true,
    updatedAt: true,
    user: {
        select: { id: true, name: true, avatarUrl: true },
    },
} as const;

const serializePrice = (price: Prisma.Decimal): number => Number(price.toString());

const serializeBooking = <T extends { servicePrice: Prisma.Decimal; serviceName: string; serviceDescription: string | null; serviceDurationMin: number }>(
    booking: T,
): Omit<T, 'servicePrice' | 'serviceName' | 'serviceDescription' | 'serviceDurationMin'> & {
    service: { name: string; description: string | null; price: number; durationMinutes: number };
} => {
    const { servicePrice, serviceName, serviceDescription, serviceDurationMin, ...rest } = booking;
    return {
        ...rest,
        service: {
            name: serviceName,
            description: serviceDescription,
            price: serializePrice(servicePrice),
            durationMinutes: serviceDurationMin,
        },
    };
};

const localDateTimeParts = (instant: Date): { weekday: string; hour: number; minute: number; second: number; millisecond: number } => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: env.appTimezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(instant);
    const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';

    return {
        weekday: get('weekday'),
        hour: Number(get('hour')),
        minute: Number(get('minute')),
        second: Number(get('second')),
        millisecond: instant.getUTCMilliseconds(),
    };
};

const weekdayToDayOfWeek: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const minutesSinceMidnight = (hour: number, minute: number): number => hour * 60 + minute;
const millisecondsSinceMidnight = (parts: ReturnType<typeof localDateTimeParts>): number =>
    ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000 + parts.millisecond;

const isExclusionConstraintViolation = (error: unknown): boolean => {
    if (!(error instanceof Prisma.PrismaClientUnknownRequestError)) {
        return false;
    }

    return (
        error.message.includes('code: "23P01"') &&
        error.message.includes('Booking_no_overlapping_confirmed_barber_time')
    );
};

const throwBookingConflict = (error: unknown): never => {
    if (isExclusionConstraintViolation(error)) {
        throw new ApiError(409, 'The selected time is no longer available', [], false);
    }

    throw error;
};

const serializeListBooking = <T extends { servicePrice: Prisma.Decimal; serviceName: string; serviceDescription: string | null; serviceDurationMin: number }>(
    booking: T,
) => serializeBooking(booking);

type BookingCreationInput = { barberId: string; serviceId: string; startAt: string };
type QueueUpdateDispatcher = typeof emitQueueUpdate;

const dispatchQueueUpdateSafely = async (
    barberId: string,
    dispatch: QueueUpdateDispatcher = emitQueueUpdate,
): Promise<void> => {
    try {
        await dispatch(barberId);
    } catch {
        // The state change is committed; realtime delivery is best-effort.
    }
};

const createBookingWithinTransaction = async (
    transaction: Prisma.TransactionClient,
    userId: string,
    input: BookingCreationInput,
    startAt: Date,
    now: Date,
) => {
    if (startAt.getTime() <= now.getTime()) {
        throw new ApiError(400, 'Booking start time must be in the future');
    }

    const startParts = localDateTimeParts(startAt);
    const dayOfWeek = weekdayToDayOfWeek[startParts.weekday];

    const barber = await transaction.barber.findFirst({
        where: { id: input.barberId, isActive: true },
        select: {
            id: true,
            isOpen: true,
            workingHours: {
                where: { dayOfWeek, isActive: true },
                select: { openTime: true, closeTime: true },
            },
            services: {
                where: { id: input.serviceId, isActive: true },
                select: serviceSnapshotSelect,
                take: 1,
            },
        },
    });

    if (!barber) {
        throw new ApiError(404, 'Barber not found');
    }

    if (!barber.isOpen) {
        throw new ApiError(409, 'Barber is currently closed');
    }

    const service = barber.services[0];
    if (!service) {
        const existingService = await transaction.barberService.findUnique({
            where: { id: input.serviceId },
            select: { barberId: true, isActive: true },
        });
        if (existingService && existingService.barberId !== barber.id) {
            throw new ApiError(400, 'Service does not belong to the selected barber');
        }
        throw new ApiError(404, 'Active service not found');
    }

    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
    const endParts = localDateTimeParts(endAt);
    const endDayOfWeek = weekdayToDayOfWeek[endParts.weekday];
    const workingHour = barber.workingHours[0];

    if (!workingHour) {
        throw new ApiError(400, 'No active working hours for the requested day');
    }

    const [openHour, openMinute] = workingHour.openTime.split(':').map(Number);
    const [closeHour, closeMinute] = workingHour.closeTime.split(':').map(Number);
    const openTimeMilliseconds = minutesSinceMidnight(openHour, openMinute) * 60_000;
    const closeTimeMilliseconds = minutesSinceMidnight(closeHour, closeMinute) * 60_000;
    const bookingStartMilliseconds = millisecondsSinceMidnight(startParts);
    const bookingEndMilliseconds = millisecondsSinceMidnight(endParts);

    if (
        bookingStartMilliseconds < openTimeMilliseconds ||
        endDayOfWeek !== dayOfWeek ||
        bookingEndMilliseconds > closeTimeMilliseconds
    ) {
        throw new ApiError(400, 'Booking must fit within the barber\'s active working hours');
    }

    const booking = await transaction.booking.create({
        data: {
            userId,
            barberId: barber.id,
            serviceId: input.serviceId,
            startAt,
            endAt,
            status: BookingStatus.CONFIRMED,
            serviceName: service.name,
            serviceDescription: service.description,
            servicePrice: service.price,
            serviceDurationMin: service.durationMinutes,
        },
        select: bookingSelect,
    });

    await transaction.queueEntry.create({
        data: {
            bookingId: booking.id,
            status: QueueStatus.WAITING,
        },
    });

    const notification = await createTransactionalNotification(transaction, {
        userId,
        type: NotificationType.BOOKING_CREATED,
        title: 'Booking confirmed',
        message: 'Your appointment has been scheduled successfully.',
        metadata: { bookingId: booking.id, barberId: booking.barberId },
    });

    return { booking, notification };
};

const dispatchBookingSideEffects = async (
    created: Awaited<ReturnType<typeof createBookingWithinTransaction>>,
    dispatchPush: typeof dispatchNotificationPushSafely = dispatchNotificationPushSafely,
) => {
    await dispatchQueueUpdateSafely(created.booking.barberId);

    await dispatchPush(created.notification.userId, {
        title: created.notification.title,
        body: created.notification.message,
        data: {
            notificationId: created.notification.id,
            type: created.notification.type,
        },
    });
};

export const createBooking = async (userId: string, input: CreateBookingInput) => {
    const startAt = new Date(input.startAt);
    const now = new Date();

    try {
        const created = await prisma.$transaction((transaction) =>
            createBookingWithinTransaction(transaction, userId, input, startAt, now),
        );
        await dispatchBookingSideEffects(created);
        return serializeBooking(created.booking);
    } catch (error: unknown) {
        throwBookingConflict(error);
    }
};

export const rebookCustomerBooking = async (
    userId: string,
    bookingId: string,
    input: RebookInput,
    dispatchPush: typeof dispatchNotificationPushSafely = dispatchNotificationPushSafely,
) => {
    const startAt = new Date(input.startAt);
    const now = new Date();

    try {
        const created = await prisma.$transaction(async (transaction) => {
            const original = await transaction.booking.findFirst({
                where: { id: bookingId, userId },
                select: { barberId: true, serviceId: true },
            });

            if (!original) {
                throw new ApiError(404, 'Booking not found');
            }

            return createBookingWithinTransaction(transaction, userId, {
                barberId: original.barberId,
                serviceId: original.serviceId,
                startAt: input.startAt,
            }, startAt, now);
        });

        await dispatchBookingSideEffects(created, dispatchPush);
        return serializeBooking(created.booking);
    } catch (error: unknown) {
        throwBookingConflict(error);
    }
};

type CancellationActor = { userId: string; role: 'USER' | 'BARBER' };

/** Initial cancellation policy: a booking can be cancelled only while CONFIRMED and before startAt. */
export const cancelBooking = async (
    actor: CancellationActor,
    bookingId: string,
    _input: CancelBookingInput,
    dispatchPush: typeof dispatchNotificationPushSafely = dispatchNotificationPushSafely,
    dispatchQueueUpdate: QueueUpdateDispatcher = emitQueueUpdate,
) => {
    const ownershipWhere: Prisma.BookingWhereInput = actor.role === 'USER'
        ? { id: bookingId, userId: actor.userId }
        : { id: bookingId, barber: { userId: actor.userId } };

    const cancelled = await prisma.$transaction(async (transaction) => {
        const target = await transaction.booking.findFirst({
            where: ownershipWhere,
            select: { id: true, barberId: true },
        });
        if (!target) {
            throw new ApiError(404, 'Booking not found');
        }

        // startQueueEntry and completeQueueEntry take this same lock, so cancellation
        // and either queue transition serialize for the barber.
        await transaction.$queryRaw`SELECT "id" FROM "Barber" WHERE "id" = ${target.barberId} FOR UPDATE`;

        const booking = await transaction.booking.findFirst({
            where: ownershipWhere,
            select: {
                ...bookingSelect,
                queueEntry: { select: { id: true, status: true } },
            },
        });
        if (!booking) {
            throw new ApiError(404, 'Booking not found');
        }
        if (booking.status !== BookingStatus.CONFIRMED) {
            throw new ApiError(409, 'Booking cannot be cancelled');
        }
        if (booking.startAt.getTime() <= Date.now()) {
            throw new ApiError(409, 'Booking can only be cancelled before it starts');
        }
        if (!booking.queueEntry || booking.queueEntry.status !== QueueStatus.WAITING) {
            throw new ApiError(409, 'Booking queue entry cannot be cancelled');
        }

        const bookingUpdate = await transaction.booking.updateMany({
            where: { id: booking.id, status: BookingStatus.CONFIRMED },
            data: { status: BookingStatus.CANCELLED },
        });
        const queueUpdate = await transaction.queueEntry.updateMany({
            where: { id: booking.queueEntry.id, status: QueueStatus.WAITING },
            data: { status: QueueStatus.CANCELLED },
        });
        if (bookingUpdate.count !== 1 || queueUpdate.count !== 1) {
            throw new ApiError(409, 'Booking cannot be cancelled');
        }

        const updatedBooking = await transaction.booking.findUniqueOrThrow({
            where: { id: booking.id },
            select: bookingSelect,
        });
        const notification = await createTransactionalNotification(transaction, {
            userId: booking.userId,
            type: NotificationType.BOOKING_CANCELLED,
            title: 'Booking cancelled',
            message: 'Your appointment has been cancelled.',
            metadata: {
                bookingId: booking.id,
                barberId: booking.barberId,
                cancelledBy: actor.role,
            },
        });

        return { booking: updatedBooking, notification, barberId: booking.barberId };
    });

    await dispatchQueueUpdateSafely(cancelled.barberId, dispatchQueueUpdate);
    await dispatchPush(cancelled.notification.userId, {
        title: cancelled.notification.title,
        body: cancelled.notification.message,
        data: {
            notificationId: cancelled.notification.id,
            type: cancelled.notification.type,
        },
    });

    return serializeBooking(cancelled.booking);
};

export const getCustomerBookings = async (userId: string, query: CustomerBookingListQuery) => {
    const skip = (query.page - 1) * query.limit;
    const now = new Date();
    const where: Prisma.BookingWhereInput = { userId };

    if (query.scope === 'upcoming') {
        where.AND = [
            { status: BookingStatus.CONFIRMED },
            { OR: [
                { startAt: { gt: now } },
                { queueEntry: { is: { status: QueueStatus.IN_PROGRESS } } },
            ] },
        ];
    } else if (query.scope === 'history') {
        where.OR = [
            { status: BookingStatus.CANCELLED },
            { endAt: { lt: now } },
            { queueEntry: { is: { status: QueueStatus.COMPLETED } } },
        ];
    }

    const orderBy = query.scope === 'history'
        ? [{ startAt: 'desc' as const }, { id: 'desc' as const }]
        : [{ startAt: 'asc' as const }, { id: 'asc' as const }];
    const [total, bookings] = await prisma.$transaction([
        prisma.booking.count({ where }),
        prisma.booking.findMany({
            where,
            orderBy,
            skip,
            take: query.limit,
            select: customerBookingSelect,
        }),
    ]);

    return {
        items: bookings.map(serializeListBooking),
        pagination: { page: query.page, limit: query.limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / query.limit) },
    };
};

export const getBarberBookings = async (userId: string, query: BookingListQuery) => {
    const barber = await prisma.barber.findUnique({ where: { userId }, select: { id: true } });
    if (!barber) {
        throw new ApiError(404, 'Barber profile not found');
    }

    const skip = (query.page - 1) * query.limit;
    const where = { barberId: barber.id };
    const [total, bookings] = await prisma.$transaction([
        prisma.booking.count({ where }),
        prisma.booking.findMany({
            where,
            orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
            skip,
            take: query.limit,
            select: barberBookingSelect,
        }),
    ]);

    return {
        items: bookings.map(serializeListBooking),
        pagination: { page: query.page, limit: query.limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / query.limit) },
    };
};

export const getCustomerBooking = async (userId: string, bookingId: string) => {
    const booking = await prisma.booking.findFirst({
        where: { id: bookingId, userId },
        select: customerBookingSelect,
    });
    if (!booking) {
        throw new ApiError(404, 'Booking not found');
    }

    return serializeBooking(booking);
};

export const getBarberBooking = async (userId: string, bookingId: string) => {
    const booking = await prisma.booking.findFirst({
        where: { id: bookingId, barber: { userId } },
        select: barberBookingSelect,
    });
    if (!booking) {
        throw new ApiError(404, 'Booking not found');
    }

    const { user, ...details } = booking;
    return { ...serializeBooking(details), customer: user };
};

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

const serializeQueueEntry = <T extends { id: string; bookingId: string; status: QueueStatus; joinedAt: Date; startedAt: Date | null; completedAt: Date | null }>(queueEntry: T) => ({
    queueId: queueEntry.id,
    bookingId: queueEntry.bookingId,
    status: queueEntry.status,
    joinedAt: queueEntry.joinedAt.toISOString(),
    startedAt: queueEntry.startedAt ? queueEntry.startedAt.toISOString() : null,
    completedAt: queueEntry.completedAt ? queueEntry.completedAt.toISOString() : null,
});

export const getCustomerQueue = async (userId: string, bookingId: string) => {
    const booking = await prisma.booking.findFirst({
        where: { id: bookingId, userId },
        select: { id: true, barberId: true },
    });

    if (!booking) {
        throw new ApiError(404, 'Booking not found');
    }

    const queueEntry = await prisma.queueEntry.findFirst({
        where: { bookingId: booking.id },
        select: {
            id: true,
            bookingId: true,
            status: true,
            joinedAt: true,
            startedAt: true,
            completedAt: true,
        },
    });

    if (!queueEntry) {
        throw new ApiError(404, 'Queue entry not found');
    }

    const activeEntries = await prisma.queueEntry.findMany({
        where: {
            booking: { barberId: booking.barberId },
            status: { in: [QueueStatus.IN_PROGRESS, QueueStatus.WAITING] },
        },
        select: { id: true, status: true, joinedAt: true },
    });

    return {
        ...serializeQueueEntry(queueEntry),
        position: buildQueuePosition(activeEntries, queueEntry.id),
    };
};

export const getBarberQueue = async (userId: string) => {
    const barber = await prisma.barber.findUnique({
        where: { userId },
        select: { id: true },
    });

    if (!barber) {
        throw new ApiError(404, 'Barber profile not found');
    }

    const queueEntries = await prisma.queueEntry.findMany({
        where: {
            booking: { barberId: barber.id },
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

export const startQueueEntry = async (
    userId: string,
    queueId: string,
    dispatchQueueUpdate: QueueUpdateDispatcher = emitQueueUpdate,
) => {
    const barber = await prisma.barber.findUnique({ where: { userId }, select: { id: true } });
    if (!barber) {
        throw new ApiError(404, 'Barber profile not found');
    }

    const queueEntry = await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "Barber" WHERE "id" = ${barber.id} FOR UPDATE`;

        const current = await transaction.queueEntry.findUnique({
            where: { id: queueId },
            select: {
                id: true,
                bookingId: true,
                status: true,
                joinedAt: true,
                startedAt: true,
                completedAt: true,
                booking: { select: { barberId: true, userId: true, status: true } },
            },
        });

        if (!current) {
            throw new ApiError(404, 'Queue entry not found');
        }

        if (current.booking.barberId !== barber.id) {
            throw new ApiError(403, 'Forbidden');
        }

        if (current.booking.status !== BookingStatus.CONFIRMED || current.status === QueueStatus.CANCELLED) {
            throw new ApiError(409, 'Cancelled booking cannot be started');
        }

        if (current.status === QueueStatus.IN_PROGRESS) {
            throw new ApiError(409, 'Queue entry is already in progress');
        }

        if (current.status === QueueStatus.COMPLETED) {
            throw new ApiError(409, 'Queue entry is already completed');
        }

        const activeQueueEntry = await transaction.queueEntry.findFirst({
            where: {
                status: QueueStatus.IN_PROGRESS,
                booking: { barberId: barber.id },
            },
            select: { id: true },
        });

        if (activeQueueEntry && activeQueueEntry.id !== queueId) {
            throw new ApiError(409, 'Another queue entry is already in progress');
        }

        const updated = await transaction.queueEntry.update({
            where: { id: queueId },
            data: {
                status: QueueStatus.IN_PROGRESS,
                startedAt: new Date(),
            },
            select: {
                id: true,
                bookingId: true,
                status: true,
                joinedAt: true,
                startedAt: true,
                completedAt: true,
            },
        });

        const notification = await transaction.notification.create({
            data: {
                userId: current.booking.userId,
                type: NotificationType.BOOKING_STARTED,
                title: 'Appointment started',
                message: 'Your appointment has started and your barber is now serving you.',
                metadata: { bookingId: updated.bookingId, queueId: updated.id },
            },
            select: {
                id: true,
                userId: true,
                type: true,
                title: true,
                message: true,
            },
        });

        return { queueEntry: updated, notification };
    });

    await dispatchQueueUpdateSafely(barber.id, dispatchQueueUpdate);
    await dispatchNotificationPushSafely(queueEntry.notification.userId, {
        title: queueEntry.notification.title,
        body: queueEntry.notification.message,
        data: {
            notificationId: queueEntry.notification.id,
            type: queueEntry.notification.type,
        },
    });
    return serializeQueueEntry(queueEntry.queueEntry);
};

export const completeQueueEntry = async (
    userId: string,
    queueId: string,
    dispatchQueueUpdate: QueueUpdateDispatcher = emitQueueUpdate,
) => {
    const barber = await prisma.barber.findUnique({ where: { userId }, select: { id: true } });
    if (!barber) {
        throw new ApiError(404, 'Barber profile not found');
    }

    const result = await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "Barber" WHERE "id" = ${barber.id} FOR UPDATE`;

        const current = await transaction.queueEntry.findUnique({
            where: { id: queueId },
            select: {
                id: true,
                bookingId: true,
                status: true,
                joinedAt: true,
                startedAt: true,
                completedAt: true,
                booking: { select: { barberId: true, userId: true, status: true } },
            },
        });

        if (!current) {
            throw new ApiError(404, 'Queue entry not found');
        }

        if (current.booking.barberId !== barber.id) {
            throw new ApiError(403, 'Forbidden');
        }

        if (current.booking.status !== BookingStatus.CONFIRMED || current.status === QueueStatus.CANCELLED) {
            throw new ApiError(409, 'Cancelled booking cannot be completed');
        }

        if (current.status !== QueueStatus.IN_PROGRESS) {
            throw new ApiError(409, 'Queue entry must be in progress to complete');
        }

        const updated = await transaction.queueEntry.update({
            where: { id: queueId },
            data: {
                status: QueueStatus.COMPLETED,
                completedAt: new Date(),
            },
            select: {
                id: true,
                bookingId: true,
                status: true,
                joinedAt: true,
                startedAt: true,
                completedAt: true,
            },
        });

        const notification = await transaction.notification.create({
            data: {
                userId: current.booking.userId,
                type: NotificationType.BOOKING_COMPLETED,
                title: 'Appointment completed',
                message: 'Your appointment has been completed successfully.',
                metadata: { bookingId: updated.bookingId, queueId: updated.id },
            },
            select: {
                id: true,
                userId: true,
                type: true,
                title: true,
                message: true,
            },
        });

        return { queueEntry: updated, notification };
    });

    await dispatchQueueUpdateSafely(barber.id, dispatchQueueUpdate);
    await dispatchNotificationPushSafely(result.notification.userId, {
        title: result.notification.title,
        body: result.notification.message,
        data: {
            notificationId: result.notification.id,
            type: result.notification.type,
        },
    });
    return serializeQueueEntry(result.queueEntry);
};
