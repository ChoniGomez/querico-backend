import { Router } from 'express';
import { createOrder, getAllOrders, getMyOrders, updateOrderStatus } from '../controllers/orderController';
import { authenticate, optionalAuthenticate, requireRole } from '../middleware/auth';

const router = Router();

router.post('/', optionalAuthenticate, createOrder);
router.get('/mine', authenticate, requireRole('cliente'), getMyOrders);
router.get('/', authenticate, requireRole('administrador'), getAllOrders);
router.put('/:id/status', authenticate, requireRole('administrador'), updateOrderStatus);

export default router;