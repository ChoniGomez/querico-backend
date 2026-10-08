import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import nodemailer from 'nodemailer';
import { createSession } from './authController';
import { pool } from '../config/database';

const VERIFICATION_LIFETIME_MINUTES = 15;
const MAX_VERIFICATION_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 12;

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function verificationCodeHash(email: string, code: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET no está configurado.');
  return createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
}

function codesMatch(email: string, storedHash: string, code: string) {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(verificationCodeHash(email, code), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function smtpIsConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

async function deliverVerificationCode(email: string, code: string) {
  if (!smtpIsConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP_NOT_CONFIGURED');
    }
    return false;
  }

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    } : undefined,
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Tu código de verificación de Que Rico!',
    text: `Tu código para verificar el correo es ${code}. Vence en ${VERIFICATION_LIFETIME_MINUTES} minutos.`,
  });
  return true;
}

function accountFields(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    name: row.name as string,
    email: row.email as string,
    role: row.role as string,
    firstName: row.firstName as string | null,
    lastName: row.lastName as string | null,
    address: row.address as string | null,
    isVerified: row.isVerified as boolean,
    authProvider: 'email' as const,
  };
}

export async function registerWithEmail(req: Request, res: Response) {
  const firstName = typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : '';
  const lastName = typeof req.body?.lastName === 'string' ? req.body.lastName.trim() : '';
  const email = normalizeEmail(req.body?.email);
  const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const name = `${firstName} ${lastName}`.trim();

  if (!firstName || !lastName || !address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || firstName.length > 100 || lastName.length > 100 || address.length > 500
    || password.length < 10 || password.length > 128) {
    return res.status(400).json({ message: 'Revisá los datos. La contraseña debe tener entre 10 y 128 caracteres.' });
  }
  if (process.env.NODE_ENV === 'production' && !smtpIsConfigured()) {
    return res.status(503).json({ message: 'El envío de verificación no está configurado.' });
  }

  const code = String(randomInt(100000, 1000000));
  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users (email, name, first_name, last_name, address, password_hash,
                          is_verified, email_verification_code_hash, email_verification_expires_at,
                          email_verification_attempts)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, NOW() + INTERVAL '${VERIFICATION_LIFETIME_MINUTES} minutes', 0)
       RETURNING id`,
      [email, name, firstName, lastName, address, passwordHash, verificationCodeHash(email, code)],
    );

    try {
      const sent = await deliverVerificationCode(email, code);
      return res.status(201).json({
        message: sent ? 'Te enviamos un código para verificar tu correo.' : 'Ingresá el código para verificar tu correo.',
        email,
        ...(sent ? {} : { verificationCode: code }),
      });
    } catch (error) {
      console.error('Could not send verification email:', error);
      return res.status(502).json({ message: 'La cuenta quedó pendiente; solicitá reenviar el código.' });
    }
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      return res.status(409).json({ message: 'Ya existe una cuenta con ese correo.' });
    }
    console.error('Could not register user:', error);
    return res.status(500).json({ message: 'No se pudo crear la cuenta.' });
  }
}

export async function loginWithEmail(req: Request, res: Response) {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) return res.status(400).json({ message: 'Ingresá correo y contraseña.' });

  try {
    const result = await pool.query(
      `SELECT id, name, email, role, password_hash AS "passwordHash", is_verified AS "isVerified",
              first_name AS "firstName", last_name AS "lastName", address
       FROM users WHERE email = $1`,
      [email],
    );
    const user = result.rows[0];
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'El correo o la contraseña no son correctos.' });
    }
    if (!user.isVerified) {
      return res.status(403).json({ code: 'EMAIL_NOT_VERIFIED', message: 'Verificá tu correo antes de iniciar sesión.' });
    }
    return res.json(createSession(accountFields(user)));
  } catch (error) {
    console.error('Could not sign in with email:', error);
    return res.status(500).json({ message: 'No se pudo iniciar sesión.' });
  }
}

export async function verifyEmail(req: Request, res: Response) {
  const email = normalizeEmail(req.body?.email);
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Ingresá el correo y el código de 6 dígitos.' });

  try {
    const result = await pool.query(
      `SELECT id, name, email, role, is_verified AS "isVerified",
              first_name AS "firstName", last_name AS "lastName", address,
              email_verification_code_hash AS "codeHash",
              email_verification_expires_at AS "codeExpiresAt",
              email_verification_attempts AS "verificationAttempts"
       FROM users WHERE email = $1`,
      [email],
    );
    const user = result.rows[0];
    if (!user || user.isVerified || !user.codeHash) {
      return res.status(400).json({ message: 'El código no es válido o ya fue utilizado.' });
    }
    if (new Date(user.codeExpiresAt).getTime() <= Date.now()) {
      await pool.query('UPDATE users SET email_verification_code_hash = NULL WHERE id = $1', [user.id]);
      return res.status(410).json({ message: 'El código venció. Solicitá uno nuevo.' });
    }
    if (user.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
      return res.status(429).json({ message: 'Se agotaron los intentos. Solicitá un código nuevo.' });
    }
    if (!codesMatch(email, user.codeHash, code)) {
      await pool.query(
        'UPDATE users SET email_verification_attempts = email_verification_attempts + 1 WHERE id = $1',
        [user.id],
      );
      return res.status(400).json({ message: 'El código no es correcto.' });
    }

    const verified = await pool.query(
      `UPDATE users SET is_verified = TRUE, email_verification_code_hash = NULL,
                        email_verification_expires_at = NULL, email_verification_attempts = 0,
                        updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, email, role, is_verified AS "isVerified",
                 first_name AS "firstName", last_name AS "lastName", address`,
      [user.id],
    );
    return res.json(createSession(accountFields(verified.rows[0])));
  } catch (error) {
    console.error('Could not verify email:', error);
    return res.status(500).json({ message: 'No se pudo verificar el correo.' });
  }
}

export async function resendVerification(req: Request, res: Response) {
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ message: 'Ingresá tu correo electrónico.' });
  if (process.env.NODE_ENV === 'production' && !smtpIsConfigured()) {
    return res.status(503).json({ message: 'El envío de verificación no está configurado.' });
  }

  try {
    const code = String(randomInt(100000, 1000000));
    const result = await pool.query(
      `UPDATE users SET email_verification_code_hash = $1,
                        email_verification_expires_at = NOW() + INTERVAL '${VERIFICATION_LIFETIME_MINUTES} minutes',
                        email_verification_attempts = 0, updated_at = NOW()
       WHERE email = $2 AND is_verified = FALSE
       RETURNING email`,
      [verificationCodeHash(email, code), email],
    );
    if (result.rowCount === 0) return res.json({ message: 'Si la cuenta está pendiente, se envió un nuevo código.' });
    const sent = await deliverVerificationCode(email, code);
    return res.json({
      message: sent ? 'Te enviamos un nuevo código.' : 'Ingresá el nuevo código de verificación.',
      ...(sent ? {} : { verificationCode: code }),
    });
  } catch (error) {
    console.error('Could not resend verification email:', error);
    return res.status(502).json({ message: 'No se pudo enviar el código.' });
  }
}