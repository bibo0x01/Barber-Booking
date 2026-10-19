import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { BarberWorkingHour, PublicBarberWorkingHour } from './working-hours.types';
import { CreateWorkingHourInput, UpdateWorkingHourInput } from './working-hours.validation';

const workingHourSelect = {
    id: true,
    barberId: true,
    dayOfWeek: true,
    openTime: true,
    closeTime: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
} as const;

const publicWorkingHourSelect = {
    dayOfWeek: true,
    openTime: true,
    closeTime: true,
    isActive: true,
} as const;

const timeToMinutes = (value: string): number => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
};

const validateWorkingHoursRange = (openTime: string, closeTime: string): void => {
    if (timeToMinutes(openTime) >= timeToMinutes(closeTime)) {
        throw new ApiError(400, 'Open time must be earlier than close time within the same day');
    }
};

const getBarberIdForUser = async (userId: string): Promise<string> => {
    const barber = await prisma.barber.findUnique({
        where: { userId },
        select: { id: true },
    });

    if (!barber) {
        throw new ApiError(404, 'Barber profile not found');
    }

    return barber.id;
};

const getWorkingHourByOwnership = async (userId: string, workingHourId: string) =>
    prisma.barberWorkingHour.findFirst({
        where: {
            id: workingHourId,
            barber: { userId },
        },
        select: workingHourSelect,
    });

export const createWorkingHour = async (userId: string, input: CreateWorkingHourInput): Promise<BarberWorkingHour> => {
    const barberId = await getBarberIdForUser(userId);
    validateWorkingHoursRange(input.openTime, input.closeTime);

    try {
        const workingHour = await prisma.barberWorkingHour.create({
            data: {
                barberId,
                dayOfWeek: input.dayOfWeek,
                openTime: input.openTime,
                closeTime: input.closeTime,
                isActive: input.isActive ?? true,
            },
            select: workingHourSelect,
        });

        return workingHour as BarberWorkingHour;
    } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ApiError(409, 'Working hour already exists for this day');
        }
        throw error;
    }
};

export const getOwnWorkingHours = async (userId: string): Promise<BarberWorkingHour[]> => {
    const barberId = await getBarberIdForUser(userId);

    const records = await prisma.barberWorkingHour.findMany({
        where: { barberId },
        orderBy: { dayOfWeek: 'asc' },
        select: workingHourSelect,
    });

    return records as BarberWorkingHour[];
};

export const getPublicWorkingHours = async (barberId: string): Promise<PublicBarberWorkingHour[]> => {
    const barber = await prisma.barber.findFirst({
        where: { id: barberId, isActive: true },
        select: {
            workingHours: {
                where: { isActive: true },
                orderBy: { dayOfWeek: 'asc' },
                select: publicWorkingHourSelect,
            },
        },
    });

    if (!barber) {
        throw new ApiError(404, 'Barber not found');
    }

    return barber.workingHours as PublicBarberWorkingHour[];
};

export const updateWorkingHour = async (userId: string, workingHourId: string, input: UpdateWorkingHourInput): Promise<BarberWorkingHour> => {
    const barberId = await getBarberIdForUser(userId);

    const existing = await prisma.barberWorkingHour.findFirst({
        where: { id: workingHourId, barberId },
        select: workingHourSelect,
    });

    if (!existing) {
        throw new ApiError(404, 'Working hour not found');
    }

    const nextDayOfWeek = input.dayOfWeek ?? existing.dayOfWeek;
    const nextOpenTime = input.openTime ?? existing.openTime;
    const nextCloseTime = input.closeTime ?? existing.closeTime;

    if (input.openTime !== undefined || input.closeTime !== undefined) {
        validateWorkingHoursRange(nextOpenTime, nextCloseTime);
    }

    try {
        const updated = await prisma.barberWorkingHour.update({
            where: { id: workingHourId },
            data: {
                ...(input.dayOfWeek !== undefined ? { dayOfWeek: input.dayOfWeek } : {}),
                ...(input.openTime !== undefined ? { openTime: input.openTime } : {}),
                ...(input.closeTime !== undefined ? { closeTime: input.closeTime } : {}),
                ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
            },
            select: workingHourSelect,
        });

        return updated as BarberWorkingHour;
    } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ApiError(409, 'Working hour already exists for this day');
        }
        throw error;
    }
};

export const deleteWorkingHour = async (userId: string, workingHourId: string): Promise<void> => {
    const barberId = await getBarberIdForUser(userId);

    const result = await prisma.barberWorkingHour.updateMany({
        where: { id: workingHourId, barberId },
        data: { isActive: false },
    });

    if (result.count === 0) {
        throw new ApiError(404, 'Working hour not found');
    }
};
