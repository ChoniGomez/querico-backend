import { Router } from 'express';
import { getCategories, updateCategoryVisibility } from '../controllers/categoryController';
import { isAdmin } from '../middleware/auth';

const router = Router();

router.get('/', (req, res, next) => {
  if (req.query.all === 'true') return isAdmin(req, res, next);
  return next();
}, getCategories);
router.patch('/:id/visibility', isAdmin, updateCategoryVisibility);

export default router;