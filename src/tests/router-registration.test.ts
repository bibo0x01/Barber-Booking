import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import { app } from '../app';

const api = request(app);

describe('API router registration', () => {
    test('public barber discovery, profile, and child resources reach their handlers', async () => {
        const discovery = await api.get('/api/v1/barbers');
        assert.equal(discovery.status, 200);
        assert.equal(discovery.body.message, 'Barbers retrieved successfully');

        const profile = await api.get('/api/v1/barbers/route-test-missing/profile');
        const details = await api.get('/api/v1/barbers/route-test-missing');
        assert.equal(profile.status, 404);
        assert.equal(profile.body.message, 'Barber not found');
        assert.equal(details.status, 404);
        assert.equal(details.body.message, 'Barber not found');

        const publicResourceRequests = [
            () => api.get('/api/v1/barbers/route-test-missing/gallery'),
            () => api.get('/api/v1/barbers/route-test-missing/services'),
            () => api.get('/api/v1/barbers/route-test-missing/working-hours'),
            () => api.get('/api/v1/barbers/route-test-missing/location'),
        ];
        for (const send of publicResourceRequests) {
            const response = await send();
            assert.equal(response.status, 404);
            assert.equal(/^Route not found:/.test(response.body.message), false);
        }
    });

    test('mounted management and lifecycle routers preserve authentication and role checks', async () => {
        const protectedRoutes = [
            () => api.get('/api/v1/barbers/me/status'),
            () => api.get('/api/v1/barbers/me'),
            () => api.patch('/api/v1/barbers/me/status').send({ isOpen: true }),
            () => api.get('/api/v1/barbers/me/gallery'),
            () => api.get('/api/v1/barbers/me/services'),
            () => api.get('/api/v1/barbers/me/working-hours'),
            () => api.get('/api/v1/barbers/me/location'),
            () => api.get('/api/v1/bookings/me'),
            () => api.get('/api/v1/barbers/me/bookings'),
            () => api.get('/api/v1/notifications'),
            () => api.get('/api/v1/users/me/favorites'),
            () => api.get('/api/v1/barbers/route-test-missing/favorite'),
        ];

        for (const send of protectedRoutes) {
            const response = await send();
            assert.equal(response.status, 401, response.body?.message);
            assert.equal(/^Route not found:/.test(response.body.message), false);
        }
    });

    test('mounted discovery retains query validation', async () => {
        const response = await api.get('/api/v1/barbers?unsupported=true');
        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'Validation failed');
    });
});
