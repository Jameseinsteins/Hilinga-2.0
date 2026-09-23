# Hilinga AI Itinerary Chat — Implementation Plan
### Make it ChatGPT / Claude / Gemini-like + DB-grounded + AQ API Key enabled
### Date: 2026-09-22 | Mode: PLAN ONLY (no code changed yet) | Author: Hermes ultrathink pass

> You asked for: (1) fix the AI itinerary chat to feel like Claude/Gemini/ChatGPT,
> (2) wire the key `[REDACTED_GCP_API_KEY]` to generate itineraries,
> (3) constrain the AI so it ONLY plans from places inside the web app's database,
> (4) do ultrathink + deliver a full implementation plan BEFORE any edits.

This document IS that plan. Read it, approve / adjust, then I will execute.

----------------------------------------------------------------
## 1. Executive Summary

Today the "AI planner" is a single-shot prompt box + 3 pill selectors + Generate button + 1 refine text input. It POSTs to /api/itinerary, gets back JSON, and renders. No chat history, no streaming, no conversational memory, no DB-grounding enforcement beyond a soft "prioritize these businesses" hint.

Goal: ship a persistent, streaming, thread-based chat (like ChatGPT/Claude/Gemini) that:
- holds multi-turn memory,
- renders both natural language AND a structured itinerary card per turn,
- NEVER invents places — every stop must map 1:1 to a record that already exists in Firestore + the curated catalog,
- uses the supplied AQ key via env-only config (never hardcoded/committed),
- degrades gracefully to the current local `buildPromptItinerary` fallback when upstream is down,
- stays auth-gated, rate-limited, and cost-bounded.

No model fine-tuning is needed. "Train it to stay inside the DB" = RAG grounding + strict prompt + server-side allowlist validation + auto-repair mapping. True fine-tuning would cost data + pipeline for little gain at this scale.

----------------------------------------------------------------
## 2. Current Inventory (what I audited)

Frontend:
- `src/lib/ai-itinerary.ts` : `generateAiItinerary(req)` -> fetch POST /api/itinerary with idToken, 60s timeout, validates `ItineraryDay[]` shape.
- `src/components/hilinga-app.tsx` Planner() : ~850 lines. State: promptText, selectedDays/Pace/Budget, suggestion chips (5), `generated: ItineraryDay[]|null`, refineInput, registeredBusinesses (from Firestore businesses subscriptions), `buildPromptItinerary()` fallback, `ItineraryPreview` + ReplacePlaceModal + exclude logic, Save & route.
- Fallback builder `buildPromptItinerary(prompt,days,budget,pace,businesses)` : keyword detector -> candidateActivities -> round-robin standardActivities -> businessActivities sliced to 3 -> dayCount*maxStops loop -> note with budget estimate.
- `src/lib/business-content.ts` : `businesses` collection (doc id = ownerUid), real-time `subscribeToRegisteredBusinesses`, cached via `cache-service` IndexedDB, helper `getAddressCoordinates()` deterministically geocodes. `businessPosts` separate but not used in itinerary yet.
- Catalog: static `catalog` (11 ExploreItem) + `routeDestinations` (hardcoded Albay points) + `placeSuggestions` feed.

Backend:
- `api/itinerary.ts` (Vercel Function, maxDuration 60): authenticateFirebaseRequest -> rateLimit 15 / 15min -> sanitize -> build systemPrompt + userMessageContent -> fetch `https://router.requesty.ai/v1/chat/completions` with Bearer apiKey, model `process.env.REQUESTY_MODEL || "google/gemma-4-31b-it"` -> extract JSON -> `normalizeAndValidateItinerary` (2-4 stops/day, icon allowlist) -> 200 JSON. Errors 401/403/413/415/429/500/502/504.
- `api/_lib/firebase-auth.ts` : identitytoolkit lookup verify idToken (8s timeout).
- `api/_lib/http.ts` + `rate-limit.ts` in-memory Map.
- `Hilinga-app-prototype/vite.config.ts` devItineraryPlugin : DUPLICATE of api logic for local dev (loadEnv, same prompt). Must be kept in sync — this duplication is a bug-risk.

