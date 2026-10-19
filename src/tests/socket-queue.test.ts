import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { createServer } from 'node:http';
import { io as Client } from 'socket.io-client';
import { Prisma } from '@prisma/client';
import { app } from '../app';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { createQueueSocketServer } from '../config/socket';
import { queueRoomName } from '../modules/bookings/queue-state';

const testDomain = '@socket-queue-test.example.test';
const makeEmail = (tag: string): string => `${tag}-${Date.now()}-${Math.random().toString(16).slice(2)}${testDomain}`;
const makePhone = (): string => `+155${String(Date.now()).slice(-6)}${Math.random().toString().slice(2, 5)}`;
const weekdayByName: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const zonedParts = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: env.appTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return {
        year: Number(get('year')),
        month: Number(get('month')),
        day: Number(get('day')),
        weekday: weekdayByName[get('weekday')],
        hour: Number(get('hour')),
        minute: Number(get('minute')),
        second: Number(get('second')),
    };
};

const zonedLocalToUtc = (year: number, month: number, day: number, hour: number, minute: number): Date => {
    const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    let candidate = desiredUtc;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const actual = zonedParts(new Date(candidate));
        const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
        candidate += desiredUtc - actualAsUtc;
    }
    return new Date(candidate);
};

const nextLocalDateAt = (hour: number, minute: number, weekday?: number): { instant: Date; dayOfWeek: number } => {
    const nowLocal = zonedParts(new Date());
    let dayOffset = 2;
    for (; dayOffset < 16; dayOffset += 1) {
        const date = new Date(Date.UTC(nowLocal.year, nowLocal.month - 1, nowLocal.day + dayOffset, 12));
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth() + 1;
        const day = date.getUTCDate();
        const weekdayAtDate = zonedParts(new Date(Date.UTC(year, month - 1, day, 12))).weekday;
        if (weekday === undefined || weekdayAtDate === weekday) {
            return { instant: zonedLocalToUtc(year, month, day, hour, minute), dayOfWeek: weekdayAtDate };
        }
    }
    throw new Error('Unable to select a future date in the requested weekday');
};

