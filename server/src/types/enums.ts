import { z } from 'zod';

export const RoleSchema = z.enum(['ADMIN', 'PLAYER']);
export type Role = z.infer<typeof RoleSchema>;

/**
 * What the night cost money on. Dinner is the common case and the default;
 * the rest are here so a cost does not have to be described in prose.
 */
export const ExpenseTypeSchema = z.enum([
  'DINNER',
  'DRINKS',
  'SNACKS',
  'CARDS',
  'VENUE',
  'TRAVEL',
  'OTHER',
]);
export type ExpenseType = z.infer<typeof ExpenseTypeSchema>;
