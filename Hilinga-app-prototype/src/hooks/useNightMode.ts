import { useEffect, useState, useCallback, useRef } from "react";

const STORAGE_KEY = "hilinga:night_override";
type Override = "auto" | "on" | "off";

function getManilaHour(d = new Date()): number {
  try {
    const str = d.toLocaleString("en-US", { timeZone: "Asia/Manila", hour12: false, hour: "numeric" });
    const n = parseInt(str, 10);
    return Number.isFinite(n) ? n : d.getHours();
  } catch { return d.getHours(); }
}

function isNightByTime(d = new Date()): boolean {
  const h = getManilaHour(d);
  return h >= 18 || h < 6;
}

function isBoulevardActive(): boolean {
  try {
    const raw = sessionStorage.getItem("hilinga:last_stop_title") || localStorage.getItem("hilinga:last_stop_title");
    if (raw && /boulevard/i.test(raw)) return true;
    const sel = sessionStorage.getItem("hilinga:explore_selected");
    if (sel && /boulevard/i.test(sel)) return true;
  } catch {}
  return false;
}

function resolveNight(override: Override): boolean {
  if (override === "on") return true;
  if (override === "off") return false;
  return isNightByTime() || isBoulevardActive();
}

function readOverride(): Override {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as Override | null;
    if (v === "on" || v === "off" || v === "auto") return v;
  } catch {}
  return "auto";
}

export function useNightMode() {
  const [override, setOverrideRaw] = useState<Override>(() => readOverride());
  const [isNight, setIsNight] = useState(() => resolveNight(readOverride()));
  const overrideRef = useRef(override);
  overrideRef.current = override;

  const setOverride = useCallback((v: Override) => {
    setOverrideRaw(v);
    try { localStorage.setItem(STORAGE_KEY, v); } catch {}
    try { window.dispatchEvent(new Event("hilinga:night-override")); } catch {}
  }, []);

  const toggle = useCallback(() => {
    // Simple binary toggle: dark <-> light, always sets explicit on/off (never leaves auto ambiguity)
    // If currently night -> go light (off), if day -> go dark (on). This is what users expect.
    const cur = resolveNight(overrideRef.current);
    const next: Override = cur ? "off" : "on";
    setOverrideRaw(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    try { window.dispatchEvent(new Event("hilinga:night-override")); } catch {}
  }, []);

  useEffect(() => {
    function tick() {
      // always read fresh override from ref (not stale closure)
      setIsNight(resolveNight(overrideRef.current));
    }
    function tickWith(v: Override) {
      setIsNight(resolveNight(v));
    }
    tick();
    const iv = window.setInterval(tick, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const v = e.newValue as Override | null;
        if (v === "on" || v === "off" || v === "auto") {
          setOverrideRaw(v);
          tickWith(v);
        }
      }
      if (e.key === "hilinga:last_stop_title" || e.key === "hilinga:explore_selected") {
        // only affects auto mode
        if (overrideRef.current === "auto") tick();
      }
    };
    window.addEventListener("storage", onStorage);
    const onOverride = () => {
      try {
        const v = localStorage.getItem(STORAGE_KEY) as Override | null;
        if (v === "on" || v === "off" || v === "auto") {
          setOverrideRaw(v);
          tickWith(v);
          return;
        }
      } catch {}
      tick();
    };
    window.addEventListener("hilinga:night-override", onOverride);
    const onBoulevard = () => {
      if (overrideRef.current === "auto") tick();
    };
    window.addEventListener("hilinga:boulevard-trigger", onBoulevard);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("hilinga:night-override", onOverride);
      window.removeEventListener("hilinga:boulevard-trigger", onBoulevard);
    };
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    if (isNight) el.classList.add("night-mode");
    else el.classList.remove("night-mode");
    if (isNight) document.body.classList.add("night-mode");
    else document.body.classList.remove("night-mode");
  }, [isNight]);

  return { isNight, override, setOverride, toggle, isNightByTime: isNightByTime() } as const;
}

export function notifyBoulevardEnter(titleOrLocation: string) {
  try {
    sessionStorage.setItem("hilinga:last_stop_title", titleOrLocation);
    localStorage.setItem("hilinga:last_stop_title", titleOrLocation);
  } catch {}
  try { window.dispatchEvent(new Event("hilinga:boulevard-trigger")); } catch {}
}
export function clearBoulevardTrigger() {
  try { sessionStorage.removeItem("hilinga:last_stop_title"); localStorage.removeItem("hilinga:last_stop_title"); } catch {}
  try { sessionStorage.removeItem("hilinga:explore_selected"); } catch {}
  try { window.dispatchEvent(new Event("hilinga:boulevard-trigger")); } catch {}
}
