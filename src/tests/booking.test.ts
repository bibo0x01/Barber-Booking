import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { BookingStatus, Prisma, QueueStatus, Role } from '@prisma/client';
import { app } from '../app';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { dispatchNotificationPushSafely } from '../modules/notifications/push.service';

const api = request(app);
const testDomain = '@booking-test.example.test';
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
    const result = new Date(candidate);
    const verified = zonedParts(result);
    assert.deepEqual(
        [verified.year, verified.month, verified.day, verified.hour, verified.minute],
        [year, month, day, hour, minute],
        `Could not construct ${year}-${month}-${day} ${hour}:${minute} in ${env.appTimezone}`,
    );
    return result;
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
    await prisma.booking.deleteMany({
        where: {
            OR: [{ userId: { in: userIds } }, { barberId: { in: barberIds } }],
        },
    });
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
        .send({ businessName: `${tag} Barber`, bio: 'Booking test barber' });
    assert.equal(profileResponse.status, 201);
    await prisma.barber.update({ where: { id: profileResponse.body.data.id }, data: { isOpen: true } });
    return { ...owner, barberId: profileResponse.body.data.id as string };
};

const createCustomer = (tag: string) => register('user', `${tag}-customer`);

const createService = (barberId: string, overrides: Partial<{
    name: string;
    description: string | null;
    price: string;
    durationMinutes: number;
    isActive: boolean;
}> = {}) => prisma.barberService.create({
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

const startAtAtTime = (hour: number, minute: number, weekday?: number) => nextLocalDateAt(hour, minute, weekday);

const createBookingRequest = (token: string, barberId: string, serviceId: string, startAt: string, additional?: Record<string, unknown>) =>
    api.post('/api/v1/bookings').set('Authorization', `Bearer ${token}`).send({ barberId, serviceId, startAt, ...additional });

const makeBookableFixture = async (tag: string, time = '10:00') => {
    const barber = await createBarberFixture(tag);
    const customer = await createCustomer(tag);
    const [hour, minute] = time.split(':').map(Number);
    const start = startAtAtTime(hour, minute);
    const service = await createService(barber.barberId);
    await addWorkingHour(barber.barberId, start.dayOfWeek);
    return { barber, customer, service, startAt: start.instant.toISOString(), dayOfWeek: start.dayOfWeek };
};

const getBookingFromResponse = (data: any) => data;

beforeEach(cleanupTestData);
afterEach(cleanupTestData);

describe('Bookings', () => {
    test('USER creates a booking with server-calculated end, confirmed status, ownership, and service snapshot', async () => {
        const fixture = await makeBookableFixture('booking-create');
        const response = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, fixture.startAt);
        assert.equal(response.status, 201, response.body?.message);
        assert.equal(response.body.success, true);
        assert.equal(response.body.message, 'Booking created successfully');
        const booking = response.body.data;
        assert.equal(booking.barberId, fixture.barber.barberId);
        assert.equal(booking.serviceId, fixture.service.id);
        assert.equal(booking.status, BookingStatus.CONFIRMED);
        assert.equal(booking.service.name, 'Classic Haircut');
        assert.equal(booking.service.description, 'Classic cut');
        assert.equal(booking.service.price, 150);
        assert.equal(booking.service.durationMinutes, 30);
        assert.equal(new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime(), 30 * 60_000);
        const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
        assert.equal(stored.userId, fixture.customer.user.id);
        assert.equal(stored.barberId, fixture.barber.barberId);
        assert.equal(stored.serviceId, fixture.service.id);
    });

    test('client cannot provide userId or endAt', async () => {
        const fixture = await makeBookableFixture('booking-forbidden-fields');
        const response = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, fixture.startAt, {
            userId: 'another-user',
            endAt: '2035-01-01T11:00:00.000Z',
        });
        assert.equal(response.status, 400);
        assert.equal(await prisma.booking.count(), 0);
    });

    test('missing request fields and malformed identifiers are rejected', async () => {
        const customer = await createCustomer('booking-invalid-fields');
        const headers = { Authorization: `Bearer ${customer.token}` };
        const noBarber = await api.post('/api/v1/bookings').set(headers).send({ serviceId: 'cm00000000000000000000000', startAt: '2035-01-01T10:00:00Z' });
        const noService = await api.post('/api/v1/bookings').set(headers).send({ barberId: 'cm00000000000000000000000', startAt: '2035-01-01T10:00:00Z' });
        const noStart = await api.post('/api/v1/bookings').set(headers).send({ barberId: 'cm00000000000000000000000', serviceId: 'cm00000000000000000000000' });
        const malformedId = await api.post('/api/v1/bookings').set(headers).send({ barberId: 'bad', serviceId: 'bad', startAt: '2035-01-01T10:00:00Z' });
        assert.equal(noBarber.status, 400);
        assert.equal(noService.status, 400);
        assert.equal(noStart.status, 400);
        assert.equal(malformedId.status, 400);
    });

    test('malformed, invalid, and timezone-less datetimes are rejected; offset timestamps are accepted', async () => {
        const fixture = await makeBookableFixture('booking-datetime');
        for (const value of ['not-a-date', '2026-02-30T10:00:00Z', '2035-01-01T10:00:00']) {
            const response = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, value);
            assert.equal(response.status, 400, `${value} should be rejected`);
        }
        const offsetStart = new Date(fixture.startAt).toISOString().replace('Z', '+00:00');
        const accepted = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, offsetStart);
        assert.equal(accepted.status, 201, accepted.body?.message);
    });

    test('booking rejects missing/inactive barber and missing/inactive/foreign service', async () => {
        const fixture = await makeBookableFixture('booking-invalid-relations');
        const otherBarber = await createBarberFixture('booking-other-owner');
        const foreignService = await createService(otherBarber.barberId);
        const otherStart = startAtAtTime(10, 0, fixture.dayOfWeek).instant.toISOString();

        const missingBarber = await createBookingRequest(fixture.customer.token, 'cm00000000000000000000000', fixture.service.id, otherStart);
        const missingService = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, 'cm00000000000000000000000', otherStart);
        const inactiveService = await createService(fixture.barber.barberId, { isActive: false });
        const deactivated = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, inactiveService.id, otherStart);
        const foreign = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, foreignService.id, otherStart);
        await prisma.barber.update({ where: { id: fixture.barber.barberId }, data: { isActive: false } });
        const inactiveBarber = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, otherStart);

        assert.equal(missingBarber.status, 404);
        assert.equal(missingService.status, 404);
        assert.equal(deactivated.status, 404);
        assert.equal(foreign.status, 400);
        assert.equal(inactiveBarber.status, 404);
    });

    test('closed barber cannot be booked and booking does not change manual open status', async () => {
        const fixture = await makeBookableFixture('booking-closed');
        await prisma.barber.update({ where: { id: fixture.barber.barberId }, data: { isOpen: false } });
        const response = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, fixture.startAt);
        assert.equal(response.status, 409);
        assert.equal((await prisma.barber.findUniqueOrThrow({ where: { id: fixture.barber.barberId } })).isOpen, false);
    });

    test('rejects start times in the past and accepts a future time', async () => {
        const fixture = await makeBookableFixture('booking-past');
        const past = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, '2000-01-01T10:00:00.000Z');
        assert.equal(past.status, 400);
        const future = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, fixture.startAt);
        assert.equal(future.status, 201, future.body?.message);
        const nearPast = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, new Date(Date.now() - 1_000).toISOString());
        assert.equal(nearPast.status, 400);
    });

    test('working hours use the configured IANA timezone, and exact opening/closing times are accepted', async () => {
        const barber = await createBarberFixture('booking-hours-edge');
        const customer = await createCustomer('booking-hours-edge');
        const service = await createService(barber.barberId);
        const atOpen = startAtAtTime(10, 0);
        const atClose = startAtAtTime(21, 30, atOpen.dayOfWeek);
        await addWorkingHour(barber.barberId, atOpen.dayOfWeek, '10:00', '22:00');

        const opens = await createBookingRequest(customer.token, barber.barberId, service.id, atOpen.instant.toISOString());
        assert.equal(opens.status, 201, opens.body?.message);
        const closes = await createBookingRequest(customer.token, barber.barberId, service.id, atClose.instant.toISOString());
        assert.equal(closes.status, 201, closes.body?.message);
    });

    test('booking before opening, beyond closing, on a day without hours, or past midnight is rejected', async () => {
        const barber = await createBarberFixture('booking-hours-invalid');
        const customer = await createCustomer('booking-hours-invalid');
        const service = await createService(barber.barberId);
        const start = startAtAtTime(10, 0);
        await addWorkingHour(barber.barberId, start.dayOfWeek, '10:00', '22:00');

        const beforeOpen = startAtAtTime(9, 30, start.dayOfWeek);
        const beyondClose = startAtAtTime(21, 31, start.dayOfWeek);
        const noHoursDay = startAtAtTime(10, 0, (start.dayOfWeek + 1) % 7);
        const requests = await Promise.all([
            createBookingRequest(customer.token, barber.barberId, service.id, beforeOpen.instant.toISOString()),
            createBookingRequest(customer.token, barber.barberId, service.id, beyondClose.instant.toISOString()),
            createBookingRequest(customer.token, barber.barberId, service.id, noHoursDay.instant.toISOString()),
        ]);
        assert.ok(requests.every((response) => response.status === 400));
    });

    test('exact, partial, start-inside, and end-inside overlaps conflict while adjacent bookings are allowed', async () => {
        const fixture = await makeBookableFixture('booking-overlap', '10:00');
        const first = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, fixture.startAt);
        assert.equal(first.status, 201);

        for (const [hour, minute, tag] of [[10, 0, 'exact'], [10, 15, 'partial'], [10, 20, 'start-inside'], [9, 45, 'end-inside']] as const) {
            const start = startAtAtTime(hour, minute, fixture.dayOfWeek).instant.toISOString();
            const conflict = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, start);
            assert.equal(conflict.status, 409, `${tag} overlap should conflict: ${JSON.stringify(conflict.body)}`);
        }

        const adjacent = startAtAtTime(10, 30, fixture.dayOfWeek).instant.toISOString();
        const accepted = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, adjacent);
        assert.equal(accepted.status, 201, accepted.body?.message);
    });

    test('two concurrent overlapping requests result in exactly one success and one conflict', async () => {
        const fixture = await makeBookableFixture('booking-concurrent');
        const requests = await Promise.all([
            createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, fixture.startAt),
            createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, fixture.startAt),
        ]);
        assert.deepEqual(requests.map((response) => response.status).sort(), [201, 409], JSON.stringify(requests.map((response) => response.body)));
        assert.equal(await prisma.booking.count({ where: { barberId: fixture.barber.barberId } }), 1);
        const conflict = requests.find((response) => response.status === 409);
        assert.equal(conflict?.body.message, 'The selected time is no longer available');
        assert.deepEqual(conflict?.body.errors, []);
    });

    test('service edits and deactivation do not change historical booking snapshots', async () => {
        const fixture = await makeBookableFixture('booking-snapshot');
        const created = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, fixture.startAt);
        assert.equal(created.status, 201);

        await prisma.barberService.update({
            where: { id: fixture.service.id },
            data: { name: 'Premium Haircut', description: 'Updated description', price: new Prisma.Decimal('200.00'), durationMinutes: 45, isActive: false },
        });
        const fetched = await api.get(`/api/v1/bookings/${created.body.data.id}`).set('Authorization', `Bearer ${fixture.customer.token}`);
        assert.equal(fetched.status, 200);
        assert.deepEqual(fetched.body.data.service, {
            name: 'Classic Haircut',
            description: 'Classic cut',
            price: 150,
            durationMinutes: 30,
        });
        assert.equal(new Date(fetched.body.data.endAt).getTime() - new Date(fetched.body.data.startAt).getTime(), 30 * 60_000);
    });

    test('barber and customer booking lists are scoped and paginated', async () => {
        const fixture = await makeBookableFixture('booking-lists');
        const otherCustomer = await createCustomer('booking-list-other');
        const firstStart = startAtAtTime(10, 0, fixture.dayOfWeek).instant;
        const secondStart = startAtAtTime(11, 0, fixture.dayOfWeek).instant;
        const laterStart = startAtAtTime(12, 0, fixture.dayOfWeek).instant;

        await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, firstStart.toISOString());
        await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, secondStart.toISOString());
        const otherBooking = await createBookingRequest(otherCustomer.token, fixture.barber.barberId, fixture.service.id, laterStart.toISOString());
        assert.equal(otherBooking.status, 201);

        const customerList = await api.get('/api/v1/bookings/me').set('Authorization', `Bearer ${fixture.customer.token}`).query({ page: 1, limit: 1 });
        assert.equal(customerList.status, 200);
        assert.equal(customerList.body.data.pagination.total, 2);
        assert.equal(customerList.body.data.pagination.totalPages, 2);
        assert.equal(customerList.body.data.pagination.page, 1);
        assert.equal(customerList.body.data.pagination.limit, 1);
        assert.equal(customerList.body.data.items.length, 1);
        assert.equal(new Date(customerList.body.data.items[0].startAt).getTime(), firstStart.getTime());

        const barberList = await api.get('/api/v1/barbers/me/bookings').set('Authorization', `Bearer ${fixture.barber.token}`);
        assert.equal(barberList.status, 200);
        assert.equal(barberList.body.data.pagination.total, 3);
        assert.equal(barberList.body.data.pagination.page, 1);
        assert.equal(barberList.body.data.pagination.limit, 20);
        assert.deepEqual(barberList.body.data.items.map((booking: any) => new Date(booking.startAt).getTime()), [firstStart.getTime(), secondStart.getTime(), laterStart.getTime()]);
    });

    test('booking list pagination validates limit and page and rejects ownership query parameters', async () => {
        const customer = await createCustomer('booking-list-validation');
        const invalidPage = await api.get('/api/v1/bookings/me?page=0').set('Authorization', `Bearer ${customer.token}`);
        const invalidLimit = await api.get('/api/v1/bookings/me?limit=51').set('Authorization', `Bearer ${customer.token}`);
        const fakeOwner = await api.get('/api/v1/bookings/me?userId=someone-else').set('Authorization', `Bearer ${customer.token}`);
        assert.equal(invalidPage.status, 400);
        assert.equal(invalidLimit.status, 400);
        assert.equal(fakeOwner.status, 400);
    });

    test('booking lists accept the maximum page size and return correct empty-page metadata', async () => {
        const fixture = await makeBookableFixture('booking-list-pages');
        const customer = await api
            .get('/api/v1/bookings/me')
            .set('Authorization', `Bearer ${fixture.customer.token}`)
            .query({ page: 2, limit: 50 });
        const barber = await api
            .get('/api/v1/barbers/me/bookings')
            .set('Authorization', `Bearer ${fixture.barber.token}`)
            .query({ page: 2, limit: 50 });

        assert.equal(customer.status, 200);
        assert.deepEqual(customer.body.data.pagination, { page: 2, limit: 50, total: 0, totalPages: 0 });
        assert.deepEqual(customer.body.data.items, []);
        assert.equal(barber.status, 200);
        assert.deepEqual(barber.body.data.pagination, { page: 2, limit: 50, total: 0, totalPages: 0 });
        assert.deepEqual(barber.body.data.items, []);
    });

    test('customer can view only their own booking and response excludes private account fields', async () => {
        const fixture = await makeBookableFixture('booking-customer-detail');
        const other = await createCustomer('booking-customer-detail-other');
        const created = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, fixture.startAt);
        const own = await api.get(`/api/v1/bookings/${created.body.data.id}`).set('Authorization', `Bearer ${fixture.customer.token}`);
        const foreign = await api.get(`/api/v1/bookings/${created.body.data.id}`).set('Authorization', `Bearer ${other.token}`);

        assert.equal(own.status, 200);
        assert.equal(own.body.data.barber.businessName, 'booking-customer-detail Barber');
        assert.equal(own.body.data.userId, undefined);
        assert.equal(own.body.data.barber.user, undefined);
        assert.equal(own.body.data.barber.passwordHash, undefined);
        assert.equal(foreign.status, 404);
    });

    test('barber can list and view own bookings but cannot read another barber booking', async () => {
        const fixture = await makeBookableFixture('booking-barber-access');
        const otherBarber = await createBarberFixture('booking-barber-access-other');
        const otherService = await createService(otherBarber.barberId);
        const start = startAtAtTime(10, 0, fixture.dayOfWeek);
        await addWorkingHour(otherBarber.barberId, start.dayOfWeek);
        const created = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, fixture.startAt);
        const otherCustomer = await createCustomer('booking-otherbarber-customer');
        const otherCreated = await createBookingRequest(otherCustomer.token, otherBarber.barberId, otherService.id, start.instant.toISOString());

        const list = await api.get('/api/v1/barbers/me/bookings').set('Authorization', `Bearer ${fixture.barber.token}`);
        const own = await api.get(`/api/v1/barbers/me/bookings/${created.body.data.id}`).set('Authorization', `Bearer ${fixture.barber.token}`);
        const foreign = await api.get(`/api/v1/barbers/me/bookings/${otherCreated.body.data.id}`).set('Authorization', `Bearer ${fixture.barber.token}`);

        assert.equal(list.status, 200);
        assert.equal(list.body.data.pagination.total, 1);
        assert.equal(own.status, 200);
        assert.deepEqual(own.body.data.customer, { id: fixture.customer.user.id, name: 'booking-barber-access-customer Person', avatarUrl: null });
        assert.equal(own.body.data.customer.passwordHash, undefined);
        assert.equal(foreign.status, 404);
    });

    test('role enforcement rejects barber/admin booking creation and prevents cross-role list access', async () => {
        const fixture = await makeBookableFixture('booking-roles');
        const admin = await createCustomer('booking-admin');
        await prisma.user.update({ where: { id: admin.user.id }, data: { role: Role.ADMIN } });
        const barberCreate = await createBookingRequest(fixture.barber.token, fixture.barber.barberId, fixture.service.id, fixture.startAt);
        const adminCreate = await createBookingRequest(admin.token, fixture.barber.barberId, fixture.service.id, fixture.startAt);
        const noToken = await api.post('/api/v1/bookings').send({ barberId: fixture.barber.barberId, serviceId: fixture.service.id, startAt: fixture.startAt });
        const noListToken = await api.get('/api/v1/bookings/me');
        const barberCustomerList = await api.get('/api/v1/bookings/me').set('Authorization', `Bearer ${fixture.barber.token}`);
        const userBarberList = await api.get('/api/v1/barbers/me/bookings').set('Authorization', `Bearer ${fixture.customer.token}`);

        assert.equal(barberCreate.status, 403);
        assert.equal(adminCreate.status, 403);
        assert.equal(noToken.status, 401);
        assert.equal(noListToken.status, 401);
        assert.equal(barberCustomerList.status, 403);
        assert.equal(userBarberList.status, 403);
    });

    test('valid ISO timestamp with a non-UTC offset maps to the configured local working-hour interval', async () => {
        const fixture = await makeBookableFixture('booking-offset-zone');
        const target = new Date(fixture.startAt);
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: env.appTimezone,
            timeZoneName: 'longOffset',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        });
        const parts = formatter.formatToParts(target);
        const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
        const offset = (get('timeZoneName') || 'GMT+00:00').replace('GMT', '');
        const localOffsetIso = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}.000${offset}`;
        const response = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, localOffsetIso);
        assert.equal(response.status, 201, response.body?.message);
    });
});

describe('Feature 21: Booking History & Rebooking', () => {
    const createAt = async (fixture: Awaited<ReturnType<typeof makeBookableFixture>>, hour: number, minute = 0) => {
        const startAt = startAtAtTime(hour, minute, fixture.dayOfWeek).instant.toISOString();
        const response = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, startAt);
        assert.equal(response.status, 201, response.body?.message);
        return response.body.data;
    };

    const moveBookingToPast = async (bookingId: string, daysAgo = 1) => {
        const startAt = new Date(Date.now() - daysAgo * 24 * 60 * 60_000);
        await prisma.booking.update({
            where: { id: bookingId },
            data: { startAt, endAt: new Date(startAt.getTime() + 30 * 60_000) },
        });
    };

    const customerBookings = (token: string, query: Record<string, string | number> = {}) =>
        api.get('/api/v1/bookings/me').set('Authorization', `Bearer ${token}`).query(query);

    const rebook = (token: string, bookingId: string, body: Record<string, unknown>) =>
        api.post(`/api/v1/bookings/${bookingId}/rebook`).set('Authorization', `Bearer ${token}`).send(body);

    const toOffsetIsoString = (instant: Date, timeZone: string): string => {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone,
            timeZoneName: 'longOffset',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(instant);
        const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
        const offset = (get('timeZoneName') || 'GMT+00:00').replace('GMT', '');
        const milliseconds = String(instant.getUTCMilliseconds()).padStart(3, '0');
        return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}.${milliseconds}${offset}`;
    };

    test('history defaults to all and explicit all preserves every owned booking', async () => {
        const fixture = await makeBookableFixture('feature21-history-all');
        const booking = await createAt(fixture, 10);
        await moveBookingToPast(booking.id);

        const defaultScope = await customerBookings(fixture.customer.token);
        const explicitAll = await customerBookings(fixture.customer.token, { scope: 'all' });

        assert.equal(defaultScope.status, 200);
        assert.equal(defaultScope.body.data.pagination.total, 1);
        assert.equal(explicitAll.status, 200);
        assert.deepEqual(explicitAll.body.data.items.map((item: { id: string }) => item.id), [booking.id]);
    });

    test('upcoming includes future and IN_PROGRESS bookings but excludes elapsed waiting bookings', async () => {
        const fixture = await makeBookableFixture('feature21-upcoming-classification');
        const inProgress = await createAt(fixture, 10);
        const elapsedWaiting = await createAt(fixture, 11);
        const future = await createAt(fixture, 12);
        await moveBookingToPast(inProgress.id, 1);
        await moveBookingToPast(elapsedWaiting.id, 2);
        await prisma.queueEntry.update({ where: { bookingId: inProgress.id }, data: { status: QueueStatus.IN_PROGRESS } });

        const response = await customerBookings(fixture.customer.token, { scope: 'upcoming' });
        const ids = response.body.data.items.map((item: { id: string }) => item.id);
        assert.equal(response.status, 200);
        assert.equal(ids.includes(inProgress.id), true);
        assert.equal(ids.includes(future.id), true);
        assert.equal(ids.includes(elapsedWaiting.id), false);
    });

    test('history includes elapsed and COMPLETED bookings but excludes future incomplete bookings', async () => {
        const fixture = await makeBookableFixture('feature21-history-classification');
        const elapsed = await createAt(fixture, 10);
        const completedFuture = await createAt(fixture, 11);
        const futureWaiting = await createAt(fixture, 12);
        await moveBookingToPast(elapsed.id);
        await prisma.queueEntry.update({ where: { bookingId: completedFuture.id }, data: { status: QueueStatus.COMPLETED } });

        const response = await customerBookings(fixture.customer.token, { scope: 'history' });
        const ids = response.body.data.items.map((item: { id: string }) => item.id);
        assert.equal(response.status, 200);
        assert.equal(ids.includes(elapsed.id), true);
        assert.equal(ids.includes(completedFuture.id), true);
        assert.equal(ids.includes(futureWaiting.id), false);
    });

    test('history scopes are isolated to the authenticated customer', async () => {
        const fixture = await makeBookableFixture('feature21-history-isolation');
        const other = await createCustomer('feature21-history-other');
        const ownBooking = await createAt(fixture, 10);
        const otherResponse = await createBookingRequest(other.token, fixture.barber.barberId, fixture.service.id, startAtAtTime(11, 0, fixture.dayOfWeek).instant.toISOString());
        assert.equal(otherResponse.status, 201);

        const response = await customerBookings(fixture.customer.token, { scope: 'all' });
        assert.deepEqual(response.body.data.items.map((item: { id: string }) => item.id), [ownBooking.id]);
    });

    test('upcoming scope returns only the authenticated customer’s bookings', async () => {
        const fixture = await makeBookableFixture('feature21-upcoming-isolation');
        const other = await createCustomer('feature21-upcoming-isolation-other');
        const ownBooking = await createAt(fixture, 10);
        const otherResponse = await createBookingRequest(
            other.token,
            fixture.barber.barberId,
            fixture.service.id,
            startAtAtTime(11, 0, fixture.dayOfWeek).instant.toISOString(),
        );
        assert.equal(otherResponse.status, 201);

        const response = await customerBookings(fixture.customer.token, { scope: 'upcoming' });
        assert.deepEqual(response.body.data.items.map((item: { id: string }) => item.id), [ownBooking.id]);
        assert.equal(response.body.data.items.some((item: { id: string }) => item.id === otherResponse.body.data.id), false);
    });

    test('history scope returns only the authenticated customer’s bookings', async () => {
        const fixture = await makeBookableFixture('feature21-history-isolation-scope');
        const other = await createCustomer('feature21-history-isolation-scope-other');
        const ownBooking = await createAt(fixture, 10);
        const otherResponse = await createBookingRequest(
            other.token,
            fixture.barber.barberId,
            fixture.service.id,
            startAtAtTime(11, 0, fixture.dayOfWeek).instant.toISOString(),
        );
        assert.equal(otherResponse.status, 201);
        await moveBookingToPast(ownBooking.id, 1);
        await moveBookingToPast(otherResponse.body.data.id, 2);

        const response = await customerBookings(fixture.customer.token, { scope: 'history' });
        assert.deepEqual(response.body.data.items.map((item: { id: string }) => item.id), [ownBooking.id]);
        assert.equal(response.body.data.items.some((item: { id: string }) => item.id === otherResponse.body.data.id), false);
    });

    test('invalid booking-history scope returns the standard validation error', async () => {
        const customer = await createCustomer('feature21-history-invalid-scope');
        const response = await customerBookings(customer.token, { scope: 'future' });
        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'Validation failed');
        assert.ok(response.body.errors.some((error: { path: string }) => error.path === 'scope'));
    });

    test('history excludes future bookings even when their queue entry is IN_PROGRESS', async () => {
        const fixture = await makeBookableFixture('feature21-history-future-in-progress');
        const futureInProgress = await createAt(fixture, 10);
        await prisma.queueEntry.update({ where: { bookingId: futureInProgress.id }, data: { status: QueueStatus.IN_PROGRESS } });

        const response = await customerBookings(fixture.customer.token, { scope: 'history' });
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items.some((item: { id: string }) => item.id === futureInProgress.id), false);
    });

    test('upcoming and history ordering use start time and deterministic ID tie-breakers', async () => {
        const fixture = await makeBookableFixture('feature21-order-primary');
        const secondBarber = await createBarberFixture('feature21-order-secondary');
        const secondService = await createService(secondBarber.barberId);
        await addWorkingHour(secondBarber.barberId, fixture.dayOfWeek);
        const tiedStart = startAtAtTime(10, 0, fixture.dayOfWeek).instant.toISOString();
        const sameTimeOtherBarber = await createBookingRequest(fixture.customer.token, secondBarber.barberId, secondService.id, tiedStart);
        assert.equal(sameTimeOtherBarber.status, 201);
        const sameTimePrimary = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, tiedStart);
        assert.equal(sameTimePrimary.status, 201);
        const later = await createAt(fixture, 11);

        const upcoming = await customerBookings(fixture.customer.token, { scope: 'upcoming' });
        assert.deepEqual(
            upcoming.body.data.items.map((item: { id: string }) => item.id),
            [sameTimeOtherBarber.body.data.id, sameTimePrimary.body.data.id].sort().concat(later.id),
        );

        const pastStart = new Date(Date.now() - 2 * 24 * 60 * 60_000);
        await prisma.booking.updateMany({
            where: { id: { in: [sameTimeOtherBarber.body.data.id, sameTimePrimary.body.data.id] } },
            data: { startAt: pastStart, endAt: new Date(pastStart.getTime() + 30 * 60_000) },
        });
        await moveBookingToPast(later.id, 1);
        const history = await customerBookings(fixture.customer.token, { scope: 'history' });
        assert.deepEqual(
            history.body.data.items.map((item: { id: string }) => item.id),
            [later.id, ...[sameTimeOtherBarber.body.data.id, sameTimePrimary.body.data.id].sort().reverse()],
        );
    });

    test('pagination is applied within all, upcoming, and history scopes', async () => {
        const fixture = await makeBookableFixture('feature21-scope-pagination');
        const elapsed = await createAt(fixture, 10);
        const completed = await createAt(fixture, 11);
        const futureA = await createAt(fixture, 12);
        const futureB = await createAt(fixture, 13);
        await moveBookingToPast(elapsed.id, 1);
        await moveBookingToPast(completed.id, 2);
        await prisma.queueEntry.update({ where: { bookingId: completed.id }, data: { status: QueueStatus.COMPLETED } });

        for (const scope of ['all', 'upcoming', 'history']) {
            const first = await customerBookings(fixture.customer.token, { scope, page: 1, limit: 1 });
            const second = await customerBookings(fixture.customer.token, { scope, page: 2, limit: 1 });
            const expectedTotal = scope === 'all' ? 4 : 2;
            assert.equal(first.body.data.pagination.total, expectedTotal, `${scope} total`);
            assert.equal(first.body.data.items.length, 1, `${scope} page one`);
            assert.equal(second.body.data.items.length, 1, `${scope} page two`);
            assert.notEqual(first.body.data.items[0].id, second.body.data.items[0].id, `${scope} pages are distinct`);
        }
        assert.deepEqual(
            (await customerBookings(fixture.customer.token, { scope: 'upcoming' })).body.data.items.map((item: { id: string }) => item.id),
            [futureA.id, futureB.id],
        );
    });

    test('rebooking succeeds with current service data and WAITING queue while preserving the original', async () => {
        const fixture = await makeBookableFixture('feature21-rebook-success');
        const original = await createAt(fixture, 10);
        const originalBookingBefore = await prisma.booking.findUniqueOrThrow({ where: { id: original.id } });
        const originalQueueBefore = await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: original.id } });
        const originalNotificationCount = await prisma.notification.count({ where: { userId: fixture.customer.user.id } });
        await prisma.barberService.update({
            where: { id: fixture.service.id },
            data: { name: 'Current Cut', description: 'Current details', price: new Prisma.Decimal('220.00'), durationMinutes: 45 },
        });
        const requestedStart = startAtAtTime(11, 0, fixture.dayOfWeek).instant;

        const response = await rebook(fixture.customer.token, original.id, { startAt: requestedStart.toISOString() });
        assert.equal(response.status, 201, response.body?.message);
        const created = response.body.data;
        assert.equal(created.barberId, fixture.barber.barberId);
        assert.equal(created.serviceId, fixture.service.id);
        assert.deepEqual(created.service, { name: 'Current Cut', description: 'Current details', price: 220, durationMinutes: 45 });
        assert.equal(new Date(created.endAt).getTime() - requestedStart.getTime(), 45 * 60_000);

        const newQueue = await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: created.id } });
        assert.equal(newQueue.status, QueueStatus.WAITING);
        assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: created.id } })).userId, fixture.customer.user.id);
        assert.equal(await prisma.notification.count({ where: { userId: fixture.customer.user.id } }), originalNotificationCount + 1);
        const originalBookingAfter = await prisma.booking.findUniqueOrThrow({ where: { id: original.id } });
        const originalQueueAfter = await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: original.id } });
        assert.equal(JSON.stringify(originalBookingAfter), JSON.stringify(originalBookingBefore));
        assert.equal(JSON.stringify(originalQueueAfter), JSON.stringify(originalQueueBefore));
    });

    test('missing and another customer’s original bookings both return not found', async () => {
        const fixture = await makeBookableFixture('feature21-rebook-idors');
        const original = await createAt(fixture, 10);
        const other = await createCustomer('feature21-rebook-idors-other');
        const target = startAtAtTime(11, 0, fixture.dayOfWeek).instant.toISOString();

        const missing = await rebook(fixture.customer.token, 'cm00000000000000000000000', { startAt: target });
        const foreign = await rebook(other.token, original.id, { startAt: target });
        assert.equal(missing.status, 404);
        assert.equal(foreign.status, 404);
        assert.equal(foreign.body.message, 'Booking not found');
    });

    test('rebooking requires authentication and rejects BARBER and ADMIN roles', async () => {
        const fixture = await makeBookableFixture('feature21-rebook-roles');
        const original = await createAt(fixture, 10);
        const admin = await createCustomer('feature21-rebook-admin');
        await prisma.user.update({ where: { id: admin.user.id }, data: { role: Role.ADMIN } });
        const body = { startAt: startAtAtTime(11, 0, fixture.dayOfWeek).instant.toISOString() };

        assert.equal((await api.post(`/api/v1/bookings/${original.id}/rebook`).send(body)).status, 401);
        assert.equal((await rebook(fixture.barber.token, original.id, body)).status, 403);
        assert.equal((await rebook(admin.token, original.id, body)).status, 403);
    });

    test('rebooking validates startAt and rejects all client-supplied booking fields', async () => {
        const fixture = await makeBookableFixture('feature21-rebook-input');
        const original = await createAt(fixture, 10);
        const validStart = startAtAtTime(11, 0, fixture.dayOfWeek).instant.toISOString();

        assert.equal((await rebook(fixture.customer.token, original.id, {})).status, 400);
        assert.equal((await rebook(fixture.customer.token, original.id, { startAt: 'not-a-datetime' })).status, 400);
        for (const field of ['userId', 'barberId', 'serviceId', 'endAt', 'price', 'status']) {
            const response = await rebook(fixture.customer.token, original.id, { startAt: validStart, [field]: 'attacker-value' });
            assert.equal(response.status, 400, `${field} must be rejected`);
        }
    });

    test('rebooking rejects inactive or closed barbers and inactive or foreign services', async () => {
        const inactiveBarber = await makeBookableFixture('feature21-rebook-inactive-barber');
        const inactiveBarberBooking = await createAt(inactiveBarber, 10);
        await prisma.barber.update({ where: { id: inactiveBarber.barber.barberId }, data: { isActive: false } });
        assert.equal((await rebook(inactiveBarber.customer.token, inactiveBarberBooking.id, { startAt: startAtAtTime(11, 0, inactiveBarber.dayOfWeek).instant.toISOString() })).status, 404);

        const closedBarber = await makeBookableFixture('feature21-rebook-closed-barber');
        const closedBooking = await createAt(closedBarber, 10);
        await prisma.barber.update({ where: { id: closedBarber.barber.barberId }, data: { isOpen: false } });
        assert.equal((await rebook(closedBarber.customer.token, closedBooking.id, { startAt: startAtAtTime(11, 0, closedBarber.dayOfWeek).instant.toISOString() })).status, 409);

        const inactiveService = await makeBookableFixture('feature21-rebook-inactive-service');
        const inactiveServiceBooking = await createAt(inactiveService, 10);
        await prisma.barberService.update({ where: { id: inactiveService.service.id }, data: { isActive: false } });
        assert.equal((await rebook(inactiveService.customer.token, inactiveServiceBooking.id, { startAt: startAtAtTime(11, 0, inactiveService.dayOfWeek).instant.toISOString() })).status, 404);

        const movedService = await makeBookableFixture('feature21-rebook-moved-service');
        const movedServiceBooking = await createAt(movedService, 10);
        const otherBarber = await createBarberFixture('feature21-rebook-destination-barber');
        await prisma.barberService.update({ where: { id: movedService.service.id }, data: { barberId: otherBarber.barberId } });
        const moved = await rebook(movedService.customer.token, movedServiceBooking.id, { startAt: startAtAtTime(11, 0, movedService.dayOfWeek).instant.toISOString() });
        assert.equal(moved.status, 400);
        assert.equal(moved.body.message, 'Service does not belong to the selected barber');
    });

    test('rebooking rejects past start times and times outside working hours', async () => {
        const fixture = await makeBookableFixture('feature21-rebook-time-validation');
        const original = await createAt(fixture, 10);
        assert.equal((await rebook(fixture.customer.token, original.id, { startAt: '2000-01-01T10:00:00.000Z' })).status, 400);
        const afterClose = startAtAtTime(22, 0, fixture.dayOfWeek).instant.toISOString();
        assert.equal((await rebook(fixture.customer.token, original.id, { startAt: afterClose })).status, 400);
    });

    test('rebooking accepts an explicit non-UTC offset timestamp using configured timezone rules', async () => {
        const fixture = await makeBookableFixture('feature21-rebook-offset');
        const original = await createAt(fixture, 10);
        const expectedInstant = startAtAtTime(11, 0, fixture.dayOfWeek).instant;
        const offsetTimestamp = toOffsetIsoString(expectedInstant, 'America/New_York');
        assert.match(offsetTimestamp, /[+-]\d{2}:\d{2}$/);
        assert.equal(offsetTimestamp.endsWith('+00:00'), false);

        const response = await rebook(fixture.customer.token, original.id, { startAt: offsetTimestamp });
        assert.equal(response.status, 201, response.body?.message);
        assert.equal(new Date(response.body.data.startAt).getTime(), expectedInstant.getTime());
    });

    test('rebooking uses the exclusion constraint for overlap and accepts adjacent intervals', async () => {
        const fixture = await makeBookableFixture('feature21-rebook-overlap');
        const original = await createAt(fixture, 10);
        const occupied = await createAt(fixture, 11);
        const overlap = await rebook(fixture.customer.token, original.id, { startAt: startAtAtTime(11, 15, fixture.dayOfWeek).instant.toISOString() });
        assert.equal(overlap.status, 409);
        assert.equal(overlap.body.message, 'The selected time is no longer available');

        const adjacent = await rebook(fixture.customer.token, original.id, { startAt: startAtAtTime(11, 30, fixture.dayOfWeek).instant.toISOString() });
        assert.equal(adjacent.status, 201, adjacent.body?.message);
        assert.equal(await prisma.booking.count({ where: { id: occupied.id } }), 1);
    });

    test('concurrent rebooking collisions return one success and one mapped HTTP 409', async () => {
        const fixture = await makeBookableFixture('feature21-rebook-concurrent');
        const original = await createAt(fixture, 10);
        const body = { startAt: startAtAtTime(11, 0, fixture.dayOfWeek).instant.toISOString() };
        const responses = await Promise.all([
            rebook(fixture.customer.token, original.id, body),
            rebook(fixture.customer.token, original.id, body),
        ]);
        assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
        const conflict = responses.find((response) => response.status === 409);
        assert.equal(conflict?.body.message, 'The selected time is no longer available');
        assert.equal(await prisma.booking.count({ where: { barberId: fixture.barber.barberId } }), 2);
        assert.equal(await prisma.queueEntry.count({ where: { booking: { barberId: fixture.barber.barberId } } }), 2);
    });

    test('failed rebooking rolls back booking, queue, and notification writes atomically', async () => {
        const fixture = await makeBookableFixture('feature21-rebook-atomic-failure');
        const original = await createAt(fixture, 10);
        await createAt(fixture, 11);
        const beforeBookings = await prisma.booking.count({ where: { userId: fixture.customer.user.id } });
        const beforeQueues = await prisma.queueEntry.count({ where: { booking: { userId: fixture.customer.user.id } } });
        const beforeNotifications = await prisma.notification.count({ where: { userId: fixture.customer.user.id } });

        const failure = await rebook(fixture.customer.token, original.id, { startAt: startAtAtTime(11, 15, fixture.dayOfWeek).instant.toISOString() });
        assert.equal(failure.status, 409);
        assert.equal(await prisma.booking.count({ where: { userId: fixture.customer.user.id } }), beforeBookings);
        assert.equal(await prisma.queueEntry.count({ where: { booking: { userId: fixture.customer.user.id } } }), beforeQueues);
        assert.equal(await prisma.notification.count({ where: { userId: fixture.customer.user.id } }), beforeNotifications);
    });

    test('QueueEntry insertion failure rolls back the preceding Booking insert', async () => {
        const fixture = await makeBookableFixture('feature21-rebook-queue-rollback');
        const original = await createAt(fixture, 10);
        const beforeBookings = await prisma.booking.count({ where: { userId: fixture.customer.user.id } });
        const beforeQueues = await prisma.queueEntry.count({ where: { booking: { userId: fixture.customer.user.id } } });
        const beforeNotifications = await prisma.notification.count({ where: { userId: fixture.customer.user.id } });
        const suffix = `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}`.replace(/[^a-zA-Z0-9_]/g, '_');
        const functionName = `feature21_fail_queue_${suffix}`;
        const triggerName = `feature21_fail_queue_trigger_${suffix}`;
        let functionCreated = false;
        let triggerCreated = false;

        try {
            await prisma.$executeRawUnsafe(
                `CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Feature 21 test QueueEntry failure'; END; $$`,
            );
            functionCreated = true;
            await prisma.$executeRawUnsafe(
                `CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "QueueEntry" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`,
            );
            triggerCreated = true;

            const response = await rebook(
                fixture.customer.token,
                original.id,
                { startAt: startAtAtTime(11, 0, fixture.dayOfWeek).instant.toISOString() },
            );
            assert.equal(response.status, 500);
            assert.equal(await prisma.booking.count({ where: { userId: fixture.customer.user.id } }), beforeBookings);
            assert.equal(await prisma.queueEntry.count({ where: { booking: { userId: fixture.customer.user.id } } }), beforeQueues);
            assert.equal(await prisma.notification.count({ where: { userId: fixture.customer.user.id } }), beforeNotifications);
        } finally {
            if (triggerCreated) {
                await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "QueueEntry"`);
            }
            if (functionCreated) {
                await prisma.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
            }
        }
    });

    test('rebooking HTTP endpoint returns success after committed records despite rejected FCM dispatch', async () => {
        const fixture = await makeBookableFixture('feature21-rebook-push');
        const original = await createAt(fixture, 10);
        const originalBookingBefore = await prisma.booking.findUniqueOrThrow({ where: { id: original.id } });
        const originalQueueBefore = await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: original.id } });
        const expectedStartAt = startAtAtTime(11, 0, fixture.dayOfWeek).instant;
        let dispatchCalls = 0;
        let dispatchObservedCommittedState = false;

        const failingFcmDispatcher: typeof dispatchNotificationPushSafely = (userId, payload) => {
            return dispatchNotificationPushSafely(userId, payload, async () => {
                dispatchCalls += 1;
                assert.equal(userId, fixture.customer.user.id);
                assert.equal(payload.data?.type, 'BOOKING_CREATED');
                const committedBooking = await prisma.booking.findFirst({
                    where: {
                        userId: fixture.customer.user.id,
                        barberId: fixture.barber.barberId,
                        startAt: expectedStartAt,
                        id: { not: original.id },
                    },
                    select: { id: true },
                });
                if (committedBooking) {
                    const [queueCount, notificationCount] = await Promise.all([
                        prisma.queueEntry.count({ where: { bookingId: committedBooking.id } }),
                        prisma.notification.count({
                            where: {
                                userId: fixture.customer.user.id,
                                type: 'BOOKING_CREATED',
                                metadata: { path: ['bookingId'], equals: committedBooking.id },
                            },
                        }),
                    ]);
                    dispatchObservedCommittedState = queueCount === 1 && notificationCount === 1;
                }
                throw new Error('simulated FCM failure');
            });
        };

        const previousDispatcher = app.locals.bookingPushDispatcher;
        try {
            app.locals.bookingPushDispatcher = failingFcmDispatcher;
            const response = await rebook(fixture.customer.token, original.id, { startAt: expectedStartAt.toISOString() });

            assert.equal(response.status, 201);
            assert.deepEqual(Object.keys(response.body).sort(), ['data', 'message', 'success']);
            assert.equal(response.body.success, true);
            assert.equal(response.body.message, 'Booking created successfully');
            assert.equal(typeof response.body.data.id, 'string');
            assert.equal(response.body.data.barberId, fixture.barber.barberId);
            assert.equal(response.body.data.serviceId, fixture.service.id);
            assert.equal(new Date(response.body.data.startAt).getTime(), expectedStartAt.getTime());
            assert.equal(dispatchCalls, 1);
            assert.equal(dispatchObservedCommittedState, true);
            assert.equal(await prisma.booking.count({ where: { id: response.body.data.id } }), 1);

            const createdQueue = await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: response.body.data.id } });
            assert.equal(createdQueue.status, QueueStatus.WAITING);
            const createdNotification = await prisma.notification.findFirst({
                where: {
                    userId: fixture.customer.user.id,
                    type: 'BOOKING_CREATED',
                    metadata: { path: ['bookingId'], equals: response.body.data.id },
                },
            });
            assert.ok(createdNotification);

            const originalBookingAfter = await prisma.booking.findUniqueOrThrow({ where: { id: original.id } });
            const originalQueueAfter = await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: original.id } });
            assert.equal(JSON.stringify(originalBookingAfter), JSON.stringify(originalBookingBefore));
            assert.equal(JSON.stringify(originalQueueAfter), JSON.stringify(originalQueueBefore));
        } finally {
            if (previousDispatcher === undefined) {
                delete app.locals.bookingPushDispatcher;
            } else {
                app.locals.bookingPushDispatcher = previousDispatcher;
            }
        }
    });
});

describe('Feature 22: Booking Cancellation & Lifecycle', () => {
    const createBooking = async (fixture: Awaited<ReturnType<typeof makeBookableFixture>>, hour = 10) => {
        const startAt = startAtAtTime(hour, 0, fixture.dayOfWeek).instant.toISOString();
        const response = await createBookingRequest(
            fixture.customer.token,
            fixture.barber.barberId,
            fixture.service.id,
            startAt,
        );
        assert.equal(response.status, 201, response.body?.message);
        return response.body.data;
    };

    const cancelAsCustomer = (token: string, bookingId: string, body: Record<string, unknown> = {}) =>
        api.patch(`/api/v1/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${token}`).send(body);

    const cancelAsBarber = (token: string, bookingId: string, body: Record<string, unknown> = {}) =>
        api.patch(`/api/v1/barbers/me/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${token}`).send(body);

    test('USER cancels own eligible booking and preserves the booking and queue history', async () => {
        const fixture = await makeBookableFixture('feature22-customer-success');
        const booking = await createBooking(fixture);
        const beforeBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
        const beforeQueue = await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: booking.id } });

        const response = await cancelAsCustomer(fixture.customer.token, booking.id);
        assert.equal(response.status, 200, response.body?.message);
        assert.deepEqual(Object.keys(response.body).sort(), ['data', 'message', 'success']);
        assert.equal(response.body.success, true);
        assert.equal(response.body.message, 'Booking cancelled successfully');
        assert.equal(response.body.data.status, BookingStatus.CANCELLED);

        const afterBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
        const afterQueue = await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: booking.id } });
        assert.deepEqual(afterBooking, { ...beforeBooking, status: BookingStatus.CANCELLED, updatedAt: afterBooking.updatedAt });
        assert.deepEqual(afterQueue, { ...beforeQueue, status: QueueStatus.CANCELLED, updatedAt: afterQueue.updatedAt });
        assert.equal(await prisma.booking.count({ where: { id: booking.id } }), 1);
        assert.equal(await prisma.queueEntry.count({ where: { bookingId: booking.id } }), 1);
    });

    test('BARBER cancels a confirmed booking belonging to their barber profile', async () => {
        const fixture = await makeBookableFixture('feature22-barber-success');
        const booking = await createBooking(fixture);
        const response = await cancelAsBarber(fixture.barber.token, booking.id);

        assert.equal(response.status, 200, response.body?.message);
        assert.equal(response.body.data.status, BookingStatus.CANCELLED);
        assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, BookingStatus.CANCELLED);
        assert.equal((await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: booking.id } })).status, QueueStatus.CANCELLED);
    });

    test('cancellation enforces authentication and role-specific endpoints', async () => {
        const fixture = await makeBookableFixture('feature22-role-policy');
        const booking = await createBooking(fixture);
        const admin = await createCustomer('feature22-role-admin');
        await prisma.user.update({ where: { id: admin.user.id }, data: { role: Role.ADMIN } });

        assert.equal((await api.patch(`/api/v1/bookings/${booking.id}/cancel`).send({})).status, 401);
        assert.equal((await cancelAsCustomer(fixture.barber.token, booking.id)).status, 403);
        assert.equal((await cancelAsBarber(fixture.customer.token, booking.id)).status, 403);
        assert.equal((await cancelAsCustomer(admin.token, booking.id)).status, 403);
    });

    test('customer and barber ownership checks hide foreign bookings and missing IDs', async () => {
        const fixture = await makeBookableFixture('feature22-idors-primary');
        const otherCustomer = await createCustomer('feature22-idors-other-customer');
        const otherBarber = await createBarberFixture('feature22-idors-other-barber');
        const booking = await createBooking(fixture);
        const unknownId = 'cm00000000000000000000000';

        const foreignCustomer = await cancelAsCustomer(otherCustomer.token, booking.id);
        const foreignBarber = await cancelAsBarber(otherBarber.token, booking.id);
        const missing = await cancelAsCustomer(fixture.customer.token, unknownId);
        assert.equal(foreignCustomer.status, 404);
        assert.equal(foreignBarber.status, 404);
        assert.equal(missing.status, 404);
        assert.equal(foreignCustomer.body.message, 'Booking not found');
        assert.equal(foreignBarber.body.message, 'Booking not found');
        assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, BookingStatus.CONFIRMED);
    });

    test('cancellation is rejected at or after startAt', async () => {
        const fixture = await makeBookableFixture('feature22-past-start');
        const booking = await createBooking(fixture);
        const pastStart = new Date(Date.now() - 60_000);
        await prisma.booking.update({
            where: { id: booking.id },
            data: { startAt: pastStart, endAt: new Date(pastStart.getTime() + 30 * 60_000) },
        });

        const response = await cancelAsCustomer(fixture.customer.token, booking.id);
        assert.equal(response.status, 409);
        assert.equal(response.body.message, 'Booking can only be cancelled before it starts');
        assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, BookingStatus.CONFIRMED);
        assert.equal((await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: booking.id } })).status, QueueStatus.WAITING);
    });

    test('IN_PROGRESS and COMPLETED queue entries cannot be cancelled', async () => {
        const fixture = await makeBookableFixture('feature22-queue-lifecycle');
        const inProgressBooking = await createBooking(fixture, 10);
        const completedBooking = await createBooking(fixture, 11);
        await prisma.queueEntry.update({
            where: { bookingId: inProgressBooking.id },
            data: { status: QueueStatus.IN_PROGRESS, startedAt: new Date() },
        });
        await prisma.queueEntry.update({
            where: { bookingId: completedBooking.id },
            data: { status: QueueStatus.COMPLETED, startedAt: new Date(), completedAt: new Date() },
        });

        const inProgress = await cancelAsCustomer(fixture.customer.token, inProgressBooking.id);
        const completed = await cancelAsCustomer(fixture.customer.token, completedBooking.id);
        assert.equal(inProgress.status, 409);
        assert.equal(completed.status, 409);
        assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: inProgressBooking.id } })).status, BookingStatus.CONFIRMED);
        assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: completedBooking.id } })).status, BookingStatus.CONFIRMED);
        assert.equal((await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: inProgressBooking.id } })).status, QueueStatus.IN_PROGRESS);
        assert.equal((await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: completedBooking.id } })).status, QueueStatus.COMPLETED);
    });

    test('repeated cancellation is rejected and unexpected body fields are not accepted', async () => {
        const fixture = await makeBookableFixture('feature22-repeat-strict');
        const booking = await createBooking(fixture);
        const extraField = await cancelAsCustomer(fixture.customer.token, booking.id, { status: 'CANCELLED' });
        assert.equal(extraField.status, 400);
        assert.equal(extraField.body.message, 'Validation failed');

        const first = await cancelAsCustomer(fixture.customer.token, booking.id);
        const notificationCount = await prisma.notification.count({ where: { userId: fixture.customer.user.id } });
        const repeated = await cancelAsCustomer(fixture.customer.token, booking.id);
        assert.equal(first.status, 200);
        assert.equal(repeated.status, 409);
        assert.equal(repeated.body.message, 'Booking cannot be cancelled');
        assert.equal(await prisma.notification.count({ where: { userId: fixture.customer.user.id } }), notificationCount);
    });

    test('successful cancellation persists one customer notification and excludes booking from upcoming', async () => {
        const fixture = await makeBookableFixture('feature22-notification');
        const booking = await createBooking(fixture);
        const beforeCount = await prisma.notification.count({ where: { userId: fixture.customer.user.id } });

        const response = await cancelAsCustomer(fixture.customer.token, booking.id);
        assert.equal(response.status, 200);
        const cancellationNotifications = await prisma.notification.findMany({
            where: { userId: fixture.customer.user.id, type: 'BOOKING_CANCELLED' },
            select: { metadata: true },
        });
        assert.equal(await prisma.notification.count({ where: { userId: fixture.customer.user.id } }), beforeCount + 1);
        assert.equal(cancellationNotifications.length, 1);
        assert.equal((cancellationNotifications[0]?.metadata as { cancelledBy?: string }).cancelledBy, 'USER');

        const upcoming = await api.get('/api/v1/bookings/me?scope=upcoming').set('Authorization', `Bearer ${fixture.customer.token}`);
        assert.equal(upcoming.status, 200);
        assert.equal(upcoming.body.data.items.some((item: { id: string }) => item.id === booking.id), false);
    });

    test('cancelled booking no longer reserves its interval', async () => {
        const fixture = await makeBookableFixture('feature22-slot-reuse');
        const booking = await createBooking(fixture);
        const cancelled = await cancelAsCustomer(fixture.customer.token, booking.id);
        assert.equal(cancelled.status, 200);

        const replacement = await createBookingRequest(fixture.customer.token, fixture.barber.barberId, fixture.service.id, booking.startAt);
        assert.equal(replacement.status, 201, replacement.body?.message);
        assert.notEqual(replacement.body.data.id, booking.id);
        assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, BookingStatus.CANCELLED);
    });

    test('Feature 23: failed cancellation transaction does not dispatch a queue event', async () => {
        const fixture = await makeBookableFixture('feature22-transaction-rollback');
        const booking = await createBooking(fixture);
        const beforeBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
        const beforeQueue = await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: booking.id } });
        const beforeNotifications = await prisma.notification.count({ where: { userId: fixture.customer.user.id } });
        const suffix = `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}`.replace(/[^a-zA-Z0-9_]/g, '_');
        const functionName = `feature22_fail_queue_update_${suffix}`;
        const triggerName = `feature22_fail_queue_update_trigger_${suffix}`;
        let functionCreated = false;
        let triggerCreated = false;
        let queueDispatchCalls = 0;
        const previousQueueDispatcher = app.locals.queueUpdateDispatcher;

        try {
            app.locals.queueUpdateDispatcher = async () => {
                queueDispatchCalls += 1;
            };
            await prisma.$executeRawUnsafe(
                `CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Feature 22 test QueueEntry update failure'; END; $$`,
            );
            functionCreated = true;
            await prisma.$executeRawUnsafe(
                `CREATE TRIGGER "${triggerName}" BEFORE UPDATE ON "QueueEntry" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`,
            );
            triggerCreated = true;
            const response = await cancelAsCustomer(fixture.customer.token, booking.id);
            assert.equal(response.status, 500);
            assert.deepEqual(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }), beforeBooking);
            assert.deepEqual(await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: booking.id } }), beforeQueue);
            assert.equal(await prisma.notification.count({ where: { userId: fixture.customer.user.id } }), beforeNotifications);
            assert.equal(queueDispatchCalls, 0);
        } finally {
            if (triggerCreated) {
                await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "QueueEntry"`);
            }
            if (functionCreated) {
                await prisma.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
            }
            if (previousQueueDispatcher === undefined) {
                delete app.locals.queueUpdateDispatcher;
            } else {
                app.locals.queueUpdateDispatcher = previousQueueDispatcher;
            }
        }
    });

    test('concurrent cancellation and queue start leave one coherent lifecycle state', async () => {
        const fixture = await makeBookableFixture('feature22-cancel-start-race');
        const booking = await createBooking(fixture);
        const queue = await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: booking.id } });
        const [cancellation, start] = await Promise.all([
            cancelAsCustomer(fixture.customer.token, booking.id),
            api.patch(`/api/v1/barbers/me/queue/${queue.id}/start`).set('Authorization', `Bearer ${fixture.barber.token}`),
        ]);

        assert.ok([200, 409].includes(cancellation.status));
        assert.ok([200, 409].includes(start.status));
        assert.ok(cancellation.status === 200 ? start.status === 409 : start.status === 200);
        const finalBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
        const finalQueue = await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: booking.id } });
        assert.ok(
            (finalBooking.status === BookingStatus.CANCELLED && finalQueue.status === QueueStatus.CANCELLED) ||
            (finalBooking.status === BookingStatus.CONFIRMED && finalQueue.status === QueueStatus.IN_PROGRESS),
        );
    });

    test('cancelled queue entries cannot be started or completed', async () => {
        const fixture = await makeBookableFixture('feature22-cancelled-queue-ops');
        const booking = await createBooking(fixture);
        const cancelled = await cancelAsCustomer(fixture.customer.token, booking.id);
        assert.equal(cancelled.status, 200);
        const queue = await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: booking.id } });

        const start = await api.patch(`/api/v1/barbers/me/queue/${queue.id}/start`).set('Authorization', `Bearer ${fixture.barber.token}`);
        const complete = await api.patch(`/api/v1/barbers/me/queue/${queue.id}/complete`).set('Authorization', `Bearer ${fixture.barber.token}`);
        assert.equal(start.status, 409);
        assert.equal(complete.status, 409);
        assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, BookingStatus.CANCELLED);
        assert.equal((await prisma.queueEntry.findUniqueOrThrow({ where: { id: queue.id } })).status, QueueStatus.CANCELLED);
    });

    test('Feature 23: competing starts and completions transition once and persist one lifecycle notification', async () => {
        const fixture = await makeBookableFixture('feature23-competing-transitions');
        const booking = await createBooking(fixture);
        const queue = await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: booking.id } });

        const competingStarts = await Promise.all([
            api.patch(`/api/v1/barbers/me/queue/${queue.id}/start`).set('Authorization', `Bearer ${fixture.barber.token}`),
            api.patch(`/api/v1/barbers/me/queue/${queue.id}/start`).set('Authorization', `Bearer ${fixture.barber.token}`),
        ]);
        assert.deepEqual(competingStarts.map((response) => response.status).sort(), [200, 409]);
        assert.equal((await prisma.queueEntry.findUniqueOrThrow({ where: { id: queue.id } })).status, QueueStatus.IN_PROGRESS);
        assert.equal(await prisma.notification.count({
            where: { userId: fixture.customer.user.id, type: 'BOOKING_STARTED', metadata: { path: ['bookingId'], equals: booking.id } },
        }), 1);

        const competingCompletions = await Promise.all([
            api.patch(`/api/v1/barbers/me/queue/${queue.id}/complete`).set('Authorization', `Bearer ${fixture.barber.token}`),
            api.patch(`/api/v1/barbers/me/queue/${queue.id}/complete`).set('Authorization', `Bearer ${fixture.barber.token}`),
        ]);
        assert.deepEqual(competingCompletions.map((response) => response.status).sort(), [200, 409]);
        assert.equal((await prisma.queueEntry.findUniqueOrThrow({ where: { id: queue.id } })).status, QueueStatus.COMPLETED);
        assert.equal(await prisma.notification.count({
            where: { userId: fixture.customer.user.id, type: 'BOOKING_COMPLETED', metadata: { path: ['bookingId'], equals: booking.id } },
        }), 1);
    });

    test('Feature 23: queue event dispatch runs after commit and failures do not fail the request', async () => {
        const fixture = await makeBookableFixture('feature23-queue-event-failure');
        const booking = await createBooking(fixture);
        const queue = await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: booking.id } });
        let dispatchCalls = 0;
        let sawCommittedState = false;
        const previousQueueDispatcher = app.locals.queueUpdateDispatcher;

        try {
            app.locals.queueUpdateDispatcher = async (barberId: string) => {
                dispatchCalls += 1;
                const [savedQueue, savedNotification] = await Promise.all([
                    prisma.queueEntry.findUniqueOrThrow({ where: { id: queue.id }, select: { status: true } }),
                    prisma.notification.count({
                        where: {
                            userId: fixture.customer.user.id,
                            type: 'BOOKING_STARTED',
                            metadata: { path: ['bookingId'], equals: booking.id },
                        },
                    }),
                ]);
                sawCommittedState = barberId === fixture.barber.barberId && savedQueue.status === QueueStatus.IN_PROGRESS && savedNotification === 1;
                throw new Error('simulated Socket.IO delivery failure');
            };

            const response = await api.patch(`/api/v1/barbers/me/queue/${queue.id}/start`).set('Authorization', `Bearer ${fixture.barber.token}`);
            assert.equal(response.status, 200, response.body?.message);
            assert.equal(response.body.success, true);
            assert.equal(dispatchCalls, 1);
            assert.equal(sawCommittedState, true);
            assert.equal((await prisma.queueEntry.findUniqueOrThrow({ where: { id: queue.id } })).status, QueueStatus.IN_PROGRESS);
        } finally {
            if (previousQueueDispatcher === undefined) {
                delete app.locals.queueUpdateDispatcher;
            } else {
                app.locals.queueUpdateDispatcher = previousQueueDispatcher;
            }
        }
    });

    test('cancellation endpoint dispatches push after commit and preserves success if FCM rejects', async () => {
        const fixture = await makeBookableFixture('feature22-push-failure');
        const booking = await createBooking(fixture);
        let dispatchCalls = 0;
        let sawCommittedChanges = false;
        const dispatcher: typeof dispatchNotificationPushSafely = (userId, payload) =>
            dispatchNotificationPushSafely(userId, payload, async () => {
                dispatchCalls += 1;
                const [savedBooking, savedQueue, savedNotification] = await Promise.all([
                    prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, select: { status: true } }),
                    prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: booking.id }, select: { status: true } }),
                    prisma.notification.count({
                        where: {
                            userId: fixture.customer.user.id,
                            type: 'BOOKING_CANCELLED',
                            metadata: { path: ['bookingId'], equals: booking.id },
                        },
                    }),
                ]);
                sawCommittedChanges = savedBooking.status === BookingStatus.CANCELLED && savedQueue.status === QueueStatus.CANCELLED && savedNotification === 1;
                throw new Error('simulated FCM transport failure');
            });

        const originalDispatcher = app.locals.bookingPushDispatcher;
        try {
            app.locals.bookingPushDispatcher = dispatcher;
            const response = await cancelAsCustomer(fixture.customer.token, booking.id);
            assert.equal(response.status, 200);
            assert.equal(response.body.success, true);
            assert.equal(response.body.message, 'Booking cancelled successfully');
            assert.equal(dispatchCalls, 1);
            assert.equal(sawCommittedChanges, true);
            assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, BookingStatus.CANCELLED);
            assert.equal((await prisma.queueEntry.findUniqueOrThrow({ where: { bookingId: booking.id } })).status, QueueStatus.CANCELLED);
        } finally {
            if (originalDispatcher === undefined) {
                delete app.locals.bookingPushDispatcher;
            } else {
                app.locals.bookingPushDispatcher = originalDispatcher;
            }
        }
    });
});
