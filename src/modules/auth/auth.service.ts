import bcrypt from 'bcrypt';
import { Prisma, Role, User } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { LoginInput, RegisterInput } from './auth.validation';
import { AuthenticatedUser } from './auth.types';

const passwordRounds = 12;
const safeUserSelect = {
    id: true,
    name: true,
    email: true,
    phone: true,
    role: true,
} as const;

export type SafeUser = Pick<User, 'id' | 'name' | 'email' | 'phone' | 'role'>;

const toSafeUser = (user: SafeUser): SafeUser => ({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
});

const duplicateError = (error: unknown): ApiError | null => {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        return null;
    }

    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target ?? '');

    if (target.includes('email')) {
        return new ApiError(409, 'Email is already registered');
    }

    if (target.includes('phone')) {
        return new ApiError(409, 'Phone is already registered');
    }

    return new ApiError(409, 'User already exists');
};

const createAccessToken = (user: Pick<User, 'id' | 'role'>): string =>
    jwt.sign({ userId: user.id, role: user.role }, env.jwtSecret, { expiresIn: '1h' });

export const register = async (input: RegisterInput, role: Role): Promise<{ user: SafeUser; accessToken: string }> => {
    const [emailExists, phoneExists] = await Promise.all([
        prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
        prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true } }),
    ]);

    if (emailExists) {
        throw new ApiError(409, 'Email is already registered');
    }

    if (phoneExists) {
        throw new ApiError(409, 'Phone is already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, passwordRounds);

    try {
        const user = await prisma.user.create({
            data: {
                name: input.name,
                email: input.email,
                phone: input.phone,
                passwordHash,
                role,
            },
            select: safeUserSelect,
        });

        return { user: toSafeUser(user), accessToken: createAccessToken(user) };
    } catch (error: unknown) {
        throw duplicateError(error) ?? error;
    }
};

export const login = async (input: LoginInput): Promise<{ user: SafeUser; accessToken: string }> => {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    const passwordMatches = user ? await bcrypt.compare(input.password, user.passwordHash) : false;

    if (!user || !passwordMatches) {
        throw new ApiError(401, 'Invalid email or password');
    }

    const safeUser = toSafeUser(user);
    return { user: safeUser, accessToken: createAccessToken(user) };
};

export const findAuthenticatedUser = async (userId: string): Promise<AuthenticatedUser> => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: safeUserSelect });

    if (!user) {
        throw new ApiError(401, 'Invalid or expired token');
    }

    return user;
};