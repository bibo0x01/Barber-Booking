import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { app } from '../app';
import { prisma } from '../config/database';

const api = request(app);
const detailsEmailDomain = '@details-test.example.test';
const makeEmail = (tag: string): string => `${tag}-${Date.now()}-${Math.random().toString(16).slice(2)}${detailsEmailDomain}`;
const makePhone = (): string => `+155${String(Date.now()).slice(-6)}${Math.random().toString().slice(2, 5)}`;

const cleanupTestData = async (): Promise<void> => {
    const users = await prisma.user.findMany({
        where: { email: { contains: detailsEmailDomain } },
        select: { id: true },
    });
    const userIds = users.map((user) => user.id);

    if (userIds.length === 0) {
        return;
    }

    await prisma.barber.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
};

const createBarber = async (tag: string) => {
    const registration = await api.post('/api/v1/auth/register/barber').send({
        name: `${tag} User`,
        email: makeEmail(tag),
        phone: makePhone(),
        password: 'Password123',
    });

    assert.equal(registration.status, 201, `Failed to register barber: ${registration.body?.message ?? 'unknown error'}`);

    const profile = await api
        .post('/api/v1/barbers')
        .set('Authorization', `Bearer ${registration.body.data.accessToken}`)
        .send({ businessName: `${tag} Studio`, bio: `${tag} professional barber` });

    assert.equal(profile.status, 201, `Failed to create barber profile: ${profile.body?.message ?? 'unknown error'}`);

    return {
        token: registration.body.data.accessToken as string,
        barberId: profile.body.data.id as string,
        businessName: profile.body.data.businessName as string,
    };
};

const addImage = (barberId: string, sortOrder: number, suffix: string) =>
    prisma.barberImage.create({
        data: {
            barberId,
            imageUrl: `https://example.test/${suffix}.jpg`,
            altText: `${suffix} image`,
            sortOrder,
        },
    });

const addService = (barberId: string, name: string, price: string, createdAt: Date, isActive = true) =>
    prisma.barberService.create({
        data: {
            barberId,
            name,
            description: `${name} description`,
            price: new Prisma.Decimal(price),
            durationMinutes: 30,
            createdAt,
            isActive,
        },
    });

const addWorkingHour = (barberId: string, dayOfWeek: number, isActive = true) =>
    prisma.barberWorkingHour.create({
        data: {
            barberId,
            dayOfWeek,
            openTime: '10:00',
            closeTime: '22:00',
            isActive,
        },
    });

const addLocation = (barberId: string) =>
    prisma.barberLocation.create({
        data: {
            barberId,
            latitude: new Prisma.Decimal('30.044499'),
            longitude: new Prisma.Decimal('31.235701'),
            address: 'Cairo, Egypt',
        },
    });

const getDetails = (barberId: string) => api.get(`/api/v1/barbers/${barberId}`);

beforeEach(cleanupTestData);
afterEach(cleanupTestData);