Config / Secrets:
- `.env.example` declares REQUESTY_API_KEY, REQUESTY_MODEL, OPENAI_API_KEY, FIREBASE_WEB_API_KEY, VITE_FIREBASE_*.
- `.env` files are gitignored (`.env*` in .gitignore) — correct.
- Memory note: `vite.config.ts contains hardcoded REQUESTY_API_KEY requiring rotation` — verified; the .env at repo root currently has REQUESTY_API_KEY=*** (redacted in cat). Any hardcoded key in committed vite.config.ts must be removed + rotated.
- Supplied key `[REDACTED_GCP_API_KEY]` does NOT match `rqsty-sk-...` pattern in example. Likely still hits router.requesty.ai (Requesty accepts multiple upstream keys) OR is a direct Gemini/OpenAI key proxied. Plan handles both via provider abstraction.

Firestore / DB:
- `businesses/{ownerUid}` : validated fields name, category, location, hours, about, lat/lng, etc.
- catalog + registered businesses = effective allowlist for itinerary stops right now.
- `firestore.rules` already lock businesses reads to auth, writes to owner.

Gaps:
- Your screenshot shows glm-5 410 retired — model string stale. Need default model bump.
- No chat history, no streaming, no message roles, refine is one-shot not conversation.
- Hallucination possible: AI can return "Cagsawa Ruins Cafe Vista" even if no such doc; validation only checks shape not membership.

----------------------------------------------------------------
## 3. Gap Analysis: Why it doesn't feel like ChatGPT/Claude/Gemini

Dimension | ChatGPT/Claude/Gemini | Hilinga today
Prompt | Thread with user/assistant/system bubbles, markdown, code blocks | Single textarea + Generate
Memory | Full history kept, can refer to Day 2, etc. | Only last `existingItinerary` array, no text history
Refine | Natural follow-up in same thread | Separate tiny input that replaces call
Streaming | Token-by-token | Blocking 60s wait
Personality | Explains, asks clarifications, cites sources | Silent JSON
Grounding | Can cite / constrain | No enforcement
Persistence | Thread survives reload / cross-device | `generated` lost on modal close
Fallback | Graceful "I couldn't reach X" | Console warn + local planner but no chat message
UX polish | Typing indicator, copy, regenerate, stop | None

----------------------------------------------------------------
## 4. Requirements (derived)

R1 Chat UX: thread list (left) + message pane (center) + composer (bottom) — or modal thread if keeping current modal.
R2 Message types: user | assistant (text + optional itinerary JSON card) | system | tool (validation fix).
R3 Streaming: SSE / incremental JSON.
R4 Persistence: Firestore `users/{uid}/itineraryChats/{chatId}` + `messages` subcollection, hydrated on open, works cross-device.
R5 DB-grounding: allowlist = `registeredBusinesses` (Firestore, live) UNION `catalog` + `routeDestinations` + future verified Albay POIs table. AI must pick ONLY from allowlist IDs/titles.
R6 Validation pipeline: server rejects any stop not in allowlist (fuzzy match threshold 0.92), attempts auto-repair to nearest allowlist entry, else returns 502 with remediation hint.
R7 Key management: AQ key via env ONLY, server-side, never exposed to client, never logged, supports rotation without redeploy code change.
R8 Back-compat: existing `generateAiItinerary` callers and saved TripPlans keep working; new chat endpoint additive.
R9 Auth/Rate: same Firebase verify + 15/15min + per-chat throttle + MAX_BODY 32KB + token budget cap.
R10 Fallback: if upstream fails, return local `buildPromptItinerary`-equivalent JSON BUT rendered as assistant message with "offline planner" badge.
R11 Model fix: retire `glm-5` / `gemma-4-31b-it` defaults if they 410; use model that AQ key actually unlocks (probe at deploy).