const cleanupTestData = async (): Promise<void> => {
    const users = await prisma.user.findMany({ where: { email: { contains: testDomain } }, select: { id: true } });
    const userIds = users.map((user) => user.id);
    if (userIds.length === 0) return;
    const barbers = await prisma.barber.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const barberIds = barbers.map((barber) => barber.id);
    await prisma.queueEntry.deleteMany({ where: { booking: { OR: [{ userId: { in: userIds } }, { barberId: { in: barberIds } }] } } });
    await prisma.booking.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { barberId: { in: barberIds } }] } });
    await prisma.barberLocation.deleteMany({ where: { barberId: { in: barberIds } } });
    await prisma.barberWorkingHour.deleteMany({ where: { barberId: { in: barberIds } } });
    await prisma.barberService.deleteMany({ where: { barberId: { in: barberIds } } });
    await prisma.barberImage.deleteMany({ where: { barberId: { in: barberIds } } });
    await prisma.barber.deleteMany({ where: { id: { in: barberIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
};

const register = async (baseUrl: string, role: 'user' | 'barber', tag: string) => {
    const response = await fetch(`${baseUrl}/api/v1/auth/register${role === 'barber' ? '/barber' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: `${tag} Person`,
            email: makeEmail(tag),
            phone: makePhone(),
            password: 'Password123',
        }),
    });

    const body = await response.json() as { message?: string; data?: { accessToken: string; user: { id: string } } };
    assert.equal(response.status, 201, `Registration failed: ${body?.message ?? 'unknown error'}`);
    return { token: body.data!.accessToken as string, user: body.data!.user as { id: string } };
};

const createBarberFixture = async (baseUrl: string, tag: string) => {
    const owner = await register(baseUrl, 'barber', `${tag}-owner`);
    const profileResponse = await fetch(`${baseUrl}/api/v1/barbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
        body: JSON.stringify({ businessName: `${tag} Barber`, bio: 'Queue test barber' }),
    });
    const profileBody = await profileResponse.json() as { data: { id: string } };
    assert.equal(profileResponse.status, 201);
    await prisma.barber.update({ where: { id: profileBody.data.id }, data: { isOpen: true } });
    return { ...owner, barberId: profileBody.data.id as string };
};

const createCustomer = (baseUrl: string, tag: string) => register(baseUrl, 'user', `${tag}-customer`);

const createService = (barberId: string) => prisma.barberService.create({
    data: { barberId, name: 'Classic Haircut', description: 'Classic cut', price: new Prisma.Decimal('150.00'), durationMinutes: 30, isActive: true },
});

const addWorkingHour = (barberId: string, dayOfWeek: number) => prisma.barberWorkingHour.create({ data: { barberId, dayOfWeek, openTime: '09:00', closeTime: '22:00', isActive: true } });

beforeEach(cleanupTestData);
afterEach(cleanupTestData);

describe('Socket queue', () => {
    test('valid JWT connects and authorized users can join their barber queue', async () => {
        const server = createServer(app);
        const io = createQueueSocketServer(server);
        const port = await new Promise<number>((resolve) => server.listen(0, () => resolve((server.address() as { port: number }).port)));

        const baseUrl = `http://127.0.0.1:${port}`;
        const barber = await createBarberFixture(baseUrl, 'socket-join');
        const customer = await createCustomer(baseUrl, 'socket-join-customer');
        const service = await createService(barber.barberId);
        const day = nextLocalDateAt(10, 0).dayOfWeek;
        await addWorkingHour(barber.barberId, day);
        const bookingResponse = await fetch(`${baseUrl}/api/v1/bookings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.token}` },
            body: JSON.stringify({ barberId: barber.barberId, serviceId: service.id, startAt: nextLocalDateAt(10, 0, day).instant.toISOString() }),
        });
        assert.equal(bookingResponse.status, 201);
        const booking = await bookingResponse.json() as { data: { id: string } };

        const socket = Client(baseUrl, { auth: { token: customer.token } });
        const joinSuccess = await new Promise<{ barberId: string; queue: { items: unknown[] } }>((resolve) => {
            socket.on('queue:join:success', (payload) => resolve(payload));
            socket.emit('queue:join', { barberId: barber.barberId });
        });

        assert.equal(joinSuccess.barberId, barber.barberId);
        assert.ok(Array.isArray(joinSuccess.queue.items));
        assert.equal(socket.connected, true);
        const socketId = socket.id;
        assert.ok(socketId);
        assert.equal(io.sockets.adapter.rooms.get(queueRoomName(barber.barberId))?.has(socketId), true);

        const cancelled = await fetch(`${baseUrl}/api/v1/bookings/${booking.data.id}/cancel`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.token}` },
            body: '{}',
        });
        assert.equal(cancelled.status, 200);
        assert.equal(Boolean(io.sockets.adapter.rooms.get(queueRoomName(barber.barberId))?.has(socketId)), false);

        const staleBookingSocket = Client(baseUrl, { auth: { token: customer.token } });
        const deniedAfterCancellation = await new Promise<{ message: string }>((resolve) => {
            staleBookingSocket.on('queue:join:error', resolve);
            staleBookingSocket.emit('queue:join', { barberId: barber.barberId });
        });
        assert.equal(deniedAfterCancellation.message, 'You are not authorized to access this queue');

        socket.close();
        staleBookingSocket.close();
        io.close();
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    });

    test('missing and invalid JWT are rejected', async () => {
        const server = createServer(app);
        const io = createQueueSocketServer(server);
        const port = await new Promise<number>((resolve) => server.listen(0, () => resolve((server.address() as { port: number }).port)));

        const baseUrl = `http://127.0.0.1:${port}`;
        const withoutToken = Client(baseUrl);
        const missing = await new Promise<unknown>((resolve) => {
            withoutToken.on('connect_error', (error) => resolve(error.message));
        });
        assert.equal(missing, 'Authentication required');

        const invalid = Client(baseUrl, { auth: { token: 'not-a-valid-token' } });
        const invalidMessage = await new Promise<unknown>((resolve) => {
            invalid.on('connect_error', (error) => resolve(error.message));
        });
        assert.equal(invalidMessage, 'Invalid token');

        withoutToken.close();
        invalid.close();
        io.close();
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    });
});
