export function createRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Security-hardened default headers for every /api/* response.
 * vercel.json adds the same at the edge; these are defense-in-depth
 * so local dev and direct function invocations are also covered.
 */
export function applyApiHeaders(res: any, requestId: string) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), geolocation=(self), microphone=()");
  // HSTS — only meaningful over https, harmless on http
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  // Lock down API responses — no HTML/frames
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader("X-Request-Id", requestId);
  // CORS: deny by default; allow only same-origin. If you add a custom domain,
  // set ALLOWED_ORIGIN env to that origin. Preflight handled per-route.
  const allowed = String(process.env.ALLOWED_ORIGIN || "").trim();
  if (allowed) res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Vary", "Origin");
}

export function sendError(res: any, status: number, code: string, message: string, requestId: string) {
  return res.status(status).json({ error: message, code, requestId });
}

export function isJsonRequest(req: any) {
  const contentType = String(req.headers?.["content-type"] || "").toLowerCase();
  return contentType.startsWith("application/json");
}

export function serializedByteLength(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value ?? {})).byteLength;
}

/**
 * Minimal HTML tag stripping for free-text fields before they hit the LLM.
 * React already escapes on render; this prevents prompt injection / stored XSS
 * if a value is ever rendered as HTML elsewhere.
 */
export function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
