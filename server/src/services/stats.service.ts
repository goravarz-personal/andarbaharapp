import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { sum } from '../lib/money';
import { gameInclude, ledgerOf, serializeGameSummary } from './game.service';

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  winRate: number;
  totalBuyIn: number;
  totalCashOut: number;
  netProfit: number;
  bestGame: number;
  worstGame: number;
  averageNet: number;
  lastPlayedOn: string | null;
}

export interface PlayerHistoryRow {
  gameId: string;
  playedOn: string;
  title: string | null;
  location: string | null;
  playerCount: number;
  buyIn: number;
  cashOut: number;
  net: number;
  isWinner: boolean;
}

/**
 * History and stats are worked out from the games as they stand right now,
 * never cached, so correcting a buy-in weeks later fixes every number that
 * depends on it.
 */
async function historyFor(userId: string, where: Prisma.GameWhereInput = {}): Promise<PlayerHistoryRow[]> {
  const games = await prisma.game.findMany({
    where: { ...where, players: { some: { userId } } },
    include: gameInclude,
    orderBy: { playedOn: 'desc' },
  });

  const rows: PlayerHistoryRow[] = [];
  for (const game of games) {
    const line = ledgerOf(game).lines.find((candidate) => candidate.userId === userId);
    if (!line) continue;
    rows.push({
      gameId: game.id,
      playedOn: game.playedOn.toISOString(),
      title: game.title,
      location: game.location,
      playerCount: game.players.length,
      buyIn: line.buyIn,
      cashOut: line.cashOut,
      net: line.net,
      isWinner: line.isWinner,
    });
  }
  return rows;
}

export async function getPlayerHistory(userId: string): Promise<PlayerHistoryRow[]> {
  return historyFor(userId);
}

export function summarise(rows: PlayerHistoryRow[]): PlayerStats {
  const gamesPlayed = rows.length;
  const wins = rows.filter((row) => row.isWinner).length;
  const nets = rows.map((row) => row.net);

  return {
    gamesPlayed,
    wins,
    winRate: gamesPlayed === 0 ? 0 : Math.round((wins / gamesPlayed) * 1000) / 10,
    totalBuyIn: sum(rows.map((row) => row.buyIn)),
    totalCashOut: sum(rows.map((row) => row.cashOut)),
    netProfit: sum(nets),
    bestGame: nets.length === 0 ? 0 : Math.max(...nets),
    worstGame: nets.length === 0 ? 0 : Math.min(...nets),
    averageNet: gamesPlayed === 0 ? 0 : Math.round(sum(nets) / gamesPlayed),
    lastPlayedOn: rows[0]?.playedOn ?? null,
  };
}

export async function getPlayerStats(userId: string): Promise<PlayerStats> {
  return summarise(await getPlayerHistory(userId));
}

/** All players ranked by lifetime net, for the leaderboard screen. */
export async function getLeaderboard() {
  const [users, games] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, username: true, displayName: true, avatarColor: true, role: true },
      orderBy: { displayName: 'asc' },
    }),
    prisma.game.findMany({ include: gameInclude, orderBy: { playedOn: 'desc' } }),
  ]);

  const ledgers = games.map((game) => ({ game, lines: ledgerOf(game).lines }));

  return users
    .map((user) => {
      const rows: PlayerHistoryRow[] = [];
      for (const { game, lines } of ledgers) {
        const line = lines.find((candidate) => candidate.userId === user.id);
        if (!line) continue;
        rows.push({
          gameId: game.id,
          playedOn: game.playedOn.toISOString(),
          title: game.title,
          location: game.location,
          playerCount: game.players.length,
          buyIn: line.buyIn,
          cashOut: line.cashOut,
          net: line.net,
          isWinner: line.isWinner,
        });
      }
      return { ...user, stats: summarise(rows) };
    })
    .sort((a, b) => b.stats.netProfit - a.stats.netProfit);
}

/** Home screen numbers for whoever is signed in. */
export async function getDashboard(userId: string) {
  const [history, gameCount, playerCount, recentGames] = await Promise.all([
    getPlayerHistory(userId),
    prisma.game.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.game.findMany({ include: gameInclude, orderBy: { playedOn: 'desc' }, take: 5 }),
  ]);

  return {
    stats: summarise(history),
    totals: { games: gameCount, players: playerCount },
    recentGames: recentGames.map(serializeGameSummary),
  };
}
