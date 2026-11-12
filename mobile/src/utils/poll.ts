/**
 * "Who's coming on Saturday?", written out as a message.
 *
 * WhatsApp's own poll - the one with the vote bars - is created inside
 * WhatsApp and nowhere else: no URL and no API builds one, the Business API
 * included. So this composes a numbered message people reply to in the group
 * thread, which is what the group did before there was an app.
 */
import { formatDateLong } from './date';
import { MAX_MESSAGE_LENGTH } from './whatsapp';

/** What gets asked most weeks, so the admin usually changes nothing. */
export const DEFAULT_POLL_OPTIONS = ['In', 'Out', 'Maybe'];

export interface PollDraft {
  /** ISO timestamp of the night being proposed. */
  playedOn: string;
  where: string;
  question: string;
  options: string[];
}

export function buildPollMessage(draft: PollDraft): string {
  const options = draft.options.map((option) => option.trim()).filter(Boolean);

  const lines: string[] = [];
  lines.push(`*Next game night*`);
  lines.push(
    [formatDateLong(draft.playedOn), draft.where.trim()].filter(Boolean).join(' · '),
  );
  lines.push('');
  lines.push(draft.question.trim() || 'Who is in?');

  if (options.length > 0) {
    lines.push('');
    // Numbered so a reply can be a single character, which is what people
    // actually send on a phone. Plain digits rather than keycap emoji, which
    // need a font that carries them and come out as an empty box where it
    // does not - including in the preview on the way out.
    options.forEach((option, index) => {
      lines.push(`${index + 1}. ${option}`);
    });
    lines.push('');
    lines.push('_Reply with your number._');
  }

  const message = lines.join('\n');
  if (message.length <= MAX_MESSAGE_LENGTH) return message;
  return message.slice(0, MAX_MESSAGE_LENGTH).trimEnd();
}
