import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiClient, ApiError } from '../api/client';
import type { Player } from '../api/types';
import { guessApiUrl } from './apiUrl';
import { STORAGE_KEYS, clearStored, getStored, setStored } from './storage';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  user: Player | null;
  apiUrl: string;
  api: ApiClient;
  isAdmin: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setApiUrl: (url: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Keeps the session alive across a password change, which retires old tokens. */
  applyNewToken: (token: string, user: Player) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<Player | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [apiUrl, setApiUrlState] = useState<string>(guessApiUrl());

  const api = useMemo(() => new ApiClient(apiUrl, token), [apiUrl, token]);

  // Restore the previous session on launch.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [storedUrl, storedToken] = await Promise.all([
        getStored(STORAGE_KEYS.apiUrl),
        getStored(STORAGE_KEYS.token),
      ]);
      if (cancelled) return;

      const url = storedUrl ?? guessApiUrl();
      setApiUrlState(url);

      if (!storedToken) {
        setStatus('signedOut');
        return;
      }

      try {
        const response = await new ApiClient(url, storedToken).me();
        if (cancelled) return;
        setToken(storedToken);
        setUser(response.user);
        setStatus('signedIn');
      } catch (error) {
        if (cancelled) return;
        // An expired token means sign in again; a server that is simply
        // unreachable should not throw the session away.
        if (error instanceof ApiError && error.isAuthError) {
          await clearStored(STORAGE_KEYS.token);
        }
        setStatus('signedOut');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const response = await new ApiClient(apiUrl, null).login(username, password);
      await setStored(STORAGE_KEYS.token, response.token);
      setToken(response.token);
      setUser(response.user);
      setStatus('signedIn');
    },
    [apiUrl],
  );

  const signOut = useCallback(async () => {
    await clearStored(STORAGE_KEYS.token);
    setToken(null);
    setUser(null);
    setStatus('signedOut');
  }, []);

  const setApiUrl = useCallback(async (url: string) => {
    await setStored(STORAGE_KEYS.apiUrl, url);
    setApiUrlState(url);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const response = await api.me();
      setUser(response.user);
    } catch (error) {
      if (error instanceof ApiError && error.isAuthError) await signOut();
    }
  }, [api, token, signOut]);

  const applyNewToken = useCallback(async (nextToken: string, nextUser: Player) => {
    await setStored(STORAGE_KEYS.token, nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      apiUrl,
      api,
      isAdmin: user?.role === 'ADMIN',
      signIn,
      signOut,
      setApiUrl,
      refreshUser,
      applyNewToken,
    }),
    [status, user, apiUrl, api, signIn, signOut, setApiUrl, refreshUser, applyNewToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.');
  return context;
}
