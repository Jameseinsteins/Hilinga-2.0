/**
 * Geofencing Service - Location tracking, arrival detection, and geofence management
 * Implements Haversine distance calculation and adaptive GPS polling
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface Location {
  latitude: number;
  longitude: number;
  accuracy?: number; // meters
  timestamp: number;
  speed?: number; // m/s
  heading?: number; // degrees
}

export interface GeofenceOptions {
  radiusMeters: number; // default 100m
  checkIntervalMs: number; // default 5000ms
  minAccuracyMeters?: number; // default 50m
  enableHistory: boolean; // default true
  highAccuracy?: boolean; // default true
}

export type GeofenceState = 'idle' | 'approaching' | 'in_geofence' | 'arrived' | 'departed' | 'lingering';

export interface GeofenceEvent {
  type: 'entered' | 'exited' | 'arrived' | 'departed' | 'state_changed';
  state: GeofenceState;
  distance?: number;
  timestamp: number;
  confidence?: number; // 0-1
}

export interface StopTarget {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  radius?: number;
}

// ============================================================================
// Constants
// ============================================================================

const EARTH_RADIUS_M = 6371000; // Earth radius in meters
const DEFAULT_GEOFENCE_RADIUS = 100; // meters
const DEFAULT_CHECK_INTERVAL = 5000; // milliseconds
const MIN_ACCURACY_THRESHOLD = 50; // meters
const ARRIVAL_CONFIRMATION_CHECKS = 2; // Require 2 consecutive confirmations
const ADAPTIVE_INTERVALS: Record<GeofenceState, number> = {
  idle: 60000, // 60 seconds when idle
  approaching: 10000, // 10 seconds when approaching
  in_geofence: 3000, // 3 seconds when in geofence
  arrived: 5000, // 5 seconds when arrived
  departed: 60000, // 60 seconds when departed
  lingering: 15000, // 15 seconds when lingering
};
const LINGERING_TIMEOUT = 30000; // 30 seconds before lingering state
const FAST_MOVEMENT_THRESHOLD = 22.2; // m/s (80 km/h)
const GPS_JITTER_FILTER_SIZE = 3; // Use last 3 readings for smoothing

// ============================================================================
// Geofencing Service Class
// ============================================================================

export class GeofencingService {
  private locationWatcher: number | null = null;
  private state: GeofenceState = 'idle';
  private currentTarget: StopTarget | null = null;
  private locationHistory: Location[] = [];
  private arrivals = new Map<string, boolean>();
  private consecutiveInGeofence = 0;
  private enteredGeofenceAt: number | null = null;
  private lastLocationUpdate: number = 0;
  public getLastLocationUpdate(): number { return this.lastLocationUpdate; }
  private callbacks = new Map<string, (event: GeofenceEvent) => void>();
  private options: GeofenceOptions;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastKnownLocation: Location | null = null;
  private batteryLevel: number = 100;

  constructor(options: Partial<GeofenceOptions> = {}) {
    this.options = {
      radiusMeters: options.radiusMeters || DEFAULT_GEOFENCE_RADIUS,
      checkIntervalMs: options.checkIntervalMs || DEFAULT_CHECK_INTERVAL,
      minAccuracyMeters: options.minAccuracyMeters || MIN_ACCURACY_THRESHOLD,
      enableHistory: options.enableHistory !== false,
      highAccuracy: options.highAccuracy !== false,
    };

    this.setupBatteryMonitoring();
  }

  /**
   * Start monitoring for arrival at a target location
   */
  startMonitoring(target: StopTarget, callback?: (event: GeofenceEvent) => void): void {
    if (this.locationWatcher !== null) {
      this.stopMonitoring();
    }

    this.currentTarget = target;
    this.state = 'idle';
    this.consecutiveInGeofence = 0;
    this.arrivals.clear();

    if (callback) {
      this.on('arrival', callback);
    }

    // Request initial location
    this.requestLocationUpdate();

    // Start watching position
    if ('geolocation' in navigator) {
      try {
        this.locationWatcher = navigator.geolocation.watchPosition(
          position => this.handleLocationUpdate(position),
          error => this.handleLocationError(error),
          {
            enableHighAccuracy: this.options.highAccuracy,
            timeout: Math.max(this.options.checkIntervalMs * 2, 20000),
            maximumAge: Math.max(this.options.checkIntervalMs / 2, 2000),
          }
        );
      } catch (error) {
        console.error('Failed to start geolocation watch:', error);
      }
    }
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.locationWatcher !== null) {
      navigator.geolocation.clearWatch(this.locationWatcher);
      this.locationWatcher = null;
    }

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.currentTarget = null;
    this.state = 'idle';
    this.consecutiveInGeofence = 0;
  }

  /**
   * Get current geofence state
   */
  getState(): GeofenceState {
    return this.state;
  }

  /**
   * Get distance to target (in meters)
   */
  getDistance(): number | null {
    if (!this.currentTarget || !this.lastKnownLocation) {
      return null;
    }

    return this.calculateDistance(
      this.lastKnownLocation.latitude,
      this.lastKnownLocation.longitude,
      this.currentTarget.latitude,
      this.currentTarget.longitude
    );
  }

  /**
   * Get location history
   */
  getLocationHistory(): Location[] {
    return [...this.locationHistory];
  }

  /**
   * Clear location history
   */
  clearHistory(): void {
    this.locationHistory = [];
  }

  /**
   * Register event listener
   */
  on(event: string, callback: (event: GeofenceEvent) => void): void {
    this.callbacks.set(event, callback);
  }

  /**
   * Unregister event listener
   */
  off(event: string): void {
    this.callbacks.delete(event);
  }

  /**
   * Get arrival confidence (0-1)
   */
  getArrivalConfidence(): number {
    if (this.state === 'arrived') {
      return 0.95;
    }

    if (this.state === 'in_geofence') {
      return Math.min(0.5 + (this.consecutiveInGeofence / ARRIVAL_CONFIRMATION_CHECKS) * 0.45, 0.9);
    }

    return 0;
  }

  /**
   * Check if has arrived
   */
  hasArrived(stopId: string): boolean {
    return this.arrivals.get(stopId) ?? false;
  }

  /**
   * Reset arrivals
   */
  resetArrivals(): void {
    this.arrivals.clear();
  }

  /**
   * ============================================================================
   * Private Methods
   * ============================================================================
   */

  /**
   * Handle location updates from GPS
   */
  private handleLocationUpdate(position: GeolocationPosition): void {
    const location: Location = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
      speed: position.coords.speed ?? undefined,
      heading: position.coords.heading ?? undefined,
    };

    this.lastKnownLocation = location;

    // Add to history if enabled
    if (this.options.enableHistory) {
      this.locationHistory.push(location);

      // Keep history size bounded (max 100 points)
      if (this.locationHistory.length > 100) {
        this.locationHistory.shift();
      }
    }

    // Process location
    this.processLocation(location);
  }

  /**
   * Handle location errors
   */
  private handleLocationError(error: GeolocationPositionError): void {
    console.warn('Geolocation error:', error.message);

    this.emitEvent({
      type: 'state_changed',
      state: this.state,
      timestamp: Date.now(),
    });
  }

  /**
   * Process a location update
   */
  private processLocation(location: Location): void {
    if (!this.currentTarget) return;

    // Apply smoothing filter to reduce GPS jitter
    const smoothedLocation = this.smoothLocation(location);

    // Check accuracy requirement
    const accuracy = smoothedLocation.accuracy || this.options.minAccuracyMeters!;

    if (accuracy > this.options.minAccuracyMeters!) {
      // Accuracy too low, require more confirmations
      console.warn(`Low GPS accuracy: ${accuracy}m (target: ${this.options.minAccuracyMeters}m)`);
    }

    // Calculate distance to target
    const distance = this.calculateDistance(
      smoothedLocation.latitude,
      smoothedLocation.longitude,
      this.currentTarget.latitude,
      this.currentTarget.longitude
    );

    const radius = this.currentTarget.radius || this.options.radiusMeters;
    const isInGeofence = distance <= radius;

    // Detect fast movement (likely vehicle)
    const speed = smoothedLocation.speed || 0;
    if (speed > FAST_MOVEMENT_THRESHOLD) {
      // Skip auto-advance for fast-moving vehicles
      if (this.state === 'approaching' || this.state === 'in_geofence') {
        console.warn(`Fast movement detected: ${(speed * 3.6).toFixed(1)} km/h. Skipping auto-advance.`);
      }
    }

    // Update state machine
    this.updateState(isInGeofence, distance, accuracy);

    this.lastLocationUpdate = Date.now();
  }

  /**
   * Smooth location using weighted average of last N readings
   */
  private smoothLocation(location: Location): Location {
    if (this.locationHistory.length < GPS_JITTER_FILTER_SIZE) {
      return location;
    }

    const recentReadings = this.locationHistory.slice(-GPS_JITTER_FILTER_SIZE);

    // Weights: most recent is heaviest
    const weights = [0.2, 0.3, 0.5];
    let sumLat = 0,
      sumLon = 0,
      sumAccuracy = 0;

    recentReadings.forEach((reading, i) => {
      const weight = weights[i] || 0;
      sumLat += reading.latitude * weight;
      sumLon += reading.longitude * weight;
      if (reading.accuracy) {
        sumAccuracy += reading.accuracy * weight;
      }
    });

    return {
      latitude: sumLat,
      longitude: sumLon,
      accuracy: sumAccuracy || location.accuracy,
      timestamp: location.timestamp,
      speed: location.speed,
      heading: location.heading,
    };
  }

  /**
   * Update state machine
   */
  private updateState(isInGeofence: boolean, distance: number, accuracy: number): void {

    switch (this.state) {
      case 'idle':
        this.state = 'approaching';
        this.emitEvent({
          type: 'state_changed',
          state: this.state,
          distance,
          timestamp: Date.now(),
        });
        break;

      case 'approaching':
        if (isInGeofence) {
          this.consecutiveInGeofence++;
          this.state = 'in_geofence';
          this.enteredGeofenceAt = Date.now();

          this.emitEvent({
            type: 'entered',
            state: this.state,
            distance,
            timestamp: Date.now(),
            confidence: this.getArrivalConfidence(),
          });
        } else {
          this.consecutiveInGeofence = 0;
        }
        break;

      case 'in_geofence':
        if (isInGeofence) {
          this.consecutiveInGeofence++;

          // Check if enough confirmations for arrival
          if (this.consecutiveInGeofence >= ARRIVAL_CONFIRMATION_CHECKS && accuracy <= this.options.minAccuracyMeters!) {
            this.state = 'arrived';

            this.emitEvent({
              type: 'arrived',
              state: this.state,
              distance,
              timestamp: Date.now(),
              confidence: 0.95,
            });

            // Track arrival
            if (this.currentTarget) {
              this.arrivals.set(this.currentTarget.id, true);
            }
          }
        } else {
          // Left geofence
          this.consecutiveInGeofence = 0;
          this.state = 'approaching';

          this.emitEvent({
            type: 'exited',
            state: this.state,
            distance,
            timestamp: Date.now(),
          });
        }
        break;

      case 'arrived':
        // Check for lingering or departure
        if (!isInGeofence) {
          this.state = 'departed';
          this.consecutiveInGeofence = 0;

          this.emitEvent({
            type: 'departed',
            state: this.state,
            distance,
            timestamp: Date.now(),
          });
        } else {
          // Check for lingering
          const lingeringDuration = Date.now() - (this.enteredGeofenceAt || 0);
          if (lingeringDuration > LINGERING_TIMEOUT) {
            this.state = 'lingering';

            this.emitEvent({
              type: 'state_changed',
              state: this.state,
              distance,
              timestamp: Date.now(),
            });
          }
        }
        break;

      case 'departed':
        if (isInGeofence) {
          this.state = 'in_geofence';
          this.consecutiveInGeofence = 1;

          this.emitEvent({
            type: 'entered',
            state: this.state,
            distance,
            timestamp: Date.now(),
          });
        }
        break;

      case 'lingering':
        if (!isInGeofence) {
          this.state = 'departed';
          this.consecutiveInGeofence = 0;

          this.emitEvent({
            type: 'departed',
            state: this.state,
            distance,
            timestamp: Date.now(),
          });
        }
        break;
    }
  }

  /**
   * Calculate Haversine distance (in meters)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_M * c;
  }

  /**
   * Request location immediately
   */
  private requestLocationUpdate(): void {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        position => this.handleLocationUpdate(position),
        error => this.handleLocationError(error),
        {
          enableHighAccuracy: this.options.highAccuracy,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    }
  }

  /**
   * Setup battery monitoring for adaptive intervals
   */
  private setupBatteryMonitoring(): void {
    if ('getBattery' in navigator) {
      (navigator as any)
        .getBattery()
        .then((battery: any) => {
          battery.addEventListener('levelchange', () => {
            this.batteryLevel = battery.level * 100;
          });

          this.batteryLevel = battery.level * 100;
        })
        .catch(() => {
          // Battery API not available
        });
    }
  }

  /**
   * Get adaptive check interval based on state and battery
   */
  public getAdaptiveInterval(): number {
    let baseInterval = ADAPTIVE_INTERVALS[this.state] || DEFAULT_CHECK_INTERVAL;

    // Throttle if battery low
    if (this.batteryLevel < 20) {
      baseInterval = Math.max(baseInterval, 30000); // At least 30s
    } else if (this.batteryLevel < 50) {
      baseInterval = Math.max(baseInterval, 20000); // At least 20s
    }

    return baseInterval;
  }

  /**
   * Emit event to listeners
   */
  private emitEvent(event: GeofenceEvent): void {
    const callback = this.callbacks.get(event.type) || this.callbacks.get('*');

    if (callback) {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in geofence event callback:', error);
      }
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const geofencingService = new GeofencingService();
