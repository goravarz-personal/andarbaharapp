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

  // Night one. Everyone buys 2000 of chips from Ravi, who holds the bank.
  // 8000 of chips out, 8000 back in. Meera wins the most, so dinner is hers.
  const gameOne = await prisma.game.create({
    data: {
      playedOn: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      title: 'Saturday-Regular',
      location: 'Katte Room',
      createdById: adminId,
      players: {
        create: [
          { userId: ravi.id, buyIn: toMinor(2000), cashOut: toMinor(1800), isBanker: true },
          { userId: meera.id, buyIn: toMinor(2000), cashOut: toMinor(3800) },
          { userId: arjun.id, buyIn: toMinor(2000), cashOut: toMinor(1400) },
          { userId: sana.id, buyIn: toMinor(2000), cashOut: toMinor(1000) },
        ],
      },
      expenses: {
        create: [
          // No shares: dinner lands on whoever won the most.
          { label: 'Biryani and drinks', amount: toMinor(1200), type: 'DINNER' },
          // Ravi and Arjun went halves on the new decks.
          {
            label: 'New decks',
            amount: toMinor(400),
            type: 'CARDS',
            shares: { create: [{ userId: ravi.id }, { userId: arjun.id }] },
          },
        ],
      },
    },
  });

  // Night two. Sana banks it. Arjun takes the most off the table and buys the
  // pizza; Ravi also finishes ahead, but the bill is not his to carry.
  const gameTwo = await prisma.game.create({
    data: {
      playedOn: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      title: 'Wednesday-Regular',
      location: 'Katte Room',
      createdById: adminId,
      players: {
        create: [
          { userId: ravi.id, buyIn: toMinor(3000), cashOut: toMinor(3300) },
          { userId: meera.id, buyIn: toMinor(3000), cashOut: toMinor(1200) },
          { userId: arjun.id, buyIn: toMinor(3000), cashOut: toMinor(5400) },
          { userId: sana.id, buyIn: toMinor(3000), cashOut: toMinor(2100), isBanker: true },
        ],
      },
      expenses: {
        create: [{ label: 'Pizza', amount: toMinor(1800), type: 'DINNER' }],
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
