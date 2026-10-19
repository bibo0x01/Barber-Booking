import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../config/database';

const api = request(app);

const makeEmail = (tag: string): string => `${tag}-${Date.now()}-${Math.random().toString(16).slice(2)}@discovery-test.example.test`;
const makePhone = (_tag: string): string => `+155${String(Date.now()).slice(-6)}${Math.random().toString().slice(2, 5)}`;

const cleanupTestData = async (): Promise<void> => {
    const emailLike = '@discovery-test.example.test';

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

const addPrimaryImage = async (token: string, imageUrl: string, altText?: string) => {
    const response = await api
        .post('/api/v1/barbers/me/gallery')
        .set('Authorization', `Bearer ${token}`)
        .send({ imageUrl, altText });

    assert.equal(response.status, 201, `Failed to add gallery image: ${response.body?.message ?? 'unknown error'}`);
    return response.body.data;
};

const addService = async (token: string, name: string, price: string | number, durationMinutes: number) => {
    const response = await api
        .post('/api/v1/barbers/me/services')
        .set('Authorization', `Bearer ${token}`)
        .send({ name, description: `${name} service`, price, durationMinutes });

    assert.equal(response.status, 201, `Failed to add service: ${response.body?.message ?? 'unknown error'}`);
    return response.body.data;
};

beforeEach(async () => {
    await cleanupTestData();
});

afterEach(async () => {
    await cleanupTestData();
});

describe('Barber discovery', () => {
    test('public endpoint works without authentication', async () => {
        const response = await api.get('/api/v1/barbers');
        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);
    });

    test('returns successful response with default pagination metadata', async () => {
        const response = await api.get('/api/v1/barbers');
        assert.equal(response.body.message, 'Barbers retrieved successfully');
        assert.equal(response.body.data.pagination.page, 1);
        assert.equal(response.body.data.pagination.limit, 20);
    });

    test('returns only active barbers and excludes inactive ones', async () => {
        const activeBarber = await registerBarber('active-discovery');
        const inactiveBarber = await registerBarber('inactive-discovery');

        const activeProfile = await createBarberProfile(activeBarber.accessToken, 'Active Discovery Studio', 'Available');
        const inactiveProfile = await createBarberProfile(inactiveBarber.accessToken, 'Inactive Discovery Studio', 'Not available');
        await prisma.barber.update({ where: { id: inactiveProfile.id }, data: { isActive: false } });

        const response = await api.get('/api/v1/barbers');
        assert.equal(response.status, 200);
        assert.ok(response.body.data.items.every((item: { id: string }) => item.id !== inactiveProfile.id));
        assert.ok(response.body.data.items.some((item: { id: string }) => item.id === activeProfile.id));
    });

    test('returns empty items when no active barbers exist for the current dataset', async () => {
        const total = await prisma.barber.count({ where: { isActive: true } });
        const response = await api.get('/api/v1/barbers');

        assert.equal(response.status, 200);
        if (total === 0) {
            assert.deepEqual(response.body.data.items, []);
            assert.equal(response.body.data.pagination.total, 0);
            assert.equal(response.body.data.pagination.totalPages, 0);
        } else {
            assert.ok(Array.isArray(response.body.data.items));
        }
    });

    test('default page and limit are applied when no query is sent', async () => {
        const response = await api.get('/api/v1/barbers');
        assert.equal(response.body.data.pagination.page, 1);
        assert.equal(response.body.data.pagination.limit, 20);
    });

    test('custom page works', async () => {
        const barber = await registerBarber('page-custom');
        await createBarberProfile(barber.accessToken, 'Page Custom Studio');

        const response = await api.get('/api/v1/barbers?page=1');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.pagination.page, 1);
    });

    test('custom limit works', async () => {
        const barber = await registerBarber('limit-custom');
        await createBarberProfile(barber.accessToken, 'Limit Custom Studio');

        const response = await api.get('/api/v1/barbers?limit=10');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.pagination.limit, 10);
    });

    test('limit 50 is accepted', async () => {
        const response = await api.get('/api/v1/barbers?limit=50');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.pagination.limit, 50);
    });

    test('limit greater than 50 is rejected', async () => {
        const response = await api.get('/api/v1/barbers?limit=51');
        assert.equal(response.status, 400);
    });

    test('limit 0 is rejected', async () => {
        const response = await api.get('/api/v1/barbers?limit=0');
        assert.equal(response.status, 400);
    });

    test('negative limit is rejected', async () => {
        const response = await api.get('/api/v1/barbers?limit=-1');
        assert.equal(response.status, 400);
    });

    test('page 0 is rejected', async () => {
        const response = await api.get('/api/v1/barbers?page=0');
        assert.equal(response.status, 400);
    });

    test('negative page is rejected', async () => {
        const response = await api.get('/api/v1/barbers?page=-1');
        assert.equal(response.status, 400);
    });

    test('invalid page is rejected', async () => {
        const response = await api.get('/api/v1/barbers?page=abc');
        assert.equal(response.status, 400);
    });

    test('invalid limit is rejected', async () => {
        const response = await api.get('/api/v1/barbers?limit=abc');
        assert.equal(response.status, 400);
    });

    test('pagination metadata matches active barber count', async () => {
        const barberA = await registerBarber('meta-a');
        const barberB = await registerBarber('meta-b');
        await createBarberProfile(barberA.accessToken, 'Meta A Studio');
        await createBarberProfile(barberB.accessToken, 'Meta B Studio');

        const total = await prisma.barber.count({ where: { isActive: true } });
        const response = await api.get('/api/v1/barbers?page=1&limit=1');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.pagination.total, total);
        assert.equal(response.body.data.pagination.totalPages, total === 0 ? 0 : Math.ceil(total / 1));
    });

    test('page beyond available data returns empty items when current total is exhausted', async () => {
        const total = await prisma.barber.count({ where: { isActive: true } });
        const response = await api.get('/api/v1/barbers?page=999&limit=20');

        assert.equal(response.status, 200);
        if (total === 0) {
            assert.deepEqual(response.body.data.items, []);
        } else {
            const totalPages = Math.ceil(total / 20);
            if (999 > totalPages) {
                assert.deepEqual(response.body.data.items, []);
            }
        }
    });

    test('returns public barber fields and omits private data', async () => {
        const barber = await registerBarber('public-fields');
        await createBarberProfile(barber.accessToken, 'Public Fields Studio', 'A bio');

        const response = await api.get('/api/v1/barbers');
        assert.equal(response.status, 200);
        const item = response.body.data.items.find((entry: { businessName: string }) => entry.businessName === 'Public Fields Studio');
        assert.ok(item);
        assert.equal(item.bio, 'A bio');
        assert.equal(typeof item.isVerified, 'boolean');
        assert.equal(typeof item.isOpen, 'boolean');
        assert.equal(item.userId, undefined);
        assert.equal(item.email, undefined);
        assert.equal(item.phone, undefined);
        assert.equal(item.passwordHash, undefined);
        assert.equal(item.role, undefined);
    });

    test('returns primary image when one exists', async () => {
        const barber = await registerBarber('image-primary');
        await createBarberProfile(barber.accessToken, 'Primary Image Studio');
        const image = await addPrimaryImage(barber.accessToken, 'https://example.com/primary.jpg', 'Primary alt');

        const response = await api.get('/api/v1/barbers');
        assert.equal(response.status, 200);
        const item = response.body.data.items.find((entry: { businessName: string }) => entry.businessName === 'Primary Image Studio');
        assert.ok(item);
        assert.equal(item.primaryImage.id, image.id);
        assert.equal(item.primaryImage.imageUrl, 'https://example.com/primary.jpg');
    });

    test('returns null primaryImage when no primary image exists', async () => {
        const barber = await registerBarber('image-none');
        await createBarberProfile(barber.accessToken, 'No Primary Studio');

        const response = await api.get('/api/v1/barbers');
        assert.equal(response.status, 200);
        const item = response.body.data.items.find((entry: { businessName: string }) => entry.businessName === 'No Primary Studio');
        assert.ok(item);
        assert.equal(item.primaryImage, null);
    });

    test('returns active services only and omits internal barberId', async () => {
        const barber = await registerBarber('service-discovery');
        await createBarberProfile(barber.accessToken, 'Service Discovery Studio');
        await addService(barber.accessToken, 'Haircut', '120.00', 30);

        const response = await api.get('/api/v1/barbers');
        assert.equal(response.status, 200);
        const item = response.body.data.items.find((entry: { businessName: string }) => entry.businessName === 'Service Discovery Studio');
        assert.ok(item);
        assert.equal(item.services.length, 1);
        assert.equal(item.services[0].name, 'Haircut');
        assert.equal(item.services[0].barberId, undefined);
    });

    test('does not return inactive services', async () => {
        const barber = await registerBarber('inactive-service');
        await createBarberProfile(barber.accessToken, 'Inactive Service Studio');
        await addService(barber.accessToken, 'Haircut', 120, 30);

        const service = await prisma.barberService.findFirstOrThrow({ where: { barber: { userId: barber.user.id } } });
        await prisma.barberService.update({ where: { id: service.id }, data: { isActive: false } });

        const response = await api.get('/api/v1/barbers');
        const item = response.body.data.items.find((entry: { businessName: string }) => entry.businessName === 'Inactive Service Studio');
        if (item) {
            assert.equal(item.services.length, 0);
        }
    });

    test('public discovery rejects unsupported query fields', async () => {
        const barber = await registerBarber('extra-query');
        await createBarberProfile(barber.accessToken, 'Extra Query Studio');

        const response = await api.get('/api/v1/barbers?page=1&limit=10&sort=passwordHash');
        assert.equal(response.status, 400);
    });

    test('barber ownership is irrelevant for public discovery', async () => {
        const barber = await registerBarber('ownership');
        await createBarberProfile(barber.accessToken, 'Ownership Studio');

        const response = await api.get('/api/v1/barbers');
        assert.equal(response.status, 200);
        assert.ok(response.body.data.items.some((item: { businessName: string }) => item.businessName === 'Ownership Studio'));
    });

    test('exposes verification and open status correctly', async () => {
        const barber = await registerBarber('status-check');
        const profile = await createBarberProfile(barber.accessToken, 'Status Check Studio');
        await prisma.barber.update({ where: { id: profile.id }, data: { isVerified: true, isOpen: true } });

        const response = await api.get('/api/v1/barbers');
        const item = response.body.data.items.find((entry: { businessName: string }) => entry.businessName === 'Status Check Studio');
        assert.ok(item);
        assert.equal(item.isVerified, true);
        assert.equal(item.isOpen, true);
    });
});
