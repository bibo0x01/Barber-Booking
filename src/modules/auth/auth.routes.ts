import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { getCurrentUser, loginUser, registerBarber, registerUser } from './auth.controller';

export const authRouter = Router();

authRouter.post('/register', registerUser);
authRouter.post('/register/barber', registerBarber);
authRouter.post('/login', loginUser);
authRouter.get('/me', authenticate, getCurrentUser);