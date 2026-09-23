import type { ItineraryDay } from "@/lib/database";
import { auth } from "@/lib/firebase";

export type AiItineraryRequest = {
  prompt?: string;
  days?: number;
  budget?: string;
  pace?: string;
  refinePrompt?: string;
  existingItinerary?: ItineraryDay[];
  answers?: Record<string, string | string[] | undefined>;
  localBusinesses: Array<{
    name: string;
    category: string;
    location: string;
    hours: string;
    about: string;
  }>;
};

function isItinerary(value: unknown): value is ItineraryDay[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 7) return false;
  return value.every((day) => {
    if (!day || typeof day !== "object") return false;
    const candidate = day as Partial<ItineraryDay>;
    return Number.isInteger(candidate.day)
      && typeof candidate.title === "string"
      && Array.isArray(candidate.stops)
      && candidate.stops.length > 0
      && candidate.stops.every((stop) => stop
        && typeof stop.time === "string"
        && typeof stop.title === "string"
        && typeof stop.note === "string"
        && typeof stop.icon === "string");
  });
}

export async function generateAiItinerary(request: AiItineraryRequest): Promise<ItineraryDay[]> {
  const user = auth.currentUser;

  async function postPlannerRequest(forceTokenRefresh = false) {
    const token = user ? await user.getIdToken(forceTokenRefresh).catch(() => "") : "";
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      return await fetch("/api/itinerary", {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  let response = await postPlannerRequest();
  if (response.status === 401 && user) response = await postPlannerRequest(true);

  const payload = await response.json().catch(() => null) as { itinerary?: unknown; error?: string; requestId?: string } | null;
  if (!response.ok) throw new Error(payload?.error || "The AI planner is unavailable.");
  if (!isItinerary(payload?.itinerary)) throw new Error("The AI planner returned an invalid itinerary.");

  return payload.itinerary;
}
