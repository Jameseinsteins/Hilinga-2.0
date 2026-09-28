import type { TouristVisit } from "@/lib/tourist-passport";

// ── Stamp spots (12 verified Albay destinations) ──
// Each has foil tone + material-symbol icon + aliases used to match an incoming TouristVisit

export type StampTone = "emerald" | "amber" | "volcano" | "lake" | "heritage" | "sunset";

export type StampSpot = {
  id: string;
  name: string;
  shortName: string;
  subtitle: string;
  icon: string;          // material-symbols name
  tone: StampTone;
  aliases: string[];     // lowercase fragments matched against visit.businessName + businessLocation
  rarity: "common" | "rare" | "legendary";
};

export const STAMP_SPOTS: StampSpot[] = [
  { id: "cagsawa-ruins",    name: "Cagsawa Ruins",      shortName: "Cagsawa",  subtitle: "Camalig · Mayon icon",         icon: "temple_buddhist",  tone: "volcano",  aliases: ["cagsawa"],                                   rarity: "rare" },
  { id: "mayon-skyline",    name: "Mayon Skyline Deck", shortName: "Skyline",  subtitle: "Tabaco · Viewpoint",            icon: "landscape",        tone: "emerald",  aliases: ["skyline", "mayon skyline", "mayon deck"],        rarity: "common" },
  { id: "sumlang-lake",     name: "Sumlang Lake",       shortName: "Sumlang",  subtitle: "Camalig · Lake & crafts",      icon: "kayaking",         tone: "lake",     aliases: ["sumlang", "sumlang lake"],                     rarity: "common" },
  { id: "daraga-church",    name: "Daraga Church",      shortName: "Daraga",   subtitle: "Daraga · Heritage church",     icon: "church",           tone: "heritage", aliases: ["daraga", "daraga church", "our lady of the gate"], rarity: "rare" },
  { id: "lignon-hill",      name: "Lignon Hill",        shortName: "Lignon",   subtitle: "Legazpi · City & Mayon view",  icon: "hiking",           tone: "emerald",  aliases: ["lignon", "lignon hill"],                      rarity: "common" },
  { id: "quitinday-hills",  name: "Quitinday Hills",    shortName: "Quitinday",subtitle: "Camalig · Green hills",        icon: "terrain",          tone: "emerald",  aliases: ["quitinday", "quitinday hills"],                rarity: "common" },
  { id: "vera-falls",       name: "Vera Falls",         shortName: "Vera",     subtitle: "Malinao · Hidden falls",       icon: "waterfall_chart", tone: "lake",     aliases: ["vera falls", "vera"],                         rarity: "common" },
  { id: "hoyop-cave",       name: "Hoyop-Hoyopan Cave", shortName: "Hoyop",    subtitle: "Camalig · Caves",              icon: "cave",             tone: "heritage", aliases: ["hoyop", "hoyopan"],                          rarity: "rare" },
  { id: "albay-park",       name: "Albay Park & Wildlife", shortName: "Wildlife", subtitle: "Legazpi · Family park",     icon: "pets",             tone: "emerald",  aliases: ["albay park", "wildlife", "albay wildlife"],   rarity: "common" },
  { id: "legazpi-boulevard",name: "Legazpi Boulevard",  shortName: "Boulevard",subtitle: "Legazpi · Baywalk sunset",     icon: "beach_access",     tone: "sunset",   aliases: ["boulevard", "legazpi boulevard", "embarcadero", "boulevard baywalk"], rarity: "common" },
  { id: "ibalong-festival", name: "Ibalong Festival Grounds", shortName: "Ibalong",subtitle: "Legazpi · Culture & parade",icon: "festival",         tone: "amber",    aliases: ["ibalong", "festival grounds"],                 rarity: "legendary" },
  { id: "mayon-atv-trail",  name: "Mayon ATV Trail",    shortName: "ATV Trail",subtitle: "Lava trail adventure",         icon: "two_wheeler",      tone: "volcano",  aliases: ["atv", "lava trail", "mayon atv"],               rarity: "rare" },
];

