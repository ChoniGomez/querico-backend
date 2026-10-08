import { Router } from 'express';
import { getManageableProducts, getProducts, updateProductAvailability } from '../controllers/productController';
import { isAdmin } from '../middleware/auth';

const router = Router();

router.get('/manage', isAdmin, getManageableProducts);
router.patch('/:id/availability', isAdmin, updateProductAvailability);
router.get('/', getProducts);

export default router;