import { Role } from '@prisma/client';

export type AuthenticatedUser = {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: Role;
};

declare global {
    namespace Express {
        interface Request {
            authUser?: AuthenticatedUser;
        }
    }
}

export { };