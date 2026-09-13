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

  // Night one: Meera runs away with it and buys dinner out of her winnings.
  // 8000 into the pot, 2400 of it spent, 5600 handed back out.
  const gameOne = await prisma.game.create({
    data: {
      playedOn: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      title: 'Diwali warm-up',
      location: "Ravi's place",
      createdById: adminId,
      players: {
        create: [
          { userId: ravi.id, buyIn: toMinor(2000), cashOut: toMinor(1000) },
          { userId: meera.id, buyIn: toMinor(2000), cashOut: toMinor(3200), isWinner: true },
          { userId: arjun.id, buyIn: toMinor(2000), cashOut: toMinor(800) },
          { userId: sana.id, buyIn: toMinor(2000), cashOut: toMinor(600) },
        ],
      },
      expenses: {
        create: [
          { label: 'Biryani and drinks', amount: toMinor(2000), type: 'DINNER', paidById: meera.id },
          { label: 'New decks', amount: toMinor(400), type: 'CARDS', paidById: arjun.id },
        ],
      },
    },
  });

  // Night two: Arjun's turn, so the pizza is on him.
  // 12000 into the pot, 1800 of it on pizza, 10200 handed back out.
  const gameTwo = await prisma.game.create({
    data: {
      playedOn: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      title: 'Saturday regular',
      location: "Sana's terrace",
      createdById: adminId,
      players: {
        create: [
          { userId: ravi.id, buyIn: toMinor(3000), cashOut: toMinor(3000) },
          { userId: meera.id, buyIn: toMinor(3000), cashOut: toMinor(900) },
          { userId: arjun.id, buyIn: toMinor(3000), cashOut: toMinor(4500), isWinner: true },
          { userId: sana.id, buyIn: toMinor(3000), cashOut: toMinor(1800) },
        ],
      },
      expenses: {
        create: [
          { label: 'Pizza', amount: toMinor(1800), type: 'DINNER', paidById: arjun.id },
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
