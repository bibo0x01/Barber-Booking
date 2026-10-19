import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { AddGalleryImageInput, ReorderGalleryInput } from './gallery.validation';
import { MAX_GALLERY_IMAGES } from './gallery.constants';
import { GalleryImage } from './gallery.types';

const galleryImageSelect = {
    id: true,
    imageUrl: true,
    altText: true,
    sortOrder: true,
} as const;

const getBarberId = async (userId: string): Promise<string> => {
    const barber = await prisma.barber.findUnique({ where: { userId }, select: { id: true } });

    if (!barber) {
        throw new ApiError(404, 'Barber profile not found');
    }

    return barber.id;
};

const isSerializationConflict = (error: unknown): boolean =>
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';

const throwRetryableGalleryConflict = (error: unknown): never => {
    if (error instanceof ApiError) {
        throw error;
    }

    if (isSerializationConflict(error)) {
        throw new ApiError(409, 'Gallery was updated concurrently; please retry');
    }

    throw error;
};

export const addGalleryImage = async (userId: string, input: AddGalleryImageInput): Promise<GalleryImage> => {
    try {
        return await prisma.$transaction(
            async (transaction) => {
                const barber = await transaction.barber.findUnique({ where: { userId }, select: { id: true } });

                if (!barber) {
                    throw new ApiError(404, 'Barber profile not found');
                }

                const imageCount = await transaction.barberImage.count({ where: { barberId: barber.id } });

                if (imageCount >= MAX_GALLERY_IMAGES) {
                    throw new ApiError(409, 'Gallery image limit reached');
                }

                return transaction.barberImage.create({
                    data: {
                        barberId: barber.id,
                        imageUrl: input.imageUrl,
                        ...(input.altText !== undefined ? { altText: input.altText } : {}),
                        sortOrder: imageCount,
                    },
                    select: galleryImageSelect,
                });
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
    } catch (error: unknown) {
        throwRetryableGalleryConflict(error);
    }

    throw new Error('Gallery image creation failed unexpectedly');
};

export const getOwnGallery = async (userId: string): Promise<GalleryImage[]> => {
    const barberId = await getBarberId(userId);

    return prisma.barberImage.findMany({
        where: { barberId },
        orderBy: { sortOrder: 'asc' },
        select: galleryImageSelect,
    });
};

export const getPublicGallery = async (barberId: string): Promise<GalleryImage[]> => {
    const barber = await prisma.barber.findFirst({
        where: { id: barberId, isActive: true },
        select: {
            gallery: {
                orderBy: { sortOrder: 'asc' },
                select: galleryImageSelect,
            },
        },
    });

    if (!barber) {
        throw new ApiError(404, 'Barber profile not found');
    }

    return barber.gallery;
};

export const reorderGallery = async (userId: string, input: ReorderGalleryInput): Promise<GalleryImage[]> => {
    try {
        return await prisma.$transaction(
            async (transaction) => {
                const barber = await transaction.barber.findUnique({ where: { userId }, select: { id: true } });

                if (!barber) {
                    throw new ApiError(404, 'Barber profile not found');
                }

                const images = await transaction.barberImage.findMany({
                    where: { barberId: barber.id },
                    select: { id: true },
                });
                const ownedImageIds = new Set(images.map((image) => image.id));

                if (images.length !== input.imageIds.length || input.imageIds.some((id) => !ownedImageIds.has(id))) {
                    throw new ApiError(404, 'One or more gallery images were not found');
                }

                for (const [sortOrder, id] of input.imageIds.entries()) {
                    await transaction.barberImage.updateMany({
                        where: { id, barberId: barber.id },
                        data: { sortOrder },
                    });
                }

                return transaction.barberImage.findMany({
                    where: { barberId: barber.id },
                    orderBy: { sortOrder: 'asc' },
                    select: galleryImageSelect,
                });
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
    } catch (error: unknown) {
        throwRetryableGalleryConflict(error);
    }

    throw new Error('Gallery reorder failed unexpectedly');
};

export const deleteGalleryImage = async (userId: string, imageId: string): Promise<void> => {
    try {
        await prisma.$transaction(
            async (transaction) => {
                const barber = await transaction.barber.findUnique({ where: { userId }, select: { id: true } });

                if (!barber) {
                    throw new ApiError(404, 'Barber profile not found');
                }

                const deletion = await transaction.barberImage.deleteMany({
                    where: { id: imageId, barberId: barber.id },
                });

                if (deletion.count === 0) {
                    throw new ApiError(404, 'Gallery image not found');
                }

                const remainingImages = await transaction.barberImage.findMany({
                    where: { barberId: barber.id },
                    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
                    select: { id: true },
                });

                for (const [sortOrder, image] of remainingImages.entries()) {
                    await transaction.barberImage.updateMany({
                        where: { id: image.id, barberId: barber.id },
                        data: { sortOrder },
                    });
                }
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
    } catch (error: unknown) {
        throwRetryableGalleryConflict(error);
    }
};
