import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import request from 'supertest';
import { Role } from '@prisma/client';
import { app } from '../app';
import { prisma } from '../config/database';
import { MAX_GALLERY_IMAGES } from '../modules/barbers/gallery/gallery.constants';

const api = request(app);

const makeEmail = (tag: string): string => `${tag}-${Date.now()}-${Math.random().toString(16).slice(2)}@gallery-test.example.test`;
const makePhone = (_tag: string): string => `+155${String(Date.now()).slice(-6)}${Math.random().toString().slice(2, 5)}`;

const cleanupTestData = async (): Promise<void> => {
    const emailLike = '@gallery-test.example.test';

    const userIds = await prisma.user.findMany({
        where: { email: { contains: emailLike } },
        select: { id: true },
    });

    if (userIds.length === 0) {
        return;
    }

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

const createBarberProfile = async (token: string, businessName = 'Test Barber Co') => {
    const response = await api
        .post('/api/v1/barbers')
        .set('Authorization', `Bearer ${token}`)
        .send({ businessName, bio: 'A barber profile for testing.' });

    assert.equal(response.status, 201, `Failed to create barber profile: ${response.body?.message ?? 'unknown error'}`);
    return response.body.data;
};

const createGalleryImage = async (token: string, imageUrl: string, altText?: string) => {
    const response = await api
        .post('/api/v1/barbers/me/gallery')
        .set('Authorization', `Bearer ${token}`)
        .send({ imageUrl, ...(altText ? { altText } : {}) });

    assert.equal(response.status, 201, `Failed to add image: ${response.body?.message ?? 'unknown error'}`);
    return response.body.data;
};

beforeEach(async () => {
    await cleanupTestData();
});

afterEach(async () => {
    await cleanupTestData();
});

describe('Barber gallery', () => {
    test('adds an image to the current barber gallery', async () => {
        const barber = await registerUser(Role.BARBER, 'barber-add');
        await createBarberProfile(barber.token, 'Add Image Studio');

        const image = await createGalleryImage(barber.token, 'https://cdn.example.com/barbers/add-image-1.jpg', 'Modern haircut');

        assert.equal(image.imageUrl, 'https://cdn.example.com/barbers/add-image-1.jpg');
        assert.equal(image.altText, 'Modern haircut');
        assert.equal(image.sortOrder, 0);
    });

    test('gets the current barber gallery sorted by sortOrder', async () => {
        const barber = await registerUser(Role.BARBER, 'barber-own-gallery');
        await createBarberProfile(barber.token, 'Own Gallery Studio');

        await createGalleryImage(barber.token, 'https://cdn.example.com/barbers/own-1.jpg', 'First');
        await createGalleryImage(barber.token, 'https://cdn.example.com/barbers/own-2.jpg', 'Second');

        const response = await api
            .get('/api/v1/barbers/me/gallery')
            .set('Authorization', `Bearer ${barber.token}`);

        assert.equal(response.status, 200);
        assert.equal(response.body.message, 'Gallery retrieved successfully');
        assert.equal(response.body.data.length, 2);
        assert.deepEqual(
            response.body.data.map((image: { sortOrder: number }) => image.sortOrder),
            [0, 1],
        );
    });

    test('returns a public gallery for an active barber and hides internal user data', async () => {
        const barberA = await registerUser(Role.BARBER, 'barber-public-a');
        await createBarberProfile(barberA.token, 'Public Barber A');
        await createGalleryImage(barberA.token, 'https://cdn.example.com/barbers/public-a-1.jpg', 'Public preview');

        const barberResponse = await api.get(`/api/v1/barbers/${barberA.user.id}/gallery`);
        assert.equal(barberResponse.status, 404);

        const barberProfile = await prisma.barber.findUnique({ where: { userId: barberA.user.id }, select: { id: true } });
        assert.ok(barberProfile);

        const publicResponse = await api.get(`/api/v1/barbers/${barberProfile.id}/gallery`);
        assert.equal(publicResponse.status, 200);
        assert.equal(publicResponse.body.message, 'Gallery retrieved successfully');
        assert.equal(publicResponse.body.data.length, 1);
        assert.equal(publicResponse.body.data[0].imageUrl, 'https://cdn.example.com/barbers/public-a-1.jpg');
        assert.deepEqual(Object.keys(publicResponse.body.data[0]).sort(), ['altText', 'id', 'imageUrl', 'sortOrder']);
    });

    test('reorders gallery images and persists the new sort order', async () => {
        const barber = await registerUser(Role.BARBER, 'barber-reorder');
        await createBarberProfile(barber.token, 'Reorder Studio');

        const first = await createGalleryImage(barber.token, 'https://cdn.example.com/barbers/reorder-c.jpg', 'C');
        const second = await createGalleryImage(barber.token, 'https://cdn.example.com/barbers/reorder-a.jpg', 'A');
        const third = await createGalleryImage(barber.token, 'https://cdn.example.com/barbers/reorder-b.jpg', 'B');

        const reorderResponse = await api
            .patch('/api/v1/barbers/me/gallery/reorder')
            .set('Authorization', `Bearer ${barber.token}`)
            .send({ imageIds: [first.id, second.id, third.id].reverse() });

        assert.equal(reorderResponse.status, 200, reorderResponse.body?.message ?? 'Unknown reorder error');
        assert.deepEqual(
            reorderResponse.body.data.map((image: { id: string }) => image.id),
            [first.id, second.id, third.id].reverse(),
        );

        const persisted = await prisma.barberImage.findMany({
            where: { barberId: (await prisma.barber.findUniqueOrThrow({ where: { userId: barber.user.id }, select: { id: true } })).id },
            orderBy: { sortOrder: 'asc' },
            select: { id: true, sortOrder: true },
        });

        assert.deepEqual(
            persisted.map((image) => image.id),
            [first.id, second.id, third.id].reverse(),
        );
    });

    test('deletes a gallery image owned by the current barber', async () => {
        const barber = await registerUser(Role.BARBER, 'barber-delete');
        await createBarberProfile(barber.token, 'Delete Studio');

        const image = await createGalleryImage(barber.token, 'https://cdn.example.com/barbers/delete-1.jpg', 'Delete me');

        const response = await api
            .delete(`/api/v1/barbers/me/gallery/${image.id}`)
            .set('Authorization', `Bearer ${barber.token}`);

        assert.equal(response.status, 200);
        assert.equal(response.body.message, 'Gallery image deleted successfully');

        const count = await prisma.barberImage.count({ where: { id: image.id } });
        assert.equal(count, 0);
    });

    test('rejects deleting another barber image', async () => {
        const barberA = await registerUser(Role.BARBER, 'barber-ownership-a');
        const barberB = await registerUser(Role.BARBER, 'barber-ownership-b');
        await createBarberProfile(barberA.token, 'Barber A Studio');
        await createBarberProfile(barberB.token, 'Barber B Studio');

        const barberBProfile = await prisma.barber.findUniqueOrThrow({ where: { userId: barberB.user.id }, select: { id: true } });
        const image = await createGalleryImage(barberB.token, 'https://cdn.example.com/barbers/other-owner.jpg', 'B image');

        const response = await api
            .delete(`/api/v1/barbers/me/gallery/${image.id}`)
            .set('Authorization', `Bearer ${barberA.token}`);

        assert.ok(response.status === 404 || response.status === 403);
    });

    test('returns 403 for a user trying to manage the current barber gallery', async () => {
        const user = await registerUser(Role.USER, 'gallery-user');

        const response = await api
            .post('/api/v1/barbers/me/gallery')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ imageUrl: 'https://cdn.example.com/barbers/forbidden.jpg' });

        assert.equal(response.status, 403);
    });

    test('rejects invalid image URLs and client-supplied barber IDs', async () => {
        const barber = await registerUser(Role.BARBER, 'barber-invalid-input');
        await createBarberProfile(barber.token, 'Invalid Input Studio');

        const invalidUrlResponse = await api
            .post('/api/v1/barbers/me/gallery')
            .set('Authorization', `Bearer ${barber.token}`)
            .send({ imageUrl: 'not-a-url' });
        assert.equal(invalidUrlResponse.status, 400);

        const barberIdResponse = await api
            .post('/api/v1/barbers/me/gallery')
            .set('Authorization', `Bearer ${barber.token}`)
            .send({ imageUrl: 'https://cdn.example.com/barbers/forged-owner.jpg', barberId: 'another-barber' });
        assert.equal(barberIdResponse.status, 400);
    });

    test('rejects reorder IDs not owned by the current barber', async () => {
        const barberA = await registerUser(Role.BARBER, 'barber-reorder-owner-a');
        const barberB = await registerUser(Role.BARBER, 'barber-reorder-owner-b');
        await createBarberProfile(barberA.token, 'Reorder Owner A');
        await createBarberProfile(barberB.token, 'Reorder Owner B');

        const ownedImage = await createGalleryImage(barberA.token, 'https://cdn.example.com/barbers/reorder-owned.jpg');
        const foreignImage = await createGalleryImage(barberB.token, 'https://cdn.example.com/barbers/reorder-foreign.jpg');

        const response = await api
            .patch('/api/v1/barbers/me/gallery/reorder')
            .set('Authorization', `Bearer ${barberA.token}`)
            .send({ imageIds: [foreignImage.id] });

        assert.equal(response.status, 404);
        const unchangedImage = await prisma.barberImage.findUniqueOrThrow({
            where: { id: ownedImage.id },
            select: { sortOrder: true },
        });
        assert.equal(unchangedImage.sortOrder, 0);
    });

    test('returns 401 when the gallery is accessed without authentication', async () => {
        const response = await api.post('/api/v1/barbers/me/gallery').send({ imageUrl: 'https://cdn.example.com/barbers/no-auth.jpg' });
        assert.equal(response.status, 401);
    });

    test('rejects adding more images beyond the configured maximum', async () => {
        const barber = await registerUser(Role.BARBER, 'barber-limit');
        await createBarberProfile(barber.token, 'Limit Studio');

        for (let index = 0; index < MAX_GALLERY_IMAGES; index += 1) {
            await createGalleryImage(barber.token, `https://cdn.example.com/barbers/limit-${index}.jpg`, `Image ${index}`);
        }

        const response = await api
            .post('/api/v1/barbers/me/gallery')
            .set('Authorization', `Bearer ${barber.token}`)
            .send({ imageUrl: 'https://cdn.example.com/barbers/limit-overflow.jpg', altText: 'Overflow image' });

        assert.equal(response.status, 409);
        assert.equal(response.body.message, 'Gallery image limit reached');
    });

    test('returns 404 for a public request to an inactive barber gallery', async () => {
        const barber = await registerUser(Role.BARBER, 'barber-inactive');
        await createBarberProfile(barber.token, 'Inactive Studio');

        const barberRecord = await prisma.barber.findUniqueOrThrow({ where: { userId: barber.user.id }, select: { id: true } });
        await prisma.barber.update({ where: { id: barberRecord.id }, data: { isActive: false } });

        const response = await api.get(`/api/v1/barbers/${barberRecord.id}/gallery`);
        assert.equal(response.status, 404);
    });
});