----------------------------------------------------------------
## 5. Architecture — Target

### 5.1 Data Model (add Firestore, no schema migration)

```
/users/{uid}/itineraryChats/{chatId} {
  title: string,               // auto from first prompt firstLine
  days: number, pace, budget,  // snapshot of last settings
  createdAt, updatedAt: string (ISO),
  lastItinerary: ItineraryDay[] | null,
  messageCount: number
}
/users/{uid}/itineraryChats/{chatId}/messages/{msgId} {
  role: "user"|"assistant"|"system",
  content: string,             // markdown for assistant/user
  itinerary: ItineraryDay[] | null,  // machine-readable artifact
  grounding: { businessIds: string[], catalogIds: string[] } | null,
  model, requestId, createdAt,
  status: "complete"|"streaming"|"error"
}
```

Keep IndexedDB mirror (`user_trip_plans`, `user_saved_items` already) + new `user_itinerary_chats` for offline-first. Same `cache-service` pattern.

Firestore rules: add
```
match /users/{userId}/itineraryChats/{chatId} { allow read,delete: if isOwner(userId); allow create,update: if isOwner(userId) && validated keys }
match /users/{userId}/itineraryChats/{chatId}/messages/{msgId} { same }
```
Reuse isOwner.

### 5.2 Frontend — New components (keep Planner backwards-compat)

- `src/lib/ai-itinerary-chat.ts` (new):
  - `ChatMessage`, `ChatThread` types
  - `sendChatMessage(chatId, content, settings)` -> POST /api/itinerary-chat (streaming) + also wrapper `generateAiItinerary` stays for legacy
  - `subscribeToChat(chatId, cb)` via Firestore onSnapshot
  - local IndexedDB helpers for offline queue

- `src/components/itinerary-chat/` (new folder):
  - `ChatThreadList.tsx` — list of threads, new chat, rename, delete
  - `ChatPane.tsx` — bubbles, markdown, itinerary card, tool badges, copy, regenerate
  - `ItineraryChatComposer.tsx` — auto-resize textarea, pills for days/pace/budget extracted from context, send, stop
  - `ItineraryCard.tsx` — reuse ItineraryPreview but add source chips (🏪 small business vs 📍 verified POI)
  - Rename/refactor: Planner's `studioOpen` modal becomes host for ChatPane but can also be full-screen route `?view=planner-chat`

- `src/components/hilinga-app.tsx` Planner changes:
  - keep `buildPromptItinerary` but move to `src/lib/prompt-itinerary-builder.ts` (extract, unit-testable, DB-only variant)
  - Planner header adds "Switch to chat mode" toggle (feature flag `VITE_ITINERARY_CHAT_ENABLED`)
  - Keep Save & view route flow, but now per assistant message "Save this version" button

Interaction like ChatGPT:
- user types "3-day ATV + spicy food, moderate budget, packed pace — but keep it near Legazpi"
- composer parses days/pace/budget OR uses pill overrides but also extracts from text (NLP fallback).
- assistant streams: "Got it! Here's a 3-day Legazpi-centered ATV + Bicol heat itinerary..." then card.
- user: "make Day 2 more relaxed and swap lunch to a registered local business"
- assistant streams updated itinerary, cites which businesses came from DB.

### 5.3 Backend — New endpoint + hardened existing

Keep `api/itinerary.ts` for legacy + health check. Add:

`api/itinerary-chat.ts` (new, 60s maxDuration):
- Auth same as itinerary.ts (must succeed even in dev — no anon fallback in prod)
- Input: { chatId?, prompt: string, days, pace, budget, history?: ChatMessage[] (last 10), includeBusinessDetails?: boolean }
- Build allowlist:
  ```ts
  const registered = await getRegisteredBusinessesForPrompt(...) // server cannot query Firestore directly without Admin SDK; instead client SENDS sanitized allowlist (already does localBusinesses). Trust-but-verify: server re-derives names from Firestore via lookup? For v1, client-provided allowlist is accepted but server validates every returned title against it — so hallucation blocked even if client lies.
  const catalogAllowlist = CATALOG_TITLES // hard-coded server copy
  const allowlist = dedupe([...registered.map(b=>b.name), ...catalogAllowlist])
  ```
  Note: since Vercel function lacks Admin SDK by default, v1 keeps client-supplied allowlist pattern (zero new infra). v2 can add Admin SDK + `FIREBASE_SERVICE_ACCOUNT` for authoritative fetch. Documented as phased.
- System prompt overhaul (see 6).
- Call upstream via Requesty router if key is AQ.* else direct provider. Provider abstraction:
  ```ts
  const provider = detectProvider(apiKey) // "requesty" if startsWith AQ. or rqsty, else openai, gemini
  const baseUrl = provider==="requesty" ? "https://router.requesty.ai/v1/chat/completions" : provider==="openai" ? "https://api.openai.com/v1/chat/completions" : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
  ```
  AQ key is used as Bearer for requesty path — empirically test at deploy with curl. If 401, surface CONFIG_ERROR with requestId, don't retry.
- Body: include full history (system + last N turns + new user) so thread memory works.
- Streaming: if client sends `Accept: text/event-stream`, proxy SSE; else buffered JSON (keep simple v1 = buffered, add SSE in v1.1 to reduce complexity). Recommendation: v1 buffered (simpler on Vercel), v1.1 SSE.
- Validation: `normalizeAndValidateItinerary` plus NEW `enforceAllowlist(itinerary, allowlist)`:
  - exact case-insensitive match OR normalized Levenshtein >=0.92 then map to canonical title
  - if no match, drop stop and log, or return error asking to retry with stricter prompt
  - count repairs, attach `warnings: string[]` + `grounding: { matchedIds }`
- Return: { itinerary, text, requestId, model, grounding, warnings, chatId }

Refactor `api/_lib/http.ts` add `isStreamRequest`.

Update `vite.config.ts` devItineraryPlugin to also handle `/api/itinerary-chat` with same logic, OR better extract shared `shared-itinerary-prompt.ts` so dev+prod never diverge.

### 5.4 Prompt Engineering — Grounding

Current systemPrompt:
"You are Hilinga, expert for Albay... Include Mayon, Cagsawa... Prioritize matching registered businesses... Output ONLY JSON..."

New systemPrompt (versioned, stored in `api/_lib/itinerary-prompt.ts`):

```
You are Hilinga, an Albay-only travel planner. You must output TWO parts:
1) A friendly markdown explanation (2-3 paragraphs) for the user.
2) Then a fenced json block with { itinerary: [...] }.

STRICT GROUNDING RULES — VIOLATION = FAIL:
- You may ONLY use places whose Title appears in the ALLOWED PLACES LIST below.
- Do NOT invent, paraphrase, or translate titles. Copy Title verbatim.
- If no allowed place fits a slot, leave the slot empty rather than invent.
- Use ONLY icons from the allowlist.
- Keep 2-4 stops per day, logically clustered by proximity.

ALLOWED PLACES LIST:
- [Small Business] Albay Coffee House | Cafes | Old Albay District | Hours: 7am-9pm | About: ...
- [Catalog] Cagsawa Ruins | Heritage | Daraga | ...
... (up to 25 businesses + ~15 catalog entries, truncated to fit 3k tokens)

If the user's request cannot be satisfied from ALLOWED PLACES, say so in the markdown and propose the closest alternative from the list.

Examples of WRONG titles to never output: "Hidden Gem Cafe", "Mayon Secret Beach" (not in list).
```

Temperature 0.4 for grounding (down from 0.7) to reduce creativity/hallucination.

