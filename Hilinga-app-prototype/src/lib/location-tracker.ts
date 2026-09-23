/**
 * Location Tracking System
 * Tracks user location and automatically advances itinerary stops
 */

import type {
  BookingWithTracking,
  LocationTracker,
  UserTrackingStatus,
} from "@/lib/payment-system";
import type { ItineraryDay } from "@/lib/database";
import { canTransitionTrackingStatus } from "@/lib/payment-system";

interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
}

interface TrackingSession {
  bookingId: string;
  userId: string;
  isActive: boolean;
  currentLocation?: GeoLocation;
  currentStopIndex: number;
  trackingStatus: UserTrackingStatus;
  startedAt: string;
  lastUpdate: string;
  watchId?: number;
}

const TRACKING_SESSIONS = new Map<string, TrackingSession>();
const LOCATION_CACHE = new Map<string, GeoLocation[]>();
const PROXIMITY_THRESHOLD_METERS = 100;
export const LOCATION_UPDATE_INTERVAL_MS = 10000;

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Request location permission from user
 */
async function requestLocationPermission(): Promise<boolean> {
  try {
    if (!navigator.permissions?.query) return true;
    const result = await navigator.permissions.query({ name: "geolocation" });
    return result.state !== "denied";
  } catch {
    return true;
  }
}

/**
 * Get current device location
 */
function getCurrentLocation(): Promise<GeoLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    const timeout = setTimeout(
      () => reject(new Error("Location request timeout")),
      15000,
    );

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeout);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date().toISOString(),
        });
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  });
}

/**
 * Watch position continuously
 */
function watchPosition(
  onUpdate: (location: GeoLocation) => void,
  onError: (error: GeolocationPositionError) => void,
): number {
  return navigator.geolocation.watchPosition(
    (position) => {
      onUpdate({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: new Date().toISOString(),
      });
    },
    onError,
    {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 5000,
    },
  );
}

/**
 * Extract coordinates from stop title or notes
 * Format: "latitude,longitude" or "Stop Name (lat,lon)"
 */
