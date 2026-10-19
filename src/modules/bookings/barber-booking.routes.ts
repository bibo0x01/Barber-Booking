import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import {
    cancelCurrentBarberBooking,
    completeCurrentBarberQueueEntry,
    getCurrentBarberBooking,
    getCurrentBarberBookings,
    getCurrentBarberQueue,
    startCurrentBarberQueueEntry,
} from './booking.controller';

export const barberBookingRouter = Router();
const authenticateBarber = [authenticate, requireRole(Role.BARBER)];

barberBookingRouter.get('/me/bookings', ...authenticateBarber, getCurrentBarberBookings);
barberBookingRouter.get('/me/bookings/:bookingId', ...authenticateBarber, getCurrentBarberBooking);
barberBookingRouter.patch('/me/bookings/:bookingId/cancel', ...authenticateBarber, cancelCurrentBarberBooking);
barberBookingRouter.get('/me/queue', ...authenticateBarber, getCurrentBarberQueue);
barberBookingRouter.patch('/me/queue/:queueId/start', ...authenticateBarber, startCurrentBarberQueueEntry);
barberBookingRouter.patch('/me/queue/:queueId/complete', ...authenticateBarber, completeCurrentBarberQueueEntry);
