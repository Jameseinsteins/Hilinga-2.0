/**
 * Custom hook for MapScreen state management
 *
 * Consolidates 20+ useState calls into a single organized state object.
 * Makes the MapScreen component more readable and testable.
 */

import { useCallback, useState } from "react";
import type { MapPlace, MapRouteStop } from "@/components/openstreet-map";
import type { TripPlan } from "@/lib/database";
import type { RegisteredSmallBusiness } from "@/lib/business-content";

export interface MapState {
  // Plan and route state
  selectedPlanId: string;
  plans: TripPlan[];
  loadingPlans: boolean;
  routeError: string | null;
  showRoute: boolean;
  activeDay: number;
  completedStops: Set<string>;
  completedDayPrompt: number | null;

  // Live location state
  liveTracking: boolean;
  liveLocation: (MapPlace & { accuracy: number }) | null;
  locationError: string | null;

  // Point-to-point routing
  startPointId: string;
  destinationId: string;
  droppedPin: MapPlace | null;
  routeGeometry: [number, number][];
  autoRoute: { distanceKm: number; durationMinutes: number } | null;
  autoRouteLoading: boolean;
  autoRouteError: string | null;

  // Navigation/UI state
  selectedId: string;
  isNavigating: boolean;
  currentNavStopIndex: number;
  navToast: string | null;
  replaceTarget: { day: number; stopIndex: number; currentTitle: string } | null;
  registeredBusinesses: RegisteredSmallBusiness[];
  showTransportRoutes: boolean;
  showRegisteredBusinesses: boolean;
}

export interface MapActions {
  setSelectedPlanId: (id: string) => void;
  setPlans: (plans: TripPlan[]) => void;
  setLoadingPlans: (loading: boolean) => void;
  setRouteError: (error: string | null) => void;
  setShowRoute: (show: boolean) => void;
  setActiveDay: (day: number) => void;
  setCompletedStops: (stops: Set<string>) => void;
  setCompletedDayPrompt: (day: number | null) => void;

  setLiveTracking: (tracking: boolean) => void;
  setLiveLocation: (location: (MapPlace & { accuracy: number }) | null) => void;
  setLocationError: (error: string | null) => void;

  setStartPointId: (id: string) => void;
  setDestinationId: (id: string) => void;
  setDroppedPin: (pin: MapPlace | null) => void;
  setRouteGeometry: (geometry: [number, number][]) => void;
  setAutoRoute: (route: { distanceKm: number; durationMinutes: number } | null) => void;
  setAutoRouteLoading: (loading: boolean) => void;
  setAutoRouteError: (error: string | null) => void;

  setSelectedId: (id: string) => void;
  setIsNavigating: (navigating: boolean) => void;
  setCurrentNavStopIndex: (index: number) => void;
  setNavToast: (toast: string | null) => void;
  setReplaceTarget: (target: { day: number; stopIndex: number; currentTitle: string } | null) => void;
  setRegisteredBusinesses: (businesses: RegisteredSmallBusiness[]) => void;
  setShowTransportRoutes: (show: boolean) => void;
  setShowRegisteredBusinesses: (show: boolean) => void;

  // Compound actions
  markStopDone: (stop: MapRouteStop) => void;
  toggleLiveLocation: () => void;
  swapRoutePoints: () => void;
}

export function useMapState(initialPlanId?: string | null): [MapState, MapActions] {
  const [selectedPlanId, setSelectedPlanId] = useState(initialPlanId ?? "");
  const [plans, setPlans] = useState<TripPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [showRoute, setShowRoute] = useState(false);
  const [activeDay, setActiveDay] = useState(1);
  const [completedStops, setCompletedStops] = useState<Set<string>>(() => new Set());
  const [completedDayPrompt, setCompletedDayPrompt] = useState<number | null>(null);

  const [liveTracking, setLiveTracking] = useState(false);
  const [liveLocation, setLiveLocation] = useState<(MapPlace & { accuracy: number }) | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [startPointId, setStartPointId] = useState("current-location");
  const [destinationId, setDestinationId] = useState("");
  const [droppedPin, setDroppedPin] = useState<MapPlace | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][]>([]);
  const [autoRoute, setAutoRoute] = useState<{ distanceKm: number; durationMinutes: number } | null>(null);
  const [autoRouteLoading, setAutoRouteLoading] = useState(false);
  const [autoRouteError, setAutoRouteError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentNavStopIndex, setCurrentNavStopIndex] = useState(0);
  const [navToast, setNavToast] = useState<string | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<{ day: number; stopIndex: number; currentTitle: string } | null>(null);
  const [registeredBusinesses, setRegisteredBusinesses] = useState<RegisteredSmallBusiness[]>([]);
  const [showTransportRoutes, setShowTransportRoutes] = useState(true);
  const [showRegisteredBusinesses, setShowRegisteredBusinesses] = useState(true);

  const toggleLiveLocation = useCallback(() => {
    setStartPointId("current-location");
    setLiveTracking((current) => {
      if (current) setLiveLocation(null);
      return !current;
    });
  }, []);

  const swapRoutePoints = useCallback(() => {
    if (startPointId === "current-location") return;
    setStartPointId(destinationId);
    setDestinationId(startPointId);
  }, [startPointId, destinationId]);

  const state: MapState = {
    selectedPlanId,
    plans,
    loadingPlans,
    routeError,
    showRoute,
    activeDay,
    completedStops,
    completedDayPrompt,
    liveTracking,
    liveLocation,
    locationError,
    startPointId,
    destinationId,
    droppedPin,
    routeGeometry,
    autoRoute,
    autoRouteLoading,
    autoRouteError,
    selectedId,
    isNavigating,
    currentNavStopIndex,
    navToast,
    replaceTarget,
    registeredBusinesses,
    showTransportRoutes,
    showRegisteredBusinesses,
  };

  const actions: MapActions = {
    setSelectedPlanId,
    setPlans,
    setLoadingPlans,
    setRouteError,
    setShowRoute,
    setActiveDay,
    setCompletedStops,
    setCompletedDayPrompt,
    setLiveTracking,
    setLiveLocation,
    setLocationError,
    setStartPointId,
    setDestinationId,
    setDroppedPin,
    setRouteGeometry,
    setAutoRoute,
    setAutoRouteLoading,
    setAutoRouteError,
    setSelectedId,
    setIsNavigating,
    setCurrentNavStopIndex,
    setNavToast,
    setReplaceTarget,
    setRegisteredBusinesses,
    setShowTransportRoutes,
    setShowRegisteredBusinesses,
    toggleLiveLocation,
    swapRoutePoints,
    markStopDone: () => {
      // Implemented in the component using the state setters
    },
  };

  return [state, actions];
}
