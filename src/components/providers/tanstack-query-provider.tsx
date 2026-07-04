"use client";

/**
 * TanStack Query provider.
 *
 * Wraps the app in a `QueryClientProvider` so any client component
 * can use `useQuery`, `useInfiniteQuery`, `useMutation`, etc. The
 * `QueryClient` is created once per app instance and shared across
 * the component tree.
 *
 * Default options:
 *   - `refetchOnWindowFocus: false` — the app does not need to
 *     refetch on every tab switch; the user is the only writer.
 *   - `retry: 1` — one retry on failure before surfacing the error.
 *     The browse feed shows a "Try again" button on error, so the
 *     user has a manual recovery path.
 *
 * Note: `staleTime` is set per-query rather than globally, since
 * different data has different caching needs (e.g., system info
 * rarely changes, while settings should refresh quickly).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

export function TanStackQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
