import explore1 from "@/assets/images/hilinga/explore-1.png";
import explore2 from "@/assets/images/hilinga/explore-2.png";
import explore3 from "@/assets/images/hilinga/explore-3.png";
import explore4 from "@/assets/images/hilinga/explore-4.png";
import explore5 from "@/assets/images/hilinga/explore-5.png";
import explore6 from "@/assets/images/hilinga/explore-6.png";

import type { MapTerminal } from "@/components/openstreet-map";
import type { TripPlan } from "@/lib/database";
import type { SavedKind } from "@/lib/database";
import { readVerifiedSmallBusinesses } from "@/lib/business-content";

// ── Types ──
export type ExploreKind = "All" | "Places" | "Businesses" | "Events" | "Experiences";
export type ExploreView = "For you" | "All" | "Latest";
export type BusinessScale = "Small business" | "Big enterprise";

export type ExploreItem = {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  kind: Exclude<ExploreKind, "All">;
  savedKind: SavedKind;
  visits: number;
  imageKey: string;
  source: string;
  latitude: number;
  longitude: number;
  detail?: string;
  location?: string;
  logoSource?: string;
  businessScale?: BusinessScale;
  registered?: boolean;
  ownerUid?: string;
};

// ── Catalog (single source of truth) ──
export const catalog: ExploreItem[] = [
  { id: "cagsawa-ruins", name: "Cagsawa Ruins", subtitle: "Historic landmark with an iconic Mayon view", category: "Heritage", kind: "Places", savedKind: "Places", visits: 28400, imageKey: "cagsawa", source: explore1, latitude: 13.16606, longitude: 123.70105 },
  { id: "mayon-skyline", name: "Mayon Skyline", subtitle: "Scenic mountain viewpoint and nature stop", category: "Nature", kind: "Places", savedKind: "Places", visits: 21900, imageKey: "mayon", source: explore2, latitude: 13.28477, longitude: 123.67124 },
  { id: "sumlang-lake", name: "Sumlang Lake", subtitle: "Lakeside scenery, food, and local crafts", category: "Nature", kind: "Places", savedKind: "Places", visits: 17600, imageKey: "sumlang", source: explore3, latitude: 13.17891, longitude: 123.67148 },
  { id: "albay-coffee-house", name: "Albay Coffee House", subtitle: "Bicol-grown coffee and freshly baked pastries", category: "Cafes", kind: "Businesses", savedKind: "Businesses", visits: 12800, imageKey: "cafe", source: explore4, latitude: 13.1417, longitude: 123.7416, location: "Old Albay District, Legazpi City", businessScale: "Small business" },
  { id: "legazpi-local-market", name: "Legazpi Local Market", subtitle: "Regional food, produce, crafts, and local makers", category: "Shopping", kind: "Businesses", savedKind: "Businesses", visits: 15200, imageKey: "market", source: explore6, latitude: 13.1435, longitude: 123.7522, location: "Legazpi Port District, Legazpi City", businessScale: "Small business" },
  { id: "pacific-mall-legazpi", name: "Pacific Mall Legazpi", subtitle: "Shopping, dining, services, and entertainment", category: "Shopping", kind: "Businesses", savedKind: "Businesses", visits: 18600, imageKey: "market", source: explore6, latitude: 13.1442, longitude: 123.7458, location: "Landco Business Park, Legazpi City", businessScale: "Big enterprise" },
  { id: "the-oriental-legazpi", name: "The Oriental Legazpi", subtitle: "A hillside stay with sweeping city and Mayon views", category: "Stay", kind: "Businesses", savedKind: "Businesses", visits: 14300, imageKey: "highlands", source: explore5, latitude: 13.1394, longitude: 123.7281, location: "Taysan Hill, Legazpi City", businessScale: "Big enterprise" },
  { id: "mayon-atv-adventure", name: "Mayon ATV Adventure", subtitle: "Guided lava-trail ride beneath Mayon Volcano", category: "Activities", kind: "Experiences", savedKind: "Places", visits: 11900, imageKey: "highlands", source: explore5, latitude: 13.1722, longitude: 123.6990 },
  { id: "ibalong-street-festival", name: "Ibalong Street Festival", subtitle: "Masks, music, and performances inspired by the Ibalong epic", category: "Heritage", kind: "Events", savedKind: "Events", visits: 19800, detail: "Aug 22 · 4:00 PM", imageKey: "market", source: explore6, latitude: 13.1390, longitude: 123.7336 },
  { id: "legazpi-night-market", name: "Legazpi Weekend Night Market", subtitle: "Local food stalls, music, crafts, and homegrown finds", category: "Food", kind: "Events", savedKind: "Events", visits: 7600, detail: "Saturdays · 5:00 PM", imageKey: "cafe", source: explore4, latitude: 13.1390, longitude: 123.7336 },
];

