import { z } from 'zod';

export const upsertBarberLocationSchema = z
    .object({
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180),
        address: z.preprocess(
            (value) => (typeof value === 'string' && value.trim().length === 0 ? null : value),
            z.string().trim().max(500).nullable().optional(),
        ),
    })
    .strict();

export const barberIdParamsSchema = z.object({ barberId: z.string().min(1) });

export type UpsertBarberLocationInput = z.infer<typeof upsertBarberLocationSchema>;
