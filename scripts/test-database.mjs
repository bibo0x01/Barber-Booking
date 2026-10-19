import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDatabaseName = 'barber_booking_test';
const developmentDatabaseName = 'barber_booking';
const mode = process.argv[2];
const validModes = new Set(['create', 'verify', 'deploy', 'status', 'test', 'gallery', 'validate', 'generate']);

if (!validModes.has(mode)) {
    console.error(`Usage: node scripts/test-database.mjs <${[...validModes].join('|')}>`);
    process.exit(2);
}

const envPath = path.join(projectRoot, '.env');
let fileEnv;
try {
    fileEnv = dotenv.parse(readFileSync(envPath));
} catch {
    console.error('Cannot read .env; refusing test database operation.');
    process.exit(2);
}

const developmentUrlValue = fileEnv.DATABASE_URL;
if (!developmentUrlValue) {
    console.error('.env must define DATABASE_URL; refusing test database operation.');
    process.exit(2);
}

const developmentUrl = new URL(developmentUrlValue);
const databaseName = (url) => decodeURIComponent(url.pathname.replace(/^\//, '').split('/')[0]);
if (!['postgres:', 'postgresql:'].includes(developmentUrl.protocol) || databaseName(developmentUrl) !== developmentDatabaseName) {
    console.error(`Expected .env DATABASE_URL to target the configured ${developmentDatabaseName} PostgreSQL database; refusing operation.`);
    process.exit(2);
}
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
if (!loopbackHosts.has(developmentUrl.hostname.toLowerCase()) || fileEnv.NODE_ENV === 'production' || process.env.NODE_ENV === 'production') {
    console.error('Test database operations are restricted to a non-production local PostgreSQL target; refusing operation.');
    process.exit(2);
}

const testUrl = new URL(developmentUrl);
testUrl.pathname = `/${testDatabaseName}`;
const prismaUrl = (url) => url.toString();
const clientFor = (url) => new PrismaClient({ datasources: { db: { url: prismaUrl(url) } } });

const getIdentity = async (url) => {
    const client = clientFor(url);
    try {
        const [identity] = await client.$queryRaw`
            SELECT current_database() AS database_name,
                   current_user AS role_name,
                   inet_server_addr()::text AS server_address,
                   inet_server_port() AS server_port,
                   (SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user) AS can_create_database,
                   EXISTS (SELECT 1 FROM pg_database WHERE datname = ${testDatabaseName}) AS test_database_exists
        `;
        return identity;
    } finally {
        await client.$disconnect();
    }
};

const sameServer = (left, right) =>
    left.server_address !== null &&
    right.server_address !== null &&
    left.server_address === right.server_address &&
    left.server_port === right.server_port;

const verifyDevelopmentTarget = async () => {
    const identity = await getIdentity(developmentUrl);
    if (identity.database_name !== developmentDatabaseName) {
        throw new Error('The resolved development connection did not match the configured database name.');
    }
    return identity;
};

const verifyTestTarget = async (developmentIdentity) => {
    const identity = await getIdentity(testUrl);
    if (identity.database_name !== testDatabaseName) {
        throw new Error('The resolved test connection did not match the required test database name.');
    }
    if (identity.database_name === developmentIdentity.database_name || !sameServer(identity, developmentIdentity)) {
        throw new Error('The test connection is not proven separate on the verified PostgreSQL server.');
    }
    if (identity.role_name !== developmentIdentity.role_name) {
        throw new Error('The test connection resolved to a different database role than the verified configuration.');
    }
    return identity;
};

const run = (command, args, env) => {
    const result = spawnSync(command, args, { cwd: projectRoot, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
};

try {
    const developmentIdentity = await verifyDevelopmentTarget();

    if (mode === 'create') {
        if (developmentIdentity.test_database_exists) {
            throw new Error(`${testDatabaseName} already exists; refusing to modify or reuse it in create mode.`);
        }
        if (!developmentIdentity.can_create_database) {
            throw new Error('The configured PostgreSQL role cannot create a dedicated test database.');
        }

        const username = decodeURIComponent(developmentUrl.username);
        if (!username) throw new Error('The PostgreSQL URL has no explicit role; refusing database creation.');
        const createEnv = { ...process.env };
        if (developmentUrl.password) createEnv.PGPASSWORD = decodeURIComponent(developmentUrl.password);
        if (developmentUrl.searchParams.has('sslmode')) createEnv.PGSSLMODE = developmentUrl.searchParams.get('sslmode');
        const createArgs = [
            '--no-password',
            '--host', developmentUrl.hostname,
            '--port', developmentUrl.port || '5432',
            '--username', username,
            '--maintenance-db', 'postgres',
            testDatabaseName,
        ];
        run('createdb', createArgs, createEnv);

        const testIdentity = await verifyTestTarget(developmentIdentity);
        console.log(`Created and verified separate database ${testIdentity.database_name} on the verified PostgreSQL server.`);
        process.exit(0);
    }

    const testIdentity = await verifyTestTarget(developmentIdentity);
    const safeEnv = {
        ...process.env,
        DATABASE_URL: prismaUrl(testUrl),
        NODE_ENV: mode === 'test' ? 'test' : (process.env.NODE_ENV ?? 'development'),
    };

    if (mode === 'verify') {
        console.log(`Verified isolated database=${testIdentity.database_name}, role=${testIdentity.role_name}, server=${testIdentity.server_address}:${testIdentity.server_port}; development database=${developmentIdentity.database_name}.`);
        process.exit(0);
    }
    if (mode === 'deploy') run('npx', ['prisma', 'migrate', 'deploy'], safeEnv);
    if (mode === 'status') run('npx', ['prisma', 'migrate', 'status'], safeEnv);
    if (mode === 'validate') run('npx', ['prisma', 'validate'], safeEnv);
    if (mode === 'generate') run('npx', ['prisma', 'generate'], safeEnv);
    if (mode === 'test' || mode === 'gallery') {
        const testFiles = mode === 'gallery'
            ? [path.join('src/tests', 'gallery.test.ts')]
            : readdirSync(path.join(projectRoot, 'src/tests'))
                .filter((entry) => entry.endsWith('.test.ts'))
                .sort()
                .map((entry) => path.join('src/tests', entry));
        if (testFiles.length === 0) throw new Error('No source test files found.');
        run(path.join(projectRoot, 'node_modules/.bin/tsx'), ['--test', '--test-concurrency=1', ...testFiles], safeEnv);
    }
} catch (error) {
    console.error(`Test database safety guard stopped: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exit(2);
}
