import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { serializeLocationCoordinates } from './location/barber-location.types';
import { BarberProfile } from './barber.types';
import { CreateBarberInput, PublicBarberQueryInput, UpdateBarberInput, UpdateBarberStatusInput } from './barber.validation';

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

const publicBarberOverviewSelect = {
    id: true,
    businessName: true,
    bio: true,
    isVerified: true,
    isOpen: true,
    location: {
        select: {
            latitude: true,
            longitude: true,
            address: true,
        },
    },
    services: {
        where: { isActive: true },
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] as Prisma.BarberServiceOrderByWithRelationInput[],
        select: {
            id: true,
            name: true,
            description: true,
            price: true,
            durationMinutes: true,
        },
    },
    gallery: {
        take: 1,
        orderBy: { sortOrder: 'asc' as const },
        select: {
            id: true,
            imageUrl: true,
            altText: true,
            sortOrder: true,
        },
    },
} as const;

const publicBarberProfileSelect = {
    id: true,
    businessName: true,
    bio: true,
    isVerified: true,
    isOpen: true,
    location: {
        select: {
            latitude: true,
            longitude: true,
            address: true,
        },
    },
};

const publicBarberDetailsSelect = {
    id: true,
    businessName: true,
    bio: true,
    isVerified: true,
    isOpen: true,
    location: {
        select: {
            latitude: true,
            longitude: true,
            address: true,
        },
    },
    gallery: {
        orderBy: { sortOrder: 'asc' as const },
        select: {
            id: true,
            imageUrl: true,
            altText: true,
            sortOrder: true,
        },
    },
    services: {
        where: { isActive: true },
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] as Prisma.BarberServiceOrderByWithRelationInput[],
        select: {
            id: true,
            name: true,
            description: true,
            price: true,
            durationMinutes: true,
        },
    },
    workingHours: {
        orderBy: { dayOfWeek: 'asc' as const },
        select: {
            id: true,
            dayOfWeek: true,
            openTime: true,
            closeTime: true,
            isActive: true,
        },
    },
} as const;

const duplicateBarberProfileError = (error: unknown): ApiError | null => {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        return null;
    }

    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target ?? '');

    if (target.includes('userId')) {
        return new ApiError(409, 'Barber profile already exists');
    }

    return new ApiError(409, 'Barber profile already exists');
};

const serializePrice = (value: Prisma.Decimal): number => Number(value.toString());

const normalizePublicLocation = (location: { latitude: Prisma.Decimal | number; longitude: Prisma.Decimal | number; address: string | null } | null) =>
    location ? serializeLocationCoordinates(location) : null;

const normalizePublicService = <T extends { price: Prisma.Decimal }>(service: T) => ({
    ...service,
    price: serializePrice(service.price),
});

export const createBarberProfile = async (userId: string, input: CreateBarberInput): Promise<BarberProfile> => {
    const existingBarber = await prisma.barber.findUnique({ where: { userId }, select: { id: true } });

    if (existingBarber) {
        throw new ApiError(409, 'Barber profile already exists');
    }

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

        throw duplicateBarberProfileError(error) ?? error;
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

export const updateBarberProfile = async (userId: string, input: UpdateBarberInput): Promise<BarberProfile> => {
    const existingBarber = await prisma.barber.findUnique({ where: { userId }, select: { id: true } });

    if (!existingBarber) {
        throw new ApiError(404, 'Barber profile not found');
    }

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

export const getPublicBarbers = async (query: PublicBarberQueryInput, currentUserId?: string) => {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const searchTerm = query.search?.trim();

    const where: Prisma.BarberWhereInput = {
        isActive: true,
        ...(searchTerm
            ? {
                OR: [
                    { businessName: { contains: searchTerm, mode: 'insensitive' as const } },
                    { bio: { contains: searchTerm, mode: 'insensitive' as const } },
                ],
            }
            : {}),
    };

    const [items, total] = await Promise.all([
        prisma.barber.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: [{ isVerified: 'desc' }, { businessName: 'asc' }],
            select: publicBarberOverviewSelect,
        }),
        prisma.barber.count({ where }),
    ]);

    const favoriteBarberIds = currentUserId
        ? new Set(
            (await prisma.favorite.findMany({
                where: { userId: currentUserId, barberId: { in: items.map((item) => item.id) } },
                select: { barberId: true },
            })).map((favorite) => favorite.barberId),
        )
        : new Set<string>();

    return {
        items: items.map((item) => ({
            id: item.id,
            businessName: item.businessName,
            bio: item.bio,
            isVerified: item.isVerified,
            isOpen: item.isOpen,
            location: normalizePublicLocation(item.location),
            primaryImage: item.gallery[0] ?? null,
            services: item.services.map((service) => normalizePublicService(service)),
            ...(currentUserId ? { isFavorite: favoriteBarberIds.has(item.id) } : {}),
        })),
        pagination: {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
    };
};

export const getPublicBarberProfile = async (barberId: string, currentUserId?: string) => {
    const barber = await prisma.barber.findFirst({
        where: { id: barberId, isActive: true },
        select: publicBarberProfileSelect,
    });

    if (!barber) {
        throw new ApiError(404, 'Barber not found');
    }

    const isFavorite = currentUserId
        ? !!(await prisma.favorite.findUnique({
            where: { userId_barberId: { userId: currentUserId, barberId } },
            select: { id: true },
        }))
        : undefined;

    return {
        ...barber,
        location: normalizePublicLocation(barber.location),
        ...(currentUserId ? { isFavorite } : {}),
    };
};

export const getPublicBarberDetails = async (barberId: string, currentUserId?: string) => {
    const barber = await prisma.barber.findFirst({
        where: { id: barberId, isActive: true },
        select: publicBarberDetailsSelect,
    });

    if (!barber) {
        throw new ApiError(404, 'Barber not found');
    }

    const isFavorite = currentUserId
        ? !!(await prisma.favorite.findUnique({
            where: { userId_barberId: { userId: currentUserId, barberId } },
            select: { id: true },
        }))
        : undefined;

    return {
        id: barber.id,
        businessName: barber.businessName,
        bio: barber.bio,
        isVerified: barber.isVerified,
        isOpen: barber.isOpen,
        location: normalizePublicLocation(barber.location),
        gallery: barber.gallery,
        services: barber.services.map((service) => normalizePublicService(service)),
        workingHours: barber.workingHours,
        ...(currentUserId ? { isFavorite } : {}),
    };
};

export const getCurrentBarberStatus = async (userId: string): Promise<{ isOpen: boolean }> => {
    const barber = await prisma.barber.findUnique({
        where: { userId },
        select: { isOpen: true },
    });

    if (!barber) {
        throw new ApiError(404, 'Barber profile not found');
    }

    return { isOpen: barber.isOpen };
};

export const updateCurrentBarberStatus = async (userId: string, input: UpdateBarberStatusInput): Promise<{ isOpen: boolean }> => {
    const existing = await prisma.barber.findUnique({
        where: { userId },
        select: { id: true },
    });

    if (!existing) {
        throw new ApiError(404, 'Barber profile not found');
    }

    const updated = await prisma.barber.update({
        where: { userId },
        data: {
            isOpen: input.isOpen,
        },
        select: { isOpen: true },
    });

    return { isOpen: updated.isOpen };
};
