import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  auth?: { id: string; role: 'cliente' | 'administrador'; email: string; name: string };
}

function readToken(req: AuthenticatedRequest, res: Response, next: NextFunction, optional: boolean) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    if (optional) return next();
    return res.status(401).json({ message: 'Iniciá sesión para continuar.' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ message: 'JWT_SECRET no está configurado.' });

  try {
    const payload = jwt.verify(authorization.slice(7), secret);
    if (typeof payload === 'string' || !payload.sub || !payload.role || !payload.email || !payload.name) {
      return res.status(401).json({ message: 'La sesión no es válida.' });
    }
    if (payload.role !== 'cliente' && payload.role !== 'administrador') {
      return res.status(401).json({ message: 'La sesión no es válida.' });
    }
    req.auth = {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
      name: payload.name,
    };
    return next();
  } catch {
    return res.status(401).json({ message: 'La sesión expiró. Iniciá sesión nuevamente.' });
  }
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  return readToken(req, res, next, false);
}

export function optionalAuthenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  return readToken(req, res, next, true);
}

export function requireRole(role: 'cliente' | 'administrador') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.auth?.role !== role) return res.status(403).json({ message: 'No tenés permisos para esta acción.' });
    return next();
  };
}