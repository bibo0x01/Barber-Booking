import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { BarberService } from './service.types';
import { CreateServiceInput, UpdateServiceInput } from './service.validation';

const serviceSelect = {
    id: true,
    barberId: true,
    name: true,
    description: true,
    price: true,
    durationMinutes: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
} as const;

const publicServiceSelect = {
    id: true,
    name: true,
    description: true,
    price: true,
    durationMinutes: true,
} as const;

const serializePrice = (price: Prisma.Decimal): number => Number(price.toString());

const serializeService = <T extends { price: Prisma.Decimal }>(service: T): Omit<T, 'price'> & { price: number } => ({
    ...service,
    price: serializePrice(service.price),
});

const getBarberIdForUser = async (userId: string): Promise<string> => {
    const barber = await prisma.barber.findUnique({
        where: { userId },
        select: { id: true },
    });

    if (!barber) {
        throw new ApiError(404, 'Barber profile not found');
    }

    return barber.id;
};

const normalizePrice = (value: number | string): Prisma.Decimal => {
    const numberValue = typeof value === 'string' ? Number(value) : value;

    if (!Number.isFinite(numberValue) || numberValue < 0) {
        throw new ApiError(400, 'Price must be a valid monetary value');
    }

    const decimalText = value.toString().trim();
    if (!/^\d+(\.\d{1,2})?$/.test(decimalText)) {
        throw new ApiError(400, 'Price must have at most 2 decimal places');
    }

    return new Prisma.Decimal(numberValue.toFixed(2));
};

export const createService = async (userId: string, input: CreateServiceInput): Promise<BarberService> => {
    const barberId = await getBarberIdForUser(userId);

    const created = await prisma.barberService.create({
        data: {
            barberId,
            name: input.name,
            ...(input.description !== undefined ? { description: input.description } : {}),
            price: normalizePrice(input.price),
            durationMinutes: input.durationMinutes,
            isActive: true,
        },
        select: serviceSelect,
    });

    return serializeService(created) as BarberService;
};

export const getOwnServices = async (userId: string): Promise<BarberService[]> => {
    const barberId = await getBarberIdForUser(userId);

    const services = await prisma.barberService.findMany({
        where: { barberId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: serviceSelect,
    });

    return services.map((service) => serializeService(service) as BarberService);
};

export const getPublicServices = async (barberId: string): Promise<Array<Omit<BarberService, 'barberId' | 'isActive' | 'createdAt' | 'updatedAt'> & { description: string | null }>> => {
    const barber = await prisma.barber.findFirst({
        where: { id: barberId, isActive: true },
        select: {
            services: {
                where: { isActive: true },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                select: publicServiceSelect,
            },
        },
    });

    if (!barber) {
        throw new ApiError(404, 'Barber not found');
    }

    return barber.services.map((service) => serializeService(service) as Omit<BarberService, 'barberId' | 'isActive' | 'createdAt' | 'updatedAt'> & { description: string | null });
};

export const updateService = async (userId: string, serviceId: string, input: UpdateServiceInput): Promise<BarberService> => {
    const barberId = await getBarberIdForUser(userId);

    const existing = await prisma.barberService.findFirst({
        where: { id: serviceId, barberId },
        select: { id: true },
    });

    if (!existing) {
        throw new ApiError(404, 'Service not found');
    }

    const data: Prisma.BarberServiceUpdateInput = {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.price !== undefined ? { price: normalizePrice(input.price) } : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    };

    const updated = await prisma.barberService.update({
        where: { id: serviceId },
        data,
        select: serviceSelect,
    });

    return serializeService(updated) as BarberService;
};

export const deleteService = async (userId: string, serviceId: string): Promise<void> => {
    const barberId = await getBarberIdForUser(userId);

    const result = await prisma.barberService.updateMany({
        where: { id: serviceId, barberId },
        data: { isActive: false },
    });

    if (result.count === 0) {
        throw new ApiError(404, 'Service not found');
    }
};
