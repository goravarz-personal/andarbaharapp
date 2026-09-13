import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from '../lib/errors';
import { env } from '../lib/env';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'No such endpoint.' } });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  // Express identifies error middleware by arity, so `next` must stay.
  _next: NextFunction,
): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = (error.meta?.target as string[] | string | undefined) ?? 'field';
      const field = Array.isArray(target) ? target.join(', ') : String(target);
      res.status(409).json({
        error: { code: 'conflict', message: `That ${field} is already taken.` },
      });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
      return;
    }
  }

  if (!env.isTest) {
    // eslint-disable-next-line no-console
    console.error('[unhandled]', error);
  }

  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Something went wrong on the server.',
      ...(env.isProduction ? {} : { details: String(error) }),
    },
  });
}
