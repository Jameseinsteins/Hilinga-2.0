/**
 * Shared itinerary prompt builder — used by both api/itinerary.ts and api/itinerary-chat.ts
 * and vite dev plugin. Keeps prompts in sync.
 */

export const VALID_ICONS = new Set([
  "landscape", "restaurant", "museum", "shopping_bag", "photo_camera",
  "directions_walk", "tour", "hotel", "storefront", "church", "festival",
  "beach_access", "spa", "hiking", "sports_motorsports", "explore",
  "water_drop", "park", "local_cafe", "payments", "interests",
  "family_restroom", "celebration", "done_all", "place"
]);

export const MODEL_FALLBACKS = [
  "gemini-3-flash-preview",
  "gemini-flash-latest",
  "gemini-2.5-flash",
] as const;

export function resolveModel(envModel: string | undefined): string {
  const raw = (envModel || "").trim();
  if (raw) return raw;
  return MODEL_FALLBACKS[0];
}

export function resolveGeminiBaseUrl(_apiKey?: string): string {
  return "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
}

// Kept for backward compat — now always returns Gemini.
export function resolveRequestyBaseUrl(_apiKey?: string): string {
  return resolveGeminiBaseUrl(_apiKey);
}

export function resolveBaseUrl(_apiKey?: string): string {
  return resolveGeminiBaseUrl(_apiKey);
}

export type BusinessForPrompt = {
  name: string;
  category: string;
  location: string;
  hours: string;
  about: string;
};

export function formatBusinessForPrompt(b: BusinessForPrompt): string {
  return `[Small Business] ${b.name} | ${b.category} | ${b.location} | Hours: ${b.hours} | About: ${b.about}`;
}

export function formatCatalogForPrompt(entries: Array<{ title: string; kind: string }>): string {
  return entries.map((e) => `[Catalog ${e.kind}] ${e.title}`).join("\n");
}

