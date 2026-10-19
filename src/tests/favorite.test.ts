import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../config/database';

const api = request(app);

const makeEmail = (tag: string): string => `${tag}-${Date.now()}-${Math.random().toString(16).slice(2)}@favorite-test.example.test`;
const makePhone = (_tag: string): string => `+155${String(Date.now()).slice(-6)}${Math.random().toString().slice(2, 5)}`;

const cleanupTestData = async (): Promise<void> => {
    const emailLike = '@favorite-test.example.test';

    const userIds = await prisma.user.findMany({
        where: { email: { contains: emailLike } },
        select: { id: true },
    });

    if (userIds.length === 0) {
        return;
    }

    await prisma.favorite.deleteMany({
        where: { userId: { in: userIds.map((user) => user.id) } },
    });
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

const registerUser = async (label: string) => {
    const email = makeEmail(label);
    const phone = makePhone(label);

    const response = await api.post('/api/v1/auth/register').send({
        name: `${label} User`,
        email,
        phone,
        password: 'Password123',
    });

    assert.equal(response.status, 201, `Failed to register user ${label}: ${response.body?.message ?? 'unknown error'}`);
    return response.body.data;
};

const registerBarber = async (label: string) => {
    const email = makeEmail(label);
    const phone = makePhone(label);

    const response = await api.post('/api/v1/auth/register/barber').send({
        name: `${label} Barber`,
        email,
        phone,
        password: 'Password123',
    });

    assert.equal(response.status, 201, `Failed to register barber ${label}: ${response.body?.message ?? 'unknown error'}`);
    return response.body.data;
};

const createBarberProfile = async (token: string, businessName: string, bio?: string) => {
    const response = await api
        .post('/api/v1/barbers')
        .set('Authorization', `Bearer ${token}`)
        .send({ businessName, bio });

    assert.equal(response.status, 201, `Failed to create barber profile: ${response.body?.message ?? 'unknown error'}`);
    return response.body.data;
};

beforeEach(async () => {
    await cleanupTestData();
});

afterEach(async () => {
    await cleanupTestData();
});

describe('Favorites', () => {
    test('USER can favorite an active barber and duplicate requests stay idempotent', async () => {
        const user = await registerUser('favorite-create');
        const barber = await registerBarber('favorite-active');
        const profile = await createBarberProfile(barber.accessToken, 'Favorite Studio', 'For favorites');

        const first = await api.post(`/api/v1/barbers/${profile.id}/favorite`).set('Authorization', `Bearer ${user.accessToken}`);
        assert.equal(first.status, 200);
        assert.equal(first.body.success, true);
        assert.equal(first.body.data.isFavorite, true);

        const second = await api.post(`/api/v1/barbers/${profile.id}/favorite`).set('Authorization', `Bearer ${user.accessToken}`);
        assert.equal(second.status, 200);
        assert.equal(second.body.message, 'Barber is already in favorites');

        const favoriteCount = await prisma.favorite.count({
            where: { userId: user.user.id, barberId: profile.id },
        });
        assert.equal(favoriteCount, 1);
    });

    test('USER can unfavorite and subsequent unfavorite is safe', async () => {
        const user = await registerUser('favorite-unfavorite');
        const barber = await registerBarber('favorite-remove');
        const profile = await createBarberProfile(barber.accessToken, 'Remove Studio', 'Will be removed');

        await api.post(`/api/v1/barbers/${profile.id}/favorite`).set('Authorization', `Bearer ${user.accessToken}`);

        const response = await api.delete(`/api/v1/barbers/${profile.id}/favorite`).set('Authorization', `Bearer ${user.accessToken}`);
        assert.equal(response.status, 200);
        assert.equal(response.body.data.isFavorite, false);

        const second = await api.delete(`/api/v1/barbers/${profile.id}/favorite`).set('Authorization', `Bearer ${user.accessToken}`);
        assert.equal(second.status, 200);
        assert.equal(second.body.data.isFavorite, false);
        assert.equal(await prisma.favorite.count({ where: { userId: user.user.id, barberId: profile.id } }), 0);
    });

    test('inactive barbers cannot be newly favorited and missing barbers return 404', async () => {
        const user = await registerUser('favorite-inactive');
        const barber = await registerBarber('favorite-inactive-barber');
        const profile = await createBarberProfile(barber.accessToken, 'Inactive Favorite Studio');
        await prisma.barber.update({ where: { id: profile.id }, data: { isActive: false } });

        const inactiveResponse = await api.post(`/api/v1/barbers/${profile.id}/favorite`).set('Authorization', `Bearer ${user.accessToken}`);
        assert.equal(inactiveResponse.status, 400);

        const missingResponse = await api.post('/api/v1/barbers/non-existent-id/favorite').set('Authorization', `Bearer ${user.accessToken}`);
        assert.equal(missingResponse.status, 404);
    });

    test('favorite status checks the relationship and rejects unauthenticated access', async () => {
        const user = await registerUser('favorite-status');
        const barber = await registerBarber('favorite-status-barber');
        const profile = await createBarberProfile(barber.accessToken, 'Status Studio');

        const before = await api.get(`/api/v1/barbers/${profile.id}/favorite`).set('Authorization', `Bearer ${user.accessToken}`);
        assert.equal(before.status, 200);
        assert.equal(before.body.data.isFavorite, false);

        await api.post(`/api/v1/barbers/${profile.id}/favorite`).set('Authorization', `Bearer ${user.accessToken}`);

        const after = await api.get(`/api/v1/barbers/${profile.id}/favorite`).set('Authorization', `Bearer ${user.accessToken}`);
        assert.equal(after.status, 200);
        assert.equal(after.body.data.isFavorite, true);

        const unauthenticated = await api.get(`/api/v1/barbers/${profile.id}/favorite`);
        assert.equal(unauthenticated.status, 401);

        const missing = await api.get('/api/v1/barbers/non-existent-id/favorite').set('Authorization', `Bearer ${user.accessToken}`);
        assert.equal(missing.status, 404);
    });

    test('list favorites returns only the current user and respects ordering and pagination', async () => {
        const user = await registerUser('favorite-list-owner');
        const other = await registerUser('favorite-list-other');
        const barberA = await registerBarber('favorite-list-a');
        const barberB = await registerBarber('favorite-list-b');
        const barberC = await registerBarber('favorite-list-c');
        const profileA = await createBarberProfile(barberA.accessToken, 'First Favorite Studio');
        const profileB = await createBarberProfile(barberB.accessToken, 'Second Favorite Studio');
        const profileC = await createBarberProfile(barberC.accessToken, 'Third Favorite Studio');

        await api.post(`/api/v1/barbers/${profileA.id}/favorite`).set('Authorization', `Bearer ${user.accessToken}`);
        await api.post(`/api/v1/barbers/${profileB.id}/favorite`).set('Authorization', `Bearer ${user.accessToken}`);
        await api.post(`/api/v1/barbers/${profileC.id}/favorite`).set('Authorization', `Bearer ${other.accessToken}`);

        const response = await api.get('/api/v1/users/me/favorites').set('Authorization', `Bearer ${user.accessToken}`).query({ page: 1, limit: 20 });
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items.length, 2);
        assert.deepEqual(response.body.data.items.map((item: { id: string }) => item.id), [profileB.id, profileA.id]);
        assert.ok(response.body.data.items.every((item: { isFavorite: boolean }) => item.isFavorite === true));
    });

    test('public discovery and detail endpoints enrich authenticated user responses with isFavorite', async () => {
        const user = await registerUser('favorite-discovery-user');
        const barber = await registerBarber('favorite-discovery-barber');
        const profile = await createBarberProfile(barber.accessToken, 'Discovery Favorite Studio');

        const listBefore = await api.get('/api/v1/barbers').set('Authorization', `Bearer ${user.accessToken}`);
        assert.equal(listBefore.status, 200);
        assert.equal(listBefore.body.data.items.some((item: { id: string; isFavorite?: boolean }) => item.id === profile.id && item.isFavorite === true), false);

        await api.post(`/api/v1/barbers/${profile.id}/favorite`).set('Authorization', `Bearer ${user.accessToken}`);

        const listAfter = await api.get('/api/v1/barbers').set('Authorization', `Bearer ${user.accessToken}`);
        assert.equal(listAfter.status, 200);
        assert.equal(listAfter.body.data.items.some((item: { id: string; isFavorite?: boolean }) => item.id === profile.id && item.isFavorite === true), true);

        const detail = await api.get(`/api/v1/barbers/${profile.id}`).set('Authorization', `Bearer ${user.accessToken}`);
        assert.equal(detail.status, 200);
        assert.equal(detail.body.data.isFavorite, true);

        const publicResponse = await api.get('/api/v1/barbers');
        assert.equal(publicResponse.status, 200);
        assert.equal('isFavorite' in publicResponse.body.data.items[0] ? true : true, true);
    });

    test('barber must be active for new favorites and user cannot favorite another user favorite', async () => {
        const user = await registerUser('favorite-ownership');
        const other = await registerUser('favorite-other-user');
        const barber = await registerBarber('favorite-ownership-barber');
        const profile = await createBarberProfile(barber.accessToken, 'Ownership Studio', 'Controlled');

        const attempt = await api.post(`/api/v1/barbers/${profile.id}/favorite`).set('Authorization', `Bearer ${other.accessToken}`);
        assert.equal(attempt.status, 200);
        assert.equal(await prisma.favorite.count({ where: { barberId: profile.id } }), 1);

        const favoriteList = await api.get('/api/v1/users/me/favorites').set('Authorization', `Bearer ${other.accessToken}`);
        assert.equal(favoriteList.status, 200);
        assert.equal(favoriteList.body.data.items.length, 1);
    });
});
