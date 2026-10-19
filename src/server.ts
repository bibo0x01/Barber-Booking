import { createServer } from 'node:http';
import { app } from './app';
import { prisma } from './config/database';
import { env } from './config/env';
import { createQueueSocketServer } from './config/socket';

const startServer = async (): Promise<void> => {
    await prisma.$connect();

    const httpServer = createServer(app);
    const queueSocketServer = createQueueSocketServer(httpServer);

    httpServer.listen(env.port, () => {
        console.log(`API listening on port ${env.port}`);
    });

    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        console.log(`${signal} received. Shutting down gracefully...`);

        try {
            await new Promise<void>((resolve) => queueSocketServer.close(() => resolve()));
        } finally {
            await prisma.$disconnect();
            process.exit(0);
        }
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
};

startServer().catch(async (error: unknown) => {
    console.error('Failed to start server:', error);
    await prisma.$disconnect();
    process.exit(1);
});