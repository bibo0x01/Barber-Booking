import { Role } from '@prisma/client';
import type { Server as HttpServer } from 'node:http';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { Server as SocketIOServer } from 'socket.io';
import { findAuthenticatedUser } from '../modules/auth/auth.service';
import { getBarberQueueRoomPayload, queueRoomName, userMayAccessQueueRoom, usersMayAccessQueueRoom } from '../modules/bookings/queue-state';
import { env } from './env';

export type SocketUser = {
    userId: string;
    role: Role;
};

let socketServer: SocketIOServer | null = null;

const isSocketAuthPayload = (payload: string | JwtPayload): payload is { userId: string; role: Role } =>
    typeof payload !== 'string' && typeof payload.userId === 'string' && typeof payload.role === 'string' && Object.values(Role).includes(payload.role as Role);

const readBarberId = (payload: unknown): string | null => {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const candidate = 'barberId' in payload ? (payload as { barberId?: unknown }).barberId : undefined;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : null;
};

export const getSocketServer = (): SocketIOServer | null => socketServer;

export const emitQueueUpdate = async (barberId: string): Promise<void> => {
    const io = getSocketServer();
    if (!io) {
        return;
    }

    const roomName = queueRoomName(barberId);
    const memberIds = [...(io.sockets.adapter.rooms.get(roomName) ?? [])];
    const members = memberIds.flatMap((socketId) => {
        const socket = io.sockets.sockets.get(socketId);
        const user = socket?.data.user as SocketUser | undefined;
        return user ? [{ socket, user }] : [];
    });
    const authorizedUserIds = await usersMayAccessQueueRoom(
        members.map(({ user }) => ({ userId: user.userId, role: user.role })),
        barberId,
    );
    for (const { socket, user } of members) {
        if (!authorizedUserIds.has(user.userId)) socket?.leave(roomName);
    }

    const roomPayload = await getBarberQueueRoomPayload(barberId);
    io.to(roomName).emit('queue:updated', roomPayload);
};

export const createQueueSocketServer = (httpServer: HttpServer): SocketIOServer => {
    socketServer = new SocketIOServer(httpServer, {
        cors: {
            origin: true,
            credentials: true,
        },
    });

    socketServer.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;

        if (typeof token !== 'string' || token.trim().length === 0) {
            next(new Error('Authentication required'));
            return;
        }

        try {
            const payload = jwt.verify(token, env.jwtSecret);

            if (!isSocketAuthPayload(payload)) {
                next(new Error('Invalid token'));
                return;
            }

            const user = await findAuthenticatedUser(payload.userId);
            socket.data.user = { userId: user.id, role: user.role } as SocketUser;
            socket.data.userId = user.id;
            socket.data.role = user.role;
            next();
        } catch (error: unknown) {
            if (error instanceof jwt.TokenExpiredError) {
                next(new Error('Token expired'));
                return;
            }

            next(new Error('Invalid token'));
        }
    });

    socketServer.on('connection', (socket) => {
        const user = socket.data.user as SocketUser | undefined;

        if (!user) {
            return;
        }

        socket.on('queue:join', async (payload: unknown) => {
            const barberId = readBarberId(payload);
            if (!barberId) {
                socket.emit('queue:error', { message: 'Invalid barberId' });
                return;
            }

            const authorized = await userMayAccessQueueRoom(user.userId, user.role, barberId);
            if (!authorized) {
                socket.emit('queue:join:error', { message: 'You are not authorized to access this queue' });
                return;
            }

            socket.join(queueRoomName(barberId));
            const roomPayload = await getBarberQueueRoomPayload(barberId);
            socket.emit('queue:join:success', {
                barberId,
                queue: {
                    items: roomPayload.items,
                    updatedAt: roomPayload.updatedAt,
                },
            });
        });

        socket.on('queue:leave', (payload: unknown) => {
            const barberId = readBarberId(payload);
            if (!barberId) {
                socket.emit('queue:error', { message: 'Invalid barberId' });
                return;
            }

            socket.leave(queueRoomName(barberId));
            socket.emit('queue:leave:success', { barberId });
        });
    });

    return socketServer;
};
