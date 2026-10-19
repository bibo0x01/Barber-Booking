import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import {
    cancelCurrentCustomerBooking,
    createCustomerBooking,
    getCurrentCustomerBooking,
    getCurrentCustomerBookings,
    getCurrentCustomerQueue,
    rebookCustomerBookingRequest,
} from './booking.controller';

export const bookingRouter = Router();
const authenticateUser = [authenticate, requireRole(Role.USER)];

bookingRouter.post('/', ...authenticateUser, createCustomerBooking);
bookingRouter.patch('/:bookingId/cancel', ...authenticateUser, cancelCurrentCustomerBooking);
bookingRouter.post('/:bookingId/rebook', ...authenticateUser, rebookCustomerBookingRequest);
bookingRouter.get('/me', ...authenticateUser, getCurrentCustomerBookings);
bookingRouter.get('/:bookingId', ...authenticateUser, getCurrentCustomerBooking);
bookingRouter.get('/:bookingId/queue', ...authenticateUser, getCurrentCustomerQueue);
