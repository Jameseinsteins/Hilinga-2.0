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
  mapStyle?: "standard" | "dark" | "satellite";
};

const LEGAZPI = { latitude: 13.1333, longitude: 123.7333 };

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
  {
    name: "Legazpi – Daraga Jeepney Route",
    type: "Jeepney",
    color: "#F59E0B",
    path: [
      [13.1437, 123.7435],
      [13.1391, 123.7438],
      [13.1417, 123.7150],
      [13.1470, 123.7117],
    ] as [number, number][],
  },
  {
    name: "West Albay Route (Legazpi – Camalig – Ligao)",
    type: "Bus / Jeepney / UV Express",
    color: "#3B82F6",
    path: [
      [13.1437, 123.7435],
      [13.1470, 123.7117],
      [13.1481, 123.6602],
      [13.1903, 123.6010],
      [13.2411, 123.5358],
    ] as [number, number][],
  },
  {
    name: "North Albay Route (Legazpi – Sto. Domingo – Tabaco)",
    type: "UV Express / Bus",
    color: "#8B5CF6",
    path: [
      [13.1437, 123.7435],
      [13.2356, 123.7744],
      [13.3150, 123.7380],
      [13.3590, 123.7300],
    ] as [number, number][],
  },
  {
    name: "Tabaco – Bacacay Coastal Route",
    type: "Jeepney",
    color: "#10B981",
    path: [
      [13.3590, 123.7300],
      [13.2927, 123.7914],
    ] as [number, number][],
  },
];

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

