import { z } from 'zod';

export const createBarberSchema = z
    .object({
        businessName: z.string().trim().min(2).max(100),
        bio: z.string().trim().max(500).optional(),
    })
    .strict();

export const updateBarberSchema = z
    .object({
        businessName: z.string().trim().min(2).max(100).optional(),
        bio: z.string().trim().max(500).optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
        message: 'At least one barber field must be provided',
        path: [],
    });

export const barberDiscoveryQuerySchema = z
    .object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(50).default(20),
        search: z.string().trim().max(100).optional(),
    })
    .strict();

export const publicBarberQuerySchema = barberDiscoveryQuerySchema;

export const barberIdParamsSchema = z.object({ barberId: z.string().min(1) }).strict();

export const updateBarberStatusSchema = z.object({ isOpen: z.boolean() }).strict();

export type CreateBarberInput = z.infer<typeof createBarberSchema>;
export type UpdateBarberInput = z.infer<typeof updateBarberSchema>;
export type BarberDiscoveryQuery = z.infer<typeof barberDiscoveryQuerySchema>;
export type PublicBarberQueryInput = z.infer<typeof publicBarberQuerySchema>;
export type UpdateBarberStatusInput = z.infer<typeof updateBarberStatusSchema>;
