/**
 * useArrivalDetection Hook - Manages arrival detection, auto-advance, and location tracking
 * Integrates geofencing service with auto-advance countdown and state management
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { GeofencingService } from '@/lib/geofencing-service';
import type { GeofenceEvent, StopTarget, GeofenceOptions } from '@/lib/geofencing-service';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type UserTrackingStatus = 'not_started' | 'arriving' | 'arrived' | 'departed';

export interface ArrivalDetectionState {
  isTracking: boolean;
  trackingStatus: UserTrackingStatus;
  currentStopId: string | null;
  distance: number | null;
  accuracy: number | null;
  lastLocationUpdate: number | null;
  arrivedAt: number | null;
  autoAdvanceCountdown: number; // seconds
  autoAdvanceEnabled: boolean;
  confidence: number; // 0-1
  isOffline: boolean;
}

export interface ArrivalDetectionActions {
  startTracking: (target: StopTarget, options?: Partial<GeofenceOptions>) => void;
  stopTracking: () => void;
  markAsArrived: () => void;
  skipStop: () => void;
  cancelCountdown: () => void;
  setAutoAdvanceEnabled: (enabled: boolean) => void;
  adjustGeofenceRadius: (radiusMeters: number) => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: ArrivalDetectionState = {
  isTracking: false,
  trackingStatus: 'not_started',
  currentStopId: null,
  distance: null,
  accuracy: null,
  lastLocationUpdate: null,
  arrivedAt: null,
  autoAdvanceCountdown: 0,
  autoAdvanceEnabled: true,
  confidence: 0,
  isOffline: !navigator.onLine,
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function useArrivalDetection(
  onArrival?: (stopId: string) => void,
  defaultOptions?: Partial<GeofenceOptions>
): [ArrivalDetectionState, ArrivalDetectionActions] {
  const [state, setState] = useState<ArrivalDetectionState>(initialState);
  const geofenceRef = useRef<GeofencingService | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const countdownSecondsRef = useRef(0);
  const targetRef = useRef<StopTarget | null>(null);

  /**
   * Start tracking for arrival
   */
  const startTracking = useCallback(
    (target: StopTarget, options?: Partial<GeofenceOptions>) => {
      // Stop previous tracking
      if (geofenceRef.current) {
        geofenceRef.current.stopMonitoring();
      }

      // Create geofencing service
      const defaultOpts: Partial<GeofenceOptions> = {
        radiusMeters: 100,
        checkIntervalMs: 5000,
        minAccuracyMeters: 50,
        enableHistory: true,
        highAccuracy: true,
        ...defaultOptions,
        ...options,
      };

      geofenceRef.current = new GeofencingService(defaultOpts);
      targetRef.current = target;

      setState(prev => ({
        ...prev,
        isTracking: true,
        trackingStatus: 'arriving',
        currentStopId: target.id,
        distance: null,
        accuracy: null,
        arrivedAt: null,
        autoAdvanceCountdown: 0,
      }));

      // Setup event handlers
      geofenceRef.current.on('arrived', (event: GeofenceEvent) => {
        setState(prev => ({
          ...prev,
          trackingStatus: 'arrived',
          distance: event.distance || 0,
          arrivedAt: Date.now(),
          confidence: event.confidence || 0.95,
        }));

        // Start auto-advance countdown
        startAutoAdvanceCountdown();

        // Call user's callback
        if (onArrival) {
          onArrival(target.id);
        }
      });

      geofenceRef.current.on('departed', (event: GeofenceEvent) => {
        setState(prev => ({
          ...prev,
          trackingStatus: 'departed',
          distance: event.distance ?? null,
        }));

        // Cancel countdown if departing
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      });

      geofenceRef.current.on('state_changed', (event: GeofenceEvent) => {
        setState(prev => ({
          ...prev,
          distance: event.distance || null,
          confidence: event.confidence || 0,
        }));
      });

      // Start monitoring
      geofenceRef.current.startMonitoring(target);
    },
    [onArrival, defaultOptions]
  );

  /**
   * Stop tracking
   */
  const stopTracking = useCallback(() => {
    if (geofenceRef.current) {
      geofenceRef.current.stopMonitoring();
      geofenceRef.current = null;
    }

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    setState(initialState);
    targetRef.current = null;
  }, []);

  /**
   * Mark as arrived (manual override)
   */
  const markAsArrived = useCallback(() => {
    setState(prev => ({
      ...prev,
      trackingStatus: 'arrived',
      arrivedAt: Date.now(),
      confidence: 0.8, // Lower confidence for manual
    }));

    startAutoAdvanceCountdown();

    if (onArrival && targetRef.current) {
      onArrival(targetRef.current.id);
    }
  }, [onArrival]);

  /**
   * Skip current stop
   */
  const skipStop = useCallback(() => {
    setState(prev => ({
      ...prev,
      trackingStatus: 'departed',
    }));

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    stopTracking();
  }, [stopTracking]);

  /**
   * Cancel auto-advance countdown
   */
  const cancelCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    setState(prev => ({
      ...prev,
      autoAdvanceCountdown: 0,
    }));
  }, []);

  /**
   * Set auto-advance enabled
   */
  const setAutoAdvanceEnabled = useCallback((enabled: boolean) => {
    setState(prev => ({
      ...prev,
      autoAdvanceEnabled: enabled,
    }));

    if (!enabled) {
      cancelCountdown();
    }
  }, [cancelCountdown]);

  /**
   * Adjust geofence radius
   */
  const adjustGeofenceRadius = useCallback((radiusMeters: number) => {
    if (geofenceRef.current) {
      // Recreate service with new radius
      const target = targetRef.current;
      if (target) {
        const options: Partial<GeofenceOptions> = {
          radiusMeters,
          checkIntervalMs: 5000,
          minAccuracyMeters: 50,
          enableHistory: true,
        };

        startTracking(target, options);
      }
    }
  }, [startTracking]);

  /**
   * Start auto-advance countdown (5 seconds)
   */
  const startAutoAdvanceCountdown = () => {
    if (!state.autoAdvanceEnabled) return;

    // Cancel existing countdown
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }

    countdownSecondsRef.current = 5;

    setState(prev => ({
      ...prev,
      autoAdvanceCountdown: 5,
    }));

    countdownRef.current = setInterval(() => {
      countdownSecondsRef.current--;

      if (countdownSecondsRef.current <= 0) {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }

        // Trigger auto-advance
        setState(prev => ({
          ...prev,
          autoAdvanceCountdown: 0,
        }));

        // Call onArrival again to signal auto-advance should happen
        if (onArrival && targetRef.current) {
          onArrival(targetRef.current.id);
        }
      } else {
        setState(prev => ({
          ...prev,
          autoAdvanceCountdown: countdownSecondsRef.current,
        }));
      }
    }, 1000);
  };

  /**
   * Handle online/offline
   */
  useEffect(() => {
    const handleOnline = () => {
      setState(prev => ({
        ...prev,
        isOffline: false,
      }));
    };

    const handleOffline = () => {
      setState(prev => ({
        ...prev,
        isOffline: true,
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  return [
    state,
    {
      startTracking,
      stopTracking,
      markAsArrived,
      skipStop,
      cancelCountdown,
      setAutoAdvanceEnabled,
      adjustGeofenceRadius,
    },
  ];
}

// ============================================================================
// Helper Hook: Location Permissions
// ============================================================================

export interface PermissionState {
  permission: 'granted' | 'denied' | 'prompt' | null;
  hasPermission: boolean;
  isDenied: boolean;
  isPrompting: boolean;
}

export function useLocationPermission(): [PermissionState, () => Promise<boolean>] {
  const [state, setState] = useState<PermissionState>({
    permission: null,
    hasPermission: false,
    isDenied: false,
    isPrompting: false,
  });

  /**
   * Request location permission
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('geolocation' in navigator)) {
      console.error('Geolocation not supported');
      return false;
    }

    setState(prev => ({
      ...prev,
      isPrompting: true,
    }));

    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setState({
            permission: 'granted',
            hasPermission: true,
            isDenied: false,
            isPrompting: false,
          });
          resolve(true);
        },
        error => {
          if (error.code === error.PERMISSION_DENIED) {
            setState({
              permission: 'denied',
              hasPermission: false,
              isDenied: true,
              isPrompting: false,
            });
          } else {
            setState(prev => ({
              ...prev,
              isPrompting: false,
            }));
          }
          resolve(false);
        }
      );
    });
  }, []);

  /**
   * Check current permission on mount
   */
  useEffect(() => {
    if ('permissions' in navigator) {
      (navigator.permissions as any)
        .query({ name: 'geolocation' })
        .then((permissionStatus: any) => {
          setState({
            permission: permissionStatus.state,
            hasPermission: permissionStatus.state === 'granted',
            isDenied: permissionStatus.state === 'denied',
            isPrompting: false,
          });

          // Listen for changes
          permissionStatus.addEventListener('change', () => {
            setState({
              permission: permissionStatus.state,
              hasPermission: permissionStatus.state === 'granted',
              isDenied: permissionStatus.state === 'denied',
              isPrompting: false,
            });
          });
        })
        .catch(() => {
          // Permission API not available
        });
    }
  }, []);

  return [state, requestPermission];
}

// ============================================================================
// Helper Hook: Battery Status
// ============================================================================

export interface BatteryState {
  level: number; // 0-100
  isCharging: boolean;
  chargingTime: number;
  dischargingTime: number;
}

export function useBatteryStatus(): BatteryState {
  const [state, setState] = useState<BatteryState>({
    level: 100,
    isCharging: false,
    chargingTime: 0,
    dischargingTime: 0,
  });

  useEffect(() => {
    if ('getBattery' in navigator) {
      (navigator as any)
        .getBattery()
        .then((battery: any) => {
          const updateBattery = () => {
            setState({
              level: battery.level * 100,
              isCharging: battery.charging,
              chargingTime: battery.chargingTime,
              dischargingTime: battery.dischargingTime,
            });
          };

          updateBattery();

          battery.addEventListener('levelchange', updateBattery);
          battery.addEventListener('chargingchange', updateBattery);
          battery.addEventListener('chargingtimechange', updateBattery);
          battery.addEventListener('dischargingtimechange', updateBattery);

          return () => {
            battery.removeEventListener('levelchange', updateBattery);
            battery.removeEventListener('chargingchange', updateBattery);
            battery.removeEventListener('chargingtimechange', updateBattery);
            battery.removeEventListener('dischargingtimechange', updateBattery);
          };
        })
        .catch(() => {
          // Battery API not available
        });
    }
  }, []);

  return state;
}

// ============================================================================
// Helper Hook: Notification Permission
// ============================================================================

export function useNotificationPermission(): [boolean, () => Promise<boolean>] {
  const [hasPermission, setHasPermission] = useState(
    'Notification' in window && Notification.permission === 'granted'
  );

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      console.error('Notifications not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      setHasPermission(true);
      return true;
    }

    try {
      const permission = await Notification.requestPermission();
      setHasPermission(permission === 'granted');
      return permission === 'granted';
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return false;
    }
  }, []);

  return [hasPermission, requestPermission];
}

// ============================================================================
// Utility Function: Send Notification
// ============================================================================

export function sendArrivalNotification(stopTitle: string): void {
  if (!('Notification' in window)) return;

  if (Notification.permission !== 'granted') return;

  const notification = new Notification('You\'ve Arrived! 🎉', {
    body: `Welcome to ${stopTitle}`,
    icon: '/location-pin.svg',
    badge: '/badge.svg',
    tag: 'arrival',
    requireInteraction: false,
  });

  // Close after 10 seconds
  setTimeout(() => notification.close(), 10000);
}
