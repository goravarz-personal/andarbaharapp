import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { signToken } from '../lib/jwt';
import { hashPassword, verifyPassword } from '../lib/password';
import { requireAuth, currentUser } from '../middleware/auth';
import { asyncHandler, validateBody } from '../middleware/validate';
import { loginLimiter, sensitiveLimiter } from '../middleware/rateLimit';
import { changePasswordSchema, loginSchema, updateMeSchema } from '../types/schemas';
import { emptyToNull, serializeUser } from '../services/user.service';
import { getPlayerStats } from '../services/stats.service';

export const authRouter = Router();

authRouter.post(
  '/login',
  loginLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as { username: string; password: string };

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });

    // Same message either way - don't leak which usernames exist.
    const invalid = ApiError.unauthorized('Wrong username or password.');
    if (!user) throw invalid;
    if (!(await verifyPassword(password, user.passwordHash))) throw invalid;
    if (!user.isActive) throw ApiError.forbidden('This account has been deactivated. Ask the admin.');

    const token = signToken({ sub: user.id, role: user.role, tokenVersion: user.tokenVersion });
    res.json({ token, user: serializeUser(user) });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const [user, stats] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: me.id } }),
      getPlayerStats(me.id),
    ]);
    res.json({ user: serializeUser(user), stats });
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  validateBody(updateMeSchema),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const body = req.body as {
      displayName?: string;
      email?: string;
      phone?: string;
      avatarColor?: string;
    };

    const user = await prisma.user.update({
      where: { id: me.id },
      data: {
        displayName: body.displayName,
        email: emptyToNull(body.email),
        phone: emptyToNull(body.phone),
        avatarColor: body.avatarColor,
      },
    });
    res.json({ user: serializeUser(user) });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  sensitiveLimiter,
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw ApiError.badRequest('Your current password is not right.');
    }

    const updated = await prisma.user.update({
      where: { id: me.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        // Retire tokens minted before the change, then hand back a fresh one so
        // the person changing their own password stays signed in.
        tokenVersion: { increment: 1 },
      },
    });

    res.json({
      user: serializeUser(updated),
      token: signToken({ sub: updated.id, role: updated.role, tokenVersion: updated.tokenVersion }),
    });
  }),
);
