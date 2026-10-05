import { Router } from 'express';
import { createOrder, getAllOrders, getMyOrders, updateOrderStatus } from '../controllers/orderController';
import { authenticate, isAdmin, optionalAuthenticate, requireRole } from '../middleware/auth';

const router = Router();

router.post('/', optionalAuthenticate, createOrder);
router.get('/mine', authenticate, requireRole('customer'), getMyOrders);
router.get('/all', isAdmin, getAllOrders);
router.patch('/:id/status', isAdmin, updateOrderStatus);

export default router;