import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { app } from '../app';
import { prisma } from '../config/database';
import { env } from '../config/env';

const api = request(app);
const testDomain = '@notification-test.example.test';
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
    await prisma.deviceToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
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
    const response = await api.post(role === 'barber' ? '/api/v1/auth/register/barber' : '/api/v1/auth/register').send({
        name: `${tag} Person`,
        email: makeEmail(tag),
        phone: makePhone(),
        password: 'Password123',
    });
    assert.equal(response.status, 201, `Registration failed: ${response.body?.message ?? 'unknown error'}`);
    return { token: response.body.data.accessToken as string, user: response.body.data.user as { id: string } };
};

const createBarberFixture = async (tag: string) => {
    const owner = await register('barber', `${tag}-owner`);
    const profileResponse = await api.post('/api/v1/barbers').set('Authorization', `Bearer ${owner.token}`).send({ businessName: `${tag} Barber`, bio: 'Notification test barber' });
    assert.equal(profileResponse.status, 201);
    await prisma.barber.update({ where: { id: profileResponse.body.data.id }, data: { isOpen: true } });
    return { ...owner, barberId: profileResponse.body.data.id as string };
};

const createCustomer = (tag: string) => register('user', `${tag}-customer`);

const createService = (barberId: string) => prisma.barberService.create({
    data: { barberId, name: 'Classic Haircut', description: 'Classic cut', price: new Prisma.Decimal('150.00'), durationMinutes: 30, isActive: true },
});

const addWorkingHour = (barberId: string, dayOfWeek: number) => prisma.barberWorkingHour.create({ data: { barberId, dayOfWeek, openTime: '09:00', closeTime: '22:00', isActive: true } });

const createBooking = async (customerToken: string, barberId: string, serviceId: string) => {
    const day = nextLocalDateAt(10, 0).dayOfWeek;
    await addWorkingHour(barberId, day);
    const response = await api.post('/api/v1/bookings').set('Authorization', `Bearer ${customerToken}`).send({
        barberId,
        serviceId,
        startAt: nextLocalDateAt(10, 0, day).instant.toISOString(),
    });
    assert.equal(response.status, 201, response.body?.message);
    return response.body.data;
};

beforeEach(cleanupTestData);
afterEach(cleanupTestData);

