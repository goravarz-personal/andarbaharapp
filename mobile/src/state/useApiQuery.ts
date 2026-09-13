import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/client';
import { useAuth } from './AuthContext';

interface QueryState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  refetch: () => void;
  setData: (value: T) => void;
}

/**
 * Fetches once, then again every time the screen comes back into focus - so
 * recording a game and going back shows the new numbers without a manual pull.
 */
export function useApiQuery<T>(run: (api: ApiClient) => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const { api, signOut } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const runRef = useRef(run);
  runRef.current = run;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      try {
        const result = await runRef.current(api);
        if (!mounted.current) return;
        setData(result);
        setError(null);
      } catch (caught) {
        if (!mounted.current) return;
        if (caught instanceof ApiError && caught.isAuthError) {
          await signOut();
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Something went wrong.');
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, signOut, ...deps],
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  return {
    data,
    error,
    loading,
    refreshing,
    refetch: () => void load(true),
    setData: (value: T) => setData(value),
  };
}
