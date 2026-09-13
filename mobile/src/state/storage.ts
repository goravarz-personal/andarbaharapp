import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * The sign-in token lives in the device keychain / keystore. SecureStore has no
 * web implementation, so the browser build falls back to localStorage.
 */
const webStore = {
  getItem(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* storage blocked - stay signed out rather than crash */
    }
  },
  removeItem(key: string): void {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* nothing to do */
    }
  },
};

export async function getStored(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return webStore.getItem(key);
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setStored(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    webStore.setItem(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    /* nothing to do */
  }
}

export async function clearStored(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    webStore.removeItem(key);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* nothing to do */
  }
}

export const STORAGE_KEYS = {
  token: 'aadarbahar.token',
  apiUrl: 'aadarbahar.apiUrl',
} as const;
