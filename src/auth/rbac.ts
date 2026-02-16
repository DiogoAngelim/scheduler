import type { NextFunction, Request, Response } from 'express';
import { AppError, type AuthContext, type UserRole } from '../domain/types';

export interface RequestWithAuth extends Request {
  auth?: AuthContext;
}

export function authMiddleware(req: RequestWithAuth, _res: Response, next: NextFunction) {
  const userId = req.header('x-user-id');
  const role = req.header('x-role') as UserRole | undefined;

  if (!userId || !role || !['EXECUTIVE', 'OWNER', 'SYSTEM'].includes(role)) {
    return next(new AppError('Missing or invalid auth headers', 401));
  }

  req.auth = { userId, role };
  return next();
}

export function requireAuth(req: RequestWithAuth): AuthContext {
  if (!req.auth) {
    throw new AppError('Unauthorized', 401);
  }
  return req.auth;
}
