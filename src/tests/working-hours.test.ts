import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { Role } from '@prisma/client';
import { app } from '../app';
import { prisma } from '../config/database';

const api = request(app);

const makeEmail = (tag: string): string => `${tag}-${Date.now()}-${Math.random().toString(16).slice(2)}@hours-test.example.test`;
const makePhone = (_tag: string): string => `+155${String(Date.now()).slice(-6)}${Math.random().toString().slice(2, 5)}`;

const cleanupTestData = async (): Promise<void> => {
    const emailLike = '@hours-test.example.test';

    const userIds = await prisma.user.findMany({
        where: { email: { contains: emailLike } },
        select: { id: true },
    });

    if (userIds.length === 0) {
        return;
    }

    await prisma.barberWorkingHour.deleteMany({
        where: { barber: { user: { id: { in: userIds.map((user) => user.id) } } } },
    });
    await prisma.barber.deleteMany({ where: { userId: { in: userIds.map((user) => user.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.map((user) => user.id) } } });
};

const registerUser = async (role: Role, label: string) => {
    const email = makeEmail(label);
    const phone = makePhone(label);

    const response = await api
        .post(role === Role.BARBER ? '/api/v1/auth/register/barber' : '/api/v1/auth/register')
        .send({
            name: `${label} User`,
            email,
            phone,
            password: 'Password123',
        });

    assert.equal(response.status, 201, `Failed to register ${label}: ${response.body?.message ?? 'unknown error'}`);

    return {
        token: response.body.data.accessToken,
        user: response.body.data.user,
        email,
        phone,
    };
};

const createBarberProfile = async (token: string, businessName = 'Hours Test Studio') => {
    const response = await api
        .post('/api/v1/barbers')
        .set('Authorization', `Bearer ${token}`)
        .send({ businessName, bio: 'A barber profile for working-hours tests.' });

    assert.equal(response.status, 201, `Failed to create barber profile: ${response.body?.message ?? 'unknown error'}`);
    return response.body.data;
};

const createWorkingHour = async (token: string, overrides: Record<string, unknown> = {}) => {
    const response = await api
        .post('/api/v1/barbers/me/working-hours')
        .set('Authorization', `Bearer ${token}`)
        .send({
            dayOfWeek: 6,
            openTime: '10:00',
            closeTime: '22:00',
            ...overrides,
        });

    return response;
};

beforeEach(async () => {
    await cleanupTestData();
});

afterEach(async () => {
    await cleanupTestData();
});

describe('Barber working hours', () => {
    test('barber can create a working hour and it belongs to the current barber', async () => {
        const barber = await registerUser(Role.BARBER, 'barber-hours-create');
        await createBarberProfile(barber.token, 'Create Hours Studio');

        const response = await createWorkingHour(barber.token, { dayOfWeek: 6, openTime: '10:00', closeTime: '22:00' });

        assert.equal(response.status, 201);
        assert.equal(response.body.message, 'Working hour created successfully');
        assert.equal(response.body.data.dayOfWeek, 6);
        assert.equal(response.body.data.openTime, '10:00');
        assert.equal(response.body.data.closeTime, '22:00');

        const record = await prisma.barberWorkingHour.findFirstOrThrow({
            where: { barber: { userId: barber.user.id }, dayOfWeek: 6 },
        });

        assert.equal(record.barberId, (await prisma.barber.findUniqueOrThrow({ where: { userId: barber.user.id }, select: { id: true } })).id);
    });

    test('duplicate weekday returns a conflict', async () => {
        const barber = await registerUser(Role.BARBER, 'barber-hours-duplicate');
        await createBarberProfile(barber.token, 'Duplicate Hours Studio');

        const first = await createWorkingHour(barber.token, { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00' });
        assert.equal(first.status, 201);

        const second = await createWorkingHour(barber.token, { dayOfWeek: 1, openTime: '10:00', closeTime: '18:00' });
        assert.equal(second.status, 409);
    });

    test('validation rejects invalid day values and time ranges', async () => {
        const barber = await registerUser(Role.BARBER, 'barber-hours-valid');
        await createBarberProfile(barber.token, 'Validation Hours Studio');

        const invalidDays = [
            { dayOfWeek: -1 },
            { dayOfWeek: 7 },
            { dayOfWeek: 'bad' },
        ];

        for (const body of invalidDays) {
            const response = await api
                .post('/api/v1/barbers/me/working-hours')
                .set('Authorization', `Bearer ${barber.token}`)
                .send({ ...body, openTime: '09:00', closeTime: '17:00' });

            assert.equal(response.status, 400, `${JSON.stringify(body)} should fail`);
        }

        const invalidTimes = [
            { openTime: '9:00', closeTime: '17:00' },
            { openTime: '09:00', closeTime: '25:00' },
            { openTime: '09:00', closeTime: '09:00' },
            { openTime: '17:00', closeTime: '09:00' },
            { openTime: '22:00', closeTime: '02:00' },
        ];

        for (const body of invalidTimes) {
            const response = await api
                .post('/api/v1/barbers/me/working-hours')
                .set('Authorization', `Bearer ${barber.token}`)
                .send({ dayOfWeek: 2, ...body });

            assert.equal(response.status, 400, `${JSON.stringify(body)} should fail`);
        }
    });

    test('auth and role checks apply to working-hours management', async () => {
        const responseNoToken = await api.post('/api/v1/barbers/me/working-hours').send({ dayOfWeek: 0, openTime: '09:00', closeTime: '17:00' });
        assert.equal(responseNoToken.status, 401);

        const responseBadToken = await api
            .post('/api/v1/barbers/me/working-hours')
            .set('Authorization', 'Bearer invalid-token')
            .send({ dayOfWeek: 0, openTime: '09:00', closeTime: '17:00' });
        assert.equal(responseBadToken.status, 401);

        const user = await registerUser(Role.USER, 'hours-user');
        const responseRole = await api
            .post('/api/v1/barbers/me/working-hours')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ dayOfWeek: 0, openTime: '09:00', closeTime: '17:00' });
        assert.equal(responseRole.status, 403);
    });

    test('barber only gets their own working hours in weekday order', async () => {
        const barberA = await registerUser(Role.BARBER, 'hours-owner-a');
        const barberB = await registerUser(Role.BARBER, 'hours-owner-b');
        await createBarberProfile(barberA.token, 'A Hours Studio');
        await createBarberProfile(barberB.token, 'B Hours Studio');

        await createWorkingHour(barberA.token, { dayOfWeek: 6, openTime: '10:00', closeTime: '18:00' });
        await createWorkingHour(barberA.token, { dayOfWeek: 2, openTime: '08:00', closeTime: '16:00' });
        await createWorkingHour(barberB.token, { dayOfWeek: 5, openTime: '11:00', closeTime: '19:00' });

        const response = await api.get('/api/v1/barbers/me/working-hours').set('Authorization', `Bearer ${barberA.token}`);

        assert.equal(response.status, 200);
        assert.equal(response.body.data.length, 2);
        assert.deepEqual(response.body.data.map((item: { dayOfWeek: number }) => item.dayOfWeek), [2, 6]);
    });

    test('public schedule works for active barber and hides private fields', async () => {
        const barber = await registerUser(Role.BARBER, 'hours-public');
        await createBarberProfile(barber.token, 'Public Hours Studio');

        const profile = await prisma.barber.findUniqueOrThrow({ where: { userId: barber.user.id }, select: { id: true } });
        await createWorkingHour(barber.token, { dayOfWeek: 4, openTime: '09:00', closeTime: '18:00' });

        const response = await api.get(`/api/v1/barbers/${profile.id}/working-hours`);
        assert.equal(response.status, 200);
        assert.equal(response.body.data.length, 1);
        assert.deepEqual(Object.keys(response.body.data[0]).sort(), ['closeTime', 'dayOfWeek', 'isActive', 'openTime']);

        const inactiveBarber = await prisma.barber.update({ where: { id: profile.id }, data: { isActive: false } });
        const inactiveResponse = await api.get(`/api/v1/barbers/${inactiveBarber.id}/working-hours`);
        assert.equal(inactiveResponse.status, 404);

        const missingResponse = await api.get('/api/v1/barbers/cl_invalid_id/working-hours');
        assert.equal(missingResponse.status, 404);
    });

    test('barber can update own record and cannot update another barber record', async () => {
        const barberA = await registerUser(Role.BARBER, 'hours-update-a');
        const barberB = await registerUser(Role.BARBER, 'hours-update-b');
        await createBarberProfile(barberA.token, 'Update A Hours');
        await createBarberProfile(barberB.token, 'Update B Hours');

        const created = await createWorkingHour(barberA.token, { dayOfWeek: 0, openTime: '10:00', closeTime: '18:00' });
        const serviceId = created.body.data.id;

        const updateResponse = await api
            .patch(`/api/v1/barbers/me/working-hours/${serviceId}`)
            .set('Authorization', `Bearer ${barberA.token}`)
            .send({ openTime: '11:00', closeTime: '19:00' });
        assert.equal(updateResponse.status, 200);
        assert.equal(updateResponse.body.data.openTime, '11:00');

        const foreignResponse = await api
            .patch(`/api/v1/barbers/me/working-hours/${serviceId}`)
            .set('Authorization', `Bearer ${barberB.token}`)
            .send({ openTime: '12:00' });
        assert.equal(foreignResponse.status, 404);
    });

    test('updating weekday to a duplicate value or invalid time range is rejected', async () => {
        const barber = await registerUser(Role.BARBER, 'hours-update-invalid');
        await createBarberProfile(barber.token, 'Invalid Update Hours');

        const first = await createWorkingHour(barber.token, { dayOfWeek: 3, openTime: '09:00', closeTime: '17:00' });
        const second = await createWorkingHour(barber.token, { dayOfWeek: 5, openTime: '10:00', closeTime: '18:00' });

        const duplicateResponse = await api
            .patch(`/api/v1/barbers/me/working-hours/${second.body.data.id}`)
            .set('Authorization', `Bearer ${barber.token}`)
            .send({ dayOfWeek: 3 });
        assert.equal(duplicateResponse.status, 409);

        const invalidRangeResponse = await api
            .patch(`/api/v1/barbers/me/working-hours/${second.body.data.id}`)
            .set('Authorization', `Bearer ${barber.token}`)
            .send({ openTime: '18:00', closeTime: '10:00' });
        assert.equal(invalidRangeResponse.status, 400);
    });

    test('delete deactivates the working hour without physically removing it', async () => {
        const barber = await registerUser(Role.BARBER, 'hours-delete');
        await createBarberProfile(barber.token, 'Delete Hours Studio');

        const created = await createWorkingHour(barber.token, { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00' });
        const response = await api.delete(`/api/v1/barbers/me/working-hours/${created.body.data.id}`).set('Authorization', `Bearer ${barber.token}`);

        assert.equal(response.status, 200);
        assert.equal(response.body.message, 'Working hour deactivated successfully');

        const persisted = await prisma.barberWorkingHour.findUniqueOrThrow({ where: { id: created.body.data.id } });
        assert.equal(persisted.isActive, false);

        const publicResponse = await api.get(`/api/v1/barbers/${(await prisma.barber.findUniqueOrThrow({ where: { userId: barber.user.id }, select: { id: true } })).id}/working-hours`);
        assert.equal(publicResponse.status, 200);
        assert.deepEqual(publicResponse.body.data, []);
    });
});