function extractStopCoordinates(stop: ItineraryDay): { lat: number; lon: number } | null {
  const coordPattern = /(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/;
  const match = stop.title.match(coordPattern) || (stop.stops[0]?.note?.match?.(coordPattern));

  if (match) {
    return {
      lat: parseFloat(match[1]),
      lon: parseFloat(match[2]),
    };
  }

  return null;
}

/**
 * Create location tracker instance
 */
export function createLocationTracker(_db: IDBDatabase): LocationTracker {
  return {
    async startTracking(bookingId: string, userId: string): Promise<void> {
      const sessionId = `${userId}-${bookingId}`;

      if (TRACKING_SESSIONS.has(sessionId)) {
        const existing = TRACKING_SESSIONS.get(sessionId)!;
        if (existing.isActive) return;
        existing.isActive = true;
        return;
      }

      const canTrack = await requestLocationPermission();
      if (!canTrack) {
        throw new Error("Location permission denied");
      }

      const now = new Date().toISOString();
      const session: TrackingSession = {
        bookingId,
        userId,
        isActive: true,
        currentStopIndex: 0,
        trackingStatus: "not_started",
        startedAt: now,
        lastUpdate: now,
      };

      try {
        const initialLocation = await getCurrentLocation();
        session.currentLocation = initialLocation;
        LOCATION_CACHE.set(sessionId, [initialLocation]);
      } catch (error) {
        console.warn("Failed to get initial location:", error);
      }

      // Start watching position
      try {
        const watchId = watchPosition(
          (location) => {
            session.currentLocation = location;
            session.lastUpdate = new Date().toISOString();

            const cache = LOCATION_CACHE.get(sessionId) || [];
            cache.push(location);
            if (cache.length > 100) cache.shift();
            LOCATION_CACHE.set(sessionId, cache);
          },
          (error) => {
            console.warn("Location tracking error:", error);
          },
        );
        session.watchId = watchId;
      } catch (error) {
        console.warn("Failed to watch position:", error);
      }

      TRACKING_SESSIONS.set(sessionId, session);
    },

    async stopTracking(bookingId: string): Promise<void> {
      const sessions = Array.from(TRACKING_SESSIONS.entries());
      const [, session] = sessions.find(([id]) => id.includes(bookingId)) || [];

      if (!session) return;

      if (session.watchId !== undefined) {
        navigator.geolocation.clearWatch(session.watchId);
      }

      session.isActive = false;
    },

    async updateLocation(bookingId: string, latitude: number, longitude: number): Promise<UserTrackingStatus> {
      const sessions = Array.from(TRACKING_SESSIONS.entries());
      const [sessionId, session] = sessions.find(([id]) => id.includes(bookingId)) || [];

      if (!sessionId || !session) {
        throw new Error("Tracking session not found");
      }

      session.currentLocation = {
        latitude,
        longitude,
        accuracy: 0,
        timestamp: new Date().toISOString(),
      };
      session.lastUpdate = new Date().toISOString();

      const cache = LOCATION_CACHE.get(sessionId) || [];
      cache.push(session.currentLocation);
      if (cache.length > 100) cache.shift();
      LOCATION_CACHE.set(sessionId, cache);

      return session.trackingStatus;
    },

    async getTrackingStatus(bookingId: string): Promise<BookingWithTracking> {
      const sessions = Array.from(TRACKING_SESSIONS.entries());
      const [, session] = sessions.find(([id]) => id.includes(bookingId)) || [];

      if (!session) {
        throw new Error("Tracking session not found");
      }

      return {
        id: bookingId,
        userId: session.userId,
        tripPlanId: "",
        status: "in_progress",
        participants: 0,
        startDate: session.startedAt,
        endDate: "",
        pricing: { basePrice: 0, taxes: 0, fees: 0, total: 0, currencyCode: "USD", breakdown: [] },
        paymentStatus: "completed",
        confirmationNumber: "",
        createdAt: session.startedAt,
        updatedAt: session.lastUpdate,
        trackingStatus: session.trackingStatus,
        currentStop: session.currentStopIndex,
        estimatedArrival: undefined,
        lastLocationUpdate: session.currentLocation?.timestamp,
      };
    },

    async checkProximity(
      bookingId: string,
      _stopIndex: number,
      latitude: number,
      longitude: number,
      radiusMeters: number = PROXIMITY_THRESHOLD_METERS,
    ): Promise<boolean> {
      const sessions = Array.from(TRACKING_SESSIONS.entries());
      const [, session] = sessions.find(([id]) => id.includes(bookingId)) || [];

      if (!session?.currentLocation) {
        return false;
      }

      const distance = calculateDistance(
        session.currentLocation.latitude,
        session.currentLocation.longitude,
        latitude,
        longitude,
      );

      return distance <= radiusMeters;
    },

    async advanceToNextStop(bookingId: string): Promise<number> {
      const sessions = Array.from(TRACKING_SESSIONS.entries());
      const [, session] = sessions.find(([id]) => id.includes(bookingId)) || [];

      if (!session) {
        throw new Error("Tracking session not found");
      }

      const newStatus = "departed" as UserTrackingStatus;
      if (canTransitionTrackingStatus(session.trackingStatus, newStatus)) {
        session.trackingStatus = newStatus;
      }

      session.currentStopIndex += 1;
      session.lastUpdate = new Date().toISOString();

      return session.currentStopIndex;
    },

    async getCurrentStop(bookingId: string): Promise<number | null> {
      const sessions = Array.from(TRACKING_SESSIONS.entries());
      const [, session] = sessions.find(([id]) => id.includes(bookingId)) || [];

      return session?.currentStopIndex ?? null;
    },
  };
}

/**
 * Proximity monitor for automatic stop transitions
 */
export function createProximityMonitor(tracker: LocationTracker, itinerary: ItineraryDay[]) {
  return {
    async monitorStop(
      bookingId: string,
      stopIndex: number,
      radiusMeters: number = PROXIMITY_THRESHOLD_METERS,
    ): Promise<void> {
      if (stopIndex >= itinerary.length) return;

      const stop = itinerary[stopIndex];
      const coords = extractStopCoordinates(stop);

      if (!coords) {
        console.warn("Stop coordinates not found for:", stop.title);
        return;
      }

      const isNear = await tracker.checkProximity(
        bookingId,
        stopIndex,
        coords.lat,
        coords.lon,
        radiusMeters,
      );

      if (isNear) {
        const nextStop = await tracker.advanceToNextStop(bookingId);
        console.log(
          `Automatically advanced from stop ${stopIndex} to ${nextStop}`,
        );
      }
    },

    async startMonitoring(bookingId: string): Promise<void> {
      const monitoringInterval = setInterval(async () => {
        try {
          const current = await tracker.getCurrentStop(bookingId);
          if (current !== null && current < itinerary.length) {
            await this.monitorStop(bookingId, current);
          }
        } catch (error) {
          console.error("Monitoring error:", error);
          clearInterval(monitoringInterval);
        }
      }, 5000);
    },
  };
}

/**
 * Geofence utility for managing multiple stops
 */
export function createGeofence() {
  const geofences = new Map<string, { lat: number; lon: number; radius: number }>();

  return {
    addGeofence(id: string, lat: number, lon: number, radius: number): void {
      geofences.set(id, { lat, lon, radius });
    },

    removeGeofence(id: string): void {
      geofences.delete(id);
    },

    checkGeofences(latitude: number, longitude: number): string[] {
      const within: string[] = [];

      geofences.forEach((fence, id) => {
        const distance = calculateDistance(latitude, longitude, fence.lat, fence.lon);
        if (distance <= fence.radius) {
          within.push(id);
        }
      });

      return within;
    },

    getGeofence(id: string) {
      return geofences.get(id);
    },

    getAllGeofences() {
      return Array.from(geofences.entries());
    },
  };
}
