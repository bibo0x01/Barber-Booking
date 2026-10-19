import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import request from 'supertest';
import { Role } from '@prisma/client';
import { app } from '../app';
import { prisma } from '../config/database';

const api = request(app);
const createdUserIds: string[] = [];
const runId = randomUUID();

const registerCustomer = async (label: string) => {
    const response = await api.post('/api/v1/auth/register').send({
        name: `${label} Feature 25 Test`,
        email: `${label}.${runId}@feature25-security.example.test`,
        phone: `+155${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
        password: 'TemporaryTestPass123',
    });

    assert.equal(response.status, 201, response.body?.message);
    createdUserIds.push(response.body.data.user.id as string);
    return {
        id: response.body.data.user.id as string,
        token: response.body.data.accessToken as string,
    };
};

after(async () => {
    if (createdUserIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
});

test('a user cannot take over or delete another user device token', async () => {
    const owner = await registerCustomer('owner');
    const otherUser = await registerCustomer('other');
    const admin = await registerCustomer('admin');
    await prisma.user.update({ where: { id: admin.id }, data: { role: Role.ADMIN } });
    const token = `feature25-device-token-${runId}`;

    const adminBarberManagement = await api
        .get('/api/v1/barbers/me/status')
        .set('Authorization', `Bearer ${admin.token}`);
    assert.equal(adminBarberManagement.status, 403);

    const adminCustomerBookings = await api
        .get('/api/v1/bookings/me')
        .set('Authorization', `Bearer ${admin.token}`);
    assert.equal(adminCustomerBookings.status, 403);

    const registered = await api
        .post('/api/v1/notifications/devices')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ token, platform: 'ANDROID' });
    assert.equal(registered.status, 201);

    const attemptedClaim = await api
        .post('/api/v1/notifications/devices')
        .set('Authorization', `Bearer ${otherUser.token}`)
        .send({ token, platform: 'IOS' });
    assert.equal(attemptedClaim.status, 409);
    assert.equal(attemptedClaim.body.success, false);
    assert.equal(JSON.stringify(attemptedClaim.body).includes(token), false);

    const storedToken = await prisma.deviceToken.findUniqueOrThrow({ where: { token }, select: { userId: true } });
    assert.equal(storedToken.userId, owner.id);

    const otherUserTokens = await api
        .get('/api/v1/notifications/devices')
        .set('Authorization', `Bearer ${otherUser.token}`);
    assert.equal(otherUserTokens.status, 200);
    assert.equal(otherUserTokens.body.data.items.length, 0);

    const attemptedDelete = await api
        .delete(`/api/v1/notifications/devices/${registered.body.data.id}`)
        .set('Authorization', `Bearer ${otherUser.token}`);
    assert.equal(attemptedDelete.status, 404);

    const ownerTokens = await api
        .get('/api/v1/notifications/devices')
        .set('Authorization', `Bearer ${owner.token}`);
    assert.equal(ownerTokens.body.data.items.some((item: { token: string }) => item.token === token), true);
});