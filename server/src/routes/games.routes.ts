import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { requireAdmin, requireAuth, currentUser } from '../middleware/auth';
import { asyncHandler, parseOrThrow, validateBody } from '../middleware/validate';
import {
  createGameSchema,
  expenseInputSchema,
  updateGamePlayerSchema,
  updateGameSchema,
  upsertGamePlayerSchema,
} from '../types/schemas';
import {
  assertExpenseIsConsistent,
  findGameOrThrow,
  gameInclude,
  serializeGame,
  serializeGameSummary,
  settleGame,
} from '../services/game.service';
import { computeGameLedger, minimiseTransfers } from '../services/ledger.service';

export const gamesRouter = Router();

gamesRouter.use(requireAuth);

type ExpenseInput = ReturnType<typeof expenseInputSchema.parse>;

/**
 * Only CUSTOM splits store rows. EQUAL is worked out at read time so adding a
 * latecomer automatically re-splits the dinner instead of leaving stale shares.
 */
async function writeExpense(
  tx: Prisma.TransactionClient,
  gameId: string,
  input: ExpenseInput,
  seatedUserIds: string[],
) {
  assertExpenseIsConsistent(input, seatedUserIds);
  return tx.expense.create({
    data: {
      gameId,
      label: input.label,
      amount: input.amount,
      category: input.category,
      paidById: input.paidById,
      splitMode: input.splitMode,
      shares:
        input.splitMode === 'CUSTOM' && input.shares
          ? { create: input.shares.map((share) => ({ userId: share.userId, amount: share.amount })) }
          : undefined,
    },
  });
}

async function seatedUserIdsOf(gameId: string): Promise<string[]> {
  const players = await prisma.gamePlayer.findMany({
    where: { gameId },
    select: { userId: true },
  });
  return players.map((player) => player.userId);
}

/** List of game nights, newest first. Optional player / date filters. */
gamesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { playerId, from, to, status } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);

    const where: Prisma.GameWhereInput = {};
    if (playerId) where.players = { some: { userId: playerId } };
    if (status) where.status = status;
    if (from || to) {
      where.playedOn = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const games = await prisma.game.findMany({
      where,
      include: gameInclude,
      orderBy: { playedOn: 'desc' },
      take: limit,
    });

    res.json({ games: games.map(serializeGameSummary) });
  }),
);

gamesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ game: serializeGame(await findGameOrThrow(String(req.params.id))) });
  }),
);

/** Record a game night, optionally with everyone's numbers in one go. */
gamesRouter.post(
  '/',
  requireAdmin,
  validateBody(createGameSchema),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const body = req.body as {
      playedOn: string;
      title?: string;
      location?: string;
      notes?: string;
      players?: Array<{ userId: string; buyIn?: number; cashOut?: number; isWinner?: boolean; notes?: string }>;
      expenses?: ExpenseInput[];
    };

    const players = body.players ?? [];
    const userIds = players.map((player) => player.userId);
    if (new Set(userIds).size !== userIds.length) {
      throw ApiError.badRequest('The same player is listed twice.');
    }
    if (userIds.length > 0) {
      const found = await prisma.user.count({ where: { id: { in: userIds } } });
      if (found !== userIds.length) throw ApiError.badRequest('One of those players does not exist.');
    }

    const game = await prisma.$transaction(async (tx) => {
      const created = await tx.game.create({
        data: {
          playedOn: new Date(body.playedOn),
          title: body.title ?? null,
          location: body.location ?? null,
          notes: body.notes ?? null,
          createdById: me.id,
          players: {
            create: players.map((player) => ({
              userId: player.userId,
              buyIn: player.buyIn ?? 0,
              cashOut: player.cashOut ?? 0,
              isWinner: player.isWinner ?? false,
              notes: player.notes ?? null,
            })),
          },
        },
      });

      for (const expense of body.expenses ?? []) {
        await writeExpense(tx, created.id, expense, userIds);
      }
      return created;
    });

    res.status(201).json({ game: serializeGame(await findGameOrThrow(game.id)) });
  }),
);

gamesRouter.patch(
  '/:id',
  requireAdmin,
  validateBody(updateGameSchema),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const body = req.body as {
      playedOn?: string;
      title?: string;
      location?: string;
      notes?: string;
      status?: 'OPEN' | 'SETTLED';
    };

    await findGameOrThrow(id);
    await prisma.game.update({
      where: { id },
      data: {
        playedOn: body.playedOn ? new Date(body.playedOn) : undefined,
        title: body.title,
        location: body.location,
        notes: body.notes,
        status: body.status,
      },
    });

    res.json({ game: serializeGame(await findGameOrThrow(id)) });
  }),
);

gamesRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    await findGameOrThrow(id);
    // Players, expenses and settlements cascade with the game.
    await prisma.game.delete({ where: { id } });
    res.json({ deleted: true });
  }),
);

/** Seat a player, or update them if they are already at the table. */
gamesRouter.post(
  '/:id/players',
  requireAdmin,
  validateBody(upsertGamePlayerSchema),
  asyncHandler(async (req, res) => {
    const gameId = String(req.params.id);
    const body = req.body as {
      userId: string;
      buyIn?: number;
      cashOut?: number;
      isWinner?: boolean;
      notes?: string;
    };

    await findGameOrThrow(gameId);
    const user = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw ApiError.badRequest('No such player.');

    await prisma.gamePlayer.upsert({
      where: { gameId_userId: { gameId, userId: body.userId } },
      create: {
        gameId,
        userId: body.userId,
        buyIn: body.buyIn ?? 0,
        cashOut: body.cashOut ?? 0,
        isWinner: body.isWinner ?? false,
        notes: body.notes ?? null,
      },
      update: {
        buyIn: body.buyIn,
        cashOut: body.cashOut,
        isWinner: body.isWinner,
        notes: body.notes,
      },
    });

    res.status(201).json({ game: serializeGame(await findGameOrThrow(gameId)) });
  }),
);

