import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { requireAdmin, requireAuth, currentUser, isAdmin } from '../middleware/auth';
import { asyncHandler, validateBody } from '../middleware/validate';
import { manualSettlementSchema, settlementStatusUpdateSchema } from '../types/schemas';
import { serializeSettlement } from '../services/game.service';
import { netOutstanding } from '../services/ledger.service';

export const settlementsRouter = Router();

settlementsRouter.use(requireAuth);

const withUsers = {
  fromUser: { select: { id: true, username: true, displayName: true, avatarColor: true } },
  toUser: { select: { id: true, username: true, displayName: true, avatarColor: true } },
} satisfies Prisma.SettlementInclude;

/** Every IOU on the books, newest first. Filterable by person and status. */
settlementsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, userId, gameId } = req.query as Record<string, string | undefined>;

    const where: Prisma.SettlementWhereInput = {};
    if (status) where.status = status;
    if (gameId) where.gameId = gameId;
    if (userId) where.OR = [{ fromUserId: userId }, { toUserId: userId }];

    const settlements = await prisma.settlement.findMany({
      where,
      include: withUsers,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    res.json({ settlements: settlements.map(serializeSettlement) });
  }),
);

/**
 * The "who owes whom" board: every pending IOU netted down to one line per
 * pair of people.
 */
settlementsRouter.get(
  '/outstanding',
  asyncHandler(async (_req, res) => {
    const pending = await prisma.settlement.findMany({ where: { status: 'PENDING' } });
    const netted = netOutstanding(pending);

    const userIds = [...new Set(netted.flatMap((t) => [t.fromUserId, t.toUserId]))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, displayName: true, avatarColor: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));

    res.json({
      outstanding: netted.map((transfer) => ({
        amount: transfer.amount,
        from: byId.get(transfer.fromUserId) ?? null,
        to: byId.get(transfer.toUserId) ?? null,
      })),
    });
  }),
);

/** Record an IOU by hand - a loan at the table, a shared cab, anything. */
settlementsRouter.post(
  '/',
  requireAdmin,
  validateBody(manualSettlementSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      fromUserId: string;
      toUserId: string;
      amount: number;
      note?: string;
      gameId?: string;
    };

    if (body.fromUserId === body.toUserId) {
      throw ApiError.badRequest('A player cannot owe themselves.');
    }

    const people = await prisma.user.count({ where: { id: { in: [body.fromUserId, body.toUserId] } } });
    if (people !== 2) throw ApiError.badRequest('One of those players does not exist.');

    const settlement = await prisma.settlement.create({
      data: {
        fromUserId: body.fromUserId,
        toUserId: body.toUserId,
        amount: body.amount,
        note: body.note ?? null,
        gameId: body.gameId ?? null,
        kind: 'MANUAL',
        status: 'PENDING',
      },
      include: withUsers,
    });

    res.status(201).json({ settlement: serializeSettlement(settlement) });
  }),
);

/**
 * Mark an IOU settled.
 *
 * The person owed the money confirms they received it - that's the half of the
 * pair with something to lose from a wrong click. An admin can do either way.
 */
settlementsRouter.patch(
  '/:id',
  validateBody(settlementStatusUpdateSchema),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const me = currentUser(req);
    const body = req.body as { status: 'PENDING' | 'PAID'; note?: string };

    const settlement = await prisma.settlement.findUnique({ where: { id } });
    if (!settlement) throw ApiError.notFound('No such payment.');

    if (body.status === 'PAID' && !isAdmin(req) && settlement.toUserId !== me.id) {
      throw ApiError.forbidden('Only the player being paid (or an admin) can confirm a payment.');
    }
    if (body.status === 'PENDING' && !isAdmin(req)) {
      throw ApiError.forbidden('Only an admin can re-open a settled payment.');
    }

    const updated = await prisma.settlement.update({
      where: { id },
      data: {
        status: body.status,
        note: body.note ?? settlement.note,
        paidAt: body.status === 'PAID' ? new Date() : null,
        markedPaidById: body.status === 'PAID' ? me.id : null,
      },
      include: withUsers,
    });

    res.json({ settlement: serializeSettlement(updated) });
  }),
);

settlementsRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const settlement = await prisma.settlement.findUnique({ where: { id } });
    if (!settlement) throw ApiError.notFound('No such payment.');

    await prisma.settlement.delete({ where: { id } });
    res.json({ deleted: true });
  }),
);
