import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { Role } from '@prisma/client';
import { app } from '../app';
import { prisma } from '../config/database';

const api = request(app);

const makeEmail = (tag: string): string => `${tag}-${Date.now()}-${Math.random().toString(16).slice(2)}@status-test.example.test`;
const makePhone = (_tag: string): string => `+155${String(Date.now()).slice(-6)}${Math.random().toString().slice(2, 5)}`;

const cleanupTestData = async (): Promise<void> => {
    const emailLike = '@status-test.example.test';

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
    await prisma.barberService.deleteMany({
        where: { barber: { user: { id: { in: userIds.map((user) => user.id) } } } },
    });
    await prisma.barberImage.deleteMany({
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
    };
};

const createBarberProfile = async (token: string, businessName = 'Status Studio') => {
    const response = await api
        .post('/api/v1/barbers')
        .set('Authorization', `Bearer ${token}`)
        .send({ businessName, bio: 'A barber profile for status tests.' });

    assert.equal(response.status, 201, `Failed to create barber profile: ${response.body?.message ?? 'unknown error'}`);
    return response.body.data;
};

beforeEach(async () => {
    await cleanupTestData();
});

afterEach(async () => {
    await cleanupTestData();
});

describe('Barber open/closed status', () => {
    test('barber can retrieve own status and default value is false', async () => {
        const barber = await registerUser(Role.BARBER, 'status-default');
        await createBarberProfile(barber.token, 'Default Status Studio');

        const response = await api.get('/api/v1/barbers/me/status').set('Authorization', `Bearer ${barber.token}`);

        assert.equal(response.status, 200);
        assert.deepEqual(response.body.data, { isOpen: false });
        assert.equal(response.body.message, 'Barber status retrieved successfully');
    });

    test('no token, invalid token, and user role are rejected for own status', async () => {
        const noToken = await api.get('/api/v1/barbers/me/status');
        assert.equal(noToken.status, 401);

        const badToken = await api.get('/api/v1/barbers/me/status').set('Authorization', 'Bearer invalid-token');
        assert.equal(badToken.status, 401);

        const user = await registerUser(Role.USER, 'status-user');
        const userRole = await api.get('/api/v1/barbers/me/status').set('Authorization', `Bearer ${user.token}`);
        assert.equal(userRole.status, 403);
    });

    test('barber can open and close their own status', async () => {
        const barber = await registerUser(Role.BARBER, 'status-toggle');
        await createBarberProfile(barber.token, 'Toggle Status Studio');

        const openResponse = await api
            .patch('/api/v1/barbers/me/status')
            .set('Authorization', `Bearer ${barber.token}`)
            .send({ isOpen: true });

        assert.equal(openResponse.status, 200);
        assert.deepEqual(openResponse.body.data, { isOpen: true });

        const closeResponse = await api
            .patch('/api/v1/barbers/me/status')
            .set('Authorization', `Bearer ${barber.token}`)
            .send({ isOpen: false });

        assert.equal(closeResponse.status, 200);
        assert.deepEqual(closeResponse.body.data, { isOpen: false });
    });

    test('update to the same value succeeds and validation rejects invalid payloads', async () => {
        const barber = await registerUser(Role.BARBER, 'status-same');
        await createBarberProfile(barber.token, 'Same Value Studio');

        const sameValue = await api
            .patch('/api/v1/barbers/me/status')
            .set('Authorization', `Bearer ${barber.token}`)
            .send({ isOpen: false });
        assert.equal(sameValue.status, 200);

        const missing = await api
            .patch('/api/v1/barbers/me/status')
            .set('Authorization', `Bearer ${barber.token}`)
            .send({});
        assert.equal(missing.status, 400);

        const stringTrue = await api
            .patch('/api/v1/barbers/me/status')
            .set('Authorization', `Bearer ${barber.token}`)
            .send({ isOpen: 'true' });
        assert.equal(stringTrue.status, 400);

        const stringFalse = await api
            .patch('/api/v1/barbers/me/status')
            .set('Authorization', `Bearer ${barber.token}`)
            .send({ isOpen: 'false' });
        assert.equal(stringFalse.status, 400);

        const numberValue = await api
            .patch('/api/v1/barbers/me/status')
            .set('Authorization', `Bearer ${barber.token}`)
            .send({ isOpen: 1 });
        assert.equal(numberValue.status, 400);

        const nullValue = await api
            .patch('/api/v1/barbers/me/status')
            .set('Authorization', `Bearer ${barber.token}`)
            .send({ isOpen: null });
        assert.equal(nullValue.status, 400);
    });

    test('barber cannot manipulate another barber status and missing barber profile returns 404', async () => {
        const barberA = await registerUser(Role.BARBER, 'status-owner-a');
        const barberB = await registerUser(Role.BARBER, 'status-owner-b');
        await createBarberProfile(barberA.token, 'Barber A Status');
        await createBarberProfile(barberB.token, 'Barber B Status');

        const foreign = await api
            .patch('/api/v1/barbers/me/status')
            .set('Authorization', `Bearer ${barberA.token}`)
            .send({ isOpen: true });

        assert.equal(foreign.status, 200);
        const barberBRecord = await prisma.barber.findUniqueOrThrow({ where: { userId: barberB.user.id }, select: { id: true, isOpen: true } });
        assert.equal(barberBRecord.isOpen, false);

        const missingBarber = await registerUser(Role.BARBER, 'status-missing');
        const missingProfile = await prisma.barber.findUnique({ where: { userId: missingBarber.user.id } });
        assert.equal(missingProfile, null);

        const missingStatus = await api.get('/api/v1/barbers/me/status').set('Authorization', `Bearer ${missingBarber.token}`);
        assert.equal(missingStatus.status, 404);
    });

    test('public profile includes isOpen for active barbers and hides private fields', async () => {
        const barber = await registerUser(Role.BARBER, 'status-public');
        await createBarberProfile(barber.token, 'Public Status Studio');
        const barberRecord = await prisma.barber.findUniqueOrThrow({ where: { userId: barber.user.id }, select: { id: true } });

        await api.patch('/api/v1/barbers/me/status').set('Authorization', `Bearer ${barber.token}`).send({ isOpen: true });

        const publicResponse = await api.get(`/api/v1/barbers/${barberRecord.id}/profile`);
        assert.equal(publicResponse.status, 200);
        assert.equal(publicResponse.body.data.isOpen, true);
        assert.equal(publicResponse.body.data.businessName, 'Public Status Studio');
        assert.deepEqual(Object.keys(publicResponse.body.data).sort(), ['bio', 'businessName', 'id', 'isOpen', 'isVerified', 'location']);
        assert.equal(publicResponse.body.data.location, null);

        await prisma.barber.update({ where: { id: barberRecord.id }, data: { isActive: false } });
        const inactiveResponse = await api.get(`/api/v1/barbers/${barberRecord.id}/profile`);
        assert.equal(inactiveResponse.status, 404);
    });

    test('public profile requires no authentication and returns 404 for nonexistent barber', async () => {
        const response = await api.get('/api/v1/barbers/cl_not_real/profile');
        assert.equal(response.status, 404);
    });
});
