import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  orgId?: string;
  userId?: string;
}

type JwtPayload = jwt.JwtPayload & {
  orgId?: unknown;
  userId?: unknown;
};

export function enforceOrgIsolation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
  const jwtSecret = process.env.JWT_SECRET;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized missing token' });
  }

  if (!jwtSecret) {
    return res.status(500).json({ error: 'JWT secret is not configured' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret) as JwtPayload;

    if (typeof payload.orgId !== 'string' || typeof payload.userId !== 'string') {
      return res.status(403).json({ error: 'Token has no organization context' });
    }

    req.orgId = payload.orgId;
    req.userId = payload.userId;
    return next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired authorization token' });
  }
}
