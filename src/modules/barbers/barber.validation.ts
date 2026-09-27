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

export const barberIdParamsSchema = z.object({
    barberId: z.string().min(1),
});

export type CreateBarberInput = z.infer<typeof createBarberSchema>;
export type UpdateBarberInput = z.infer<typeof updateBarberSchema>;