export function buildSystemPrompt(opts: {
  dayCount: number;
  businesses: BusinessForPrompt[];
  catalogEntries: Array<{ title: string; kind: string }>;
  isChat: boolean;
  pace?: string;
  budget?: string;
}): string {
  const allowlines: string[] = [];
  if (opts.businesses.length > 0) {
    allowlines.push("REGISTERED SMALL BUSINESSES (from app database, prefer these when relevant):");
    for (const b of opts.businesses.slice(0, 25)) {
      allowlines.push(formatBusinessForPrompt(b));
    }
  }
  allowlines.push("VERIFIED ALBAY CATALOG PLACES (from app database):");
  for (const c of opts.catalogEntries) {
    allowlines.push(formatCatalogForPrompt([c]));
  }

  const allowedListText = allowlines.join("\n");
  const iconList = Array.from(VALID_ICONS).join(", ");
  const pace = opts.pace || "Balanced";
  const budget = opts.budget || "Moderate";

  if (opts.isChat) {
    return [
      "You are Hilinga AI — a warm, locally-rooted travel companion for Albay, Philippines.",
      "You chat like ChatGPT / Claude / Gemini: friendly, concise, empathetic, naturally conversational, with subtle humor when appropriate. You remember the last 10 turns and refer to the previous itinerary when the user asks to refine.",
      `Your core job: design a coherent, realistic itinerary focused purely within Albay province, using ONLY places from the ALLOWED PLACES LIST below. Keep stops clustered by proximity (under 45 min drive between stops) so travelers don't crisscross.`,
      "",
      `CURRENT TRIP CONTEXT (defaults — user's latest message ALWAYS overrides these):`,
      `- Requested days: ${opts.dayCount} — if user says "make it 3 days", "2d", "extend to 4 days", "weekend trip", etc., use THAT number instead. Day count must be 1–7.`,
      `- Travel pace: ${pace} — Relaxed = 2 stops/day, long breaks, gentle walks; Balanced = 3 stops/day, moderate activity; Packed = 4 stops/day, maximize sights. If user says "more relaxed" / "chill" / "slow" interpret as Relaxed; "packed" / "full" / "intense" as Packed.`,
      `- Budget: ${budget} — Budget = ₱300–₱700/person/day (value eats, markets, free sights); Moderate = ₱700–₱1,500 (balanced dining & standard tours); Premium = ₱1,500+ (upscale dining, private tours, resorts). If user says "budget-friendly" / "cheap" use Budget; "luxury" / "premium" use Premium.`,
      `- You have conversation history — use it. If user says "make Day 2 more relaxed" adjust ONLY Day 2. If they say "add a local cafe" swap one stop for a registered Small Business. If they say "swap for nature" prefer Quitinday Hills, Vera Falls, Hoyop-Hoyopan Cave, Sumlang Lake, Mayon ATV, etc.`,
      "",
      "STRICT DATABASE GROUNDING — VIOLATION = FAIL:",
      "- You may ONLY use place titles that appear verbatim in the ALLOWED PLACES LIST below.",
      "- Copy Title exactly — no paraphrasing, translating, or adding prefixes/suffixes. E.g., if list has \"Cagsawa Ruins\" you must output exactly \"Cagsawa Ruins\", not \"Cagsawa Ruins Park View\".",
      "- Never invent a place. If user asks for something not in the list (e.g., beach in Boracay, mall in Manila), politely explain you only cover verified Albay spots and propose the closest alternative from the list.",
      "- Every day must be viable: times realistic (e.g., 8:30 AM, 11:30 AM, 2:30 PM, 5:30 PM), activities fit the pace, and geographic clustering is sensible.",
      "",
      "ALLOWED PLACES LIST:",
      allowedListText,
      "",
      "HOW TO RESPOND (chat mode):",
      "1) First write a friendly 2–4 sentence markdown reply. Explain choices naturally, cite which registered small businesses you included (by exact name), note how you matched pace/budget/days, and mention trade-offs. If user made small talk or asked a general question, respond warmly first.",
      "2) Then ONLY if the user wants trip planning, creation, or refinement, on a NEW line output a fenced ```json block containing ONLY {\"itinerary\": [...] } . The JSON must be valid, must contain exactly the requested day count (1–7), each day 2–4 stops matching the pace, and every stop title from the ALLOWED LIST. If the user's message is pure chitchat (e.g., \"hello\", \"what can you do?\", \"tell me about Bicol food\") reply in markdown ONLY without any JSON.",
      `Schema: {"itinerary":[{"day":1,"title":"Day 1: Title — short, evocative","stops":[{"time":"8:30 AM","title":"Exact Allowed Title","note":"1–2 sentences: what to do, tip, why it fits pace/budget","icon":"landscape"}]}]}`,
      `Allowed icon values: ${iconList}.`,
      "Keep notes helpful, specific, and locally grounded. Mention food (Bicol Express, pinangat, pili), transport tips, or hours where relevant.",
      "VIABILITY: Ensure itinerary is logistically viable for Albay — don't put Daraga Church morning then Vera Falls in Malinao then back to Legazpi Boulevard in one morning without travel buffer. Balance food, nature, culture across days.",
    ].join("\n");
  }

  const chatInstruction = "Output MUST be ONLY a valid JSON object without any conversational text.";

  return [
    "You are Hilinga, an expert local travel itinerary assistant for Albay, Philippines.",
    `Design a coherent, realistic ${opts.dayCount}-day itinerary focused purely within Albay province.`,
    "Highlight real Albay attractions. Keep stops logically sequenced by proximity so travelers avoid crisscrossing.",
    "",
    "STRICT DATABASE GROUNDING — VIOLATION = FAIL:",
    "- You may ONLY use place titles that appear verbatim in the ALLOWED PLACES LIST below.",
    "- Do NOT invent, paraphrase, translate, or add suffixes/prefixes to titles. Copy Title exactly.",
    "- If the request cannot be satisfied from the list, say so in your markdown and propose the closest alternative from the list.",
    "- Never output a title not in the list.",
    "",
    "ALLOWED PLACES LIST:",
    allowedListText,
    "",
    chatInstruction,
    `Schema: {"itinerary":[{"day":1,"title":"Day 1 Title","stops":[{"time":"8:30 AM","title":"Exact Allowed Title","note":"Description, tips, culinary highlights","icon":"landscape"}]}]}`,
    `Allowed icon values: ${iconList}.`,
    "Each day must have between 2 and 4 stops. Times should be realistic (e.g., 8:30 AM).",
  ].join(" ");
}

export function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function sanitizeBusinesses(value: unknown): BusinessForPrompt[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[])
    .slice(0, 25)
    .map((b) => {
      const c = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
      return {
        name: cleanText(c["name"], 120),
        category: cleanText(c["category"], 80),
        location: cleanText(c["location"], 160),
        hours: cleanText(c["hours"], 160),
        about: cleanText(c["about"], 500),
      };
    })
    .filter((b) => b.name && b.category && b.location);
}

export function parseDayCountFromPrompt(prompt: string, fallback = 2, maxDays = 7): number {
  const match = prompt.match(/(\d+)\s*(?:[- ]?day|days)/i);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (parsed >= 1 && parsed <= maxDays) return parsed;
  }
  if (/weekend/i.test(prompt)) return 2;
  if (/day trip|one day|single day/i.test(prompt)) return 1;
  return fallback;
}

export function parseDayCountIfPresent(prompt: string, maxDays = 7): number | null {
  const direct = prompt.match(/(\d+)\s*(?:[- ]?day|days|\bd\b)/i);
  if (direct) {
    const n = parseInt(direct[1], 10);
    if (n >= 1 && n <= maxDays) return n;
  }
  if (/\bweekend\b/i.test(prompt)) return 2;
  if (/\bday trip\b|\bone day\b|\bsingle day\b/i.test(prompt)) return 1;
  // phrases like "add a day", "extend", "make it 3 days" already covered; also handle "2d" shorthand
  const short = prompt.match(/\b([1-7])d\b/);
  if (short) {
    const n = parseInt(short[1], 10);
    if (n >= 1 && n <= maxDays) return n;
  }
  return null;
}

