import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import { userFavoriteRouter } from '../favorites/favorite.routes';
import { changeCurrentUserPassword, updateCurrentUser } from './user.controller';

export const userRouter = Router();

userRouter.patch('/me', authenticate, updateCurrentUser);
userRouter.patch('/me/password', authenticate, changeCurrentUserPassword);
userRouter.use('/', userFavoriteRouter);
