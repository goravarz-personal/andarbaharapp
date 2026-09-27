/**
 * Creates the bootstrap admin account, and optionally a few demo players and
 * game nights so the app has something to show on first run.
 *
 *   npm run db:seed                     # admin only
 *   SEED_DEMO_DATA=true npm run db:seed # admin + demo data
 *
 * Safe to re-run: it updates rather than duplicates.
 */
import { env } from '../src/lib/env';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { pickAvatarColor } from '../src/services/user.service';
import { toMinor } from '../src/lib/money';

async function upsertUser(params: {
  username: string;
  displayName: string;
  password: string;
  role?: 'ADMIN' | 'PLAYER';
  mustChangePassword?: boolean;
}) {
  const passwordHash = await hashPassword(params.password);
  return prisma.user.upsert({
    where: { username: params.username },
    update: {
      displayName: params.displayName,
      role: params.role ?? 'PLAYER',
      isActive: true,
    },
    create: {
      username: params.username,
      displayName: params.displayName,
      passwordHash,
      role: params.role ?? 'PLAYER',
      mustChangePassword: params.mustChangePassword ?? false,
      avatarColor: pickAvatarColor(params.username),
    },
  });
}

async function seedDemo(adminId: string) {
  const existing = await prisma.game.count();
  if (existing > 0) {
    console.log('Games already exist - skipping demo data.');
    return;
  }

  const people = await Promise.all([
    upsertUser({ username: 'ravi', displayName: 'Ravi', password: 'andar123' }),
    upsertUser({ username: 'meera', displayName: 'Meera', password: 'andar123' }),
    upsertUser({ username: 'arjun', displayName: 'Arjun', password: 'andar123' }),
    upsertUser({ username: 'sana', displayName: 'Sana', password: 'andar123' }),
  ]);
  const [ravi, meera, arjun, sana] = people as [
    (typeof people)[number],
    (typeof people)[number],
    (typeof people)[number],
    (typeof people)[number],
  ];

  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const evening = (base: Date, hours: number) =>
    new Date(base.getTime() + hours * 60 * 60 * 1000);

  // Night one. Ravi holds the bank. Meera runs dry twice and buys in again,
  // which is why her buy-in is 3000 across three trips. 9000 of chips out,
  // 9000 back in. Two people bought food; the whole bill is Meera's, since she
  // won the most.
  const gameOne = await prisma.game.create({
    data: {
      playedOn: twoWeeksAgo,
      title: 'Saturday-Regular',
      location: 'Katte Room',
      createdById: adminId,
      players: {
        create: [
          {
            userId: ravi.id,
            isBanker: true,
            joinedAt: evening(twoWeeksAgo, 0),
            cashOut: toMinor(1800),
            cashedOutAt: evening(twoWeeksAgo, 4),
            buyIns: { create: [{ amount: toMinor(2000), at: evening(twoWeeksAgo, 0) }] },
          },
          {
            userId: meera.id,
            joinedAt: evening(twoWeeksAgo, 0),
            cashOut: toMinor(4800),
            cashedOutAt: evening(twoWeeksAgo, 4),
            buyIns: {
              create: [
                { amount: toMinor(1000), at: evening(twoWeeksAgo, 0) },
                { amount: toMinor(1000), at: evening(twoWeeksAgo, 1.5) },
                { amount: toMinor(1000), at: evening(twoWeeksAgo, 2.5) },
              ],
            },
          },
          {
            userId: arjun.id,
            joinedAt: evening(twoWeeksAgo, 0.5),
            cashOut: toMinor(1400),
            cashedOutAt: evening(twoWeeksAgo, 4),
            buyIns: { create: [{ amount: toMinor(2000), at: evening(twoWeeksAgo, 0.5) }] },
          },
          {
            userId: sana.id,
            joinedAt: evening(twoWeeksAgo, 1),
            cashOut: toMinor(1000),
            cashedOutAt: evening(twoWeeksAgo, 4),
            buyIns: { create: [{ amount: toMinor(2000), at: evening(twoWeeksAgo, 1) }] },
          },
        ],
      },
      expenses: {
        create: [
          // Ravi got the starters in, Sana ordered the biryani. Together they
          // are the dinner bill, and Meera carries all of it.
          {
            label: 'Starters',
            amount: toMinor(400),
            type: 'DINNER',
            paidById: ravi.id,
            at: evening(twoWeeksAgo, 1.5),
          },
          {
            label: 'Biryani',
            amount: toMinor(1200),
            type: 'DINNER',
            paidById: sana.id,
            at: evening(twoWeeksAgo, 2),
          },
          {
            label: 'New decks',
            amount: toMinor(400),
            type: 'CARDS',
            paidById: arjun.id,
            at: evening(twoWeeksAgo, 0.5),
            shares: { create: [{ userId: ravi.id }, { userId: arjun.id }] },
          },
        ],
      },
    },
  });

  // Night two, three days ago. Still going: Sana banks it, and Arjun has not
  // cashed out yet, so the night has no settled result.
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const gameTwo = await prisma.game.create({
    data: {
      playedOn: threeDaysAgo,
      title: 'Wednesday-Regular',
      location: 'Katte Room',
      createdById: adminId,
      players: {
        create: [
          {
            userId: ravi.id,
            joinedAt: evening(threeDaysAgo, 0),
            cashOut: toMinor(3300),
            cashedOutAt: evening(threeDaysAgo, 3),
            buyIns: { create: [{ amount: toMinor(3000), at: evening(threeDaysAgo, 0) }] },
          },
          {
            userId: meera.id,
            joinedAt: evening(threeDaysAgo, 0),
            cashOut: toMinor(1200),
            cashedOutAt: evening(threeDaysAgo, 3),
            buyIns: { create: [{ amount: toMinor(3000), at: evening(threeDaysAgo, 0) }] },
          },
          {
            userId: arjun.id,
            joinedAt: evening(threeDaysAgo, 0),
            buyIns: {
              create: [
                { amount: toMinor(3000), at: evening(threeDaysAgo, 0) },
                { amount: toMinor(2000), at: evening(threeDaysAgo, 2) },
              ],
            },
          },
          {
            userId: sana.id,
            isBanker: true,
            joinedAt: evening(threeDaysAgo, 0),
            buyIns: { create: [{ amount: toMinor(3000), at: evening(threeDaysAgo, 0) }] },
          },
        ],
      },
      expenses: {
        create: [
          {
            label: 'Pizza',
            amount: toMinor(1800),
            type: 'DINNER',
            paidById: ravi.id,
            at: evening(threeDaysAgo, 2),
          },
        ],
      },
    },
  });

  console.log(`Seeded demo games: ${gameOne.title}, ${gameTwo.title}.`);
}

async function main() {
  const admin = await prisma.user.upsert({
    where: { username: env.admin.username.toLowerCase() },
    update: { role: 'ADMIN', isActive: true },
    create: {
      username: env.admin.username.toLowerCase(),
      displayName: env.admin.displayName,
      passwordHash: await hashPassword(env.admin.password),
      role: 'ADMIN',
      // Default credentials must be changed on first sign-in.
      mustChangePassword: env.admin.password === 'admin123',
      avatarColor: pickAvatarColor(env.admin.username),
    },
  });

  console.log(`Admin ready: ${admin.username}`);
  if (env.admin.password === 'admin123') {
    console.log('  Password is the default "admin123" - the app will ask you to change it on first sign-in.');
  }

  if (env.seedDemoData) {
    await seedDemo(admin.id);
    console.log('Demo players: ravi / meera / arjun / sana, all with password "andar123".');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
