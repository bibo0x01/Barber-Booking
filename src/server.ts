import { app } from './app';
import { prisma } from './config/database';
import { env } from './config/env';

const startServer = async (): Promise<void> => {
    await prisma.$connect();

    const server = app.listen(env.port, () => {
        console.log(`API listening on port ${env.port}`);
    });

    const shutdown = async (signal: string): Promise<void> => {
        console.log(`${signal} received. Shutting down gracefully...`);

        server.close(async () => {
            await prisma.$disconnect();
            process.exit(0);
        });
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
};

startServer().catch(async (error: unknown) => {
    console.error('Failed to start server:', error);
    await prisma.$disconnect();
    process.exit(1);
});