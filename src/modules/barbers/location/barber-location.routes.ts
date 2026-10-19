import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../../../middlewares/auth.middleware';
import { requireRole } from '../../../middlewares/role.middleware';
import {
    getCurrentBarberLocation,
    getPublicBarberLocation,
    putCurrentBarberLocation,
} from './barber-location.controller';

export const barberLocationRouter = Router();

const authenticateBarber = [authenticate, requireRole(Role.BARBER)];

barberLocationRouter.put('/me/location', ...authenticateBarber, putCurrentBarberLocation);
barberLocationRouter.get('/me/location', ...authenticateBarber, getCurrentBarberLocation);
barberLocationRouter.get('/:barberId/location', getPublicBarberLocation);
