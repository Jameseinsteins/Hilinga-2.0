import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type TabKey = "Home" | "Explore" | "Planner" | "Feed" | "Profile";

type ViewCacheCtx = {
  activeTab: TabKey;
  setActiveTab: (t: TabKey) => void;
  markVisited: (t: TabKey) => void;
  visited: Set<TabKey>;
};

const Ctx = createContext<ViewCacheCtx | null>(null);

export function ViewCacheProvider({ children, initial = "Home" as TabKey }: { children: ReactNode; initial?: TabKey }) {
  const [activeTab, setActiveTabRaw] = useState<TabKey>(initial);
  const [visited, setVisited] = useState<Set<TabKey>>(() => new Set([initial]));
  const setActiveTab = useCallback((t: TabKey) => {
    setActiveTabRaw(t);
    setVisited((prev) => {
      if (prev.has(t)) return prev;
      const next = new Set(prev);
      next.add(t);
      return next;
    });
  }, []);
  const markVisited = useCallback((t: TabKey) => setVisited((prev) => prev.has(t) ? prev : new Set([...prev, t])), []);
  const value = useMemo(() => ({ activeTab, setActiveTab, visited, markVisited }), [activeTab, setActiveTab, visited, markVisited]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useViewCache() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useViewCache must be inside ViewCacheProvider");
  return v;
}

/** Wrap a tab panel so first mount is kept alive and hidden when inactive (no remount => no reload) */
export function KeepAliveTab({ tab, active, visited, children }: { tab: TabKey; active: TabKey; visited: Set<TabKey>; children: ReactNode }) {
  const hasEverVisited = visited.has(tab);
  if (!hasEverVisited && tab !== active) return null;
  const isActive = tab === active;
  return (
    <div style={{ display: isActive ? "contents" : "none" }} aria-hidden={isActive ? undefined : true}>
      {children}
    </div>
  );
}
