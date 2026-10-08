import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { AuthenticatedRequest } from '../middleware/auth';

const googleClient = new OAuth2Client();

export interface AuthSessionUser {
  id: number | string;
  name: string;
  email: string;
  photoURL?: string | null;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  address?: string | null;
  isVerified?: boolean;
  authProvider?: 'google' | 'email';
}

export function createSession(user: AuthSessionUser) {
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
    const existing = await pool.query(
      `SELECT id, google_id AS "googleId", email FROM users
       WHERE google_id = $1 OR email = $2
       ORDER BY (google_id = $1) DESC NULLS LAST LIMIT 1`,
      [profile.sub, profile.email.toLowerCase()],
    );
    let result;
    if (existing.rows[0]) {
      if (existing.rows[0].googleId && existing.rows[0].googleId !== profile.sub) {
        return res.status(409).json({ message: 'Ese correo ya está asociado a otra cuenta.' });
      }
      result = await pool.query(
        `UPDATE users SET google_id = $1, email = $2, name = $3,
                          first_name = COALESCE(first_name, $4),
                          last_name = COALESCE(last_name, $5), photo_url = $6,
                          is_verified = TRUE, updated_at = NOW()
         WHERE id = $7
         RETURNING id, email, name, photo_url AS "photoURL", role, is_verified AS "isVerified",
                   first_name AS "firstName", last_name AS "lastName", address`,
        [profile.sub, profile.email.toLowerCase(), profile.name, profile.given_name || profile.name,
          profile.family_name || null, profile.picture || null, existing.rows[0].id],
      );
    } else {
      result = await pool.query(
        `INSERT INTO users (google_id, email, name, first_name, last_name, photo_url, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         RETURNING id, email, name, photo_url AS "photoURL", role, is_verified AS "isVerified",
                   first_name AS "firstName", last_name AS "lastName", address`,
        [profile.sub, profile.email.toLowerCase(), profile.name, profile.given_name || profile.name,
          profile.family_name || null, profile.picture || null],
      );
    }
    return res.json(createSession({ ...result.rows[0], authProvider: 'google' }));
  } catch (error) {
    console.error('Could not persist Google user:', error);
    return res.status(500).json({ message: 'No se pudo guardar la sesión del usuario.' });
  }
}

export async function getCurrentProfile(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await pool.query(
      `SELECT id, email, name, role, is_verified AS "isVerified",
              CASE WHEN google_id IS NOT NULL THEN 'google' ELSE 'email' END AS "authProvider",
              first_name AS "firstName", last_name AS "lastName", address,
              photo_url AS "photoURL"
       FROM users WHERE id = $1`,
      [req.auth!.id],
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'No se encontró el perfil.' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Could not load user profile:', error);
    return res.status(500).json({ message: 'No se pudo cargar el perfil.' });
  }
}

export async function updateCurrentProfile(req: AuthenticatedRequest, res: Response) {
  const firstName = typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : '';
  const lastName = typeof req.body?.lastName === 'string' ? req.body.lastName.trim() : '';
  const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
  if (!firstName || !lastName || !address || firstName.length > 100 || lastName.length > 100 || address.length > 500) {
    return res.status(400).json({ message: 'Completá nombre y apellido; revisá también la dirección.' });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET first_name = $1, last_name = $2, address = $3,
                        name = concat_ws(' ', $1, $2), updated_at = NOW()
       WHERE id = $4
         AND (first_name IS DISTINCT FROM $1 OR last_name IS DISTINCT FROM $2 OR address IS DISTINCT FROM $3)
       RETURNING id, email, name, role, is_verified AS "isVerified",
                 CASE WHEN google_id IS NOT NULL THEN 'google' ELSE 'email' END AS "authProvider",
                 first_name AS "firstName", last_name AS "lastName", address, photo_url AS "photoURL"`,
      [firstName, lastName, address || null, req.auth!.id],
    );
    if (result.rowCount === 0) {
      const unchangedProfile = await pool.query(
        `SELECT id, email, name, role, is_verified AS "isVerified",
                CASE WHEN google_id IS NOT NULL THEN 'google' ELSE 'email' END AS "authProvider",
                first_name AS "firstName", last_name AS "lastName", address, photo_url AS "photoURL"
         FROM users WHERE id = $1`,
        [req.auth!.id],
      );
      if (unchangedProfile.rowCount === 0) return res.status(404).json({ message: 'No se encontró el perfil.' });
      return res.json(unchangedProfile.rows[0]);
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Could not update user profile:', error);
    return res.status(500).json({ message: 'No se pudo guardar el perfil.' });
  }
}