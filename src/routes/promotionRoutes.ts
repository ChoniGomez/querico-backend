import { Router } from 'express';
import {
  getPromotions,
  createOrUpdatePromotion,
  deletePromotion,
} from '../controllers/promotionController';
import { optionalAuthenticate, isAdmin } from '../middleware/auth';

const router = Router();

// GET /api/promotions - Listar promociones (para admin con ?all=true devuelve todas)
router.get('/', optionalAuthenticate, getPromotions);

// POST /api/promotions - Crear o actualizar promoción (Admin)
router.post('/', isAdmin, createOrUpdatePromotion);

// DELETE /api/promotions/:id - Eliminar promoción (Admin)
router.delete('/:id', isAdmin, deletePromotion);

export default router;
