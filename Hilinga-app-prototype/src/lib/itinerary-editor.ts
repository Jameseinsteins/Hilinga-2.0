/**
 * Itinerary Editor
 *
 * Handles insertion, reordering, and modification of stops within a trip itinerary.
 * Automatically adjusts timings and validates stop insertions.
 */

import type { ItineraryDay, ItineraryStop } from "@/lib/database";

export type InsertionPoint = {
  dayIndex: number;
  stopIndex: number; // Index within the day's stops (or -1 for append)
  positionLabel: "before" | "after";
};

export type NewStop = {
  title: string;
  latitude: number;
  longitude: number;
  durationMinutes: number;
  note?: string;
  icon?: string;
  cost?: number;
};

/**
 * Calculate optimal time for a new stop based on surrounding stops
 */
function interpolateTime(
  previousStop: ItineraryStop | null,
  nextStop: ItineraryStop | null,
  newStopDurationMinutes: number,
): string {
  // Parse time strings (HH:MM format)
  const parseTime = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const formatTime = (totalMinutes: number): string => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };

  // If no surrounding stops, use a default time
  if (!previousStop && !nextStop) {
    return formatTime(9 * 60); // 9:00 AM default
  }

  // If previous stop exists, start after it
  if (previousStop) {
    const prevTime = parseTime(previousStop.time);
    const newStartTime = prevTime + newStopDurationMinutes;
    return formatTime(newStartTime);
  }

  // If only next stop exists, place before it
  if (nextStop) {
    const nextTime = parseTime(nextStop.time);
    const newStartTime = Math.max(0, nextTime - newStopDurationMinutes);
    return formatTime(newStartTime);
  }

  return "09:00";
}

/**
 * Check if inserting a stop would cause time conflicts
 */
function checkTimeConflict(
  itinerary: ItineraryDay[],
  dayIndex: number,
  insertionIndex: number,
  newStop: NewStop,
  insertionPoint: InsertionPoint,
): { hasConflict: boolean; message?: string } {
  const day = itinerary[dayIndex];
  if (!day) {
    return { hasConflict: false };
  }

  const stops = day.stops || [];

  // Get surrounding stops
  const beforeIndex =
    insertionPoint.positionLabel === "before" ? insertionIndex - 1 : insertionIndex;
  const afterIndex =
    insertionPoint.positionLabel === "before" ? insertionIndex : insertionIndex + 1;

  const previousStop = stops[beforeIndex] || null;
  const nextStop = stops[afterIndex] || null;

  // Check if new stop's duration would overlap with next stop
  if (previousStop && nextStop) {
    const parseTime = (timeStr: string): number => {
      const [hours, minutes] = timeStr.split(":").map(Number);
      return hours * 60 + minutes;
    };

    const prevEndTime = parseTime(previousStop.time) + 30; // Assume 30-min default duration
    const nextStartTime = parseTime(nextStop.time);
    const newStopEndTime = prevEndTime + newStop.durationMinutes;

    if (newStopEndTime > nextStartTime) {
      const minutesOverlap = newStopEndTime - nextStartTime;
      return {
        hasConflict: true,
        message: `This stop would overlap with the next stop by ${minutesOverlap} minutes. Consider extending the day or reducing this stop's duration.`,
      };
    }
  }

  return { hasConflict: false };
}

/**
 * Insert a new stop into an itinerary at a specific point
 */