export const routeDestinations = [
  ...catalog,
  { id: "bacacay-coast", name: "Bacacay coast and island views", subtitle: "Beach and island route", latitude: 13.2922, longitude: 123.7930 },
  { id: "mayon-trail", name: "Mayon nature and photography walk", subtitle: "Nature trail and viewpoint", latitude: 13.1574, longitude: 123.7465 },
  { id: "mayon-atv", name: "Mayon ATV Adventure", subtitle: "Adventure activity", latitude: 13.1722, longitude: 123.6990 },
  { id: "camalig-food", name: "Market shopping and Bicolano tasting", subtitle: "Food and local market", latitude: 13.1471, longitude: 123.6591 },
  { id: "albay-museum", name: "Albay arts and museum stop", subtitle: "Arts and culture", latitude: 13.1392, longitude: 123.7345 },
  { id: "legazpi-market", name: "Local market and crafts", subtitle: "Shopping and crafts", latitude: 13.1435, longitude: 123.7522 },
  { id: "legazpi-nightlife", name: "Legazpi evening spots", subtitle: "Dining and nightlife", latitude: 13.1458, longitude: 123.7542 },
  { id: "sumlang-photo", name: "Mayon golden-hour photo stop", subtitle: "Photography viewpoint", latitude: 13.17891, longitude: 123.67148 },
  { id: "sumlang-wellness", name: "Lakeside rest and wellness break", subtitle: "Wellness and relaxation", latitude: 13.17891, longitude: 123.67148 },
  { id: "albay-wildlife", name: "Albay Park & Wildlife", subtitle: "Family-friendly attraction", latitude: 13.1396, longitude: 123.7240 },
  { id: "legazpi-boulevard", name: "Sunset at Legazpi Boulevard", subtitle: "Waterfront experience", latitude: 13.1324, longitude: 123.7565 },
  { id: "daraga-church", name: "Daraga faith and heritage trail", subtitle: "Heritage and spiritual site", latitude: 13.1477, longitude: 123.7108 },
  { id: "penaranda-park", name: "Local festival or community event", subtitle: "Community event area", latitude: 13.1390, longitude: 123.7336 },
  { id: "hidden-gem", name: "Guide-picked Albay hidden gem", subtitle: "Locally recommended stop", latitude: 13.1650, longitude: 123.7270 },
] as const;

export const routeTerminals: Record<string, MapTerminal> = {
  legazpi: { id: "terminal-legazpi", name: "Ibalong Grand Central Terminal", subtitle: "Main Legazpi transport hub", latitude: 13.1437, longitude: 123.7435, transport: "Jeepney, UV Express, bus, or tricycle" },
  daraga: { id: "terminal-daraga", name: "Daraga Public Market Terminal", subtitle: "Daraga jeepney and tricycle stop", latitude: 13.1470, longitude: 123.7117, transport: "Daraga jeepney or tricycle" },
  camalig: { id: "terminal-camalig", name: "Camalig town-center transport stop", subtitle: "Approximate local boarding area", latitude: 13.1481, longitude: 123.6602, transport: "Jeepney or local tricycle" },
  tabaco: { id: "terminal-tabaco", name: "Tabaco City Central Terminal", subtitle: "Tabaco transport hub", latitude: 13.3590, longitude: 123.7300, transport: "UV Express, jeepney, or tricycle" },
  bacacay: { id: "terminal-bacacay", name: "Bacacay town-center transport stop", subtitle: "Approximate local boarding area", latitude: 13.2927, longitude: 123.7914, transport: "Jeepney or local tricycle" },
};

