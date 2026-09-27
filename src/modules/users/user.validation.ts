import { z } from 'zod';

const phoneSchema = z
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,15}$/, 'Phone must contain 7 to 15 digits');

export const updateProfileSchema = z
    .object({
        name: z.string().trim().min(2).max(100).optional(),
        phone: phoneSchema.optional(),
        avatarUrl: z.string().trim().url().nullable().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
        message: 'At least one profile field must be provided',
        path: [],
    });

export const changePasswordSchema = z
    .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8).max(72),
    })
    .strict()
    .refine((value) => value.currentPassword !== value.newPassword, {
        message: 'New password must be different from current password',
        path: ['newPassword'],
    });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;