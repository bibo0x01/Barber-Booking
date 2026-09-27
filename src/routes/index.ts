import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { barberRouter } from '../modules/barbers/barber.routes';
import { userRouter } from '../modules/users/user.routes';

export const router = Router();

router.use('/auth', authRouter);
router.use('/barbers', barberRouter);
router.use('/users', userRouter);

router.get('/health', (_request, response) => {
    response.json({
        success: true,
        message: 'API is running',
    });
});