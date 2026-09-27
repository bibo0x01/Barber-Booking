import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { BarberProfile, PublicBarberProfile } from './barber.types';
import { CreateBarberInput, UpdateBarberInput } from './barber.validation';

const barberSelect = {
    id: true,
    userId: true,
    businessName: true,
    bio: true,
    isVerified: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
} as const;

const publicBarberSelect = {
    id: true,
    businessName: true,
    bio: true,
    isVerified: true,
} as const;

export const createBarberProfile = async (userId: string, input: CreateBarberInput): Promise<BarberProfile> => {
    try {
        return await prisma.barber.create({
            data: {
                userId,
                businessName: input.businessName,
                ...(input.bio !== undefined ? { bio: input.bio } : {}),
            },
            select: barberSelect,
        });
    } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ApiError(409, 'Barber profile already exists');
        }

        throw error;
    }
};

export const getBarberProfile = async (userId: string): Promise<BarberProfile> => {
    const barber = await prisma.barber.findUnique({
        where: { userId },
        select: barberSelect,
    });

    if (!barber) {
        throw new ApiError(404, 'Barber profile not found');
    }

    return barber;
};

export const getCurrentBarberPublicProfile = async (userId: string): Promise<PublicBarberProfile> => {
    const barber = await prisma.barber.findUnique({
        where: { userId },
        select: publicBarberSelect,
    });

    if (!barber) {
        throw new ApiError(404, 'Barber profile not found');
    }

    return barber;
};

export const getPublicBarberProfile = async (barberId: string): Promise<PublicBarberProfile> => {
    const barber = await prisma.barber.findFirst({
        where: { id: barberId, isActive: true },
        select: publicBarberSelect,
    });

    if (!barber) {
        throw new ApiError(404, 'Barber profile not found');
    }

    return barber;
};

export const updateBarberProfile = async (userId: string, input: UpdateBarberInput): Promise<BarberProfile> => {
    const { businessName, bio } = input;

    try {
        return await prisma.barber.update({
            where: { userId },
            data: {
                ...(businessName !== undefined ? { businessName } : {}),
                ...(bio !== undefined ? { bio } : {}),
            },
            select: barberSelect,
        });
    } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError(404, 'Barber profile not found');
        }

        throw error;
    }
};
