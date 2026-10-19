import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../app';
import { env } from '../config/env';
import { createCorsOptions } from '../config/cors';
import { hasMinimumProductionJwtSecretLength } from '../config/security';
import { errorMiddleware } from '../middlewares/error.middleware';
import SwaggerParser from '@apidevtools/swagger-parser';
import { registerSchema, loginSchema } from '../modules/auth/auth.validation';
import { updateProfileSchema, changePasswordSchema } from '../modules/users/user.validation';
import { createBarberSchema, updateBarberSchema, updateBarberStatusSchema } from '../modules/barbers/barber.validation';
import { addGalleryImageSchema, reorderGallerySchema } from '../modules/barbers/gallery/gallery.validation';
import { createServiceSchema, updateServiceSchema } from '../modules/barbers/services/service.validation';
import { createWorkingHourSchema, updateWorkingHourSchema } from '../modules/barbers/working-hours/working-hours.validation';
import { upsertBarberLocationSchema } from '../modules/barbers/location/barber-location.validation';
import { createBookingSchema, rebookSchema, cancelBookingSchema } from '../modules/bookings/booking.validation';
import { registerDeviceTokenSchema } from '../modules/notifications/notification.validation';

test('expired bearer credentials are rejected by the mounted booking API', async () => {
    const expiredToken = jwt.sign({ userId: 'expired-security-test', role: 'USER', exp: 1 }, env.jwtSecret);

    const response = await request(app)
        .get('/api/v1/bookings/me')
        .set('Authorization', `Bearer ${expiredToken}`);

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
    assert.equal(response.body.message, 'Invalid or expired token');
});

test('mounted notification routes require authentication and discovery rejects unknown query fields', async () => {
    const notifications = await request(app).get('/api/v1/notifications');
    assert.equal(notifications.status, 401);
    assert.equal(notifications.body.success, false);

    const invalidDiscoveryQuery = await request(app).get('/api/v1/barbers?unsupported=true');
    assert.equal(invalidDiscoveryQuery.status, 400);
    assert.equal(invalidDiscoveryQuery.body.message, 'Validation failed');
});

test('malformed and oversized JSON requests return safe client-error contracts', async () => {
    const malformed = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email":');

    assert.equal(malformed.status, 400);
    assert.deepEqual(malformed.body, {
        success: false,
        message: 'Invalid JSON request body',
        errors: [],
    });

    const oversized = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ payload: 'x'.repeat(1_100_000) }));

    assert.equal(oversized.status, 413);
    assert.deepEqual(oversized.body, {
        success: false,
        message: 'Request body too large',
        errors: [],
    });
});

test('gallery test command selects only the gallery suite behind the test database guard', () => {
    const script = require('node:fs').readFileSync('scripts/test-database.mjs', 'utf8') as string;

    assert.match(script, /mode === 'test' \|\| mode === 'gallery'/);
    assert.match(script, /mode === 'gallery'[\s\S]*gallery\.test\.ts/);
    assert.match(script, /loopbackHosts/);
    assert.match(script, /NODE_ENV === 'production'/);
});

test('production CORS accepts configured web origins and native requests without Origin only', () => {
    const check = (options: ReturnType<typeof createCorsOptions>, origin?: string) => new Promise<boolean>((resolve, reject) => {
        const customOrigin = options.origin;
        if (typeof customOrigin !== 'function') {
            reject(new Error('Expected configured CORS callback'));
            return;
        }
        customOrigin(origin, (error, allowed) => error ? reject(error) : resolve(allowed === true));
    });
    const options = createCorsOptions('production', ['https://client.example.test']);
    const noConfiguredOrigins = createCorsOptions('production', []);

    return Promise.all([
        check(options, 'https://client.example.test').then((allowed) => assert.equal(allowed, true)),
        check(options, 'https://untrusted.example.test').then((allowed) => assert.equal(allowed, false)),
        check(noConfiguredOrigins, 'https://any.example.test').then((allowed) => assert.equal(allowed, false)),
        check(noConfiguredOrigins).then((allowed) => assert.equal(allowed, true)),
    ]).then(() => undefined);
});

test('production JWT secret length guard requires at least 32 UTF-8 bytes', () => {
    assert.equal(hasMinimumProductionJwtSecretLength('x'.repeat(31)), false);
    assert.equal(hasMinimumProductionJwtSecretLength('x'.repeat(32)), true);
    assert.equal(hasMinimumProductionJwtSecretLength('é'.repeat(16)), true);
});
test('development OpenAPI JSON and Swagger UI expose the complete API document', async () => {
    const documentResponse = await request(app).get('/api-docs/openapi.json');
    assert.equal(documentResponse.status, 200);
    assert.equal(documentResponse.body.openapi, '3.0.3');
    assert.match(documentResponse.headers['content-type'], /application\/json/);
    assert.equal(documentResponse.body.servers[0].url, env.apiPrefix);
    const operationCount = Object.values(documentResponse.body.paths as Record<string, Record<string, unknown>>)
        .reduce((total, pathItem) => total + Object.keys(pathItem).filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method)).length, 0);
    assert.equal(operationCount, 56);
    assert.ok(documentResponse.body.paths['/barbers/me/queue/{queueId}/start']);
    assert.ok(documentResponse.body.paths['/notifications/devices/{deviceTokenId}']);

    const rootResponse = await request(app).get('/api-docs');
    assert.equal(rootResponse.status, 301);
    assert.equal(rootResponse.headers.location, '/api-docs/');

    const uiResponse = await request(app).get('/api-docs/');
    assert.equal(uiResponse.status, 200);
    assert.match(uiResponse.headers['content-type'], /text\/html/);
    assert.match(uiResponse.text, /swagger-ui/);

    const initResponse = await request(app).get('/api-docs/swagger-ui-init.js');
    assert.equal(initResponse.status, 200);
    assert.match(initResponse.headers['content-type'], /javascript/);
    assert.match(initResponse.text, /Barber Booking API/);
    assert.match(initResponse.text, /bearerAuth/);
});

