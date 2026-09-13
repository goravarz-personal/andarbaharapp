import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from './env';
import { ApiError } from './errors';

export interface TokenPayload {
  sub: string;
  role: string;
  tokenVersion: number;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as SignOptions);
}

export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string' || !decoded.sub) {
      throw ApiError.unauthorized();
    }
    return {
      sub: String(decoded.sub),
      role: String((decoded as Record<string, unknown>).role ?? 'PLAYER'),
      tokenVersion: Number((decoded as Record<string, unknown>).tokenVersion ?? 0),
    };
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.');
  }
}