export function parsePaceFromPrompt(prompt: string, fallback: string = "Balanced"): string {
  const p = prompt.toLowerCase();
  if (/\brelaxed\b|\bchill\b|\bslow\b|\beasy\b|\bgentle\b|\bleisurely\b/.test(p)) return "Relaxed";
  if (/\bpacked\b|\bbusy\b|\bintense\b|\bfull\b|\bjam.?packed\b|\bmaximize\b/.test(p)) return "Packed";
  if (/\bbalanced\b|\bmoderate pace\b/.test(p)) return "Balanced";
  return fallback;
}

export function parseBudgetFromPrompt(prompt: string, fallback: string = "Moderate"): string {
  const p = prompt.toLowerCase();
  if (/\bpremium\b|\bluxury\b|\bhigh.?end\b|\bupscale\b|\b5k\b|\bexpensive\b/.test(p)) return "Premium";
  if (/\bmoderate\b/.test(p)) return "Moderate";
  if (/\bbudget\b|\bcheap\b|\baffordable\b|\blow.?cost\b|\bthrifty\b|\btipid\b/.test(p)) return "Budget";
  return fallback;
}

export function extractJson(raw: string): any {
  let cleaned = raw.trim();
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

export function normalizeAndValidateItinerary(rawItinerary: any, expectedDays: number) {
  if (!Array.isArray(rawItinerary) || rawItinerary.length === 0) return null;
  const days = rawItinerary.slice(0, expectedDays).map((dayObj: any, index: number) => {
    const candidate = dayObj && typeof dayObj === "object" ? dayObj : {};
    const rawStops = Array.isArray(candidate.stops) ? candidate.stops : [];
    const stops = rawStops.slice(0, 4).map((stopObj: any) => {
      const stop = stopObj && typeof stopObj === "object" ? stopObj : {};
      const rawIcon = String(stop.icon || "").toLowerCase().trim();
      const icon = VALID_ICONS.has(rawIcon) ? rawIcon : "explore";
      return {
        time: cleanText(stop.time, 40) || (index === 0 ? "Morning" : "Afternoon"),
        title: cleanText(stop.title, 120) || "Albay Exploration Stop",
        note: cleanText(stop.note, 500) || "Explore this scenic destination in Albay.",
        icon,
      };
    });
    if (stops.length === 0) {
      stops.push({
        time: "9:00 AM",
        title: cleanText(candidate.title, 120) || "Albay Local Sightseeing",
        note: "Enjoy scenic views and local culture.",
        icon: "landscape",
      });
    }
    return {
      day: index + 1,
      title: cleanText(candidate.title, 100) || `Day ${index + 1}: Albay Exploration`,
      stops,
    };
  });
  while (days.length < expectedDays) {
    const dayNum = days.length + 1;
    days.push({
      day: dayNum,
      title: `Day ${dayNum}: Hidden Albay Gems`,
      stops: [
        {
          time: "10:00 AM",
          title: "Scenic Albay Discovery",
          note: "Take in the panoramic landscapes and enjoy authentic Bicolano cuisine.",
          icon: "explore",
        },
      ],
    });
  }
  return days;
}

export function viabilityWarnings(
  itinerary: Array<{ day: number; title: string; stops: Array<{ time: string; title: string; note: string; icon: string }> }>,
  expectedDays: number,
  pace: string
): string[] {
  const warnings: string[] = [];
  if (itinerary.length !== expectedDays) {
    warnings.push(`Itinerary has ${itinerary.length} days but ${expectedDays} requested — check day count.`);
  }
  const expectedStops = pace === "Relaxed" ? 2 : pace === "Packed" ? 4 : 3;
  for (const d of itinerary) {
    if (d.stops.length < 2) warnings.push(`Day ${d.day} has only ${d.stops.length} stop(s) — may feel sparse for ${pace} pace.`);
    if (d.stops.length > 4) warnings.push(`Day ${d.day} has ${d.stops.length} stops — may be too packed for ${pace} pace.`);
    if (pace === "Relaxed" && d.stops.length > 2) warnings.push(`Day ${d.day} has ${d.stops.length} stops but pace is Relaxed — consider fewer stops.`);
    if (pace === "Packed" && d.stops.length < 3) warnings.push(`Day ${d.day} has only ${d.stops.length} stops for Packed pace — could add more.`);
    const titles = d.stops.map((s) => s.title.toLowerCase());
    const dup = titles.filter((t, i) => titles.indexOf(t) !== i);
    if (dup.length) warnings.push(`Day ${d.day} repeats "${dup[0]}" — duplicated stop.`);
    for (const s of d.stops) {
      if (!s.note || s.note.length < 10) warnings.push(`Stop "${s.title}" has a short note — may need more helpful detail.`);
      if (!s.time) warnings.push(`Stop "${s.title}" missing time — add realistic time.`);
    }
  }
  // budget-pacing coherence handled by prompt; surface if needed
  void expectedStops;
  return warnings;
}
