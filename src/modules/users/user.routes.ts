import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { changeCurrentUserPassword, updateCurrentUser } from './user.controller';

export const userRouter = Router();

userRouter.patch('/me', authenticate, updateCurrentUser);
userRouter.patch('/me/password', authenticate, changeCurrentUserPassword);