import dotenv from 'dotenv';
import { hasMinimumProductionJwtSecretLength } from './security';

dotenv.config();

const required = (name: string): string => {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
};

const nodeEnv = process.env.NODE_ENV ?? 'development';
const jwtSecret = required('JWT_SECRET');

if (nodeEnv === 'production' && !hasMinimumProductionJwtSecretLength(jwtSecret)) {
    throw new Error('JWT_SECRET must contain at least 32 bytes in production');
}

export const env = {
    port: Number(process.env.PORT ?? 3000),
    nodeEnv,
    databaseUrl: required('DATABASE_URL'),
    apiPrefix: process.env.API_PREFIX ?? '/api/v1',
    jwtSecret,
    corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    appTimezone: process.env.APP_TIMEZONE ?? 'Africa/Cairo',
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? '',
    firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? '',
    firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY ?? '',
};

try {
    new Intl.DateTimeFormat('en-US', { timeZone: env.appTimezone }).format(new Date(0));
} catch {
    throw new Error('APP_TIMEZONE must be a valid IANA timezone');
}