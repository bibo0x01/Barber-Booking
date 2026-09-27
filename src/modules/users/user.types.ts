import { Role } from '@prisma/client';

export type SafeUser = {
    id: string;
    name: string;
    email: string;
    phone: string;
    avatarUrl: string | null;
    role: Role;
};