import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPlace, MapRouteStop, OpenStreetMap, type RouteStep } from "@/components/openstreet-map";
import { catalog, routeDestinations, distanceKm, buildMapRoute } from "@/lib/catalog";
import explore1 from "@/assets/images/hilinga/explore-1.png";
import { BUSINESS_CONTENT_CHANGED_EVENT, readVerifiedSmallBusinesses, type RegisteredSmallBusiness } from "@/lib/business-content";
import type { TripPlan } from "@/lib/database";
import { getTripPlans, updateTripPlan } from "@/lib/cloud-user-data";
import { useAuth } from "@/providers/auth-provider";
import { useDatabase } from "@/providers/database-provider";
import { Icon, Card, Button, EmptyState, ReplacePlaceModal } from "@/components/ui-helpers";

export function MapScreen({ initialPlanId, onClose }: { initialPlanId?: string | null; onClose: () => void }) {
  const db = useDatabase();
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState("");
  const [plans, setPlans] = useState<TripPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState(initialPlanId ?? "");
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [showRoute, setShowRoute] = useState(false);
  const [activeDay, setActiveDay] = useState(1);
  const [completedStops, setCompletedStops] = useState<Set<string>>(() => new Set());
  const [completedDayPrompt, setCompletedDayPrompt] = useState<number | null>(null);
  const [liveTracking, setLiveTracking] = useState(false);
  const [liveLocation, setLiveLocation] = useState<(MapPlace & { accuracy: number; heading?: number | null; speed?: number | null }) | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [startPointId, setStartPointId] = useState("current-location");
  const [destinationId, setDestinationId] = useState("");
  const [droppedPin, setDroppedPin] = useState<MapPlace | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][]>([]);
  const [autoRoute, setAutoRoute] = useState<{ distanceKm: number; durationMinutes: number } | null>(null);
  const [autoRouteLoading, setAutoRouteLoading] = useState(false);
  const [autoRouteError, setAutoRouteError] = useState<string | null>(null);

  // Waze auto-navigation, transport routes, and place replacement state
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentNavStopIndex, setCurrentNavStopIndex] = useState(0);
  const [navToast, setNavToast] = useState<string | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<{ day: number; stopIndex: number; currentTitle: string } | null>(null);
  const [registeredBusinesses, setRegisteredBusinesses] = useState<RegisteredSmallBusiness[]>(() => readVerifiedSmallBusinesses());
  const [showTransportRoutes, setShowTransportRoutes] = useState(true);
  const [showRegisteredBusinesses, setShowRegisteredBusinesses] = useState(true);

  // ── Waze enhancements ──
  const [mapStyle, setMapStyle] = useState<"standard" | "dark" | "satellite">("standard");
  const [followMode, setFollowMode] = useState(true);
  const [heading, setHeading] = useState<number | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MapPlace[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [stepsOpen, setStepsOpen] = useState(true);
  const [reportToastWaze, setReportToastWaze] = useState<string | null>(null);

  // ── Living Mayon — cinematic extras ──
  const [elevationProfile, setElevationProfile] = useState<number[] | null>(null);
  const [elevationLoading, setElevationLoading] = useState(false);
  const [bottomSheetPlace, setBottomSheetPlace] = useState<(MapPlace & Partial<MapRouteStop>) | null>(null);
  const [showFogLayer, setShowFogLayer] = useState(true);
  const [showMayonBackdrop, setShowMayonBackdrop] = useState(true);

  useEffect(() => {
    const refreshBusinesses = () => setRegisteredBusinesses(readVerifiedSmallBusinesses());
    window.addEventListener(BUSINESS_CONTENT_CHANGED_EVENT, refreshBusinesses);
    window.addEventListener("storage", refreshBusinesses);
    return () => {
      window.removeEventListener(BUSINESS_CONTENT_CHANGED_EVENT, refreshBusinesses);
      window.removeEventListener("storage", refreshBusinesses);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPlans() {
      if (!user) return;
      try {
        const loaded = await getTripPlans(db, user.uid);
        if (cancelled) return;
        const routable = loaded.filter((plan) => (plan.itinerary?.length ?? 0) > 0);
        setPlans(routable);
        setSelectedPlanId((current) => routable.some((plan) => plan.id === current) ? current : routable[0]?.id ?? "");
      } catch {
        if (!cancelled) setRouteError("Saved itineraries could not be loaded for routing.");
      } finally {
        if (!cancelled) setLoadingPlans(false);
      }
    }
    void loadPlans();
    return () => { cancelled = true; };
  }, [db, user]);

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
  const routeStops = useMemo(() => selectedPlan ? buildMapRoute(selectedPlan) : [], [selectedPlan]);
  const routeDays = useMemo(() => Array.from(new Set(routeStops.map((stop) => stop.day))), [routeStops]);
  const visibleRouteStops = useMemo(() => routeStops.filter((stop) => stop.day === activeDay), [activeDay, routeStops]);
  const activeNavStop = isNavigating ? (visibleRouteStops[currentNavStopIndex] ?? visibleRouteStops[0]) : null;
  const selectedStop = visibleRouteStops.find((stop) => stop.id === selectedId);
  const selectedPlace = catalog.find((place) => place.id === selectedId);
  const totalMinutes = visibleRouteStops.reduce((total, stop) => total + stop.travelMinutes, 0);
  const progressStorageKey = user && selectedPlanId ? `hilinga-route-progress:${user.uid}:${selectedPlanId}` : "";
  const startPoint = startPointId === "current-location" ? liveLocation : routeDestinations.find((place) => place.id === startPointId) ?? null;
  const destination = isNavigating && activeNavStop
    ? activeNavStop
    : (droppedPin ?? routeDestinations.find((place) => place.id === destinationId) ?? null);
  const pointToPointActive = Boolean(destination && startPoint);
  const mapDestination = droppedPin ?? (startPoint ? destination : null);
  const pointToPointDistance = autoRoute?.distanceKm ?? (startPoint && destination ? Math.round(distanceKm(startPoint, destination) * 10) / 10 : null);
  const pointToPointMinutes = autoRoute?.durationMinutes ?? (pointToPointDistance === null ? null : Math.max(3, Math.round(pointToPointDistance / 28 * 60)));

  // ── Waze: Nominatim search ──
  const doWazeSearch = useCallback(async (q?: string) => {
    const query = (q ?? searchQuery).trim();
    if (!query) { setSearchResults([]); setSearchError(null); return; }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=8&q=${encodeURIComponent(query)}&countrycodes=ph&addressdetails=1`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
      const places: MapPlace[] = data.map((r, i) => ({
        id: `waze-search-${i}-${r.lat}-${r.lon}`.replace(/[^a-z0-9-]/gi, "-"),
        name: (r.display_name.split(",")[0] || r.display_name).slice(0, 64).trim() || r.display_name.slice(0, 64),
        subtitle: r.display_name,
        latitude: Number(r.lat),
        longitude: Number(r.lon),
      }));
      setSearchResults(places);
      if (places.length === 0) setSearchError("No places found — try a different name or tap the map to drop a pin.");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed.");
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery]);

  // Debounced Waze/OpenStreet autocomplete — 380ms
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    if (q.length < 3) return;
    const t = setTimeout(() => { void doWazeSearch(q); }, 380);
    return () => clearTimeout(t);
  }, [searchQuery, doWazeSearch]);

  // Sync spring bottom sheet when a place/stop is selected
  useEffect(() => {
    if (!selectedId) { setBottomSheetPlace(null); return; }
    const stop = visibleRouteStops.find((s) => s.id === selectedId) as unknown as (MapPlace & Partial<MapRouteStop>) | undefined;
    const place = catalog.find((p) => p.id === selectedId) as unknown as (MapPlace & Partial<MapRouteStop>) | undefined;
    const found = (stop ?? place ?? null) as (MapPlace & Partial<MapRouteStop>) | null;
    if (found) setBottomSheetPlace(found);
    else if (droppedPin && droppedPin.id === selectedId) setBottomSheetPlace(droppedPin as any);
  }, [selectedId, visibleRouteStops]);

  // Elevation along route — Open-Meteo with synthetic fallback shaped by Mayon proximity
  useEffect(() => {
    const points: [number, number][] = routeGeometry.length > 0 ? ([...routeGeometry] as [number, number][])
      : visibleRouteStops.length > 0 ? visibleRouteStops.map((s) => [s.latitude, s.longitude] as [number, number])
      : [];
    if (points.length < 2) { setElevationProfile(null); setElevationLoading(false); return; }
    const sampled = points.length > 24 ? points.filter((_, i) => i % Math.ceil(points.length / 24) === 0).slice(0, 24) : points;
    const lats = sampled.map((p) => p[0]).join(",");
    const lons = sampled.map((p) => p[1]).join(",");
    let cancelled = false;
    setElevationLoading(true);
    fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`)
      .then((r) => r.ok ? r.json() as Promise<{ elevation: number[] }> : Promise.reject(new Error(String(r.status))))
      .then((j) => { if (!cancelled) setElevationProfile(j.elevation ?? null); })
      .catch(() => {
        if (cancelled) return;
        const MAYON = { lat: 13.2573, lng: 123.6850 };
        const toRad = (d: number) => d * Math.PI / 180;
        const distKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
          const dLat = toRad(bLat - aLat); const dLng = toRad(bLng - aLng);
          const s = Math.sin(dLat/2)**2 + Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;
          return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
        };
        const synth = sampled.map(([lat, lng]) => {
          const d = distKm(lat, lng, MAYON.lat, MAYON.lng);
          const base = 8 + Math.max(0, 1 - d / 28) * 420 + Math.max(0, 1 - d / 12) * 1400;
          const ridge = Math.sin((lat * 9 + lng * 7)) * 22;
          return Math.round(base + ridge);
        });
        setElevationProfile(synth);
      })
      .finally(() => { if (!cancelled) setElevationLoading(false); });
    return () => { cancelled = true; };
  }, [routeGeometry, visibleRouteStops]);

  useEffect(() => {
    if (!startPoint || !destination) {
      setRouteGeometry([]);
      setAutoRoute(null);
      setRouteSteps([]);
      setAutoRouteLoading(false);
      return;
    }
    const controller = new AbortController();
    const url = `https://router.project-osrm.org/route/v1/driving/${startPoint.longitude},${startPoint.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&steps=true`;
    setAutoRouteLoading(true);
    setAutoRouteError(null);
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Routing request failed with HTTP ${response.status}`);
        return response.json() as unknown as Promise<any>;
      })
      .then((payload) => {
        const route = payload.routes?.[0];
        if (payload.code !== "Ok" || !route) throw new Error("No road route was returned");
        setRouteGeometry((route.geometry.coordinates as [number, number][]).map(([longitude, latitude]: [number, number]) => [latitude, longitude] as [number, number]));
        setAutoRoute({ distanceKm: Math.round(route.distance / 100) / 10, durationMinutes: Math.max(1, Math.round(route.duration / 60)) });
        const steps: RouteStep[] = ((route.legs ?? []) as Array<{ steps: Array<{ distance: number; duration: number; name: string; maneuver: { type: string; modifier?: string; instruction?: string } }> }>).flatMap((leg) =>
          (leg.steps ?? []).map((s: { distance: number; duration: number; name: string; maneuver: { type: string; modifier?: string; instruction?: string } }) => ({
            instruction: s.maneuver.instruction || (s.name ? `${s.maneuver.type === "depart" ? "Head" : s.maneuver.modifier ? `Turn ${s.maneuver.modifier}` : s.maneuver.type} ${s.name ? `onto ${s.name}` : ""}`.trim() : s.maneuver.type),
            distance: s.distance,
            duration: s.duration,
            maneuver: `${s.maneuver.type}${s.maneuver.modifier ? ` ${s.maneuver.modifier}` : ""}`,
          }))
        );
        setRouteSteps(steps);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRouteGeometry([]);
        setAutoRoute(null);
        setRouteSteps([]);
        setAutoRouteError("Road routing is temporarily unavailable, so the map is showing a direct estimate.");
      })
      .finally(() => { if (!controller.signal.aborted) setAutoRouteLoading(false); });
    return () => controller.abort();
  }, [destination, startPoint]);

  useEffect(() => {
    if (!liveTracking) return;
    if (!("geolocation" in navigator)) {
      setLocationError("Live location is not supported by this browser.");
      setLiveTracking(false);
      return;
    }
    setLocationError(null);
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const h = coords.heading != null && Number.isFinite(coords.heading) ? coords.heading : null;
        const sp = coords.speed != null && Number.isFinite(coords.speed) ? Math.round(coords.speed * 3.6) : null;
        setLiveLocation({
          id: "current-location",
          name: "Your live location",
          subtitle: "Updates as you move",
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          heading: h,
          speed: coords.speed,
        });
        if (h != null) setHeading(h);
        setSpeedKmh(sp);
        setLocationError(null);
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? "Location access was denied. Allow location permission in your browser to use live routing."
          : "Your live location could not be found. Check your device location settings and try again.";
        setLocationError(message);
        setLiveTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [liveTracking]);

  useEffect(() => {
    setSelectedId(showRoute ? visibleRouteStops[0]?.id ?? "" : "");
  }, [showRoute, visibleRouteStops]);

  useEffect(() => {
    setActiveDay(routeDays[0] ?? 1);
    setCompletedDayPrompt(null);
    setShowRoute(Boolean(selectedPlanId));
    setCurrentNavStopIndex(0);
    setIsNavigating(false);
  }, [selectedPlanId, routeDays]);

  function markStopDone(stop: MapRouteStop) {
    const next = new Set(completedStops);
    if (next.has(stop.id)) next.delete(stop.id);
    else next.add(stop.id);
    setCompletedStops(next);
    if (progressStorageKey) localStorage.setItem(progressStorageKey, JSON.stringify([...next]));
    const dayStops = routeStops.filter((item) => item.day === stop.day);
    if (next.has(stop.id) && dayStops.every((item) => next.has(item.id))) setCompletedDayPrompt(stop.day);
    else if (completedDayPrompt === stop.day) setCompletedDayPrompt(null);
  }

  function proceedToNextDay() {
    const currentIndex = routeDays.indexOf(activeDay);
    const nextDay = routeDays[currentIndex + 1];
    if (nextDay !== undefined) {
      setActiveDay(nextDay);
      setShowRoute(true);
      setCurrentNavStopIndex(0);
    }
    setCompletedDayPrompt(null);
  }

  function toggleLiveLocation() {
    setStartPointId("current-location");
    setLiveTracking((current) => {
      if (current) { setLiveLocation(null); setHeading(null); setSpeedKmh(null); }
      return !current;
    });
  }

  function swapRoutePoints() {
    if (startPointId === "current-location") return;
    setStartPointId(destinationId);
    setDestinationId(startPointId);
  }

  const hasLiveLocation = liveLocation !== null;
  const chooseDestination = useCallback((place: MapPlace) => {
    setDroppedPin(place);
    setDestinationId(place.id);
    setSelectedId(place.id);
    setShowRoute(false);
    setBottomSheetPlace(place as any);
    if (startPointId === "current-location" && !hasLiveLocation) setLiveTracking(true);
  }, [hasLiveLocation, startPointId]);

  function openDirections() {
    if (!destination) return;
    const origin = startPoint ? `${startPoint.latitude},${startPoint.longitude}` : "Current Location";
    const target = `${destination.latitude},${destination.longitude}`;
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(target)}&travelmode=driving`, "_blank", "noopener,noreferrer");
  }

  function startNavigationMode() {
    if (!visibleRouteStops.length) return;
    setIsNavigating(true);
    setShowRoute(true);
    setStartPointId("current-location");
    if (!hasLiveLocation) setLiveTracking(true);
    setCurrentNavStopIndex(0);
    setSelectedId(visibleRouteStops[0].id);
    setFollowMode(true);
    setNavToast(`Started Waze navigation to Stop 1: ${visibleRouteStops[0].name}`);
    setTimeout(() => setNavToast(null), 4000);
  }

  function advanceNavToNextStop() {
    if (!activeNavStop) return;
    markStopDone(activeNavStop);
    if (currentNavStopIndex + 1 < visibleRouteStops.length) {
      const nextIndex = currentNavStopIndex + 1;
      setCurrentNavStopIndex(nextIndex);
      const nextStop = visibleRouteStops[nextIndex];
      setSelectedId(nextStop.id);
      setNavToast(`Reached Stop ${currentNavStopIndex + 1}! Auto-routing to Stop ${nextIndex + 1}: ${nextStop.name}...`);
    } else {
      const currentIndex = routeDays.indexOf(activeDay);
      const nextDay = routeDays[currentIndex + 1];
      if (nextDay !== undefined) {
        setActiveDay(nextDay);
        setCurrentNavStopIndex(0);
        setNavToast(`Day ${activeDay} completed! Auto-routing to Day ${nextDay} stops...`);
      } else {
        setNavToast("🎉 Congratulations! You completed all stops in this itinerary.");
        setIsNavigating(false);
      }
    }
    setTimeout(() => setNavToast(null), 4000);
  }

  async function handleSelectReplacement(newTitle: string) {
    if (!replaceTarget || !selectedPlan) return;
    const { day, stopIndex } = replaceTarget;
    const updatedItinerary = (selectedPlan.itinerary ?? []).map((dayPlan) => {
      if (dayPlan.day !== day) return dayPlan;
      const newStops = [...dayPlan.stops];
      if (newStops[stopIndex]) {
        newStops[stopIndex] = {
          ...newStops[stopIndex],
          title: newTitle,
          note: `Customized stop: ${newTitle}.`,
        };
      }
      return { ...dayPlan, stops: newStops };
    });

    try {
      if (user) {
        await updateTripPlan(db, user.uid, selectedPlan.id, { itinerary: updatedItinerary });
        const loaded = await getTripPlans(db, user.uid);
        setPlans(loaded);
      }
      setNavToast(`Replaced stop with "${newTitle}". Route updated!`);
      setTimeout(() => setNavToast(null), 4000);
    } catch {
      setRouteError("Could not save updated place into itinerary.");
    }
  }

  const etaLabel = pointToPointMinutes != null ? new Date(Date.now() + pointToPointMinutes * 60000).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="map-screen">
      <div className="map-header">
        <button className="icon-btn" onClick={onClose} aria-label="Close map">
          <Icon name="arrow_back" size={23} color="var(--c-green)" />
        </button>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <h1 className="page-title">{isNavigating ? "Waze Navigation" : "Map — Waze style"}</h1>
          <span style={{ color: "var(--c-body)", fontSize: 13 }}>
            {isNavigating
              ? `Driving to ${activeNavStop?.name ?? "destination"} • ${pointToPointMinutes ?? activeNavStop?.travelMinutes ?? "—"} min`
              : pointToPointActive
                ? `Routing to ${destination?.name} • ${pointToPointDistance ?? "—"} km`
                : selectedStop?.name ?? selectedPlace?.name ?? "Search, drop a pin, or route an itinerary."}
          </span>
        </div>
      </div>

      {showMayonBackdrop && !isNavigating && (
        <div className="mayon-hero">
          <div className="mayon-hero-silhouette" aria-hidden="true">
            <svg viewBox="0 0 880 92" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 92 L0 74 Q 118 54 198 36 Q 268 14 332 6 Q 394 -2 440 92 Z" fill="#153E32" opacity="0.95" />
              <path d="M0 92 L0 84 Q 138 68 212 48 Q 282 28 340 18 Q 392 8 440 92 Z" fill="#1E5A3A" opacity="0.72" />
              <path d="M440 92 Q 488 8 540 18 Q 598 28 668 48 Q 742 68 880 84 L880 92 Z" fill="#1E5A3A" opacity="0.72" />
              <path d="M440 92 Q 486 -2 548 6 Q 612 14 682 36 Q 762 54 880 74 L880 92 Z" fill="#153E32" opacity="0.95" />
              <ellipse cx="440" cy="18" rx="18" ry="9" fill="white" opacity="0.92" />
              <ellipse cx="440" cy="21" rx="11" ry="5.5" fill="#EAF6EF" opacity="0.95" />
            </svg>
          </div>
          <div className="mayon-hero-fog" aria-hidden="true" />
          <div className="mayon-hero-copy">
            <span className="mayon-hero-eyebrow"><Icon name="landscape" size={14} color="var(--c-green)" /> Albay is Mayon &bull; Living Map</span>
            <h2>Every itinerary is a <span style={{ color: "var(--c-green)" }}>geography lesson</span> you can feel.</h2>
            <p>Mayon watches the plains. Fog drifts over the foothills. Your route climbs, dips, and threads the towns beneath the cone — clustered pins pulse where stories gather.</p>
          </div>
          <button type="button" onClick={() => setShowMayonBackdrop(false)} aria-label="Dismiss Mayon backdrop" style={{ position: "absolute", top: 10, right: 10, zIndex: 2, width: 30, height: 30, borderRadius: 999, background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.14)" }}><Icon name="close" size={16} /></button>
        </div>
      )}

      {navToast && (
        <div className="nav-toast" role="status">
          <Icon name="navigation" size={18} color="white" />
          <span>{navToast}</span>
        </div>
      )}
      {reportToastWaze && (
        <div className="nav-toast" role="status" style={{ background: "#92400E" }}>
          <Icon name="check_circle" size={18} color="white" />
          <span>{reportToastWaze}</span>
        </div>
      )}

      {isNavigating && activeNavStop && (
        <Card className="nav-hud-top">
          <div className="nav-hud-header">
            <span className="nav-hud-badge">WAZE DRIVE</span>
            <span className="nav-hud-stop-badge">Stop {currentNavStopIndex + 1} of {visibleRouteStops.length} (Day {activeDay})</span>
            <button className="nav-hud-exit-btn" onClick={() => setIsNavigating(false)}>Exit Waze</button>
          </div>
          <div className="nav-hud-main">
            <div className="nav-hud-icon-box">
              <Icon name="navigation" size={24} color="white" />
            </div>
            <div className="nav-hud-copy">
              <strong>{activeNavStop.name}</strong>
              <span>{activeNavStop.directions}</span>
            </div>
          </div>
          <div className="nav-hud-metrics">
            <span><Icon name="schedule" size={16} />{pointToPointMinutes ?? activeNavStop.travelMinutes} min • ETA {etaLabel ?? "—"}</span>
            <span><Icon name="straighten" size={16} />{pointToPointDistance ?? activeNavStop.travelDistanceKm} km</span>
            <span><Icon name="directions_car" size={16} />{activeNavStop.terminal.transport}</span>
          </div>
          <button className="nav-hud-next-btn" onClick={advanceNavToNextStop}>
            <Icon name="check_circle" size={20} color="white" /> Mark Reached & Navigate Next
          </button>
        </Card>
      )}

      {/* ── Waze search bar ── */}
      {!isNavigating && (
        <div className="waze-search-bar">
          <div className="waze-search-row">
            <label className="waze-search-input-wrap">
              <Icon name="search" size={18} color="var(--c-muted)" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void doWazeSearch(); }}
                placeholder="Where to? Search Albay — e.g. Cagsawa, Legazpi Boulevard, Daraga Church"
                aria-label="Search map"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setSearchResults([]); setSearchError(null); }} aria-label="Clear search">
                  <Icon name="cancel" size={18} color="var(--c-muted)" />
                </button>
              )}
            </label>
            <button className="waze-search-go" onClick={() => void doWazeSearch()} disabled={searchLoading || !searchQuery.trim()}>
              {searchLoading ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2, borderTopColor: "white" }} /> : <><Icon name="search" size={16} color="white" /> Go</>}
            </button>
          </div>
          <div className="waze-quick-pills" role="list">
            {["Cagsawa Ruins", "Legazpi Boulevard", "Daraga Church", "Sumlang Lake", "Tabaco Port"].map((q) => (
              <button key={q} type="button" className={`waze-quick-pill ${searchQuery === q ? "waze-quick-pill-active" : ""}`} onClick={() => { setSearchQuery(q); void doWazeSearch(q); }}>
                <Icon name="location_on" size={14} color={searchQuery === q ? "white" : "var(--c-green)"} /> {q}
              </button>
            ))}
            <button type="button" className="waze-quick-pill" onClick={() => { setSearchQuery(""); setSearchResults([]); setDroppedPin(null); setDestinationId(""); }}>
              <Icon name="close" size={14} /> Clear destination
            </button>
          </div>
          {(searchResults.length > 0 || searchLoading || searchError) && (
            <div>
              {searchError && <p className="live-location-error" role="alert" style={{ marginTop: 4 }}><Icon name="warning" size={14} />{searchError}</p>}
              {searchLoading && <div className="smart-map-loading" style={{ minHeight: 54 }}><div className="spinner" /><span>Searching Albay…</span></div>}
              {searchResults.length > 0 && (
                <div className="waze-search-results mayon-waze-autocomplete" role="listbox" aria-label="Search results">
                  {searchResults.map((r) => (
                    <button key={r.id} type="button" className="waze-search-result" onClick={() => { chooseDestination(r); setSearchResults([]); setSearchQuery(r.name); setBottomSheetPlace(r as any); }} role="option" aria-label={`Navigate to ${r.name}`}>
                      <span style={{ width: 36, height: 36, borderRadius: 999, background: "var(--c-pale)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="place" size={18} color="var(--c-green)" /></span>
                      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}><strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</strong><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}>{r.subtitle}</span></span>
                      <Icon name="north_east" size={16} color="var(--c-muted)" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!isNavigating && (
        <Card className="live-route-controls">
          <div className="live-route-heading">
            <div><span>WAZE LIVE</span><strong>Start and destination</strong></div>
            <button className={`live-location-switch ${liveTracking ? "live-location-switch-active" : ""}`} role="switch" aria-checked={liveTracking} onClick={toggleLiveLocation}>
              <span className="live-location-switch-track"><i /></span>
              <Icon name="my_location" size={17} />{liveTracking ? "Live on" : "Use live location"}
            </button>
          </div>
          <div className="route-point-fields">
            <label><span><i className="route-point-dot route-point-start" />Starting point</span><select value={startPointId} onChange={(event) => { setStartPointId(event.target.value); if (event.target.value !== "current-location") { setLiveTracking(false); setLiveLocation(null); setHeading(null); setSpeedKmh(null); } }}><option value="current-location">My current location</option>{routeDestinations.map((place) => <option key={`start-${place.id}`} value={place.id}>{place.name}</option>)}</select></label>
            <button className="route-swap-button" onClick={swapRoutePoints} disabled={startPointId === "current-location"} aria-label="Swap starting point and destination"><Icon name="swap_vert" size={20} /></button>
            <label><span><i className="route-point-dot route-point-destination" />Destination</span><select value={destinationId} onChange={(event) => { setDroppedPin(null); setDestinationId(event.target.value); }}><option value="">— Pick or search above —</option>{droppedPin && <option value={droppedPin.id}>📍 Dropped pin ({droppedPin.subtitle.slice(0, 32)})</option>}{routeDestinations.map((place) => <option key={`destination-${place.id}`} value={place.id}>{place.name}</option>)}</select></label>
          </div>
          {startPointId === "current-location" && !liveLocation && <p className="live-location-hint"><Icon name={liveTracking ? "location_searching" : "info"} size={16} />{liveTracking ? "Finding your live location… allow permission and keep screen on." : "Turn on live location to use your position as the start — like Waze."}</p>}
          {locationError && <p className="live-location-error" role="alert"><Icon name="location_off" size={17} />{locationError}</p>}
          {pointToPointActive && <div className="live-route-summary"><span><Icon name="route" size={16} />{pointToPointDistance} km {autoRoute ? "by road" : "estimated"}</span><span><Icon name="schedule" size={16} />{autoRouteLoading ? "Routing…" : `About ${pointToPointMinutes} min • ETA ${etaLabel ?? "—"}`}</span><button onClick={openDirections}><Icon name="navigation" size={17} />Directions</button></div>}
          {autoRouteError && <p className="live-location-error" role="status"><Icon name="warning" size={17} />{autoRouteError}</p>}
        </Card>
      )}

      <Card className="smart-map-controls">
        <label htmlFor="route-plan">Route a saved itinerary</label>
        <div className="smart-map-select-row">
          <Icon name="route" size={21} color="var(--c-green)" />
          <select id="route-plan" value={selectedPlanId} disabled={loadingPlans || plans.length === 0} onChange={(event) => setSelectedPlanId(event.target.value)}>
            {plans.length === 0 ? <option value="">No saved itinerary available</option> : plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}
          </select>
        </div>
        {selectedPlan && (
          <div className="smart-map-summary">
            <span><Icon name="location_on" size={16} />{routeStops.length} stops</span>
            <span><Icon name="schedule" size={16} />About {totalMinutes} min travel</span>
            <span className="plan-budget-chip" style={{ border: 0, padding: "3px 9px", margin: 0 }}>
              <Icon name="payments" size={15} color="var(--c-green)" />
              {selectedPlan.preferences.budget !== null ? `₱${selectedPlan.preferences.budget.toLocaleString()}` : "Moderate"}
            </span>
          </div>
        )}
        {selectedPlan && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className={`smart-map-route-toggle ${showRoute ? "smart-map-route-toggle-active" : ""}`} style={{ flex: 1 }} onClick={() => setShowRoute((current) => !current)}>
              <Icon name={showRoute ? "visibility_off" : "route"} size={19} />{showRoute ? "Hide route" : "Show route"}
            </button>
            <button className="smart-map-route-toggle" style={{ flex: 1, background: "var(--c-green)", color: "white", borderColor: "var(--c-green)" }} onClick={startNavigationMode}>
              <Icon name="navigation" size={19} color="white" />Start Waze
            </button>
          </div>
        )}
      </Card>

      {routeError && <p className="error-text" role="alert">{routeError}</p>}

      {routeDays.length > 1 && (
        <>
          <div className="mayon-day-pills" aria-label="Itinerary days">
            {routeDays.map((day) => {
              const dayStops = routeStops.filter((stop) => stop.day === day);
              const dayDone = dayStops.length > 0 && dayStops.every((stop) => completedStops.has(stop.id));
              return <button key={day} className={`mayon-day-pill ${activeDay === day ? "mayon-day-pill-active" : ""}`} onClick={() => { setActiveDay(day); setShowRoute(true); }}><Icon name={dayDone ? "check_circle" : "calendar_today"} size={16} color={activeDay === day ? "white" : undefined} />Day {day}</button>;
            })}
          </div>
          <div className="mayon-day-line" aria-hidden="true"><i style={{ width: `${(routeDays.indexOf(activeDay) + 1) / Math.max(1, routeDays.length) * 100}%`, left: 0 }} /></div>
        </>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0 8px 0" }}>
        <button
          type="button"
          style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, background: showTransportRoutes ? "#FEF3C7" : "var(--c-chip)", color: showTransportRoutes ? "#92400E" : "var(--c-body)", border: "1px solid", borderColor: showTransportRoutes ? "#FCD34D" : "transparent" }}
          onClick={() => setShowTransportRoutes((curr) => !curr)}
        >
          <Icon name="directions_bus" size={15} color={showTransportRoutes ? "#D97706" : "var(--c-muted)"} />
          Transport Hubs & Routes
        </button>
        <button
          type="button"
          style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, background: showRegisteredBusinesses ? "#E8F5EE" : "var(--c-chip)", color: showRegisteredBusinesses ? "var(--c-green-dark)" : "var(--c-body)", border: "1px solid", borderColor: showRegisteredBusinesses ? "#C3E6D2" : "transparent" }}
          onClick={() => setShowRegisteredBusinesses((curr) => !curr)}
        >
          <Icon name="storefront" size={15} color={showRegisteredBusinesses ? "var(--c-green)" : "var(--c-muted)"} />
          Registered Businesses ({registeredBusinesses.length})
        </button>
      </div>

      {/* ── Waze map wrap — cinematic Mayon shell ── */}
      <div className="mayon-map-shell" style={{ height: 420 }}>
        <div className="waze-map-wrap" style={{ height: "100%" }}>
          <OpenStreetMap
          places={showRoute && visibleRouteStops.length > 0 ? visibleRouteStops : catalog}
          routeStops={showRoute ? visibleRouteStops : []}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); const f = (visibleRouteStops.find((s) => s.id === id) as any) ?? catalog.find((p) => p.id === id); if (f) setBottomSheetPlace(f); }}
          liveLocation={liveLocation}
          startPoint={isNavigating || pointToPointActive ? startPoint : null}
          destination={isNavigating || pointToPointActive ? mapDestination : null}
          routeGeometry={routeGeometry}
          routeSteps={routeSteps}
          onMapPress={chooseDestination}
          registeredBusinesses={registeredBusinesses}
          showTransportRoutes={showTransportRoutes}
          showRegisteredBusinesses={showRegisteredBusinesses}
          followMode={followMode && (liveTracking || isNavigating)}
          bearing={heading}
          mapStyle={mapStyle as any}
          showFog={showFogLayer}
          animateRoute={true}
          clusterPins={true}
        />
        {liveLocation && speedKmh != null && (
          <div className="waze-speed-badge" aria-live="polite">
            <Icon name="speed" size={18} color="white" />
            <div style={{ display: "flex", flexDirection: "column", gap: 0, lineHeight: 1 }}>
              <strong>{speedKmh} <span style={{ fontSize: 11, fontWeight: 800 }}>km/h</span></strong>
              <span>Live speed</span>
            </div>
            {heading != null && <span style={{ marginLeft: 6, background: "rgba(255,255,255,0.16)", padding: "4px 7px", borderRadius: 999, fontSize: 10, fontWeight: 900 }}>{Math.round(heading)}°</span>}
          </div>
        )}
        <div className="waze-style-chips">
          {(["standard", "dark", "satellite", "terrain"] as const).map((s) => (
            <button key={s} type="button" className={`waze-style-chip ${mapStyle === (s as any) ? "waze-style-chip-active" : ""}`} onClick={() => setMapStyle(s as any)}>
              <Icon name={s === "satellite" ? "satellite_alt" : s === "dark" ? "dark_mode" : s === "terrain" ? "terrain" : "map"} size={14} color={mapStyle === (s as any) ? "white" : "var(--c-ink)"} />
              {s === "standard" ? "Map" : s === "dark" ? "Dark" : s === "terrain" ? "Terrain" : "Satellite"}
            </button>
          ))}
        </div>
        <div className="waze-fabs">
          <button type="button" className={`waze-fab ${followMode ? "waze-fab-follow-active" : ""}`} onClick={() => setFollowMode((v) => !v)} aria-label={followMode ? "Following — tap to free map" : "Re-center on me"} title={followMode ? "Following your location" : "Tap to follow your location"}>
            <Icon name={followMode ? "my_location" : "location_searching"} size={20} color={followMode ? "white" : "var(--c-green)"} />
          </button>
          <button type="button" className="waze-fab" onClick={() => { setFollowMode(true); if (liveLocation) setSelectedId(""); }} aria-label="Recenter map">
            <Icon name="center_focus_strong" size={20} color="var(--c-ink)" />
          </button>
          <button type="button" className="waze-fab" onClick={() => setMapStyle((prev) => prev === "standard" ? "satellite" : prev === "satellite" ? "dark" : "standard")} aria-label="Switch map style">
            <Icon name="layers" size={20} color="var(--c-ink)" />
          </button>
        </div>
        </div>
      </div>

      {/* ── Elevation along route — travel time + terrain ── */}
      {elevationProfile && elevationProfile.length > 1 && (
        <div className="mayon-elevation-strip" role="img" aria-label={`Elevation profile from ${Math.min(...elevationProfile)} m to ${Math.max(...elevationProfile)} m`}>
          <div className="mayon-elevation-head">
            <strong><Icon name="terrain" size={14} color="var(--c-green)" /> Elevation along your route</strong>
            <span>{elevationLoading ? "Sampling…" : `${Math.min(...elevationProfile)} m \u2192 ${Math.max(...elevationProfile)} m \u00B7 \u0394 ${Math.max(...elevationProfile)-Math.min(...elevationProfile)} m`}</span>
          </div>
          <div className="mayon-elevation-bars" aria-hidden="true">
            {elevationProfile.map((elev, i) => {
              const min = Math.min(...elevationProfile!);
              const max = Math.max(...elevationProfile!);
              const range = Math.max(1, max - min);
              const h = 8 + ((elev - min) / range) * 34;
              return <i key={i} style={{ height: `${h}px`, opacity: 0.92 - (i % 2 ? 0.08 : 0) }} title={`${elev} m`} />;
            })}
          </div>
          <div className="mayon-elevation-meta">
            <span><Icon name="schedule" size={14} /> {pointToPointMinutes ?? totalMinutes ?? "\u2014"} min</span>
            <span><Icon name="straighten" size={14} /> {pointToPointDistance ?? (autoRoute?.distanceKm ?? "\u2014")} km</span>
            <button type="button" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 999, background: showFogLayer ? "var(--c-pale)" : "var(--c-chip)", color: showFogLayer ? "var(--c-green-dark)" : "var(--c-body)", fontSize: 10, fontWeight: 800, cursor: "pointer", border: "1px solid", borderColor: showFogLayer ? "#C3E6D2" : "transparent" }} onClick={() => setShowFogLayer((v) => !v)}><Icon name="filter_drama" size={14} color={showFogLayer ? "var(--c-green)" : "var(--c-muted)"} /> {showFogLayer ? "Fog on" : "Fog off"}</button>
            {destination && <a href={`https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}`} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: "#12291E", color: "white", fontSize: 10, fontWeight: 900, textDecoration: "none" }}><Icon name="navigation" size={14} color="white" /> Open in Waze / Maps</a>}
          </div>
        </div>
      )}

      {/* ── Waze ETA strip ── */}
      {(pointToPointActive || isNavigating) && pointToPointDistance != null && pointToPointMinutes != null && (
        <div className="waze-eta-strip" role="status" aria-live="polite">
          <span style={{ width: 40, height: 40, borderRadius: 12, background: "#00A86B", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="navigation" size={20} color="white" /></span>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <strong style={{ fontSize: 13 }}>{pointToPointDistance} km • {pointToPointMinutes} min • ETA {etaLabel}</strong>
            <span style={{ fontSize: 11, opacity: 0.88 }}>{autoRoute ? "Road-following via OSRM" : "Straight-line estimate"} • {heading != null ? `Heading ${Math.round(heading)}°` : "Waze-style live"}</span>
          </div>
          <button onClick={openDirections} style={{ minHeight: 36, padding: "0 14px", borderRadius: 10, background: "white", color: "#12291E", fontWeight: 900, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}><Icon name="directions" size={16} /> Go</button>
        </div>
      )}

      {/* ── Waze steps sheet (turn-by-turn) ── */}
      {routeSteps.length > 0 && (
        <div className="waze-steps-sheet">
          <button type="button" className="waze-steps-toggle" onClick={() => setStepsOpen((v) => !v)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="route" size={16} color="var(--c-green)" /> {routeSteps.length} turns • {autoRoute?.distanceKm ?? pointToPointDistance ?? "—"} km</span>
            <Icon name={stepsOpen ? "expand_less" : "expand_more"} size={20} color="var(--c-muted)" />
          </button>
          {stepsOpen && (
            <div>
              {routeSteps.slice(0, 14).map((st, i) => (
                <div key={i} className="waze-step">
                  <span style={{ width: 30, height: 30, borderRadius: 999, background: i === 0 ? "#1A73E8" : "#F3F7F4", color: i === 0 ? "white" : "var(--c-ink)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={st.maneuver.includes("left") ? "turn_left" : st.maneuver.includes("right") ? "turn_right" : st.maneuver.includes("roundabout") ? "roundabout_right" : st.maneuver.includes("arrive") ? "flag" : "straight"} size={16} color={i === 0 ? "white" : "var(--c-ink)"} />
                  </span>
                  <span style={{ minWidth: 0 }}><strong>{st.instruction || "Continue"}</strong><br /><small>{(st.distance / 1000).toFixed(1)} km • {Math.max(1, Math.round(st.duration / 60))} min</small></span>
                  <Icon name="chevron_right" size={16} color="var(--c-muted)" />
                </div>
              ))}
              {routeSteps.length > 14 && <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--c-muted)", textAlign: "center", borderTop: "1px solid #EEF2EF" }}>+ {routeSteps.length - 14} more turns on this route</div>}
            </div>
          )}
        </div>
      )}

      {/* ── Waze report bar ── */}
      <div className="waze-report-bar" aria-label="Report on road">
        {[
          ["Traffic jam", "traffic"],
          ["Police", "local_police"],
          ["Hazard", "warning"],
          ["Road closed", "block"],
          ["Gas", "local_gas_station"],
        ].map(([label, icon]) => (
          <button key={label} type="button" className="waze-report-btn" onClick={() => { setReportToastWaze(`${label} reported — thanks! (demo)`); setTimeout(() => setReportToastWaze(null), 2800); }}>
            <Icon name={icon} size={14} /> {label}
          </button>
        ))}
      </div>

      {routeStops.length > 0 ? (
        <section className="smart-route-panel" aria-label="Itinerary route and terminals">
          <div className="smart-route-heading"><div><span className="eyebrow">Route guide</span><h2>Where to ride</h2></div><span className="route-estimate-badge">Estimates</span></div>
          <p className="smart-route-disclaimer">Travel times and town-center boarding points are planning estimates. Confirm the route and terminal locally; traffic, weather, queues, and drop-off points can change the trip.</p>
          <div className="smart-route-list">
            {visibleRouteStops.map((stop, stopIndex) => (
              <article key={stop.id} className={`smart-route-leg ${selectedId === stop.id ? "smart-route-leg-selected" : ""} ${completedStops.has(stop.id) ? "smart-route-leg-done" : ""}`}>
                <span className="smart-route-number">{stop.order}</span>
                <button className="smart-route-copy" onClick={() => { setSelectedId(stop.id); setShowRoute(true); }}>
                  <span className="smart-route-day">Day {stop.day}{stop.time ? ` · ${stop.time}` : ""}</span>
                  <strong>{stop.name}</strong>
                  <span><Icon name="directions_bus" size={16} />{stop.terminal.name} <Icon name="arrow_forward" size={14} /> {stop.name}</span>
                  <small>{stop.directions}</small>
                </button>
                <span className="smart-route-actions">
                  <span className="smart-route-time"><strong>{stop.travelMinutes} min</strong><small>{stop.travelDistanceKm} km</small></span>
                  <button className="smart-route-done-btn" onClick={() => markStopDone(stop)}><Icon name={completedStops.has(stop.id) ? "check_circle" : "radio_button_unchecked"} size={17} />{completedStops.has(stop.id) ? "Done" : "Mark done"}</button>
                  <button className="itinerary-replace-btn" style={{ marginTop: 4 }} onClick={() => setReplaceTarget({ day: stop.day, stopIndex, currentTitle: stop.name })}>
                    <Icon name="swap_horiz" size={14} /> Replace
                  </button>
                </span>
              </article>
            ))}
          </div>
          {completedDayPrompt === activeDay && (
            <Card className="smart-day-complete">
              <Icon name="task_alt" size={29} color="var(--c-green)" filled />
              <div><strong>Day {activeDay} is complete</strong><p>{routeDays.indexOf(activeDay) < routeDays.length - 1 ? "Would you like to proceed to the next day?" : "You’ve completed the full itinerary."}</p></div>
              {routeDays.indexOf(activeDay) < routeDays.length - 1 ? <><Button label={`Proceed to Day ${routeDays[routeDays.indexOf(activeDay) + 1]}`} onPress={proceedToNextDay} /><Button label={`Stay on Day ${activeDay}`} onPress={() => setCompletedDayPrompt(null)} secondary /></> : <Button label="Keep viewing this plan" onPress={() => setCompletedDayPrompt(null)} secondary />}
            </Card>
          )}
        </section>
      ) : !loadingPlans ? (
        <EmptyState icon="route" title="No itinerary route yet" message="Generate and save an itinerary first. Its destinations and boarding terminals will appear here automatically. Search above or tap the map to route anywhere like Waze." />
      ) : (
        <div className="smart-map-loading"><div className="spinner" /><span>Loading itinerary routes…</span></div>
      )}

      <ReplacePlaceModal
        visible={replaceTarget !== null}
        target={replaceTarget}
        onClose={() => setReplaceTarget(null)}
        onSelectReplacement={handleSelectReplacement}
      />

      {/* ── Spring bottom sheet — place detail (cinematic) ── */}
      {bottomSheetPlace && !isNavigating && (
        <>
          <div className="mayon-bottom-sheet-backdrop" onClick={() => { setBottomSheetPlace(null); setSelectedId(""); }} aria-hidden="true" />
          <div className="mayon-bottom-sheet" role="dialog" aria-modal="true" aria-label={bottomSheetPlace.name}>
            <div className="mayon-sheet-handle" aria-hidden="true" />
            <div className="mayon-sheet-head">
              {(() => {
                const img = (catalog.find((p) => p.id === (bottomSheetPlace as any).id)?.source) ?? (bottomSheetPlace as any).source ?? explore1;
                const isStop = (bottomSheetPlace as any).day != null;
                return <><img src={img} alt={bottomSheetPlace.name} /><div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bottomSheetPlace.name}</strong><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bottomSheetPlace.subtitle}</span>{isStop && <span style={{ color: "var(--c-muted)", fontSize: 11 }}>{(bottomSheetPlace as any).directions ?? ""}</span>}</div><button type="button" onClick={() => { setBottomSheetPlace(null); setSelectedId(""); }} aria-label="Close detail" style={{ width: 36, height: 36, borderRadius: 999, background: "var(--c-chip)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="close" size={18} color="var(--c-body)" /></button></>;
              })()}
            </div>
            <div className="mayon-sheet-meta">
              <span><Icon name="schedule" size={14} color="var(--c-green)" /> {(bottomSheetPlace as any).travelMinutes != null ? `${(bottomSheetPlace as any).travelMinutes} min` : pointToPointMinutes != null ? `${pointToPointMinutes} min` : "Estimate"} </span>
              <span><Icon name="straighten" size={14} color="var(--c-green)" /> {(bottomSheetPlace as any).travelDistanceKm != null ? `${(bottomSheetPlace as any).travelDistanceKm} km` : pointToPointDistance != null ? `${pointToPointDistance} km` : "Nearby"}</span>
              {(bottomSheetPlace as any).terminal && <span><Icon name="directions_bus" size={14} color="var(--c-green)" /> {(bottomSheetPlace as any).terminal.transport}</span>}
              <span><Icon name="landscape" size={14} color="var(--c-green)" /> {elevationProfile ? `${Math.round(elevationProfile.reduce((a,b)=>a+b,0)/elevationProfile.length)} m avg` : "Albay foothills"}</span>
            </div>
            <div className="mayon-sheet-actions">
              <button type="button" className="mayon-sheet-primary" onClick={() => { if (bottomSheetPlace) { const p = bottomSheetPlace as MapPlace; setDroppedPin(p); setDestinationId(p.id); setSelectedId(p.id); setBottomSheetPlace(null); if (startPointId === "current-location" && !liveLocation) setLiveTracking(true); } }}><Icon name="navigation" size={18} color="white" /> Route here</button>
              <button type="button" className="mayon-sheet-secondary" onClick={() => { if (!bottomSheetPlace) return; const url = `https://waze.com/ul?ll=${bottomSheetPlace.latitude},${bottomSheetPlace.longitude}&navigate=yes`; window.open(url, "_blank", "noopener,noreferrer"); }}><Icon name="open_in_new" size={16} /> Open in Waze</button>
            </div>
            <a href={bottomSheetPlace ? `https://www.google.com/maps/dir/?api=1&destination=${bottomSheetPlace.latitude},${bottomSheetPlace.longitude}` : "#"} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", borderRadius: 12, background: "#F9FCFA", border: "1px solid #E1E9E3", color: "var(--c-body)", fontSize: 11, fontWeight: 800, textDecoration: "none" }}><Icon name="map" size={14} /> Open in Google Maps • Copy coords {bottomSheetPlace.latitude.toFixed(4)}, {bottomSheetPlace.longitude.toFixed(4)}</a>
          </div>
        </>
      )}
    </div>
  );
}
