import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { UpsertBarberLocationInput } from './barber-location.validation';
import { serializeLocationCoordinates } from './barber-location.types';

const ownBarberLocationSelect = {
    id: true,
    latitude: true,
    longitude: true,
    address: true,
    createdAt: true,
    updatedAt: true,
} as const;

const publicBarberLocationSelect = {
    latitude: true,
    longitude: true,
    address: true,
} as const;

export const upsertOwnBarberLocation = async (userId: string, input: UpsertBarberLocationInput) => {
    const barber = await prisma.barber.findUnique({ where: { userId }, select: { id: true } });

    if (!barber) {
        throw new ApiError(404, 'Barber profile not found');
    }

    const location = await prisma.barberLocation.upsert({
        where: { barberId: barber.id },
        create: {
            barberId: barber.id,
            latitude: new Prisma.Decimal(input.latitude),
            longitude: new Prisma.Decimal(input.longitude),
            address: input.address ?? null,
        },
        update: {
            latitude: new Prisma.Decimal(input.latitude),
            longitude: new Prisma.Decimal(input.longitude),
            address: input.address ?? null,
        },
        select: ownBarberLocationSelect,
    });

    return { ...location, ...serializeLocationCoordinates(location) };
};

export const getOwnBarberLocation = async (userId: string) => {
    const barber = await prisma.barber.findUnique({
        where: { userId },
        select: {
            location: { select: ownBarberLocationSelect },
        },
    });

    if (!barber) {
        throw new ApiError(404, 'Barber profile not found');
    }

    if (!barber.location) {
        throw new ApiError(404, 'Barber location not found');
    }

    return { ...barber.location, ...serializeLocationCoordinates(barber.location) };
};

export const getPublicBarberLocation = async (barberId: string) => {
    const barber = await prisma.barber.findFirst({
        where: { id: barberId, isActive: true },
        select: {
            location: { select: publicBarberLocationSelect },
        },
    });

    if (!barber) {
        throw new ApiError(404, 'Barber not found');
    }

    if (!barber.location) {
        throw new ApiError(404, 'Barber location not found');
    }

    return serializeLocationCoordinates(barber.location);
};
