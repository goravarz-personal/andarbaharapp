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
  assertShareUsersAreSeated,
  clearOtherBankers,
  findGameOrThrow,
  gameInclude,
  serializeGame,
  serializeGameSummary,
} from '../services/game.service';

export const gamesRouter = Router();

gamesRouter.use(requireAuth);

type ExpenseInput = ReturnType<typeof expenseInputSchema.parse>;

/** List of game nights, newest first. Optional player / date filters. */
gamesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { playerId, from, to } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);

    const where: Prisma.GameWhereInput = {};
    if (playerId) where.players = { some: { userId: playerId } };
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
      players?: Array<{ userId: string; buyIn?: number; cashOut?: number; isBanker?: boolean; notes?: string }>;
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

    // One banker, whoever was listed first as holding the bank.
    const bankerId = players.find((player) => player.isBanker)?.userId ?? null;
    const expenses = body.expenses ?? [];

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
              isBanker: player.userId === bankerId,
              notes: player.notes ?? null,
            })),
          },
        },
      });

      for (const expense of expenses) {
        const bearers =
          expense.type === 'DINNER' ? [] : [...new Set(expense.shareUserIds ?? [])];

        if (expense.type !== 'DINNER') {
          if (bearers.length === 0) throw ApiError.badRequest('Say who is covering this one.');
          if (bearers.some((userId) => !userIds.includes(userId))) {
            throw ApiError.badRequest('Everyone chipping in has to be a player in this game.');
          }
        }

        await tx.expense.create({
          data: {
            gameId: created.id,
            type: expense.type,
            label: expense.label ?? null,
            amount: expense.amount,
            shares: { create: bearers.map((userId) => ({ userId })) },
          },
        });
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
    };

    await findGameOrThrow(id);
    await prisma.game.update({
      where: { id },
      data: {
        playedOn: body.playedOn ? new Date(body.playedOn) : undefined,
        title: body.title,
        location: body.location,
        notes: body.notes,
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
    // Players and expenses cascade with the game.
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
      isBanker?: boolean;
      notes?: string;
    };

    await findGameOrThrow(gameId);
    const user = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw ApiError.badRequest('No such player.');

    await prisma.$transaction(async (tx) => {
      await tx.gamePlayer.upsert({
        where: { gameId_userId: { gameId, userId: body.userId } },
        create: {
          gameId,
          userId: body.userId,
          buyIn: body.buyIn ?? 0,
          cashOut: body.cashOut ?? 0,
          isBanker: body.isBanker ?? false,
          notes: body.notes ?? null,
        },
        update: {
          buyIn: body.buyIn,
          cashOut: body.cashOut,
          isBanker: body.isBanker,
          notes: body.notes,
        },
      });
      if (body.isBanker) await clearOtherBankers(tx, gameId, body.userId);
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
    const body = req.body as { buyIn?: number; cashOut?: number; isBanker?: boolean; notes?: string };

    const seat = await prisma.gamePlayer.findUnique({ where: { id: playerId } });
    if (!seat || seat.gameId !== gameId) throw ApiError.notFound('That player is not in this game.');

    await prisma.$transaction(async (tx) => {
      await tx.gamePlayer.update({ where: { id: playerId }, data: body });
      if (body.isBanker) await clearOtherBankers(tx, gameId, seat.userId);
    });

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

    const carrying = await prisma.expenseShare.count({
      where: { userId: seat.userId, expense: { gameId } },
    });
    if (carrying > 0) {
      throw ApiError.conflict(
        'This player is covering one of the costs for this game. Change that first.',
      );
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
    const input = req.body as ExpenseInput;

    const bearers = await assertShareUsersAreSeated(gameId, input.type, input.shareUserIds ?? []);
    await prisma.expense.create({
      data: {
        gameId,
        type: input.type,
        label: input.label ?? null,
        amount: input.amount,
        shares: { create: bearers.map((userId) => ({ userId })) },
      },
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

    const currentShares = await prisma.expenseShare.findMany({
      where: { expenseId },
      select: { userId: true },
    });

    const input = parseOrThrow(expenseInputSchema, {
      type: existing.type,
      amount: existing.amount,
      label: existing.label ?? undefined,
      shareUserIds: currentShares.map((share) => share.userId),
      ...(req.body as Record<string, unknown>),
    });

    const bearers = await assertShareUsersAreSeated(gameId, input.type, input.shareUserIds ?? []);

    await prisma.$transaction(async (tx) => {
      await tx.expenseShare.deleteMany({ where: { expenseId } });
      await tx.expense.update({
        where: { id: expenseId },
        data: {
          type: input.type,
          label: input.label ?? null,
          amount: input.amount,
          shares: { create: bearers.map((userId) => ({ userId })) },
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
