import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../config/database';

const api = request(app);
const runId = randomUUID();
const createdUserIds: string[] = [];
const password = 'OriginalTestPassword123';

const register = async (role: 'user' | 'barber', label: string) => {
    const response = await api
        .post(role === 'barber' ? '/api/v1/auth/register/barber' : '/api/v1/auth/register')
        .send({
            name: `${label} Feature 25`,
            email: `${label}.${runId}@feature25-http.example.test`,
            phone: `+1${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`,
            password,
        });

    assert.equal(response.status, 201, response.body?.message);
    createdUserIds.push(response.body.data.user.id as string);
    return {
        id: response.body.data.user.id as string,
        email: response.body.data.user.email as string,
        token: response.body.data.accessToken as string,
    };
};

after(async () => {
    if (createdUserIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
});

test('login and /auth/me return only the safe authenticated-user fields', async () => {
    const user = await register('user', 'auth-contract');

    const login = await api.post('/api/v1/auth/login').send({ email: user.email, password });
    assert.equal(login.status, 200);
    assert.equal(login.body.success, true);
    assert.equal(login.body.data.user.id, user.id);
    assert.deepEqual(Object.keys(login.body.data.user).sort(), ['email', 'id', 'name', 'phone', 'role']);
    assert.equal(typeof login.body.data.accessToken, 'string');
    assert.equal(JSON.stringify(login.body).includes('passwordHash'), false);

    const me = await api.get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.data.accessToken}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.success, true);
    assert.deepEqual(Object.keys(me.body.data).sort(), ['email', 'id', 'name', 'phone', 'role']);
    assert.equal(me.body.data.id, user.id);
    assert.equal(JSON.stringify(me.body).includes('passwordHash'), false);

    const missingCredentials = await api.get('/api/v1/auth/me');
    assert.equal(missingCredentials.status, 401);

    const invalidCredentials = await api.post('/api/v1/auth/login').send({ email: user.email, password: 'incorrect-password' });
    assert.equal(invalidCredentials.status, 401);
    assert.equal(invalidCredentials.body.message, 'Invalid email or password');
});

test('profile and password updates are identity-bound and serialize no credential material', async () => {
    const user = await register('user', 'user-contract');

    const profileUpdate = await api
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: 'Updated Feature User', avatarUrl: 'https://example.test/avatar.png' });
    assert.equal(profileUpdate.status, 200);
    assert.equal(profileUpdate.body.success, true);
    assert.equal(profileUpdate.body.data.id, user.id);
    assert.equal(profileUpdate.body.data.name, 'Updated Feature User');
    assert.deepEqual(Object.keys(profileUpdate.body.data).sort(), ['avatarUrl', 'email', 'id', 'name', 'phone', 'role']);
    assert.equal(JSON.stringify(profileUpdate.body).includes('passwordHash'), false);

    const forgedRole = await api
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ role: 'ADMIN', name: 'Must Not Apply' });
    assert.equal(forgedRole.status, 400);
    const stillUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { role: true, name: true } });
    assert.equal(stillUser.role, 'USER');
    assert.equal(stillUser.name, 'Updated Feature User');

    const badCurrentPassword = await api
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentPassword: 'incorrect-password', newPassword: 'ReplacementTestPassword456' });
    assert.equal(badCurrentPassword.status, 401);

    const passwordUpdate = await api
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentPassword: password, newPassword: 'ReplacementTestPassword456' });
    assert.equal(passwordUpdate.status, 200);
    assert.deepEqual(passwordUpdate.body, { success: true, message: 'Password changed successfully', data: null });

    const oldPasswordLogin = await api.post('/api/v1/auth/login').send({ email: user.email, password });
    assert.equal(oldPasswordLogin.status, 401);
    const newPasswordLogin = await api
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'ReplacementTestPassword456' });
    assert.equal(newPasswordLogin.status, 200);
    assert.equal(newPasswordLogin.body.data.user.id, user.id);
    assert.equal(JSON.stringify(newPasswordLogin.body).includes('passwordHash'), false);
});

test('public barber endpoints support anonymous, USER, and BARBER optional-auth behavior', async () => {
    const customer = await register('user', 'optional-auth-customer');
    const barber = await register('barber', 'optional-auth-barber');
    const profile = await api
        .post('/api/v1/barbers')
        .set('Authorization', `Bearer ${barber.token}`)
        .send({ businessName: 'Feature 25 Public Barber', bio: 'Public profile serialization check' });
    assert.equal(profile.status, 201);
    const barberId = profile.body.data.id as string;

    const anonymous = await api.get(`/api/v1/barbers/${barberId}/profile`);
    assert.equal(anonymous.status, 200);
    assert.equal(anonymous.body.success, true);
    assert.equal(anonymous.body.data.isFavorite, undefined);
    assert.equal(JSON.stringify(anonymous.body).includes('passwordHash'), false);
    assert.equal(JSON.stringify(anonymous.body).includes(customer.email), false);
    assert.equal(JSON.stringify(anonymous.body).includes(barber.email), false);

    const favorite = await api
        .post(`/api/v1/barbers/${barberId}/favorite`)
        .set('Authorization', `Bearer ${customer.token}`);
    assert.equal(favorite.status, 200);

    const authenticatedUserProfile = await api
        .get(`/api/v1/barbers/${barberId}/profile`)
        .set('Authorization', `Bearer ${customer.token}`);
    assert.equal(authenticatedUserProfile.status, 200);
    assert.equal(authenticatedUserProfile.body.data.isFavorite, true);
    assert.deepEqual(Object.keys(authenticatedUserProfile.body.data).sort(), [
        'bio', 'businessName', 'id', 'isFavorite', 'isOpen', 'isVerified', 'location',
    ]);

    const authenticatedBarberProfile = await api
        .get(`/api/v1/barbers/${barberId}/profile`)
        .set('Authorization', `Bearer ${barber.token}`);
    assert.equal(authenticatedBarberProfile.status, 200);
    assert.equal(authenticatedBarberProfile.body.data.isFavorite, undefined);

    const details = await api.get(`/api/v1/barbers/${barberId}`);
    assert.equal(details.status, 200);
    assert.equal(details.body.data.businessName, 'Feature 25 Public Barber');
    assert.equal(details.body.data.userId, undefined);
    assert.equal(details.body.data.email, undefined);
    assert.equal(details.body.data.passwordHash, undefined);
    assert.equal(JSON.stringify(details.body).includes('passwordHash'), false);
});