import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { requireAdmin, requireAuth, currentUser } from '../middleware/auth';
import { asyncHandler, parseOrThrow, validateBody } from '../middleware/validate';
import { generateTempPassword, hashPassword } from '../lib/password';
import { emptyToNull, pickAvatarColor } from '../services/user.service';
import {
  buyInSchema,
  cashOutSchema,
  createGameSchema,
  expenseInputSchema,
  seatPlayerSchema,
  updateGamePlayerSchema,
  updateGameSchema,
} from '../types/schemas';
import {
  assertExpenseIsConsistent,
  clearOtherBankers,
  findGameOrThrow,
  gameInclude,
  serializeGame,
  serializeGameSummary,
} from '../services/game.service';

export const gamesRouter = Router();

// Reading is open to every signed-in player. Every change below is admin only,
// without exception - see the "only an admin can change a game" test.
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

/**
 * Start a night. Players are seated as they turn up, so this usually creates
 * an empty game and everything else happens on the game's own screen.
 */
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
      players?: Array<{ userId: string; buyIn?: number; isBanker?: boolean; notes?: string }>;
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

    const bankerId = players.find((player) => player.isBanker)?.userId ?? null;
    const playedOn = new Date(body.playedOn);

    const game = await prisma.$transaction(async (tx) => {
      const created = await tx.game.create({
        data: {
          playedOn,
          title: body.title ?? null,
          location: body.location ?? null,
          notes: body.notes ?? null,
          createdById: me.id,
        },
      });

      for (const player of players) {
        await tx.gamePlayer.create({
          data: {
            gameId: created.id,
            userId: player.userId,
            isBanker: player.userId === bankerId,
            notes: player.notes ?? null,
            buyIns:
              player.buyIn && player.buyIn > 0
                ? { create: [{ amount: player.buyIn, at: playedOn }] }
                : undefined,
          },
        });
      }

      for (const expense of body.expenses ?? []) {
        assertExpenseIsConsistent(expense, userIds);
        await tx.expense.create({
          data: {
            gameId: created.id,
            type: expense.type,
            label: expense.label ?? null,
            amount: expense.amount,
            paidById: expense.paidById ?? null,
            at: expense.at ? new Date(expense.at) : playedOn,
            shares: {
              create: (expense.type === 'DINNER' ? [] : (expense.shareUserIds ?? [])).map(
                (userId) => ({ userId }),
              ),
            },
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
    // Seats, buy-ins and costs cascade with the game.
    await prisma.game.delete({ where: { id } });
    res.json({ deleted: true });
  }),
);

/**
 * Sit somebody down, with the chips they are starting on.
 *
 * Takes either an existing player, or the details of one who has never played
 * before - a friend who turns up mid-evening should not mean leaving the game
 * screen to create an account first.
 */
gamesRouter.post(
  '/:id/players',
  requireAdmin,
  validateBody(seatPlayerSchema),
  asyncHandler(async (req, res) => {
    const gameId = String(req.params.id);
    const body = req.body as {
      userId?: string;
      newPlayer?: { username: string; displayName: string; email?: string; phone?: string };
      buyIn?: number;
      isBanker?: boolean;
      at?: string;
    };

    await findGameOrThrow(gameId);
    const at = body.at ? new Date(body.at) : new Date();

    const result = await prisma.$transaction(async (tx) => {
      let userId = body.userId ?? null;
      let temporaryPassword: string | null = null;

      if (body.newPlayer) {
        const username = body.newPlayer.username.toLowerCase();
        const taken = await tx.user.findUnique({ where: { username } });
        if (taken) throw ApiError.conflict('That username is already taken.');

        temporaryPassword = generateTempPassword();
        const created = await tx.user.create({
          data: {
            username,
            displayName: body.newPlayer.displayName,
            email: emptyToNull(body.newPlayer.email) ?? null,
            phone: emptyToNull(body.newPlayer.phone) ?? null,
            passwordHash: await hashPassword(temporaryPassword),
            role: 'PLAYER',
            mustChangePassword: true,
            avatarColor: pickAvatarColor(username),
          },
        });
        userId = created.id;
      }

      if (!userId) throw ApiError.badRequest('Say who is sitting down.');

      const exists = await tx.user.findUnique({ where: { id: userId } });
      if (!exists) throw ApiError.badRequest('No such player.');

      const already = await tx.gamePlayer.findUnique({
        where: { gameId_userId: { gameId, userId } },
      });
      if (already) throw ApiError.conflict('They are already at this table.');

      await tx.gamePlayer.create({
        data: {
          gameId,
          userId,
          joinedAt: at,
          isBanker: body.isBanker ?? false,
          buyIns: body.buyIn && body.buyIn > 0 ? { create: [{ amount: body.buyIn, at }] } : undefined,
        },
      });

      if (body.isBanker) await clearOtherBankers(tx, gameId, userId);
      return { temporaryPassword };
    });

    res.status(201).json({
      game: serializeGame(await findGameOrThrow(gameId)),
      temporaryPassword: result.temporaryPassword,
    });
  }),
);

/** Another trip to the banker. A player can do this as often as they like. */
gamesRouter.post(
  '/:id/players/:playerId/buy-ins',
  requireAdmin,
  validateBody(buyInSchema),
  asyncHandler(async (req, res) => {
    const gameId = String(req.params.id);
    const playerId = String(req.params.playerId);
    const body = req.body as { amount: number; at?: string };

    const seat = await prisma.gamePlayer.findUnique({ where: { id: playerId } });
    if (!seat || seat.gameId !== gameId) throw ApiError.notFound('That player is not in this game.');
    if (seat.cashOut !== null) {
      throw ApiError.conflict(
        'They have already cashed out. Undo that first if they are buying back in.',
      );
    }

    await prisma.buyIn.create({
      data: {
        gamePlayerId: playerId,
        amount: body.amount,
        at: body.at ? new Date(body.at) : new Date(),
      },
    });

    res.status(201).json({ game: serializeGame(await findGameOrThrow(gameId)) });
  }),
);

/** Correcting a buy-in that was typed in wrong. */
gamesRouter.delete(
  '/:id/players/:playerId/buy-ins/:buyInId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const gameId = String(req.params.id);
    const buyInId = String(req.params.buyInId);

    const entry = await prisma.buyIn.findUnique({
      where: { id: buyInId },
      include: { gamePlayer: { select: { gameId: true } } },
    });
    if (!entry || entry.gamePlayer.gameId !== gameId) throw ApiError.notFound('No such buy-in.');

    await prisma.buyIn.delete({ where: { id: buyInId } });
    res.json({ game: serializeGame(await findGameOrThrow(gameId)) });
  }),
);

/** Cashing out. Once per player, at the end of their night. */
gamesRouter.post(
  '/:id/players/:playerId/cash-out',
  requireAdmin,
  validateBody(cashOutSchema),
  asyncHandler(async (req, res) => {
    const gameId = String(req.params.id);
    const playerId = String(req.params.playerId);
    const body = req.body as { amount: number; at?: string };

    const seat = await prisma.gamePlayer.findUnique({ where: { id: playerId } });
    if (!seat || seat.gameId !== gameId) throw ApiError.notFound('That player is not in this game.');
    if (seat.cashOut !== null) {
      throw ApiError.conflict(
        'They have already cashed out. Undo it first if the number was wrong.',
      );
    }

    await prisma.gamePlayer.update({
      where: { id: playerId },
      data: { cashOut: body.amount, cashedOutAt: body.at ? new Date(body.at) : new Date() },
    });

    res.json({ game: serializeGame(await findGameOrThrow(gameId)) });
  }),
);

/** Undo a cash-out - the number was wrong, or they are playing on after all. */
gamesRouter.delete(
  '/:id/players/:playerId/cash-out',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const gameId = String(req.params.id);
    const playerId = String(req.params.playerId);

    const seat = await prisma.gamePlayer.findUnique({ where: { id: playerId } });
    if (!seat || seat.gameId !== gameId) throw ApiError.notFound('That player is not in this game.');

    await prisma.gamePlayer.update({
      where: { id: playerId },
      data: { cashOut: null, cashedOutAt: null },
    });

    res.json({ game: serializeGame(await findGameOrThrow(gameId)) });
  }),
);