export function distanceKm(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function resolveRouteDestination(title: string) {
  const normalized = title.toLowerCase();
  const registeredBiz = readVerifiedSmallBusinesses();
  const bizMatch = registeredBiz.find((biz) => normalized.includes(biz.name.toLowerCase()) || biz.name.toLowerCase().includes(normalized));
  if (bizMatch) {
    return {
      id: `registered-${bizMatch.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: bizMatch.name,
      subtitle: `${bizMatch.category} • Registered Local Business (${bizMatch.location})`,
      latitude: 13.1390,
      longitude: 123.7336,
    };
  }
  const match = routeDestinations.find((destination) => normalized.includes(destination.name.toLowerCase()) || destination.name.toLowerCase().includes(normalized));
  if (match) return match;
  if (normalized.includes("cagsawa") || normalized.includes("atv")) return catalog[0];
  if (normalized.includes("nature trail")) return routeDestinations.find((place) => place.id === "mayon-trail")!;
  if (normalized.includes("sumlang") || normalized.includes("lake")) return catalog[2];
  if (normalized.includes("mayon skyline") || normalized.includes("highland")) return catalog[1];
  if (normalized.includes("daraga") || normalized.includes("church")) return routeDestinations.find((place) => place.id === "daraga-church")!;
  if (normalized.includes("food") || normalized.includes("tasting")) return routeDestinations.find((place) => place.id === "camalig-food")!;
  if (normalized.includes("market") || normalized.includes("shopping")) return routeDestinations.find((place) => place.id === "legazpi-market")!;
  if (normalized.includes("boulevard") || normalized.includes("sunset") || normalized.includes("romantic")) return routeDestinations.find((place) => place.id === "legazpi-boulevard")!;
  return { id: `custom-${normalized.replace(/[^a-z0-9]+/g, "-")}`, name: title, subtitle: "Approximate central Albay location", latitude: 13.1390, longitude: 123.7336 };
}

export function terminalForDestination(destination: { latitude: number; longitude: number }): MapTerminal {
  if (destination.longitude > 123.77) return routeTerminals.bacacay;
  if (destination.latitude > 13.25) return routeTerminals.tabaco;
  if (destination.longitude < 123.69) return routeTerminals.camalig;
  if (destination.longitude < 123.72) return routeTerminals.daraga;
  return routeTerminals.legazpi;
}

export function buildMapRoute(plan: TripPlan): import("@/components/openstreet-map").MapRouteStop[] {
  const stops = plan.itinerary?.flatMap((day) => day.stops.map((stop, stopIndex) => ({ day: day.day, stopIndex, stop }))) ?? [];
  return stops.map(({ day, stopIndex, stop }, index) => {
    const destination = resolveRouteDestination(stop.title);
    const terminal = terminalForDestination(destination);
    const d = distanceKm(terminal, destination) * 1.25;
    const minutes = Math.max(8, Math.round((d / 24) * 60 + 6));
    return {
      ...destination,
      id: `${plan.id}-${day}-${stopIndex}-${destination.id}`,
      day,
      order: index + 1,
      time: stop.time,
      travelMinutes: minutes,
      travelDistanceKm: Math.round(d * 10) / 10,
      terminal,
      directions: `Board at ${terminal.name}. Take a ${terminal.transport.toLowerCase()} toward ${destination.name}, then confirm the nearest drop-off with the driver.`,
    };
  });
}

export const savedImages: Record<string, string> = {
  cagsawa: explore1,
  mayon: explore2,
  sumlang: explore3,
  cafe: explore4,
  highlands: explore5,
  market: explore6,
};
