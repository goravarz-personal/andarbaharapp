import { z } from 'zod';
import { normalizePhone } from '../lib/phone';
import { ExpenseTypeSchema, RoleSchema } from './enums';

/** Money arrives from clients as whole minor units (paise). */
const money = z
  .number()
  .int('Amount must be a whole number of paise.')
  .min(0, 'Amount cannot be negative.')
  .max(1_000_000_000, 'Amount is unrealistically large.');

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Expected an ISO date string.');

/**
 * A phone number, stored as E.164 so a wa.me link can use it.
 *
 * The transform is the point: whatever shape it was typed in, what reaches the
 * database is "+919876543210". An empty string still means "clear it", so the
 * one way to fail here is to type something that is not a phone number.
 */
const PHONE_MESSAGE = 'Enter a mobile number with its country code, like +91 98765 43210.';

const phone = z
  .string()
  .trim()
  // Generous, and carrying the same message: a length complaint about a field
  // this shape is never the thing that helps somebody fix it.
  .max(40, PHONE_MESSAGE)
  .transform((value, ctx) => {
    if (value === '') return '';
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: PHONE_MESSAGE });
      return z.NEVER;
    }
    return normalized;
  });

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
  phone: phone.optional(),
  password: z.string().min(6, 'Password must be at least 6 characters.').optional(),
  role: RoleSchema.optional(),
  avatarColor: z.string().trim().max(20).optional(),
});

export const updatePlayerSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  email: z.string().trim().email('Enter a valid email.').optional().or(z.literal('')),
  phone: phone.optional(),
  role: RoleSchema.optional(),
  isActive: z.boolean().optional(),
  avatarColor: z.string().trim().max(20).optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters.').optional(),
});

export const gamePlayerInputSchema = z.object({
  userId: z.string().min(1),
  /** What they bought in for when they sat down. */
  buyIn: money.optional(),
  isBanker: z.boolean().optional(),
  notes: z.string().trim().max(280).optional(),
});

/**
 * Seating someone. Either an existing player by id, or a brand new one
 * created on the spot - which is what happens when a friend turns up who has
 * never played before.
 */
export const seatPlayerSchema = z
  .object({
    userId: z.string().min(1).optional(),
    newPlayer: createPlayerSchema.omit({ role: true, password: true }).optional(),
    /** Their opening trip to the banker. */
    buyIn: money.optional(),
    isBanker: z.boolean().optional(),
    at: isoDate.optional(),
  })
  .refine((value) => Boolean(value.userId) !== Boolean(value.newPlayer), {
    message: 'Name an existing player or a new one, not both.',
    path: ['userId'],
  });

/** Another trip to the banker for more chips. */
export const buyInSchema = z.object({
  amount: money.refine((value) => value > 0, 'A buy-in has to be more than zero.'),
  at: isoDate.optional(),
});

/** Cashing out. Happens once, at the end of the night. */
export const cashOutSchema = z.object({
  amount: money,
  at: isoDate.optional(),
});

export const expenseInputSchema = z.object({
  type: ExpenseTypeSchema.default('DINNER'),
  amount: money.refine((value) => value > 0, 'Amount must be more than zero.'),
  /** Optional note. The type already says what kind of cost this is. */
  label: z.string().trim().max(80).optional(),
  /** Who went out and spent the money. Several people can buy food. */
  paidById: z.string().min(1).optional(),
  /**
   * Who is chipping in, split evenly between them. Ignored for dinner, which
   * always lands on whoever won the most - the server works that out rather
   * than trusting the client.
   */
  shareUserIds: z.array(z.string().min(1)).max(20).optional(),
  at: isoDate.optional(),
});

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
});

export const upsertGamePlayerSchema = gamePlayerInputSchema;

export const updateGamePlayerSchema = z.object({
  isBanker: z.boolean().optional(),
  notes: z.string().trim().max(280).optional(),
});

export const updateMeSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  email: z.string().trim().email('Enter a valid email.').optional().or(z.literal('')),
  phone: phone.optional(),
  avatarColor: z.string().trim().max(20).optional(),
});
