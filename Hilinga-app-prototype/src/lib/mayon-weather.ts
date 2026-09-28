// Mayon visibility via OpenWeather (if key) with open-meteo fallback — no key required for demo
export type MayonWeather = {
  tempC: number;
  condition: string; // Clear | Cloudy | Rain ...
  icon: string; // material symbol name
  clouds: number; // 0-100
  visibilityKm: number;
  isClear: boolean; // true = Mayon likely visible
  source: "openweather" | "open-meteo" | "cache" | "mock";
};

const CACHE_KEY = "hilinga:mayon_weather";
const CACHE_TTL_MS = 10 * 60 * 1000;

function cacheGet(): MayonWeather | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { data: MayonWeather; ts: number };
    if (Date.now() - j.ts > CACHE_TTL_MS) return null;
    return j.data;
  } catch { return null; }
}
function cacheSet(data: MayonWeather) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

function wmoToCondition(code: number): { condition: string; icon: string; clouds: number } {
  // WMO weather codes https://open-meteo.com/en/docs
  if (code === 0) return { condition: "Clear", icon: "clear_day", clouds: 5 };
  if (code === 1) return { condition: "Mainly clear", icon: "partly_cloudy_day", clouds: 20 };
  if (code === 2) return { condition: "Partly cloudy", icon: "partly_cloudy_day", clouds: 50 };
  if (code === 3) return { condition: "Cloudy", icon: "cloudy", clouds: 90 };
  if (code >= 45 && code <= 57) return { condition: "Fog", icon: "foggy", clouds: 95 };
  if (code >= 61 && code <= 67) return { condition: "Rain", icon: "rainy", clouds: 85 };
  if (code >= 71 && code <= 77) return { condition: "Snow", icon: "weather_snowy", clouds: 85 };
  if (code >= 80 && code <= 82) return { condition: "Showers", icon: "rainy", clouds: 80 };
  if (code >= 95) return { condition: "Thunderstorm", icon: "thunderstorm", clouds: 100 };
  return { condition: "Cloudy", icon: "cloudy", clouds: 60 };
}

export async function fetchMayonWeather(): Promise<MayonWeather> {
  const cached = cacheGet();
  if (cached) return cached;

  const owKey = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_OPENWEATHER_API_KEY?.trim();
  if (owKey) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 6000);
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=13.1391&lon=123.7438&units=metric&appid=${encodeURIComponent(owKey)}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(t);
      if (res.ok) {
        const j = await res.json() as { main: { temp: number }; weather: Array<{ main: string; icon: string }>; clouds: { all: number }; visibility: number };
        const temp = Math.round(j.main?.temp ?? 30);
        const main = j.weather?.[0]?.main ?? "Clear";
        const clouds = typeof j.clouds?.all === "number" ? j.clouds.all : main === "Clear" ? 10 : 70;
        const visKm = typeof j.visibility === "number" ? Math.round(j.visibility / 1000) : main === "Clear" ? 10 : 6;
        const isClear = clouds < 35 && visKm >= 8 && main !== "Rain" && main !== "Thunderstorm";
        const icon = isClear ? "clear_day" : main === "Rain" ? "rainy" : clouds > 70 ? "cloudy" : "partly_cloudy_day";
        const data: MayonWeather = { tempC: temp, condition: main, icon, clouds, visibilityKm: visKm, isClear, source: "openweather" };
        cacheSet(data);
        return data;
      }
    } catch {}
  }

  // fallback: open-meteo (free, no key)
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=13.1391&longitude=123.7438&current=temperature_2m,cloud_cover,visibility,weather_code&timezone=Asia%2FManila`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (res.ok) {
      const j = await res.json() as { current: { temperature_2m: number; cloud_cover: number; visibility: number; weather_code: number } };
      const temp = Math.round(j.current?.temperature_2m ?? 29);
      const clouds = typeof j.current?.cloud_cover === "number" ? j.current.cloud_cover : 40;
      const visM = typeof j.current?.visibility === "number" ? j.current.visibility : 12000;
      const visKm = Math.round(visM / 1000);
      const code = j.current?.weather_code ?? 1;
      const mapped = wmoToCondition(code);
      const isClear = clouds < 35 && visKm >= 8 && code < 3;
      const data: MayonWeather = { tempC: temp, condition: mapped.condition, icon: mapped.icon, clouds, visibilityKm: visKm, isClear, source: "open-meteo" };
      cacheSet(data);
      return data;
    }
  } catch {}

  // mock fallback so badge never breaks
  const mock: MayonWeather = { tempC: 30, condition: "Partly cloudy", icon: "partly_cloudy_day", clouds: 45, visibilityKm: 9, isClear: false, source: "mock" };
  return mock;
}

import { useEffect, useState } from "react";
export function useMayonWeather() {
  const [data, setData] = useState<MayonWeather | null>(() => {
    try {
      const c = cacheGet();
      return c;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (data) return;
    setLoading(true);
    fetchMayonWeather().then((d) => {
      if (!cancelled) { setData(d); setLoading(false); }
    }).catch((e) => {
      if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);
  return { data, loading, error, refresh: () => fetchMayonWeather().then(setData) };
}
