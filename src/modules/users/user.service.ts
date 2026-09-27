import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { SafeUser } from './user.types';
import { ChangePasswordInput, UpdateProfileInput } from './user.validation';

const safeUserSelect = {
    id: true,
    name: true,
    email: true,
    phone: true,
    avatarUrl: true,
    role: true,
} as const;

const duplicatePhoneError = (error: unknown): ApiError | null => {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        return null;
    }

    return new ApiError(409, 'Phone is already registered');
};

export const updateProfile = async (userId: string, input: UpdateProfileInput): Promise<SafeUser> => {
    try {
        return await prisma.user.update({
            where: { id: userId },
            data: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.phone !== undefined ? { phone: input.phone } : {}),
                ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
            },
            select: safeUserSelect,
        });
    } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError(404, 'User not found');
        }

        throw duplicatePhoneError(error) ?? error;
    }
};

export const changePassword = async (userId: string, input: ChangePasswordInput): Promise<void> => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
    });

    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    const currentPasswordMatches = await bcrypt.compare(input.currentPassword, user.passwordHash);

    if (!currentPasswordMatches) {
        throw new ApiError(401, 'Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);

    await prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
    });
};