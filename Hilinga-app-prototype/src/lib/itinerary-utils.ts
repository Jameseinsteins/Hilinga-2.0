/**
 * Itinerary Utilities - Stop insertion, time recalculation, and conflict detection
 * Handles mid-itinerary stop insertion with automatic time/distance recalculation
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ItineraryStop {
  id: string;
  time: string; // HH:MM format
  title: string;
  note: string;
  icon: string;
  location: {
    latitude: number;
    longitude: number;
  };
  duration?: number; // minutes
  price?: number;
  category?: string;
  tags?: string[];
  businessId?: string;
  status?: 'pending' | 'arrived' | 'completed' | 'skipped';
}

export interface ItineraryDay {
  day: number;
  title: string;
  stops: ItineraryStop[];
  totalDuration?: number; // minutes
  totalPrice?: number;
  status?: 'planned' | 'in_progress' | 'completed';
  createdAt?: number;
  updatedAt?: number;
}

export type InsertionMode = 'before' | 'after' | 'at_time';

export interface InsertionResult {
  success: boolean;
  updatedDay?: ItineraryDay;
  error?: string;
  warnings?: string[];
}

// ============================================================================
// Constants
// ============================================================================

const TRAVEL_TIME_PER_KM = 1; // minutes per km (adjustable for mode of transport)
const EARTH_RADIUS_KM = 6371;
const DEFAULT_STOP_DURATION = 60; // minutes

// ============================================================================
// Distance Calculation (Haversine Formula)
// ============================================================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// ============================================================================
// Time Utilities
// ============================================================================

/**
 * Convert HH:MM time string to minutes since midnight
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

/**
 * Convert minutes since midnight to HH:MM time string
 */
export function minutesToTimeString(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Parse time string and return a Date object for comparison
 */
export function parseTimeString(time: string, date: Date = new Date()): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours || 0, minutes || 0, 0, 0);
  return result;
}

// ============================================================================
// Stop Insertion
// ============================================================================

/**
 * Insert a new stop into an itinerary day
 * Automatically recalculates times for all subsequent stops
 */
