import { z } from 'zod';
import {
  ExpenseCategorySchema,
  GameStatusSchema,
  RoleSchema,
  SplitModeSchema,
} from './enums';

/** Money arrives from clients as whole minor units (paise). */
const money = z
  .number()
  .int('Amount must be a whole number of paise.')
  .min(0, 'Amount cannot be negative.')
  .max(1_000_000_000, 'Amount is unrealistically large.');

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Expected an ISO date string.');

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required.'),
  password: z.string().min(1, 'Password is required.'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters.'),
});

export const createPlayerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters.')
    .max(30)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dots, underscores or dashes only.'),
  displayName: z.string().trim().min(1, 'Name is required.').max(60),
  email: z.string().trim().email('Enter a valid email.').optional().or(z.literal('')),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters.').optional(),
  role: RoleSchema.optional(),
  avatarColor: z.string().trim().max(20).optional(),
});

export const updatePlayerSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  email: z.string().trim().email('Enter a valid email.').optional().or(z.literal('')),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  role: RoleSchema.optional(),
  isActive: z.boolean().optional(),
  avatarColor: z.string().trim().max(20).optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters.').optional(),
});

export const gamePlayerInputSchema = z.object({
  userId: z.string().min(1),
  buyIn: money.optional(),
  cashOut: money.optional(),
  isWinner: z.boolean().optional(),
  notes: z.string().trim().max(280).optional(),
});

export const expenseShareInputSchema = z.object({
  userId: z.string().min(1),
  amount: money,
});

export const expenseInputSchema = z
  .object({
    label: z.string().trim().min(1, 'Give the expense a name.').max(80),
    amount: money.refine((value) => value > 0, 'Amount must be more than zero.'),
    category: ExpenseCategorySchema.default('OTHER'),
    paidById: z.string().min(1, 'Say who paid.'),
    splitMode: SplitModeSchema.default('EQUAL'),
    shares: z.array(expenseShareInputSchema).optional(),
  })
  .refine(
    (value) => value.splitMode !== 'CUSTOM' || (value.shares?.length ?? 0) > 0,
    { message: 'A custom split needs at least one share.', path: ['shares'] },
  );

export const createGameSchema = z.object({
  playedOn: isoDate,
  title: z.string().trim().max(80).optional(),
  location: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
  players: z.array(gamePlayerInputSchema).optional(),
  expenses: z.array(expenseInputSchema).optional(),
});

export const updateGameSchema = z.object({
  playedOn: isoDate.optional(),
  title: z.string().trim().max(80).optional(),
  location: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
  status: GameStatusSchema.optional(),
});

export const upsertGamePlayerSchema = gamePlayerInputSchema;

export const updateGamePlayerSchema = z.object({
  buyIn: money.optional(),
  cashOut: money.optional(),
  isWinner: z.boolean().optional(),
  notes: z.string().trim().max(280).optional(),
});

export const manualSettlementSchema = z.object({
  fromUserId: z.string().min(1, 'Say who owes.'),
  toUserId: z.string().min(1, 'Say who is owed.'),
  amount: money.refine((value) => value > 0, 'Amount must be more than zero.'),
  note: z.string().trim().max(200).optional(),
  gameId: z.string().optional(),
});

export const settlementStatusUpdateSchema = z.object({
  status: z.enum(['PENDING', 'PAID']),
  note: z.string().trim().max(200).optional(),
});

export const updateMeSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  email: z.string().trim().email('Enter a valid email.').optional().or(z.literal('')),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  avatarColor: z.string().trim().max(20).optional(),
});
