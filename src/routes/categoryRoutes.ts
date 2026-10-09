import { Router } from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  updateCategoryVisibility,
} from '../controllers/categoryController';
import { isAdmin } from '../middleware/auth';

const router = Router();

// GET /api/categories - Si se pasa ?all=true requiere rol admin, caso contrario retorna públicas
router.get('/', (req, res, next) => {
  if (req.query.all === 'true') return isAdmin(req, res, next);
  return next();
}, getCategories);

// POST /api/categories - Crear nueva categoría (Admin)
router.post('/', isAdmin, createCategory);

// PUT /api/categories/:id - Actualizar nombre, orden o visibilidad (Admin)
router.put('/:id', isAdmin, updateCategory);

// DELETE /api/categories/:id - Eliminar categoría (Admin)
router.delete('/:id', isAdmin, deleteCategory);

// PATCH /api/categories/:id/visibility - Toggle de visibilidad (Admin)
router.patch('/:id/visibility', isAdmin, updateCategoryVisibility);

export default router;