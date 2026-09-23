import type { ItineraryDay } from "@/lib/database";
import { auth } from "@/lib/firebase";

export type ChatRole = "user" | "assistant";
export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  itinerary?: ItineraryDay[] | null;
  grounded?: boolean;
  warnings?: string[];
  createdAt: string;
  pending?: boolean;
  error?: string | null;
};

export type ChatRequest = {
  prompt: string;
  days?: number;
  budget?: string;
  pace?: string;
  localBusinesses: Array<{ name: string; category: string; location: string; hours: string; about: string }>;
  history?: Array<{ role: ChatRole; content: string }>;
};

function isItinerary(value: unknown): value is ItineraryDay[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 7) return false;
  return true; // server already validates
}

export async function sendItineraryChat(request: ChatRequest): Promise<{ text: string; itinerary: ItineraryDay[] | null; warnings: string[]; grounded: boolean; requestId?: string }> {
  const user = auth.currentUser;
  async function post(forceRefresh = false) {
    const token = user ? await user.getIdToken(forceRefresh).catch(() => "") : "";
    const controller = new AbortController();
    const t = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      return await fetch("/api/itinerary-chat", {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } finally { window.clearTimeout(t); }
  }
  let response = await post();
  if (response.status === 401 && user) response = await post(true);
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) throw new Error(payload?.error || "The AI planner is unavailable.");
  // allow both itinerary-chat and legacy itinerary shape
  if (payload?.itinerary && isItinerary(payload.itinerary)) {
    return { text: typeof payload.text === "string" ? payload.text : "", itinerary: payload.itinerary, warnings: Array.isArray(payload.warnings) ? payload.warnings : [], grounded: Boolean(payload.grounded), requestId: payload.requestId };
  }
  if (payload?.text && payload?.itinerary === null) {
    return { text: payload.text, itinerary: null, warnings: payload.warnings || [], grounded: false, requestId: payload.requestId };
  }
  // fallback to legacy itinerary endpoint shape
  if (Array.isArray(payload?.itinerary)) {
    return { text: "", itinerary: payload.itinerary, warnings: payload.warnings || [], grounded: Boolean(payload.grounded), requestId: payload.requestId };
  }
  throw new Error("The AI planner returned an invalid response.");
}