Supply `businessNote` no longer freeform but structured list with hours/about to help ranking.

Few-shot: include 1 example good JSON using only allowlist titles.

### 5.5 API Key — [REDACTED_GCP_API_KEY]

Handling:
- NEVER hardcode. Set as Vercel env `REQUESTY_API_KEY=[REDACTED_GCP_API_KEY]` (Production, Preview, Development).
- Locally set in `Hilinga-app-prototype/.env` (ignored) AND repo-root `.env` (also ignored) as `REQUESTY_API_KEY=[REDACTED_GCP_API_KEY]`.
- Remove hardcoded key from `vite.config.ts` (if present) + rotate any previously committed key via Requesty dashboard.
- Add provider detection so if AQ key is actually a Gemini/OpenAI key, the switch is just changing `REQUESTY_MODEL` (e.g., `google/gemini-2.0-flash` vs `openai/gpt-4o`).
- Log only `keyPrefix = apiKey.slice(0,3)+"***"` never full key.
- Document rotation: `vercel env rm` + `vercel env add` + redeploy.

Verification before ship:
```
curl -X POST https://router.requesty.ai/v1/chat/completions \
 -H "Authorization: Bearer [REDACTED_GCP_API_KEY]" \
 -H "Content-Type: application/json" \
 -d '{"model":"google/gemma-4-31b-it","messages":[{"role":"user","content":"ping"}]}'
```
If 410 Model retired => probe model list via Requesty docs, update `REQUESTY_MODEL` to `google/gemini-2.0-flash` or `openai/gpt-4o-mini` as fallback.

### 5.6 Streaming vs Buffered

V1 ships buffered (60s wait but simple). V1.1 upgrades to SSE:
- Server uses `fetch(...).body.getReader()` and proxies `data: {...}\n\n`
- Client uses `fetchEventSource` to render token increments.
This avoids Vercel function timeout complexity for v1.

### 5.7 Fallback Path

On upstream 5xx / timeout / 429 / invalid JSON:
- server returns `{ fallback: true, itinerary: buildPromptItineraryAllowlistOnly(...), warning: "AI unreachable, local planner used" }`
- client renders as assistant message with amber badge "Crafted locally · AI unavailable" so UX matches ChatGPT offline notice.

----------------------------------------------------------------
## 6. File Change Inventory (exact)

MODIFY:
- `api/itinerary.ts` — keep, but extract prompt constants to `api/_lib/itinerary-prompt.ts`, tighten validation, add allowlist enforcement hook, lower temperature to 0.4 when localBusinesses present.
- `api/_lib/http.ts` — add stream helpers if needed.
- `firestore.rules` — add itineraryChats + messages blocks.
- `vercel.json` — add function entry for `api/itinerary-chat.ts.cast({maxDuration:60})`.
- `Hilinga-app-prototype/vite.config.ts` — remove hardcoded key, import shared prompt, add /api/itinerary-chat dev handler, ensure loadEnv not leaking key to client.
- `Hilinga-app-prototype/.env.example` — clarify AQ key usage, add ITINERARY_CHAT_ENABLED flag.
- `Hilinga-app-prototype/src/lib/ai-itinerary.ts` — keep for legacy, but mark deprecated; add `src/lib/ai-itinerary-chat.ts`.
- `Hilinga-app-prototype/src/components/hilinga-app.tsx` — extract `buildPromptItinerary` + catalog to lib, replace Planner modal content with <ItineraryChat /> when flag on, keep legacy behind flag.
- `Hilinga-app-prototype/src/lib/business-content.ts` — no change, but add `getBusinessAllowlistForChat()` helper reusing cache.
- `Hilinga-app-prototype/src/global.css` — chat bubbles, scrollbar, typing dots, markdown styles (match app green palette).

