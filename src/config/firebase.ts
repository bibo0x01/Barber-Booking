import { cert, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { env } from './env';

let firebaseApp: App | null = null;

const hasFirebaseConfig = (): boolean => Boolean(env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey);

export const getFirebaseApp = (): App | null => {
    if (!hasFirebaseConfig() || env.nodeEnv === 'test') {
        return null;
    }

    if (!firebaseApp) {
        firebaseApp = initializeApp({
            credential: cert({
                projectId: env.firebaseProjectId,
                clientEmail: env.firebaseClientEmail,
                privateKey: env.firebasePrivateKey.replace(/\\n/g, '\n'),
            }),
        });
    }

    return firebaseApp;
};

export const getFirebaseMessaging = () => getFirebaseApp() ? getMessaging(getFirebaseApp()!) : null;
