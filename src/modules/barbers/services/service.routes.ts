import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../../../middlewares/auth.middleware';
import { requireRole } from '../../../middlewares/role.middleware';
import {
    createCurrentBarberService,
    deleteCurrentBarberService,
    getCurrentBarberServices,
    getPublicBarberServices,
    updateCurrentBarberService,
} from './service.controller';

export const servicesRouter = Router();

const authenticateBarber = [authenticate, requireRole(Role.BARBER)];

servicesRouter.post('/me/services', ...authenticateBarber, createCurrentBarberService);
servicesRouter.get('/me/services', ...authenticateBarber, getCurrentBarberServices);
servicesRouter.patch('/me/services/:serviceId', ...authenticateBarber, updateCurrentBarberService);
servicesRouter.delete('/me/services/:serviceId', ...authenticateBarber, deleteCurrentBarberService);
servicesRouter.get('/:barberId/services', getPublicBarberServices);
