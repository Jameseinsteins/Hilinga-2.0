import { ApiAuthenticationError, authenticateFirebaseRequest } from "./_lib/firebase-auth";
import { applyApiHeaders, createRequestId, isJsonRequest, sendError, serializedByteLength } from "./_lib/http";
import { takeRateLimit } from "./_lib/rate-limit";
import {
  cleanText,
  sanitizeBusinesses,
  buildSystemPrompt,
  resolveModel,
  resolveGeminiBaseUrl,
  normalizeAndValidateItinerary,
  extractJson,
  parseDayCountFromPrompt,
  parseDayCountIfPresent,
  parsePaceFromPrompt,
  parseBudgetFromPrompt,
  viabilityWarnings,
} from "./_lib/itinerary-prompt";
import { CATALOG_TITLES, buildAllowlist, enforceAllowlist } from "./_lib/allowlist";

const MAX_BODY_BYTES = 32_000;
const MAX_DAYS = 7;
const MAX_HISTORY_TURNS = 12;
const MAX_HISTORY_CHARS = 8_000;
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 15 * 60 * 1000;

type ChatMessage = { role: "user" | "assistant"; content: string };

function sanitizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  const out: ChatMessage[] = [];
  for (const item of value.slice(-MAX_HISTORY_TURNS)) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const role = c["role"] === "assistant" ? "assistant" : c["role"] === "user" ? "user" : null;
    const content = cleanText(c["content"], 4000);
    if (!role || !content) continue;
    out.push({ role, content });
  }
  // trim total chars
  let total = 0;
  const trimmed: ChatMessage[] = [];
  // keep newest first, drop oldest if over limit
  for (let i = out.length - 1; i >= 0; i--) {
    total += out[i].content.length;
    if (total > MAX_HISTORY_CHARS && trimmed.length > 0) break;
    trimmed.unshift(out[i]);
  }
  return trimmed;
}

function extractItineraryAndText(contentText: string): { itineraryJson: any; text: string } {
  const raw = contentText.trim();
  let parsed: any = null;
  let text = raw;
  try {
    parsed = extractJson(raw);
    // if parsed contains itinerary, extract text before json block
    const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
      // try to find markdown before block
      const beforeIdx = raw.indexOf(codeBlockMatch[0]);
      text = raw.slice(0, beforeIdx).trim();
      if (!text) {
        // fallback: any text outside braces
        const firstBrace = raw.indexOf("{");
        text = firstBrace > 0 ? raw.slice(0, firstBrace).trim() : "";
      }
    } else {
      const firstBrace = raw.indexOf("{");
      if (firstBrace > 0) text = raw.slice(0, firstBrace).trim();
      else text = "";
    }
  } catch {
    // content may be pure JSON without markdown
    try {
      parsed = extractJson(raw);
      text = "";
    } catch {
      parsed = null;
      text = raw;
    }
  }
  return { itineraryJson: parsed, text };
}

