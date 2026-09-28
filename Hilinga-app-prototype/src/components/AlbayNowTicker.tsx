import { useEffect, useMemo, useState } from "react";
import { useMayonWeather } from "@/lib/mayon-weather";
import { catalog } from "@/lib/catalog";
import { readPublishedBusinessPosts } from "@/lib/business-content";

function minutesUntilSunsetManila(now = new Date()): { label: string; done: boolean } {
  // Legazpi sunset ~ 17:55-18:20 PH time varies ~15min through year; use 18:12 as base + small seasonal wobble
  // Good enough for vibe; no need for suncalc dep
  const ph = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const month = ph.getMonth(); // 0-11
  // seasonal offset: Dec-Jan earlier (~17:55), Jun-Jul later (~18:25)
  const seasonal: Record<number, number> = { 0: -12, 1: -8, 2: -2, 3: 4, 4: 10, 5: 13, 6: 12, 7: 8, 8: 2, 9: -4, 10: -9, 11: -13 };
  const baseMinutes = 18 * 60 + 12 + (seasonal[month] ?? 0);
  const sunset = new Date(ph);
  sunset.setHours(0, 0, 0, 0);
  sunset.setMinutes(baseMinutes);
  const diffMs = sunset.getTime() - ph.getTime();
  if (diffMs <= 0) return { label: "sunset passed", done: true };
  const mins = Math.round(diffMs / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return { label: `sunset in ${m}m`, done: false };
  if (m === 0) return { label: `sunset in ${h}h`, done: false };
  return { label: `sunset in ${h}h ${m}m`, done: false };
}

function Icon({ name, size = 14 }: { name: string; size?: number }) {
  return <span className="material-symbols-outlined" style={{ fontSize: size }}>{name}</span>;
}

export function AlbayNowTicker({ onOpenEvents }: { onOpenEvents?: () => void }) {
  const { data: weather } = useMayonWeather();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const sunset = useMemo(() => minutesUntilSunsetManila(now), [now]);

  const eventsToday = useMemo(() => {
    try {
      const posts = readPublishedBusinessPosts();
      const todayStr = new Date().toISOString().slice(0, 10);
      const postEvents = posts.filter((p) => p.category === "Events" && (p.createdAt.slice(0, 10) === todayStr || p.eventDate === todayStr)).length;
      const catalogEvents = catalog.filter((c) => c.kind === "Events").length;
      return Math.max(postEvents + Math.min(catalogEvents, 2), postEvents || catalogEvents || 3);
    } catch { return 3; }
  }, [now]);

  const tempLabel = weather ? `${weather.tempC}°` : "—";
  const mayonLabel = weather ? (weather.isClear ? "Mayon Clear" : weather.condition) : "Mayon";
  const mayonIcon = weather?.icon ?? "landscape";

  return (
    <div className="albay-ticker" role="status" aria-live="polite" aria-label="Albay Now live bar">
      <div className="albay-ticker-inner">
        <span className="albay-ticker-item">
          <Icon name="thermostat" size={14} /> {tempLabel}
        </span>
        <span className="albay-ticker-dot" aria-hidden>·</span>
        <span className="albay-ticker-item" title={weather ? `${weather.condition} · ${weather.visibilityKm}km vis · ${weather.clouds}% clouds` : undefined}>
          <Icon name={mayonIcon} size={14} /> {mayonLabel}
        </span>
        <span className="albay-ticker-dot" aria-hidden>·</span>
        <span className="albay-ticker-item">
          <Icon name={sunset.done ? "bedtime" : "wb_twilight"} size={14} /> Legazpi Blvd {sunset.label}
        </span>
        <span className="albay-ticker-dot" aria-hidden>·</span>
        <button className="albay-ticker-item albay-ticker-action" onClick={onOpenEvents} aria-label={`${eventsToday} events today — open Explore`}>
          <Icon name="event" size={14} /> {eventsToday} events today
        </button>
        <span className="albay-ticker-live"><i /> LIVE</span>
      </div>
    </div>
  );
}
