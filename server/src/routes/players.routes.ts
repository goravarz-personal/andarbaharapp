import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { generateTempPassword, hashPassword } from '../lib/password';
import { requireAdmin, requireAuth, currentUser } from '../middleware/auth';
import { asyncHandler, validateBody } from '../middleware/validate';
import { sensitiveLimiter } from '../middleware/rateLimit';
import { createPlayerSchema, resetPasswordSchema, updatePlayerSchema } from '../types/schemas';
import { emptyToNull, pickAvatarColor, serializeUser } from '../services/user.service';
import { getPlayerHistory, getLeaderboard, summarise } from '../services/stats.service';

export const playersRouter = Router();

playersRouter.use(requireAuth);

/** Everyone can see the roster - that's the point of the shared ledger. */
playersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === 'true';
    const users = await prisma.user.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { displayName: 'asc' }],
    });
    res.json({ players: users.map(serializeUser) });
  }),
);

/** Roster ranked by lifetime net. */
playersRouter.get(
  '/leaderboard',
  asyncHandler(async (_req, res) => {
    res.json({ leaderboard: await getLeaderboard() });
  }),
);

playersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw ApiError.notFound('No such player.');

    const history = await getPlayerHistory(id);
    res.json({ player: serializeUser(user), stats: summarise(history), history });
  }),
);

playersRouter.get(
  '/:id/history',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw ApiError.notFound('No such player.');
    const history = await getPlayerHistory(id);
    res.json({ history, stats: summarise(history) });
  }),
);

/** Add a player. Creates their login at the same time. */
playersRouter.post(
  '/',
  requireAdmin,
  validateBody(createPlayerSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      username: string;
      displayName: string;
      email?: string;
      phone?: string;
      password?: string;
      role?: 'ADMIN' | 'PLAYER';
      avatarColor?: string;
    };

    const username = body.username.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) throw ApiError.conflict('That username is already taken.');

    // No password given means "hand them a temporary one" - returned once here
    // so the admin can pass it on, and flagged so they must change it.
    const tempPassword = body.password ? null : generateTempPassword();
    const password = body.password ?? tempPassword ?? generateTempPassword();

    const user = await prisma.user.create({
      data: {
        username,
        displayName: body.displayName,
        email: emptyToNull(body.email) ?? null,
        phone: emptyToNull(body.phone) ?? null,
        passwordHash: await hashPassword(password),
        role: body.role ?? 'PLAYER',
        mustChangePassword: tempPassword !== null,
        avatarColor: body.avatarColor ?? pickAvatarColor(username),
      },
    });

    res.status(201).json({ player: serializeUser(user), temporaryPassword: tempPassword });
  }),
);

playersRouter.patch(
  '/:id',
  requireAdmin,
  validateBody(updatePlayerSchema),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const me = currentUser(req);
    const body = req.body as {
      displayName?: string;
      email?: string;
      phone?: string;
      role?: 'ADMIN' | 'PLAYER';
      isActive?: boolean;
      avatarColor?: string;
    };

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw ApiError.notFound('No such player.');

    // Guard rails so the group can't lock itself out of its own admin account.
    if (target.id === me.id && body.role === 'PLAYER') {
      throw ApiError.badRequest('You cannot remove your own admin access.');
    }
    if (target.id === me.id && body.isActive === false) {
      throw ApiError.badRequest('You cannot deactivate your own account.');
    }
    if ((body.role === 'PLAYER' || body.isActive === false) && target.role === 'ADMIN') {
      const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (admins <= 1) throw ApiError.badRequest('There has to be at least one active admin.');
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        displayName: body.displayName,
        email: emptyToNull(body.email),
        phone: emptyToNull(body.phone),
        role: body.role,
        isActive: body.isActive,
        avatarColor: body.avatarColor,
        // Deactivating someone should kick their app out immediately.
        ...(body.isActive === false ? { tokenVersion: { increment: 1 } } : {}),
      },
    });
    res.json({ player: serializeUser(user) });
  }),
);

/** Admin password reset. Returns the new password once, to read out to them. */
playersRouter.post(
  '/:id/reset-password',
  requireAdmin,
  sensitiveLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const body = req.body as { newPassword?: string };

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw ApiError.notFound('No such player.');

    const newPassword = body.newPassword ?? generateTempPassword();
    const user = await prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: !body.newPassword,
        tokenVersion: { increment: 1 },
      },
    });

    res.json({ player: serializeUser(user), password: newPassword });
  }),
);

/**
 * Deleting a player would take their game history with them, so this only
 * removes people who have never sat at a table. Everyone else gets deactivated.
 */
playersRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const me = currentUser(req);
    if (id === me.id) throw ApiError.badRequest('You cannot delete your own account.');

    const target = await prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { gameEntries: true } } },
    });
    if (!target) throw ApiError.notFound('No such player.');

    if (target._count.gameEntries > 0) {
      const user = await prisma.user.update({
        where: { id },
        data: { isActive: false, tokenVersion: { increment: 1 } },
      });
      res.json({
        player: serializeUser(user),
        deactivated: true,
        message: 'This player has game history, so they were deactivated instead of deleted.',
      });
      return;
    }

    await prisma.user.delete({ where: { id } });
    res.json({ deleted: true });
  }),
);
