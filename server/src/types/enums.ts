import { z } from 'zod';

export const RoleSchema = z.enum(['ADMIN', 'PLAYER']);
export type Role = z.infer<typeof RoleSchema>;

export const GameStatusSchema = z.enum(['OPEN', 'SETTLED']);
export type GameStatus = z.infer<typeof GameStatusSchema>;

export const ExpenseCategorySchema = z.enum(['DINNER', 'OTHER']);
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

export const SplitModeSchema = z.enum(['EQUAL', 'CUSTOM', 'PAYER']);
export type SplitMode = z.infer<typeof SplitModeSchema>;

export const SettlementStatusSchema = z.enum(['PENDING', 'PAID']);
export type SettlementStatus = z.infer<typeof SettlementStatusSchema>;

export const SettlementKindSchema = z.enum(['AUTO', 'MANUAL']);
export type SettlementKind = z.infer<typeof SettlementKindSchema>;
