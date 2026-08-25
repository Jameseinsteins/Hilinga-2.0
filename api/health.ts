import { applyApiHeaders, createRequestId, sendError } from "./_lib/http";

export default function handler(req: any, res: any) {
  const requestId = createRequestId();
  applyApiHeaders(res, requestId);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.", requestId);
  }
  return res.status(200).json({ status: "ok", service: "hilinga-backend", requestId });
}
