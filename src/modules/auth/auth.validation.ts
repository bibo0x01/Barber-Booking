import { z } from 'zod';

const email = z.string().trim().email().transform((value) => value.toLowerCase());
const phone = z
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,15}$/, 'Phone must contain 7 to 15 digits');

export const registerSchema = z.object({
    name: z.string().trim().min(2).max(100),
    email,
    phone,
    password: z.string().min(8).max(72),
});

export const loginSchema = z.object({
    email,
    password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;