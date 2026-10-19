import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate } from '../../../middlewares/auth.middleware';
import { requireRole } from '../../../middlewares/role.middleware';
import {
    addCurrentBarberGalleryImage,
    deleteCurrentBarberGalleryImage,
    getCurrentBarberGallery,
    getPublicBarberGallery,
    reorderCurrentBarberGallery,
} from './gallery.controller';

export const galleryRouter = Router();

const authenticateBarber = [authenticate, requireRole(Role.BARBER)];

galleryRouter.post('/me/gallery', ...authenticateBarber, addCurrentBarberGalleryImage);
galleryRouter.get('/me/gallery', ...authenticateBarber, getCurrentBarberGallery);
galleryRouter.patch('/me/gallery/reorder', ...authenticateBarber, reorderCurrentBarberGallery);
galleryRouter.delete('/me/gallery/:imageId', ...authenticateBarber, deleteCurrentBarberGalleryImage);
galleryRouter.get('/:barberId/gallery', getPublicBarberGallery);
