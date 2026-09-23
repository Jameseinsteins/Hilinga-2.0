import { useCallback, useState } from "react";

export function useOptimisticToggle<T>(opts: {
  isActive: (id: string) => boolean;
  onActivate: (item: T, id: string) => Promise<void>;
  onDeactivate: (item: T, id: string) => Promise<void>;
  getId: (item: T) => string;
}) {
  const [optimisticIds, setOptimisticIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOptimisticallyActive = useCallback((id: string) => {
    const base = opts.isActive(id);
    const flipped = optimisticIds.has(id);
    return flipped ? !base : base;
  }, [opts, optimisticIds]);

  const toggle = useCallback(async (item: T) => {
    const id = opts.getId(item);
    if (pendingId) return;
    setPendingId(id);
    setError(null);
    const currentlyActive = opts.isActive(id);
    // optimistic flip
    setOptimisticIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      if (currentlyActive) await opts.onDeactivate(item, id);
      else await opts.onActivate(item, id);
      // success: commit flip by clearing optimistic marker but underlying isActive will now reflect new truth after refresh
      setOptimisticIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      // rollback
      setOptimisticIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setPendingId(null);
    }
  }, [opts, pendingId]);

  return { isOptimisticallyActive, pendingId, error, setError, toggle, optimisticIds };
}