/** Update one seat: buy-in, cash-out, or who won. */
gamesRouter.patch(
  '/:id/players/:playerId',
  requireAdmin,
  validateBody(updateGamePlayerSchema),
  asyncHandler(async (req, res) => {
    const gameId = String(req.params.id);
    const playerId = String(req.params.playerId);
    const body = req.body as { buyIn?: number; cashOut?: number; isWinner?: boolean; notes?: string };

    const seat = await prisma.gamePlayer.findUnique({ where: { id: playerId } });
    if (!seat || seat.gameId !== gameId) throw ApiError.notFound('That player is not in this game.');

    await prisma.gamePlayer.update({ where: { id: playerId }, data: body });
    res.json({ game: serializeGame(await findGameOrThrow(gameId)) });
  }),
);

gamesRouter.delete(
  '/:id/players/:playerId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const gameId = String(req.params.id);
    const playerId = String(req.params.playerId);

    const seat = await prisma.gamePlayer.findUnique({ where: { id: playerId } });
    if (!seat || seat.gameId !== gameId) throw ApiError.notFound('That player is not in this game.');

    const paidFor = await prisma.expense.count({ where: { gameId, paidById: seat.userId } });
    if (paidFor > 0) {
      throw ApiError.conflict('This player paid for an expense in this game. Remove the expense first.');
    }

    await prisma.gamePlayer.delete({ where: { id: playerId } });
    res.json({ game: serializeGame(await findGameOrThrow(gameId)) });
  }),
);

/** Dinner or any other cost for the night. */
gamesRouter.post(
  '/:id/expenses',
  requireAdmin,
  validateBody(expenseInputSchema),
  asyncHandler(async (req, res) => {
    const gameId = String(req.params.id);
    await findGameOrThrow(gameId);
    const seated = await seatedUserIdsOf(gameId);

    await prisma.$transaction(async (tx) => {
      await writeExpense(tx, gameId, req.body as ExpenseInput, seated);
    });

    res.status(201).json({ game: serializeGame(await findGameOrThrow(gameId)) });
  }),
);

gamesRouter.patch(
  '/:id/expenses/:expenseId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const gameId = String(req.params.id);
    const expenseId = String(req.params.expenseId);

    const existing = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!existing || existing.gameId !== gameId) throw ApiError.notFound('No such expense.');

    const input = parseOrThrow(expenseInputSchema, {
      label: existing.label,
      amount: existing.amount,
      category: existing.category,
      paidById: existing.paidById,
      splitMode: existing.splitMode,
      ...(req.body as Record<string, unknown>),
    });

    const seated = await seatedUserIdsOf(gameId);
    assertExpenseIsConsistent(input, seated);

    await prisma.$transaction(async (tx) => {
      await tx.expenseShare.deleteMany({ where: { expenseId } });
      await tx.expense.update({
        where: { id: expenseId },
        data: {
          label: input.label,
          amount: input.amount,
          category: input.category,
          paidById: input.paidById,
          splitMode: input.splitMode,
          shares:
            input.splitMode === 'CUSTOM' && input.shares
              ? { create: input.shares.map((s) => ({ userId: s.userId, amount: s.amount })) }
              : undefined,
        },
      });
    });

    res.json({ game: serializeGame(await findGameOrThrow(gameId)) });
  }),
);

gamesRouter.delete(
  '/:id/expenses/:expenseId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const gameId = String(req.params.id);
    const expenseId = String(req.params.expenseId);

    const existing = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!existing || existing.gameId !== gameId) throw ApiError.notFound('No such expense.');

    await prisma.expense.delete({ where: { id: expenseId } });
    res.json({ game: serializeGame(await findGameOrThrow(gameId)) });
  }),
);

/** What the settle-up would look like, without writing anything. */
gamesRouter.get(
  '/:id/settlement-preview',
  asyncHandler(async (req, res) => {
    const game = await findGameOrThrow(String(req.params.id));
    const ledger = computeGameLedger(
      game.players.map((player) => ({
        id: player.id,
        userId: player.userId,
        displayName: player.user.displayName,
        buyIn: player.buyIn,
        cashOut: player.cashOut,
        isWinner: player.isWinner,
      })),
      game.expenses.map((expense) => ({
        id: expense.id,
        label: expense.label,
        category: expense.category,
        amount: expense.amount,
        paidById: expense.paidById,
        splitMode: expense.splitMode,
        shares: expense.shares.map((share) => ({ userId: share.userId, amount: share.amount })),
      })),
    );

    const nameOf = new Map(game.players.map((p) => [p.userId, p.user.displayName]));
    const transfers = minimiseTransfers(
      ledger.lines.map((line) => ({ userId: line.userId, net: line.net })),
    ).map((transfer) => ({
      ...transfer,
      fromName: nameOf.get(transfer.fromUserId) ?? 'Unknown',
      toName: nameOf.get(transfer.toUserId) ?? 'Unknown',
    }));

    res.json({ ledger, transfers, balanced: ledger.balanced });
  }),
);

/** Lock in who pays whom. */
gamesRouter.post(
  '/:id/settle',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const force = req.query.force === 'true' || (req.body as { force?: boolean })?.force === true;
    const game = await settleGame(String(req.params.id), force);
    res.json({ game: serializeGame(game) });
  }),
);

/** Re-open a settled game so the numbers can be corrected. */
gamesRouter.post(
  '/:id/reopen',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    await findGameOrThrow(id);
    await prisma.game.update({ where: { id }, data: { status: 'OPEN' } });
    res.json({ game: serializeGame(await findGameOrThrow(id)) });
  }),
);
