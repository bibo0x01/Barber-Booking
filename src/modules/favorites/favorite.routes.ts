import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import { favoriteBarber, getBarberFavoriteStatus, getMyFavoriteBarbers, unfavoriteBarber } from './favorite.controller';

export const favoriteRouter = Router();

favoriteRouter.post('/:barberId/favorite', authenticate, requireRole(Role.USER), favoriteBarber);
favoriteRouter.delete('/:barberId/favorite', authenticate, requireRole(Role.USER), unfavoriteBarber);
favoriteRouter.get('/:barberId/favorite', authenticate, requireRole(Role.USER), getBarberFavoriteStatus);

export const userFavoriteRouter = Router();
userFavoriteRouter.get('/me/favorites', authenticate, requireRole(Role.USER), getMyFavoriteBarbers);
