import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../config/database';

const api = request(app);

const makeEmail = (tag: string): string => `${tag}-${Date.now()}-${Math.random().toString(16).slice(2)}@search-test.example.test`;
const makePhone = (_tag: string): string => `+155${String(Date.now()).slice(-6)}${Math.random().toString().slice(2, 5)}`;

const cleanupTestData = async (): Promise<void> => {
    const emailLike = '@search-test.example.test';

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

const addPrimaryImage = async (token: string, url: string, altText?: string) => {
    const response = await api
        .post('/api/v1/barbers/me/gallery')
        .set('Authorization', `Bearer ${token}`)
        .send({ imageUrl: url, altText });

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

describe('Barber search', () => {
    test('search matches exact business name', async () => {
        const barber = await registerBarber('search-exact');
        await createBarberProfile(barber.accessToken, 'Joey Barber House', 'Classic cut specialist');

        const response = await api.get('/api/v1/barbers?search=Joey Barber House');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items.length, 1);
        assert.equal(response.body.data.items[0].businessName, 'Joey Barber House');
    });

    test('search matches partial business name', async () => {
        const barber = await registerBarber('search-partial-business');
        await createBarberProfile(barber.accessToken, 'Modern Barber Studio', 'Trim and style');

        const response = await api.get('/api/v1/barbers?search=barb');
        assert.equal(response.status, 200);
        assert.ok(response.body.data.items.some((item: { businessName: string }) => item.businessName === 'Modern Barber Studio'));
    });

    test('search matches business name case-insensitively', async () => {
        const barber = await registerBarber('search-case-biz');
        await createBarberProfile(barber.accessToken, 'JoEy Cut Club', 'Serious grooming');

        const response = await api.get('/api/v1/barbers?search=joey');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items.length, 1);
    });

    test('search matches exact bio text', async () => {
        const barber = await registerBarber('search-bio-exact');
        await createBarberProfile(barber.accessToken, 'Alpha Groom', 'Precision fades and beard work');

        const response = await api.get('/api/v1/barbers?search=Precision fades and beard work');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items[0].businessName, 'Alpha Groom');
    });

    test('search matches partial bio content', async () => {
        const barber = await registerBarber('search-bio-partial');
        await createBarberProfile(barber.accessToken, 'Smooth Lines', 'Luxury beard shaping and haircuts');

        const response = await api.get('/api/v1/barbers?search=beard');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items.length, 1);
    });

    test('search matches bio case-insensitively', async () => {
        const barber = await registerBarber('search-bio-case');
        await createBarberProfile(barber.accessToken, 'Luxury Cuts', 'BEARD detailing and hot towel');

        const response = await api.get('/api/v1/barbers?search=beard');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items[0].businessName, 'Luxury Cuts');
    });

    test('search uses businessName OR bio logic', async () => {
        const barberA = await registerBarber('search-or-a');
        const barberB = await registerBarber('search-or-b');
        await createBarberProfile(barberA.accessToken, 'City Cuts', 'No match here');
        await createBarberProfile(barberB.accessToken, 'Royal Style', 'Specializes in fade and detailing');

        const response = await api.get('/api/v1/barbers?search=detailing');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items.length, 1);
        assert.equal(response.body.data.items[0].businessName, 'Royal Style');
    });

    test('search does not require both fields to match', async () => {
        const barber = await registerBarber('search-one-field');
        await createBarberProfile(barber.accessToken, 'Elite Blade', 'Premium care');

        const response = await api.get('/api/v1/barbers?search=elite');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items[0].businessName, 'Elite Blade');
    });

    test('search returns only active barbers', async () => {
        const active = await registerBarber('search-active');
        const inactive = await registerBarber('search-inactive');
        await createBarberProfile(active.accessToken, 'Active Search Barber', 'Premium trimming');
        const inactiveProfile = await createBarberProfile(inactive.accessToken, 'Inactive Search Barber', 'Premium trimming');
        await prisma.barber.update({ where: { id: inactiveProfile.id }, data: { isActive: false } });

        const response = await api.get('/api/v1/barbers?search=Premium');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items.length, 1);
        assert.equal(response.body.data.items[0].businessName, 'Active Search Barber');
    });

    test('search returns empty items when there are no matches', async () => {
        const barber = await registerBarber('search-empty');
        await createBarberProfile(barber.accessToken, 'No Matching Results Studio', 'Creative work');

        const response = await api.get('/api/v1/barbers?search=zzz-not-found');
        assert.equal(response.status, 200);
        assert.deepEqual(response.body.data.items, []);
        assert.equal(response.body.data.pagination.total, 0);
    });

    test('search trims leading and trailing whitespace', async () => {
        const barber = await registerBarber('search-trim');
        await createBarberProfile(barber.accessToken, 'Trimmed Barber Co', 'Professional grooming');

        const response = await api.get('/api/v1/barbers?search=%20%20trimmed%20%20');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items[0].businessName, 'Trimmed Barber Co');
    });

    test('empty search behaves like regular discovery', async () => {
        const barber = await registerBarber('empty-search');
        await createBarberProfile(barber.accessToken, 'Empty Search Studio', 'No filter');

        const response = await api.get('/api/v1/barbers?search=');
        assert.equal(response.status, 200);
        assert.ok(
            response.body.data.items.some((item: { businessName: string }) => item.businessName === 'Empty Search Studio'),
            'Expected an empty search to include the fixture barber like regular discovery',
        );
    });

    test('whitespace-only search behaves like regular discovery', async () => {
        const barber = await registerBarber('whitespace-search');
        await createBarberProfile(barber.accessToken, 'Whitespace Barber', 'Search blank');

        const response = await api.get('/api/v1/barbers?search=   ');
        assert.equal(response.status, 200);
        assert.ok(
            response.body.data.items.some((item: { businessName: string }) => item.businessName === 'Whitespace Barber'),
            'Expected a whitespace-only search to include the fixture barber like regular discovery',
        );
    });

    test('search longer than 100 characters is rejected', async () => {
        const response = await api.get(`/api/v1/barbers?search=${'a'.repeat(101)}`);
        assert.equal(response.status, 400);
    });

    test('one-character search works', async () => {
        const barber = await registerBarber('search-one-char');
        await createBarberProfile(barber.accessToken, 'Qx Barber Studio', 'Single character search fixture');

        const response = await api.get('/api/v1/barbers').query({ search: 'Q' });
        assert.equal(response.status, 200);
        assert.ok(
            response.body.data.items.some((item: { businessName: string }) => item.businessName === 'Qx Barber Studio'),
            'Expected a business name containing Q to match a one-character search',
        );
    });

    test('Arabic search input is accepted', async () => {
        const barber = await registerBarber('search-arabic');
        await createBarberProfile(barber.accessToken, 'حلاق', 'خدمات حلاقة');

        const response = await api.get('/api/v1/barbers?search=حلاق');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items.length, 1);
    });

    test('search supports spaces in the term', async () => {
        const barber = await registerBarber('search-spaces');
        await createBarberProfile(barber.accessToken, 'Best Hair & Beard', 'Relaxed, premium barbering');

        const response = await api.get('/api/v1/barbers').query({ search: 'hair & beard' });
        assert.equal(response.status, 200);
        assert.ok(
            response.body.data.items.some((item: { businessName: string }) => item.businessName === 'Best Hair & Beard'),
            'Expected the internal spaces in the search term to be preserved',
        );
    });

    test('search handles special characters without breaking the query', async () => {
        const barber = await registerBarber('search-special');
        await createBarberProfile(barber.accessToken, 'A&B Barber', 'Cut + style');

        const response = await api.get('/api/v1/barbers').query({ search: 'A&B' });
        assert.equal(response.status, 200);
        assert.ok(
            response.body.data.items.some((item: { businessName: string }) => item.businessName === 'A&B Barber'),
            'Expected the encoded ampersand search term to match the barber name',
        );
    });

    test('search works with page parameter', async () => {
        const barber = await registerBarber('search-page');
        await createBarberProfile(barber.accessToken, 'Page Search Barber', 'A very specific text');

        const response = await api.get('/api/v1/barbers?search=specific&page=1');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.pagination.page, 1);
    });

    test('search works with limit parameter', async () => {
        const barber = await registerBarber('search-limit');
        await createBarberProfile(barber.accessToken, 'Limit Search Barber', 'A specific theme');

        const response = await api.get('/api/v1/barbers?search=specific&limit=10');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.pagination.limit, 10);
    });

    test('search works with page and limit together', async () => {
        const barber = await registerBarber('search-pagelimit');
        await createBarberProfile(barber.accessToken, 'Search Page Limit', 'This should appear');

        const response = await api.get('/api/v1/barbers?search=should&page=1&limit=1');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.pagination.page, 1);
        assert.equal(response.body.data.pagination.limit, 1);
    });

    test('search total count represents only matching results', async () => {
        const barberA = await registerBarber('search-total-a');
        const barberB = await registerBarber('search-total-b');
        await createBarberProfile(barberA.accessToken, 'Alpha Spider', 'Professional style');
        await createBarberProfile(barberB.accessToken, 'Bravo Studio', 'Professional fades');

        const response = await api.get('/api/v1/barbers?search=Professional');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.pagination.total, 2);
    });

    test('search total pages are calculated correctly', async () => {
        const barberA = await registerBarber('search-pages-a');
        const barberB = await registerBarber('search-pages-b');
        await createBarberProfile(barberA.accessToken, 'Page Count One', 'Best cuts');
        await createBarberProfile(barberB.accessToken, 'Page Count Two', 'Best cuts');

        const response = await api.get('/api/v1/barbers?search=Best&page=1&limit=1');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.pagination.totalPages, 2);
    });

    test('page beyond search results returns empty items', async () => {
        const barber = await registerBarber('search-page-beyond');
        await createBarberProfile(barber.accessToken, 'Page Beyond Search', 'Classic cuts');

        const response = await api.get('/api/v1/barbers?search=Classic&page=99&limit=20');
        assert.equal(response.status, 200);
        assert.deepEqual(response.body.data.items, []);
    });

    test('search preserves Feature 11 response shape', async () => {
        const barber = await registerBarber('search-shape');
        await createBarberProfile(barber.accessToken, 'Shape Search Studio', 'Balanced craft');

        const response = await api.get('/api/v1/barbers?search=balanced');
        assert.equal(response.status, 200);
        assert.ok(response.body.data.items[0]?.id);
        assert.ok(response.body.data.items[0]?.primaryImage !== undefined);
        assert.ok(Array.isArray(response.body.data.items[0].services));
        assert.equal(response.body.data.pagination.page, 1);
    });

    test('search retains primary image when present', async () => {
        const barber = await registerBarber('search-image');
        await createBarberProfile(barber.accessToken, 'Search Image Studio', 'Modern design');
        await addPrimaryImage(barber.accessToken, 'https://example.com/search-primary.jpg', 'Search primary');

        const response = await api.get('/api/v1/barbers?search=search');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items[0].primaryImage.imageUrl, 'https://example.com/search-primary.jpg');
    });

    test('search still returns active services', async () => {
        const barber = await registerBarber('search-services');
        await createBarberProfile(barber.accessToken, 'Search Service Studio', 'Hairdo artistry');
        await addService(barber.accessToken, 'Haircut', '120.00', 30);

        const response = await api.get('/api/v1/barbers?search=Hairdo');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items[0].services[0].name, 'Haircut');
    });

    test('search returns isVerified and isOpen values', async () => {
        const barber = await registerBarber('search-status');
        const profile = await createBarberProfile(barber.accessToken, 'Search Status Studio', 'Authentic craft');
        await prisma.barber.update({ where: { id: profile.id }, data: { isVerified: true, isOpen: true } });

        const response = await api.get('/api/v1/barbers?search=craft');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items[0].isVerified, true);
        assert.equal(response.body.data.items[0].isOpen, true);
    });

    test('search omits private user fields', async () => {
        const barber = await registerBarber('search-private');
        await createBarberProfile(barber.accessToken, 'Search Private Studio', 'Friendly service');

        const response = await api.get('/api/v1/barbers?search=friendly');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items[0].email, undefined);
        assert.equal(response.body.data.items[0].phone, undefined);
        assert.equal(response.body.data.items[0].passwordHash, undefined);
        assert.equal(response.body.data.items[0].role, undefined);
    });

    test('search rejects unsupported extra parameters', async () => {
        const response = await api.get('/api/v1/barbers?search=joey&sort=desc');
        assert.equal(response.status, 400);
    });

    test('inactive barbers cannot be discovered through search', async () => {
        const active = await registerBarber('search-active-safe');
        const inactive = await registerBarber('search-inactive-safe');
        await createBarberProfile(active.accessToken, 'Visible Search Barber', 'Visible search text');
        const inactiveProfile = await createBarberProfile(inactive.accessToken, 'Hidden Search Barber', 'Visible search text');
        await prisma.barber.update({ where: { id: inactiveProfile.id }, data: { isActive: false } });

        const response = await api.get('/api/v1/barbers?search=Visible');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items.length, 1);
        assert.equal(response.body.data.items[0].businessName, 'Visible Search Barber');
    });

    test('search is case insensitive in business name and bio with OR match', async () => {
        const a = await registerBarber('search-or-a-2');
        const b = await registerBarber('search-or-b-2');
        await createBarberProfile(a.accessToken, 'Joey Barber', 'Quiet place');
        await createBarberProfile(b.accessToken, 'Other Shop', 'JOEY is the friend');

        const response = await api.get('/api/v1/barbers?search=joey');
        assert.equal(response.status, 200);
        assert.equal(response.body.data.items.length, 2);
    });
});
