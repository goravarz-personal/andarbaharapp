import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { computeGameLedger, findWinnerId } from './ledger.service';

export const gameInclude = {
  createdBy: { select: { id: true, username: true, displayName: true } },
  players: {
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarColor: true } },
    },
    orderBy: { id: 'asc' },
  },
  expenses: {
    include: { paidBy: { select: { id: true, username: true, displayName: true } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.GameInclude;

export type GameWithRelations = Prisma.GameGetPayload<{ include: typeof gameInclude }>;

export async function findGameOrThrow(gameId: string): Promise<GameWithRelations> {
  const game = await prisma.game.findUnique({ where: { id: gameId }, include: gameInclude });
  if (!game) throw ApiError.notFound('That game no longer exists.');
  return game;
}

export function ledgerOf(game: GameWithRelations) {
  return computeGameLedger(
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
      type: expense.type,
      amount: expense.amount,
      paidById: expense.paidById,
    })),
  );
}

/** Full game payload the app renders, ledger already worked out. */
export function serializeGame(game: GameWithRelations) {
  const ledger = ledgerOf(game);
  const lineByUser = new Map(ledger.lines.map((line) => [line.userId, line]));

  return {
    id: game.id,
    playedOn: game.playedOn.toISOString(),
    title: game.title,
    location: game.location,
    notes: game.notes,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
    createdBy: game.createdBy,
    playerCount: game.players.length,
    players: game.players.map((player) => ({
      id: player.id,
      userId: player.userId,
      username: player.user.username,
      displayName: player.user.displayName,
      avatarColor: player.user.avatarColor,
      buyIn: player.buyIn,
      cashOut: player.cashOut,
      isWinner: player.isWinner,
      notes: player.notes,
      net: lineByUser.get(player.userId)?.net ?? player.cashOut - player.buyIn,
    })),
    expenses: game.expenses.map((expense) => ({
      id: expense.id,
      type: expense.type,
      label: expense.label,
      amount: expense.amount,
      paidBy: expense.paidBy,
    })),
    totals: ledger.totals,
    balanced: ledger.balanced,
    winner: (() => {
      const seat = game.players.find((player) => player.isWinner);
      if (!seat) return null;
      return {
        userId: seat.userId,
        displayName: seat.user.displayName,
        net: lineByUser.get(seat.userId)?.net ?? 0,
      };
    })(),
  };
}

/** Lighter payload for the games list. */
export function serializeGameSummary(game: GameWithRelations) {
  const ledger = ledgerOf(game);
  const winner = game.players.find((player) => player.isWinner);

  return {
    id: game.id,
    playedOn: game.playedOn.toISOString(),
    title: game.title,
    location: game.location,
    playerCount: game.players.length,
    totals: ledger.totals,
    balanced: ledger.balanced,
    winner: winner
      ? { userId: winner.userId, displayName: winner.user.displayName }
      : null,
    players: game.players.map((player) => ({
      userId: player.userId,
      displayName: player.user.displayName,
      avatarColor: player.user.avatarColor,
      net: ledger.lines.find((line) => line.userId === player.userId)?.net ?? 0,
    })),
  };
}

/**
 * Decides who an expense is recorded against.
 *
 * Dinner is always on the winner - that is the house rule this app exists to
 * keep track of - so it is resolved here rather than taken from the client.
 * Anything else needs someone at the table named explicitly.
 */
export async function resolveExpensePayer(
  gameId: string,
  input: { type: string; paidById?: string },
): Promise<string> {
  const seats = await prisma.gamePlayer.findMany({
    where: { gameId },
    select: { userId: true, isWinner: true },
  });

  if (seats.length === 0) {
    throw ApiError.badRequest('Add players to the game before recording what it cost.');
  }

  if (input.type === 'DINNER') {
    const winnerId = findWinnerId(seats);
    if (!winnerId) {
      throw ApiError.badRequest(
        'Mark who won first - dinner is always on the winner.',
      );
    }
    return winnerId;
  }

  if (!input.paidById) throw ApiError.badRequest('Say who paid.');
  if (!seats.some((seat) => seat.userId === input.paidById)) {
    throw ApiError.badRequest('Whoever paid needs to be one of the players in this game.');
  }
  return input.paidById;
}

/**
 * Only one player can be the winner, because the night's costs come out of
 * their winnings and "split between the winners" is not a rule anyone wants to
 * argue about at midnight.
 */
export async function clearOtherWinners(
  tx: Prisma.TransactionClient,
  gameId: string,
  keepUserId: string,
): Promise<void> {
  await tx.gamePlayer.updateMany({
    where: { gameId, userId: { not: keepUserId }, isWinner: true },
    data: { isWinner: false },
  });
}
