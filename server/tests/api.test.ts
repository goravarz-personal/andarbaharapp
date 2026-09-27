import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, auth, login, makeUser, resetDb, rs } from './helpers';
import { prisma } from '../src/lib/prisma';

let adminToken: string;
let playerToken: string;
let admin: Awaited<ReturnType<typeof makeUser>>;
let ravi: Awaited<ReturnType<typeof makeUser>>;
let meera: Awaited<ReturnType<typeof makeUser>>;

beforeEach(async () => {
  await resetDb();
  admin = await makeUser('admin', 'ADMIN');
  ravi = await makeUser('ravi');
  meera = await makeUser('meera');
  adminToken = await login('admin');
  playerToken = await login('ravi');
});

describe('auth', () => {
  it('signs a player in and hands back a token', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ravi', password: 'password123' })
      .expect(200);

    expect(response.body.token).toBeTruthy();
    expect(response.body.user).toMatchObject({ username: 'ravi', role: 'PLAYER' });
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it('is case-insensitive about the username', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ username: 'RAVI', password: 'password123' })
      .expect(200);
  });

  it('rejects a wrong password without saying which part was wrong', async () => {
    const bad = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ravi', password: 'nope' })
      .expect(401);
    const missing = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ghost', password: 'nope' })
      .expect(401);

    expect(bad.body.error.message).toBe(missing.body.error.message);
  });

  it('turns away a deactivated player', async () => {
    await prisma.user.update({ where: { id: ravi.id }, data: { isActive: false } });
    await request(app)
      .post('/api/auth/login')
      .send({ username: 'ravi', password: 'password123' })
      .expect(403);
  });

  it('needs a token for anything else', async () => {
    await request(app).get('/api/games').expect(401);
    await request(app).get('/api/players').expect(401);
  });

  it('retires old tokens after a password change', async () => {
    const stale = playerToken;
    await request(app)
      .post('/api/auth/change-password')
      .set(auth(stale))
      .send({ currentPassword: 'password123', newPassword: 'brandnew123' })
      .expect(200);

    await request(app).get('/api/games').set(auth(stale)).expect(401);
    await login('ravi', 'brandnew123');
  });
});

describe('players', () => {
  it('lets an admin add a player and returns a one-time password', async () => {
    const response = await request(app)
      .post('/api/players')
      .set(auth(adminToken))
      .send({ username: 'arjun', displayName: 'Arjun' })
      .expect(201);

    expect(response.body.temporaryPassword).toBeTruthy();
    expect(response.body.player.mustChangePassword).toBe(true);
    await login('arjun', response.body.temporaryPassword);
  });

  it('stops a player from adding players', async () => {
    await request(app)
      .post('/api/players')
      .set(auth(playerToken))
      .send({ username: 'sneaky', displayName: 'Sneaky' })
      .expect(403);
  });

  it('refuses a duplicate username', async () => {
    await request(app)
      .post('/api/players')
      .set(auth(adminToken))
      .send({ username: 'ravi', displayName: 'Another Ravi' })
      .expect(409);
  });

  it('validates the username format', async () => {
    const response = await request(app)
      .post('/api/players')
      .set(auth(adminToken))
      .send({ username: 'has spaces!', displayName: 'Nope' })
      .expect(400);
    expect(response.body.error.details.username).toBeTruthy();
  });

  it('lets every player see the whole roster', async () => {
    const response = await request(app).get('/api/players').set(auth(playerToken)).expect(200);
    expect(response.body.players).toHaveLength(3);
  });

  it('will not let the last admin be demoted', async () => {
    const response = await request(app)
      .patch(`/api/players/${admin.id}`)
      .set(auth(adminToken))
      .send({ role: 'PLAYER' })
      .expect(400);
    expect(response.body.error.message).toMatch(/own admin access/i);
  });

  it('deactivates rather than deletes a player with history', async () => {
    const game = await request(app)
      .post('/api/games')
      .set(auth(adminToken))
      .send({ playedOn: new Date().toISOString(), players: [{ userId: ravi.id, buyIn: rs(100) }] })
      .expect(201);
    expect(game.body.game.players).toHaveLength(1);

    const response = await request(app)
      .delete(`/api/players/${ravi.id}`)
      .set(auth(adminToken))
      .expect(200);

    expect(response.body.deactivated).toBe(true);
    expect(await prisma.user.count({ where: { id: ravi.id } })).toBe(1);
  });

  it('hard-deletes a player who never played', async () => {
    await request(app).delete(`/api/players/${meera.id}`).set(auth(adminToken)).expect(200);
    expect(await prisma.user.count({ where: { id: meera.id } })).toBe(0);
  });

  it('resets a password and signs the old session out', async () => {
    const response = await request(app)
      .post(`/api/players/${ravi.id}/reset-password`)
      .set(auth(adminToken))
      .send({})
      .expect(200);

    await request(app).get('/api/games').set(auth(playerToken)).expect(401);
    await login('ravi', response.body.password);
  });
});

