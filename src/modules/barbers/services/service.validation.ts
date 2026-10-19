import { z } from 'zod';

const priceSchema = z
    .union([
        z.number().finite().min(0, 'Price must be at least 0'),
        z
            .string()
            .trim()
            .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), {
                message: 'Price must be a valid monetary value',
            }),
    ])
    .refine((value) => {
        const stringValue = typeof value === 'string' ? value : value.toString();
        const normalized = Number(stringValue);
        return Number.isFinite(normalized) && normalized >= 0 && /^\d+(\.\d{1,2})?$/.test(stringValue);
    }, 'Price must be a valid monetary value');

export const createServiceSchema = z
    .object({
        name: z.string().trim().min(2).max(100),
        description: z.string().trim().max(500).optional(),
        price: priceSchema,
        durationMinutes: z.number().int().min(5).max(480),
    })
    .strict();

export const updateServiceSchema = z
    .object({
        name: z.string().trim().min(2).max(100).optional(),
        description: z.string().trim().max(500).optional(),
        price: priceSchema.optional(),
        durationMinutes: z.number().int().min(5).max(480).optional(),
        isActive: z.boolean().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
        message: 'At least one service field must be provided',
        path: [],
    });

export const barberIdParamsSchema = z.object({ barberId: z.string().min(1) });
export const serviceIdParamsSchema = z.object({ serviceId: z.string().min(1) });

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
