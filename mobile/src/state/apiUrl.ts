import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_PORT = Number(Constants.expoConfig?.extra?.defaultApiPort ?? 4000);

/**
 * True when the build already knows where its server is - which is the case
 * for anything deployed. Development builds have to guess, and offer the
 * address as something you can change.
 */
export const API_URL_IS_FIXED = Boolean(process.env.EXPO_PUBLIC_API_URL);

/**
 * Best guess at where the API is running.
 *
 * During development Expo already knows the IP of the machine serving the
 * bundle, and that is almost always the machine running the API too - so the
 * app works on a real phone with no configuration. Anything else can be typed
 * in on the sign-in screen and is remembered.
 */
export function guessApiUrl(): string {
  // Set at build time for a deployed app. Hosts often supply a bare hostname
  // rather than a full URL, so it goes through the same tidy-up as anything
  // typed in by hand.
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return normaliseApiUrl(fromEnv);

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:${DEFAULT_PORT}/api`;

  // Android emulators reach the host machine on 10.0.2.2, not localhost.
  const fallbackHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${fallbackHost}:${DEFAULT_PORT}/api`;
}

/**
 * Tidies up an address: adds the scheme and the /api suffix.
 *
 * A missing scheme becomes https, except for addresses that can only be on the
 * local network - a hosted server always has a certificate, a laptop on the
 * sofa does not.
 */
export function normaliseApiUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (url === '') return url;

  if (!/^https?:\/\//i.test(url)) {
    const host = url.split('/')[0]?.split(':')[0] ?? '';
    const isLocal =
      host === 'localhost' ||
      host === '10.0.2.2' ||
      host.endsWith('.local') ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    url = `${isLocal ? 'http' : 'https'}://${url}`;
  }

  if (!/\/api$/i.test(url)) url = `${url}/api`;
  return url;
}
