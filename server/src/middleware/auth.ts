import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../lib/jwt';
import { ApiError } from '../lib/errors';
import { prisma } from '../lib/prisma';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Rejects the request unless a valid, still-current token is attached. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Missing sign-in token.');
    }
    const payload = verifyToken(header.slice('Bearer '.length).trim());
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user) throw ApiError.unauthorized('That account no longer exists.');
    if (!user.isActive) throw ApiError.forbidden('This account has been deactivated.');
    // A password change or an admin reset bumps tokenVersion, retiring old tokens.
    if (user.tokenVersion !== payload.tokenVersion) {
      throw ApiError.unauthorized('Your session has expired. Please sign in again.');
    }

    req.user = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
    };
    next();
  } catch (error) {
    next(error);
  }
}

/** Admin-only guard. Must run after requireAuth. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'ADMIN') {
    next(ApiError.forbidden('Only an admin can do that.'));
    return;
  }
  next();
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export function isAdmin(req: Request): boolean {
  return req.user?.role === 'ADMIN';
}