export type PassportTier = { label: string; min: number; emoji: string; blurb: string };
export const PASSPORT_TIERS: PassportTier[] = [
  { label: "Newcomer",   min: 0,  emoji: "🌱", blurb: "Welcome to Albay — your first stamp awaits." },
  { label: "Explorer",   min: 3,  emoji: "🧭", blurb: "3 stamps — you're finding your way around Mayon." },
  { label: "Trailblazer",min: 6,  emoji: "🥾", blurb: "Half the Albay circuit complete." },
  { label: "Wayfarer",   min: 9,  emoji: "🌋", blurb: "Almost there — just a few horizons left." },
  { label: "Albay Ano",  min: 12, emoji: "👑", blurb: "12/12 — Albay is yours. Balik ka!" },
];

export function tierForCount(count: number): PassportTier {
  let cur = PASSPORT_TIERS[0];
  for (const t of PASSPORT_TIERS) if (count >= t.min) cur = t;
  return cur;
}
export function nextTierForCount(count: number): PassportTier | null {
  for (const t of PASSPORT_TIERS) if (t.min > count) return t;
  return null;
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function visitMatchesSpot(visit: TouristVisit, spot: StampSpot): boolean {
  const hay = norm(`${visit.businessName} ${visit.businessLocation} ${visit.businessName.replace(/[^a-z0-9]+/gi," ")}`);
  // direct alias substring
  for (const a of spot.aliases) {
    const na = norm(a);
    if (!na) continue;
    if (hay.includes(na)) return true;
  }
  // also match spot name tokens
  const nameNorm = norm(spot.name);
  // if visit mentions the short name (e.g., "Cagsawa") it's enough
  if (spot.shortName && hay.includes(norm(spot.shortName))) return true;
  // fallback: very forgiving token overlap — at least 2 tokens of name appear?
  // e.g., "Mayon Skyline Deck" -> "mayon skyline"
  const nameTokens = nameNorm.split(" ").filter(Boolean);
  let hits = 0;
  for (const tok of nameTokens) if (hay.includes(tok)) hits++;
  if (hits >= 2) return true;
  // also businessName exact spot name containment
  if (hay.includes(nameNorm)) return true;
  return false;
}

export function collectUnlockedSpotIds(visits: TouristVisit[]): Set<string> {
  const set = new Set<string>();
  // Strict: only alias-matched visits unlock a stamp — no fallback. Other visits still appear in the logbook.
  for (const v of visits) {
    for (const spot of STAMP_SPOTS) {
      if (visitMatchesSpot(v, spot)) set.add(spot.id);
    }
  }

  return set;
}

export type PassportProgress = {
  total: number;
  unlocked: number;
  unlockedIds: Set<string>;
  tier: PassportTier;
  nextTier: PassportTier | null;
  neededForNext: number;
  percent: number;
};

/** Compute stamp-book progress from the raw TouristVisit array. */
export function computePassportProgress(visits: TouristVisit[]): PassportProgress {
  const unlockedIds = collectUnlockedSpotIds(visits);
  const unlocked = unlockedIds.size;
  const total = STAMP_SPOTS.length;
  const tier = tierForCount(unlocked);
  const nextTier = nextTierForCount(unlocked);
  const neededForNext = nextTier ? Math.max(0, nextTier.min - unlocked) : 0;
  const percent = total ? Math.round((unlocked / total) * 100) : 0;
  return { total, unlocked, unlockedIds, tier, nextTier, neededForNext, percent };
}

// ── Helpers for share/export ──

export function spotById(id: string): StampSpot | undefined {
  return STAMP_SPOTS.find((s) => s.id === id);
}

export function unlockedSpots(visits: TouristVisit[]): StampSpot[] {
  const ids = collectUnlockedSpotIds(visits);
  return STAMP_SPOTS.filter((s) => ids.has(s.id));
}

export function lockedSpots(visits: TouristVisit[]): StampSpot[] {
  const ids = collectUnlockedSpotIds(visits);
  return STAMP_SPOTS.filter((s) => !ids.has(s.id));
}
