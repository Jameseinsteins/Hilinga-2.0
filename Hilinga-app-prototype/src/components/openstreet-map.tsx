import "leaflet/dist/leaflet.css";

import type { Map as LeafletMap } from "leaflet";
import { useEffect, useRef } from "react";
import type { RegisteredSmallBusiness } from "@/lib/business-content";

export type MapPlace = {
  id: string;
  name: string;
  subtitle: string;
  latitude: number;
  longitude: number;
};

export type MapTerminal = MapPlace & {
  transport: string;
};

export type MapRouteStop = MapPlace & {
  day: number;
  order: number;
  time: string;
  travelMinutes: number;
  travelDistanceKm: number;
  terminal: MapTerminal;
  directions: string;
};

export type RouteStep = {
  instruction: string;
  distance: number;
  duration: number;
  maneuver: string;
};

type OpenStreetMapProps = {
  places: readonly MapPlace[];
  routeStops?: readonly MapRouteStop[];
  selectedId: string;
  onSelect: (id: string) => void;
  liveLocation?: (MapPlace & { accuracy: number; heading?: number | null; speed?: number | null }) | null;
  startPoint?: MapPlace | null;
  destination?: MapPlace | null;
  routeGeometry?: readonly [number, number][];
  routeSteps?: readonly RouteStep[];
  onMapPress?: (place: MapPlace) => void;
  registeredBusinesses?: readonly RegisteredSmallBusiness[];
  showTransportRoutes?: boolean;
  showRegisteredBusinesses?: boolean;
  followMode?: boolean;
  bearing?: number | null;
  mapStyle?: "standard" | "dark" | "satellite" | "terrain";
  showFog?: boolean;
  animateRoute?: boolean;
  clusterPins?: boolean;
};

const LEGAZPI = { latitude: 13.1333, longitude: 123.7333 } as const;
export const MAYON_PEAK = { latitude: 13.2573, longitude: 123.6850, name: "Mayon Volcano" } as const;

export const ALBAY_TRANSPORT_TERMINALS: MapTerminal[] = [
  { id: "terminal-legazpi", name: "Ibalong Grand Central Terminal", subtitle: "Main Legazpi bus, UV & jeepney hub", latitude: 13.1437, longitude: 123.7435, transport: "Jeepney, UV Express, Bus, Tricycle" },
  { id: "terminal-daraga", name: "Daraga Public Market Terminal", subtitle: "Daraga jeepney & tricycle hub", latitude: 13.1470, longitude: 123.7117, transport: "Daraga Jeepney, Tricycle" },
  { id: "terminal-camalig", name: "Camalig Town Transport Hub", subtitle: "West Albay jeepney stop", latitude: 13.1481, longitude: 123.6602, transport: "Jeepney, Tricycle" },
  { id: "terminal-guinobatan", name: "Guinobatan Central Stop", subtitle: "Guinobatan highway stop", latitude: 13.1903, longitude: 123.6010, transport: "Jeepney, Bus, UV Express" },
  { id: "terminal-ligao", name: "Ligao City Transport Terminal", subtitle: "West Albay central terminal", latitude: 13.2411, longitude: 123.5358, transport: "UV Express, Jeepney, Bus" },
  { id: "terminal-tabaco", name: "Tabaco City Central Terminal", subtitle: "North Albay bus, UV & ferry hub", latitude: 13.3590, longitude: 123.7300, transport: "UV Express, Jeepney, Bus, Ferry" },
  { id: "terminal-bacacay", name: "Bacacay Town Transport Stop", subtitle: "East coast jeepney terminal", latitude: 13.2927, longitude: 123.7914, transport: "Jeepney, Tricycle, Boat" },
];

export const ALBAY_TRANSPORT_ROUTES = [
  { name: "Legazpi \u2013 Daraga Jeepney Route", type: "Jeepney", color: "#F59E0B", path: [[13.1437,123.7435],[13.1391,123.7438],[13.1417,123.7150],[13.1470,123.7117]] as [number, number][] },
  { name: "West Albay Route (Legazpi \u2013 Camalig \u2013 Ligao)", type: "Bus / Jeepney / UV Express", color: "#3B82F6", path: [[13.1437,123.7435],[13.1470,123.7117],[13.1481,123.6602],[13.1903,123.6010],[13.2411,123.5358]] as [number, number][] },
  { name: "North Albay Route (Legazpi \u2013 Sto. Domingo \u2013 Tabaco)", type: "UV Express / Bus", color: "#8B5CF6", path: [[13.1437,123.7435],[13.2356,123.7744],[13.3150,123.7380],[13.3590,123.7300]] as [number, number][] },
  { name: "Tabaco \u2013 Bacacay Coastal Route", type: "Jeepney", color: "#10B981", path: [[13.3590,123.7300],[13.2927,123.7914]] as [number, number][] },
];