describe('Barber details', () => {
    test('public client can fetch active barber details without authentication', async () => {
        const barber = await createBarber('details-public');
        const response = await getDetails(barber.barberId);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.message, 'Barber details fetched successfully');
        assert.equal(response.body.data.id, barber.barberId);
    });

    test('nonexistent barber returns the standard not-found response', async () => {
        const response = await getDetails('details-does-not-exist');

        assert.equal(response.status, 404);
        assert.equal(response.body.success, false);
        assert.equal(response.body.message, 'Barber not found');
    });

    test('inactive barber details are not publicly exposed', async () => {
        const barber = await createBarber('details-inactive');
        await prisma.barber.update({ where: { id: barber.barberId }, data: { isActive: false } });

        const response = await getDetails(barber.barberId);
        assert.equal(response.status, 404);
        assert.equal(response.body.message, 'Barber not found');
    });

    test('returns public profile and manual status fields only', async () => {
        const barber = await createBarber('details-profile');
        await prisma.barber.update({ where: { id: barber.barberId }, data: { isVerified: true, isOpen: true } });

        const response = await getDetails(barber.barberId);
        const details = response.body.data;

        assert.equal(details.id, barber.barberId);
        assert.equal(details.businessName, barber.businessName);
        assert.equal(details.bio, 'details-profile professional barber');
        assert.equal(details.isVerified, true);
        assert.equal(details.isOpen, true);
    });

    test('gallery is returned in sortOrder order with public image fields', async () => {
        const barber = await createBarber('details-gallery');
        await addImage(barber.barberId, 2, 'last');
        await addImage(barber.barberId, 0, 'primary');
        await addImage(barber.barberId, 1, 'middle');

        const response = await getDetails(barber.barberId);
        const gallery = response.body.data.gallery;

        assert.deepEqual(gallery.map((image: { sortOrder: number }) => image.sortOrder), [0, 1, 2]);
        assert.equal(gallery[0].imageUrl, 'https://example.test/primary.jpg');
        assert.deepEqual(Object.keys(gallery[0]).sort(), ['altText', 'id', 'imageUrl', 'sortOrder']);
    });

    test('empty gallery is an array', async () => {
        const barber = await createBarber('details-empty-gallery');
        const response = await getDetails(barber.barberId);

        assert.deepEqual(response.body.data.gallery, []);
    });

    test('returns active services only in established created order with numeric prices', async () => {
        const barber = await createBarber('details-services');
        const earlier = new Date('2026-01-01T00:00:00.000Z');
        const later = new Date('2026-01-02T00:00:00.000Z');
        await addService(barber.barberId, 'Later Haircut', '150.00', later);
        await addService(barber.barberId, 'Earlier Beard Trim', '75.50', earlier);
        await addService(barber.barberId, 'Inactive Service', '10.00', earlier, false);

        const response = await getDetails(barber.barberId);
        const services = response.body.data.services;

        assert.deepEqual(services.map((service: { name: string }) => service.name), ['Earlier Beard Trim', 'Later Haircut']);
        assert.equal(services[0].price, 75.5);
        assert.deepEqual(Object.keys(services[0]).sort(), ['description', 'durationMinutes', 'id', 'name', 'price']);
    });

    test('empty active service list is an array', async () => {
        const barber = await createBarber('details-empty-services');
        await addService(barber.barberId, 'Inactive only', '10.00', new Date(), false);

        const response = await getDetails(barber.barberId);
        assert.deepEqual(response.body.data.services, []);
    });

    test('working hours are returned by weekday, including their active flag', async () => {
        const barber = await createBarber('details-hours');
        await addWorkingHour(barber.barberId, 6, false);
        await addWorkingHour(barber.barberId, 0);
        await addWorkingHour(barber.barberId, 3);

        const response = await getDetails(barber.barberId);
        const hours = response.body.data.workingHours;

        assert.deepEqual(hours.map((hour: { dayOfWeek: number }) => hour.dayOfWeek), [0, 3, 6]);
        assert.equal(hours[2].isActive, false);
        assert.deepEqual(Object.keys(hours[0]).sort(), ['closeTime', 'dayOfWeek', 'id', 'isActive', 'openTime']);
    });

    test('empty working-hours list is an array', async () => {
        const barber = await createBarber('details-empty-hours');
        const response = await getDetails(barber.barberId);

        assert.deepEqual(response.body.data.workingHours, []);
    });

    test('location is returned as numeric coordinates and address', async () => {
        const barber = await createBarber('details-location');
        await addLocation(barber.barberId);

        const response = await getDetails(barber.barberId);
        assert.deepEqual(response.body.data.location, {
            latitude: 30.044499,
            longitude: 31.235701,
            address: 'Cairo, Egypt',
        });
    });

    test('missing location is returned as null', async () => {
        const barber = await createBarber('details-no-location');
        const response = await getDetails(barber.barberId);

        assert.equal(response.body.data.location, null);
    });

    test('complete response combines public profile, gallery, services, working hours, and location', async () => {
        const barber = await createBarber('details-complete');
        await prisma.barber.update({ where: { id: barber.barberId }, data: { isVerified: true, isOpen: true } });
        await addImage(barber.barberId, 0, 'complete');
        await addService(barber.barberId, 'Complete Cut', '120.25', new Date());
        await addWorkingHour(barber.barberId, 2);
        await addLocation(barber.barberId);

        const response = await getDetails(barber.barberId);
        const details = response.body.data;

        assert.equal(response.status, 200);
        assert.equal(details.isVerified, true);
        assert.equal(details.isOpen, true);
        assert.equal(details.gallery.length, 1);
        assert.equal(details.services[0].price, 120.25);
        assert.equal(details.workingHours.length, 1);
        assert.equal(details.location.latitude, 30.044499);
    });

    test('response and nested data never expose private User or database fields', async () => {
        const barber = await createBarber('details-private');
        await addImage(barber.barberId, 0, 'private-check');
        await addService(barber.barberId, 'Public Service', '50.00', new Date());
        await addWorkingHour(barber.barberId, 1);
        await addLocation(barber.barberId);

        const response = await getDetails(barber.barberId);
        const details = response.body.data;

        assert.deepEqual(
            Object.keys(details).sort(),
            ['bio', 'businessName', 'gallery', 'id', 'isOpen', 'isVerified', 'location', 'services', 'workingHours'],
        );
        for (const forbidden of ['userId', 'email', 'phone', 'passwordHash', 'role', 'user', 'isActive', 'createdAt', 'updatedAt']) {
            assert.equal(details[forbidden], undefined);
        }
        assert.equal(details.gallery[0].createdAt, undefined);
        assert.equal(details.services[0].barberId, undefined);
        assert.equal(details.services[0].isActive, undefined);
        assert.equal(details.workingHours[0].createdAt, undefined);
        assert.equal(details.location.createdAt, undefined);
    });

    test('details route does not intercept the protected /me profile route', async () => {
        const response = await api.get('/api/v1/barbers/me');
        assert.equal(response.status, 401);
    });

    test('existing public gallery, services, working-hours, and location endpoints remain reachable', async () => {
        const barber = await createBarber('details-existing-routes');
        await addImage(barber.barberId, 0, 'routes');
        await addService(barber.barberId, 'Routes Cut', '80.00', new Date());
        await addWorkingHour(barber.barberId, 0);
        await addLocation(barber.barberId);

        const [gallery, services, workingHours, location] = await Promise.all([
            api.get(`/api/v1/barbers/${barber.barberId}/gallery`),
            api.get(`/api/v1/barbers/${barber.barberId}/services`),
            api.get(`/api/v1/barbers/${barber.barberId}/working-hours`),
            api.get(`/api/v1/barbers/${barber.barberId}/location`),
        ]);

        assert.equal(gallery.status, 200);
        assert.equal(services.status, 200);
        assert.equal(workingHours.status, 200);
        assert.equal(location.status, 200);
    });
});
