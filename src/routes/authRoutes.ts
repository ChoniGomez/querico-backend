import { Router } from 'express';
import { signInAdmin, signInWithGoogle } from '../controllers/authController';

const router = Router();

router.post('/google', signInWithGoogle);
router.post('/admin', signInAdmin);

export default router;