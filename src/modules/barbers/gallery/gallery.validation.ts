import { z } from 'zod';

export const addGalleryImageSchema = z
    .object({
        imageUrl: z.string().trim().url(),
        altText: z.string().trim().nullable().optional(),
    })
    .strict();

export const reorderGallerySchema = z
    .object({
        imageIds: z.array(z.string().min(1)).min(1).refine((imageIds) => new Set(imageIds).size === imageIds.length, {
            message: 'Image IDs must not contain duplicates',
            path: ['imageIds'],
        }),
    })
    .strict();

export const barberIdParamsSchema = z.object({ barberId: z.string().min(1) });
export const galleryImageIdParamsSchema = z.object({ imageId: z.string().min(1) });

export type AddGalleryImageInput = z.infer<typeof addGalleryImageSchema>;
export type ReorderGalleryInput = z.infer<typeof reorderGallerySchema>;