ADD:
- `api/itinerary-chat.ts`
- `api/_lib/itinerary-prompt.ts` (shared system prompt + allowlist formatter + model registry)
- `api/_lib/allowlist.ts` (normalize, fuzzy match, Levenshtein)
- `Hilinga-app-prototype/src/lib/ai-itinerary-chat.ts`
- `Hilinga-app-prototype/src/lib/prompt-itinerary-builder.ts` (moved buildPromptItinerary, enhanced to DB-only)
- `Hilinga-app-prototype/src/components/itinerary-chat/ChatPane.tsx`
- `Hilinga-app-prototype/src/components/itinerary-chat/ChatThreadList.tsx`
- `Hilinga-app-prototype/src/components/itinerary-chat/ItineraryChatComposer.tsx`
- `Hilinga-app-prototype/src/components/itinerary-chat/ItineraryCard.tsx`
- `Hilinga-app-prototype/src/lib/cache-service.ts` — add stores for chats if needed (or reuse)
- `IMPLEMENTATION_PLAN_AI_ITINERARY_CHAT.md` (this file) — proceed to `docs/` later.

NO CHANGE (yet):
- `src/lib/database.ts` IndexedDB version stays 3; chat storage goes to Firestore first, IndexedDB mirror optional so no migration risk.

----------------------------------------------------------------
## 7. Phases & Estimates

Phase 0 — Prep (this plan, 1 day, this doc)
Phase 1 — Backend hardening (2-3 days)
  - Extract prompt lib, add allowlist enforcement, test 410 model fix, wire AQ key env, add firestore rules, dev plugin sync, manual curl prove.
  - Do NOT ship UI yet.

Phase 2 — Chat API (2 days)
  - New api/itinerary-chat.ts buffered, history-aware, returns text+itinerary, grounding metadata, warnings.
  - Unit tests: valid allowlist passes, hallucinated title rejected/repaired, rate limit, auth.

Phase 3 — Frontend chat UI (4-5 days)
  - New chat lib + 4 components + markdown + itinerary card + thread persistence
  - Integrate into Planner with feature flag `VITE_ITINERARY_CHAT_ENABLED=true` locally, false in prod until QA.
  - Keep legacy Planner as fallback under flag.

Phase 4 — Streaming polish (2 days, optional defer)
  - SSE backend + frontend incremental render + Stop button + typing indicator.

Phase 5 — QA, prompt tuning, load (2 days)
  - Grounding accuracy test: 20 prompts -> 0 hallucinations
  - Firestore cost spot-check, token budget (cap history to 6k chars)
  - Accessibility, mobile.

Total: ~11-14 days single-dev, can overlap Phase1+2.

Incremental deploy: Phase1 can ship alone immediately to fix 410 + leakage without waiting for chat.

----------------------------------------------------------------
## 8. Security & Compliance

- Secrets: AQ key server-only, never `VITE_` prefix (VITE_ leaks to client bundle). Only `REQUESTY_API_KEY` / `OPENAI_API_KEY` on server.
- Logs: redact Authorization, only log prefix + requestId.
- .gitignore already covers .env, verify no committed .env (there is repo-root .env with REQUESTY_API_KEY=*** — ensure not committed; git status shows it as untracked `?? .env` — add to gitignore if needed, ensure not pushed).
- Vite.config hardcoded key: remove, rotate.
- Rate limit per-uid prevents key burn.
- Body size 32KB + day count 7 prevents prompt-injection DoS.
- Business location hours/about truncated to 500/160 to bound tokens.

----------------------------------------------------------------
## 9. Cost & Performance

- Requesty pricing: pay per token; buffering 3k allowlist + 2k history ~5k input + 800 output. With temp 0.4, avg cost low. Rate limit 15/15min caps at ~480 calls/8h/user worst.
- Firestore: 1 chat doc + N message docs per itinerary; reads bounded via limit(50) on businessPosts already. Chats: paginated 20 per user.
- Client: IndexedDB cache avoids repeat business reads.

----------------------------------------------------------------
## 10. Testing Strategy