export default async function handler(req: any, res: any) {
  const requestId = createRequestId();
  applyApiHeaders(res, requestId);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.", requestId);
  }
  if (!isJsonRequest(req)) {
    return sendError(res, 415, "JSON_REQUIRED", "Send the planner request as JSON.", requestId);
  }
  if (serializedByteLength(req.body) > MAX_BODY_BYTES) {
    return sendError(res, 413, "REQUEST_TOO_LARGE", "Planner request is too large.", requestId);
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    return sendError(res, 500, "CONFIG_ERROR", "GEMINI_API_KEY not configured. Set GEMINI_API_KEY in .env (https://aistudio.google.com/app/apikey).", requestId);
  }
  const model = resolveModel(process.env.GEMINI_MODEL || process.env.GOOGLE_MODEL || process.env.REQUESTY_MODEL);
  const baseUrl = resolveGeminiBaseUrl(apiKey);

  try {
    let user: { uid: string; email: string; emailVerified: boolean } | null = null;
    try {
      user = await authenticateFirebaseRequest(req);
    } catch (authError) {
      if (process.env.NODE_ENV === "production") throw authError;
      user = { uid: "dev-local-user", email: "dev@hilinga.local", emailVerified: true };
    }

    if (process.env.NODE_ENV === "production" && user && !user.emailVerified) {
      return sendError(res, 403, "EMAIL_NOT_VERIFIED", "Confirm your email before using the AI planner.", requestId);
    }

    const rate = takeRateLimit(`itinerary-chat:${user?.uid || "anon"}`, RATE_LIMIT, RATE_WINDOW_MS);
    res.setHeader("X-RateLimit-Limit", String(rate.limit));
    res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(rate.resetAt / 1000)));
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "You've sent several chat messages. Wait a few minutes.", requestId);
    }

    const rawPrompt = cleanText(req.body?.prompt ?? req.body?.message ?? req.body?.content, 2500);
    const rawDays = Number.parseInt(String(req.body?.days ?? ""), 10);
    const localBusinesses = sanitizeBusinesses(req.body?.localBusinesses);
    const history = sanitizeHistory(req.body?.history ?? req.body?.messages);
    const allowlist = buildAllowlist(localBusinesses.map((b) => b.name));

    if (!rawPrompt) {
      return sendError(res, 400, "PROMPT_REQUIRED", "Please send a message to the AI planner.", requestId);
    }

    let dayCount = Number.isInteger(rawDays) && rawDays >= 1 && rawDays <= MAX_DAYS
      ? rawDays
      : parseDayCountFromPrompt(rawPrompt, 2, MAX_DAYS);

    // Real-AI enhancement: natural language overrides pill defaults — "2d relaxed budget" just works
    const inferredDays = parseDayCountIfPresent(rawPrompt, MAX_DAYS);
    if (inferredDays !== null) dayCount = inferredDays;
    const effectivePace = parsePaceFromPrompt(rawPrompt, typeof req.body?.pace === "string" && req.body.pace ? String(req.body.pace) : "Balanced");
    const effectiveBudget = parseBudgetFromPrompt(rawPrompt, typeof req.body?.budget === "string" && req.body.budget ? String(req.body.budget) : "Moderate");

    let userMessageContent = rawPrompt;
    userMessageContent += `\nBudget level: ${cleanText(effectiveBudget, 50)}`;
    userMessageContent += `\nTravel pace: ${cleanText(effectivePace, 50)}`;
    userMessageContent += `\nRequested days: ${dayCount}`;

    const systemPrompt = buildSystemPrompt({
      dayCount,
      businesses: localBusinesses,
      catalogEntries: CATALOG_TITLES,
      isChat: true,
      pace: effectivePace,
      budget: effectiveBudget,
    });

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessageContent },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    let apiResponse: Response;
    try {
      apiResponse = await fetch(baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Client-Request-Id": requestId,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.35,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await apiResponse.json().catch(() => null);

    if (!apiResponse.ok) {
      const msg = data?.error?.message || data?.error || `Upstream error ${apiResponse.status}`;
      console.error("[itinerary-chat] upstream failed", { requestId, status: apiResponse.status, error: data?.error });
      return sendError(res, 502, "AI_UPSTREAM_ERROR", String(msg).slice(0, 400) || "The AI planner is temporarily unavailable.", requestId);
    }

    const contentText = data?.choices?.[0]?.message?.content;
    if (!contentText) {
      return sendError(res, 502, "AI_EMPTY_RESPONSE", "The AI planner returned an empty response.", requestId);
    }

    const { itineraryJson, text } = extractItineraryAndText(String(contentText));

    let rawList: any = null;
    if (itineraryJson) {
      rawList = itineraryJson?.itinerary || (Array.isArray(itineraryJson) ? itineraryJson : null);
    }

    // If no structured itinerary in response, try to extract JSON directly
    if (!rawList) {
      try {
        const alt = extractJson(String(contentText));
        rawList = alt?.itinerary || (Array.isArray(alt) ? alt : null);
      } catch {
        rawList = null;
      }
    }

    if (!rawList) {
      // Return text-only assistant message (no itinerary)
      return res.status(200).json({
        text: String(contentText).slice(0, 4000),
        itinerary: null,
        requestId,
        generatedAt: new Date().toISOString(),
        model,
        warnings: ["The AI replied without a structured itinerary. Try asking to 'create an itinerary' explicitly."],
        grounded: false,
      });
    }

    const validatedItinerary = normalizeAndValidateItinerary(rawList, dayCount);
    if (!validatedItinerary) {
      return sendError(res, 502, "AI_INVALID_RESPONSE", "The AI planner returned an invalid itinerary format.", requestId);
    }

    const enforced = enforceAllowlist(validatedItinerary as any, allowlist);
    // Viability check: surface warnings if AI ignored pace/day count/budget coherence
    const vWarnings = viabilityWarnings(enforced.repaired as any, dayCount, effectivePace);
    const allWarnings = [...enforced.warnings, ...vWarnings];

    return res.status(200).json({
      text: text.slice(0, 4000) || `Here's your ${dayCount}-day Albay itinerary, grounded in the app database.`,
      itinerary: enforced.repaired,
      requestId,
      generatedAt: new Date().toISOString(),
      model,
      warnings: allWarnings,
      grounded: true,
      viability: { pace: effectivePace, budget: effectiveBudget, days: dayCount, issues: vWarnings },
    });
  } catch (error) {
    if (error instanceof ApiAuthenticationError) {
      return sendError(res, error.status, error.code, error.message, requestId);
    }
    if (error instanceof Error && error.name === "AbortError") {
      return sendError(res, 504, "AI_TIMEOUT", "The AI planner took too long. Please try again.", requestId);
    }
    console.error("[itinerary-chat] Unexpected failure", { requestId, message: error instanceof Error ? error.message : String(error) });
    return sendError(res, 500, "INTERNAL_ERROR", "The AI planner could not be reached.", requestId);
  }
}
