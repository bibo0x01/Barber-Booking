import { z } from 'zod';

export const favoriteBarberParamsSchema = z
    .object({
        barberId: z.string().trim().min(1).max(191),
    })
    .strict();

export const favoritesQuerySchema = z
    .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(20),
    })
    .strict();

export type FavoriteBarberParamsInput = z.infer<typeof favoriteBarberParamsSchema>;
export type FavoritesQueryInput = z.infer<typeof favoritesQuerySchema>;
