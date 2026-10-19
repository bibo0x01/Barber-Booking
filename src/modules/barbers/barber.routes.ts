import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, authenticateOptional } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import { barberBookingRouter } from '../bookings/barber-booking.routes';
import { favoriteRouter } from '../favorites/favorite.routes';
import { galleryRouter } from './gallery/gallery.routes';
import { barberLocationRouter } from './location/barber-location.routes';
import { servicesRouter } from './services/service.routes';
import { workingHoursRouter } from './working-hours/working-hours.routes';
import {
	createCurrentBarber,
	getBarberDirectory,
	getCurrentBarber,
	getCurrentBarberStatus,
	getPublicBarber,
	getPublicBarberProfile,
	updateCurrentBarber,
	updateCurrentBarberStatus,
} from './barber.controller';

export const barberRouter = Router();

barberRouter.get('/', authenticateOptional, getBarberDirectory);
barberRouter.post('/', authenticate, requireRole(Role.BARBER), createCurrentBarber);
barberRouter.get('/me', authenticate, requireRole(Role.BARBER), getCurrentBarber);
barberRouter.get('/me/status', authenticate, requireRole(Role.BARBER), getCurrentBarberStatus);
barberRouter.patch('/me/status', authenticate, requireRole(Role.BARBER), updateCurrentBarberStatus);
barberRouter.patch('/me', authenticate, requireRole(Role.BARBER), updateCurrentBarber);
barberRouter.get('/:barberId/profile', authenticateOptional, getPublicBarberProfile);
barberRouter.use('/', favoriteRouter);
barberRouter.get('/:barberId', authenticateOptional, getPublicBarber);
barberRouter.use('/', galleryRouter);
barberRouter.use('/', servicesRouter);
barberRouter.use('/', workingHoursRouter);
barberRouter.use('/', barberLocationRouter);
barberRouter.use('/', barberBookingRouter);