const TILE_LAYERS = {
  standard: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
} as const;

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
}: OpenStreetMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tileLayerRef = useRef<any>(null);

  useEffect(() => {
    let active = true;
    async function setupMap() {
      const container = hostRef.current;
      if (!container) return;
      const L = await import("leaflet");
      if (!active) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        tileLayerRef.current = null;
      }

      const center: [number, number] = liveLocation
        ? [liveLocation.latitude, liveLocation.longitude]
        : startPoint
          ? [startPoint.latitude, startPoint.longitude]
          : destination
            ? [destination.latitude, destination.longitude]
            : [LEGAZPI.latitude, LEGAZPI.longitude];

      const map = L.map(container, { zoomControl: false, attributionControl: true }).setView(center, 12);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.control.scale({ position: "bottomleft", metric: true, imperial: false }).addTo(map);

      const tiles = TILE_LAYERS[mapStyle] ?? TILE_LAYERS.standard;
      tileLayerRef.current = L.tileLayer(tiles.url, {
        attribution: tiles.attribution,
        maxZoom: tiles.maxZoom,
      }).addTo(map);

      if (onMapPress) {
        map.on("click", (event) => {
          const { lat, lng } = event.latlng;
          onMapPress({
            id: `pin-${Date.now()}`,
            name: "Selected location",
            subtitle: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
            latitude: lat,
            longitude: lng,
          });
        });
      }

      // ── Transportation Routes & Hub Terminals ──
      if (showTransportRoutes) {
        ALBAY_TRANSPORT_ROUTES.forEach((route) => {
          L.polyline(route.path, {
            color: route.color,
            weight: 4,
            opacity: 0.75,
            dashArray: "8 6",
          }).bindTooltip(`${escapeHtml(route.name)} (${escapeHtml(route.type)})`, { permanent: false, direction: "top" }).addTo(map);
        });

        ALBAY_TRANSPORT_TERMINALS.forEach((terminal) => {
          const marker = L.circleMarker([terminal.latitude, terminal.longitude], {
            color: "#FFFFFF",
            fillColor: "#D97706",
            fillOpacity: 1,
            radius: 9,
            weight: 3,
          });
          marker.bindPopup(`<strong>🚌 ${escapeHtml(terminal.name)}</strong><br/><span style="color:#D97706;font-weight:800;font-size:11px;">Transport Hub</span><br/><strong>Vehicles:</strong> ${escapeHtml(terminal.transport)}<br/>${escapeHtml(terminal.subtitle)}`);
          marker.addTo(map);
        });
      }

      // ── Registered Small Businesses Layer ──
      if (showRegisteredBusinesses && registeredBusinesses.length > 0) {
        registeredBusinesses.forEach((biz) => {
          const marker = L.circleMarker([biz.latitude, biz.longitude], {
            color: "#FFFFFF",
            fillColor: "#00A86B",
            fillOpacity: 1,
            radius: 10,
            weight: 3,
          });
          marker.bindTooltip(`🏪 ${escapeHtml(biz.name)}`, { permanent: false, direction: "top" });
          marker.bindPopup(`
            <div style="min-width: 170px; display: flex; flex-direction: column; gap: 3px;">
              <span style="color:#00A86B; font-weight:800; font-size:11px; letter-spacing:0.3px;">✓ REGISTERED LOCAL BUSINESS</span>
              <strong style="font-size:14px; color:#101828;">${escapeHtml(biz.name)}</strong>
              <span style="font-size:12px; color:#475467;">${escapeHtml(biz.category)} • ${escapeHtml(biz.location)}</span>
              <div style="margin-top:4px; font-size:11px; color:#344054; line-height:1.4;">${escapeHtml(biz.about)}</div>
              <div style="margin-top:4px; font-size:10px; color:#00A86B; font-weight:800;">Hours: ${escapeHtml(biz.hours)}</div>
            </div>
          `);
          marker.addTo(map);
        });
      }

      // ── Live location (Waze-style puck) ──
      if (liveLocation) {
        const headingVal = (bearing ?? (liveLocation as any).heading) ?? null;
        const headingDeg = headingVal != null && Number.isFinite(headingVal) ? headingVal : null;
        // Accuracy circle first (under)
        L.circle([liveLocation.latitude, liveLocation.longitude], {
          radius: liveLocation.accuracy,
          color: "#007A50",
          weight: 1,
          fillColor: "#007A50",
          fillOpacity: 0.12,
        }).addTo(map);

        if (headingDeg != null) {
          // Waze-like directional puck — triangle arrow
          const icon = L.divIcon({
            className: "waze-puck",
            html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;transform:rotate(${headingDeg}deg);filter:drop-shadow(0 2px 6px rgba(0,0,0,0.35));"><div style="width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-bottom:18px solid #1A73E8;position:relative;"><div style="position:absolute;left:-6px;top:13px;width:12px;height:12px;background:#1A73E8;border-radius:50%;border:2px solid white;"></div></div></div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          L.marker([liveLocation.latitude, liveLocation.longitude], { icon, zIndexOffset: 1000, interactive: false }).addTo(map);
        } else {
          // Dot when no heading
          L.circleMarker([liveLocation.latitude, liveLocation.longitude], {
            color: "#FFFFFF",
            fillColor: "#1A73E8",
            fillOpacity: 1,
            radius: 10,
            weight: 3,
          }).bindPopup("<strong>Your live location</strong><br>Updating as you move").addTo(map);
          // Outer halo
          L.circleMarker([liveLocation.latitude, liveLocation.longitude], {
            color: "#1A73E8",
            fillColor: "#1A73E8",
            fillOpacity: 0.18,
            radius: 18,
            weight: 1,
          }).addTo(map);
        }
      }

      if (startPoint) {
        const isLiveStart = liveLocation && Math.abs(startPoint.latitude - liveLocation.latitude) < 0.0001 && Math.abs(startPoint.longitude - liveLocation.longitude) < 0.0001;
        if (!isLiveStart) {
          L.circleMarker([startPoint.latitude, startPoint.longitude], {
            color: "#FFFFFF",
            fillColor: "#0F766E",
            fillOpacity: 1,
            radius: 9,
            weight: 3,
          }).bindPopup(`<strong>Start: ${escapeHtml(startPoint.name)}</strong><br>${escapeHtml(startPoint.subtitle)}`).addTo(map);
        }
      }

      if (destination) {
        const isSameAsStart = startPoint && Math.abs(destination.latitude - startPoint.latitude) < 0.00005 && Math.abs(destination.longitude - startPoint.longitude) < 0.00005;
        if (!isSameAsStart) {
          const destIcon = L.divIcon({
            className: "waze-dest",
            html: `<div style="width:26px;height:26px;background:#EA4335;border:2.5px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.28);"><span style="transform:rotate(45deg);color:white;font-size:13px;line-height:1;">🏁</span></div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 24],
          });
          L.marker([destination.latitude, destination.longitude], { icon: destIcon, zIndexOffset: 800 }).bindPopup(`<strong>Destination: ${escapeHtml(destination.name)}</strong><br>${escapeHtml(destination.subtitle)}`).addTo(map);
        }
      }

      if (startPoint && destination) {
        const bounds = L.latLngBounds([
          [startPoint.latitude, startPoint.longitude],
          [destination.latitude, destination.longitude],
        ]);
        const path = routeGeometry.length > 0 ? [...routeGeometry] : [[startPoint.latitude, startPoint.longitude], [destination.latitude, destination.longitude]] as [number, number][];
        // Waze-style casing: white outline + blue center + dashed traffic feel
        L.polyline(path, { color: "#FFFFFF", weight: 12, opacity: 0.96, lineCap: "round", lineJoin: "round" }).addTo(map);
        L.polyline(path, { color: "#1A73E8", weight: 7, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(map);
        // Center line dash for Waze highlight
        L.polyline(path, { color: "#FFFFFF", weight: 1.5, opacity: 0.35, dashArray: "10 14", lineCap: "round" }).addTo(map);
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
        if (followMode && liveLocation) {
          map.setView([liveLocation.latitude, liveLocation.longitude], Math.max(map.getZoom(), 15), { animate: true, duration: 0.6 });
        }
      }

      const routeStopIds = new Set(routeStops.map((stop) => stop.id));
      places.filter((place) => !routeStopIds.has(place.id)).forEach((place) => {
        const marker = L.circleMarker([place.latitude, place.longitude], {
          color: "#FFFFFF",
          fillColor: "#B42318",
          fillOpacity: 1,
          radius: 8,
          weight: 3,
        });
        marker.bindPopup(`<strong>${escapeHtml(place.name)}</strong><br>${escapeHtml(place.subtitle)}`);
        marker.on("click", () => onSelect(place.id));
        marker.addTo(map);
      });

      if (routeStops.length > 0) {
        const terminals = new Map(routeStops.map((stop) => [stop.terminal.id, stop.terminal]));
        terminals.forEach((terminal) => {
          L.circleMarker([terminal.latitude, terminal.longitude], {
            color: "#FFFFFF",
            fillColor: "#D97706",
            fillOpacity: 1,
            radius: 9,
            weight: 3,
          }).bindPopup(`<strong>${escapeHtml(terminal.name)}</strong><br>${escapeHtml(terminal.transport)} boarding point`).addTo(map);
        });

        routeStops.forEach((stop, index) => {
          const isSelected = selectedId === stop.id;
          const marker = L.circleMarker([stop.latitude, stop.longitude], {
            color: "#FFFFFF",
            fillColor: isSelected ? "#1A73E8" : "#146C94",
            fillOpacity: 1,
            radius: isSelected ? 13 : 10,
            weight: 3,
          });
          marker.bindTooltip(String(index + 1), { permanent: true, direction: "center", className: "route-number-tooltip" });
          marker.bindPopup(`<strong>${escapeHtml(stop.name)}</strong><br>${escapeHtml(stop.directions)}<br>About ${stop.travelMinutes} min`);
          marker.on("click", () => onSelect(stop.id));
          marker.addTo(map);
        });

        const routePoints = routeStops.map((stop) => [stop.latitude, stop.longitude] as [number, number]);
        if (routePoints.length > 1) {
          // Waze casing for itinerary route
          L.polyline(routePoints, { color: "#FFFFFF", weight: 10, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(map);
          L.polyline(routePoints, { color: "#146C94", weight: 6, opacity: 0.92, lineCap: "round", lineJoin: "round" }).addTo(map);
        }
        routeStops.forEach((stop) => {
          L.polyline([
            [stop.terminal.latitude, stop.terminal.longitude],
            [stop.latitude, stop.longitude],
          ], { color: "#D97706", weight: 3, opacity: 0.72, dashArray: "7 7" }).addTo(map);
        });
        const boundsPoints = routeStops.flatMap((stop) => [
          [stop.terminal.latitude, stop.terminal.longitude] as [number, number],
          [stop.latitude, stop.longitude] as [number, number],
        ]);
        if (startPoint) boundsPoints.push([startPoint.latitude, startPoint.longitude]);
        if (liveLocation && followMode) {
          boundsPoints.push([liveLocation.latitude, liveLocation.longitude]);
          map.fitBounds(L.latLngBounds(boundsPoints), { padding: [40, 40], maxZoom: 14 });
          // Then center on live location for follow
          setTimeout(() => {
            if (active && mapRef.current && liveLocation) {
              mapRef.current.setView([liveLocation.latitude, liveLocation.longitude], Math.max(mapRef.current.getZoom(), 15), { animate: true });
            }
          }, 300);
        } else {
          if (boundsPoints.length > 0) map.fitBounds(L.latLngBounds(boundsPoints), { padding: [34, 34], maxZoom: 14 });
        }
      }

      mapRef.current = map;
      // Ensure tiles render after container settles (Fixes blank map on first open)
      requestAnimationFrame(() => map.invalidateSize());
      setTimeout(() => map.invalidateSize(), 200);
      setTimeout(() => map.invalidateSize(), 600);
      // ResizeObserver for container changes
      const ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(container);
      (map as any)._hilingaRO = ro;
    }

    void setupMap();
    return () => {
      active = false;
      if (mapRef.current) {
        const ro = (mapRef.current as any)._hilingaRO as ResizeObserver | undefined;
        if (ro) ro.disconnect();
        mapRef.current.remove();
        mapRef.current = null;
        tileLayerRef.current = null;
      }
    };
  }, [places, routeStops, liveLocation, startPoint, destination, routeGeometry, onSelect, onMapPress, registeredBusinesses, showTransportRoutes, showRegisteredBusinesses, followMode, bearing, mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const target = routeStops.find((stop) => stop.id === selectedId) ?? places.find((place) => place.id === selectedId);
    if (target) map.flyTo([target.latitude, target.longitude], 15, { duration: 0.8 });
  }, [selectedId, places, routeStops]);

  // Follow-mode: keep centered on live location when navigating
  useEffect(() => {
    if (!followMode || !liveLocation || !mapRef.current) return;
    mapRef.current.panTo([liveLocation.latitude, liveLocation.longitude], { animate: true, duration: 0.5 });
  }, [liveLocation, followMode]);

  return (
    <div className="leaflet-map-container">
      <div ref={hostRef} className="leaflet-map" aria-label="OpenStreetMap interactive map view" />
      {onMapPress && <div className="map-tap-hint">Tap map to drop pin — or search above</div>}
    </div>
  );
}
