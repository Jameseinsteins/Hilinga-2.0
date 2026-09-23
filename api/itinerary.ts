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
} from "./_lib/itinerary-prompt";
import { CATALOG_TITLES, buildAllowlist, enforceAllowlist } from "./_lib/allowlist";

const MAX_BODY_BYTES = 32_000;
const MAX_DAYS = 7;
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 15 * 60 * 1000;

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
    return sendError(res, 500, "CONFIG_ERROR", "GEMINI_API_KEY not configured. Set GEMINI_API_KEY in .env (get one at https://aistudio.google.com/app/apikey).", requestId);
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

    const rate = takeRateLimit(`itinerary:${user?.uid || "anon"}`, RATE_LIMIT, RATE_WINDOW_MS);
    res.setHeader("X-RateLimit-Limit", String(rate.limit));
    res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(rate.resetAt / 1000)));
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "You've generated several plans. Wait a few minutes before trying again.", requestId);
    }

    const rawPrompt = cleanText(req.body?.prompt, 2500);
    const refinePrompt = cleanText(req.body?.refinePrompt, 1500);
    const existingItinerary = Array.isArray(req.body?.existingItinerary) ? req.body.existingItinerary : null;
    const rawDays = Number.parseInt(String(req.body?.days ?? ""), 10);
    const localBusinesses = sanitizeBusinesses(req.body?.localBusinesses);
    const allowlist = buildAllowlist(localBusinesses.map((b) => b.name));

    let dayCount = Number.isInteger(rawDays) && rawDays >= 1 && rawDays <= MAX_DAYS ? rawDays : parseDayCountFromPrompt(rawPrompt || "", 2, MAX_DAYS);

    let userMessageContent = "";
    if (refinePrompt && existingItinerary) {
      dayCount = Math.max(1, Math.min(MAX_DAYS, existingItinerary.length));
      userMessageContent = "Refine this existing " + dayCount + "-day Albay itinerary based on this instruction: \"" + refinePrompt + "\".\nExisting itinerary:\n" + JSON.stringify(existingItinerary, null, 2);
    } else if (rawPrompt) {
      userMessageContent = "Create a " + dayCount + "-day personalized Albay itinerary for the following request:\n\"" + rawPrompt + "\"";
      if (req.body?.budget) userMessageContent += "\nBudget level: " + cleanText(req.body.budget, 50);
      if (req.body?.pace) userMessageContent += "\nTravel pace: " + cleanText(req.body.pace, 50);
    } else if (req.body?.answers) {
      userMessageContent = "Create an itinerary from these traveler answers:\n" + JSON.stringify(req.body.answers, null, 2);
      const ansDays = Number.parseInt(String(req.body.answers.days ?? "2"), 10);
      if (ansDays >= 1 && ansDays <= MAX_DAYS) dayCount = ansDays;
    } else {
      return sendError(res, 400, "PROMPT_REQUIRED", "Please provide a travel prompt to generate an itinerary.", requestId);
    }

    const systemPrompt = buildSystemPrompt({
      dayCount,
      businesses: localBusinesses,
      catalogEntries: CATALOG_TITLES,
      isChat: false,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    let apiResponse: Response;
    try {
      apiResponse = await fetch(baseUrl, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
          "X-Client-Request-Id": requestId,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessageContent },
          ],
          temperature: 0.7,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await apiResponse.json().catch(() => null);

    if (!apiResponse.ok) {
      console.error("[ai-itinerary] Gemini request failed", {
        requestId,
        status: apiResponse.status,
        error: data?.error,
      });
      return sendError(res, 502, "AI_UPSTREAM_ERROR", data?.error?.message || "The AI planner could not create an itinerary right now.", requestId);
    }

    const contentText = data?.choices?.[0]?.message?.content;
    if (!contentText) {
      return sendError(res, 502, "AI_EMPTY_RESPONSE", "The AI planner returned an empty response.", requestId);
    }

    let parsedJson: any;
    try {
      parsedJson = extractJson(contentText);
    } catch {
      console.error("[ai-itinerary] Failed to parse JSON from AI response", { contentText });
      return sendError(res, 502, "AI_INVALID_RESPONSE", "The AI planner returned an unparseable response.", requestId);
    }

    const rawList = parsedJson?.itinerary || (Array.isArray(parsedJson) ? parsedJson : null);
    const validatedItinerary = normalizeAndValidateItinerary(rawList, dayCount);

    if (!validatedItinerary) {
      return sendError(res, 502, "AI_INVALID_RESPONSE", "The AI planner returned an invalid itinerary format.", requestId);
    }

    const enforced = enforceAllowlist(validatedItinerary as any, allowlist);

    return res.status(200).json({
      itinerary: enforced.repaired,
      warnings: enforced.warnings,
      grounded: true,
      requestId,
      generatedAt: new Date().toISOString(),
      model,
    });
  } catch (error) {
    if (error instanceof ApiAuthenticationError) {
      return sendError(res, error.status, error.code, error.message, requestId);
    }
    if (error instanceof Error && error.name === "AbortError") {
      return sendError(res, 504, "AI_TIMEOUT", "The AI planner took too long. Please try again.", requestId);
    }
    console.error("[ai-itinerary] Unexpected failure", { requestId, message: error instanceof Error ? error.message : String(error) });
    return sendError(res, 500, "INTERNAL_ERROR", "The AI planner could not be reached.", requestId);
  }
}
