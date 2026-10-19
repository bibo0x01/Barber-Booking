import { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError';
import {
    completeQueueEntry,
    cancelBooking,
    createBooking,
    getBarberBooking,
    getBarberBookings,
    getBarberQueue,
    getCustomerBooking,
    getCustomerBookings,
    getCustomerQueue,
    rebookCustomerBooking,
    startQueueEntry,
} from './booking.service';
import {
    bookingIdParamsSchema,
    bookingListQuerySchema,
    createBookingSchema,
    cancelBookingSchema,
    customerBookingListQuerySchema,
    queueIdParamsSchema,
    rebookSchema,
} from './booking.validation';

const validationError = (error: { issues: Array<{ path: PropertyKey[]; message: string }> }): ApiError =>
    new ApiError(
        400,
        'Validation failed',
        error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    );

const authenticatedUserId = (request: Request): string => {
    if (!request.authUser) {
        throw new ApiError(401, 'Authentication required');
    }

    return request.authUser.id;
};

const parseListQuery = (request: Request) => {
    const result = bookingListQuerySchema.safeParse(request.query);
    if (!result.success) {
        throw validationError(result.error);
    }
    return result.data;
};

const parseCustomerListQuery = (request: Request) => {
    const result = customerBookingListQuerySchema.safeParse(request.query);
    if (!result.success) {
        throw validationError(result.error);
    }
    return result.data;
};

export const createCustomerBooking = async (request: Request, response: Response): Promise<void> => {
    const result = createBookingSchema.safeParse(request.body);
    if (!result.success) {
        throw validationError(result.error);
    }

    const booking = await createBooking(authenticatedUserId(request), result.data);
    response.status(201).json({ success: true, message: 'Booking created successfully', data: booking });
};

export const getCurrentCustomerBookings = async (request: Request, response: Response): Promise<void> => {
    const bookings = await getCustomerBookings(authenticatedUserId(request), parseCustomerListQuery(request));
    response.json({ success: true, message: 'Bookings retrieved successfully', data: bookings });
};

export const rebookCustomerBookingRequest = async (request: Request, response: Response): Promise<void> => {
    const params = bookingIdParamsSchema.safeParse(request.params);
    if (!params.success) {
        throw validationError(params.error);
    }

    const body = rebookSchema.safeParse(request.body);
    if (!body.success) {
        throw validationError(body.error);
    }

    const booking = await rebookCustomerBooking(
        authenticatedUserId(request),
        params.data.bookingId,
        body.data,
        request.app.locals.bookingPushDispatcher,
    );
    response.status(201).json({ success: true, message: 'Booking created successfully', data: booking });
};

const cancelCurrentBooking = async (request: Request, response: Response, role: 'USER' | 'BARBER'): Promise<void> => {
    const params = bookingIdParamsSchema.safeParse(request.params);
    if (!params.success) {
        throw validationError(params.error);
    }

    const body = cancelBookingSchema.safeParse(request.body ?? {});
    if (!body.success) {
        throw validationError(body.error);
    }

    const booking = await cancelBooking(
        { userId: authenticatedUserId(request), role },
        params.data.bookingId,
        body.data,
        request.app.locals.bookingPushDispatcher,
        request.app.locals.queueUpdateDispatcher,
    );
    response.json({ success: true, message: 'Booking cancelled successfully', data: booking });
};

export const cancelCurrentCustomerBooking = async (request: Request, response: Response): Promise<void> =>
    cancelCurrentBooking(request, response, 'USER');

export const cancelCurrentBarberBooking = async (request: Request, response: Response): Promise<void> =>
    cancelCurrentBooking(request, response, 'BARBER');

export const getCurrentCustomerBooking = async (request: Request, response: Response): Promise<void> => {
    const result = bookingIdParamsSchema.safeParse(request.params);
    if (!result.success) {
        throw validationError(result.error);
    }

    const booking = await getCustomerBooking(authenticatedUserId(request), result.data.bookingId);
    response.json({ success: true, message: 'Booking retrieved successfully', data: booking });
};

export const getCurrentBarberBookings = async (request: Request, response: Response): Promise<void> => {
    const bookings = await getBarberBookings(authenticatedUserId(request), parseListQuery(request));
    response.json({ success: true, message: 'Bookings retrieved successfully', data: bookings });
};

export const getCurrentBarberBooking = async (request: Request, response: Response): Promise<void> => {
    const result = bookingIdParamsSchema.safeParse(request.params);
    if (!result.success) {
        throw validationError(result.error);
    }

    const booking = await getBarberBooking(authenticatedUserId(request), result.data.bookingId);
    response.json({ success: true, message: 'Booking retrieved successfully', data: booking });
};

export const getCurrentCustomerQueue = async (request: Request, response: Response): Promise<void> => {
    const result = bookingIdParamsSchema.safeParse(request.params);
    if (!result.success) {
        throw validationError(result.error);
    }

    const queue = await getCustomerQueue(authenticatedUserId(request), result.data.bookingId);
    response.json({ success: true, message: 'Queue retrieved successfully', data: queue });
};

export const getCurrentBarberQueue = async (_request: Request, response: Response): Promise<void> => {
    const queue = await getBarberQueue(authenticatedUserId(_request));
    response.json({ success: true, message: 'Queue retrieved successfully', data: queue });
};

export const startCurrentBarberQueueEntry = async (request: Request, response: Response): Promise<void> => {
    const result = queueIdParamsSchema.safeParse(request.params);
    if (!result.success) {
        throw validationError(result.error);
    }

    const queue = await startQueueEntry(
        authenticatedUserId(request),
        result.data.queueId,
        request.app.locals.queueUpdateDispatcher,
    );
    response.json({ success: true, message: 'Queue started successfully', data: queue });
};

export const completeCurrentBarberQueueEntry = async (request: Request, response: Response): Promise<void> => {
    const result = queueIdParamsSchema.safeParse(request.params);
    if (!result.success) {
        throw validationError(result.error);
    }

    const queue = await completeQueueEntry(
        authenticatedUserId(request),
        result.data.queueId,
        request.app.locals.queueUpdateDispatcher,
    );
    response.json({ success: true, message: 'Queue completed successfully', data: queue });
};
