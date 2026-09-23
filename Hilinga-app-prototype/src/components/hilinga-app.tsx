import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MapPlace, MapRouteStop, MapTerminal, OpenStreetMap } from "@/components/openstreet-map";
import { BusinessRegistrationDashboard } from "@/components/business-registration-dashboard";
// NOTE: MapScreen and ExploreScreen need API fixes - temporarily disabled
// import { MapScreen } from "@/components/screens/MapScreen";
// import { ExploreScreen } from "@/components/screens/ExploreScreen";

import {
  ItineraryDay,
  Profile as ProfileData,
  resetLocalAccount,
  SavedItem,
  SavedKind,
  getSetting,
  TripPlan,
  updateProfile,
} from "@/lib/database";
import {
  createTripPlan,
  deleteTripPlan,
  getSavedIds,
  getSavedItems,
  getTripPlans,
  removeSavedItem,
  saveItem,
  updateTripPlan,
} from "@/lib/cloud-user-data";
import type { AvatarUpload } from "@/lib/cloud-profile";
import { generateAiItinerary } from "@/lib/ai-itinerary";
import { ItineraryChatPanel } from "@/components/itinerary-chat-panel";
import { SkeletonPlanner, SkeletonProfile, SkeletonSaved } from "@/components/skeleton";
import { Tooltip } from "@/components/tooltip";
import {
  BUSINESS_CONTENT_CHANGED_EVENT,
  BusinessPost,
  RegisteredSmallBusiness,
  readPublishedBusinessPosts,
  readRegisteredBusinesses,
  readRegisteredSmallBusinesses,
  subscribeToPublishedBusinessPosts,
  subscribeToRegisteredBusinesses,
} from "@/lib/business-content";
import {
  CommunityPost,
  createCommunityPost,
  deleteCommunityPost,
  ExperienceCategory,
  experienceCategories,
  subscribeToCommunityPosts,
} from "@/lib/community-feed";
import {
  recordBusinessProfileView,
  sendBusinessInquiry,
  setBusinessPostLiked,
  subscribeToLikedBusinessPosts,
} from "@/lib/business-engagement";
import { useAuth } from "@/providers/auth-provider";
import { useDatabase } from "@/providers/database-provider";
import { ProfileQrCard } from "@/components/tourist-passport";

import explore1 from "@/assets/images/hilinga/explore-1.png";
import explore2 from "@/assets/images/hilinga/explore-2.png";
import explore3 from "@/assets/images/hilinga/explore-3.png";
import explore4 from "@/assets/images/hilinga/explore-4.png";
import explore5 from "@/assets/images/hilinga/explore-5.png";
import explore6 from "@/assets/images/hilinga/explore-6.png";
import iconExploreNearby from "@/assets/svg/explore-nearby-icon.svg";
import iconAiItinerary from "@/assets/svg/ai-itinerary-icon.svg";
import iconFoodCafe from "@/assets/svg/food-cafe-icon.svg";
import iconEvents from "@/assets/svg/events-icon.svg";
import iconTransportation from "@/assets/svg/transportation-icon.svg";
import iconMap from "@/assets/svg/map-icon.svg";
import iconStay from "@/assets/svg/stay-icon.svg";
import iconEmergency from "@/assets/svg/emergency-icon.svg";

type Tab = "Home" | "Explore" | "Planner" | "Feed" | "Profile";
type Notice = { title: string; message: string } | null;

type ExploreKind = "All" | "Places" | "Businesses" | "Events" | "Experiences";
type ExploreView = "For you" | "All" | "Latest";
type BusinessScale = "Small business" | "Big enterprise";
type ExploreItem = {
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

const catalog: ExploreItem[] = [
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

const routeDestinations = [
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

const routeTerminals: Record<string, MapTerminal> = {
  legazpi: { id: "terminal-legazpi", name: "Ibalong Grand Central Terminal", subtitle: "Main Legazpi transport hub", latitude: 13.1437, longitude: 123.7435, transport: "Jeepney, UV Express, bus, or tricycle" },
  daraga: { id: "terminal-daraga", name: "Daraga Public Market Terminal", subtitle: "Daraga jeepney and tricycle stop", latitude: 13.1470, longitude: 123.7117, transport: "Daraga jeepney or tricycle" },
  camalig: { id: "terminal-camalig", name: "Camalig town-center transport stop", subtitle: "Approximate local boarding area", latitude: 13.1481, longitude: 123.6602, transport: "Jeepney or local tricycle" },
  tabaco: { id: "terminal-tabaco", name: "Tabaco City Central Terminal", subtitle: "Tabaco transport hub", latitude: 13.3590, longitude: 123.7300, transport: "UV Express, jeepney, or tricycle" },
  bacacay: { id: "terminal-bacacay", name: "Bacacay town-center transport stop", subtitle: "Approximate local boarding area", latitude: 13.2927, longitude: 123.7914, transport: "Jeepney or local tricycle" },
};

function distanceKm(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resolveRouteDestination(title: string) {
  const normalized = title.toLowerCase();
  const registeredBiz = readRegisteredSmallBusinesses();
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

function terminalForDestination(destination: { latitude: number; longitude: number }): MapTerminal {
  if (destination.longitude > 123.77) return routeTerminals.bacacay;
  if (destination.latitude > 13.25) return routeTerminals.tabaco;
  if (destination.longitude < 123.69) return routeTerminals.camalig;
  if (destination.longitude < 123.72) return routeTerminals.daraga;
  return routeTerminals.legazpi;
}

function buildMapRoute(plan: TripPlan): MapRouteStop[] {
  const stops = plan.itinerary?.flatMap((day) => day.stops.map((stop, stopIndex) => ({ day: day.day, stopIndex, stop }))) ?? [];
  return stops.map(({ day, stopIndex, stop }, index) => {
    const destination = resolveRouteDestination(stop.title);
    const terminal = terminalForDestination(destination);
    const distance = distanceKm(terminal, destination) * 1.25;
    const minutes = Math.max(8, Math.round((distance / 24) * 60 + 6));
    return {
      ...destination,
      id: `${plan.id}-${day}-${stopIndex}-${destination.id}`,
      day,
      order: index + 1,
      time: stop.time,
      travelMinutes: minutes,
      travelDistanceKm: Math.round(distance * 10) / 10,
      terminal,
      directions: `Board at ${terminal.name}. Take a ${terminal.transport.toLowerCase()} toward ${destination.name}, then confirm the nearest drop-off with the driver.`,
    };
  });
}

const savedImages: Record<string, string> = {
  cagsawa: explore1,
  mayon: explore2,
  sumlang: explore3,
  cafe: explore4,
  highlands: explore5,
  market: explore6,
};

type BusinessProfile = {
  name: string;
  category: string;
  location: string;
  description: string;
};

type PromotedProduct = {
  id: string;
  name: string;
  category: string;
  price: string;
  description: string;
  createdAt: string;
};

const placeSuggestions = [
  { id: "feed-cagsawa", name: "Cagsawa Ruins", description: "Walk through Albay's iconic history with a front-row view of Mayon.", category: "Heritage", location: "Daraga, Albay", imageKey: "cagsawa", source: explore1, kind: "Places", visits: 28400, featured: true },
  { id: "feed-mayon", name: "Mayon Skyline", description: "Cool mountain air, sweeping viewpoints, and a memorable scenic drive.", category: "Nature", location: "Tabaco, Albay", imageKey: "mayon", source: explore2, kind: "Places", visits: 21900 },
  { id: "feed-sumlang", name: "Sumlang Lake", description: "A relaxed lakeside stop for local food, crafts, and Mayon views.", category: "Nature", location: "Camalig, Albay", imageKey: "sumlang", source: explore3, kind: "Places", visits: 17600 },
  { id: "feed-cafe", name: "Albay Coffee Trail", description: "Discover cozy local cafes serving Bicol-grown coffee and fresh pastries.", category: "Cafes", location: "Legazpi City", imageKey: "cafe", source: explore4, kind: "Businesses", visits: 12800, featured: true },
  { id: "feed-highlands", name: "Legazpi Highlands", description: "Find quiet green trails and elevated viewpoints just outside the city.", category: "Nature", location: "Legazpi, Albay", imageKey: "highlands", source: explore5, kind: "Places", visits: 9400 },
  { id: "feed-market", name: "Legazpi Local Market", description: "Taste street food, browse regional products, and meet local makers.", category: "Shopping", location: "Legazpi City", imageKey: "market", source: explore6, kind: "Businesses", visits: 15200 },
  { id: "feed-bicol-food", name: "Bicolano Food Finds", description: "Try pinangat, laing, sili ice cream, and other proudly local favorites.", category: "Food", location: "Old Albay District", imageKey: "market", source: explore6, kind: "Businesses", visits: 11300 },
  { id: "feed-restaurants", name: "Mayon-view Restaurants", description: "Plan a meal with regional dishes and an unforgettable volcano backdrop.", category: "Restaurants", location: "Legazpi Boulevard", imageKey: "cafe", source: explore4, kind: "Businesses", visits: 8900 },
  { id: "feed-ibig-sayaw", name: "Ibalong Street Festival", description: "See colorful masks, dance performances, and stories inspired by the Ibalong epic.", category: "Heritage", location: "Legazpi City", imageKey: "market", source: explore6, kind: "Events", visits: 19800, detail: "Aug 22 · 4:00 PM" },
  { id: "feed-night-market", name: "Legazpi Weekend Night Market", description: "Spend an evening with local food stalls, music, crafts, and homegrown finds.", category: "Food", location: "Peñaranda Park", imageKey: "cafe", source: explore4, kind: "Events", visits: 7600, detail: "Saturdays · 5:00 PM" },
];

const tabIcons: Record<Tab, string> = {
  Home: "home",
  Explore: "explore",
  Planner: "calendar_today",
  Feed: "dynamic_feed",
  Profile: "person",
};

// ── Shared Components ──

function Icon({ name, size = 24, color, filled, className = "" }: { name: string; size?: number; color?: string; filled?: boolean; className?: string }) {
  return <span className={`material-symbols-outlined ${filled ? "icon-filled" : ""} ${className}`} style={{ fontSize: size, color }}>{name}</span>;
}

function Card({ children, className = "", style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`card ${className}`} style={style}>{children}</div>;
}

function ScreenHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="title-row">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function StatusPill({ label, tone = "green" }: { label: string; tone?: "green" | "amber" }) {
  return (
    <span className={`status-pill ${tone === "amber" ? "status-pill-amber" : ""}`}>
      <span className="dot" />
      <span className="label">{label}</span>
    </span>
  );
}

function Button({ label, onPress, disabled = false, destructive = false, loading = false, secondary = false }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  loading?: boolean;
  secondary?: boolean;
}) {
  const cls = destructive ? (secondary ? "btn btn-destructive" : "btn btn-destructive-fill") : secondary ? "btn btn-secondary" : "btn btn-primary";
  return (
    <button type="button" className={cls} disabled={disabled || loading} onClick={onPress}>
      {loading ? <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2, borderTopColor: secondary ? (destructive ? "var(--c-red)" : "var(--c-green)") : "white" }} /> : label}
    </button>
  );
}

function Field({ label, value, onChangeText, placeholder, error, keyboardType = "default", multiline = false }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  error?: string;
  keyboardType?: "default" | "number-pad";
  multiline?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <label className="field-label">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChangeText(e.target.value)}
          placeholder={placeholder}
          className={`input ${error ? "input-error" : ""}`}
          style={{ minHeight: 88, resize: "vertical" }}
        />
      ) : (
        <input
          type={keyboardType === "number-pad" ? "number" : "text"}
          value={value}
          onChange={(e) => onChangeText(e.target.value)}
          placeholder={placeholder}
          className={`input ${error ? "input-error" : ""}`}
        />
      )}
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}

function AppModal({ visible, title, children, onClose }: { visible: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!visible) return null;
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button onClick={onClose} aria-label={`Close ${title}`}>
            <Icon name="cancel" size={28} color="var(--c-muted)" />
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ visible, title, message, confirmLabel, loading = false, onCancel, onConfirm }: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AppModal visible={visible} title={title} onClose={onCancel}>
      <p style={{ color: "var(--c-body)", lineHeight: "22px" }}>{message}</p>
      <Button label={confirmLabel} destructive onPress={onConfirm} loading={loading} />
      <Button label="Cancel" onPress={onCancel} secondary disabled={loading} />
    </AppModal>
  );
}

function EmptyState({ icon, title, message, action, onAction }: { icon: string; title: string; message: string; action?: string; onAction?: () => void }) {
  return (
    <Card className="empty-state">
      <Icon name={icon} size={34} color="var(--c-muted)" />
      <span style={{ fontSize: 17, fontWeight: 800, textAlign: "center" }}>{title}</span>
      <span style={{ color: "var(--c-body)", textAlign: "center", lineHeight: "21px" }}>{message}</span>
      {action && onAction ? <Button label={action} onPress={onAction} secondary /> : null}
    </Card>
  );
}

