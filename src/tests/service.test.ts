import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { Role } from '@prisma/client';
import { app } from '../app';
import { prisma } from '../config/database';

const api = request(app);

const makeEmail = (tag: string): string => `${tag}-${Date.now()}-${Math.random().toString(16).slice(2)}@service-test.example.test`;
const makePhone = (_tag: string): string => `+155${String(Date.now()).slice(-6)}${Math.random().toString().slice(2, 5)}`;

const cleanupTestData = async (): Promise<void> => {
    const emailLike = '@service-test.example.test';

    const userIds = await prisma.user.findMany({
        where: { email: { contains: emailLike } },
        select: { id: true },
    });

    if (userIds.length === 0) {
        return;
    }

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
        email,
        phone,
    };
};

const createBarberProfile = async (token: string, businessName = 'Service Test Studio'): Promise<{ id: string }> => {
    const response = await api
        .post('/api/v1/barbers')
        .set('Authorization', `Bearer ${token}`)
        .send({ businessName, bio: 'A barber profile for service tests.' });

    assert.equal(response.status, 201, `Failed to create barber profile: ${response.body?.message ?? 'unknown error'}`);
    return response.body.data;
};

const createService = async (token: string, overrides: Record<string, unknown> = {}) => {
    const response = await api
        .post('/api/v1/barbers/me/services')
        .set('Authorization', `Bearer ${token}`)
        .send({
            name: 'Classic Haircut',
            description: 'Classic fade and finish',
            price: 150,
            durationMinutes: 30,
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

describe('Barber services', () => {
    test('barber can create a service and it defaults to active', async () => {
        const barber = await registerUser(Role.BARBER, 'barber-create-service');
        await createBarberProfile(barber.token, 'Create Service Studio');

        const response = await createService(barber.token);

        assert.equal(response.status, 201);
        assert.equal(response.body.message, 'Service created successfully');
        assert.equal(response.body.data.name, 'Classic Haircut');
        assert.equal(response.body.data.isActive, true);
        assert.equal(response.body.data.price, 150);
        assert.equal(response.body.data.durationMinutes, 30);

        const stored = await prisma.barberService.findUniqueOrThrow({ where: { id: response.body.data.id } });
        assert.equal(stored.isActive, true);
    });

    test('barber only receives own services', async () => {
        const barberA = await registerUser(Role.BARBER, 'barber-own-a');
        const barberB = await registerUser(Role.BARBER, 'barber-own-b');
        await createBarberProfile(barberA.token, 'Own Service A');
        await createBarberProfile(barberB.token, 'Own Service B');

        await createService(barberA.token, { name: 'A Service', price: 100, durationMinutes: 20 });
        await createService(barberB.token, { name: 'B Service', price: 200, durationMinutes: 40 });

        const response = await api.get('/api/v1/barbers/me/services').set('Authorization', `Bearer ${barberA.token}`);

        assert.equal(response.status, 200);
        assert.equal(response.body.data.length, 1);
        assert.equal(response.body.data[0].name, 'A Service');
    });

    test('public endpoint only shows active services from active barbers and hides sensitive fields', async () => {
        const barber = await registerUser(Role.BARBER, 'barber-public');
        await createBarberProfile(barber.token, 'Public Service Studio');
        const profile = await prisma.barber.findUniqueOrThrow({ where: { userId: barber.user.id }, select: { id: true } });

        await createService(barber.token, { name: 'Public Service', price: 120, durationMinutes: 25 });
        const inactive = await createService(barber.token, { name: 'Hidden Service', price: 80, durationMinutes: 15, isActive: false });

        const hiddenServiceResponse = await createService(barber.token, { name: 'Hidden Service', price: 80, durationMinutes: 15 });
        const deactivateResponse = await api
            .patch(`/api/v1/barbers/me/services/${hiddenServiceResponse.body.data.id}`)
            .set('Authorization', `Bearer ${barber.token}`)
            .send({ isActive: false });

        assert.equal(deactivateResponse.status, 200);

        const response = await api.get(`/api/v1/barbers/${profile.id}/services`);

        assert.equal(response.status, 200);
        assert.equal(response.body.data.length, 1);
        assert.equal(response.body.data[0].name, 'Public Service');
        assert.deepEqual(Object.keys(response.body.data[0]).sort(), ['description', 'durationMinutes', 'id', 'name', 'price']);

        await prisma.barber.update({ where: { id: profile.id }, data: { isActive: false } });
        const inactiveResponse = await api.get(`/api/v1/barbers/${profile.id}/services`);
        assert.equal(inactiveResponse.status, 404);

        const missingResponse = await api.get('/api/v1/barbers/cl_test_missing/services');
        assert.equal(missingResponse.status, 404);
    });

    test('validation rejects invalid service payloads', async () => {
        const barber = await registerUser(Role.BARBER, 'barber-validation');
        await createBarberProfile(barber.token, 'Validation Studio');

        const cases = [
            { label: 'missing name', body: { description: 'x', price: 10, durationMinutes: 30 } },
            { label: 'short name', body: { name: 'A', price: 10, durationMinutes: 30 } },
            { label: 'long name', body: { name: 'a'.repeat(101), price: 10, durationMinutes: 30 } },
            { label: 'long description', body: { name: 'Good Name', description: 'x'.repeat(501), price: 10, durationMinutes: 30 } },
            { label: 'negative price', body: { name: 'Good Name', price: -1, durationMinutes: 30 } },
            { label: 'invalid price', body: { name: 'Good Name', price: 'abc', durationMinutes: 30 } },
            { label: 'duration too small', body: { name: 'Good Name', price: 10, durationMinutes: 4 } },
            { label: 'duration too large', body: { name: 'Good Name', price: 10, durationMinutes: 481 } },
        ];

        for (const testCase of cases) {
            const response = await api
                .post('/api/v1/barbers/me/services')
                .set('Authorization', `Bearer ${barber.token}`)
                .send(testCase.body);

            assert.equal(response.status, 400, `${testCase.label} should be rejected`);
        }
    });

    test('auth and role checks apply to management endpoints', async () => {
        const responseNoToken = await api.post('/api/v1/barbers/me/services').send({ name: 'No Token', price: 50, durationMinutes: 25 });
        assert.equal(responseNoToken.status, 401);

        const responseBadToken = await api
            .post('/api/v1/barbers/me/services')
            .set('Authorization', 'Bearer invalid-token')
            .send({ name: 'Bad Token', price: 50, durationMinutes: 25 });
        assert.equal(responseBadToken.status, 401);

        const user = await registerUser(Role.USER, 'service-user');
        const responseUserRole = await api
            .post('/api/v1/barbers/me/services')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ name: 'Forbidden', price: 50, durationMinutes: 25 });
        assert.equal(responseUserRole.status, 403);
    });

    test('barber cannot update or delete another barber service and cannot change barberId', async () => {
        const barberA = await registerUser(Role.BARBER, 'service-owner-a');
        const barberB = await registerUser(Role.BARBER, 'service-owner-b');
        await createBarberProfile(barberA.token, 'A Service Studio');
        await createBarberProfile(barberB.token, 'B Service Studio');

        const serviceResponse = await createService(barberB.token, { name: 'Owned Service', price: 420, durationMinutes: 45 });
        const serviceId = serviceResponse.body.data.id;

        const updateResponse = await api
            .patch(`/api/v1/barbers/me/services/${serviceId}`)
            .set('Authorization', `Bearer ${barberA.token}`)
            .send({ name: 'Hacked' });
        assert.equal(updateResponse.status, 404);

        const deleteResponse = await api
            .delete(`/api/v1/barbers/me/services/${serviceId}`)
            .set('Authorization', `Bearer ${barberA.token}`);
        assert.equal(deleteResponse.status, 404);

        const forgedResponse = await api
            .patch(`/api/v1/barbers/me/services/${serviceId}`)
            .set('Authorization', `Bearer ${barberB.token}`)
            .send({ barberId: 'forged-id' });
        assert.equal(forgedResponse.status, 400);
    });

    test('barber can update and reactivate a service', async () => {
        const barber = await registerUser(Role.BARBER, 'service-update');
        await createBarberProfile(barber.token, 'Update Studio');

        const created = await createService(barber.token, { name: 'Old Name', description: 'Old description', price: 100, durationMinutes: 20 });
        const serviceId = created.body.data.id;

        const updateResponse = await api
            .patch(`/api/v1/barbers/me/services/${serviceId}`)
            .set('Authorization', `Bearer ${barber.token}`)
            .send({ name: 'New Name', description: 'New description', price: 175, durationMinutes: 45, isActive: false });

        assert.equal(updateResponse.status, 200);
        assert.equal(updateResponse.body.data.name, 'New Name');
        assert.equal(updateResponse.body.data.isActive, false);

        const reactivateResponse = await api
            .patch(`/api/v1/barbers/me/services/${serviceId}`)
            .set('Authorization', `Bearer ${barber.token}`)
            .send({ isActive: true });

        assert.equal(reactivateResponse.status, 200);
        assert.equal(reactivateResponse.body.data.isActive, true);
    });

    test('delete deactivates the service without removing the database row', async () => {
        const barber = await registerUser(Role.BARBER, 'service-delete');
        await createBarberProfile(barber.token, 'Delete Studio');

        const created = await createService(barber.token, { name: 'Delete Me', price: 99, durationMinutes: 35 });
        const serviceId = created.body.data.id;

        const response = await api.delete(`/api/v1/barbers/me/services/${serviceId}`).set('Authorization', `Bearer ${barber.token}`);
        assert.equal(response.status, 200);
        assert.equal(response.body.message, 'Service deactivated successfully');

        const persisted = await prisma.barberService.findUniqueOrThrow({ where: { id: serviceId } });
        assert.equal(persisted.isActive, false);
    });

    test('empty patch is rejected', async () => {
        const barber = await registerUser(Role.BARBER, 'service-empty-patch');
        await createBarberProfile(barber.token, 'Empty Patch Studio');

        const created = await createService(barber.token, { name: 'Patch Me', price: 75, durationMinutes: 30 });

        const response = await api
            .patch(`/api/v1/barbers/me/services/${created.body.data.id}`)
            .set('Authorization', `Bearer ${barber.token}`)
            .send({});

        assert.equal(response.status, 400);
    });
});
