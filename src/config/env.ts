import dotenv from 'dotenv';

dotenv.config();

const required = (name: string): string => {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
};

export const env = {
    port: Number(process.env.PORT ?? 3000),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    databaseUrl: required('DATABASE_URL'),
    apiPrefix: process.env.API_PREFIX ?? '/api/v1',
    jwtSecret: required('JWT_SECRET'),
};