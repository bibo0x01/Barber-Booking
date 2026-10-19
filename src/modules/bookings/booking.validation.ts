import { z } from 'zod';

const cuidSchema = z.string().cuid();

const absoluteDateTimeSchema = z
    .string()
    .datetime({ offset: true })
    .refine((value) => Number.isFinite(Date.parse(value)), { message: 'startAt must be a valid ISO 8601 timestamp' });

export const createBookingSchema = z
    .object({
        barberId: cuidSchema,
        serviceId: cuidSchema,
        startAt: absoluteDateTimeSchema,
    })
    .strict();

export const bookingListQuerySchema = z
    .object({
        page: z.coerce.number().int().positive().optional().default(1),
        limit: z.coerce.number().int().positive().max(50).optional().default(20),
    })
    .strict();

export const customerBookingListQuerySchema = z
    .object({
        page: z.coerce.number().int().positive().optional().default(1),
        limit: z.coerce.number().int().positive().max(50).optional().default(20),
        scope: z.enum(['all', 'upcoming', 'history']).optional().default('all'),
    })
    .strict();

export const rebookSchema = z.object({ startAt: absoluteDateTimeSchema }).strict();
export const cancelBookingSchema = z.object({}).strict();

export const bookingIdParamsSchema = z.object({ bookingId: cuidSchema });
export const queueIdParamsSchema = z.object({ queueId: cuidSchema });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;
export type CustomerBookingListQuery = z.infer<typeof customerBookingListQuerySchema>;
export type RebookInput = z.infer<typeof rebookSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