test('OpenAPI document validates, resolves refs, and declares security for protected and public operations', async () => {
    const documentPath = path.resolve(process.cwd(), 'docs/openapi.json');
    const document = await SwaggerParser.validate(documentPath) as unknown as {
        openapi: string;
        servers: unknown;
        components: { securitySchemes: { bearerAuth: unknown } };
        paths: Record<string, Record<string, any>>;
    };
    const dereferencedDocument = await SwaggerParser.dereference(documentPath) as unknown as Record<string, any>;

    assert.equal(document.openapi, '3.0.3');
    assert.deepEqual(document.servers, [{ url: env.apiPrefix, description: 'Configured API prefix (default: /api/v1)' }]);
    assert.deepEqual(document.components.securitySchemes.bearerAuth, {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token returned by register or login. Send as Authorization: Bearer <token>.',
    });
    assert.deepEqual(document.paths['/auth/me'].get.security, [{ bearerAuth: [] }]);
    assert.deepEqual(document.paths['/bookings'].post.security, [{ bearerAuth: [] }]);
    assert.deepEqual(document.paths['/barbers/me/services'].post['x-required-role'], 'BARBER');
    assert.deepEqual(document.paths['/bookings/me'].get['x-required-role'], 'USER');
    assert.deepEqual(document.paths['/barbers'].get.security, [{ bearerAuth: [] }, {}]);
    assert.equal(document.paths['/barbers/{barberId}/profile'].get.security.some((requirement: Record<string, string[]>) => Object.keys(requirement).length === 0), true);
    assert.equal(document.paths['/health'].get.security, undefined);

    for (const [route, pathItem] of Object.entries(document.paths)) {
        for (const [method, operation] of Object.entries(pathItem as Record<string, Record<string, unknown>>)) {
            if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
            const names = new Set<string>();
            for (const parameter of (operation.parameters as Array<Record<string, unknown>> | undefined) ?? []) {
                const resolved = '$ref' in parameter
                    ? (parameter.$ref as string).split('/').slice(1).reduce((value: any, key) => value?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], dereferencedDocument as any)
                    : parameter;
                if (resolved?.in === 'path') {
                    assert.equal(resolved.required, true, `${method.toUpperCase()} ${route} path parameter ${String(resolved.name)} must be required`);
                    names.add(String(resolved.name));
                }
            }
            for (const match of route.matchAll(/\{([^}]+)\}/g)) {
                assert.equal(names.has(match[1]), true, `${method.toUpperCase()} ${route} must declare path parameter ${match[1]}`);
            }
        }
    }
});

test('documented request examples conform to their current Zod validation schemas', () => {
    const document = JSON.parse(require('node:fs').readFileSync(path.resolve(process.cwd(), 'docs/openapi.json'), 'utf8')) as {
        components: {
            requestBodies: Record<string, {
                content?: Record<string, { example?: unknown }>;
            }>;
        };
    };
    const examples: Record<string, { safeParse: (value: unknown) => { success: boolean; error?: { issues: unknown[] } } }> = {
        Register: registerSchema,
        Login: loginSchema,
        UserUpdate: updateProfileSchema,
        PasswordChange: changePasswordSchema,
        BarberCreate: createBarberSchema,
        BarberUpdate: updateBarberSchema,
        BarberStatus: updateBarberStatusSchema,
        GalleryImage: addGalleryImageSchema,
        GalleryReorder: reorderGallerySchema,
        ServiceCreate: createServiceSchema,
        ServiceUpdate: updateServiceSchema,
        WorkingHourCreate: createWorkingHourSchema,
        WorkingHourUpdate: updateWorkingHourSchema,
        Location: upsertBarberLocationSchema,
        BookingCreate: createBookingSchema,
        Rebook: rebookSchema,
        EmptyObject: cancelBookingSchema,
        DeviceToken: registerDeviceTokenSchema,
    };

    for (const [requestBodyName, schema] of Object.entries(examples)) {
        const example = document.components.requestBodies[requestBodyName]?.content?.['application/json']?.example;
        assert.notEqual(example, undefined, `${requestBodyName} must have an example`);
        const result = schema.safeParse(example);
        assert.equal(result.success, true, `${requestBodyName} example must pass its Zod validator: ${JSON.stringify(result.success ? [] : result.error?.issues)}`);
    }
});

test('unexpected HTTP errors do not expose stack, database, SQL, or credential details', async () => {
    const errorApp = express();
    errorApp.get('/internal-error', (_request, _response, next) => {
        next(new Error('passwordHash=sentinel DATABASE_URL=postgresql://private.invalid/db SELECT * FROM User'));
    });
    errorApp.use(errorMiddleware);

    const response = await request(errorApp).get('/internal-error');

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
        success: false,
        message: 'Something went wrong',
        errors: [],
    });
    assert.equal(JSON.stringify(response.body).includes('sentinel'), false);
    assert.equal(JSON.stringify(response.body).includes('SELECT'), false);
    assert.equal('stack' in response.body, false);
});