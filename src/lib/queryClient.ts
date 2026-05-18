import { QueryClient } from '@tanstack/react-query';

/**
 * Exponential backoff delay calculator for TanStack Query retries.
 * Produces delays: 1s, 2s, 4s (capped at 3 attempts).
 *
 * Integrates with ConnectionState: when the app is offline,
 * queries should not retry (handled via the `retry` function).
 */
function retryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 4000);
}

/**
 * Singleton QueryClient configured for Yuzztea POS SaaS.
 *
 * - staleTime: 30s — data considered fresh for 30 seconds, reducing
 *   unnecessary refetches during active POS usage.
 * - retry: 3 attempts with exponential backoff (1s, 2s, 4s).
 *   Returns false (no retry) when navigator is offline to avoid
 *   wasting resources while disconnected (Req 11.1).
 * - refetchOnWindowFocus: true — ensures data freshness when user
 *   returns to the app tab.
 * - refetchOnReconnect: true — refresh data within 5s of reconnect
 *   to maintain consistency (Req 10.6).
 *
 * Requirements: 10.6, 11.1
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      retry: (failureCount, _error) => {
        // Don't retry when offline — saves resources and avoids
        // queuing failed requests. The refetchOnReconnect option
        // will handle data refresh when connectivity returns.
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          return false;
        }
        return failureCount < 3;
      },
      retryDelay,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: (failureCount, _error) => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          return false;
        }
        return failureCount < 3;
      },
      retryDelay,
    },
  },
});
