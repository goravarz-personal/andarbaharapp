import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_PORT = Number(Constants.expoConfig?.extra?.defaultApiPort ?? 4000);

/**
 * Best guess at where the API is running.
 *
 * During development Expo already knows the IP of the machine serving the
 * bundle, and that is almost always the machine running the API too - so the
 * app works on a real phone with no configuration. Anything else can be typed
 * in on the sign-in screen and is remembered.
 */
export function guessApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:${DEFAULT_PORT}/api`;

  // Android emulators reach the host machine on 10.0.2.2, not localhost.
  const fallbackHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${fallbackHost}:${DEFAULT_PORT}/api`;
}

/** Tidies up what someone typed: adds the scheme and the /api suffix. */
export function normaliseApiUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (url === '') return url;
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  if (!/\/api$/i.test(url)) url = `${url}/api`;
  return url;
}