describe('games', () => {
  /** Start a night with nobody at the table yet, the way an admin would. */
  async function startGame() {
    const response = await request(app)
      .post('/api/games')
      .set(auth(adminToken))
      .send({ playedOn: '2026-02-14T19:30:00.000Z', title: 'Saturday-Regular', location: 'Katte Room' })
      .expect(201);
    return response.body.game;
  }

  async function seat(gameId: string, body: Record<string, unknown>) {
    const response = await request(app)
      .post(`/api/games/${gameId}/players`)
      .set(auth(adminToken))
      .send(body)
      .expect(201);
    return response.body;
  }

  const seatOf = (game: { players: Array<{ userId: string; id: string }> }, userId: string) =>
    game.players.find((p) => p.userId === userId)!.id;

  it('starts an empty night that can be filled in as people arrive', async () => {
    const game = await startGame();
    expect(game.playerCount).toBe(0);
    expect(game.title).toBe('Saturday-Regular');
    expect(game.complete).toBe(false);
  });

  it('seats a player with the chips they started on', async () => {
    const game = await startGame();
    const { game: withRavi } = await seat(game.id, { userId: ravi.id, buyIn: rs(1000), isBanker: true });

    const seatRow = withRavi.players[0];
    expect(seatRow.displayName).toBe('Ravi');
    expect(seatRow.buyIn).toBe(rs(1000));
    expect(seatRow.buyIns).toHaveLength(1);
    expect(seatRow.buyIns[0].at).toBeTruthy();
    expect(seatRow.isPlaying).toBe(true);
    expect(withRavi.banker.displayName).toBe('Ravi');
  });

  it('lets a player buy in again, and adds the trips together', async () => {
    const game = await startGame();
    const { game: withRavi } = await seat(game.id, { userId: ravi.id, buyIn: rs(1000) });
    const seatId = seatOf(withRavi, ravi.id);

    await request(app)
      .post(`/api/games/${game.id}/players/${seatId}/buy-ins`)
      .set(auth(adminToken))
      .send({ amount: rs(500) })
      .expect(201);
    const again = await request(app)
      .post(`/api/games/${game.id}/players/${seatId}/buy-ins`)
      .set(auth(adminToken))
      .send({ amount: rs(500) })
      .expect(201);

    const row = again.body.game.players[0];
    expect(row.buyIn).toBe(rs(2000));
    expect(row.buyIns).toHaveLength(3);
    // Each trip is timed.
    expect(row.buyIns.every((b: { at: string }) => Boolean(b.at))).toBe(true);
  });

  it('creates a player who has never played before, mid-game', async () => {
    const game = await startGame();
    const response = await seat(game.id, {
      newPlayer: { username: 'newcomer', displayName: 'Newcomer' },
      buyIn: rs(1000),
    });

    expect(response.temporaryPassword).toBeTruthy();
    expect(response.game.players[0].displayName).toBe('Newcomer');
    // They can sign in with what the admin was handed.
    await login('newcomer', response.temporaryPassword);
  });

  it('cashes a player out once, and refuses a second time', async () => {
    const game = await startGame();
    const { game: withRavi } = await seat(game.id, { userId: ravi.id, buyIn: rs(1000) });
    const seatId = seatOf(withRavi, ravi.id);

    const out = await request(app)
      .post(`/api/games/${game.id}/players/${seatId}/cash-out`)
      .set(auth(adminToken))
      .send({ amount: rs(1500) })
      .expect(200);

    const row = out.body.game.players[0];
    expect(row.cashOut).toBe(rs(1500));
    expect(row.cashedOutAt).toBeTruthy();
    expect(row.isPlaying).toBe(false);

    const second = await request(app)
      .post(`/api/games/${game.id}/players/${seatId}/cash-out`)
      .set(auth(adminToken))
      .send({ amount: rs(9999) })
      .expect(409);
    expect(second.body.error.message).toMatch(/already cashed out/i);
  });

  it('will not take another buy-in once somebody has cashed out', async () => {
    const game = await startGame();
    const { game: withRavi } = await seat(game.id, { userId: ravi.id, buyIn: rs(1000) });
    const seatId = seatOf(withRavi, ravi.id);

    await request(app)
      .post(`/api/games/${game.id}/players/${seatId}/cash-out`)
      .set(auth(adminToken))
      .send({ amount: rs(500) })
      .expect(200);

    await request(app)
      .post(`/api/games/${game.id}/players/${seatId}/buy-ins`)
      .set(auth(adminToken))
      .send({ amount: rs(500) })
      .expect(409);
  });

  it('is unfinished until everyone has cashed out', async () => {
    const game = await startGame();
    const { game: a } = await seat(game.id, { userId: ravi.id, buyIn: rs(1000) });
    const { game: b } = await seat(game.id, { userId: meera.id, buyIn: rs(1000) });

    await request(app)
      .post(`/api/games/${game.id}/players/${seatOf(b, ravi.id)}/cash-out`)
      .set(auth(adminToken))
      .send({ amount: rs(400) })
      .expect(200);

    const midway = await request(app).get(`/api/games/${game.id}`).set(auth(adminToken)).expect(200);
    expect(midway.body.game.complete).toBe(false);
    expect(midway.body.game.playersStillIn).toBe(1);
    expect(a.playerCount).toBe(1);

    const done = await request(app)
      .post(`/api/games/${game.id}/players/${seatOf(b, meera.id)}/cash-out`)
      .set(auth(adminToken))
      .send({ amount: rs(1600) })
      .expect(200);
    expect(done.body.game.complete).toBe(true);
    expect(done.body.game.balanced).toBe(true);
    expect(done.body.game.topWinner.displayName).toBe('Meera');
  });

  it('adds up food bought by several people and puts the lot on the top winner', async () => {
    const game = await startGame();
    const { game: a } = await seat(game.id, { userId: ravi.id, buyIn: rs(1000) });
    const { game: b } = await seat(game.id, { userId: meera.id, buyIn: rs(1000) });

    await request(app)
      .post(`/api/games/${game.id}/expenses`)
      .set(auth(adminToken))
      .send({ type: 'DINNER', label: 'Starters', amount: rs(200), paidById: ravi.id })
      .expect(201);
    await request(app)
      .post(`/api/games/${game.id}/expenses`)
      .set(auth(adminToken))
      .send({ type: 'DINNER', label: 'Biryani', amount: rs(400), paidById: meera.id })
      .expect(201);

    await request(app)
      .post(`/api/games/${game.id}/players/${seatOf(b, ravi.id)}/cash-out`)
      .set(auth(adminToken))
      .send({ amount: rs(300) })
      .expect(200);
    const done = await request(app)
      .post(`/api/games/${game.id}/players/${seatOf(b, meera.id)}/cash-out`)
      .set(auth(adminToken))
      .send({ amount: rs(1700) })
      .expect(200);

    const result = done.body.game;
    expect(result.totals.dinner).toBe(rs(600));

    const meeraRow = result.players.find((p: { userId: string }) => p.userId === meera.id);
    // Meera won the most, so the whole 600 is hers - including Ravi's starters.
    expect(meeraRow.expenseShare).toBe(rs(600));
    expect(meeraRow.net).toBe(rs(100));
    expect(a.playerCount).toBe(1);

    // And she owes Ravi for the starters she did not buy.
    expect(result.dinnerDebts).toEqual([
      expect.objectContaining({ amount: rs(200) }),
    ]);
    expect(result.dinnerDebts[0].to.displayName).toBe('Ravi');
  });

  it('insists dinner says who bought it', async () => {
    const game = await startGame();
    await seat(game.id, { userId: ravi.id, buyIn: rs(1000) });

    const response = await request(app)
      .post(`/api/games/${game.id}/expenses`)
      .set(auth(adminToken))
      .send({ type: 'DINNER', amount: rs(500) })
      .expect(400);
    expect(response.body.error.message).toMatch(/who bought it/i);
  });

  it('splits a non-dinner cost between whoever chipped in', async () => {
    const game = await startGame();
    const { game: a } = await seat(game.id, { userId: ravi.id, buyIn: rs(1000) });
    await seat(game.id, { userId: meera.id, buyIn: rs(1000) });
    expect(a.playerCount).toBe(1);

    const response = await request(app)
      .post(`/api/games/${game.id}/expenses`)
      .set(auth(adminToken))
      .send({
        type: 'CARDS',
        amount: rs(300),
        paidById: ravi.id,
        shareUserIds: [ravi.id, meera.id],
      })
      .expect(201);

    const ravRow = response.body.game.players.find((p: { userId: string }) => p.userId === ravi.id);
    expect(ravRow.expenseShare).toBe(rs(150));
  });

  it('will not seat the same player twice', async () => {
    const game = await startGame();
    await seat(game.id, { userId: ravi.id, buyIn: rs(1000) });
    await request(app)
      .post(`/api/games/${game.id}/players`)
      .set(auth(adminToken))
      .send({ userId: ravi.id, buyIn: rs(500) })
      .expect(409);
  });

  it('deletes a game and everything hanging off it', async () => {
    const game = await startGame();
    await seat(game.id, { userId: ravi.id, buyIn: rs(1000) });
    await request(app).delete(`/api/games/${game.id}`).set(auth(adminToken)).expect(200);

    expect(await prisma.gamePlayer.count({ where: { gameId: game.id } })).toBe(0);
    expect(await prisma.buyIn.count()).toBe(0);
    await request(app).get(`/api/games/${game.id}`).set(auth(adminToken)).expect(404);
  });
});

