import { Router } from 'express';
import { signInWithGoogle } from '../controllers/authController';

const router = Router();

router.post('/google', signInWithGoogle);

export default router;