import { Router } from 'express';
import { getManageableProducts, getProducts, updateProductAvailability, updateProductVisibility } from '../controllers/productController';
import { isAdmin } from '../middleware/auth';

const router = Router();

router.get('/manage', isAdmin, getManageableProducts);
router.patch('/:id/visibility', isAdmin, updateProductVisibility);
router.patch('/:id/availability', isAdmin, updateProductAvailability);
router.get('/', getProducts);

export default router;