import type { CorsOptions } from 'cors';

export const createCorsOptions = (nodeEnv: string, allowedOrigins: readonly string[]): CorsOptions => ({
    origin: (origin, callback) => {
        if (!origin || nodeEnv !== 'production' || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(null, false);
    },
});
