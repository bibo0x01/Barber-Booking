import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../config/database';

const api = request(app);
const locationEmailDomain = '@location-test.example.test';
const uniqueTag = (tag: string): string => `${tag}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const makeEmail = (tag: string): string => `${tag}-${Date.now()}-${Math.random().toString(16).slice(2)}${locationEmailDomain}`;
const makePhone = (): string => `+155${String(Date.now()).slice(-6)}${Math.random().toString().slice(2, 5)}`;

const cleanupTestData = async (): Promise<void> => {
    const users = await prisma.user.findMany({
        where: { email: { contains: locationEmailDomain } },
        select: { id: true },
    });
    const userIds = users.map((user) => user.id);

    if (userIds.length === 0) {
        return;
    }

    await prisma.barberWorkingHour.deleteMany({ where: { barber: { userId: { in: userIds } } } });
    await prisma.barberService.deleteMany({ where: { barber: { userId: { in: userIds } } } });
    await prisma.barberImage.deleteMany({ where: { barber: { userId: { in: userIds } } } });
    await prisma.barber.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
};

const registerAccount = async (role: 'barber' | 'user', tag: string) => {
    const endpoint = role === 'barber' ? '/api/v1/auth/register/barber' : '/api/v1/auth/register';
    const response = await api.post(endpoint).send({
        name: `${tag} Account`,
        email: makeEmail(tag),
        phone: makePhone(),
        password: 'Password123',
    });

    assert.equal(response.status, 201, `Failed to register ${role}: ${response.body?.message ?? 'unknown error'}`);
    return response.body.data as { accessToken: string };
};

const createBarber = async (tag: string) => {
    const account = await registerAccount('barber', tag);
    const response = await api
        .post('/api/v1/barbers')
        .set('Authorization', `Bearer ${account.accessToken}`)
        .send({ businessName: `${tag} Studio` });

    assert.equal(response.status, 201, `Failed to create barber profile: ${response.body?.message ?? 'unknown error'}`);
    return { ...account, profile: response.body.data as { id: string; businessName: string } };
};

const locationPayload = (overrides: Record<string, unknown> = {}) => ({
    latitude: 30.0444,
    longitude: 31.2357,
    ...overrides,
});

const putLocation = (token: string, payload: Record<string, unknown>) =>
    api.put('/api/v1/barbers/me/location').set('Authorization', `Bearer ${token}`).send(payload);

const createLocation = async (token: string, payload: Record<string, unknown> = locationPayload()) => {
    const response = await putLocation(token, payload);
    assert.equal(response.status, 200, `Failed to save location: ${response.body?.message ?? 'unknown error'}`);
    return response.body.data;
};

beforeEach(cleanupTestData);
afterEach(cleanupTestData);

describe('Barber location', () => {
    test('barber creates a location with numeric coordinates', async () => {
        const barber = await createBarber('location-create');
        const response = await putLocation(barber.accessToken, locationPayload({ address: 'Cairo, Egypt' }));

        assert.equal(response.status, 200);
        assert.equal(response.body.message, 'Location updated successfully');
        assert.equal(response.body.data.latitude, 30.0444);
        assert.equal(response.body.data.longitude, 31.2357);
        assert.equal(response.body.data.address, 'Cairo, Egypt');
        assert.ok(response.body.data.id);
        assert.ok(response.body.data.createdAt);
        assert.ok(response.body.data.updatedAt);
        assert.equal(response.body.data.barberId, undefined);
    });

    test('barber can update their existing location', async () => {
        const barber = await createBarber('location-update');
        const first = await createLocation(barber.accessToken);
        const response = await putLocation(barber.accessToken, locationPayload({ latitude: -33.8688, address: 'Sydney' }));

        assert.equal(response.status, 200);
        assert.equal(response.body.data.id, first.id);
        assert.equal(response.body.data.latitude, -33.8688);
        assert.equal(response.body.data.address, 'Sydney');
    });

    test('repeated PUT requests do not create duplicate locations', async () => {
        const barber = await createBarber('location-upsert');
        await createLocation(barber.accessToken);
        await createLocation(barber.accessToken, locationPayload({ longitude: 44.3661 }));

        assert.equal(await prisma.barberLocation.count({ where: { barberId: barber.profile.id } }), 1);
    });

    test('barber can fetch their own location', async () => {
        const barber = await createBarber('location-own-get');
        await createLocation(barber.accessToken, locationPayload({ address: 'Own location' }));

        const response = await api.get('/api/v1/barbers/me/location').set('Authorization', `Bearer ${barber.accessToken}`);
        assert.equal(response.status, 200);
        assert.equal(response.body.message, 'Location fetched successfully');
        assert.equal(response.body.data.address, 'Own location');
        assert.equal(response.body.data.latitude, 30.0444);
    });

    test('getting own location before creating one returns not found', async () => {
        const barber = await createBarber('location-own-missing');
        const response = await api.get('/api/v1/barbers/me/location').set('Authorization', `Bearer ${barber.accessToken}`);

        assert.equal(response.status, 404);
    });

    test('USER cannot create or update a barber location', async () => {
        const user = await registerAccount('user', 'location-user-write');
        const response = await putLocation(user.accessToken, locationPayload());

        assert.equal(response.status, 403);
    });

    test('USER cannot read the own-barber location endpoint', async () => {
        const user = await registerAccount('user', 'location-user-read');
        const response = await api.get('/api/v1/barbers/me/location').set('Authorization', `Bearer ${user.accessToken}`);

        assert.equal(response.status, 403);
    });

    test('unauthenticated own-location requests are rejected', async () => {
        const response = await api.get('/api/v1/barbers/me/location');
        assert.equal(response.status, 401);
    });

    test('latitude above 90 is rejected', async () => {
        const barber = await createBarber('location-lat-high');
        assert.equal((await putLocation(barber.accessToken, locationPayload({ latitude: 90.0001 }))).status, 400);
    });

    test('latitude below -90 is rejected', async () => {
        const barber = await createBarber('location-lat-low');
        assert.equal((await putLocation(barber.accessToken, locationPayload({ latitude: -90.0001 }))).status, 400);
    });

    test('longitude above 180 is rejected', async () => {
        const barber = await createBarber('location-lon-high');
        assert.equal((await putLocation(barber.accessToken, locationPayload({ longitude: 180.0001 }))).status, 400);
    });

    test('longitude below -180 is rejected', async () => {
        const barber = await createBarber('location-lon-low');
        assert.equal((await putLocation(barber.accessToken, locationPayload({ longitude: -180.0001 }))).status, 400);
    });

    test('non-numeric latitude and longitude are rejected', async () => {
        const barber = await createBarber('location-nonnumeric');
        const latitude = await putLocation(barber.accessToken, locationPayload({ latitude: 'NaN' }));
        const longitude = await putLocation(barber.accessToken, locationPayload({ longitude: '31.2' }));

        assert.equal(latitude.status, 400);
        assert.equal(longitude.status, 400);
    });

    test('missing latitude is rejected', async () => {
        const barber = await createBarber('location-no-lat');
        const { latitude: _latitude, ...payload } = locationPayload();
        assert.equal((await putLocation(barber.accessToken, payload)).status, 400);
    });

    test('missing longitude is rejected', async () => {
        const barber = await createBarber('location-no-lon');
        const { longitude: _longitude, ...payload } = locationPayload();
        assert.equal((await putLocation(barber.accessToken, payload)).status, 400);
    });

    test('six-decimal coordinate precision is preserved in responses', async () => {
        const barber = await createBarber('location-precision');
        const response = await putLocation(barber.accessToken, locationPayload({ latitude: 30.044499, longitude: 31.235701 }));

        assert.equal(response.status, 200);
        assert.equal(response.body.data.latitude, 30.044499);
        assert.equal(response.body.data.longitude, 31.235701);
    });

    test('address is optional', async () => {
        const barber = await createBarber('location-no-address');
        const location = await createLocation(barber.accessToken);

        assert.equal(location.address, null);
    });

    test('address longer than 500 characters is rejected', async () => {
        const barber = await createBarber('location-long-address');
        const response = await putLocation(barber.accessToken, locationPayload({ address: 'a'.repeat(501) }));

        assert.equal(response.status, 400);
    });

    test('address surrounding whitespace is trimmed', async () => {
        const barber = await createBarber('location-trim-address');
        const location = await createLocation(barber.accessToken, locationPayload({ address: '  Cairo, Egypt  ' }));

        assert.equal(location.address, 'Cairo, Egypt');
    });

    test('empty address is stored as null', async () => {
        const barber = await createBarber('location-empty-address');
        const location = await createLocation(barber.accessToken, locationPayload({ address: '   ' }));

        assert.equal(location.address, null);
    });

    test('address preserves internal spaces, Unicode, Arabic, and special characters', async () => {
        const barber = await createBarber('location-address-text');
        const address = 'شارع التحرير 12, Café & Co. #4';
        const location = await createLocation(barber.accessToken, locationPayload({ address: `  ${address}  ` }));

        assert.equal(location.address, address);
    });

    test('request cannot select another barber by supplying barberId', async () => {
        const barber = await createBarber('location-no-client-owner');
        const response = await putLocation(barber.accessToken, locationPayload({ barberId: 'some-other-barber' }));

        assert.equal(response.status, 400);
        assert.equal(await prisma.barberLocation.count(), 0);
    });

    test('active barber location is publicly accessible with only display fields', async () => {
        const barber = await createBarber('location-public');
        await createLocation(barber.accessToken, locationPayload({ address: 'Cairo, Egypt' }));

        const response = await api.get(`/api/v1/barbers/${barber.profile.id}/location`);
        assert.equal(response.status, 200);
        assert.deepEqual(Object.keys(response.body.data).sort(), ['address', 'latitude', 'longitude']);
        assert.equal(response.body.data.latitude, 30.0444);
        assert.equal(response.body.data.longitude, 31.2357);
        assert.equal(response.body.data.address, 'Cairo, Egypt');
    });

    test('inactive barber location is not publicly exposed', async () => {
        const barber = await createBarber('location-inactive');
        await createLocation(barber.accessToken);
        await prisma.barber.update({ where: { id: barber.profile.id }, data: { isActive: false } });

        assert.equal((await api.get(`/api/v1/barbers/${barber.profile.id}/location`)).status, 404);
    });

    test('nonexistent barber location returns not found', async () => {
        assert.equal((await api.get('/api/v1/barbers/not-a-real-barber/location')).status, 404);
    });

    test('active public profile includes its location', async () => {
        const barber = await createBarber('location-profile-present');
        await createLocation(barber.accessToken, locationPayload({ address: 'Profile address' }));

        const response = await api.get(`/api/v1/barbers/${barber.profile.id}/profile`);
        assert.equal(response.status, 200);
        assert.deepEqual(response.body.data.location, {
            latitude: 30.0444,
            longitude: 31.2357,
            address: 'Profile address',
        });
        assert.equal(response.body.data.userId, undefined);
    });

    test('public profile returns location null when none exists', async () => {
        const barber = await createBarber('location-profile-null');
        const response = await api.get(`/api/v1/barbers/${barber.profile.id}/profile`);

        assert.equal(response.status, 200);
        assert.equal(response.body.data.location, null);
    });

    test('discovery includes location for a barber that has one', async () => {
        const barber = await createBarber('location-discovery-present');
        await createLocation(barber.accessToken, locationPayload({ address: 'Discovery address' }));

        const response = await api.get('/api/v1/barbers');
        const item = response.body.data.items.find((candidate: { id: string }) => candidate.id === barber.profile.id);

        assert.equal(response.status, 200);
        assert.deepEqual(item.location, { latitude: 30.0444, longitude: 31.2357, address: 'Discovery address' });
    });

    test('discovery returns location null when a barber has none', async () => {
        const barber = await createBarber('location-discovery-null');
        const response = await api.get('/api/v1/barbers');
        const item = response.body.data.items.find((candidate: { id: string }) => candidate.id === barber.profile.id);

        assert.equal(response.status, 200);
        assert.equal(item.location, null);
    });

    test('discovery pagination remains available with location integration', async () => {
        const marker = uniqueTag('locpage');
        const first = await createBarber(`${marker}-one`);
        const second = await createBarber(`${marker}-two`);
        await createLocation(first.accessToken);
        await createLocation(second.accessToken);

        const response = await api.get('/api/v1/barbers').query({ search: marker, page: 1, limit: 1 });
        assert.equal(response.status, 200);
        assert.equal(response.body.data.pagination.page, 1);
        assert.equal(response.body.data.pagination.limit, 1);
        assert.equal(response.body.data.pagination.total, 2);
        assert.equal(response.body.data.pagination.totalPages, 2);
        assert.equal(response.body.data.items.length, 1);
        assert.ok(response.body.data.items[0].location);
    });

    test('discovery search continues to match business name and bio', async () => {
        const marker = uniqueTag('locsearch');
        const barber = await createBarber(marker);
        await createLocation(barber.accessToken, locationPayload({ address: 'Search location' }));

        const response = await api.get('/api/v1/barbers').query({ search: marker.toLowerCase() });
        assert.equal(response.status, 200);
        assert.ok(response.body.data.items.some((item: { id: string }) => item.id === barber.profile.id));
    });
});
