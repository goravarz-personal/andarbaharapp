import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../lib/env';

/**
 * Once this is on the open internet, the sign-in endpoint is the one thing
 * standing between a stranger and everyone's money records. Limits are per IP
 * and generous enough that nobody fumbling their own password gets locked out.
 */

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const message = (text: string) => ({ error: { code: 'too_many_requests', message: text } });

/** Broad ceiling so no single client can hammer the server. */
export const generalLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Health checks are how the host decides the service is alive.
  skip: (req: Request) => req.path === '/api/health',
  message: message('Too many requests. Give it a minute and try again.'),
});

/**
 * Failed sign-ins only, counted per account per address rather than per
 * address alone.
 *
 * The whole group is often in one room on one Wi-Fi, which means one public IP
 * between them. Counting per IP would let one person mistyping their password
 * lock everybody else out of the game they are in the middle of recording.
 * Guessing at a single account is still cut off after ten tries, and the
 * general limiter above caps anyone working through a list of usernames.
 */
export const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: env.isTest ? 1000 : 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const body = req.body as { username?: unknown } | undefined;
    const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
    return `${ipKeyGenerator(req.ip ?? '')}:${username}`;
  },
  message: message('Too many sign-in attempts for this account. Please wait 15 minutes.'),
});

/** Password changes and admin resets - cheap to guard, expensive to get wrong. */
export const sensitiveLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: env.isTest ? 1000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Per signed-in account where we know it, otherwise per IP.
  keyGenerator: (req: Request) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
  message: message('Too many attempts. Please wait a few minutes.'),
});
