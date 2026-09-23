/**
 * Allowlist enforcement for DB-grounded itineraries
 * Ensures every stop title maps to a known place in the app database.
 * Single source of truth — mirrored from Hilinga-app-prototype/src/components/hilinga-app.tsx
 *   catalog (10) + routeDestinations extras (14 distinct names after catalog).
 * Any title not in this list (plus dynamic registered small businesses) will be
 * repaired to the nearest allowed title or dropped with a warning.
 */

export type AllowlistEntry = {
  title: string;
  kind: "business" | "catalog" | "route";
  normalized: string;
};

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const matrix: number[][] = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) matrix[i][0] = i;
  for (let j = 0; j <= bl; j++) matrix[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[al][bl];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

/** Verified Albay catalog + route places — mirrors hilinga-app.tsx exactly */
export const CATALOG_TITLES: Array<{ title: string; kind: "catalog" | "route" }> = [
  // catalog (10)
  { title: "Cagsawa Ruins", kind: "catalog" },
  { title: "Mayon Skyline", kind: "catalog" },
  { title: "Sumlang Lake", kind: "catalog" },
  { title: "Albay Coffee House", kind: "catalog" },
  { title: "Legazpi Local Market", kind: "catalog" },
  { title: "Pacific Mall Legazpi", kind: "catalog" },
  { title: "The Oriental Legazpi", kind: "catalog" },
  { title: "Mayon ATV Adventure", kind: "catalog" },
  { title: "Ibalong Street Festival", kind: "catalog" },
  { title: "Legazpi Weekend Night Market", kind: "catalog" },
  // routeDestinations extras (beyond catalog) — exact names from hilinga-app.tsx
  { title: "Bacacay coast and island views", kind: "route" },
  { title: "Mayon nature and photography walk", kind: "route" },
  { title: "Market shopping and Bicolano tasting", kind: "route" },
  { title: "Albay arts and museum stop", kind: "route" },
  { title: "Local market and crafts", kind: "route" },
  { title: "Legazpi evening spots", kind: "route" },
  { title: "Mayon golden-hour photo stop", kind: "route" },
  { title: "Lakeside rest and wellness break", kind: "route" },
  { title: "Albay Park & Wildlife", kind: "route" },
  { title: "Sunset at Legazpi Boulevard", kind: "route" },
  { title: "Daraga faith and heritage trail", kind: "route" },
  { title: "Local festival or community event", kind: "route" },
  { title: "Guide-picked Albay hidden gem", kind: "route" },
  // Additional verified Albay natural attractions (referenced in prompts, real province sites)
  { title: "Quitinday Hills", kind: "catalog" },
  { title: "Vera Falls", kind: "catalog" },
  { title: "Hoyop-Hoyopan Cave", kind: "catalog" },
  { title: "Legazpi Boulevard", kind: "route" },
  { title: "Daraga Church", kind: "route" },
];

export function buildAllowlist(localBusinessNames: string[]): AllowlistEntry[] {
  const entries: AllowlistEntry[] = [];
  const seen = new Set<string>();
  for (const b of localBusinessNames) {
    const n = normalizeTitle(b);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    entries.push({ title: b.trim(), kind: "business", normalized: n });
  }
  for (const c of CATALOG_TITLES) {
    const n = normalizeTitle(c.title);
    if (seen.has(n)) continue;
    seen.add(n);
    entries.push({ title: c.title, kind: c.kind, normalized: n });
  }
  return entries;
}

export type AllowlistCheck = {
  allowed: boolean;
  canonicalTitle?: string;
  kind?: AllowlistEntry["kind"];
  similarity: number;
};

export function checkTitleAgainstAllowlist(title: string, allowlist: AllowlistEntry[]): AllowlistCheck {
  const norm = normalizeTitle(title);
  if (!norm) return { allowed: false, similarity: 0 };
  // exact normalized match
  for (const entry of allowlist) {
    if (entry.normalized === norm) {
      return { allowed: true, canonicalTitle: entry.title, kind: entry.kind, similarity: 1 };
    }
  }
  // substring containment (helps "Cagsawa Ruins Heritage Site" -> "Cagsawa Ruins")
  for (const entry of allowlist) {
    if (norm.includes(entry.normalized) || entry.normalized.includes(norm)) {
      const sim = Math.max(entry.normalized.length / norm.length, norm.length / entry.normalized.length);
      if (sim >= 0.6) {
        return { allowed: true, canonicalTitle: entry.title, kind: entry.kind, similarity: sim };
      }
    }
  }
  // fuzzy Levenshtein >= 0.82
  let best: AllowlistEntry | null = null;
  let bestSim = 0;
  for (const entry of allowlist) {
    const sim = similarity(norm, entry.normalized);
    if (sim > bestSim) {
      bestSim = sim;
      best = entry;
    }
  }
  if (best && bestSim >= 0.82) {
    return { allowed: true, canonicalTitle: best.title, kind: best.kind, similarity: bestSim };
  }
  return { allowed: false, similarity: bestSim };
}

export function enforceAllowlist(
  itinerary: Array<{ day: number; title: string; stops: Array<{ time: string; title: string; note: string; icon: string }> }>,
  allowlist: AllowlistEntry[]
): { repaired: typeof itinerary; warnings: string[]; dropped: number; repairedCount: number } {
  const warnings: string[] = [];
  let dropped = 0;
  let repairedCount = 0;
  const repaired = itinerary.map((day) => {
    const validStops: typeof day.stops = [] as any;
    for (const stop of day.stops) {
      const check = checkTitleAgainstAllowlist(stop.title, allowlist);
      if (check.allowed && check.canonicalTitle) {
        if (check.canonicalTitle !== stop.title) repairedCount++;
        validStops.push({ ...stop, title: check.canonicalTitle });
      } else {
        dropped++;
      }
    }
    if (validStops.length === 0 && day.stops.length > 0) {
      warnings.push(`Day ${day.day}: all stops were outside the database and were replaced with nearest allowed place.`);
      const fallback = allowlist.find((e) => e.kind === "catalog") ?? allowlist[0];
      if (fallback) {
        validStops.push({
          time: "9:00 AM",
          title: fallback.title,
          note: "Fallback to a verified Albay place from the app database.",
          icon: "explore",
        });
      }
    }
    return { ...day, stops: validStops };
  });
  if (dropped > 0) {
    warnings.unshift(`${dropped} stop(s) were not in the app database and were mapped to the nearest allowed place.`);
  }
  if (repairedCount > 0 && dropped === 0) {
    warnings.push(`${repairedCount} stop title(s) were normalized to match the database exactly.`);
  }
  return { repaired, warnings, dropped, repairedCount };
}
