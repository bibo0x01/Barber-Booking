import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import {
    createCurrentBarber,
    getCurrentBarber,
    getCurrentBarberProfile,
    getPublicBarberProfileById,
    updateCurrentBarber,
} from './barber.controller';

export const barberRouter = Router();

barberRouter.post('/', authenticate, requireRole(Role.BARBER), createCurrentBarber);
barberRouter.get('/me', authenticate, requireRole(Role.BARBER), getCurrentBarber);
barberRouter.get('/me/profile', authenticate, requireRole(Role.BARBER), getCurrentBarberProfile);
barberRouter.patch('/me', authenticate, requireRole(Role.BARBER), updateCurrentBarber);
barberRouter.get('/:barberId/profile', getPublicBarberProfileById);
