import { Router } from 'express';
import { getCurrentProfile, signInWithGoogle, updateCurrentProfile } from '../controllers/authController';
import { loginWithEmail, registerWithEmail, resendVerification, verifyEmail } from '../controllers/emailAuthController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/google', signInWithGoogle);
router.post('/register', registerWithEmail);
router.post('/login', loginWithEmail);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.get('/me', authenticate, getCurrentProfile);
router.patch('/me', authenticate, updateCurrentProfile);

export default router;