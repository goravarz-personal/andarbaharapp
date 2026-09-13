import type { User } from '@prisma/client';

/** The shape of a person as the app sees them - never includes the hash. */
export function serializeUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    avatarColor: user.avatarColor,
    createdAt: user.createdAt.toISOString(),
  };
}

export type PublicUser = ReturnType<typeof serializeUser>;

const PALETTE = [
  '#E4572E', '#17BEBB', '#FFC914', '#2E282A', '#76B041',
  '#8367C7', '#EF476F', '#118AB2', '#06D6A0', '#F78C6B',
];

/** Stable colour per player so avatars don't change between sessions. */
export function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length] ?? '#17BEBB';
}

/** Blank strings from form inputs should clear the column, not store "". */
export function emptyToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
