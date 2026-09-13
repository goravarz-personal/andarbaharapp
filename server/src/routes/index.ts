import { Router } from 'express';
import { authRouter } from './auth.routes';
import { playersRouter } from './players.routes';
import { gamesRouter } from './games.routes';
import { requireAuth, currentUser } from '../middleware/auth';
import { asyncHandler } from '../middleware/validate';
import { getDashboard } from '../services/stats.service';
import { env } from '../lib/env';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, currency: env.currency, time: new Date().toISOString() });
});

apiRouter.get(
  '/dashboard',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getDashboard(currentUser(req).id));
  }),
);

apiRouter.use('/auth', authRouter);
apiRouter.use('/players', playersRouter);
apiRouter.use('/games', gamesRouter);
