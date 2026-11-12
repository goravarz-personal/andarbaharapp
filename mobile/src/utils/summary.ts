/**
 * The night, written out as a message.
 *
 * Built here rather than on the server so there is one copy of the money
 * formatting - the same `formatMoney` the screens use - and so the text can be
 * shown on screen before it is sent. Everything in it comes off the game as
 * the server returned it, so a corrected cash-out changes the message too.
 *
 * WhatsApp's own markup is deliberately sparse: *bold* for the headings and
 * nothing else. Underscores would turn a name like _Ravi_ into italics, and
 * monospace blocks let the columns line up but render small and wrap badly on
 * a narrow screen, so each player gets a plain line of their own instead.
 */
import { formatMoney } from './money';
import { formatDateLong, plural } from './date';
import { MAX_MESSAGE_LENGTH } from './whatsapp';
import { EXPENSE_TYPE_LABELS, type Game } from '../api/types';

/** Whether there is a result worth sending out yet. */
export function canSummarize(game: Game): boolean {
  return game.complete && game.players.length > 0;
}

export function buildNightSummary(game: Game): string {
  const lines: string[] = [];

  lines.push(`*${game.title ?? 'Game night'}*`);
  lines.push(
    [formatDateLong(game.playedOn), game.location].filter(Boolean).join(' · '),
  );
  lines.push('');

  if (game.topWinner) {
    lines.push(`\u{1f3c6} *${game.topWinner.displayName}* won the most`);
    lines.push('');
  }

  // Best night first: the order everyone reads it in anyway.
  const ranked = [...game.players].sort(
    (a, b) => (b.net ?? 0) - (a.net ?? 0) || a.displayName.localeCompare(b.displayName),
  );

  lines.push('*How it finished*');
  ranked.forEach((player, index) => {
    const net = player.net === null ? 'still in' : formatMoney(player.net, { signed: true });
    lines.push(`${index + 1}. ${player.displayName} — ${net}`);
  });

  if (game.totals.expenses > 0) {
    lines.push('');
    lines.push(`*The night cost ${formatMoney(game.totals.expenses)}*`);
    for (const expense of game.expenses) {
      const label = EXPENSE_TYPE_LABELS[expense.type] ?? 'Cost';
      const note = expense.label ? ` (${expense.label})` : '';
      const who = expense.paidBy ? ` · ${expense.paidBy.displayName} paid` : '';
      lines.push(`• ${label}${note} ${formatMoney(expense.amount)}${who}`);
    }
  }

  // The only part anybody has to act on, so it goes last where it is seen.
  if (game.dinnerDebts.length > 0 && game.topWinner) {
    lines.push('');
    lines.push(`*${game.topWinner.displayName} owes for dinner*`);
    for (const debt of game.dinnerDebts) {
      lines.push(`• ${debt.to.displayName} — ${formatMoney(debt.amount)}`);
    }
  }

  if (!game.balanced) {
    lines.push('');
    lines.push(
      `⚠️ Chips are out by ${formatMoney(Math.abs(game.totals.difference))} — worth a check.`,
    );
  }

  lines.push('');
  lines.push(
    `${plural(game.playerCount, 'player')} · ${formatMoney(game.totals.buyIn)} in chips`,
  );

  return clamp(lines.join('\n'));
}

/**
 * A night with a lot of players and a lot of food can outgrow what WhatsApp
 * will carry in a link. Losing the end of the message silently would drop the
 * dinner debts, so say that it was cut instead.
 */
function clamp(message: string): string {
  if (message.length <= MAX_MESSAGE_LENGTH) return message;
  const notice = '\n… (cut short — open the app for the rest)';
  return `${message.slice(0, MAX_MESSAGE_LENGTH - notice.length).trimEnd()}${notice}`;
}
