import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';

const googleClient = new OAuth2Client();

function createSession(user: { id: number | string; name: string; email: string; photoURL?: string | null; role: string }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET no está configurado.');
  const token = jwt.sign(
    { role: user.role, email: user.email, name: user.name },
    secret,
    { subject: String(user.id), expiresIn: '7d' },
  );
  return { token, user: { ...user, id: String(user.id) } };
}

export async function signInWithGoogle(req: Request, res: Response) {
  const credential = req.body?.credential;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!credential || !clientId) {
    return res.status(400).json({ message: 'Falta configurar el inicio de sesión con Google.' });
  }

  let profile;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
    profile = ticket.getPayload();
  } catch {
    return res.status(401).json({ message: 'No se pudo validar la cuenta de Google.' });
  }
  if (!profile?.sub || !profile.email || !profile.email_verified || !profile.name) {
    return res.status(401).json({ message: 'La cuenta de Google no pudo ser verificada.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO users (google_id, email, name, photo_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_id) DO UPDATE SET
         email = EXCLUDED.email, name = EXCLUDED.name, photo_url = EXCLUDED.photo_url, updated_at = NOW()
       RETURNING id, email, name, photo_url AS "photoURL", role`,
      [profile.sub, profile.email, profile.name, profile.picture || null],
    );
     return res.json(createSession(result.rows[0]));
  } catch (error) {
    console.error('Could not persist Google user:', error);
    return res.status(500).json({ message: 'No se pudo guardar la sesión del usuario.' });
  }
}