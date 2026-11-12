/**
 * Handing a message to WhatsApp.
 *
 * The app cannot send a WhatsApp message by itself. Sending programmatically
 * means the WhatsApp Business API: a verified business, a dedicated number,
 * every message format approved by Meta before it can be sent, and a bill per
 * conversation - and the message would arrive from a business number rather
 * than from a friend. For a group of mates and a card game that is the wrong
 * trade, so the app writes the message and WhatsApp sends it.
 *
 * A wa.me link is the whole mechanism. It opens WhatsApp with the message
 * already typed, and the person picks the chat and taps send. It works the
 * same from the installed app and from the browser, which matters because
 * most of the group runs this as a web app on their phone.
 */
import { Linking, Platform, Share } from 'react-native';
import { toWhatsAppNumber } from './phone';

/**
 * WhatsApp truncates a very long pre-filled message rather than refusing it,
 * and a night with a lot of players plus a lot of food can get there. Summaries
 * are built to stay under this.
 */
export const MAX_MESSAGE_LENGTH = 1800;

/**
 * A link that opens WhatsApp with this message ready to send.
 *
 * With a number it opens that person's chat. Without one it opens WhatsApp's
 * own chat picker, which is the only way to reach a group: there is no URL
 * that names a group, so the person chooses it from the list.
 */
export function whatsappLink(message: string, e164Phone?: string | null): string {
  const text = encodeURIComponent(message);
  if (!e164Phone) return `https://wa.me/?text=${text}`;
  return `https://wa.me/${toWhatsAppNumber(e164Phone)}?text=${text}`;
}

/**
 * Opens WhatsApp with the message ready. Falls back to the system share sheet
 * when WhatsApp cannot be opened - on a desktop browser, or on a phone that
 * does not have it installed.
 */
export async function sendViaWhatsApp(
  message: string,
  e164Phone?: string | null,
): Promise<'whatsapp' | 'shared' | 'failed'> {
  const url = whatsappLink(message, e164Phone);

  try {
    if (Platform.OS === 'web') {
      // A new tab, because replacing the app's own tab would lose their place.
      globalThis.open?.(url, '_blank');
      return 'whatsapp';
    }
    await Linking.openURL(url);
    return 'whatsapp';
  } catch {
    try {
      await Share.share({ message });
      return 'shared';
    } catch {
      return 'failed';
    }
  }
}