export function insertStopAtPosition(
  day: ItineraryDay,
  newStop: Omit<ItineraryStop, 'id'>,
  position: number,
  mode: InsertionMode = 'after'
): InsertionResult {
  try {
    // Validate position
    if (position < 0 || position > day.stops.length) {
      return {
        success: false,
        error: `Invalid insertion position: ${position}. Must be between 0 and ${day.stops.length}`,
      };
    }

    // Calculate actual insertion index
    let insertIndex = position;
    if (mode === 'after' && position < day.stops.length) {
      insertIndex = position + 1;
    }

    // Generate unique ID
    const stopId = `stop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create new stop with ID and defaults
    const stopWithId: ItineraryStop = {
      ...newStop,
      id: stopId,
      duration: newStop.duration || DEFAULT_STOP_DURATION,
      status: 'pending',
    };

    // Insert stop into array
    const stopsWithNew = [
      ...day.stops.slice(0, insertIndex),
      stopWithId,
      ...day.stops.slice(insertIndex),
    ];

    // Recalculate times for all stops
    const recalculatedStops = recalculateDayMetrics(stopsWithNew, day.stops[0]?.time);

    // Create updated day
    const updatedDay: ItineraryDay = {
      ...day,
      stops: recalculatedStops,
      totalDuration: calculateDayDuration(recalculatedStops),
      totalPrice: calculateDayPrice(recalculatedStops),
      updatedAt: Date.now(),
    };

    return {
      success: true,
      updatedDay,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to insert stop',
    };
  }
}

/**
 * Insert stop at specific time
 */
export function insertStopAtTime(
  day: ItineraryDay,
  newStop: Omit<ItineraryStop, 'id'>,
  targetTime: string
): InsertionResult {
  try {
    // Find position to insert at target time
    const targetMinutes = timeToMinutes(targetTime);
    let insertPosition = day.stops.length;

    for (let i = 0; i < day.stops.length; i++) {
      const stopMinutes = timeToMinutes(day.stops[i].time);
      if (stopMinutes >= targetMinutes) {
        insertPosition = i;
        break;
      }
    }

    // Set the new stop's time to target
    const stopWithTime: typeof newStop = {
      ...newStop,
      time: targetTime,
    };

    return insertStopAtPosition(day, stopWithTime, insertPosition, 'before');
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to insert stop at time',
    };
  }
}

// ============================================================================
// Metrics Recalculation
// ============================================================================

/**
 * Recalculate all times in a day based on durations and distances
 */
export function recalculateDayMetrics(
  stops: ItineraryStop[],
  dayStartTime: string = '09:00'
): ItineraryStop[] {
  if (stops.length === 0) return [];

  const recalculated: ItineraryStop[] = [];
  let cumulativeMinutes = timeToMinutes(dayStartTime);

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];

    if (i === 0) {
      // First stop keeps its original time (or calculated start)
      recalculated.push({
        ...stop,
        time: dayStartTime,
      });

      cumulativeMinutes += stop.duration || DEFAULT_STOP_DURATION;
    } else {
      const prevStop = stops[i - 1];

      // Calculate travel time from previous stop
      const distanceKm = calculateDistance(
        prevStop.location.latitude,
        prevStop.location.longitude,
        stop.location.latitude,
        stop.location.longitude
      );

      const travelMinutes = Math.ceil(distanceKm * TRAVEL_TIME_PER_KM);

      // Add travel time to cumulative
      cumulativeMinutes += travelMinutes;

      // Set this stop's time
      const stopTime = minutesToTimeString(cumulativeMinutes);

      recalculated.push({
        ...stop,
        time: stopTime,
      });

      // Add this stop's duration for next iteration
      cumulativeMinutes += stop.duration || DEFAULT_STOP_DURATION;
    }
  }

  return recalculated;
}

/**
 * Calculate total duration of a day (in minutes)
 */
export function calculateDayDuration(stops: ItineraryStop[]): number {
  if (stops.length === 0) return 0;

  let totalMinutes = 0;

  // Sum all stop durations
  for (const stop of stops) {
    totalMinutes += stop.duration || DEFAULT_STOP_DURATION;
  }

  // Add travel time between consecutive stops
  for (let i = 1; i < stops.length; i++) {
    const prevStop = stops[i - 1];
    const currStop = stops[i];

    const distanceKm = calculateDistance(
      prevStop.location.latitude,
      prevStop.location.longitude,
      currStop.location.latitude,
      currStop.location.longitude
    );

    totalMinutes += Math.ceil(distanceKm * TRAVEL_TIME_PER_KM);
  }

  return totalMinutes;
}

/**
 * Calculate total price of a day
 */
export function calculateDayPrice(stops: ItineraryStop[]): number {
  return stops.reduce((sum, stop) => sum + (stop.price || 0), 0);
}

// ============================================================================
// Conflict Detection
// ============================================================================

/**
 * Check if new stop is a duplicate of existing stops
 */
export function isDuplicateStop(
  newStop: ItineraryStop,
  existingStops: ItineraryStop[],
  toleranceMeters: number = 50
): boolean {
  for (const existing of existingStops) {
    const distance = calculateDistance(
      newStop.location.latitude,
      newStop.location.longitude,
      existing.location.latitude,
      existing.location.longitude
    );

    const distanceMeters = distance * 1000;

    // Check if within tolerance and same title
    if (distanceMeters < toleranceMeters && existing.title === newStop.title) {
      return true;
    }
  }

  return false;
}

/**
 * Validate that times don't overlap
 */
export function validateNoTimeOverlap(stops: ItineraryStop[]): { valid: boolean; error?: string } {
  for (let i = 1; i < stops.length; i++) {
    const prevTime = timeToMinutes(stops[i - 1].time);
    const currTime = timeToMinutes(stops[i].time);

    if (currTime <= prevTime) {
      return {
        valid: false,
        error: `Time conflict: stop ${i} at ${stops[i].time} overlaps with stop ${i - 1} at ${stops[i - 1].time}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Check if new stop is near other stops in the day
 */
export function checkRouteProximity(
  newStop: ItineraryStop,
  day: ItineraryDay,
  maxDistanceKm: number = 50
): { valid: boolean; warning?: string } {
  if (day.stops.length === 0) {
    return { valid: true };
  }

  const nearestDistance = Math.min(
    ...day.stops.map(stop =>
      calculateDistance(
        newStop.location.latitude,
        newStop.location.longitude,
        stop.location.latitude,
        stop.location.longitude
      )
    )
  );

  if (nearestDistance > maxDistanceKm) {
    return {
      valid: true,
      warning: `New stop is ${nearestDistance.toFixed(1)}km from nearest stop in day. Check if location is correct.`,
    };
  }

  return { valid: true };
}

/**
 * Comprehensive validation before insertion
 */
export function validateStopInsertion(
  newStop: ItineraryStop,
  day: ItineraryDay,
  position: number
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check position validity
  if (position < 0 || position > day.stops.length) {
    errors.push(`Invalid position: ${position}`);
  }

  // Check title
  if (!newStop.title || newStop.title.trim().length === 0) {
    errors.push('Stop title cannot be empty');
  }

  // Check location
  if (!newStop.location || isNaN(newStop.location.latitude) || isNaN(newStop.location.longitude)) {
    errors.push('Invalid location coordinates');
  }

  // Check for duplicates
  if (isDuplicateStop(newStop, day.stops)) {
    warnings.push(`This stop appears to be a duplicate of an existing stop`);
  }

  // Check route proximity
  const proximityCheck = checkRouteProximity(newStop, day);
  if (proximityCheck.warning) {
    warnings.push(proximityCheck.warning);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Stop Removal & Reordering
// ============================================================================

/**
 * Remove a stop from itinerary
 */
export function removeStopFromDay(
  day: ItineraryDay,
  stopIndex: number
): InsertionResult {
  try {
    if (stopIndex < 0 || stopIndex >= day.stops.length) {
      return {
        success: false,
        error: `Invalid stop index: ${stopIndex}`,
      };
    }

    // Remove stop
    const stopsAfterRemoval = [
      ...day.stops.slice(0, stopIndex),
      ...day.stops.slice(stopIndex + 1),
    ];

    // Recalculate metrics
    const recalculatedStops = recalculateDayMetrics(stopsAfterRemoval, day.stops[0]?.time);

    const updatedDay: ItineraryDay = {
      ...day,
      stops: recalculatedStops,
      totalDuration: calculateDayDuration(recalculatedStops),
      totalPrice: calculateDayPrice(recalculatedStops),
      updatedAt: Date.now(),
    };

    return {
      success: true,
      updatedDay,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to remove stop',
    };
  }
}

/**
 * Reorder stops by drag-and-drop
 */
export function reorderStops(
  day: ItineraryDay,
  fromIndex: number,
  toIndex: number
): InsertionResult {
  try {
    if (
      fromIndex < 0 ||
      fromIndex >= day.stops.length ||
      toIndex < 0 ||
      toIndex >= day.stops.length
    ) {
      return {
        success: false,
        error: 'Invalid stop indices',
      };
    }

    const stops = [...day.stops];
    const [movedStop] = stops.splice(fromIndex, 1);
    stops.splice(toIndex, 0, movedStop);

    // Recalculate metrics
    const recalculatedStops = recalculateDayMetrics(stops, day.stops[0]?.time);

    const updatedDay: ItineraryDay = {
      ...day,
      stops: recalculatedStops,
      totalDuration: calculateDayDuration(recalculatedStops),
      totalPrice: calculateDayPrice(recalculatedStops),
      updatedAt: Date.now(),
    };

    return {
      success: true,
      updatedDay,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to reorder stops',
    };
  }
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Insert multiple stops at once
 */
export function insertMultipleStops(
  day: ItineraryDay,
  newStops: Array<{ stop: Omit<ItineraryStop, 'id'>; position: number }>,
  mode: InsertionMode = 'after'
): InsertionResult {
  try {
    let currentDay = day;

    // Sort by position to insert in correct order
    const sorted = newStops.sort((a, b) => a.position - b.position);

    for (let i = 0; i < sorted.length; i++) {
      const result = insertStopAtPosition(
        currentDay,
        sorted[i].stop,
        sorted[i].position + i, // Adjust position for previously inserted stops
        mode
      );

      if (!result.success || !result.updatedDay) {
        return result;
      }

      currentDay = result.updatedDay;
    }

    return {
      success: true,
      updatedDay: currentDay,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to insert multiple stops',
    };
  }
}

// ============================================================================
// Export Utilities for Testing
// ============================================================================

export const ItineraryUtils = {
  calculateDistance,
  timeToMinutes,
  minutesToTimeString,
  parseTimeString,
  insertStopAtPosition,
  insertStopAtTime,
  recalculateDayMetrics,
  calculateDayDuration,
  calculateDayPrice,
  isDuplicateStop,
  validateNoTimeOverlap,
  checkRouteProximity,
  validateStopInsertion,
  removeStopFromDay,
  reorderStops,
  insertMultipleStops,
};
