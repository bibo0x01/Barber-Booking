import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const timeMinutes = (value: string): number => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
};

const validTime = (value: string): boolean => timeRegex.test(value);

export const createWorkingHourSchema = z
    .object({
        dayOfWeek: z.number().int().min(0).max(6),
        openTime: z.string().trim().refine(validTime, { message: 'Open time must be in HH:mm format' }),
        closeTime: z.string().trim().refine(validTime, { message: 'Close time must be in HH:mm format' }),
        isActive: z.boolean().optional(),
    })
    .strict()
    .refine((value) => timeMinutes(value.openTime) < timeMinutes(value.closeTime), {
        message: 'Open time must be earlier than close time within the same day',
        path: ['closeTime'],
    });

export const updateWorkingHourSchema = z
    .object({
        dayOfWeek: z.number().int().min(0).max(6).optional(),
        openTime: z.string().trim().refine(validTime, { message: 'Open time must be in HH:mm format' }).optional(),
        closeTime: z.string().trim().refine(validTime, { message: 'Close time must be in HH:mm format' }).optional(),
        isActive: z.boolean().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
        message: 'At least one working hour field must be provided',
        path: [],
    });

export const workingHourIdParamsSchema = z.object({ workingHourId: z.string().min(1) });
export const barberIdParamsSchema = z.object({ barberId: z.string().min(1) });

export type CreateWorkingHourInput = z.infer<typeof createWorkingHourSchema>;
export type UpdateWorkingHourInput = z.infer<typeof updateWorkingHourSchema>;