function BottomTabs({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const { avatarUrl, user } = useAuth();
  const profilePictureUrl = avatarUrl ?? user?.photoURL ?? null;

  return (
    <div className="tab-dock">
      <div className="tabs" role="tablist">
        {(Object.keys(tabIcons) as Tab[]).map((tab) => {
          const selected = active === tab;
          return (
            <button
              key={tab}
              onClick={() => onChange(tab)}
              role="tab"
              aria-label={`${tab} tab`}
              aria-selected={selected}
              className={`tab ${selected ? "tab-selected" : ""}`}
            >
              {tab === "Profile" && profilePictureUrl ? (
                <img src={profilePictureUrl} alt="" aria-hidden="true" className="tab-avatar" />
              ) : (
                <Icon name={tabIcons[tab]} size={21} className="tab-icon" />
              )}
              <span className="tab-label">{tab}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab Screens ──

function Home({ setTab, openMap, openEmergency, showNotice }: { setTab: (tab: Tab) => void; openMap: () => void; openEmergency: () => void; showNotice: (notice: NonNullable<Notice>) => void }) {
  const db = useDatabase();
  const { profile, user } = useAuth();
  const [dashboard, setDashboard] = useState({ name: "", saved: 0, plans: 0 });
  useEffect(() => {
    if (!user) return;
    Promise.all([getSavedItems(db, user.uid, "Places"), getTripPlans(db, user.uid)])
      .then(([saved, plans]) => setDashboard({ name: profile?.display_name ?? "", saved: saved.length, plans: plans.length }))
      .catch(() => undefined);
  }, [db, profile?.display_name, user]);

  const quick = [
    [iconExploreNearby, "Explore nearby", () => setTab("Explore")],
    [iconAiItinerary, "Plan a trip", () => setTab("Planner")],
    [iconFoodCafe, "Food & cafes", () => setTab("Explore")],
    [iconEvents, "Events", () => showNotice({ title: "Events unavailable", message: "Live event listings require a connected listings service. No events are shown until one is configured." })],
    [iconTransportation, "Transportation", () => showNotice({ title: "Transport unavailable", message: "Live routes and fares require a transport data provider." })],
    [iconMap, "Map", openMap],
    [iconStay, "Stay", () => showNotice({ title: "Stays unavailable", message: "Accommodation search requires a booking or listings provider." })],
    [iconEmergency, "Emergency", openEmergency],
  ] as const;

  const firstSteps: [string, string, string, Tab][] = [
    ["explore", "Explore and save", "Browse local destinations and keep your favorites.", "Explore"],
    ["edit_calendar", "Build a trip plan", "Add your time, budget, transport, and interests.", "Planner"],
    ["manage_accounts", "Personalize Hilinga", "Set your profile and travel preferences.", "Profile"],
  ];

  return (
    <div className="screen">
      <div className="home-header">
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="eyebrow">WELCOME TO HILINGA</span>
          <h1 className="hero-text">{dashboard.name ? `Hello, ${dashboard.name}.` : "Your Legazpi journey starts here."}</h1>
          <p className="page-subtitle">Plan confidently, explore locally, and keep essential travel tools close.</p>
        </div>
      </div>

      <Card className="dashboard-card">
        <div className="title-row">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="card-eyebrow">YOUR TRAVEL DASHBOARD</span>
            <span style={{ color: "white", fontSize: 20, fontWeight: 900 }}>Ready for Legazpi</span>
          </div>
          <span className="dashboard-icon"><Icon name="location_on" size={24} color="white" /></span>
        </div>
        <div className="stats-row">
          {[["3", "Places nearby"], [String(dashboard.saved), "Saved"], [String(dashboard.plans), "Trip plans"]].map(([value, label]) => (
            <div key={label} className="stat-item">
              <span className="stat-value">{value}</span>
              <span className="stat-label">{label}</span>
            </div>
          ))}
        </div>
        <button className="dashboard-action" onClick={() => setTab("Planner")}>
          <span style={{ color: "var(--c-green-dark)", fontWeight: 900 }}>Create a trip plan</span>
          <Icon name="arrow_forward" size={18} color="var(--c-green-dark)" />
        </button>
      </Card>

      <div className="quick-section">
        <div className="title-row">
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
            <h2 className="section-title">Places to explore</h2>
            <p className="section-subtitle">Curated ideas for your first trip.</p>
          </div>
          <button onClick={() => setTab("Explore")} style={{ color: "var(--c-green)", fontWeight: 800, cursor: "pointer", background: "none", border: "none", fontSize: 14 }}>See all</button>
        </div>
        <div className="h-scroll">
          {catalog.map((place) => (
            <div key={place.id} className="home-place-card card" onClick={() => setTab("Explore")}>
              <img src={place.source} alt={place.name} className="home-place-image" />
              <div style={{ padding: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 900 }}>{place.name}</span>
                <span style={{ color: "var(--c-body)", fontSize: 13 }}>{place.subtitle}</span>
                <StatusPill label={place.category} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <h2 className="section-title">What you can do</h2>
          <p className="section-subtitle">Everything you need for a smoother visit.</p>
        </div>
        <div className="feature-grid">
          {firstSteps.map(([icon, title, description, destination]) => (
            <button key={title} className="feature-card" onClick={() => setTab(destination)}>
              <span className="small-icon"><Icon name={icon} size={21} color="var(--c-green)" /></span>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontWeight: 900, textAlign: "left" }}>{title}</span>
                <span style={{ color: "var(--c-body)", fontSize: 13, lineHeight: "18px", textAlign: "left" }}>{description}</span>
              </div>
              <Icon name="chevron_right" size={17} color="var(--c-muted)" />
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <h2 className="section-title">Quick actions</h2>
          <p className="section-subtitle">Jump straight to popular tools.</p>
        </div>
        <div className="quick-grid">
          {quick.map(([source, label, onPress], index) => (
            <button key={label} className="quick-action" onClick={onPress}>
              <span className="quick-icon" style={index === 7 ? { backgroundColor: "#F7DDDD" } : undefined}>
                <img src={source} alt={label} />
              </span>
              <span className="quick-label" style={{ color: index === 7 ? "var(--c-red)" : "var(--c-body)" }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

function MapScreen({ initialPlanId, onClose }: { initialPlanId?: string | null; onClose: () => void }) {
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
  const [liveLocation, setLiveLocation] = useState<(MapPlace & { accuracy: number }) | null>(null);
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
  const [registeredBusinesses, setRegisteredBusinesses] = useState<RegisteredSmallBusiness[]>(() => readRegisteredSmallBusinesses());
  const [showTransportRoutes, setShowTransportRoutes] = useState(true);
  const [showRegisteredBusinesses, setShowRegisteredBusinesses] = useState(true);

  useEffect(() => {
    const refreshBusinesses = () => setRegisteredBusinesses(readRegisteredSmallBusinesses());
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

  useEffect(() => {
    if (!startPoint || !destination) {
      setRouteGeometry([]);
      setAutoRoute(null);
      setAutoRouteLoading(false);
      return;
    }
    const controller = new AbortController();
    const url = `https://router.project-osrm.org/route/v1/driving/${startPoint.longitude},${startPoint.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;
    setAutoRouteLoading(true);
    setAutoRouteError(null);
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Routing request failed with HTTP ${response.status}`);
        return response.json() as Promise<{ code?: string; routes?: Array<{ distance: number; duration: number; geometry: { coordinates: [number, number][] } }> }>;
      })
      .then((payload) => {
        const route = payload.routes?.[0];
        if (payload.code !== "Ok" || !route) throw new Error("No road route was returned");
        setRouteGeometry(route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]));
        setAutoRoute({ distanceKm: Math.round(route.distance / 100) / 10, durationMinutes: Math.max(1, Math.round(route.duration / 60)) });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRouteGeometry([]);
        setAutoRoute(null);
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
        setLiveLocation({
          id: "current-location",
          name: "Your live location",
          subtitle: "Updates as you move",
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        });
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
      if (current) setLiveLocation(null);
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
    setSelectedId("");
    setShowRoute(false);
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
    setNavToast(`Started active auto-routing to Stop 1: ${visibleRouteStops[0].name}`);
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

  return (
    <div className="map-screen">
      <div className="map-header">
        <button className="icon-btn" onClick={onClose} aria-label="Close map">
          <Icon name="arrow_back" size={23} color="var(--c-green)" />
        </button>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <h1 className="page-title">{isNavigating ? "Active Auto-Navigation" : "Map tools"}</h1>
          <span style={{ color: "var(--c-body)", fontSize: 13 }}>
            {isNavigating
              ? `Auto-routing to ${activeNavStop?.name ?? "destination"}`
              : pointToPointActive
                ? `Routing to ${destination?.name}`
                : selectedStop?.name ?? selectedPlace?.name ?? "Plan a route or explore nearby places."}
          </span>
        </div>
      </div>

      {navToast && (
        <div className="nav-toast" role="status">
          <Icon name="navigation" size={18} color="white" />
          <span>{navToast}</span>
        </div>
      )}

      {isNavigating && activeNavStop && (
        <Card className="nav-hud-top">
          <div className="nav-hud-header">
            <span className="nav-hud-badge">WAZE AUTO-ROUTING</span>
            <span className="nav-hud-stop-badge">Stop {currentNavStopIndex + 1} of {visibleRouteStops.length} (Day {activeDay})</span>
            <button className="nav-hud-exit-btn" onClick={() => setIsNavigating(false)}>Exit Waze Mode</button>
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
            <span><Icon name="schedule" size={16} />About {pointToPointMinutes ?? activeNavStop.travelMinutes} min</span>
            <span><Icon name="straighten" size={16} />{pointToPointDistance ?? activeNavStop.travelDistanceKm} km</span>
            <span><Icon name="directions_car" size={16} />{activeNavStop.terminal.transport}</span>
          </div>
          <button className="nav-hud-next-btn" onClick={advanceNavToNextStop}>
            <Icon name="check_circle" size={20} color="white" /> Mark Reached & Auto-Route Next Location
          </button>
        </Card>
      )}

      {!isNavigating && (
        <Card className="live-route-controls">
          <div className="live-route-heading">
            <div><span>LIVE NAVIGATION</span><strong>Start and destination</strong></div>
            <button className={`live-location-switch ${liveTracking ? "live-location-switch-active" : ""}`} role="switch" aria-checked={liveTracking} onClick={toggleLiveLocation}>
              <span className="live-location-switch-track"><i /></span>
              <Icon name="my_location" size={17} />{liveTracking ? "Live on" : "Use live location"}
            </button>
          </div>
          <div className="route-point-fields">
            <label><span><i className="route-point-dot route-point-start" />Starting point</span><select value={startPointId} onChange={(event) => { setStartPointId(event.target.value); if (event.target.value !== "current-location") { setLiveTracking(false); setLiveLocation(null); } }}><option value="current-location">My current location</option>{routeDestinations.map((place) => <option key={`start-${place.id}`} value={place.id}>{place.name}</option>)}</select></label>
            <button className="route-swap-button" onClick={swapRoutePoints} disabled={startPointId === "current-location"} aria-label="Swap starting point and destination"><Icon name="swap_vert" size={20} /></button>
            <label><span><i className="route-point-dot route-point-destination" />Destination</span><select value={destinationId} onChange={(event) => { setDroppedPin(null); setDestinationId(event.target.value); }}>{droppedPin && <option value="dropped-pin">Dropped pin ({droppedPin.subtitle})</option>}{routeDestinations.map((place) => <option key={`destination-${place.id}`} value={place.id}>{place.name}</option>)}</select></label>
          </div>
          {startPointId === "current-location" && !liveLocation && <p className="live-location-hint"><Icon name={liveTracking ? "location_searching" : "info"} size={16} />{liveTracking ? "Finding your live location…" : "Turn on live location to use your position as the starting point."}</p>}
          {locationError && <p className="live-location-error" role="alert"><Icon name="location_off" size={17} />{locationError}</p>}
          {pointToPointActive && <div className="live-route-summary"><span><Icon name="route" size={16} />{pointToPointDistance} km {autoRoute ? "by road" : "estimated"}</span><span><Icon name="schedule" size={16} />{autoRouteLoading ? "Routing…" : `About ${pointToPointMinutes} min`}</span><button onClick={openDirections}><Icon name="navigation" size={17} />Start directions</button></div>}
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
              <Icon name="navigation" size={19} color="white" />Start Waze Mode
            </button>
          </div>
        )}
      </Card>

      {routeError && <p className="error-text" role="alert">{routeError}</p>}

      {routeDays.length > 1 && (
        <div className="smart-map-days" aria-label="Itinerary days">
          {routeDays.map((day) => {
            const dayStops = routeStops.filter((stop) => stop.day === day);
            const dayDone = dayStops.length > 0 && dayStops.every((stop) => completedStops.has(stop.id));
            return <button key={day} className={activeDay === day ? "smart-map-day-active" : ""} onClick={() => { setActiveDay(day); setShowRoute(true); }}><Icon name={dayDone ? "check_circle" : "calendar_today"} size={16} />Day {day}</button>;
          })}
        </div>
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

      <OpenStreetMap
        places={showRoute && visibleRouteStops.length > 0 ? visibleRouteStops : catalog}
        routeStops={showRoute ? visibleRouteStops : []}
        selectedId={selectedId}
        onSelect={setSelectedId}
        liveLocation={liveLocation}
        startPoint={isNavigating || pointToPointActive ? startPoint : null}
        destination={isNavigating || pointToPointActive ? mapDestination : null}
        routeGeometry={routeGeometry}
        onMapPress={chooseDestination}
        registeredBusinesses={registeredBusinesses}
        showTransportRoutes={showTransportRoutes}
        showRegisteredBusinesses={showRegisteredBusinesses}
      />

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
        <EmptyState icon="route" title="No itinerary route yet" message="Generate and save an itinerary first. Its destinations and boarding terminals will appear here automatically." />
      ) : (
        <div className="smart-map-loading"><div className="spinner" /><span>Loading itinerary routes…</span></div>
      )}

      <ReplacePlaceModal
        visible={replaceTarget !== null}
        target={replaceTarget}
        onClose={() => setReplaceTarget(null)}
        onSelectReplacement={handleSelectReplacement}
      />
    </div>
  );
}

function Explore({ initialFilter, initialBusinessId, onFilterHandled, onBusinessHandled }: { initialFilter: string | null; initialBusinessId: string | null; onFilterHandled: () => void; onBusinessHandled: () => void }) {
  const db = useDatabase();
  const { user, profile, avatarUrl } = useAuth();
  const [filter, setFilter] = useState("All");
  const [kind, setKind] = useState<ExploreKind>("All");
  const [view, setView] = useState<ExploreView>("For you");
  const [query, setQuery] = useState("");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ExploreItem | null>(null);
  const [collection, setCollection] = useState<{ title: string; eyebrow: string; itemIds: string[] } | null>(null);
  const [reviews, setReviews] = useState<CommunityPost[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState<number | null>(null);
  const [reviewPosting, setReviewPosting] = useState(false);
  const [reviewDeleteTarget, setReviewDeleteTarget] = useState<CommunityPost | null>(null);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquiryMessage, setInquiryMessage] = useState("");
  const [inquirySending, setInquirySending] = useState(false);
  const [inquiryError, setInquiryError] = useState<string | null>(null);
  const [inquirySent, setInquirySent] = useState(false);

  const [businessDirectory, setBusinessDirectory] = useState(() => readRegisteredBusinesses());
  useEffect(() => {
    const refreshBusinesses = () => setBusinessDirectory([...readRegisteredBusinesses()]);
    window.addEventListener(BUSINESS_CONTENT_CHANGED_EVENT, refreshBusinesses);
    return () => window.removeEventListener(BUSINESS_CONTENT_CHANGED_EVENT, refreshBusinesses);
  }, []);
  const registeredBusinesses = useMemo<ExploreItem[]>(() => businessDirectory.map((page) => ({
    id: page.id,
    name: page.name,
    subtitle: page.about || `${page.category} registered on Hilinga`,
    category: page.category || "Shopping",
    kind: "Businesses",
    savedKind: "Businesses",
    visits: 0,
    imageKey: "registered-business",
    source: page.coverUrl || page.logoUrl || explore4,
    logoSource: page.logoUrl,
    latitude: page.latitude,
    longitude: page.longitude,
    location: page.location,
    businessScale: page.businessScale,
    registered: true,
    ownerUid: page.ownerUid,
  })), [businessDirectory]);
  const allItems = useMemo(() => [...registeredBusinesses, ...catalog], [registeredBusinesses]);

  useEffect(() => subscribeToCommunityPosts(
    (nextReviews) => { setReviews(nextReviews); setReviewsLoading(false); setReviewError(null); },
    () => { setReviewsLoading(false); setReviewError("Reviews could not be loaded. Check your connection and try again."); },
  ), []);

  const refresh = useCallback(async () => {
    if (user) setSavedIds(await getSavedIds(db, user.uid));
  }, [db, user]);
  useEffect(() => { refresh().catch(() => setError("Saved items could not be loaded.")); }, [refresh]);
  useEffect(() => { if (initialFilter) { setFilter(initialFilter); onFilterHandled(); } }, [initialFilter, onFilterHandled]);
  useEffect(() => {
    if (!initialBusinessId) return;
    const business = allItems.find((item) => item.id === initialBusinessId && item.kind === "Businesses");
    if (business) setSelected(business);
    onBusinessHandled();
  }, [allItems, initialBusinessId, onBusinessHandled]);
  useEffect(() => {
    setInquiryOpen(false);
    setInquiryMessage("");
    setInquiryError(null);
    setInquirySent(false);
  }, [selected?.id]);
  useEffect(() => {
    if (!user?.uid || !selected?.registered || !selected.ownerUid) return;
    void recordBusinessProfileView({
      businessId: selected.ownerUid,
      businessName: selected.name,
      viewerUid: user.uid,
    }).catch(() => undefined);
  }, [selected, user?.uid]);
  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches = allItems.filter((item) =>
      (kind === "All" || item.kind === kind)
      && (filter === "All" || item.category === filter)
      && `${item.name} ${item.subtitle} ${item.category} ${item.kind}`.toLowerCase().includes(normalizedQuery),
    );
    if (view === "Latest") return [...matches].sort((a, b) => Number(Boolean(b.registered)) - Number(Boolean(a.registered)));
    if (view === "All") return [...matches].sort((a, b) => a.name.localeCompare(b.name));
    return [...matches].sort((a, b) => b.visits - a.visits);
  }, [allItems, filter, kind, query, view]);

  async function toggleSaved(item: ExploreItem) {
    if (pendingId) return;
    setPendingId(item.id);
    setError(null);
    try {
      if (!user) throw new Error("Your session has expired.");
      if (savedIds.has(item.id)) await removeSavedItem(db, user.uid, item.id);
      else await saveItem(db, user.uid, { id: item.id, title: item.name, subtitle: item.subtitle, kind: item.savedKind, imageKey: item.imageKey });
      await refresh();
    } catch { setError("That change could not be saved. Please try again."); } finally { setPendingId(null); }
  }

  function renderShelf(title: string, eyebrow: string, items: ExploreItem[]) {
    if (items.length === 0) return null;
    return (
      <section className="explore-shelf" aria-label={title}>
        <div className="explore-shelf-heading">
          <div><span>{eyebrow}</span><h2>{title}</h2></div>
          <button onClick={() => setCollection({ title, eyebrow, itemIds: items.map((item) => item.id) })}>See all <Icon name="arrow_forward" size={16} /></button>
        </div>
        <div className="explore-card-row">
          {items.map((item) => (
            <article className="explore-poster-card" key={item.id}>
              <button className="explore-poster-main" onClick={() => setSelected(item)}>
                <span className="explore-poster-image-wrap">
                  <img src={item.source} alt={item.name} className="explore-poster-image" />
                  <small>{item.registered ? "NEW ON HILINGA" : item.category.toUpperCase()}</small>
                </span>
                <span className="explore-poster-copy">
                  <strong>{item.name}</strong>
                  <span>{item.subtitle}</span>
                  <em><Icon name={item.kind === "Businesses" ? "storefront" : item.kind === "Events" ? "event" : "location_on"} size={14} />{item.registered ? "Registered business" : item.detail || "Legazpi & nearby"}</em>
                </span>
              </button>
              <button className={`explore-poster-save ${savedIds.has(item.id) ? "saved" : ""}`} aria-label={savedIds.has(item.id) ? `Remove ${item.name} from saved items` : `Save ${item.name}`} disabled={pendingId !== null} onClick={() => toggleSaved(item)}>
                {pendingId === item.id ? <div className="spinner" /> : <Icon name="favorite" size={19} filled={savedIds.has(item.id)} />}
              </button>
            </article>
          ))}
        </div>
      </section>
    );
  }

  const collectionItems = collection ? collection.itemIds.map((id) => allItems.find((item) => item.id === id)).filter((item): item is ExploreItem => Boolean(item)) : [];

  if (selected?.kind === "Businesses") {
    const selectedBusiness = selected;
    const isSaved = savedIds.has(selected.id);
    const relatedBusinesses = allItems.filter((item) => item.kind === "Businesses" && item.id !== selected.id && (item.category === selected.category || item.businessScale === selected.businessScale)).slice(0, 4);
    const businessPosts = readPublishedBusinessPosts().filter((post) => post.businessId === selected.id);
    const gallery = businessPosts.map((post) => post.mediaUrl).filter(Boolean).concat([selected.source, ...catalog.filter((item) => item.source !== selected.source).map((item) => item.source)]).slice(0, 6);
    const businessReviews = reviews.filter((review) => review.placeName.trim().toLowerCase() === selected.name.trim().toLowerCase());
    const ratedReviews = businessReviews.filter((review) => review.rating !== null);
    const averageRating = ratedReviews.length ? ratedReviews.reduce((sum, review) => sum + (review.rating ?? 0), 0) / ratedReviews.length : null;

    async function publishReview() {
      if (!user) { setReviewError("Your session has expired. Please sign in again."); return; }
      if (reviewText.trim().length < 10 || reviewRating === null) { setReviewError("Add a star rating and at least 10 characters about your experience."); return; }
      setReviewPosting(true); setReviewError(null);
      try {
        await createCommunityPost({ authorUid: user.uid, authorName: profile?.display_name.trim() || user.displayName || user.email?.split("@")[0] || "Hilinga traveler", authorAvatarUrl: avatarUrl, placeName: selectedBusiness.name, location: selectedBusiness.location || "Legazpi City, Albay", category: selectedBusiness.category === "Cafes" ? "Cafe" : selectedBusiness.category === "Stay" ? "Accommodation" : selectedBusiness.category === "Shopping" ? "Shop" : "Restaurant", experience: reviewText, rating: reviewRating });
        setReviewText(""); setReviewRating(null);
      } catch { setReviewError("Your review could not be posted. Please try again."); }
      finally { setReviewPosting(false); }
    }

    async function removeReview() {
      if (!reviewDeleteTarget) return;
      setReviewPosting(true); setReviewError(null);
      try { await deleteCommunityPost(reviewDeleteTarget.id); setReviewDeleteTarget(null); }
      catch { setReviewError("That review could not be deleted."); }
      finally { setReviewPosting(false); }
    }

    async function submitInquiry() {
      if (!user || !selectedBusiness.ownerUid || inquirySending) return;
      setInquirySending(true);
      setInquiryError(null);
      try {
        await sendBusinessInquiry({
          businessId: selectedBusiness.ownerUid,
          businessName: selectedBusiness.name,
          senderUid: user.uid,
          senderName: profile?.display_name.trim() || user.displayName || user.email?.split("@")[0] || "Hilinga traveler",
          senderEmail: user.email || "",
          message: inquiryMessage,
        });
        setInquiryMessage("");
        setInquirySent(true);
      } catch (nextError) {
        setInquiryError(nextError instanceof Error ? nextError.message : "Your message could not be sent. Please try again.");
      } finally {
        setInquirySending(false);
      }
    }
    return (
      <div className="screen explore-business-profile-screen">
        <header className="business-public-nav">
          <button onClick={() => setSelected(null)} aria-label="Back to Explore"><Icon name="arrow_back" size={23} /></button>
          <strong>Business profile</strong>
          <button className={isSaved ? "saved" : ""} onClick={() => void toggleSaved(selected)} aria-label={isSaved ? `Remove ${selected.name} from saved items` : `Save ${selected.name}`}>
            {pendingId === selected.id ? <div className="spinner" /> : <Icon name="favorite" size={22} filled={isSaved} />}
          </button>
        </header>

        <section className="business-public-hero">
          <img className="business-public-cover" src={selected.source} alt={`${selected.name} cover`} />
          <div className="business-public-identity">
            <span className="business-public-logo">{selected.logoSource ? <img src={selected.logoSource} alt={`${selected.name} logo`} /> : <img src={selected.source} alt="" />}</span>
            <div className="business-public-name"><div><h1>{selected.name}</h1>{selected.registered && <Icon name="verified" size={21} filled />}</div><p>{selected.category} · {selected.businessScale}</p></div>
          </div>
          <p className="business-public-bio">{selected.subtitle}</p>
          <p className="business-public-location"><Icon name="location_on" size={18} />{selected.location || "Legazpi City, Albay"}</p>
          <div className="business-public-actions">
            <button className="primary" onClick={() => void toggleSaved(selected)} disabled={pendingId !== null}><Icon name={isSaved ? "favorite" : "favorite_border"} size={19} filled={isSaved} />{isSaved ? "Saved" : "Save"}</button>
            <button onClick={() => selected.ownerUid ? setInquiryOpen(true) : window.location.assign(`mailto:?subject=${encodeURIComponent(`Inquiry for ${selected.name}`)}`)}><Icon name="chat_bubble" size={18} />Message</button>
            <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${selected.latitude},${selected.longitude}`, "_blank", "noopener,noreferrer")}><Icon name="directions" size={19} />Directions</button>
          </div>
        </section>

        <section className="business-public-stats" aria-label={`${selected.name} profile statistics`}>
          <div><strong>{Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(selected.visits)}</strong><span>Profile visits</span></div>
          <div><strong>{averageRating === null ? "New" : averageRating.toFixed(1)}</strong><span>{ratedReviews.length} {ratedReviews.length === 1 ? "rating" : "ratings"}</span></div>
          <div><strong>{selected.registered ? "Official" : "Local"}</strong><span>Hilinga profile</span></div>
        </section>

        <section className="business-public-section">
          <div className="business-public-section-title"><div><span>ABOUT</span><h2>Get to know {selected.name}</h2></div><Icon name="info" size={22} /></div>
          <p>{selected.subtitle}. Discover what makes this {selected.category.toLowerCase()} destination a favorite among locals and visitors around Legazpi.</p>
          <div className="business-public-detail-row"><span><Icon name="schedule" size={18} />Open today</span><strong>8:00 AM – 8:00 PM</strong></div>
        </section>

        <section className="business-public-section">
          <div className="business-public-section-title"><div><span>PHOTOS & POSTS</span><h2>From the business</h2></div><button>See all</button></div>
          <div className="business-public-gallery">{gallery.map((source, index) => <img key={`${source}-${index}`} src={source} alt={`${selected.name} post ${index + 1}`} />)}</div>
        </section>

        <section className="business-public-section business-reviews-section">
          <div className="business-public-section-title"><div><span>CUSTOMER EXPERIENCES</span><h2>Ratings & reviews</h2></div><strong className="business-review-score"><Icon name="star" size={18} filled />{averageRating === null ? "No ratings" : averageRating.toFixed(1)}</strong></div>
          <div className="business-review-composer">
            <div className="thread-rating" aria-label="Your rating"><span>Your rating</span>{[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" className={reviewRating !== null && star <= reviewRating ? "thread-star-active" : ""} onClick={() => setReviewRating(star)} aria-label={`${star} stars`}><Icon name="star" size={24} filled={reviewRating !== null && star <= reviewRating} /></button>)}</div>
            <textarea value={reviewText} maxLength={1500} rows={3} onChange={(event) => setReviewText(event.target.value)} placeholder={`How was your experience with ${selected.name}?`} />
            <div><small>{reviewText.length}/1500</small><button className="thread-publish" disabled={reviewPosting || reviewRating === null || reviewText.trim().length < 10} onClick={() => void publishReview()}>{reviewPosting ? <div className="spinner" /> : <Icon name="send" size={17} />}Post review</button></div>
          </div>
          {reviewError && <p className="error-text" role="alert">{reviewError}</p>}
          {reviewsLoading ? <div className="thread-loading"><div className="spinner" /><span>Loading customer experiences...</span></div> : businessReviews.length === 0 ? <div className="business-reviews-empty"><Icon name="rate_review" size={27} /><strong>No reviews yet</strong><span>Be the first to share an experience with this business.</span></div> : <div className="business-review-list">{businessReviews.map((review) => <article key={review.id}><header><span className="thread-avatar">{review.authorAvatarUrl ? <img src={review.authorAvatarUrl} alt="" /> : review.authorName.charAt(0).toUpperCase()}</span><div><strong>{review.authorName}</strong><span>{review.createdAt ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(review.createdAt.toDate()) : "Posting now"}</span></div>{review.authorUid === user?.uid && <button onClick={() => setReviewDeleteTarget(review)} aria-label="Delete your review"><Icon name="delete" size={18} /></button>}</header>{review.rating !== null && <div className="business-review-stars">{[1, 2, 3, 4, 5].map((star) => <Icon key={star} name="star" size={17} filled={star <= review.rating!} />)}</div>}<p>{review.experience}</p></article>)}</div>}
        </section>

        {relatedBusinesses.length > 0 && <section className="explore-shelf business-related"><div className="explore-shelf-heading"><div><span>YOU MAY ALSO LIKE</span><h2>Similar businesses</h2></div></div><div className="explore-card-row">{relatedBusinesses.map((item) => <article className="explore-poster-card" key={item.id}><button className="explore-poster-main" onClick={() => { setSelected(item); document.querySelector(".app-content")?.scrollTo({ top: 0, behavior: "smooth" }); }}><span className="explore-poster-image-wrap"><img src={item.source} alt={item.name} className="explore-poster-image" /><small>{item.category.toUpperCase()}</small></span><span className="explore-poster-copy"><strong>{item.name}</strong><span>{item.subtitle}</span><em><Icon name="location_on" size={14} />{item.location || "Legazpi City"}</em></span></button></article>)}</div></section>}
        <AppModal visible={inquiryOpen} title={`Message ${selected.name}`} onClose={() => !inquirySending && setInquiryOpen(false)}>
          {inquirySent ? <div className="business-inquiry-success"><span><Icon name="mark_email_read" size={30} /></span><strong>Message sent</strong><p>{selected.name} will see your inquiry in their Hilinga business inbox.</p><Button label="Done" onPress={() => setInquiryOpen(false)} /></div> : <form className="business-inquiry-form" onSubmit={(event) => { event.preventDefault(); void submitInquiry(); }}><p>Ask about availability, reservations, services, or anything else you need to plan your visit.</p><label><span>Your message</span><textarea autoFocus value={inquiryMessage} maxLength={1500} rows={6} onChange={(event) => setInquiryMessage(event.target.value)} placeholder={`Hi ${selected.name}, I’d like to ask about…`} /></label><div><small>{inquiryMessage.length}/1500</small><Button label="Send message" loading={inquirySending} disabled={inquiryMessage.trim().length < 10} onPress={() => void submitInquiry()} /></div>{inquiryError && <p className="error-text" role="alert">{inquiryError}</p>}</form>}
        </AppModal>
        <ConfirmModal visible={reviewDeleteTarget !== null} title="Delete this review?" message="Your rating and comment will be permanently removed from this business profile." confirmLabel="Delete review" loading={reviewPosting} onCancel={() => !reviewPosting && setReviewDeleteTarget(null)} onConfirm={removeReview} />
      </div>
    );
  }

  if (collection) {
    return (
      <div className="screen explore-screen explore-collection-screen">
        <header className="explore-collection-header"><button onClick={() => setCollection(null)} aria-label="Back to Explore"><Icon name="arrow_back" size={23} /></button><div><span>{collection.eyebrow}</span><h1>{collection.title}</h1><p>All {collectionItems.length} recommendations in this category.</p></div></header>
        <div className="explore-collection-grid">
          {collectionItems.map((item) => <article className="explore-collection-card" key={item.id}><button className="explore-collection-main" onClick={() => setSelected(item)}><img src={item.source} alt={item.name} /><span className="destination-kind">{item.kind === "Businesses" ? "BUSINESS" : item.kind.slice(0, -1).toUpperCase()}</span><div><small>{item.category}</small><h2>{item.name}</h2><p>{item.subtitle}</p><span><Icon name={item.kind === "Events" ? "event" : "location_on"} size={15} />{item.location || item.detail || "Legazpi & nearby"}</span></div></button><button className={`explore-collection-save ${savedIds.has(item.id) ? "saved" : ""}`} onClick={() => void toggleSaved(item)} aria-label={savedIds.has(item.id) ? `Remove ${item.name} from saved items` : `Save ${item.name}`}>{pendingId === item.id ? <div className="spinner" /> : <Icon name="favorite" size={20} filled={savedIds.has(item.id)} />}</button></article>)}
        </div>
      </div>
    );
  }

  return (
    <div className="screen explore-screen">
      <header className="explore-topbar">
        <nav aria-label="Explore views">{(["For you", "All", "Latest"] as ExploreView[]).map((value) => <button key={value} className={view === value ? "active" : ""} onClick={() => setView(value)}>{value}</button>)}</nav>
        <button className="explore-search-button" onClick={() => document.getElementById("explore-search")?.focus()} aria-label="Search Explore"><Icon name="search" size={24} /></button>
      </header>
      <section className="explore-intro">
        <span>DISCOVER LEGAZPI</span>
        <h1>Find your next local favorite.</h1>
        <p>Hotspots, homegrown businesses, major establishments, and experiences around the city.</p>
        <div className="search-box explore-search-box"><Icon name="search" size={20} color="var(--c-muted)" /><input id="explore-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search places and businesses" aria-label="Search Explore" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><Icon name="cancel" size={20} color="var(--c-muted)" /></button>}</div>
      </section>
      <div className="chip-scroll explore-kind-filter" aria-label="Explore content types">
        {(["All", "Places", "Businesses", "Events", "Experiences"] as ExploreKind[]).map((value) => <button key={value} className={`chip feed-kind-chip ${kind === value ? "chip-selected" : ""}`} onClick={() => setKind(value)}><Icon name={{ All: "apps", Places: "location_on", Businesses: "storefront", Events: "event", Experiences: "hiking" }[value]} size={17} />{value}</button>)}
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {results.length === 0 ? (
        <EmptyState icon="search" title="Nothing found" message="Try a different search, type, or interest." action="Clear filters" onAction={() => { setQuery(""); setFilter("All"); setKind("All"); }} />
      ) : (
        <div className="explore-results">
          {renderShelf(query || filter !== "All" || kind !== "All" ? "Search results" : "Hotspots in Legazpi", "TRENDING NEAR YOU", results.filter((item) => query || filter !== "All" || kind !== "All" ? true : item.kind === "Places"))}
          {!query && filter === "All" && kind === "All" && <aside className="explore-business-banner"><span><Icon name="storefront" size={25} /></span><div><strong>Local businesses belong here</strong><p>Profiles registered in Business mode are automatically showcased in Explore.</p></div><Icon name="verified" size={21} /></aside>}
          {!query && filter === "All" && kind === "All" && renderShelf("Small businesses", "SHOP & SUPPORT LOCAL", results.filter((item) => item.businessScale === "Small business"))}
          {!query && filter === "All" && kind === "All" && renderShelf("Big enterprises", "ESTABLISHED IN LEGAZPI", results.filter((item) => item.businessScale === "Big enterprise"))}
          {!query && filter === "All" && kind === "All" && renderShelf("Events & experiences", "MORE TO DISCOVER", results.filter((item) => item.kind === "Events" || item.kind === "Experiences"))}
          {!query && kind === "All" && <section className="explore-category-block"><div className="explore-shelf-heading"><div><span>BROWSE YOUR WAY</span><h2>Other categories</h2></div></div><div className="explore-category-grid">{[{ label: "Nature", icon: "landscape" }, { label: "Heritage", icon: "account_balance" }, { label: "Food", icon: "restaurant" }, { label: "Cafes", icon: "local_cafe" }, { label: "Shopping", icon: "shopping_bag" }, { label: "Activities", icon: "hiking" }].map((item) => <button key={item.label} className={filter === item.label ? "active" : ""} onClick={() => setFilter(item.label)}><span><Icon name={item.icon} size={22} /></span><strong>{item.label}</strong><Icon name="chevron_right" size={18} /></button>)}</div></section>}
        </div>
      )}
      <AppModal visible={selected !== null} title={selected?.name ?? "Destination"} onClose={() => setSelected(null)}>
        {selected && (
          <>
            <img src={selected.source} alt={selected.name} style={{ width: "100%", height: 210, borderRadius: 14, objectFit: "cover" }} />
            <p style={{ color: "var(--c-body)", lineHeight: "21px" }}>{selected.subtitle}. Detailed descriptions, directions, opening hours, and live availability require a connected destination data service.</p>
            <Button label={savedIds.has(selected.id) ? "Remove from saved" : `Save ${selected.kind.slice(0, -1).toLowerCase()}`} onPress={() => toggleSaved(selected)} loading={pendingId === selected.id} secondary={savedIds.has(selected.id)} />
          </>
        )}
      </AppModal>
    </div>
  );
}

/* Previous curated discovery feed retained temporarily for reference while the
   new community thread rolls out.
function FeedLegacy({ businessMode, businessProfile, products, onSaveBusinessProfile, onAddProduct, onRemoveProduct }: {
  businessMode: boolean;
  businessProfile: BusinessProfile | null;
  products: PromotedProduct[];
  onSaveBusinessProfile: (profile: BusinessProfile) => Promise<void>;
  onAddProduct: (product: Omit<PromotedProduct, "id" | "createdAt">) => Promise<void>;
  onRemoveProduct: (id: string) => Promise<void>;
}) {
  const db = useDatabase();
  const { user } = useAuth();
  const [category, setCategory] = useState<FeedCategory>("All");
  const [kind, setKind] = useState<FeedKind>("All");
  const [sort, setSort] = useState<FeedSort>("Recommended");
  const [query, setQuery] = useState("");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [businessEditorOpen, setBusinessEditorOpen] = useState(false);
  const [productEditorOpen, setProductEditorOpen] = useState(false);
  const [businessDraft, setBusinessDraft] = useState<BusinessProfile>(businessProfile ?? { name: "", category: "", location: "", description: "" });
  const [productDraft, setProductDraft] = useState({ name: "", category: "", price: "", description: "" });
  const [businessSaving, setBusinessSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (user) setSavedIds(await getSavedIds(db, user.uid));
  }, [db, user]);
  useEffect(() => { refresh().catch(() => setError("Saved ideas could not be loaded.")); }, [refresh]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches = feedItems.filter((item) =>
      (kind === "All" || item.kind === kind)
      && (category === "All" || item.category === category)
      && `${item.name} ${item.description} ${item.location} ${item.category} ${item.kind}`.toLowerCase().includes(normalizedQuery),
    );
    return sort === "Most visited" ? [...matches].sort((a, b) => b.visits - a.visits) : matches;
  }, [category, kind, query, sort]);

  async function toggleSaved(item: (typeof feedItems)[number]) {
    if (pendingId) return;
    setPendingId(item.id);
    setError(null);
    try {
      if (!user) throw new Error("Your session has expired.");
      if (savedIds.has(item.id)) await removeSavedItem(db, user.uid, item.id);
      else await saveItem(db, user.uid, { id: item.id, title: item.name, subtitle: item.location, kind: item.kind, imageKey: item.imageKey });
      await refresh();
    } catch {
      setError("That idea could not be saved. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  async function saveBusinessProfile() {
    if (!businessDraft.name.trim() || !businessDraft.category.trim() || !businessDraft.location.trim()) {
      setError("Add your business name, category, and location.");
      return;
    }
    setBusinessSaving(true); setError(null);
    try {
      await onSaveBusinessProfile({ ...businessDraft, name: businessDraft.name.trim(), category: businessDraft.category.trim(), location: businessDraft.location.trim(), description: businessDraft.description.trim() });
      setBusinessEditorOpen(false);
    } catch { setError("Your business profile could not be saved."); } finally { setBusinessSaving(false); }
  }

  async function addProduct() {
    if (!productDraft.name.trim() || !productDraft.category.trim()) {
      setError("Add a product name and category.");
      return;
    }
    setBusinessSaving(true); setError(null);
    try {
      await onAddProduct({ ...productDraft, name: productDraft.name.trim(), category: productDraft.category.trim(), price: productDraft.price.trim(), description: productDraft.description.trim() });
      setProductDraft({ name: "", category: "", price: "", description: "" });
      setProductEditorOpen(false);
    } catch { setError("Your product could not be added."); } finally { setBusinessSaving(false); }
  }

  return (
    <div className="screen feed-screen">
      <section className={`feed-hero ${businessMode ? "feed-hero-business" : ""}`}>
        <span className="feed-kicker">{businessMode ? "HILINGA FOR BUSINESS" : "DISCOVER LEGAZPI"}</span>
        <h1>{businessMode ? (businessProfile ? `Grow ${businessProfile.name}.` : "Put your business on the map.") : "Find your next local favorite."}</h1>
        <p>{businessMode ? "Build your local presence and promote products travelers can discover in the Hilinga Feed." : "Places, food, businesses, and experiences worth adding to your trip."}</p>
        {businessMode && (
          <div className="business-hero-actions">
            <button onClick={() => { setBusinessDraft(businessProfile ?? { name: "", category: "", location: "", description: "" }); setBusinessEditorOpen(true); }}>
              <Icon name={businessProfile ? "edit" : "storefront"} size={18} />{businessProfile ? "Edit business profile" : "Create business profile"}
            </button>
            <button className="business-hero-primary" disabled={!businessProfile} onClick={() => setProductEditorOpen(true)}>
              <Icon name="add" size={19} />Add product
            </button>
          </div>
        )}
        <div className="feed-search">
          <Icon name="search" size={20} color="var(--c-muted)" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search places, businesses, and events" aria-label="Search the feed" />
          {query && <button onClick={() => setQuery("")} aria-label="Clear feed search"><Icon name="cancel" size={20} color="var(--c-muted)" /></button>}
        </div>
      </section>

      {businessMode && businessProfile && (
        <section className="business-dashboard" aria-label="Business profile">
          <div className="business-profile-card">
            <span className="business-avatar"><Icon name="storefront" size={25} /></span>
            <div><span>{businessProfile.category}</span><h2>{businessProfile.name}</h2><p><Icon name="location_on" size={15} />{businessProfile.location}</p></div>
            <strong>{products.length}<small> PRODUCTS</small></strong>
          </div>
          {businessProfile.description && <p className="business-description">{businessProfile.description}</p>}
          <div className="feed-section-heading"><div><span>YOUR CATALOG</span><h2>Products you promote</h2></div><button className="business-add-link" onClick={() => setProductEditorOpen(true)}>+ Add product</button></div>
          {products.length === 0 ? (
            <div className="business-empty"><Icon name="inventory_2" size={30} /><strong>No products yet</strong><span>Add your first product so it can appear in the Feed.</span><button onClick={() => setProductEditorOpen(true)}>Add first product</button></div>
          ) : (
            <div className="business-product-grid">
              {products.map((product) => <article className="business-product-card" key={product.id}><span className="business-product-icon"><Icon name="sell" size={22} /></span><div><span>{product.category}</span><h3>{product.name}</h3>{product.description && <p>{product.description}</p>}<strong>{product.price || "Price on request"}</strong></div><button aria-label={`Remove ${product.name}`} onClick={() => void onRemoveProduct(product.id)}><Icon name="delete" size={18} /></button></article>)}
            </div>
          )}
        </section>
      )}

      <div className="feed-category-block">
        <div className="feed-section-heading">
          <div><span>BROWSE THE FEED</span><h2>What would you like to discover?</h2></div>
          <label className="feed-sort">
            <Icon name="sort" size={17} />
            <span className="sr-only">Sort feed</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as FeedSort)} aria-label="Sort feed">
              <option>Recommended</option>
              <option>Most visited</option>
            </select>
          </label>
        </div>
        <div className="chip-scroll feed-kind-filter" aria-label="Feed content types">
          {(["All", "Places", "Businesses", "Events"] as FeedKind[]).map((value) => (
            <button key={value} className={`chip feed-kind-chip ${kind === value ? "chip-selected" : ""}`} onClick={() => setKind(value)}>
              <Icon name={{ All: "apps", Places: "location_on", Businesses: "storefront", Events: "event" }[value]} size={17} />
              {value}
            </button>
          ))}
        </div>
        <span className="feed-filter-label">FILTER BY INTEREST</span>
        <div className="chip-scroll" aria-label="Feed categories">
          {(["All", "Nature", "Food", "Restaurants", "Cafes", "Heritage", "Shopping"] as FeedCategory[]).map((value) => (
            <button key={value} className={`chip feed-chip ${category === value ? "chip-selected" : ""}`} onClick={() => setCategory(value)}>
              {value}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}
      {visibleItems.length === 0 ? (
        <EmptyState icon="travel_explore" title="No ideas found" message="Try another search or browse the full feed." action="Show all ideas" onAction={() => { setQuery(""); setCategory("All"); setKind("All"); }} />
      ) : (
        <section className="feed-list" aria-label={`${kind} ${category} travel ideas`}>
          <div className="feed-section-heading">
            <div><span>{sort === "Most visited" ? "MOST VISITED" : category === "All" ? "CURATED FOR YOU" : category.toUpperCase()}</span><h2>{kind === "All" ? "Around Legazpi" : kind}</h2></div>
            <strong>{visibleItems.length}</strong>
          </div>
          <div className="feed-grid">
            {visibleItems.map((item) => {
              const isSaved = savedIds.has(item.id);
              return (
                <article key={item.id} className={`feed-card ${item.featured ? "feed-card-featured" : ""}`}>
                  <div className="feed-image-wrap">
                    <img src={item.source} alt={item.name} className="feed-image" />
                    <span className="feed-category-tag">{item.category}</span>
                    <button className={`feed-save ${isSaved ? "feed-save-active" : ""}`} onClick={() => toggleSaved(item)} disabled={pendingId !== null} aria-label={isSaved ? `Remove ${item.name} from saved` : `Save ${item.name}`}>
                      {pendingId === item.id ? <div className="spinner" /> : <Icon name="favorite" size={21} filled={isSaved} />}
                    </button>
                  </div>
                  <div className="feed-card-copy">
                    <div className="feed-card-title-row"><h3>{item.name}</h3><span className={`feed-kind-pill feed-kind-${item.kind.toLowerCase()}`}>{item.kind === "Businesses" ? "BUSINESS" : item.kind.slice(0, -1).toUpperCase()}</span></div>
                    <p>{item.description}</p>
                    {item.detail && <span className="feed-event-detail"><Icon name="schedule" size={15} />{item.detail}</span>}
                    <div className="feed-card-meta">
                      <span className="feed-location"><Icon name="location_on" size={16} color="var(--c-green)" />{item.location}</span>
                      <span className="feed-visits"><Icon name="visibility" size={15} />{Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(item.visits)} visits</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <AppModal visible={businessEditorOpen} title={businessProfile ? "Edit business profile" : "Create business profile"} onClose={() => !businessSaving && setBusinessEditorOpen(false)}>
        <p className="business-modal-intro">Tell travelers what makes your local business worth discovering.</p>
        <Field label="Business name" value={businessDraft.name} onChangeText={(name) => setBusinessDraft({ ...businessDraft, name })} placeholder="e.g. Mayon Coffee House" />
        <Field label="Business category" value={businessDraft.category} onChangeText={(category) => setBusinessDraft({ ...businessDraft, category })} placeholder="Cafe, crafts, tours..." />
        <Field label="Location" value={businessDraft.location} onChangeText={(location) => setBusinessDraft({ ...businessDraft, location })} placeholder="Legazpi City, Albay" />
        <Field label="About your business" value={businessDraft.description} onChangeText={(description) => setBusinessDraft({ ...businessDraft, description })} placeholder="Share what makes your business special" multiline />
        {error && <p className="error-text" role="alert">{error}</p>}
        <Button label="Save business profile" onPress={saveBusinessProfile} loading={businessSaving} />
      </AppModal>
      <AppModal visible={productEditorOpen} title="Add a product" onClose={() => !businessSaving && setProductEditorOpen(false)}>
        <p className="business-modal-intro">Create a clear product listing for travelers browsing the Feed.</p>
        <Field label="Product name" value={productDraft.name} onChangeText={(name) => setProductDraft({ ...productDraft, name })} placeholder="e.g. Single-origin Albay coffee" />
        <Field label="Category" value={productDraft.category} onChangeText={(category) => setProductDraft({ ...productDraft, category })} placeholder="Food, souvenir, tour..." />
        <Field label="Price (optional)" value={productDraft.price} onChangeText={(price) => setProductDraft({ ...productDraft, price })} placeholder="e.g. ₱350" />
        <Field label="Description (optional)" value={productDraft.description} onChangeText={(description) => setProductDraft({ ...productDraft, description })} placeholder="What should customers know?" multiline />
        {error && <p className="error-text" role="alert">{error}</p>}
        <Button label="Add to Feed" onPress={addProduct} loading={businessSaving} />
      </AppModal>
    </div>
  );
}
*/

function CommunityFeedLegacy({ businessMode, businessProfile, products, onSaveBusinessProfile, onAddProduct, onRemoveProduct }: {
  businessMode: boolean;
  businessProfile: BusinessProfile | null;
  products: PromotedProduct[];
  onSaveBusinessProfile: (profile: BusinessProfile) => Promise<void>;
  onAddProduct: (product: Omit<PromotedProduct, "id" | "createdAt">) => Promise<void>;
  onRemoveProduct: (id: string) => Promise<void>;
}) {
  const { user, profile, avatarUrl } = useAuth();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | ExperienceCategory>("All");
  const [placeName, setPlaceName] = useState("");
  const [location, setLocation] = useState("");
  const [experience, setExperience] = useState("");
  const [postCategory, setPostCategory] = useState<ExperienceCategory>("Place");
  const [rating, setRating] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommunityPost | null>(null);
  const [businessEditorOpen, setBusinessEditorOpen] = useState(false);
  const [productEditorOpen, setProductEditorOpen] = useState(false);
  const [businessDraft, setBusinessDraft] = useState<BusinessProfile>(businessProfile ?? { name: "", category: "", location: "", description: "" });
  const [productDraft, setProductDraft] = useState({ name: "", category: "", price: "", description: "" });
  const [businessSaving, setBusinessSaving] = useState(false);

  useEffect(() => subscribeToCommunityPosts(
    (nextPosts) => { setPosts(nextPosts); setLoading(false); setError(null); },
    () => { setLoading(false); setError("The community thread could not be loaded. Check your connection and try again."); },
  ), []);

  const visiblePosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return posts.filter((post) =>
      (category === "All" || post.category === category)
      && `${post.authorName} ${post.placeName} ${post.location} ${post.experience}`.toLowerCase().includes(normalizedQuery),
    );
  }, [category, posts, query]);

  async function publishPost() {
    if (!user) { setError("Your session has expired. Please sign in again."); return; }
    if (!placeName.trim()) { setError("Add the name of the place or establishment."); return; }
    if (experience.trim().length < 10) { setError("Tell the community a little more about your experience."); return; }
    setPosting(true); setError(null);
    try {
      await createCommunityPost({
        authorUid: user.uid,
        authorName: profile?.display_name.trim() || user.displayName || user.email?.split("@")[0] || "Hilinga traveler",
        authorAvatarUrl: avatarUrl,
        placeName,
        location,
        category: postCategory,
        experience,
        rating,
      });
      setPlaceName(""); setLocation(""); setExperience(""); setPostCategory("Place"); setRating(null);
    } catch { setError("Your experience could not be posted. Please try again."); }
    finally { setPosting(false); }
  }

  async function removePost() {
    if (!deleteTarget) return;
    setPosting(true); setError(null);
    try { await deleteCommunityPost(deleteTarget.id); setDeleteTarget(null); }
    catch { setError("That post could not be deleted."); }
    finally { setPosting(false); }
  }

  async function saveBusinessProfile() {
    if (!businessDraft.name.trim() || !businessDraft.category.trim() || !businessDraft.location.trim()) { setError("Add your business name, category, and location."); return; }
    setBusinessSaving(true); setError(null);
    try { await onSaveBusinessProfile({ ...businessDraft, name: businessDraft.name.trim(), category: businessDraft.category.trim(), location: businessDraft.location.trim(), description: businessDraft.description.trim() }); setBusinessEditorOpen(false); }
    catch { setError("Your business profile could not be saved."); }
    finally { setBusinessSaving(false); }
  }

  async function addProduct() {
    if (!productDraft.name.trim() || !productDraft.category.trim()) { setError("Add a product name and category."); return; }
    setBusinessSaving(true); setError(null);
    try { await onAddProduct({ ...productDraft, name: productDraft.name.trim(), category: productDraft.category.trim(), price: productDraft.price.trim(), description: productDraft.description.trim() }); setProductDraft({ name: "", category: "", price: "", description: "" }); setProductEditorOpen(false); }
    catch { setError("Your product could not be added."); }
    finally { setBusinessSaving(false); }
  }

  function postTime(post: CommunityPost) {
    if (!post.createdAt) return "Posting now";
    return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(post.createdAt.toDate());
  }

  return (
    <div className="screen feed-screen">
      <section className={`feed-hero ${businessMode ? "feed-hero-business" : ""}`}>
        <span className="feed-kicker">{businessMode ? "HILINGA FOR BUSINESS" : "HILINGA COMMUNITY"}</span>
        <h1>{businessMode ? (businessProfile ? `Grow ${businessProfile.name}.` : "Put your business on the map.") : "Real stories from real travelers."}</h1>
        <p>{businessMode ? "Manage your local presence, then join the same community conversation as travelers." : "Share what happened at a place, restaurant, cafe, stay, event, or local establishment."}</p>
        {businessMode && <div className="business-hero-actions"><button onClick={() => { setBusinessDraft(businessProfile ?? { name: "", category: "", location: "", description: "" }); setBusinessEditorOpen(true); }}><Icon name={businessProfile ? "edit" : "storefront"} size={18} />{businessProfile ? "Edit business profile" : "Create business profile"}</button><button className="business-hero-primary" disabled={!businessProfile} onClick={() => setProductEditorOpen(true)}><Icon name="add" size={19} />Add product</button></div>}
        <div className="feed-search"><Icon name="search" size={20} color="var(--c-muted)" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, places, or experiences" aria-label="Search community posts" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><Icon name="cancel" size={20} color="var(--c-muted)" /></button>}</div>
      </section>

      {businessMode && businessProfile && <section className="business-dashboard" aria-label="Business profile"><div className="business-profile-card"><span className="business-avatar"><Icon name="storefront" size={25} /></span><div><span>{businessProfile.category}</span><h2>{businessProfile.name}</h2><p><Icon name="location_on" size={15} />{businessProfile.location}</p></div><strong>{products.length}<small> PRODUCTS</small></strong></div>{businessProfile.description && <p className="business-description">{businessProfile.description}</p>}<div className="feed-section-heading"><div><span>YOUR CATALOG</span><h2>Products you promote</h2></div><button className="business-add-link" onClick={() => setProductEditorOpen(true)}>+ Add product</button></div>{products.length === 0 ? <div className="business-empty"><Icon name="inventory_2" size={30} /><strong>No products yet</strong><span>Add your first product so travelers can discover it.</span><button onClick={() => setProductEditorOpen(true)}>Add first product</button></div> : <div className="business-product-grid">{products.map((product) => <article className="business-product-card" key={product.id}><span className="business-product-icon"><Icon name="sell" size={22} /></span><div><span>{product.category}</span><h3>{product.name}</h3>{product.description && <p>{product.description}</p>}<strong>{product.price || "Price on request"}</strong></div><button aria-label={`Remove ${product.name}`} onClick={() => void onRemoveProduct(product.id)}><Icon name="delete" size={18} /></button></article>)}</div>}</section>}

      <section className="thread-composer" aria-labelledby="share-experience-title">
        <div className="thread-composer-heading"><span className="thread-avatar">{avatarUrl ? <img src={avatarUrl} alt="Your profile" /> : (profile?.display_name || user?.email || "H").charAt(0).toUpperCase()}</span><div><span>START A CONVERSATION</span><h2 id="share-experience-title">Share your experience</h2></div></div>
        <div className="thread-form-grid"><label><span>Place or establishment *</span><input list="community-place-suggestions" value={placeName} maxLength={120} onChange={(event) => setPlaceName(event.target.value)} placeholder="e.g. Cagsawa Ruins" /></label><datalist id="community-place-suggestions">{placeSuggestions.map((item) => <option key={item.id} value={item.name} />)}</datalist><label><span>Area or address</span><input value={location} maxLength={160} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Daraga, Albay" /></label><label><span>Type</span><select value={postCategory} onChange={(event) => setPostCategory(event.target.value as ExperienceCategory)}>{experienceCategories.map((value) => <option key={value}>{value}</option>)}</select></label></div>
        <label className="thread-experience-field"><span>Your experience *</span><textarea value={experience} maxLength={1500} rows={4} onChange={(event) => setExperience(event.target.value)} placeholder="What did you enjoy? What should future visitors know?" /><small>{experience.length}/1500</small></label>
        <div className="thread-composer-footer"><div className="thread-rating" aria-label="Optional rating"><span>Rating</span>{[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" className={rating !== null && star <= rating ? "thread-star-active" : ""} onClick={() => setRating(rating === star ? null : star)} aria-label={`${star} star${star === 1 ? "" : "s"}`}><Icon name="star" size={23} filled={rating !== null && star <= rating} /></button>)}</div><button className="thread-publish" disabled={posting || !placeName.trim() || experience.trim().length < 10} onClick={() => void publishPost()}>{posting ? <div className="spinner" /> : <Icon name="send" size={18} />}Post experience</button></div>
      </section>

      {error && <p className="error-text" role="alert">{error}</p>}
      <section className="community-thread" aria-label="Community experiences"><div className="feed-section-heading"><div><span>COMMUNITY THREAD</span><h2>Latest experiences</h2></div><strong>{visiblePosts.length}</strong></div><div className="chip-scroll" aria-label="Filter community posts">{(["All", ...experienceCategories] as const).map((value) => <button key={value} className={`chip feed-chip ${category === value ? "chip-selected" : ""}`} onClick={() => setCategory(value)}>{value}</button>)}</div>{loading ? <div className="thread-loading"><div className="spinner" /><span>Loading community stories...</span></div> : visiblePosts.length === 0 ? <EmptyState icon="forum" title={posts.length === 0 ? "Start the community thread" : "No posts found"} message={posts.length === 0 ? "Be the first to share an experience from a place or establishment." : "Try a different search or category."} action={posts.length === 0 ? undefined : "Show all posts"} onAction={posts.length === 0 ? undefined : () => { setQuery(""); setCategory("All"); }} /> : <div className="thread-posts">{visiblePosts.map((post) => <article className="thread-post" key={post.id}><header><span className="thread-avatar">{post.authorAvatarUrl ? <img src={post.authorAvatarUrl} alt="" /> : post.authorName.charAt(0).toUpperCase()}</span><div><strong>{post.authorName}</strong><span>{postTime(post)}</span></div>{post.authorUid === user?.uid && <button className="thread-delete" onClick={() => setDeleteTarget(post)} aria-label={`Delete your post about ${post.placeName}`}><Icon name="delete" size={19} /></button>}</header><div className="thread-post-place"><span className="thread-category"><Icon name="location_on" size={15} />{post.category}</span><div><h3>{post.placeName}</h3>{post.location && <span>{post.location}</span>}</div>{post.rating !== null && <span className="thread-post-rating"><Icon name="star" size={17} filled />{post.rating}/5</span>}</div><p>{post.experience}</p></article>)}</div>}</section>

      <AppModal visible={businessEditorOpen} title={businessProfile ? "Edit business profile" : "Create business profile"} onClose={() => !businessSaving && setBusinessEditorOpen(false)}><p className="business-modal-intro">Tell travelers what makes your local business worth discovering.</p><Field label="Business name" value={businessDraft.name} onChangeText={(name) => setBusinessDraft({ ...businessDraft, name })} placeholder="e.g. Mayon Coffee House" /><Field label="Business category" value={businessDraft.category} onChangeText={(categoryValue) => setBusinessDraft({ ...businessDraft, category: categoryValue })} placeholder="Cafe, crafts, tours..." /><Field label="Location" value={businessDraft.location} onChangeText={(locationValue) => setBusinessDraft({ ...businessDraft, location: locationValue })} placeholder="Legazpi City, Albay" /><Field label="About your business" value={businessDraft.description} onChangeText={(description) => setBusinessDraft({ ...businessDraft, description })} placeholder="Share what makes your business special" multiline /><Button label="Save business profile" onPress={saveBusinessProfile} loading={businessSaving} /></AppModal>
      <AppModal visible={productEditorOpen} title="Add a product" onClose={() => !businessSaving && setProductEditorOpen(false)}><p className="business-modal-intro">Create a clear product listing for travelers browsing Hilinga.</p><Field label="Product name" value={productDraft.name} onChangeText={(name) => setProductDraft({ ...productDraft, name })} placeholder="e.g. Single-origin Albay coffee" /><Field label="Category" value={productDraft.category} onChangeText={(categoryValue) => setProductDraft({ ...productDraft, category: categoryValue })} placeholder="Food, souvenir, tour..." /><Field label="Price (optional)" value={productDraft.price} onChangeText={(price) => setProductDraft({ ...productDraft, price })} placeholder="e.g. ₱350" /><Field label="Description (optional)" value={productDraft.description} onChangeText={(description) => setProductDraft({ ...productDraft, description })} placeholder="What should customers know?" multiline /><Button label="Add product" onPress={addProduct} loading={businessSaving} /></AppModal>
      <ConfirmModal visible={deleteTarget !== null} title="Delete this post?" message={deleteTarget ? `Your experience about “${deleteTarget.placeName}” will be permanently removed.` : ""} confirmLabel="Delete post" loading={posting} onCancel={() => !posting && setDeleteTarget(null)} onConfirm={removePost} />
    </div>
  );
}

void CommunityFeedLegacy;

function Feed({ onOpenBusiness }: { onOpenBusiness: (businessId: string) => void }) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | BusinessPost["category"]>("All");
  const [publishedPosts, setPublishedPosts] = useState<BusinessPost[]>(() => readPublishedBusinessPosts());
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [likePendingIds, setLikePendingIds] = useState<Set<string>>(new Set());
  const [likeError, setLikeError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setPublishedPosts(readPublishedBusinessPosts());
    const unsubscribe = subscribeToPublishedBusinessPosts(
      setPublishedPosts,
      (error) => console.warn("[business-feed] Could not load shared posts:", error),
    );
    window.addEventListener("storage", refresh);
    window.addEventListener(BUSINESS_CONTENT_CHANGED_EVENT, refresh);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", refresh);
      window.removeEventListener(BUSINESS_CONTENT_CHANGED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) { setLikedIds(new Set()); return; }
    return subscribeToLikedBusinessPosts(
      user.uid,
      setLikedIds,
      () => setLikeError("Your saved likes could not be loaded."),
    );
  }, [user?.uid]);

  const curatedPosts = useMemo<BusinessPost[]>(() => [
    { id: "coffee-morning", businessId: "albay-coffee-house", businessName: "Albay Coffee House", businessCategory: "Cafes", businessLocation: "Old Albay District, Legazpi City", businessLogoUrl: explore4, category: "Photos & Videos", title: "Bicol-grown coffee, brewed fresh", detail: "Start your Legazpi morning with locally sourced beans and a warm pastry while enjoying the neighborhood.", mediaUrl: explore4, mediaType: "image", createdAt: "2026-08-12T08:30:00.000Z" },
    { id: "market-weekend", businessId: "legazpi-local-market", businessName: "Legazpi Local Market", businessCategory: "Shopping", businessLocation: "Legazpi Port District, Legazpi City", businessLogoUrl: explore6, category: "Promotions", title: "Weekend local makers showcase", detail: "Meet Albay makers, taste regional favorites, and bring home handcrafted finds this weekend.", mediaUrl: explore6, mediaType: "image", promotionOffer: "Special bundles from participating local sellers", createdAt: "2026-08-11T10:00:00.000Z" },
    { id: "oriental-sunset", businessId: "the-oriental-legazpi", businessName: "The Oriental Legazpi", businessCategory: "Stay", businessLocation: "Taysan Hill, Legazpi City", businessLogoUrl: explore5, category: "Photos & Videos", title: "An evening above the city", detail: "Slow down with panoramic views of Legazpi and Mayon from our hillside retreat.", mediaUrl: explore5, mediaType: "image", createdAt: "2026-08-10T16:45:00.000Z" },
    { id: "mall-event", businessId: "pacific-mall-legazpi", businessName: "Pacific Mall Legazpi", businessCategory: "Shopping", businessLocation: "Landco Business Park, Legazpi City", businessLogoUrl: explore6, category: "Events", title: "Bicol culture and food fair", detail: "A family-friendly afternoon of local food, music, crafts, and community performances.", mediaUrl: explore6, mediaType: "image", eventDate: "2026-08-22", eventLocation: "Pacific Mall Activity Center", createdAt: "2026-08-09T09:15:00.000Z" },
  ], []);

  const visiblePosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...publishedPosts, ...curatedPosts]
      .filter((post) => (category === "All" || post.category === category) && `${post.businessName} ${post.title} ${post.detail} ${post.businessCategory}`.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [category, curatedPosts, publishedPosts, query]);

  async function toggleLike(postId: string) {
    if (!user?.uid || likePendingIds.has(postId)) return;
    const wasLiked = likedIds.has(postId);
    setLikeError(null);
    setLikePendingIds((current) => new Set(current).add(postId));
    setLikedIds((current) => {
      const next = new Set(current);
      if (wasLiked) next.delete(postId); else next.add(postId);
      return next;
    });
    try {
      await setBusinessPostLiked(postId, user.uid, !wasLiked);
    } catch {
      setLikedIds((current) => {
        const next = new Set(current);
        if (wasLiked) next.add(postId); else next.delete(postId);
        return next;
      });
      setLikeError("That like could not be saved. Please try again.");
    } finally {
      setLikePendingIds((current) => { const next = new Set(current); next.delete(postId); return next; });
    }
  }

  return (
    <div className="screen feed-screen social-feed-screen">
      <header className="social-feed-header">
        <div><span>DISCOVER LOCAL</span><h1>Feed</h1><p>Fresh posts, events, and offers from businesses around Albay.</p></div>
        <div className="feed-search"><Icon name="search" size={20} color="var(--c-muted)" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search businesses or posts" aria-label="Search business posts" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><Icon name="cancel" size={20} color="var(--c-muted)" /></button>}</div>
      </header>

      <div className="chip-scroll social-feed-filters" aria-label="Filter business posts">
        {(["All", "Photos & Videos", "Events", "Promotions"] as const).map((value) => <button key={value} className={`chip feed-chip ${category === value ? "chip-selected" : ""}`} onClick={() => setCategory(value)}><Icon name={value === "All" ? "dynamic_feed" : value === "Events" ? "event" : value === "Promotions" ? "local_offer" : "photo_library"} size={16} />{value}</button>)}
      </div>
      {likeError && <p className="error-text" role="alert">{likeError}</p>}

      {visiblePosts.length === 0 ? <EmptyState icon="storefront" title="No business posts found" message="Try another search or show every post." action="Show all posts" onAction={() => { setQuery(""); setCategory("All"); }} /> : <section className="social-feed-list" aria-label="Business news feed">
        {visiblePosts.map((post) => {
          const liked = likedIds.has(post.id);
          return <article className="social-business-post" key={post.id}>
            <button className="social-post-business" onClick={() => onOpenBusiness(post.businessId)}>
              <span className="social-post-avatar">{post.businessLogoUrl ? <img src={post.businessLogoUrl} alt="" /> : <Icon name="storefront" size={23} />}</span>
              <span className="social-post-byline"><strong>{post.businessName}<Icon name="verified" size={16} filled /></strong><small>{post.businessLocation} · {new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(new Date(post.createdAt))}</small></span>
              <Icon name="chevron_right" size={21} />
            </button>
            <div className="social-post-copy"><span className={`social-post-category category-${post.category.toLowerCase().replace(/[^a-z]+/g, "-")}`}><Icon name={post.category === "Events" ? "event" : post.category === "Promotions" ? "local_offer" : "photo_library"} size={14} />{post.category}</span><h2>{post.title}</h2>{post.detail && <p>{post.detail}</p>}</div>
            {post.category === "Events" && <div className="social-post-highlight"><Icon name="calendar_month" size={21} /><div><strong>{post.eventDate ? new Date(`${post.eventDate}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }) : "Date to be announced"}</strong><span>{post.eventLocation || post.businessLocation}</span></div></div>}
            {post.category === "Promotions" && <div className="social-post-highlight promotion"><Icon name="sell" size={21} /><div><strong>{post.promotionOffer || "Special offer"}</strong><span>{post.promotionEnds ? `Available until ${new Date(`${post.promotionEnds}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric" })}` : "Limited-time offer"}</span></div></div>}
            {post.mediaUrl && (post.mediaType === "video" ? <video className="social-post-media" src={post.mediaUrl} controls playsInline /> : <img className="social-post-media" src={post.mediaUrl} alt={post.title} />)}
            <footer><button className={liked ? "liked" : ""} disabled={likePendingIds.has(post.id)} onClick={() => void toggleLike(post.id)}><Icon name="favorite" size={20} filled={liked} />{liked ? "Liked" : "Like"}</button><button onClick={() => onOpenBusiness(post.businessId)}><Icon name="rate_review" size={20} />Reviews</button><button onClick={() => navigator.share?.({ title: post.title, text: `${post.businessName}: ${post.detail}` })}><Icon name="share" size={20} />Share</button></footer>
          </article>;
        })}
      </section>}
    </div>
  );
}

type PlannerAnswerKey = "destination" | "dates" | "days" | "travelers" | "interests" | "priorityInterests" | "pace" | "budget" | "detail" | "schedule" | "sections" | "excludedPlaces" | "requirements";
type PlannerAnswers = {
  destination?: string;
  dates?: string;
  days?: string;
  travelers?: string;
  interests?: string[];
  priorityInterests?: string[];
  pace?: string;
  budget?: string;
  detail?: string;
  schedule?: string;
  sections?: string[];
  excludedPlaces?: string[];
  requirements?: string;
};
type PlannerMessage = { id: number; role: "guide" | "user"; text: string };

type PlannerOption = { label: string; value: string; icon: string; description?: string };
type PlannerQuestion = { key: PlannerAnswerKey; prompt: string; kind: "single" | "multi" | "text" | "date-range"; options?: PlannerOption[]; optional?: boolean; placeholder?: string };

function formatTravelersLabel(raw?: string): string {
  if (!raw || !raw.trim()) return "your group";
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    return num === 1 ? "1 traveler" : `${num} travelers`;
  }
  if (trimmed.toLocaleLowerCase() === "family or group" || trimmed.toLocaleLowerCase() === "family / group") {
    return "your group";
  }
  return trimmed;
}

const interestOptions: PlannerOption[] = [
  { label: "Mayon & ATV Adventure", value: "Mayon Volcano and ATV adventure", icon: "hiking", description: "Lava wall, ATV trails & Mayon viewpoints" },
  { label: "Nature & Hiking", value: "Nature and hiking", icon: "landscape", description: "Scenic hills, parks & mountain trails" },
  { label: "Beaches & Islands", value: "Beaches and islands", icon: "beach_access", description: "Coastal shores, island hopping & water spots" },
  { label: "Food & Local Cuisine", value: "Food and local cuisine", icon: "restaurant", description: "Bicol Express, Pinangat & Chili Ice Cream" },
  { label: "Historic Sites & Ruins", value: "Historic sites and ruins", icon: "account_balance", description: "Cagsawa Ruins, Daraga Church & heritage" },
  { label: "Waterfalls & Lakes", value: "Waterfalls and lakes", icon: "water_drop", description: "Vera Falls, Sumlang Lake & natural springs" },
  { label: "Photography & Views", value: "Photography and viewpoints", icon: "photo_camera", description: "Ligñon Hill, Quitinday & Mayon views" },
  { label: "Shopping & Souvenirs", value: "Shopping and souvenirs", icon: "shopping_bag", description: "Pili nuts, handicrafts & abaca woven goods" },
  { label: "Arts & Museums", value: "Arts and museums", icon: "museum", description: "Bicol Heritage Museum & local art galleries" },
  { label: "Wellness & Relaxation", value: "Wellness and relaxation", icon: "spa", description: "Hot springs, resorts & relaxing staycations" },
  { label: "Family-Friendly Fun", value: "Family-friendly activities", icon: "family_restroom", description: "Parks, playgrounds & kid-safe outings" },
  { label: "Romantic Experiences", value: "Romantic experiences", icon: "favorite", description: "Sunset dining, lakeside strolls & getaways" },
  { label: "Churches & Shrines", value: "Religious or spiritual sites", icon: "church", description: "Historic Bicol churches & pilgrim sites" },
  { label: "Festivals & Events", value: "Festivals and events", icon: "celebration", description: "Magayon Festival & local celebrations" },
  { label: "Nightlife & Dining", value: "Nightlife", icon: "nightlife", description: "Evening lounges, food parks & local nightlife" },
  { label: "Hidden Gems", value: "Hidden gems", icon: "explore", description: "Off-the-beaten-path spots & secret locations" },
];

const defaultSections = ["Estimated costs", "Transportation instructions", "Travel times", "Restaurant recommendations", "Booking reminders"];
const sectionOptions = [
  ...defaultSections, "Accommodation suggestions", "Accessibility information", "Packing recommendations",
  "Weather alternatives", "Safety and local travel tips",
];

const plannerQuestions: PlannerQuestion[] = [
  { key: "destination", prompt: "Where in Albay would you like to go? You can choose the whole province or a specific city or attraction.", kind: "text", options: [
    { label: "Whole Albay Province", value: "Albay", icon: "location_on", description: "Explore provincial highlights" },
    { label: "Legazpi City & Downtown", value: "Legazpi City", icon: "location_city", description: "Boulevard, Ligñon Hill & dining" },
    { label: "Daraga & Cagsawa", value: "Daraga", icon: "church", description: "Cagsawa Ruins & Daraga Church" },
    { label: "Mayon Volcano Foothills", value: "Mayon Volcano", icon: "landscape", description: "ATV trails & lava wall viewpoints" },
    { label: "Tabaco City & Coastal", value: "Tabaco City", icon: "storefront", description: "Port area, historic church & markets" },
  ], placeholder: "e.g. Albay, Legazpi, Daraga, or Mayon" },
  { key: "dates", prompt: "What are your travel dates?", kind: "date-range" },
  { key: "days", prompt: "How many travel days should I plan?", kind: "single", options: [
    { label: "1 day", value: "1", icon: "sunny", description: "Day trip highlights" },
    { label: "2 days", value: "2", icon: "date_range", description: "Weekend getaway" },
    { label: "3 days", value: "3", icon: "calendar_month", description: "Full Albay experience" },
    { label: "4 days", value: "4", icon: "event_repeat", description: "Extended exploration" },
    { label: "5 days", value: "5", icon: "view_week", description: "Comprehensive tour" },
  ] },
  { key: "travelers", prompt: "How many people are traveling?", kind: "text", options: [
    { label: "1 traveler", value: "1 traveler", icon: "person", description: "Solo trip" },
    { label: "2 travelers", value: "2 travelers", icon: "group", description: "Couple or pair" },
    { label: "3 travelers", value: "3 travelers", icon: "groups", description: "Small group" },
    { label: "4 travelers", value: "4 travelers", icon: "groups", description: "Family or group" },
    { label: "5+ travelers", value: "5+ travelers", icon: "groups", description: "Large group" },
  ], placeholder: "Enter number & details (e.g. 2 adults, 1 child)" },
  { key: "interests", prompt: "What activities interest you? You may select as many as you like.", kind: "multi", options: interestOptions },
  { key: "priorityInterests", prompt: "Which of these interests matter most? Select any priorities, or treat them all equally.", kind: "multi", optional: true },
  { key: "pace", prompt: "How would you like your itinerary presented? You can customize the pace, budget, detail level, schedule style, and sections you want included. First, what travel pace feels comfortable?", kind: "single", options: [
    { label: "Relaxed", value: "Relaxed", icon: "spa", description: "Fewer activities and longer rest periods" },
    { label: "Balanced", value: "Balanced", icon: "directions_walk", description: "A moderate number of activities" },
    { label: "Packed", value: "Packed", icon: "bolt", description: "More activities and shorter breaks" },
  ] },
  { key: "budget", prompt: "What budget level should I use? You can also type a custom amount and currency.", kind: "text", options: [
    { label: "Budget", value: "Budget", icon: "savings", description: "Affordable spots & local eateries" },
    { label: "Moderate", value: "Moderate", icon: "wallet", description: "Balanced dining & standard tours" },
    { label: "Premium", value: "Premium", icon: "diamond", description: "High-end resorts & private tours" },
  ], placeholder: "e.g. PHP 12,000 total" },
  { key: "detail", prompt: "How much detail would you like?", kind: "single", options: [
    { label: "Quick overview", value: "Quick overview", icon: "view_agenda", description: "Highlights & main stops" },
    { label: "Standard itinerary", value: "Standard itinerary", icon: "article", description: "Times, activities & tips" },
    { label: "Detailed itinerary", value: "Detailed itinerary", icon: "menu_book", description: "In-depth notes & local guide tips" },
  ] },
  { key: "schedule", prompt: "Which schedule style do you prefer?", kind: "single", options: [
    { label: "Exact suggested times", value: "Exact suggested times", icon: "schedule", description: "Hourly time slots" },
    { label: "Flexible time periods", value: "Flexible time periods", icon: "wb_twilight", description: "Morning, afternoon & evening blocks" },
    { label: "Activities only", value: "Activities only, without times", icon: "list", description: "Unscheduled list of recommended stops" },
  ] },
  { key: "sections", prompt: "Which information should I include? Select as many as you like.", kind: "multi", options: sectionOptions.map((value) => ({ label: value, value, icon: "add_task" })), optional: true },
  { key: "excludedPlaces", prompt: "Are there any places you do not want in the plan?", kind: "multi", options: [
    { label: "Cagsawa Ruins", value: "Cagsawa Ruins", icon: "block", description: "Already visited" },
    { label: "Mayon ATV Adventure", value: "Mayon ATV Adventure", icon: "block", description: "Skip extreme rides" },
    { label: "Ligñon Hill", value: "Ligñon Hill", icon: "block", description: "Already visited" },
    { label: "Daraga Church", value: "Daraga Church", icon: "block", description: "Already visited" },
  ], optional: true, placeholder: "e.g. Cagsawa Ruins, Daraga Church" },
  { key: "requirements", prompt: "Any special requirements?", kind: "text", options: [
    { label: "Senior-friendly / Minimal walking", value: "Senior-friendly with minimal walking", icon: "accessible" },
    { label: "Kid & stroller friendly", value: "Kid and stroller friendly", icon: "child_care" },
    { label: "Halal / Seafood options", value: "Halal or seafood dietary options", icon: "restaurant_menu" },
    { label: "Vegetarian food choices", value: "Vegetarian food options", icon: "spa" },
  ], optional: true, placeholder: "Type requirements, or skip" },
];

function createDefaultPlannerAnswers(): PlannerAnswers {
  return { pace: "Balanced", budget: "Moderate", detail: "Standard itinerary", schedule: "Flexible time periods", sections: [...defaultSections] };
}

function calendarDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTravelDateRange(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("en-PH", { month: "long", day: "numeric", year: "numeric" });
  const startLabel = formatter.format(new Date(`${start}T00:00:00`));
  if (start === end) return startLabel;
  return `${startLabel} – ${formatter.format(new Date(`${end}T00:00:00`))}`;
}

const MAX_PLANNER_DAYS = 7;

function travelDayCount(start: string, end: string) {
  const startTime = new Date(`${start}T00:00:00Z`).getTime();
  const endTime = new Date(`${end}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((endTime - startTime) / 86_400_000) + 1);
}

function offsetCalendarDate(value: string, days: number) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function plannerQuestionPrompt(step: number, answers: PlannerAnswers) {
  const question = plannerQuestions[step];
  if (!question) return "";
  const destination = answers.destination?.trim() || "your destination";
  const days = answers.days ? `${answers.days}-day` : "";
  const travelers = formatTravelersLabel(answers.travelers);
  const interests = answers.interests ?? [];
  switch (question.key) {
    case "dates": return `When will you visit ${destination}? Choose a trip of up to ${MAX_PLANNER_DAYS} days.`;
    case "days": return `How many days should I plan for ${destination}?`;
    case "travelers": return `Who is joining this ${days} trip to ${destination}? Select a quick option or type specific details.`;
    case "interests": return `What would ${travelers} most enjoy in ${destination}? Select everything that fits.`;
    case "priorityInterests": return `You chose ${interests.length} interests. Which should get the most time in the itinerary?`;
    case "pace": return `What pace would feel comfortable for ${travelers}?`;
    case "budget": return `What total budget should I work with for ${travelers} across ${answers.days ?? "the planned"} day${answers.days === "1" ? "" : "s"}? You can include a currency.`;
    case "detail": return `How much detail would you like for this ${answers.pace?.toLocaleLowerCase() ?? "balanced"} trip?`;
    case "schedule": return `Should I use exact times or keep the ${destination} schedule flexible?`;
    case "sections": return `What practical information should I add for ${travelers}?`;
    case "excludedPlaces": return `Is there anywhere in or near ${destination} that I should leave out?`;
    case "requirements": return `Last detail: does ${travelers} have any mobility, accessibility, dietary, age, language, or timing needs?`;
    default: return question.prompt;
  }
}

function nextPlannerStep(currentStep: number, answers: PlannerAnswers) {
  let nextStep = currentStep + 1;
  while (nextStep < plannerQuestions.length) {
    const key = plannerQuestions[nextStep].key;
    if (key === "days" && answers.days) { nextStep += 1; continue; }
    if (key === "priorityInterests" && (answers.interests?.length ?? 0) <= 1) { nextStep += 1; continue; }
    break;
  }
  return nextStep;
}

function previousPlannerStep(currentStep: number, answers: PlannerAnswers) {
  let previousStep = Math.min(currentStep - 1, plannerQuestions.length - 1);
  while (previousStep > 0) {
    const key = plannerQuestions[previousStep].key;
    if (key === "days" && answers.days) { previousStep -= 1; continue; }
    if (key === "priorityInterests" && (answers.interests?.length ?? 0) <= 1) { previousStep -= 1; continue; }
    break;
  }
  return previousStep;
}

function plannerAcknowledgement(key: PlannerAnswerKey, answers: PlannerAnswers) {
  switch (key) {
    case "destination": return `${answers.destination || "That destination"} sounds good.`;
    case "dates": return `Perfect - I matched those dates to a ${answers.days}-day plan.`;
    case "days": return `Got it - I will plan ${answers.days} day${answers.days === "1" ? "" : "s"}.`;
    case "travelers": return `I will shape the plan around ${formatTravelersLabel(answers.travelers)}.`;
    case "interests": return answers.interests?.length === 1
      ? `${answers.interests[0]} will be the main theme.`
      : `Nice mix - I will balance ${answers.interests?.length ?? 0} interests.`;
    case "priorityInterests": return answers.priorityInterests?.length
      ? `I will give extra time to ${answers.priorityInterests.join(" and ")}.`
      : "I will balance your interests evenly.";
    case "pace": return `${answers.pace || "Balanced"} pace selected.`;
    case "budget": return `I will keep suggestions within ${answers.budget || "a moderate budget"}.`;
    case "detail": return `${answers.detail || "Standard detail"} it is.`;
    case "schedule": return `I will use ${answers.schedule?.toLocaleLowerCase() || "flexible time periods"}.`;
    case "sections": return answers.sections?.length ? `I will include the ${answers.sections.length} practical sections you selected.` : "I will keep the plan focused on activities.";
    case "excludedPlaces": return answers.excludedPlaces?.length ? `I will avoid ${answers.excludedPlaces.join(", ")}.` : "No places are excluded.";
    case "requirements": return answers.requirements ? "Thanks - I will apply those needs throughout the plan." : "No special requirements noted.";
  }
}

type PlannerActivity = { title: string; icon: string; base: string; searchText?: string };

function normalizePlaceName(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function isSupportedPlannerDestination(value: string) {
  return /\b(albay|legazpi|daraga|bacacay|tabaco|tiwi|camalig|guinobatan|ligao|libon|oas|polangui|manito|malilipot|malinao|jovellar|rapu rapu|santo domingo|sto domingo|mayon|cagsawa)\b/.test(normalizePlaceName(value));
}

function parseTravelerCount(value = "") {
  const groupedCounts = [...value.matchAll(/(\d+)\s*(?:adult|traveler|people|person|child|children|kid|kids|guest)s?/gi)]
    .map((match) => Number.parseInt(match[1], 10));
  if (groupedCounts.length) return groupedCounts.reduce((total, count) => total + count, 0);
  return Number.parseInt(value.match(/^\s*(\d+)\b/)?.[1] ?? "", 10);
}

function isExcludedActivity(activity: PlannerActivity, exclusions: string[]) {
  const haystack = normalizePlaceName(`${activity.title} ${activity.searchText ?? ""}`);
  return exclusions.some((place) => {
    const needle = normalizePlaceName(place);
    return needle.length > 1 && (haystack.includes(needle) || needle.includes(normalizePlaceName(activity.title)));
  });
}

function businessActivity(business: RegisteredSmallBusiness): PlannerActivity {
  const category = business.category.toLocaleLowerCase();
  const icon = /food|cafe|coffee|restaurant|bakery/.test(category) ? "restaurant"
    : /hotel|stay|resort|inn|accommodation/.test(category) ? "hotel"
      : /tour|travel|activity|adventure/.test(category) ? "tour"
        : /shop|retail|craft|market/.test(category) ? "storefront" : "store";
  return {
    title: business.name,
    icon,
    base: `${business.about} Visit this registered Hilinga small business in ${business.location}. Business hours: ${business.hours}.`,
    searchText: `${business.name} ${business.category} ${business.location}`,
  };
}

function buildItinerary(answers: PlannerAnswers, registeredBusinesses: RegisteredSmallBusiness[] = []): ItineraryDay[] {
  const dayCount = Math.max(1, Math.min(MAX_PLANNER_DAYS, Number.parseInt(answers.days ?? "2", 10) || 2));
  const pace = answers.pace ?? "Balanced";
  const requirements = answers.requirements?.trim() ?? "";
  const requirementText = requirements.toLocaleLowerCase();
  const needsGentleMobility = /wheelchair|mobility|cannot walk|can['’]?t walk|short walk|senior|elderly|pregnant|accessible/.test(requirementText);
  const hasChildren = /child|children|kid|kids|toddler|baby|infant/.test(`${answers.travelers ?? ""} ${requirementText}`.toLocaleLowerCase());
  const hasDietaryNeeds = /diet|allerg|vegetarian|vegan|halal|gluten|dairy|nut|seafood/.test(requirementText);
  const maxStops = needsGentleMobility || pace === "Relaxed" ? 2 : pace === "Packed" ? 4 : 3;
  const destination = answers.destination ?? "Albay";
  const normalizedDestination = normalizePlaceName(destination);
  const sections = answers.sections ?? defaultSections;
  const detail = answers.detail ?? "Standard itinerary";
  const exactTimes = ["8:00 AM", "11:00 AM", "2:30 PM", "5:30 PM"];
  const flexibleTimes = ["Morning", "Late morning", "Afternoon", "Evening"];
  const activityCatalog: Record<string, PlannerActivity> = {
    "Beaches and islands": { title: "Bacacay coast and island views", icon: "beach_access", base: "Enjoy an unhurried stretch by the water." },
    "Nature and hiking": { title: "Mayon nature and photography walk", icon: "hiking", base: "Choose a marked trail suited to your group’s mobility." },
    "Adventure activities": { title: "Mayon ATV Adventure", icon: "sports_motorsports", base: "Pick a route and operator that match your experience level." },
    "Food and local cuisine": { title: "Market shopping and Bicolano tasting", icon: "restaurant", base: "Try pinangat, Bicol Express, pili treats, and local coffee." },
    "Culture and history": { title: "Cagsawa Ruins", icon: "account_balance", base: "Explore local stories with a clear view of Mayon." },
    "Arts and museums": { title: "Albay arts and museum stop", icon: "museum", base: "Browse regional art, artifacts, and community history." },
    "Shopping": { title: "Local market and crafts", icon: "shopping_bag", base: "Look for pili products, abaca crafts, and locally made gifts." },
    "Nightlife": { title: "Legazpi evening spots", icon: "nightlife", base: "Wind down at a lively but convenient local venue." },
    "Photography": { title: "Mayon golden-hour photo stop", icon: "photo_camera", base: "Build in time for changing light and cloud cover." },
    "Wellness and relaxation": { title: "Lakeside rest and wellness break", icon: "spa", base: "Keep this block spacious and restorative." },
    "Family-friendly activities": { title: "Albay Park & Wildlife", icon: "family_restroom", base: "A gentle, flexible stop for travelers of different ages." },
    "Romantic experiences": { title: "Sunset at Legazpi Boulevard", icon: "favorite", base: "Take a slow waterfront walk and pause for dinner." },
    "Religious or spiritual sites": { title: "Daraga faith and heritage trail", icon: "church", base: "Visit respectfully and allow time to enjoy the viewpoint." },
    "Festivals and events": { title: "Local festival or community event", icon: "celebration", base: "Check the local calendar and current admission details." },
    "Hidden gems": { title: "Guide-picked Albay hidden gem", icon: "explore", base: "Leave room for a lesser-known stop recommended locally." },
    "Other interests specified by the user": { title: "Guide-picked Albay hidden gem", icon: "interests", base: answers.requirements || "Match this stop to the additional interest you described." },
  };
  const selected = answers.interests?.length ? answers.interests : ["Nature and hiking", "Food and local cuisine", "Culture and history"];
  const priority = answers.priorityInterests ?? [];
  const exclusions = answers.excludedPlaces ?? [];
  const ordered = [...priority, ...selected.filter((interest) => !priority.includes(interest))];
  const combined = ordered.map((interest) => {
    if (interest === "Nature and hiking" && ordered.includes("Photography")) return { ...activityCatalog[interest], title: "Mayon nature and photography walk" };
    if (interest === "Culture and history" && ordered.includes("Religious or spiritual sites")) return { ...activityCatalog[interest], title: "Daraga faith and heritage trail" };
    if (interest === "Food and local cuisine" && ordered.includes("Shopping")) return { ...activityCatalog[interest], title: "Market shopping and Bicolano tasting" };
    return activityCatalog[interest] ?? { title: "Guide-picked Albay hidden gem", icon: "explore", base: `Local recommendation for your interest: ${interest}.` };
  }).filter((activity, index, activities) => activity && activities.findIndex((item) => item?.title === activity.title) === index);
  const fallbacks = [activityCatalog["Nature and hiking"], activityCatalog["Food and local cuisine"], activityCatalog["Culture and history"], activityCatalog["Romantic experiences"]];
  const matchingBusinesses = registeredBusinesses.filter((business) => {
    if (normalizedDestination === "albay" || normalizedDestination.includes("albay province")) return true;
    const location = normalizePlaceName(business.location);
    const specificTokens = normalizedDestination.split(" ").filter((token) => token.length > 2 && !["albay", "city", "province"].includes(token));
    return specificTokens.length ? specificTokens.some((token) => location.includes(token)) : location.includes("albay");
  });
  const localBusinesses = matchingBusinesses.map(businessActivity).filter((activity) => !isExcludedActivity(activity, exclusions));
  const preferred = combined.filter((activity) => !isExcludedActivity(activity, exclusions));
  const remaining = fallbacks.filter((item) => !preferred.some((activity) => activity.title === item.title) && !isExcludedActivity(item, exclusions));
  const priorityActivities = priority
    .map((interest) => combined[ordered.indexOf(interest)])
    .filter((activity): activity is PlannerActivity => Boolean(activity) && !isExcludedActivity(activity, exclusions));
  const weightedPreferences = priorityActivities.length ? [...preferred, ...priorityActivities] : preferred;
  const activities = [weightedPreferences[0], ...weightedPreferences.slice(1, 2), ...localBusinesses, ...weightedPreferences.slice(2), ...remaining].filter((activity): activity is PlannerActivity => Boolean(activity));
  if (activities.length === 0) activities.push({ title: "Guide-picked Albay hidden gem", icon: "explore", base: "Choose a locally recommended stop that respects your excluded-place list." });
  const standardBudgets = ["Budget", "Moderate", "Premium"];
  const travelerCount = parseTravelerCount(answers.travelers);
  const noteFor = (activity: PlannerActivity, stopIndex: number) => {
    const notes = [activity.base];
    if (sections.includes("Estimated costs")) notes.push(answers.budget && !standardBudgets.includes(answers.budget)
      ? `Plan this within your stated ${answers.budget} budget.`
      : `Estimated ${answers.budget === "Budget" ? "₱300–₱700" : answers.budget === "Premium" ? "₱1,500+" : "₱700–₱1,500"} per person${Number.isFinite(travelerCount) ? `; multiply by ${travelerCount} traveler${travelerCount === 1 ? "" : "s"}` : ""}.`);
    if (sections.includes("Travel times")) notes.push(stopIndex === 0 ? "Allow 20–40 minutes from central Legazpi." : "Allow roughly 15–30 minutes from the previous stop.");
    if (sections.includes("Transportation instructions")) notes.push("Use a local jeepney/tricycle connection or arrange a direct ride.");
    if (sections.includes("Restaurant recommendations") && stopIndex === 1) notes.push("Choose a well-reviewed local Bicolano restaurant nearby.");
    if (sections.includes("Booking reminders")) notes.push("Confirm hours and reservations before travel.");
    if (sections.includes("Accessibility information")) notes.push("Ask the venue about step-free access and accessible restrooms.");
    if (sections.includes("Packing recommendations")) notes.push("Bring water, sun protection, and rain cover.");
    if (sections.includes("Weather alternatives")) notes.push("For heavy rain, swap this with a museum, café, or covered market.");
    if (sections.includes("Safety and local travel tips")) notes.push("Keep valuables secure and use accredited operators.");
    if (sections.includes("Accommodation suggestions") && stopIndex === 0) notes.push(`Stay near central ${destination} for easier transfers.`);
    if (needsGentleMobility) notes.push("Keep transfers short, confirm step-free access, and allow extra rest time.");
    if (hasDietaryNeeds && activity.icon === "restaurant") notes.push(`Confirm these dietary needs before ordering: ${requirements}.`);
    if (hasChildren) notes.push("Keep timing flexible for breaks and age-appropriate facilities.");
    if (detail === "Detailed itinerary" && answers.requirements) notes.push(`Personal requirement: ${answers.requirements}`);
    if (detail === "Quick overview") return notes.slice(0, needsGentleMobility || hasDietaryNeeds || hasChildren ? 2 : 1).join(" ");
    return notes.join(" ");
  };
  let activityIndex = 0;
  return Array.from({ length: dayCount }, (_, dayIndex) => ({
    day: dayIndex + 1,
    title: dayIndex === 0 ? `${destination} highlights` : dayIndex === 1 ? "Local flavors and landscapes" : "Hidden corners and slow moments",
    stops: Array.from({ length: maxStops }, (_, stopIndex) => {
      const activity = activities[activityIndex % activities.length];
      activityIndex += 1;
      return {
        time: answers.schedule === "Activities only, without times" ? "" : answers.schedule === "Exact suggested times" ? exactTimes[stopIndex] : flexibleTimes[stopIndex],
        title: activity.title,
        note: noteFor(activity, stopIndex),
        icon: activity.icon,
      };
    }),
  }));
}

function ItineraryPreview({
  itinerary,
  compact = false,
  onExclude,
  onReplaceStop,
  budgetText,
}: {
  itinerary: ItineraryDay[];
  compact?: boolean;
  onExclude?: (title: string) => void;
  onReplaceStop?: (day: number, stopIndex: number, currentTitle: string) => void;
  budgetText?: string | number | null;
}) {
  const registeredBizNames = useMemo(() => {
    const bizList = readRegisteredSmallBusinesses();
    return new Set(bizList.map((biz) => biz.name.toLowerCase().trim()));
  }, []);

  const formattedBudget = useMemo(() => {
    if (!budgetText) return "Moderate (₱700–₱1,500 / person)";
    if (typeof budgetText === "number") return `₱${budgetText.toLocaleString()} Total Budget`;
    if (budgetText === "Budget") return "₱300–₱700 per person / day (Budget)";
    if (budgetText === "Moderate") return "₱700–₱1,500 per person / day (Moderate)";
    if (budgetText === "Premium") return "₱1,500+ per person / day (Premium)";
    return budgetText;
  }, [budgetText]);

  return (
    <div className={`itinerary-preview ${compact ? "itinerary-preview-compact" : ""}`}>
      {!compact && (
        <div className="itinerary-budget-banner">
          <div className="itinerary-budget-icon">
            <Icon name="account_balance_wallet" size={20} color="white" />
          </div>
          <div className="itinerary-budget-copy">
            <span className="itinerary-budget-label">Trip Budget</span>
            <strong>{formattedBudget}</strong>
          </div>
        </div>
      )}
      {itinerary.map((day) => (
        <div className="itinerary-day" key={day.day}>
          <div className="itinerary-day-heading"><span>Day {day.day}</span><strong>{day.title}</strong></div>
          <div className="itinerary-timeline">
            {day.stops.map((stop, stopIndex) => {
              const isBiz = registeredBizNames.has(stop.title.toLowerCase().trim()) || stop.note.includes("registered Hilinga small business");
              const priceMatch = stop.note.match(/₱[\d,]+(?:–₱[\d,]+|\+)?(?:\s*per\s*person)?/i);
              return (
                <div className="itinerary-stop" key={`${day.day}-${stopIndex}-${stop.title}`}>
                  <div className="itinerary-stop-icon"><Icon name={stop.icon} size={17} color="var(--c-green)" /></div>
                  <div className="itinerary-stop-copy">
                    {stop.time && <span>{stop.time}</span>}
                    {isBiz && (
                      <span className="itinerary-business-badge">
                        <Icon name="verified" size={13} color="var(--c-green)" filled /> Registered Local Business
                      </span>
                    )}
                    <strong>{stop.title}</strong>
                    {!compact && <p>{stop.note}</p>}
                    {priceMatch && (
                      <span className="stop-price-tag">
                        <Icon name="sell" size={13} color="var(--c-green)" /> Estimated: {priceMatch[0]}
                      </span>
                    )}
                    {(onReplaceStop || onExclude) && (
                      <div className="itinerary-actions-row">
                        {onReplaceStop && (
                          <button type="button" className="itinerary-replace-btn" onClick={() => onReplaceStop(day.day, stopIndex, stop.title)}>
                            <Icon name="swap_horiz" size={15} /> Replace place
                          </button>
                        )}
                        {onExclude && (
                          <button type="button" className="itinerary-exclude" onClick={() => onExclude(stop.title)}>
                            <Icon name="remove_circle" size={15} /> Remove
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {!compact && <p className="itinerary-note"><Icon name="info" size={16} /> Suggested times are flexible. Check weather, opening hours, and local transport before leaving.</p>}
    </div>
  );
}

function ReplacePlaceModal({
  visible,
  target,
  onClose,
  onSelectReplacement,
}: {
  visible: boolean;
  target: { day: number; stopIndex: number; currentTitle: string } | null;
  onClose: () => void;
  onSelectReplacement: (newTitle: string) => void;
}) {
  const [customInput, setCustomInput] = useState("");
  const registeredBusinesses = useMemo(() => readRegisteredSmallBusinesses(), [visible]);
  const defaultSuggestions = useMemo(() => [
    { title: "Cagsawa Ruins", category: "Historic Site", location: "Daraga, Albay", icon: "account_balance" },
    { title: "Mayon ATV Adventure", category: "Adventure", location: "Mayon Foothills", icon: "sports_motorsports" },
    { title: "Sumlang Lake", category: "Nature & Views", location: "Camalig, Albay", icon: "water_drop" },
    { title: "Mayon Skyline", category: "Nature & Views", location: "Tabaco City, Albay", icon: "landscape" },
    { title: "Daraga faith and heritage trail", category: "Culture & History", location: "Daraga, Albay", icon: "church" },
    { title: "Sunset at Legazpi Boulevard", category: "Dining & Sunset", location: "Legazpi City", icon: "beach_access" },
    { title: "Quitinday Hills", category: "Hiking & Gems", location: "Camalig, Albay", icon: "explore" },
    { title: "Vera Falls", category: "Nature & Waterfalls", location: "Malinao, Albay", icon: "water_drop" },
  ], []);

  if (!visible || !target) return null;

  return (
    <AppModal visible={visible} title={`Replace "${target.currentTitle}"`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ color: "var(--c-body)", fontSize: 13 }}>Choose a registered local business or popular Albay spot to replace <strong>"{target.currentTitle}"</strong> in your plan:</p>

        {registeredBusinesses.length > 0 && (
          <div>
            <span className="eyebrow" style={{ marginBottom: 6, display: "block" }}>Registered Small Businesses</span>
            <div className="replace-option-grid">
              {registeredBusinesses.map((biz) => (
                <button
                  key={biz.name}
                  type="button"
                  className="replace-option-card"
                  onClick={() => { onSelectReplacement(biz.name); onClose(); }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 12, background: "var(--c-pale)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name="storefront" size={20} color="var(--c-green)" />
                  </div>
                  <div className="replace-option-info">
                    <strong>{biz.name} <small style={{ color: "var(--c-green)", fontWeight: 800 }}>• Registered</small></strong>
                    <span>{biz.category} in {biz.location}</span>
                  </div>
                  <Icon name="chevron_right" size={18} color="var(--c-muted)" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <span className="eyebrow" style={{ marginBottom: 6, display: "block", marginTop: 8 }}>Albay Popular Destinations</span>
          <div className="replace-option-grid">
            {defaultSuggestions.filter((item) => item.title.toLowerCase() !== target.currentTitle.toLowerCase()).map((item) => (
              <button
                key={item.title}
                type="button"
                className="replace-option-card"
                onClick={() => { onSelectReplacement(item.title); onClose(); }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 12, background: "var(--c-pale)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name={item.icon} size={20} color="var(--c-green)" />
                </div>
                <div className="replace-option-info">
                  <strong>{item.title}</strong>
                  <span>{item.category} • {item.location}</span>
                </div>
                <Icon name="chevron_right" size={18} color="var(--c-muted)" />
              </button>
            ))}
          </div>
        </div>

        <form
          className="replace-custom-box"
          onSubmit={(e) => {
            e.preventDefault();
            if (customInput.trim()) {
              onSelectReplacement(customInput.trim());
              setCustomInput("");
              onClose();
            }
          }}
        >
          <span className="eyebrow">Or type any custom place name</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="e.g. Jovellar Underground River"
              style={{ flex: 1, height: 42, border: "1px solid var(--c-line)", borderRadius: 13, padding: "0 12px" }}
            />
            <button
              type="submit"
              disabled={!customInput.trim()}
              style={{ padding: "0 16px", borderRadius: 13, background: "var(--c-green)", color: "white", fontWeight: 800, border: 0 }}
            >
              Replace
            </button>
          </div>
        </form>
      </div>
    </AppModal>
  );
}

function Planner({ onOpenMap }: { onOpenMap: (planId: string) => void }) {
  const db = useDatabase();
  const { user } = useAuth();
  const [plans, setPlans] = useState<TripPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("");
  const [budget, setBudget] = useState("");
  const [transportation, setTransportation] = useState("");
  const [interests, setInterests] = useState("");
  const [walking, setWalking] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TripPlan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatStep, setChatStep] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [travelStartDate, setTravelStartDate] = useState("");
  const [travelEndDate, setTravelEndDate] = useState("");
  const [answers, setAnswers] = useState<PlannerAnswers>(createDefaultPlannerAnswers);
  const [messages, setMessages] = useState<PlannerMessage[]>([]);
  const [generated, setGenerated] = useState<ItineraryDay[] | null>(null);
  const [generatingItinerary, setGeneratingItinerary] = useState(false);
  const [chatReplaceTarget, setChatReplaceTarget] = useState<{ day: number; stopIndex: number; currentTitle: string } | null>(null);
  const [registeredBusinesses, setRegisteredBusinesses] = useState<RegisteredSmallBusiness[]>(() => readRegisteredSmallBusinesses());
  const [savingGenerated, setSavingGenerated] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [showAiChat, setShowAiChat] = useState(false);
  const load = useCallback(async () => { setLoading(true); setLoadError(null); try { if (user) setPlans(await getTripPlans(db, user.uid)); } catch { setLoadError("Trip plans could not be loaded."); } finally { setLoading(false); } }, [db, user]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (chatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatStep, messages.length, chatOpen]);
  useEffect(() => {
    const refreshBusinesses = () => setRegisteredBusinesses(readRegisteredSmallBusinesses());
    window.addEventListener(BUSINESS_CONTENT_CHANGED_EVENT, refreshBusinesses);
    window.addEventListener("storage", refreshBusinesses);
    return () => {
      window.removeEventListener(BUSINESS_CONTENT_CHANGED_EVENT, refreshBusinesses);
      window.removeEventListener("storage", refreshBusinesses);
    };
  }, []);

  function resetForm() { setTitle(""); setDuration(""); setBudget(""); setTransportation(""); setInterests(""); setWalking(""); setErrors({}); }
  async function create() {
    if (submitting) return;
    const next: Record<string, string> = {};
    const hours = Number(duration);
    const budgetValue = budget.trim() ? Number(budget) : null;
    if (!title.trim()) next.title = "Enter a name for this trip.";
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) next.duration = "Enter a whole number from 1 to 168.";
    if (budgetValue !== null && (!Number.isFinite(budgetValue) || budgetValue < 0)) next.budget = "Enter a valid non-negative budget.";
    if (!transportation.trim()) next.transportation = "Describe how you plan to get around.";
    if (!walking.trim()) next.walking = "Describe your walking needs.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    try {
      if (!user) throw new Error("Your session has expired.");
      await createTripPlan(db, user.uid, title, { durationHours: hours, budget: budgetValue, transportation: transportation.trim(), interests: interests.split(",").map((v) => v.trim()).filter(Boolean), walkingAbility: walking.trim() });
      resetForm(); setFormOpen(false); setSuccess("Trip plan created."); await load();
    } catch { setErrors({ form: "The trip plan could not be saved. Please try again." }); } finally { setSubmitting(false); }
  }
  async function removePlan() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try { if (!user) throw new Error("Your session has expired."); await deleteTripPlan(db, user.uid, deleteTarget.id); setDeleteTarget(null); setSuccess("Trip plan deleted."); await load(); }
    catch { setLoadError("The trip plan could not be deleted."); }
    finally { setDeleting(false); }
  }

  function openChat() {
    const freshAnswers = createDefaultPlannerAnswers();
    setChatStep(0);
    setChatInput("");
    setTravelStartDate("");
    setTravelEndDate("");
    setAnswers(freshAnswers);
    setGenerated(null);
    setGeneratingItinerary(false);
    setMessages([{ id: Date.now(), role: "guide", text: `Hi! I’m your Hilinga guide. I’ll adapt each question to your answers. ${plannerQuestionPrompt(0, freshAnswers)}` }]);
    setChatOpen(true);
  }

  function advancePlanner(question: PlannerQuestion, nextAnswers: PlannerAnswers, label: string) {
    setAnswers(nextAnswers);
    setChatInput("");
    const userMessage: PlannerMessage = { id: Date.now(), role: "user", text: label };
    const nextStep = nextPlannerStep(chatStep, nextAnswers);
    const acknowledgement = plannerAcknowledgement(question.key, nextAnswers);
    if (nextStep >= plannerQuestions.length) {
      setMessages((current) => [...current, userMessage, { id: Date.now() + 1, role: "guide", text: `${acknowledgement} I have enough to build your itinerary. Review the summary, then generate it when you are ready.` }]);
      setChatStep(plannerQuestions.length);
      return;
    }
    setChatStep(nextStep);
    setMessages((current) => [...current, userMessage, { id: Date.now() + 1, role: "guide", text: `${acknowledgement} ${plannerQuestionPrompt(nextStep, nextAnswers)}` }]);
  }

  function answerQuestion(value: string, label = value, dependentAnswers: Partial<PlannerAnswers> = {}) {
    const question = plannerQuestions[chatStep];
    if (!question) return;
    const trimmedValue = value.trim();
    if (!question.optional && !trimmedValue) return;
    if (question.key === "destination" && !isSupportedPlannerDestination(trimmedValue)) {
      setMessages((current) => [...current,
        { id: Date.now(), role: "user", text: label },
        { id: Date.now() + 1, role: "guide", text: "Hilinga currently builds dependable routes only within Albay. Please enter Albay or an Albay city or attraction, such as Legazpi, Daraga, Tabaco, or Mayon." },
      ]);
      setChatInput("");
      return;
    }
    const nextAnswers = { ...answers, ...dependentAnswers, [question.key]: trimmedValue };
    advancePlanner(question, nextAnswers, label);
  }

  function answerTravelDates() {
    if (!travelStartDate || !travelEndDate || travelEndDate < travelStartDate) return;
    if (travelDayCount(travelStartDate, travelEndDate) > MAX_PLANNER_DAYS) return;
    const dates = formatTravelDateRange(travelStartDate, travelEndDate);
    answerQuestion(dates, dates, { days: String(travelDayCount(travelStartDate, travelEndDate)) });
  }

  function previousQuestion() {
    if (chatStep <= 0) return;
    const previousStep = previousPlannerStep(chatStep, answers);
    setChatStep(previousStep);
    setGenerated(null);
    const previousQuestion = plannerQuestions[previousStep];
    const previousValue = answers[previousQuestion.key];
    setChatInput(previousQuestion.kind === "text" && typeof previousValue === "string" ? previousValue : "");
    setMessages((current) => [...current, { id: Date.now(), role: "guide", text: `No problem—let’s change that. ${plannerQuestionPrompt(previousStep, answers)}` }]);
  }

  function toggleMultiAnswer(value: string) {
    const question = plannerQuestions[chatStep];
    if (!question || question.kind !== "multi") return;
    const selected = (answers[question.key] as string[] | undefined) ?? [];
    const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
    const nextAnswers = { ...answers, [question.key]: next };
    if (question.key === "interests") nextAnswers.priorityInterests = (answers.priorityInterests ?? []).filter((interest) => next.includes(interest));
    setAnswers(nextAnswers);
  }

  function finishMultiQuestion() {
    const question = plannerQuestions[chatStep];
    if (!question || question.kind !== "multi") return;
    const selected = (answers[question.key] as string[] | undefined) ?? [];
    if (!question.optional && selected.length === 0) return;
    const label = selected.length ? selected.join(", ")
      : question.key === "priorityInterests" ? "All interests are equally important"
        : question.key === "excludedPlaces" ? "No places to exclude" : "Exclude optional sections";
    const nextAnswers = {
      ...answers,
      [question.key]: selected,
      ...(question.key === "interests" && selected.length === 1 ? { priorityInterests: [...selected] } : {}),
    };
    advancePlanner(question, nextAnswers, label);
  }

  function addCustomMultiAnswer() {
    const question = plannerQuestions[chatStep];
    const value = chatInput.trim();
    if (!question || question.kind !== "multi" || !value) return;
    const selected = (answers[question.key] as string[] | undefined) ?? [];
    const rawAdditions = value.split(/[,;\n]+|\s+and\s+/i).map((item) => item.trim()).filter(Boolean);
    const interestAliases: Array<[RegExp, string]> = [
      [/beach|island|swim/, "Beaches and islands"], [/nature|hike|hiking|trail/, "Nature and hiking"],
      [/adventure|atv|extreme/, "Adventure activities"], [/food|cuisine|restaurant|eat/, "Food and local cuisine"],
      [/culture|history|heritage/, "Culture and history"], [/art|museum/, "Arts and museums"],
      [/shop|market|souvenir/, "Shopping"], [/nightlife|bar|club/, "Nightlife"], [/photo|photography/, "Photography"],
      [/wellness|relax|spa/, "Wellness and relaxation"], [/family|kid|child/, "Family-friendly activities"],
      [/romantic|couple|honeymoon/, "Romantic experiences"], [/religious|spiritual|church/, "Religious or spiritual sites"],
      [/festival|event/, "Festivals and events"], [/hidden|gem|local secret/, "Hidden gems"],
    ];
    const additions = question.key === "interests"
      ? rawAdditions.map((item) => interestAliases.find(([pattern]) => pattern.test(item.toLocaleLowerCase()))?.[1] ?? item)
      : question.key === "priorityInterests"
        ? rawAdditions.map((item) => (answers.interests ?? []).find((interest) => {
          const requested = normalizePlaceName(item);
          const available = normalizePlaceName(interest);
          return available.includes(requested) || requested.includes(available);
        }) ?? item)
        : rawAdditions;
    const next = [...selected, ...additions.filter((item) => !selected.some((current) => normalizePlaceName(current) === normalizePlaceName(item)))];
    setAnswers({ ...answers, [question.key]: next });
    setChatInput("");
  }

  function submitChatInput() {
    const question = plannerQuestions[chatStep];
    const value = chatInput.trim();
    if (!question || (question.kind !== "text" && question.kind !== "multi")) return;
    if (!value) {
      if (question.kind === "multi") {
        const selected = (answers[question.key] as string[] | undefined) ?? [];
        if (question.optional || selected.length > 0) {
          finishMultiQuestion();
          return;
        }
      }
      chatInputRef.current?.focus();
      return;
    }
    if (question.kind === "multi") addCustomMultiAnswer();
    else answerQuestion(value);
  }

  function editPreferences() {
    setGenerated(null);
    setChatStep(0);
    setChatInput(answers.destination ?? "");
    setMessages([{ id: Date.now(), role: "guide", text: `Let’s update your preferences. I’ll keep your existing answers until you replace them. ${plannerQuestionPrompt(0, answers)}` }]);
  }

  async function saveGeneratedPlan() {
    if (!generated || savingGenerated) return;
    setSavingGenerated(true);
    const dayCount = generated.length;
    const budgetMap: Record<string, number> = { Budget: 1500, Moderate: 3000, Premium: 5000 };
    const customBudget = Number.parseFloat((answers.budget ?? "").replace(/[^0-9.]/g, ""));
    const destination = answers.destination ?? "Albay";
    try {
      if (!user) throw new Error("Your session has expired.");
      const planId = await createTripPlan(db, user.uid, `${dayCount}-day ${destination} escape`, {
        durationHours: dayCount * 10,
        budget: Number.isFinite(customBudget) ? customBudget : (budgetMap[answers.budget ?? ""] ?? 3000) * dayCount,
        transportation: "Customized local transport",
        interests: answers.interests?.length ? answers.interests : ["Local highlights"],
        walkingAbility: answers.pace === "Relaxed" ? "Short, easy walks" : answers.pace === "Packed" ? "Comfortable with a full day" : "Moderate walking",
      }, generated);
      setChatOpen(false);
      setSuccess("Your itinerary is ready and saved.");
      await load();
      onOpenMap(planId);
    } catch {
      setMessages((current) => [...current, { id: Date.now(), role: "guide", text: "I couldn’t save that plan just now. Please try once more." }]);
    } finally { setSavingGenerated(false); }
  }

  async function generateItinerary() {
    if (generatingItinerary) return;
    setGeneratingItinerary(true);
    setMessages((current) => [...current, { id: Date.now(), role: "user", text: "Generate my itinerary" }, { id: Date.now() + 1, role: "guide", text: "I’m turning your answers into a personalized Albay itinerary now…" }]);
    try {
      const itinerary = await generateAiItinerary({
        answers,
        localBusinesses: registeredBusinesses.map(({ name, category, location, hours, about }) => ({ name, category, location, hours, about })),
      });
      setGenerated(itinerary);
      setMessages((current) => [...current, { id: Date.now() + 2, role: "guide", text: "Your AI-personalized itinerary is ready. You can remove a stop, change your preferences, or regenerate it." }]);
    } catch {
      setGenerated(buildItinerary(answers, registeredBusinesses));
      setMessages((current) => [...current, { id: Date.now() + 2, role: "guide", text: "I created your itinerary with Hilinga’s built-in local planner because the AI service is not available right now. You can still edit and save it normally." }]);
    } finally {
      setGeneratingItinerary(false);
    }
  }

  async function saveChatItinerary(itinerary: ItineraryDay[], promptText: string) {
    if (savingGenerated) return;
    setSavingGenerated(true);
    const dayCount = itinerary.length;
    try {
      if (!user) throw new Error("Your session has expired.");
      const title = promptText.trim() ? promptText.trim().slice(0, 48) : `${dayCount}-day Albay adventure`;
      const planId = await createTripPlan(db, user.uid, title, {
        durationHours: dayCount * 10,
        budget: 3000 * dayCount,
        transportation: "AI chat \u2022 Customized local transport",
        interests: ["AI chat"],
        walkingAbility: "Moderate walking",
      }, itinerary);
      setSuccess("Your chat itinerary is saved.");
      await load();
      onOpenMap(planId);
    } catch {
      setMessages((c) => [...c, { id: Date.now(), role: "guide", text: "I couldn\u2019t save that chat itinerary. Please try again." }]);
    } finally { setSavingGenerated(false); }
  }

  function excludeGeneratedPlace(title: string) {
    const excludedPlaces = [...(answers.excludedPlaces ?? []), title];
    const nextAnswers = { ...answers, excludedPlaces };
    setAnswers(nextAnswers);
    setGenerated(buildItinerary(nextAnswers, registeredBusinesses));
    setMessages((current) => [...current, { id: Date.now(), role: "user", text: `Remove ${title}` }, { id: Date.now() + 1, role: "guide", text: `Done. I removed ${title} and rebuilt the plan without it.` }]);
  }

  function replaceGeneratedPlace(day: number, stopIndex: number, newTitle: string) {
    if (!generated) return;
    const updated = generated.map((dayPlan) => {
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
    setGenerated(updated);
    setMessages((current) => [
      ...current,
      { id: Date.now(), role: "user", text: `Replace stop ${stopIndex + 1} with ${newTitle}` },
      { id: Date.now() + 1, role: "guide", text: `I updated Day ${day}, Stop ${stopIndex + 1} to "${newTitle}".` },
    ]);
  }

  const currentQuestion = plannerQuestions[chatStep];
  const currentOptions: PlannerOption[] = currentQuestion?.key === "priorityInterests"
    ? (answers.interests ?? []).map((value) => ({ label: value, value, icon: "priority_high" }))
    : currentQuestion?.key === "excludedPlaces"
      ? (answers.excludedPlaces ?? []).map((value) => ({ label: value, value, icon: "remove_circle" }))
      : currentQuestion?.options ?? [];
  const currentMultiValues = currentQuestion?.kind === "multi" ? ((answers[currentQuestion.key] as string[] | undefined) ?? []) : [];

  return (
    <div className="screen planner-screen">
      <ScreenHeader title="Plan your trip" subtitle="A local guide for memorable days around Albay." />
      <Card className="planner-hero">
        <div className="planner-hero-glow" />
        <div className="planner-guide-mark"><Icon name="auto_awesome" size={25} color="white" filled /></div>
        <div className="planner-hero-copy">
          <span className="planner-kicker">Hilinga itinerary assistant</span>
          <h2>Tell me your travel style.<br />I’ll map out the days.</h2>
          <p>Choose your preferences, exclude any places you do not want, and discover registered local small businesses along the way.</p>
        </div>
        <button className="planner-start-btn" onClick={openChat}>
          <span>Start planning</span><Icon name="arrow_forward" size={20} color="var(--c-green-dark)" />
        </button>
        <button className="planner-manual-btn" onClick={() => { resetForm(); setFormOpen(true); }}>Or create a basic plan manually</button>
      </Card>
      <div className="planner-trust-row" aria-label="Planner features">
        <span><Icon name="schedule" size={17} color="var(--c-green)" /> Under 1 minute</span>
        <span><Icon name="tune" size={17} color="var(--c-green)" /> Personalized</span>
        <span><Icon name="save" size={17} color="var(--c-green)" /> Saved on device</span>
      </div>
      {success && (
        <Card className="success-banner">
          <span style={{ color: "var(--c-green)", fontWeight: 700 }} role="alert">{success}</span>
          <button onClick={() => setSuccess(null)} style={{ color: "var(--c-green)", cursor: "pointer", background: "none", border: "none" }}>Dismiss</button>
        </Card>
      )}
      <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 36, height: 36, borderRadius: 12, background: "var(--c-green)", display: "flex", alignItems: "center", justifyContent: "center" }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: "white" }}>auto_awesome</span></span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <strong style={{ fontSize: 13 }}>Chat with Hilinga AI</strong>
              <span style={{ fontSize: 11, color: "var(--c-muted)" }}>DB-grounded \u2022 keeps history \u2022 refine in thread</span>
            </div>
          </div>
          <button onClick={() => setShowAiChat((v) => !v)} style={{ padding: "8px 12px", borderRadius: 999, background: showAiChat ? "var(--c-green)" : "white", color: showAiChat ? "white" : "var(--c-ink)", border: "1px solid var(--c-line)", fontWeight: 800, fontSize: 12 }}>{showAiChat ? "Hide chat" : "Open chat"}</button>
        </div>
        {showAiChat ? (
          <ItineraryChatPanel
            selectedDays={Number(answers.days) || 2}
            selectedPace={(answers.pace as any) || "Balanced"}
            selectedBudget={(["Budget","Moderate","Premium"].includes(answers.budget ?? "") ? (answers.budget as any) : "Moderate")}
            onSaveItinerary={saveChatItinerary}
            saving={savingGenerated}
          />
        ) : (
          <p style={{ fontSize: 12, lineHeight: "18px", color: "var(--c-body)", margin: 0 }}>Describe your trip in natural language — the AI will use <strong>only</strong> places from the Explore catalog + registered small businesses. Try: “3-day ATV + spicy food near Legazpi, moderate budget, packed pace”.</p>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Tooltip content="Use local planner without AI"><button onClick={() => { setShowAiChat(false); openChat(); }} style={{ padding: "6px 10px", borderRadius: 999, background: "var(--c-chip)", fontSize: 11, fontWeight: 800 }}>Guided planner</button></Tooltip>
          <span style={{ fontSize: 11, color: "var(--c-muted)", alignSelf: "center" }}>or keep your current questionnaire flow</span>
        </div>
        {!showAiChat && generatingItinerary && <div className="prompt-status-banner"><span className="prompt-status-spinner" /><span>Generating itinerary…</span></div>}
      </div>

      <div className="planner-section-heading">
        <div><span className="eyebrow">Your collection</span><h2 className="section-title">Saved trips</h2></div>
        {plans.length > 0 && <button className="planner-new-link" onClick={openChat}><Icon name="add" size={18} /> New trip</button>}
      </div>
      {loading ? (
        <SkeletonPlanner />
      ) : loadError ? (
        <EmptyState icon="warning" title="Plans unavailable" message={loadError} action="Try again" onAction={load} />
      ) : plans.length === 0 ? (
        <Card className="planner-empty">
          <div className="planner-empty-icon"><Icon name="luggage" size={27} color="var(--c-green)" /></div>
          <div><strong>Your next adventure starts here</strong><p>Plans you create with Hilinga will be kept here for easy access.</p></div>
        </Card>
      ) : (
        <div className="planner-plan-list">
          {plans.map((plan) => (
            <Card key={plan.id} className="planner-plan-card">
              <div className="title-row">
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="planner-plan-title">{plan.title}</span>
                  <div className="plan-meta-row">
                    <span className="plan-tag-chip"><Icon name="schedule" size={14} /> {plan.preferences.durationHours} hours</span>
                    <span className="plan-budget-chip">
                      <Icon name="payments" size={15} color="var(--c-green)" />
                      <strong>{plan.preferences.budget !== null ? `₱${plan.preferences.budget.toLocaleString()} Total Budget` : "Moderate Budget"}</strong>
                    </span>
                  </div>
                </div>
                <Tooltip content={`Delete ${plan.title}`}><button aria-label={`Delete ${plan.title}`} onClick={() => setDeleteTarget(plan)} style={{ padding: 8, background: "none", border: "none", cursor: "pointer" }}>
                  <Icon name="delete" size={21} color="var(--c-red)" />
                </button></Tooltip>
              </div>
              <div className="planner-plan-meta">
                <span><Icon name="directions_car" size={16} />{plan.preferences.transportation}</span>
                <span><Icon name="interests" size={16} />{plan.preferences.interests.join(", ") || "Local highlights"}</span>
              </div>
              {plan.itinerary && plan.itinerary.length > 0 && (
                <>
                  <button className="planner-map-btn" onClick={() => onOpenMap(plan.id)}><Icon name="route" size={19} /> Route on smart map</button>
                  <button className="planner-view-btn" onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}>
                    {expandedPlan === plan.id ? "Hide itinerary" : "View itinerary"}<Icon name={expandedPlan === plan.id ? "expand_less" : "expand_more"} size={20} />
                  </button>
                  {expandedPlan === plan.id && <ItineraryPreview itinerary={plan.itinerary} budgetText={plan.preferences.budget} compact />}
                </>
              )}
            </Card>
          ))}
        </div>
      )}
      <AppModal visible={chatOpen} title="Plan with Hilinga" onClose={() => !savingGenerated && setChatOpen(false)}>
        <div className="planner-progress" aria-label={`Question ${Math.min(chatStep + 1, plannerQuestions.length)} of ${plannerQuestions.length}`}>
          <div style={{ width: `${Math.min(((chatStep + 1) / plannerQuestions.length) * 100, 100)}%` }} />
        </div>
        <div className="planner-chat" aria-live="polite">
          {messages.map((message) => (
            <div key={message.id} className={`planner-message-row ${message.role === "user" ? "planner-message-user" : ""}`}>
              {message.role === "guide" && <div className="planner-chat-avatar"><Icon name="auto_awesome" size={16} color="white" filled /></div>}
              <div className={`planner-bubble ${message.role === "user" ? "planner-bubble-user" : ""}`}>{message.text}</div>
            </div>
          ))}
        </div>
        {generated ? (
          <div className="planner-result">
            <div className="planner-result-heading"><div><span className="eyebrow">Made for you</span><h3>Your {generated.length}-day {answers.destination ?? "Albay"} itinerary</h3></div><Icon name="verified" size={25} color="var(--c-green)" filled /></div>
            <ItineraryPreview
              itinerary={generated}
              budgetText={answers.budget}
              onExclude={excludeGeneratedPlace}
              onReplaceStop={(day, stopIndex, currentTitle) => setChatReplaceTarget({ day, stopIndex, currentTitle })}
            />
            <Button label="Save & view route on map" onPress={saveGeneratedPlan} loading={savingGenerated} />
            <button className="planner-restart" onClick={editPreferences} disabled={savingGenerated}>Change preferences</button>
            <button className="planner-restart" onClick={openChat} disabled={savingGenerated}>Start over</button>
          </div>
        ) : chatStep >= plannerQuestions.length ? (
          <div className="planner-confirmation">
            <div className="planner-summary-heading"><span className="eyebrow">Personalization summary</span><h3>Ready for your review</h3></div>
            <dl className="planner-summary">
              <div><dt>Destination</dt><dd>{answers.destination ?? "Albay"}</dd></div>
              <div><dt>Travel dates</dt><dd>{answers.dates ?? "Not specified"}</dd></div>
              <div><dt>Number of travelers</dt><dd>{answers.travelers ?? "Not specified"}</dd></div>
              <div><dt>Selected interests</dt><dd>{answers.interests?.join(", ") || "Local highlights"}</dd></div>
              <div><dt>Priority interests</dt><dd>{answers.priorityInterests?.join(", ") || "All selected equally"}</dd></div>
              <div><dt>Travel pace</dt><dd>{answers.pace ?? "Balanced"}</dd></div>
              <div className="planner-summary-budget-row">
                <dt><Icon name="payments" size={18} color="var(--c-green)" /> Budget & Currency</dt>
                <dd className="planner-summary-budget-badge">
                  {answers.budget && ["Budget", "Moderate", "Premium"].includes(answers.budget) ? `${answers.budget} (PHP)` : answers.budget ?? "Moderate (PHP)"}
                </dd>
              </div>
              <div><dt>Detail level</dt><dd>{answers.detail ?? "Standard itinerary"}</dd></div>
              <div><dt>Schedule style</dt><dd>{answers.schedule ?? "Flexible time periods"}</dd></div>
              <div><dt>Included sections</dt><dd>{answers.sections?.join(", ") || "None"}</dd></div>
              <div><dt>Places to exclude</dt><dd>{answers.excludedPlaces?.join(", ") || "None"}</dd></div>
              <div><dt>Local businesses</dt><dd>{registeredBusinesses.length ? `${registeredBusinesses.length} registered small business${registeredBusinesses.length === 1 ? "" : "es"} considered` : "No registered small businesses found"}</dd></div>
              <div><dt>Special requirements</dt><dd>{answers.requirements || "None provided"}</dd></div>
            </dl>
            <Button label={generatingItinerary ? "Creating your itinerary…" : "Generate with AI"} onPress={() => void generateItinerary()} loading={generatingItinerary} disabled={generatingItinerary} />
            <button className="planner-restart" onClick={editPreferences} disabled={generatingItinerary}>Change preferences</button>
          </div>
        ) : (
          <>
            {currentQuestion?.key === "interests" && (
              <div className="planner-option-heading">
                <span>Choose one or more</span>
                <small>{currentMultiValues.length ? `${currentMultiValues.length} selected` : "Tap every option that fits"}</small>
              </div>
            )}
            <div className={`planner-replies ${currentQuestion?.kind === "multi" ? "planner-replies-multi" : ""} ${currentQuestion?.key === "interests" ? "planner-replies-interests" : ""}`}>
              {currentOptions.map((option) => {
                const selected = currentQuestion?.kind === "multi"
                  ? currentMultiValues.includes(option.value)
                  : answers[currentQuestion.key] === option.value;
                return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  className={selected ? "planner-reply-selected" : ""}
                  onClick={() => currentQuestion?.kind === "multi" ? toggleMultiAnswer(option.value) : answerQuestion(option.value, option.label)}
                >
                  <Icon name={selected ? "check_circle" : option.icon} size={20} color="var(--c-green)" />
                  <span>{option.label}{option.description && <small>{option.description}</small>}</span>
                  {currentQuestion?.kind !== "multi" && <Icon name="chevron_right" size={18} color="var(--c-muted)" />}
                </button>
                );
              })}
              {currentQuestion?.kind === "multi" && (
                <button type="button" className="planner-multi-done" onClick={finishMultiQuestion} disabled={!currentQuestion.optional && currentMultiValues.length === 0}>
                  <Icon name="done_all" size={20} color="white" /><span>{currentMultiValues.length ? `Continue with ${currentMultiValues.length} selected` : "Continue without these"}</span>
                </button>
              )}
            </div>
            {currentQuestion?.kind === "date-range" && (
              <form className="planner-calendar" onSubmit={(event) => { event.preventDefault(); answerTravelDates(); }}>
                <div className="planner-calendar-heading">
                  <Icon name="calendar_month" size={22} color="var(--c-green)" />
                  <div><strong>Choose your trip dates</strong><span>Your dates set the itinerary length, up to {MAX_PLANNER_DAYS} days.</span></div>
                </div>
                <div className="planner-calendar-fields">
                  <label>
                    <span>Start date</span>
                    <input
                      type="date"
                      value={travelStartDate}
                      min={calendarDateValue()}
                      onChange={(event) => {
                        const value = event.target.value;
                        setTravelStartDate(value);
                        if (travelEndDate && (travelEndDate < value || travelEndDate > offsetCalendarDate(value, MAX_PLANNER_DAYS - 1))) setTravelEndDate("");
                      }}
                      required
                    />
                  </label>
                  <label>
                    <span>End date</span>
                    <input
                      type="date"
                      value={travelEndDate}
                      min={travelStartDate || calendarDateValue()}
                      max={travelStartDate ? offsetCalendarDate(travelStartDate, MAX_PLANNER_DAYS - 1) : undefined}
                      disabled={!travelStartDate}
                      onChange={(event) => setTravelEndDate(event.target.value)}
                      required
                    />
                  </label>
                </div>
                <button type="submit" disabled={!travelStartDate || !travelEndDate || travelEndDate < travelStartDate || travelDayCount(travelStartDate, travelEndDate) > MAX_PLANNER_DAYS}>
                  Continue <Icon name="arrow_forward" size={19} color="white" />
                </button>
              </form>
            )}
            {(currentQuestion?.kind === "text" || currentQuestion?.kind === "multi") && (
              <form className="planner-chat-input" onSubmit={(event) => { event.preventDefault(); submitChatInput(); }}>
                <input ref={chatInputRef} value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder={currentQuestion.placeholder ?? (currentQuestion.kind === "multi" ? "Add another interest or preference" : "Type your answer…")} aria-label="Type your answer" />
                <button type="submit" aria-label={currentQuestion.kind === "multi" ? "Add typed preference" : "Send answer"}><Icon name={currentQuestion.kind === "multi" ? "add" : "arrow_upward"} size={20} color="white" /></button>
              </form>
            )}
            {currentQuestion?.kind === "text" && currentQuestion.optional && (
              <button className="planner-skip" onClick={() => answerQuestion("", "No special requirements")}>Skip this question</button>
            )}
            {chatStep > 0 && <button className="planner-back" type="button" onClick={previousQuestion}><Icon name="arrow_back" size={16} /> Back to previous question</button>}
            <div ref={chatEndRef} />
          </>
        )}
        <ReplacePlaceModal
          visible={chatReplaceTarget !== null}
          target={chatReplaceTarget}
          onClose={() => setChatReplaceTarget(null)}
          onSelectReplacement={(newTitle) => {
            if (chatReplaceTarget) replaceGeneratedPlace(chatReplaceTarget.day, chatReplaceTarget.stopIndex, newTitle);
          }}
        />
      </AppModal>
      <AppModal visible={formOpen} title="New trip plan" onClose={() => !submitting && setFormOpen(false)}>
        <Field label="Trip name" value={title} onChangeText={setTitle} placeholder="e.g. Weekend in Legazpi" error={errors.title} />
        <Field label="Time available (hours)" value={duration} onChangeText={setDuration} placeholder="Enter 1–168" keyboardType="number-pad" error={errors.duration} />
        <Field label="Budget in PHP (optional)" value={budget} onChangeText={setBudget} placeholder="Enter an amount" keyboardType="number-pad" error={errors.budget} />
        <Field label="Transportation" value={transportation} onChangeText={setTransportation} placeholder="e.g. Public transport" error={errors.transportation} />
        <Field label="Interests (optional)" value={interests} onChangeText={setInterests} placeholder="Comma-separated interests" />
        <Field label="Walking needs" value={walking} onChangeText={setWalking} placeholder="e.g. Short, accessible routes" error={errors.walking} />
        {errors.form && <p className="error-text" role="alert">{errors.form}</p>}
        <Button label="Save trip plan" onPress={create} loading={submitting} />
      </AppModal>
      <ConfirmModal visible={deleteTarget !== null} title="Delete trip plan?" message={deleteTarget ? `"${deleteTarget.title}" will be permanently deleted.` : ""} confirmLabel="Delete trip plan" loading={deleting} onCancel={() => !deleting && setDeleteTarget(null)} onConfirm={removePlan} />
    </div>
  );
}

function Saved({ goExplore, onBack }: { goExplore: () => void; onBack?: () => void }) {
  const db = useDatabase();
  const { user } = useAuth();
  const [kind, setKind] = useState<SavedKind>("Places");
  const [items, setItems] = useState<SavedItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<SavedItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { if (user) setItems(await getSavedItems(db, user.uid, kind)); } catch { setError("Your saved items could not be loaded."); } finally { setLoading(false); } }, [db, kind, user]);
  useEffect(() => { load(); }, [load]);
  const shown = items.filter((item) => `${item.title} ${item.subtitle}`.toLowerCase().includes(query.trim().toLowerCase()));

  async function remove() {
    if (pendingId || !removeTarget) return;
    setPendingId(removeTarget.id);
    try { if (!user) throw new Error("Your session has expired."); await removeSavedItem(db, user.uid, removeTarget.id); setRemoveTarget(null); await load(); }
    catch { setError("That item could not be removed. Please try again."); }
    finally { setPendingId(null); }
  }

  return (
    <div className="screen">
      <ScreenHeader title="Saved" subtitle="Your favorite places and travel ideas." action={onBack ? (
        <button className="profile-edit-button" onClick={onBack} aria-label="Back to profile">
          <Icon name="arrow_back" size={18} />
          <span>Profile</span>
        </button>
      ) : undefined} />
      <div className="search-box">
        <Icon name="search" size={20} color="var(--c-muted)" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search saved items" />
        {query && <button onClick={() => setQuery("")} aria-label="Clear saved search"><Icon name="cancel" size={20} color="var(--c-muted)" /></button>}
      </div>
      <div className="chip-scroll">
        {(["Places", "Itineraries", "Businesses", "Events"] as SavedKind[]).map((value) => (
          <button key={value} className={`chip ${kind === value ? "chip-selected" : ""}`} onClick={() => { setKind(value); setQuery(""); }}>{value}</button>
        ))}
      </div>
      {loading ? (
        <SkeletonSaved />
      ) : error ? (
        <EmptyState icon="warning" title="Saved items unavailable" message={error} action="Try again" onAction={load} />
      ) : shown.length === 0 ? (
        <EmptyState icon="favorite_border" title={query ? "No matches" : `No saved ${kind.toLowerCase()} yet`} message={query ? "Try a different search." : "Items you save will appear here."} action={kind === "Places" && !query ? "Explore places" : query ? "Clear search" : undefined} onAction={kind === "Places" && !query ? goExplore : query ? () => setQuery("") : undefined} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {shown.map((item) => (
            <Card key={item.id} className="saved-card">
              {item.imageKey && savedImages[item.imageKey] ? (
                <img src={savedImages[item.imageKey]} alt={item.title} className="saved-image" />
              ) : (
                <div className="placeholder-image"><Icon name="bookmark" size={24} color="var(--c-muted)" /></div>
              )}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 16, fontWeight: 900 }}>{item.title}</span>
                <span style={{ color: "var(--c-body)" }}>{item.subtitle}</span>
              </div>
              <button
                aria-label={`Remove ${item.title}`}
                disabled={pendingId !== null}
                onClick={() => setRemoveTarget(item)}
                style={{ padding: 8, background: "none", border: "none", cursor: "pointer" }}
              >
                {pendingId === item.id ? (
                  <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2, borderTopColor: "var(--c-red)" }} />
                ) : (
                  <Icon name="favorite" size={22} color="var(--c-red)" filled />
                )}
              </button>
            </Card>
          ))}
        </div>
      )}
      <ConfirmModal visible={removeTarget !== null} title="Remove saved item?" message={removeTarget ? `"${removeTarget.title}" will be removed from saved items.` : ""} confirmLabel="Remove saved item" loading={pendingId !== null} onCancel={() => !pendingId && setRemoveTarget(null)} onConfirm={remove} />
    </div>
  );
}

function ProfileScreen({ goPlanner, goExplore, onReset, businessMode }: { goPlanner: () => void; goExplore: () => void; onReset: () => Promise<void>; businessMode: boolean }) {
  const db = useDatabase();
  const { profile: cloudProfile, avatarUrl, user, updateCloudProfile, signOut } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blank: ProfileData = {
    displayName: cloudProfile?.display_name ?? "",
    language: cloudProfile?.language ?? "English",
    budgetMin: cloudProfile?.budget_min ?? null,
    budgetMax: cloudProfile?.budget_max ?? null,
    interests: cloudProfile?.interests ?? [],
    notificationsEnabled: cloudProfile?.notifications_enabled ?? true,
  };
  const [profile, setProfile] = useState<ProfileData>(blank);
  const [draft, setDraft] = useState<ProfileData>(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [interests, setInterests] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [avatarSelection, setAvatarSelection] = useState<AvatarUpload | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setProfile({
      displayName: cloudProfile?.display_name ?? "",
      language: cloudProfile?.language ?? "English",
      budgetMin: cloudProfile?.budget_min ?? null,
      budgetMax: cloudProfile?.budget_max ?? null,
      interests: cloudProfile?.interests ?? [],
      notificationsEnabled: cloudProfile?.notifications_enabled ?? true,
    });
    setLoading(false);
  }, [cloudProfile]);
  useEffect(() => { load(); }, [load]);

  function edit() {
    setDraft(profile);
    setBudgetMin(profile.budgetMin?.toString() ?? "");
    setBudgetMax(profile.budgetMax?.toString() ?? "");
    setInterests(profile.interests.join(", "));
    setError(null);
    setEditorOpen(true);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarSelection({
      uri: URL.createObjectURL(file),
      mimeType: file.type,
      fileName: file.name,
      fileSize: file.size,
      file,
    });
    setDraft(profile);
    setBudgetMin(profile.budgetMin?.toString() ?? "");
    setBudgetMax(profile.budgetMax?.toString() ?? "");
    setInterests(profile.interests.join(", "));
    setEditorOpen(true);
    e.target.value = "";
  }

  function chooseAvatar() {
    fileInputRef.current?.click();
  }

  async function saveProfile() {
    if (saving) return;
    const min = budgetMin.trim() ? Number(budgetMin) : null;
    const max = budgetMax.trim() ? Number(budgetMax) : null;
    if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0))) return setError("Budget values must be non-negative numbers.");
    if (min !== null && max !== null && min > max) return setError("Minimum budget cannot be greater than maximum budget.");
    setSaving(true); setError(null);
    const next = { ...draft, budgetMin: min, budgetMax: max, interests: interests.split(",").map((v) => v.trim()).filter(Boolean) };
    try {
      await Promise.all([
        updateProfile(db, next),
        updateCloudProfile({
          display_name: next.displayName,
          avatarSelection,
          interests: next.interests,
          language: next.language,
          budget_min: next.budgetMin,
          budget_max: next.budgetMax,
          notifications_enabled: next.notificationsEnabled,
        }),
      ]);
      setProfile(next); setAvatarSelection(null); setEditorOpen(false); setSuccess("Profile updated.");
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Your profile could not be saved. Please try again."); } finally { setSaving(false); }
  }

  async function toggleNotifications(value: boolean) {
    const previous = profile; const next = { ...profile, notificationsEnabled: value }; setProfile(next); setError(null);
    try {
      await Promise.all([
        updateProfile(db, next),
        updateCloudProfile({ display_name: next.displayName, interests: next.interests, language: next.language, budget_min: next.budgetMin, budget_max: next.budgetMax, notifications_enabled: value }),
      ]);
      setSuccess("Notification preference updated.");
    } catch { setProfile(previous); setError("Notification preference could not be saved."); }
  }

  const budgetLabel = profile.budgetMin === null && profile.budgetMax === null
    ? "Not set"
    : `₱${(profile.budgetMin ?? 0).toLocaleString()} – ${profile.budgetMax === null ? "No limit" : `₱${profile.budgetMax.toLocaleString()}`}`;
  const completionSteps = [
    Boolean(profile.displayName.trim()),
    Boolean(avatarUrl),
    profile.interests.length > 0,
    profile.budgetMin !== null || profile.budgetMax !== null,
  ];
  const completion = Math.round((completionSteps.filter(Boolean).length / completionSteps.length) * 100);
  const preferenceRows: [string, string, string, () => void][] = [
    ["language", "Language", profile.language, edit],
    ["payments", "Travel budget", budgetLabel, edit],
    ["interests", "Travel interests", profile.interests.length ? profile.interests.join(", ") : "Add interests", edit],
  ];
  const travelRows: [string, string, string, () => void][] = [
    ["favorite", "Saved places & ideas", "View your collection", () => setSavedOpen(true)],
    ["calendar_month", "My trip plans", "View and manage", goPlanner],
    ["help", "Help & support", "Get assistance", () => setHelpOpen(true)],
  ];

  const renderSettingsRows = (rows: [string, string, string, () => void][]) => rows.map(([icon, label, value, onPress]) => (
    <button key={label} className="profile-setting-row" onClick={onPress}>
      <span className="profile-setting-icon"><Icon name={icon} size={21} color="var(--c-green)" /></span>
      <span className="profile-setting-copy">
        <span className="profile-setting-label">{label}</span>
        <span className="profile-setting-value">{value}</span>
      </span>
      <Icon name="chevron_right" size={20} color="var(--c-muted)" />
    </button>
  ));

  if (savedOpen) return <Saved goExplore={goExplore} onBack={() => setSavedOpen(false)} />;

  return (
    <div className="screen profile-screen">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="file-input-hidden" />
      <ScreenHeader title={businessMode ? "Business profile" : "Profile"} subtitle={businessMode ? "Manage how your business appears on Hilinga." : "Your travel preferences, all in one place."} action={
        <Tooltip content="Edit your profile"><button className="profile-edit-button" onClick={edit} aria-label="Edit profile">
          <Icon name="edit" size={18} />
          <span>Edit</span>
        </button></Tooltip>
      } />
      {loading ? (
        <SkeletonProfile />
      ) : (
        <>
          {success && (
            <Card className="profile-notice profile-notice-success">
              <Icon name="check_circle" size={20} color="var(--c-green)" filled />
              <span role="status">{success}</span>
              <button onClick={() => setSuccess(null)} aria-label="Dismiss message"><Icon name="close" size={18} /></button>
            </Card>
          )}
          {error && !editorOpen && (
            <Card className="profile-notice profile-notice-error">
              <Icon name="error" size={20} color="var(--c-red)" filled />
              <span role="alert">{error}</span>
              <button onClick={() => setError(null)} aria-label="Dismiss error"><Icon name="close" size={18} /></button>
            </Card>
          )}

          <section className={`profile-hero ${businessMode ? "profile-hero-business" : ""}`} aria-labelledby="profile-name">
            <div className="profile-hero-glow profile-hero-glow-one" />
            <div className="profile-hero-glow profile-hero-glow-two" />
            <div className="profile-hero-main">
            <button className="profile-avatar" onClick={chooseAvatar} aria-label="Change profile picture">
              {avatarSelection?.uri || avatarUrl ? (
                <img src={avatarSelection?.uri ?? avatarUrl ?? ""} alt="Profile" />
              ) : (
                <span>{(profile.displayName || user?.email || "H").trim().charAt(0).toUpperCase()}</span>
              )}
              <span className="profile-avatar-badge"><Icon name="photo_camera" size={15} color="var(--c-green-dark)" /></span>
            </button>
            <div className="profile-identity">
              <span className="profile-kicker">{businessMode ? "HILINGA BUSINESS" : "HILINGA TRAVELER"}</span>
              <h2 id="profile-name">{profile.displayName || "Set up your profile"}</h2>
              <span className="profile-email">{user?.email ?? "Signed in"}</span>
              <span className="profile-sync"><Icon name="cloud_done" size={15} /> Cloud profile synced</span>
            </div>
            </div>
            <div className="profile-completion">
              <div><span>Profile completion</span><strong>{completion}%</strong></div>
              <div className="profile-progress" role="progressbar" aria-label="Profile completion" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${completion}%` }} />
              </div>
            </div>
          </section>
          <div className="profile-snapshot" aria-label="Travel profile overview">
            <button onClick={edit}>
              <Icon name="translate" size={20} color="var(--c-green)" />
              <span>Language</span>
              <strong>{profile.language}</strong>
            </button>
            <button onClick={edit}>
              <Icon name="wallet" size={20} color="var(--c-green)" />
              <span>Budget</span>
              <strong>{profile.budgetMin === null && profile.budgetMax === null ? "Set budget" : budgetLabel}</strong>
            </button>
            <button onClick={edit}>
              <Icon name="favorite" size={20} color="var(--c-green)" />
              <span>Interests</span>
              <strong>{profile.interests.length ? `${profile.interests.length} selected` : "Add interests"}</strong>
            </button>
          </div>

          {!businessMode && <ProfileQrCard />}

          {businessMode && (
            <section className="profile-section">
              <div className="profile-section-heading"><div><span>Business</span><h3>Registered business</h3></div></div>
              <BusinessRegistrationDashboard />
            </section>
          )}

          <section className="profile-section">
            <div className="profile-section-heading">
              <div><span>Preferences</span><h3>Make Hilinga yours</h3></div>
              <button onClick={edit}>Edit all</button>
            </div>
            <Card className="profile-settings-card">{renderSettingsRows(preferenceRows)}</Card>
          </section>

          <section className="profile-section">
            <div className="profile-section-heading"><div><span>Travel</span><h3>Plans & support</h3></div></div>
            <Card className="profile-settings-card">{renderSettingsRows(travelRows)}</Card>
          </section>

          <section className="profile-section">
            <div className="profile-section-heading"><div><span>Updates</span><h3>Stay in the loop</h3></div></div>
            <Card className="profile-notification-card">
              <span className="profile-setting-icon"><Icon name="notifications" size={21} color="var(--c-green)" /></span>
              <span className="profile-setting-copy">
                <span className="profile-setting-label">Travel notifications</span>
                <span className="profile-setting-value">Trip reminders, saved-place updates, and local tips</span>
              </span>
              <label className="toggle">
                <span className="sr-only">Enable travel notifications</span>
                <input type="checkbox" checked={profile.notificationsEnabled} onChange={(e) => toggleNotifications(e.target.checked)} />
                <span className="toggle-track" />
              </label>
            </Card>
          </section>

          <section className="profile-section profile-account-section">
            <div className="profile-section-heading"><div><span>Account</span><h3>Privacy & access</h3></div></div>
            <Card className="profile-settings-card">
              <div className="profile-account-email">
                <span className="profile-setting-icon"><Icon name="lock" size={21} color="var(--c-green)" /></span>
                <span className="profile-setting-copy"><span className="profile-setting-label">Signed in securely</span><span className="profile-setting-value">{user?.email ?? "Firebase account"}</span></span>
                <Icon name="verified_user" size={20} color="var(--c-green)" />
              </div>
              <button className="profile-account-action" onClick={() => void signOut().catch((e) => setError(e instanceof Error ? e.message : "Sign out failed."))}>
                <Icon name="logout" size={20} /><span>Sign out</span>
              </button>
              <button className="profile-account-action profile-account-action-danger" onClick={() => setResetOpen(true)}>
                <Icon name="delete_sweep" size={20} /><span>Clear local app data</span>
              </button>
            </Card>
          </section>
        </>
      )}
      <AppModal visible={editorOpen} title="Edit profile" onClose={() => !saving && setEditorOpen(false)}>
        <div className="profile-editor-avatar">
          <div className="profile-editor-preview">
            {avatarSelection?.uri || avatarUrl ? <img src={avatarSelection?.uri ?? avatarUrl ?? ""} alt="Profile preview" /> : <span>{(draft.displayName || user?.email || "H").trim().charAt(0).toUpperCase()}</span>}
          </div>
          <div><strong>Profile photo</strong><span>Use a clear photo so your profile feels personal.</span></div>
          <button onClick={chooseAvatar}>{avatarSelection ? "Change" : "Choose"}</button>
        </div>
        <Field label="Display name (optional)" value={draft.displayName} onChangeText={(v) => setDraft({ ...draft, displayName: v })} placeholder="Enter your name" />
        <Field label="Language" value={draft.language} onChangeText={(v) => setDraft({ ...draft, language: v })} placeholder="English" />
        <div className="profile-budget-fields">
          <Field label="Minimum budget (PHP)" value={budgetMin} onChangeText={setBudgetMin} placeholder="0" keyboardType="number-pad" />
          <Field label="Maximum budget (PHP)" value={budgetMax} onChangeText={setBudgetMax} placeholder="No limit" keyboardType="number-pad" />
        </div>
        <Field label="Travel interests (optional)" value={interests} onChangeText={setInterests} placeholder="Food, nature, heritage" />
        <p className="profile-field-hint">Separate interests with commas to personalize recommendations.</p>
        {error && <p className="error-text" role="alert">{error}</p>}
        <Button label="Save profile" onPress={saveProfile} loading={saving} />
      </AppModal>
      <AppModal visible={helpOpen} title="Help & support" onClose={() => setHelpOpen(false)}>
        <p style={{ color: "var(--c-body)", lineHeight: "22px" }}>Your account profile, saved places, and trip plans sync securely through Firebase and remain cached on this device when you are offline. Live bookings, alerts, and automatic itineraries still require additional services.</p>
        <Button label="Close" onPress={() => setHelpOpen(false)} secondary />
      </AppModal>
      <ConfirmModal visible={resetOpen} title="Clear local app data?" message="This permanently deletes saved items, trip plans, and local settings from this device. Your Firebase account and profile will remain." confirmLabel="Clear local data" loading={resetting} onCancel={() => !resetting && setResetOpen(false)} onConfirm={async () => { setResetting(true); await onReset(); setResetOpen(false); setResetting(false); }} />
    </div>
  );
}

function Emergency({ onClose, showNotice }: { onClose: () => void; showNotice: (notice: NonNullable<Notice>) => void }) {
  const actions = ["Nearest shelter", "Safe routes", "Road closures", "Hospitals", "Hotlines", "Preparedness guide"];
  return (
    <div className="emergency-screen">
      <div className="emergency-content">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Icon name="warning" size={48} color="white" filled />
          <h1 style={{ color: "white", fontSize: 22, fontWeight: 900 }}>Emergency tools</h1>
          <p style={{ color: "white", textAlign: "center", lineHeight: "20px" }}>Live safety information is not connected. For immediate danger, contact local emergency services using your phone.</p>
        </div>
        <div className="emergency-grid">
          {actions.map((label) => (
            <button key={label} className="emergency-action" onClick={() => showNotice({ title: `${label} unavailable`, message: "This feature needs a verified emergency-data provider and network access. Hilinga will not display unverified safety information." })}>
              <Icon name="health_and_safety" size={27} color="var(--c-red)" />
              <span style={{ textAlign: "center", fontWeight: 700 }}>{label}</span>
            </button>
          ))}
        </div>
        <div style={{ marginTop: "auto" }}>
          <Button label="Return to normal mode" onPress={onClose} secondary />
        </div>
      </div>
    </div>
  );
}

// ── Main App Shell ──

export function HilingaApp() {
  const db = useDatabase();
  const [tab, setTab] = useState<Tab>("Home");
  const [mapOpen, setMapOpen] = useState(false);
  const [mapPlanId, setMapPlanId] = useState<string | null>(null);
  const [exploreFilter, setExploreFilter] = useState<string | null>(null);
  const [exploreBusinessId, setExploreBusinessId] = useState<string | null>(null);
  const [emergency, setEmergency] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [businessMode, setBusinessMode] = useState(false);
  useEffect(() => {
    getSetting(db, "business_mode").then((mode) => setBusinessMode(mode === "true")).catch(() => setNotice({ title: "Business tools unavailable", message: "Your saved business settings could not be loaded." }));
  }, [db]);
  useEffect(() => {
    const unsubscribeBusinesses = subscribeToRegisteredBusinesses(
      () => undefined,
      (error) => console.warn("[business-directory] Could not load cloud businesses:", error),
    );
    const unsubscribePosts = subscribeToPublishedBusinessPosts(
      () => undefined,
      (error) => console.warn("[business-feed] Could not load cloud posts:", error),
    );
    return () => {
      unsubscribeBusinesses();
      unsubscribePosts();
    };
  }, []);
  async function reset() { try { await resetLocalAccount(db); setBusinessMode(false); setTab("Home"); setMapOpen(false); } catch { setNotice({ title: "Reset failed", message: "Your local data could not be reset. Please try again." }); } }
  const handleFilter = useCallback(() => setExploreFilter(null), []);
  const handleBusiness = useCallback(() => setExploreBusinessId(null), []);
  const openBusiness = useCallback((businessId: string) => { setExploreBusinessId(businessId); setTab("Explore"); }, []);

  if (emergency) {
    return (
      <>
        <Emergency onClose={() => setEmergency(false)} showNotice={setNotice} />
        <AppModal visible={notice !== null} title={notice?.title ?? "Notice"} onClose={() => setNotice(null)}>
          <p style={{ color: "var(--c-body)", lineHeight: "22px" }}>{notice?.message}</p>
          <Button label="Close" onPress={() => setNotice(null)} secondary />
        </AppModal>
      </>
    );
  }

  return (
    <div className={`app-shell ${businessMode ? "business-mode" : ""}`}>
      <div className="app-content">
        {mapOpen && <MapScreen onClose={() => setMapOpen(false)} initialPlanId={mapPlanId} />}
        {!mapOpen && tab === "Home" && <Home setTab={setTab} openMap={() => { setMapPlanId(null); setMapOpen(true); }} openEmergency={() => setEmergency(true)} showNotice={setNotice} />}
        {!mapOpen && tab === "Explore" && <Explore initialFilter={exploreFilter} initialBusinessId={exploreBusinessId} onFilterHandled={handleFilter} onBusinessHandled={handleBusiness} />}
        {!mapOpen && tab === "Planner" && <Planner onOpenMap={(planId) => { setMapPlanId(planId); setMapOpen(true); }} />}
        {!mapOpen && tab === "Feed" && <Feed onOpenBusiness={openBusiness} />}
        {!mapOpen && tab === "Profile" && <ProfileScreen goPlanner={() => setTab("Planner")} goExplore={() => setTab("Explore")} onReset={reset} businessMode={businessMode} />}
      </div>
      <BottomTabs active={mapOpen ? "Explore" : tab} onChange={(next) => { setMapOpen(false); setTab(next); }} />
      <AppModal visible={notice !== null} title={notice?.title ?? "Notice"} onClose={() => setNotice(null)}>
        <p style={{ color: "var(--c-body)", lineHeight: "22px" }}>{notice?.message}</p>
        <Button label="Close" onPress={() => setNotice(null)} secondary />
      </AppModal>
    </div>
  );
}