/** Who is holding the bank, and any note against a seat. */
gamesRouter.patch(
  '/:id/players/:playerId',
  requireAdmin,
  validateBody(updateGamePlayerSchema),
  asyncHandler(async (req, res) => {
    const gameId = String(req.params.id);
    const playerId = String(req.params.playerId);
    const body = req.body as { isBanker?: boolean; notes?: string };

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

    const spent = await prisma.expense.count({ where: { gameId, paidById: seat.userId } });
    const carrying = await prisma.expenseShare.count({
      where: { userId: seat.userId, expense: { gameId } },
    });
    if (spent > 0 || carrying > 0) {
      throw ApiError.conflict(
        'This player is tied to one of the costs for this game. Change that first.',
      );
    }

    // Their buy-ins go with the seat.
    await prisma.gamePlayer.delete({ where: { id: playerId } });
    res.json({ game: serializeGame(await findGameOrThrow(gameId)) });
  }),
);

/**
 * Something the night cost. Several people buying food each get their own
 * row; together they are the dinner bill.
 */
gamesRouter.post(
  '/:id/expenses',
  requireAdmin,
  validateBody(expenseInputSchema),
  asyncHandler(async (req, res) => {
    const gameId = String(req.params.id);
    await findGameOrThrow(gameId);
    const input = req.body as ExpenseInput;

    const seated = await prisma.gamePlayer.findMany({
      where: { gameId },
      select: { userId: true },
    });
    assertExpenseIsConsistent(input, seated.map((seat) => seat.userId));

    await prisma.expense.create({
      data: {
        gameId,
        type: input.type,
        label: input.label ?? null,
        amount: input.amount,
        paidById: input.paidById ?? null,
        at: input.at ? new Date(input.at) : new Date(),
        shares: {
          create: (input.type === 'DINNER' ? [] : (input.shareUserIds ?? [])).map((userId) => ({
            userId,
          })),
        },
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
      paidById: existing.paidById ?? undefined,
      shareUserIds: currentShares.map((share) => share.userId),
      ...(req.body as Record<string, unknown>),
    });

    const seated = await prisma.gamePlayer.findMany({
      where: { gameId },
      select: { userId: true },
    });
    assertExpenseIsConsistent(input, seated.map((seat) => seat.userId));

    await prisma.$transaction(async (tx) => {
      await tx.expenseShare.deleteMany({ where: { expenseId } });
      await tx.expense.update({
        where: { id: expenseId },
        data: {
          type: input.type,
          label: input.label ?? null,
          amount: input.amount,
          paidById: input.paidById ?? null,
          shares: {
            create: (input.type === 'DINNER' ? [] : (input.shareUserIds ?? [])).map((userId) => ({
              userId,
            })),
          },
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
