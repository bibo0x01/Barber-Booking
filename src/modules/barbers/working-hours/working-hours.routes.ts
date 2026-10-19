import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../../../middlewares/auth.middleware';
import { requireRole } from '../../../middlewares/role.middleware';
import {
    createCurrentBarberWorkingHour,
    deleteCurrentBarberWorkingHour,
    getCurrentBarberWorkingHours,
    getPublicBarberWorkingHours,
    updateCurrentBarberWorkingHour,
} from './working-hours.controller';

export const workingHoursRouter = Router();

const authenticateBarber = [authenticate, requireRole(Role.BARBER)];

workingHoursRouter.post('/me/working-hours', ...authenticateBarber, createCurrentBarberWorkingHour);
workingHoursRouter.get('/me/working-hours', ...authenticateBarber, getCurrentBarberWorkingHours);
workingHoursRouter.patch('/me/working-hours/:workingHourId', ...authenticateBarber, updateCurrentBarberWorkingHour);
workingHoursRouter.delete('/me/working-hours/:workingHourId', ...authenticateBarber, deleteCurrentBarberWorkingHour);
workingHoursRouter.get('/:barberId/working-hours', getPublicBarberWorkingHours);
