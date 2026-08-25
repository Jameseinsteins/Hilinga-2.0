export function createRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function applyApiHeaders(res: any, requestId: string) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Request-Id", requestId);
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