describe('only an admin can change a game', () => {
  /**
   * Walks every route the games router actually exposes rather than a list
   * written by hand, so a new one cannot quietly arrive without a guard.
   */
  it('turns a player away from every route that changes something', async () => {
    const created = await request(app)
      .post('/api/games')
      .set(auth(adminToken))
      .send({ playedOn: new Date().toISOString() })
      .expect(201);
    const gameId = created.body.game.id;

    const seated = await request(app)
      .post(`/api/games/${gameId}/players`)
      .set(auth(adminToken))
      .send({ userId: ravi.id, buyIn: rs(1000) })
      .expect(201);
    const seatId = seated.body.game.players[0].id;

    // Spelling the verb as a literal union lets supertest be called directly,
    // rather than indexed through a cast that hides what is being called.
    const attempts: Array<['post' | 'patch' | 'delete', string, Record<string, unknown>?]> = [
      ['post', '/api/games', { playedOn: new Date().toISOString() }],
      ['patch', `/api/games/${gameId}`, { title: 'mine now' }],
      ['delete', `/api/games/${gameId}`],
      ['post', `/api/games/${gameId}/players`, { userId: meera.id }],
      ['patch', `/api/games/${gameId}/players/${seatId}`, { isBanker: true }],
      ['delete', `/api/games/${gameId}/players/${seatId}`],
      ['post', `/api/games/${gameId}/players/${seatId}/buy-ins`, { amount: rs(100) }],
      ['delete', `/api/games/${gameId}/players/${seatId}/buy-ins/anything`],
      ['post', `/api/games/${gameId}/players/${seatId}/cash-out`, { amount: rs(100) }],
      ['delete', `/api/games/${gameId}/players/${seatId}/cash-out`],
      ['post', `/api/games/${gameId}/expenses`, { type: 'DINNER', amount: rs(100), paidById: ravi.id }],
      ['patch', `/api/games/${gameId}/expenses/anything`, { amount: rs(100) }],
      ['delete', `/api/games/${gameId}/expenses/anything`],
    ];

    for (const [method, path, body] of attempts) {
      const response = await request(app)[method](path).set(auth(playerToken)).send(body ?? {});
      expect({ method, path, status: response.status }).toEqual({ method, path, status: 403 });
    }

    // And the game is untouched by all that.
    const after = await request(app).get(`/api/games/${gameId}`).set(auth(adminToken)).expect(200);
    expect(after.body.game.title).toBeNull();
    expect(after.body.game.players).toHaveLength(1);
  });

  it('still lets a player read everything', async () => {
    await request(app).get('/api/games').set(auth(playerToken)).expect(200);
    await request(app).get('/api/players').set(auth(playerToken)).expect(200);
  });
});

