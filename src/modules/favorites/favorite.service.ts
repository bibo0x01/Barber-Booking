import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { FavoritesQueryInput } from './favorite.validation';

const favoriteBarberSelect = {
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

const serializePrice = (value: Prisma.Decimal): number => Number(value.toString());

const normalizePublicLocation = (location: { latitude: Prisma.Decimal | number; longitude: Prisma.Decimal | number; address: string | null } | null) =>
    location
        ? {
            latitude: Number(location.latitude.toString ? location.latitude.toString() : location.latitude),
            longitude: Number(location.longitude.toString ? location.longitude.toString() : location.longitude),
            address: location.address,
        }
        : null;

const normalizePublicService = <T extends { price: Prisma.Decimal }>(service: T) => ({
    ...service,
    price: serializePrice(service.price),
});

const serializeFavoriteBarber = (barber: Prisma.BarberGetPayload<{ select: typeof favoriteBarberSelect }>) => ({
    id: barber.id,
    businessName: barber.businessName,
    bio: barber.bio,
    isVerified: barber.isVerified,
    isOpen: barber.isOpen,
    location: normalizePublicLocation(barber.location),
    primaryImage: barber.gallery[0] ?? null,
    services: barber.services.map((service) => normalizePublicService(service)),
    isFavorite: true,
});

export const addFavoriteBarber = async (userId: string, barberId: string): Promise<{ barberId: string; isFavorite: true; alreadyExists: boolean }> => {
    const barber = await prisma.barber.findUnique({
        where: { id: barberId },
        select: { id: true, isActive: true },
    });

    if (!barber) {
        throw new ApiError(404, 'Barber not found');
    }

    if (!barber.isActive) {
        throw new ApiError(400, 'Barber is inactive and cannot be favorited');
    }

    const existing = await prisma.favorite.findUnique({
        where: { userId_barberId: { userId, barberId } },
        select: { id: true },
    });

    if (existing) {
        return { barberId, isFavorite: true, alreadyExists: true };
    }

    try {
        await prisma.favorite.create({
            data: {
                userId,
                barberId,
            },
        });

        return { barberId, isFavorite: true, alreadyExists: false };
    } catch (error: unknown) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
            throw error;
        }

        return { barberId, isFavorite: true, alreadyExists: true };
    }
};

export const removeFavoriteBarber = async (userId: string, barberId: string): Promise<{ barberId: string; isFavorite: false }> => {
    await prisma.favorite.deleteMany({
        where: {
            userId,
            barberId,
        },
    });

    return { barberId, isFavorite: false };
};

export const getFavoriteStatus = async (userId: string, barberId: string): Promise<{ barberId: string; isFavorite: boolean }> => {
    const barber = await prisma.barber.findUnique({
        where: { id: barberId },
        select: { id: true },
    });

    if (!barber) {
        throw new ApiError(404, 'Barber not found');
    }

    const favorite = await prisma.favorite.findUnique({
        where: { userId_barberId: { userId, barberId } },
        select: { id: true },
    });

    return { barberId, isFavorite: favorite !== null };
};

export const listFavoriteBarbers = async (userId: string, query: FavoritesQueryInput) => {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
        prisma.favorite.findMany({
            where: {
                userId,
                barber: { isActive: true },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip,
            take: limit,
            select: {
                barber: {
                    select: favoriteBarberSelect,
                },
            },
        }),
        prisma.favorite.count({
            where: {
                userId,
                barber: { isActive: true },
            },
        }),
    ]);

    return {
        items: items.map((item) => serializeFavoriteBarber(item.barber)),
        pagination: {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
    };
};