describe('Notifications', () => {
    test('booking creation creates a BOOKING_CREATED notification for the customer', async () => {
        const barber = await createBarberFixture('notify-booking');
        const customer = await createCustomer('notify-booking-customer');
        const service = await createService(barber.barberId);

        await createBooking(customer.token, barber.barberId, service.id);

        const response = await api.get('/api/v1/notifications').set('Authorization', `Bearer ${customer.token}`);
        assert.equal(response.status, 200, response.body?.message);
        assert.equal(response.body.data.items.length, 1);
        assert.equal(response.body.data.items[0].type, 'BOOKING_CREATED');
        assert.equal(response.body.data.items[0].isRead, false);
    });

    test('queue start and completion create BOOKING_STARTED and BOOKING_COMPLETED notifications', async () => {
        const barber = await createBarberFixture('notify-queue');
        const customer = await createCustomer('notify-queue-customer');
        const service = await createService(barber.barberId);
        const booking = await createBooking(customer.token, barber.barberId, service.id);

        const queue = await prisma.queueEntry.findFirst({ where: { bookingId: booking.id } });
        assert.ok(queue);

        const startResponse = await api.patch(`/api/v1/barbers/me/queue/${queue!.id}/start`).set('Authorization', `Bearer ${barber.token}`);
        assert.equal(startResponse.status, 200, startResponse.body?.message);

        const notificationsAfterStart = await api.get('/api/v1/notifications').set('Authorization', `Bearer ${customer.token}`);
        assert.equal(notificationsAfterStart.body.data.items.some((item: { type: string }) => item.type === 'BOOKING_STARTED'), true);

        const completeResponse = await api.patch(`/api/v1/barbers/me/queue/${queue!.id}/complete`).set('Authorization', `Bearer ${barber.token}`);
        assert.equal(completeResponse.status, 200, completeResponse.body?.message);

        const notifications = await api.get('/api/v1/notifications').set('Authorization', `Bearer ${customer.token}`);
        const types = notifications.body.data.items.map((item: { type: string }) => item.type);
        assert.equal(types.includes('BOOKING_COMPLETED'), true);
        assert.equal(types.filter((type: string) => type === 'BOOKING_STARTED').length, 1);
    });

    test('mark one and mark all as read are enforced per user and unread count is correct', async () => {
        const barber = await createBarberFixture('notify-read');
        const customer = await createCustomer('notify-read-customer');
        const service = await createService(barber.barberId);
        const booking = await createBooking(customer.token, barber.barberId, service.id);

        const queue = await prisma.queueEntry.findFirst({ where: { bookingId: booking.id } });
        assert.ok(queue);
        await api.patch(`/api/v1/barbers/me/queue/${queue!.id}/start`).set('Authorization', `Bearer ${barber.token}`);
        const list = await api.get('/api/v1/notifications').set('Authorization', `Bearer ${customer.token}`);
        const notificationId = list.body.data.items[0].id;

        const unreadCountBefore = await api.get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${customer.token}`);
        assert.equal(unreadCountBefore.body.data.count, 2);

        const markOne = await api.patch(`/api/v1/notifications/${notificationId}/read`).set('Authorization', `Bearer ${customer.token}`);
        assert.equal(markOne.status, 200);
        assert.equal(markOne.body.data.isRead, true);

        const markAll = await api.patch('/api/v1/notifications/read-all').set('Authorization', `Bearer ${customer.token}`);
        assert.equal(markAll.status, 200);
        assert.equal(markAll.body.data.updatedCount >= 1, true);

        const unreadCountAfter = await api.get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${customer.token}`);
        assert.equal(unreadCountAfter.body.data.count, 0);
    });

    test('cross-user access to notifications is rejected', async () => {
        const barber = await createBarberFixture('notify-cross');
        const customerA = await createCustomer('notify-cross-a');
        const customerB = await createCustomer('notify-cross-b');
        const service = await createService(barber.barberId);
        const booking = await createBooking(customerA.token, barber.barberId, service.id);

        const notificationList = await api.get('/api/v1/notifications').set('Authorization', `Bearer ${customerB.token}`);
        assert.equal(notificationList.body.data.items.length, 0);

        const customerNotification = await prisma.notification.findFirst({ where: { userId: customerA.user.id } });
        assert.ok(customerNotification);

        const forbidden = await api.patch(`/api/v1/notifications/${customerNotification!.id}/read`).set('Authorization', `Bearer ${customerB.token}`);
        assert.equal(forbidden.status, 404);
    });

    test('customer can register, list, and delete device tokens without exposing a client userId', async () => {
        const customer = await createCustomer('notify-device');

        const registerResponse = await api.post('/api/v1/notifications/devices').set('Authorization', `Bearer ${customer.token}`).send({
            token: 'device-token-android-123',
            platform: 'ANDROID',
            userId: 'fake-user-id',
        });

        assert.equal(registerResponse.status, 201, registerResponse.body?.message);
        assert.equal(registerResponse.body.data.userId, customer.user.id);
        assert.equal(registerResponse.body.data.platform, 'ANDROID');

        const listResponse = await api.get('/api/v1/notifications/devices').set('Authorization', `Bearer ${customer.token}`);
        assert.equal(listResponse.status, 200);
        assert.equal(listResponse.body.data.items.length, 1);
        assert.equal(listResponse.body.data.items[0].token, 'device-token-android-123');

        const deleteResponse = await api.delete(`/api/v1/notifications/devices/${registerResponse.body.data.id}`).set('Authorization', `Bearer ${customer.token}`);
        assert.equal(deleteResponse.status, 200);
        assert.equal(deleteResponse.body.data.deleted, true);

        const finalList = await api.get('/api/v1/notifications/devices').set('Authorization', `Bearer ${customer.token}`);
        assert.equal(finalList.status, 200);
        assert.equal(finalList.body.data.items.length, 0);
    });

});