describe('history and stats', () => {
  /** Plays a night start to finish: seat everyone, then cash them all out. */
  async function playNight(
    playedOn: string,
    results: Array<{ userId: string; buyIn: number; cashOut: number }>,
  ) {
    const created = await request(app)
      .post('/api/games')
      .set(auth(adminToken))
      .send({ playedOn })
      .expect(201);
    const gameId = created.body.game.id;

    for (const result of results) {
      await request(app)
        .post(`/api/games/${gameId}/players`)
        .set(auth(adminToken))
        .send({ userId: result.userId, buyIn: result.buyIn })
        .expect(201);
    }

    const seated = await request(app).get(`/api/games/${gameId}`).set(auth(adminToken)).expect(200);
    for (const result of results) {
      const seatId = seated.body.game.players.find(
        (p: { userId: string }) => p.userId === result.userId,
      ).id;
      await request(app)
        .post(`/api/games/${gameId}/players/${seatId}/cash-out`)
        .set(auth(adminToken))
        .send({ amount: result.cashOut })
        .expect(200);
    }
    return gameId;
  }

  beforeEach(async () => {
    await playNight('2026-01-10T19:00:00.000Z', [
      { userId: ravi.id, buyIn: rs(1000), cashOut: rs(1600) },
      { userId: meera.id, buyIn: rs(1000), cashOut: rs(400) },
    ]);
    await playNight('2026-01-24T19:00:00.000Z', [
      { userId: ravi.id, buyIn: rs(1000), cashOut: rs(800) },
      { userId: meera.id, buyIn: rs(1000), cashOut: rs(1200) },
    ]);
  });

  it('leaves a night still being played out of everyone\'s record', async () => {
    // A third night, started but not finished.
    const created = await request(app)
      .post('/api/games')
      .set(auth(adminToken))
      .send({ playedOn: '2026-02-01T19:00:00.000Z' })
      .expect(201);
    await request(app)
      .post(`/api/games/${created.body.game.id}/players`)
      .set(auth(adminToken))
      .send({ userId: ravi.id, buyIn: rs(5000) })
      .expect(201);

    const response = await request(app)
      .get(`/api/players/${ravi.id}/history`)
      .set(auth(playerToken))
      .expect(200);

    // Still the two finished nights; the 5000 he is sitting on changes nothing.
    expect(response.body.history).toHaveLength(2);
    expect(response.body.stats.gamesPlayed).toBe(2);
  });

  it('gives a player their full playing history', async () => {
    const response = await request(app)
      .get(`/api/players/${ravi.id}/history`)
      .set(auth(playerToken))
      .expect(200);

    expect(response.body.history).toHaveLength(2);
    // Newest first.
    expect(response.body.history[0].playedOn.startsWith('2026-01-24')).toBe(true);
    expect(response.body.stats).toMatchObject({
      gamesPlayed: 2,
      wins: 1,
      winRate: 50,
      netProfit: rs(400),
      bestGame: rs(600),
      worstGame: rs(-200),
    });
  });

  it('ranks the roster by lifetime net', async () => {
    const response = await request(app)
      .get('/api/players/leaderboard')
      .set(auth(playerToken))
      .expect(200);

    const rows = response.body.leaderboard as Array<{
      displayName: string;
      stats: { gamesPlayed: number };
    }>;

    const played = rows.filter((row) => row.stats.gamesPlayed > 0).map((row) => row.displayName);
    expect(played[0]).toBe('Ravi');
    expect(played[played.length - 1]).toBe('Meera');

    // Somebody who has never sat down does not lead the table on nil.
    expect(rows[rows.length - 1]?.displayName).toBe('Admin');
    expect(rows[rows.length - 1]?.stats.gamesPlayed).toBe(0);
  });

  it('sums the dashboard for whoever is signed in', async () => {
    const response = await request(app).get('/api/dashboard').set(auth(playerToken)).expect(200);

    expect(response.body.stats.gamesPlayed).toBe(2);
    expect(response.body.totals).toMatchObject({ games: 2, players: 3 });
    expect(response.body.recentGames).toHaveLength(2);
    expect(response.body.balances).toBeUndefined();
  });

  it('filters the games list by player', async () => {
    const arjun = await makeUser('arjun');
    const all = await request(app).get('/api/games').set(auth(playerToken)).expect(200);
    const forArjun = await request(app)
      .get(`/api/games?playerId=${arjun.id}`)
      .set(auth(playerToken))
      .expect(200);

    expect(all.body.games).toHaveLength(2);
    expect(forArjun.body.games).toHaveLength(0);
  });
});