function escapeHtml(value: string) {
  return value.replace(/[&<>'\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

const TILE_LAYERS = {
  standard: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19 },
  dark: { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>', maxZoom: 19 },
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics', maxZoom: 19 },
  terrain: { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)', maxZoom: 17 },
} as const;

type PlaceCluster = { key: string; latitude: number; longitude: number; members: MapPlace[] };
function clusterPlaces(places: readonly MapPlace[], thresholdDeg = 0.018): PlaceCluster[] {
  if (places.length <= 1) return places.map((p) => ({ key: p.id, latitude: p.latitude, longitude: p.longitude, members: [p] }));
  const clusters: PlaceCluster[] = [];
  const used = new Set<string>();
  for (const a of places) {
    if (used.has(a.id)) continue;
    const members: MapPlace[] = [a];
    used.add(a.id);
    for (const b of places) {
      if (used.has(b.id)) continue;
      const dLat = a.latitude - b.latitude;
      const dLng = a.longitude - b.longitude;
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist < thresholdDeg) { members.push(b); used.add(b.id); }
    }
    if (members.length === 1) clusters.push({ key: a.id, latitude: a.latitude, longitude: a.longitude, members });
    else {
      const lat = members.reduce((s, m) => s + m.latitude, 0) / members.length;
      const lng = members.reduce((s, m) => s + m.longitude, 0) / members.length;
      clusters.push({ key: `cluster-${clusters.length}-${a.id}`, latitude: lat, longitude: lng, members });
    }
  }
  return clusters;
}

export function OpenStreetMap({
  places,
  routeStops = [],
  selectedId,
  onSelect,
  liveLocation = null,
  startPoint = null,
  destination = null,
  routeGeometry = [],
  routeSteps: _routeSteps = [],
  onMapPress,
  registeredBusinesses = [],
  showTransportRoutes = true,
  showRegisteredBusinesses = true,
  followMode = false,
  bearing = null,
  mapStyle = "standard",
  showFog = true,
  animateRoute = true,
  clusterPins = true,
}: OpenStreetMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tileLayerRef = useRef<any>(null);
  const contentLayerRef = useRef<any>(null);
  const hasFittedRef = useRef(false);
  const prevRouteKeyRef = useRef("");

  // keep callbacks stable without tearing the map
  const onSelectRef = useRef(onSelect);
  const onMapPressRef = useRef(onMapPress);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onMapPressRef.current = onMapPress; }, [onMapPress]);

  // ── 1) Create map once ──
  useEffect(() => {
    let active = true;
    let ro: ResizeObserver | null = null;
    async function init() {
      const container = hostRef.current;
      if (!container) return;
      const L = await import("leaflet");
      if (!active) return;
      if (mapRef.current) return; // already created
      const map = L.map(container, { zoomControl: false, attributionControl: true }).setView([LEGAZPI.latitude, LEGAZPI.longitude], 12);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.control.scale({ position: "bottomleft", metric: true, imperial: false }).addTo(map);
      map.on("click", (event: any) => {
        const cb = onMapPressRef.current;
        if (!cb) return;
        const { lat, lng } = event.latlng;
        cb({ id: `pin-${Date.now()}`, name: "Selected location", subtitle: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, latitude: lat, longitude: lng });
      });
      // slight drag debounce: if user drags, turn off followMode via map movestart? parent controls, we don't auto-toggle here
      mapRef.current = map;
      contentLayerRef.current = (L as any).layerGroup().addTo(map);
      requestAnimationFrame(() => map.invalidateSize());
      setTimeout(() => map.invalidateSize(), 200);
      setTimeout(() => map.invalidateSize(), 600);
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(container);
      (map as any)._hilingaRO = ro;
    }
    void init();
    return () => {
      active = false;
      if (ro) ro.disconnect();
      if (mapRef.current) {
        const oldRO = (mapRef.current as any)._hilingaRO as ResizeObserver | undefined;
        if (oldRO) oldRO.disconnect();
        mapRef.current.remove();
        mapRef.current = null;
        tileLayerRef.current = null;
        contentLayerRef.current = null;
      }
    };
  }, []);

  // ── 2) Tile layer — swap without destroying map ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current) return;
      if (tileLayerRef.current) {
        try { map.removeLayer(tileLayerRef.current); } catch {}
        tileLayerRef.current = null;
      }
      const tiles = TILE_LAYERS[mapStyle as keyof typeof TILE_LAYERS] ?? TILE_LAYERS.standard;
      tileLayerRef.current = (L as any).tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: tiles.maxZoom }).addTo(map);
    })();
    return () => { cancelled = true; };
  }, [mapStyle]);

  // ── 3) Content layers — rebuild markers/routes in a LayerGroup, never remove the map ──
  useEffect(() => {
    const map = mapRef.current;
    const group = contentLayerRef.current;
    if (!map || !group) return;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current || !contentLayerRef.current) return;
      const g = contentLayerRef.current;
      g.clearLayers();

      // Mayon peak hint when fog/terrain
      if (mapStyle === "terrain" || showFog) {
        (L as any).circle([MAYON_PEAK.latitude, MAYON_PEAK.longitude], { radius: 2200, color: "#FFFFFF", weight: 1, fillColor: "#FFFFFF", fillOpacity: 0.06 }).addTo(g);
        const peakIcon = (L as any).divIcon({
          className: "mayon-peak-label",
          html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;filter:drop-shadow(0 1px 6px rgba(0,0,0,0.35))"><div style="width:10px;height:10px;border-radius:50%;background:#12291E;border:2px solid white;box-shadow:0 1px 6px rgba(0,0,0,0.25)"></div><span style="background:rgba(18,41,30,0.88);color:white;font-size:9px;font-weight:900;letter-spacing:0.6px;padding:3px 6px;border-radius:999px;white-space:nowrap;">MAYON 2,463 m</span></div>`,
          iconSize: [90, 32], iconAnchor: [45, 16],
        });
        (L as any).marker([MAYON_PEAK.latitude, MAYON_PEAK.longitude], { icon: peakIcon, interactive: false, zIndexOffset: -100 }).addTo(g);
      }

      if (showTransportRoutes) {
        ALBAY_TRANSPORT_ROUTES.forEach((route) => {
          (L as any).polyline(route.path, { color: route.color, weight: 4, opacity: 0.75, dashArray: "8 6" }).bindTooltip(`${escapeHtml(route.name)} (${escapeHtml(route.type)})`, { permanent: false, direction: "top" }).addTo(g);
        });
        ALBAY_TRANSPORT_TERMINALS.forEach((terminal) => {
          const marker = (L as any).circleMarker([terminal.latitude, terminal.longitude], { color: "#FFFFFF", fillColor: "#D97706", fillOpacity: 1, radius: 9, weight: 3 });
          marker.bindPopup(`<strong>\uD83D\uDE8C ${escapeHtml(terminal.name)}</strong><br/><span style="color:#D97706;font-weight:800;font-size:11px;">Transport Hub</span><br/><strong>Vehicles:</strong> ${escapeHtml(terminal.transport)}<br/>${escapeHtml(terminal.subtitle)}`);
          marker.addTo(g);
        });
      }

      if (showRegisteredBusinesses && registeredBusinesses.length > 0) {
        registeredBusinesses.forEach((biz) => {
          const marker = (L as any).circleMarker([biz.latitude, biz.longitude], { color: "#FFFFFF", fillColor: "#00A86B", fillOpacity: 1, radius: 10, weight: 3 });
          marker.bindTooltip(`\uD83C\uDFEA ${escapeHtml(biz.name)}`, { permanent: false, direction: "top" });
          marker.bindPopup(`<div style="min-width:170px;display:flex;flex-direction:column;gap:3px;"><span style="color:#00A86B;font-weight:800;font-size:11px;letter-spacing:0.3px;">\u2713 REGISTERED LOCAL BUSINESS</span><strong style="font-size:14px;color:#101828;">${escapeHtml(biz.name)}</strong><span style="font-size:12px;color:#475467;">${escapeHtml(biz.category)} \u2022 ${escapeHtml(biz.location)}</span><div style="margin-top:4px;font-size:11px;color:#344054;line-height:1.4;">${escapeHtml(biz.about)}</div><div style="margin-top:4px;font-size:10px;color:#00A86B;font-weight:800;">Hours: ${escapeHtml(biz.hours)}</div></div>`);
          marker.addTo(g);
        });
      }

      if (liveLocation) {
        const headingVal = (bearing ?? (liveLocation as any).heading) ?? null;
        const headingDeg = headingVal != null && Number.isFinite(headingVal) ? headingVal : null;
        (L as any).circle([liveLocation.latitude, liveLocation.longitude], { radius: liveLocation.accuracy, color: "#007A50", weight: 1, fillColor: "#007A50", fillOpacity: 0.12 }).addTo(g);
        if (headingDeg != null) {
          const icon = (L as any).divIcon({
            className: "waze-puck",
            html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;transform:rotate(${headingDeg}deg);filter:drop-shadow(0 2px 6px rgba(0,0,0,0.35));"><div style="width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-bottom:18px solid #1A73E8;position:relative;"><div style="position:absolute;left:-6px;top:13px;width:12px;height:12px;background:#1A73E8;border-radius:50%;border:2px solid white;"></div></div></div>`,
            iconSize: [28, 28], iconAnchor: [14, 14],
          });
          (L as any).marker([liveLocation.latitude, liveLocation.longitude], { icon, zIndexOffset: 1000, interactive: false }).addTo(g);
        } else {
          (L as any).circleMarker([liveLocation.latitude, liveLocation.longitude], { color: "#FFFFFF", fillColor: "#1A73E8", fillOpacity: 1, radius: 10, weight: 3 }).bindPopup("<strong>Your live location</strong><br>Updating as you move").addTo(g);
          (L as any).circleMarker([liveLocation.latitude, liveLocation.longitude], { color: "#1A73E8", fillColor: "#1A73E8", fillOpacity: 0.18, radius: 18, weight: 1 }).addTo(g);
        }
      }

      if (startPoint) {
        const isLiveStart = liveLocation && Math.abs(startPoint.latitude - liveLocation.latitude) < 0.0001 && Math.abs(startPoint.longitude - liveLocation.longitude) < 0.0001;
        if (!isLiveStart) (L as any).circleMarker([startPoint.latitude, startPoint.longitude], { color: "#FFFFFF", fillColor: "#0F766E", fillOpacity: 1, radius: 9, weight: 3 }).bindPopup(`<strong>Start: ${escapeHtml(startPoint.name)}</strong><br>${escapeHtml(startPoint.subtitle)}`).addTo(g);
      }

      if (destination) {
        const isSameAsStart = startPoint && Math.abs(destination.latitude - startPoint.latitude) < 0.00005 && Math.abs(destination.longitude - startPoint.longitude) < 0.00005;
        if (!isSameAsStart) {
          const destIcon = (L as any).divIcon({
            className: "waze-dest",
            html: `<div style="width:26px;height:26px;background:#EA4335;border:2.5px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.28);"><span style="transform:rotate(45deg);color:white;font-size:13px;line-height:1;">\uD83C\uDFC1</span></div>`,
            iconSize: [26, 26], iconAnchor: [13, 24],
          });
          (L as any).marker([destination.latitude, destination.longitude], { icon: destIcon, zIndexOffset: 800 }).bindPopup(`<strong>Destination: ${escapeHtml(destination.name)}</strong><br>${escapeHtml(destination.subtitle)}`).addTo(g);
        }
      }

      if (startPoint && destination) {
        const path = routeGeometry.length > 0 ? ([...routeGeometry] as [number, number][]) : [[startPoint.latitude, startPoint.longitude], [destination.latitude, destination.longitude]] as [number, number][];
        (L as any).polyline(path, { color: "#FFFFFF", weight: 12, opacity: 0.96, lineCap: "round", lineJoin: "round", className: animateRoute ? "mayon-route-casing" : undefined }).addTo(g);
        (L as any).polyline(path, { color: "#1A73E8", weight: 7, opacity: 0.95, lineCap: "round", lineJoin: "round", className: animateRoute ? "mayon-route-animate" : undefined }).addTo(g);
        (L as any).polyline(path, { color: "#FFFFFF", weight: 1.5, opacity: 0.35, dashArray: "10 14", lineCap: "round" }).addTo(g);
      }

      const routeStopIds = new Set(routeStops.map((stop) => stop.id));
      const filteredPlaces = places.filter((place) => !routeStopIds.has(place.id));
      const useClusters = clusterPins && filteredPlaces.length > 2 && routeStops.length === 0;
      const clusters = useClusters ? clusterPlaces(filteredPlaces) : filteredPlaces.map((p) => ({ key: p.id, latitude: p.latitude, longitude: p.longitude, members: [p] as MapPlace[] }));

      clusters.forEach((cluster) => {
        if (cluster.members.length > 1) {
          const icon = (L as any).divIcon({
            className: "mayon-cluster-wrap",
            html: `<button type="button" aria-label="${cluster.members.length} places clustered" style="border:0;background:transparent;padding:0;cursor:pointer"><div class="mayon-cluster">${cluster.members.length}<small>${cluster.members.length} PINS</small></div></button>`,
            iconSize: [42, 42], iconAnchor: [21, 21],
          });
          const marker = (L as any).marker([cluster.latitude, cluster.longitude], { icon, zIndexOffset: 300 });
          const names = cluster.members.map((m) => `\u2022 ${escapeHtml(m.name)}`).join("<br/>");
          marker.bindPopup(`<strong>${cluster.members.length} places near here</strong><br/><span style="font-size:11px;color:#475467;line-height:1.5">${names}</span><br/><span style="font-size:10px;color:#75837B">Tap a place in the search or bottom sheet to open</span>`);
          marker.on("click", () => {
            const bounds = (L as any).latLngBounds(cluster.members.map((m) => [m.latitude, m.longitude] as [number, number]));
            map.fitBounds(bounds.pad(0.35), { maxZoom: 15 });
          });
          marker.addTo(g);
          return;
        }
        const place = cluster.members[0];
        const isSelected = selectedId === place.id;
        const icon = (L as any).divIcon({
          className: "mayon-pin-wrap",
          html: `<button type="button" aria-label="${escapeHtml(place.name)}" style="border:0;background:transparent;padding:0;cursor:pointer"><div class="mayon-pulse-pin ${isSelected ? "mayon-pulse-pin-selected" : ""}"></div></button>`,
          iconSize: [18, 18], iconAnchor: [9, 9],
        });
        const marker = (L as any).marker([place.latitude, place.longitude], { icon, zIndexOffset: isSelected ? 500 : 200 });
        marker.bindPopup(`<strong>${escapeHtml(place.name)}</strong><br>${escapeHtml(place.subtitle)}`);
        marker.on("click", () => onSelectRef.current(place.id));
        marker.addTo(g);
      });

      if (routeStops.length > 0) {
        const terminals = new Map(routeStops.map((stop) => [stop.terminal.id, stop.terminal]));
        terminals.forEach((terminal) => {
          (L as any).circleMarker([terminal.latitude, terminal.longitude], { color: "#FFFFFF", fillColor: "#D97706", fillOpacity: 1, radius: 9, weight: 3 }).bindPopup(`<strong>${escapeHtml(terminal.name)}</strong><br>${escapeHtml(terminal.transport)} boarding point`).addTo(g);
        });
        routeStops.forEach((stop, index) => {
          const isSelected = selectedId === stop.id;
          const icon = (L as any).divIcon({
            className: "mayon-route-stop",
            html: `<button type="button" aria-label="Stop ${index + 1}: ${escapeHtml(stop.name)}" style="border:0;background:transparent;padding:0;cursor:pointer;position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center"><div class="mayon-pulse-pin ${isSelected ? "mayon-pulse-pin-selected" : ""}" style="position:absolute;inset:0;width:32px;height:32px;border-radius:50%"></div><div style="position:relative;width:28px;height:28px;border-radius:50%;background:${isSelected ? "#1A73E8" : "#146C94"};border:2.5px solid white;display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:900;box-shadow:0 2px 10px rgba(0,0,0,0.22)">${index + 1}</div></button>`,
            iconSize: [32, 32], iconAnchor: [16, 16],
          });
          const marker = (L as any).marker([stop.latitude, stop.longitude], { icon, zIndexOffset: isSelected ? 600 : 400 });
          marker.bindPopup(`<strong>${escapeHtml(stop.name)}</strong><br>${escapeHtml(stop.directions)}<br>About ${stop.travelMinutes} min`);
          marker.on("click", () => onSelectRef.current(stop.id));
          marker.addTo(g);
        });
        const routePoints = routeStops.map((stop) => [stop.latitude, stop.longitude] as [number, number]);
        if (routePoints.length > 1) {
          (L as any).polyline(routePoints, { color: "#FFFFFF", weight: 10, opacity: 0.95, lineCap: "round", lineJoin: "round", className: "mayon-route-casing" }).addTo(g);
          (L as any).polyline(routePoints, { color: "#146C94", weight: 6, opacity: 0.92, lineCap: "round", lineJoin: "round", className: animateRoute ? "mayon-route-animate" : undefined }).addTo(g);
        }
        routeStops.forEach((stop) => {
          (L as any).polyline([[stop.terminal.latitude, stop.terminal.longitude], [stop.latitude, stop.longitude]], { color: "#D97706", weight: 3, opacity: 0.72, dashArray: "7 7" }).addTo(g);
        });
      }

      // ── Smart fit: only when route changes or first load, NOT on every pan / liveLocation tick ──
      const routeKey = `${routeStops.map((s) => s.id).join(",")}:${startPoint?.id ?? ""}:${destination?.id ?? ""}:${routeGeometry.length}:${mapStyle}`;
      const isNewRoute = routeKey !== prevRouteKeyRef.current;
      if (isNewRoute) {
        prevRouteKeyRef.current = routeKey;
        hasFittedRef.current = false;
      }
      if (!hasFittedRef.current) {
        if (startPoint && destination) {
          const bounds = (L as any).latLngBounds([[startPoint.latitude, startPoint.longitude],[destination.latitude, destination.longitude]]);
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
          hasFittedRef.current = true;
        } else if (routeStops.length > 0) {
          const boundsPoints = routeStops.flatMap((stop) => [[stop.terminal.latitude, stop.terminal.longitude],[stop.latitude, stop.longitude]] as [number, number][]);
          if (startPoint) boundsPoints.push([startPoint.latitude, startPoint.longitude] as [number, number]);
          if (boundsPoints.length > 0) { map.fitBounds((L as any).latLngBounds(boundsPoints), { padding: [34, 34], maxZoom: 14 }); hasFittedRef.current = true; }
        } else if (places.length > 0 && !liveLocation) {
          // don't auto-fit on every places change if user is panning; only first time
          // skip — let user control
        }
      }
      // liveLocation follow is handled by separate pan effect below, not by tearing down

    })();
    return () => { cancelled = true; };
  }, [places, routeStops, liveLocation, startPoint, destination, routeGeometry, registeredBusinesses, showTransportRoutes, showRegisteredBusinesses, bearing, mapStyle, showFog, animateRoute, clusterPins, selectedId]);

  // ── 4) selectedId fly — keep but don't rebuild map ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const target = routeStops.find((stop) => stop.id === selectedId) ?? places.find((place) => place.id === selectedId);
    if (target) map.flyTo([target.latitude, target.longitude], 15, { duration: 0.8 });
  }, [selectedId, places, routeStops]);

  // ── 5) followMode pan — throttled, doesn't rebuild layers ──
  useEffect(() => {
    if (!followMode || !liveLocation || !mapRef.current) return;
    mapRef.current.panTo([liveLocation.latitude, liveLocation.longitude], { animate: true, duration: 0.5 });
  }, [liveLocation, followMode]);

  return (
    <div className="leaflet-map-container" style={{ position: "relative" }}>
      <div ref={hostRef} className="leaflet-map" aria-label="OpenStreetMap interactive map view" />
      {onMapPress && <div className="map-tap-hint">Tap map to drop pin \u2014 or search above</div>}
      {showFog && <div className="mayon-fog-overlay" aria-hidden="true" />}
      {mapStyle === "terrain" && <div className="mayon-terrain-hint" aria-hidden="true">\u25B2 Terrain \u2022 Mayon 2,463 m</div>}
    </div>
  );
}
