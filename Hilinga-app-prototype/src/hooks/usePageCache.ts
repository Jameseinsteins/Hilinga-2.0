import { useEffect, useRef, useState } from "react";

type CacheEntry<T> = { data: T; ts: number };

const MEMORY = new Map<string, CacheEntry<unknown>>();
const TTL_MS = 5 * 60 * 1000; // 5 min

function loadSession<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(`hilinga:page-cache:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - parsed.ts > TTL_MS) {
      sessionStorage.removeItem(`hilinga:page-cache:${key}`);
      return null;
    }
    return parsed.data;
  } catch { return null; }
}
function saveSession<T>(key: string, data: T) {
  try { sessionStorage.setItem(`hilinga:page-cache:${key}`, JSON.stringify({ data, ts: Date.now() } satisfies CacheEntry<T>)); } catch {}
}

export function usePageCache<T>(key: string, loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(() => {
    const mem = MEMORY.get(key) as CacheEntry<T> | undefined;
    if (mem && Date.now() - mem.ts < TTL_MS) return mem.data;
    const sess = loadSession<T>(key);
    if (sess !== null) {
      MEMORY.set(key, { data: sess, ts: Date.now() });
      return sess;
    }
    return null;
  });
  const [loading, setLoading] = useState(data === null);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    const mem = MEMORY.get(key) as CacheEntry<T> | undefined;
    const valid = mem && Date.now() - mem.ts < TTL_MS;
    // if we already have valid cache, don't refetch unless deps changed to empty? We still background refresh if stale
    if (valid) {
      setLoading(false);
      setError(null);
      // opportunistic background refresh if older than 60s
      if (Date.now() - mem.ts > 60_000) {
        void loaderRef.current().then((fresh) => {
          if (cancelled) return;
          MEMORY.set(key, { data: fresh, ts: Date.now() });
          saveSession(key, fresh);
          setData(fresh);
        }).catch(() => undefined);
      }
      return () => { cancelled = true; };
    }
    setLoading(true);
    void loaderRef.current().then((fresh) => {
      if (cancelled) return;
      MEMORY.set(key, { data: fresh, ts: Date.now() });
      saveSession(key, fresh);
      setData(fresh);
      setError(null);
    }).catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  function invalidate() {
    MEMORY.delete(key);
    try { sessionStorage.removeItem(`hilinga:page-cache:${key}`); } catch {}
  }
  function setCached(next: T) {
    MEMORY.set(key, { data: next, ts: Date.now() });
    saveSession(key, next);
    setData(next);
  }

  return { data, loading, error, invalidate, setCached, hasCache: data !== null };
}

export function invalidatePageCache(prefix?: string) {
  if (!prefix) {
    MEMORY.clear();
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k?.startsWith("hilinga:page-cache:")) sessionStorage.removeItem(k);
      }
    } catch {}
    return;
  }
  for (const k of Array.from(MEMORY.keys())) if (k.startsWith(prefix)) MEMORY.delete(k);
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(`hilinga:page-cache:${prefix}`)) sessionStorage.removeItem(k);
    }
  } catch {}
}
