// Loads a page's data and keeps it fresh: `reload` re-fetches in place, so
// actions update the page instead of reloading the document.

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";

export type DataState<T> = { data: T | null; error: string | null; loading: boolean; reload: () => Promise<void>; set: (d: T) => void };

export function useData<T>(load: () => Promise<T>, deps: readonly unknown[] = []): DataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  const reload = useCallback(async () => {
    try {
      setData(await run());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "network");
    } finally {
      setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  return { data, error, loading, reload, set: setData };
}