export function insertStop(
  itinerary: ItineraryDay[],
  insertionPoint: InsertionPoint,
  newStop: NewStop,
): {
  success: boolean;
  updatedItinerary: ItineraryDay[];
  error?: string;
} {
  const { dayIndex, stopIndex, positionLabel } = insertionPoint;

  // Validate day index
  if (dayIndex < 0 || dayIndex >= itinerary.length) {
    return { success: false, updatedItinerary: itinerary, error: "Invalid day index" };
  }

  const day = itinerary[dayIndex];
  if (!day || !day.stops) {
    return { success: false, updatedItinerary: itinerary, error: "Day has no stops" };
  }

  // Check for time conflicts
  const conflict = checkTimeConflict(itinerary, dayIndex, stopIndex, newStop, insertionPoint);
  if (conflict.hasConflict) {
    return {
      success: false,
      updatedItinerary: itinerary,
      error: conflict.message,
    };
  }

  // Create new stop object
  const stops = [...day.stops];
  const insertionIdx = positionLabel === "before" ? stopIndex : stopIndex + 1;

  const previousStop = stops[insertionIdx - 1] || null;
  const nextStop = stops[insertionIdx] || null;

  const newStopTime = interpolateTime(previousStop, nextStop, newStop.durationMinutes);

  const stopId = `stop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const createdStop: ItineraryStop = {
    id: stopId,
    time: newStopTime,
    title: newStop.title,
    note: newStop.note || "",
    icon: newStop.icon || "📍",
    place: {
      latitude: newStop.latitude,
      longitude: newStop.longitude,
    },
    durationMinutes: newStop.durationMinutes,
    cost: newStop.cost,
  };

  // Insert the stop
  stops.splice(insertionIdx, 0, createdStop);

  // Create updated itinerary
  const updatedItinerary = itinerary.map((d, idx) =>
    idx === dayIndex ? { ...d, stops } : d,
  );

  return {
    success: true,
    updatedItinerary,
  };
}

/**
 * Remove a stop from an itinerary
 */
export function removeStop(
  itinerary: ItineraryDay[],
  dayIndex: number,
  stopIndex: number,
): {
  success: boolean;
  updatedItinerary: ItineraryDay[];
  error?: string;
} {
  if (dayIndex < 0 || dayIndex >= itinerary.length) {
    return { success: false, updatedItinerary: itinerary, error: "Invalid day index" };
  }

  const day = itinerary[dayIndex];
  if (!day || !day.stops || stopIndex < 0 || stopIndex >= day.stops.length) {
    return { success: false, updatedItinerary: itinerary, error: "Invalid stop index" };
  }

  const stops = day.stops.filter((_, idx) => idx !== stopIndex);

  const updatedItinerary = itinerary.map((d, idx) =>
    idx === dayIndex ? { ...d, stops } : d,
  );

  return { success: true, updatedItinerary };
}

/**
 * Reorder stops within a day
 */
export function reorderStops(
  itinerary: ItineraryDay[],
  dayIndex: number,
  fromIndex: number,
  toIndex: number,
): {
  success: boolean;
  updatedItinerary: ItineraryDay[];
  error?: string;
} {
  if (dayIndex < 0 || dayIndex >= itinerary.length) {
    return { success: false, updatedItinerary: itinerary, error: "Invalid day index" };
  }

  const day = itinerary[dayIndex];
  if (!day || !day.stops) {
    return { success: false, updatedItinerary: itinerary, error: "Day has no stops" };
  }

  if (
    fromIndex < 0 ||
    fromIndex >= day.stops.length ||
    toIndex < 0 ||
    toIndex >= day.stops.length
  ) {
    return { success: false, updatedItinerary: itinerary, error: "Invalid stop index" };
  }

  const stops = [...day.stops];
  const [movedStop] = stops.splice(fromIndex, 1);
  stops.splice(toIndex, 0, movedStop);

  const updatedItinerary = itinerary.map((d, idx) =>
    idx === dayIndex ? { ...d, stops } : d,
  );

  return { success: true, updatedItinerary };
}

/**
 * Update a stop's properties
 */
export function updateStop(
  itinerary: ItineraryDay[],
  dayIndex: number,
  stopIndex: number,
  updates: Partial<NewStop>,
): {
  success: boolean;
  updatedItinerary: ItineraryDay[];
  error?: string;
} {
  if (dayIndex < 0 || dayIndex >= itinerary.length) {
    return { success: false, updatedItinerary: itinerary, error: "Invalid day index" };
  }

  const day = itinerary[dayIndex];
  if (!day || !day.stops || stopIndex < 0 || stopIndex >= day.stops.length) {
    return { success: false, updatedItinerary: itinerary, error: "Invalid stop index" };
  }

  const stop = day.stops[stopIndex];
  const updatedStop: ItineraryStop = {
    ...stop,
    title: updates.title || stop.title,
    note: updates.note || stop.note,
    icon: updates.icon || stop.icon,
    place: updates.latitude && updates.longitude
      ? { latitude: updates.latitude, longitude: updates.longitude }
      : stop.place,
    durationMinutes: updates.durationMinutes || stop.durationMinutes,
    cost: updates.cost !== undefined ? updates.cost : stop.cost,
  };

  const stops = day.stops.map((s, idx) => (idx === stopIndex ? updatedStop : s));

  const updatedItinerary = itinerary.map((d, idx) =>
    idx === dayIndex ? { ...d, stops } : d,
  );

  return { success: true, updatedItinerary };
}

/**
 * Calculate total trip duration from itinerary
 */
export function calculateTotalDuration(itinerary: ItineraryDay[]): number {
  return itinerary.reduce((total, day) => {
    const dayDuration = day.stops?.reduce(
      (sum, stop) => sum + (stop.durationMinutes || 30),
      0,
    ) || 0;
    return total + dayDuration;
  }, 0);
}

/**
 * Calculate total trip cost from itinerary
 */
export function calculateTotalCost(itinerary: ItineraryDay[]): number {
  return itinerary.reduce((total, day) => {
    const dayCost = day.stops?.reduce((sum, stop) => sum + (stop.cost || 0), 0) || 0;
    return total + dayCost;
  }, 0);
}

/**
 * Get suggested stops near a coordinate
 */
export function getSuggestedStops(
  _latitude: number,
  _longitude: number,
  _radius: number = 5000, // 5km default
): Array<{ name: string; latitude: number; longitude: number; category: string }> {
  return [];
}