Unit:
- `allowlist.test.ts` : exact match, normalized match, Levenshtein threshold, unknown title -> error
- `prompt-builder.test.ts` : DB-only builder never returns out-of-allowlist titles
- `normalizeAndValidateItinerary` existing coverage expand

Integration:
- curl `/api/itinerary-chat` with valid/invalid titles, expired token, oversize body, 429
- Firestore rules simulator: anon denied, owner allowed
- Prod key probe: `AQ.Ab...` -> 200 or CONFIG_ERROR correctly
- Manual QA matrix: 10 prompts across categories (ATV, food, family, nature, premium) -> assert every stop title ∈ allowlist

E2E:
- Create thread -> send -> receive card -> refine -> save -> route on map -> persist reload
- Offline: kill API, expect local fallback badge

----------------------------------------------------------------
## 11. Risks & Mitigations

Risk: AQ key is invalid/expired/ wrong provider -> Mitig: preflight curl, surface clear error, keep fallback active.
Risk: Model 410 again -> Mitig: model registry with fallback chain: requested -> gemini-2.0-flash -> gpt-4o-mini -> local.
Risk: Allowlist empty (no businesses, no catalog) -> Mitig: server always injects at least catalog, returns 400 if both empty.
Risk: Client sends huge history -> Mitig: truncate history to last 8 turns + 6k chars server-side.
Risk: Streaming + Vercel timeout -> Mitig: ship buffered v1 first.
Risk: Firestore cost spike from chat writes -> Mitig: cap thread count per user (e.g., 20), prune old.
Risk: Vite dev leakage -> Mitig: audit bundle for key strings.

----------------------------------------------------------------
## 12. Open Decisions — Need your call before coding

D1 Key provider: Is `[REDACTED_GCP_API_KEY]` a Requesty key (router.requesty.ai) or direct Gemini/OpenAI? -> I will probe it; if you know provider, tell me to avoid guess.
D2 Chat surface: Full-screen chat page vs modal thread inside Planner? I propose modal thread first (least navigation churn), later promote to /planner/chat route.
D3 Allowlist scope: businesses + catalog only, or also include BusinessPosts titles + CommunityPosts places? My recommendation: v1 = businesses + catalog + routeDestinations (~30 titles). Expand later once businessPosts are curated as POIs.
D4 Persistence: Firestore-only for v1 (simple) vs Firestore+IndexedDB offline mirror? Recommend Firestore-only v1, mirror in v1.1.
D5 Streaming: ship buffered first (simpler) or go SSE from day one? Recommend buffered v1, SSE v1.1.
D6 Feature flag: hide new chat behind `VITE_ITINERARY_CHAT_ENABLED` until you QA? Recommend yes.
D7 Title for allowlist mismatch: hard reject + ask retry OR auto-repair to nearest allowed? Recommend auto-repair with warning chip.

Reply with: "Proceed with defaults" or override any D1-D7.

----------------------------------------------------------------
## 13. Next Steps Upon Approval

1. Rotate/harden secrets (remove vite.config hardcode, set AQ key in Vercel + local .env, git-check).
2. Branch `feat/itinerary-chat-grounded`.
3. Execute Phase1 backend hardening (extract prompt, fix model, add allowlist validation).
4. Prove with curl + typecheck + build (no invented output in 10 probes).
5. Deliver Phase2-3 behind flag, demo in local dev, then enable.
6. Ship IMPLEMENTATION_PLAN as docs/ + update REFACTORING_STATUS.

----------------------------------------------------------------
## 14. What I will NOT do without approval

- No hardcoded AQ key commit.
- No edits to any .env committed.
- No training/fine-tuning call (not needed).
- No dropping legacy single-shot API — additive only.

Awaiting your go-ahead. Default on approval: D1 probe, D2 modal, D3 businesses+catalog, D4 Firestore-only, D5 buffered, D6 flag on, D7 repair.

