import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { Prisma, QueueStatus, Role } from '@prisma/client';
import { app } from '../app';
import { env } from '../config/env';
import { prisma } from '../config/database';

const api = request(app);
const testDomain = '@queue-test.example.test';
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

const register = async (role: 'user' | 'barber', tag: string) => {
    const response = await api
        .post(role === 'barber' ? '/api/v1/auth/register/barber' : '/api/v1/auth/register')
        .send({ name: `${tag} Person`, email: makeEmail(tag), phone: makePhone(), password: 'Password123' });
    assert.equal(response.status, 201, `Registration failed: ${response.body?.message ?? 'unknown error'}`);
    return { token: response.body.data.accessToken as string, user: response.body.data.user as { id: string } };
};

const createBarberFixture = async (tag: string) => {
    const owner = await register('barber', `${tag}-owner`);
    const profileResponse = await api
        .post('/api/v1/barbers')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ businessName: `${tag} Barber`, bio: 'Queue test barber' });
    assert.equal(profileResponse.status, 201);
    await prisma.barber.update({ where: { id: profileResponse.body.data.id }, data: { isOpen: true } });
    return { ...owner, barberId: profileResponse.body.data.id as string };
};

const createCustomer = (tag: string) => register('user', `${tag}-customer`);

const createService = (barberId: string, overrides: Partial<{ name: string; description: string | null; price: string; durationMinutes: number; isActive: boolean }> = {}) => prisma.barberService.create({
    data: {
        barberId,
        name: 'Classic Haircut',
        description: 'Classic cut',
        price: new Prisma.Decimal('150.00'),
        durationMinutes: 30,
        isActive: true,
        ...overrides,
    },
});

const addWorkingHour = (barberId: string, dayOfWeek: number, openTime = '09:00', closeTime = '22:00', isActive = true) =>
    prisma.barberWorkingHour.create({ data: { barberId, dayOfWeek, openTime, closeTime, isActive } });

const createBookingRequest = (token: string, barberId: string, serviceId: string, startAt: string, additional?: Record<string, unknown>) =>
    api.post('/api/v1/bookings').set('Authorization', `Bearer ${token}`).send({ barberId, serviceId, startAt, ...additional });

const makeBookableFixture = async (tag: string, time = '10:00') => {
    const barber = await createBarberFixture(tag);
    const customer = await createCustomer(tag);
    const [hour, minute] = time.split(':').map(Number);
    const start = nextLocalDateAt(hour, minute);
    const service = await createService(barber.barberId);
    await addWorkingHour(barber.barberId, start.dayOfWeek);
    return { barber, customer, service, startAt: start.instant.toISOString(), dayOfWeek: start.dayOfWeek };
};

beforeEach(cleanupTestData);
afterEach(cleanupTestData);

describe('Queue', () => {
    test('creating a booking creates a queue entry in WAITING state', async () => {
        const fixture = await makeBookableFixture('queue-create');

        const response = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, fixture.startAt);

        assert.equal(response.status, 201, response.body?.message);
        const queueEntry = await prisma.queueEntry.findFirst({ where: { bookingId: response.body.data.id } });
        assert.ok(queueEntry);
        assert.equal(queueEntry?.status, QueueStatus.WAITING);
        assert.ok(queueEntry?.joinedAt instanceof Date);
    });

    test('user can read own queue and position respects active queue ordering', async () => {
        const barber = await createBarberFixture('queue-user');
        const customerA = await createCustomer('queue-user-a');
        const customerB = await createCustomer('queue-user-b');
        const customerC = await createCustomer('queue-user-c');
        const service = await createService(barber.barberId);
        const day = nextLocalDateAt(10, 0).dayOfWeek;
        await addWorkingHour(barber.barberId, day);

        const bookingA = await createBookingRequest(customerA.token, barber.barberId, service.id, nextLocalDateAt(10, 0, day).instant.toISOString());
        const bookingB = await createBookingRequest(customerB.token, barber.barberId, service.id, nextLocalDateAt(10, 30, day).instant.toISOString());
        const bookingC = await createBookingRequest(customerC.token, barber.barberId, service.id, nextLocalDateAt(11, 0, day).instant.toISOString());

        const queueResponse = await api.get(`/api/v1/bookings/${bookingC.body.data.id}/queue`).set('Authorization', `Bearer ${customerC.token}`);
        assert.equal(queueResponse.status, 200, queueResponse.body?.message);
        assert.equal(queueResponse.body.data.status, QueueStatus.WAITING);
        assert.equal(queueResponse.body.data.position, 3);

        const startResponse = await api.patch(`/api/v1/barbers/me/queue/${queueResponse.body.data.queueId}/start`).set('Authorization', `Bearer ${barber.token}`);
        assert.equal(startResponse.status, 200, startResponse.body?.message);

        const updatedQueue = await api.get(`/api/v1/bookings/${bookingC.body.data.id}/queue`).set('Authorization', `Bearer ${customerC.token}`);
        assert.equal(updatedQueue.body.data.position, 1);
    });

    test('barber can start and complete a waiting queue entry', async () => {
        const barber = await createBarberFixture('queue-barber');
        const customer = await createCustomer('queue-barber-customer');
        const service = await createService(barber.barberId);
        const day = nextLocalDateAt(10, 0).dayOfWeek;
        await addWorkingHour(barber.barberId, day);
        const booking = await createBookingRequest(customer.token, barber.barberId, service.id, nextLocalDateAt(10, 0, day).instant.toISOString());

        const queue = await prisma.queueEntry.findFirst({ where: { bookingId: booking.body.data.id } });
        assert.ok(queue);

        const startResponse = await api.patch(`/api/v1/barbers/me/queue/${queue!.id}/start`).set('Authorization', `Bearer ${barber.token}`);
        assert.equal(startResponse.status, 200, startResponse.body?.message);
        assert.equal(startResponse.body.data.status, QueueStatus.IN_PROGRESS);

        const completeResponse = await api.patch(`/api/v1/barbers/me/queue/${queue!.id}/complete`).set('Authorization', `Bearer ${barber.token}`);
        assert.equal(completeResponse.status, 200, completeResponse.body?.message);
        assert.equal(completeResponse.body.data.status, QueueStatus.COMPLETED);
    });

    test('state transition violations are rejected', async () => {
        const barber = await createBarberFixture('queue-state');
        const customer = await createCustomer('queue-state-customer');
        const service = await createService(barber.barberId);
        const day = nextLocalDateAt(10, 0).dayOfWeek;
        await addWorkingHour(barber.barberId, day);
        const booking = await createBookingRequest(customer.token, barber.barberId, service.id, nextLocalDateAt(10, 0, day).instant.toISOString());
        const queue = await prisma.queueEntry.findFirst({ where: { bookingId: booking.body.data.id } });
        assert.ok(queue);

        const waitingToComplete = await api.patch(`/api/v1/barbers/me/queue/${queue!.id}/complete`).set('Authorization', `Bearer ${barber.token}`);
        assert.equal(waitingToComplete.status, 409);

        const startResponse = await api.patch(`/api/v1/barbers/me/queue/${queue!.id}/start`).set('Authorization', `Bearer ${barber.token}`);
        assert.equal(startResponse.status, 200);

        const completeAgain = await api.patch(`/api/v1/barbers/me/queue/${queue!.id}/complete`).set('Authorization', `Bearer ${barber.token}`);
        assert.equal(completeAgain.status, 200);

        const completedToStart = await api.patch(`/api/v1/barbers/me/queue/${queue!.id}/start`).set('Authorization', `Bearer ${barber.token}`);
        assert.equal(completedToStart.status, 409);
    });
});
