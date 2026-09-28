import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { catalog, savedImages } from "@/lib/catalog";
import { AlbayNowTicker } from "@/components/AlbayNowTicker";
import { useNightMode } from "@/hooks/useNightMode";
import { haptic } from "@/lib/haptics";
import { BusinessRegistrationDashboard } from "@/components/business-registration-dashboard";
import { KeepAliveTab, ViewCacheProvider, useViewCache } from "@/hooks/useViewCache";
import { MapScreen } from "@/components/screens/MapScreen";
import { Explore } from "@/components/screens/ExploreScreen";

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
  getSavedItems,
  getTripPlans,
  removeSavedItem,
} from "@/lib/cloud-user-data";
import type { AvatarUpload } from "@/lib/cloud-profile";
import { generateAiItinerary } from "@/lib/ai-itinerary";
import { ItineraryChatPanel } from "@/components/itinerary-chat-panel";
import { PostcardTimeline } from "@/components/itinerary-postcard-timeline";
import { SkeletonPlanner, SkeletonProfile, SkeletonSaved } from "@/components/skeleton";
import { Tooltip } from "@/components/tooltip";
import { NATIONALITY_OPTIONS, iso2ToFlag } from "@/lib/nationality";
import {
  BUSINESS_CONTENT_CHANGED_EVENT,
  BusinessPost,
  RegisteredSmallBusiness,
  readVerifiedBusinessPosts,
  readVerifiedSmallBusinesses,
  subscribeToPublishedBusinessPosts,
  subscribeToRegisteredBusinesses,
} from "@/lib/business-content";
import {
  setBusinessPostLiked,
  subscribeToLikedBusinessPosts,
} from "@/lib/business-engagement";
import { useAuth } from "@/providers/auth-provider";
import { useDatabase } from "@/providers/database-provider";
import { ProfileQrCard } from "@/components/tourist-passport";
import { AccountSecurityCard } from "@/components/account-security-card";
import { BookingFlowModal, ItineraryEditModal, MyBookingsSection, PaymentPanelModal } from "@/components/booking-payment-panel";
import type { Booking } from "@/lib/payment-system";

import explore4 from "@/assets/images/hilinga/explore-4.png";
import explore5 from "@/assets/images/hilinga/explore-5.png";
import explore6 from "@/assets/images/hilinga/explore-6.png";
import iconExploreNearby from "@/assets/icons/explore-nearby-icon.png";
import iconAiItinerary from "@/assets/icons/ai-itinerary-icon.png";
import iconFoodCafe from "@/assets/icons/food-cafe-icon.png";
import iconEvents from "@/assets/icons/events-icon.png";
import iconTransportation from "@/assets/icons/transportation-icon.png";
import iconMap from "@/assets/icons/map-icon.png";
import iconStay from "@/assets/icons/stay-icon.png";
import iconEmergency from "@/assets/icons/emergency-icon.png";

type Tab = "Home" | "Explore" | "Planner" | "Feed" | "Profile";
type Notice = { title: string; message: string } | null;



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

function AppModal({ visible, title, children, onClose, footer }: { visible: boolean; title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  if (!visible) return null;
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header modal-header-sticky">
          <h2 className="modal-title">{title}</h2>
          <button onClick={onClose} aria-label={`Close ${title}`}>
            <Icon name="cancel" size={28} color="var(--c-muted)" />
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
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
  const { isNight, toggle: toggleNight, override: nightOverride } = useNightMode();
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

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <AlbayNowTicker onOpenEvents={() => { haptic("selection"); setTab("Explore"); }} />
        </div>
        <button
          onClick={() => { haptic("selection"); toggleNight(); }}
          aria-label={isNight ? "Switch to day mode" : "Switch to night mode"}
          title={nightOverride === "auto" ? (isNight ? "Night mode (auto sunset) — tap to switch to day" : "Day mode (auto) — tap for night") : nightOverride === "on" ? "Night mode (manual) — tap for day" : "Day mode (manual) — tap for night"}
          className="night-toggle"
          style={{ flexShrink: 0 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{isNight ? "light_mode" : "dark_mode"}</span>
        </button>
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

function Feed({ onOpenBusiness }: { onOpenBusiness: (businessId: string) => void }) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | BusinessPost["category"]>("All");
  const [publishedPosts, setPublishedPosts] = useState<BusinessPost[]>(() => readVerifiedBusinessPosts());
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [likePendingIds, setLikePendingIds] = useState<Set<string>>(new Set());
  const [likeError, setLikeError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setPublishedPosts(readVerifiedBusinessPosts());
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
  title,
}: {
  itinerary: ItineraryDay[];
  compact?: boolean;
  onExclude?: (title: string) => void;
  onReplaceStop?: (day: number, stopIndex: number, currentTitle: string) => void;
  budgetText?: string | number | null;
  title?: string;
}) {
  return (
    <PostcardTimeline
      itinerary={itinerary}
      compact={compact}
      budgetText={budgetText}
      title={title}
      qrPayload={typeof window !== "undefined" ? window.location.href : undefined}
      onExclude={onExclude}
      onReplaceStop={onReplaceStop}
    />
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
  const registeredBusinesses = useMemo(() => readVerifiedSmallBusinesses(), [visible]);
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
  const [registeredBusinesses, setRegisteredBusinesses] = useState<RegisteredSmallBusiness[]>(() => readVerifiedSmallBusinesses());
  const [savingGenerated, setSavingGenerated] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [showAiChat, setShowAiChat] = useState(false);
  const [bookingPlan, setBookingPlan] = useState<TripPlan | null>(null);
  const [payBooking, setPayBooking] = useState<Booking | null>(null);
  const [payTripTitle, setPayTripTitle] = useState<string | undefined>(undefined);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [bookingRefreshKey, setBookingRefreshKey] = useState(0);
  const load = useCallback(async () => { setLoading(true); setLoadError(null); try { if (user) setPlans(await getTripPlans(db, user.uid)); } catch { setLoadError("Trip plans could not be loaded."); } finally { setLoading(false); } }, [db, user]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (chatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatStep, messages.length, chatOpen]);
  useEffect(() => {
    const refreshBusinesses = () => setRegisteredBusinesses(readVerifiedSmallBusinesses());
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => setBookingPlan(plan)}
                  style={{ flex: "1 1 150px", minHeight: 42, borderRadius: 12, background: "var(--c-green)", color: "white", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  <Icon name="confirmation_number" size={16} color="white" /> Book this trip
                </button>
                {plan.itinerary && plan.itinerary.length > 0 && (
                  <button className="planner-map-btn" onClick={() => onOpenMap(plan.id)} style={{ flex: "1 1 150px" }}><Icon name="route" size={19} /> Route on smart map</button>
                )}
              </div>
              {plan.itinerary && plan.itinerary.length > 0 && (
                <>
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
      <section className="planner-bookings-section" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
        <div className="planner-section-heading">
          <div><span className="eyebrow">Secure checkout</span><h2 className="section-title">My bookings</h2></div>
          <span style={{ fontSize: 11, color: "var(--c-muted)", fontWeight: 700 }}>In-app pay · itinerary linked</span>
        </div>
        <MyBookingsSection
          refreshKey={bookingRefreshKey}
          onPay={(b) => { const p = plans.find((x) => x.id === b.tripPlanId); setPayTripTitle(p?.title); setPayBooking(b); }}
          onEditItinerary={(b) => setEditBooking(b)}
        />
      </section>

      <BookingFlowModal plan={bookingPlan} open={bookingPlan !== null} onClose={() => setBookingPlan(null)} onBooked={(b) => { setBookingPlan(null); setPayTripTitle(plans.find((p) => p.id === b.tripPlanId)?.title ?? bookingPlan?.title); setPayBooking(b); setBookingRefreshKey((k) => k + 1); setSuccess(`Booked ${b.confirmationNumber} — pay securely in the app.`); }} />
      <PaymentPanelModal booking={payBooking} tripTitle={payTripTitle} open={payBooking !== null} onClose={() => setPayBooking(null)} onPaid={(b) => { setPayBooking(null); setBookingRefreshKey((k) => k + 1); setSuccess(`Payment confirmed — ${b.confirmationNumber}.`); }} />
      <ItineraryEditModal open={editBooking !== null} booking={editBooking} plan={editBooking ? (plans.find((p) => p.id === editBooking.tripPlanId) ?? null) : null} onClose={() => setEditBooking(null)} onSaved={async () => { await load(); setBookingRefreshKey((k) => k + 1); setSuccess("Itinerary updated — linked to your booking."); }} />

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
  // nationality lives in cloudProfile (Supabase) + synced to tourist passport; derived label shown in Explore reviews
  const nationalityLabel = (() => {
    const iso = (cloudProfile?.country_iso2 ?? "").trim();
    const cnt = (cloudProfile?.country ?? "").trim();
    const nat = (cloudProfile?.nationality ?? "").trim();
    if (cnt) return cnt;
    if (nat) return nat;
    if (iso) return iso;
    return "Not set";
  })();
  const nationalityFlag = (() => {
    try {
      const iso = (cloudProfile?.country_iso2 ?? "").trim().toUpperCase();
      if (iso.length === 2 && iso !== "UN") {
        const A = 0x1f1e6;
        return String.fromCodePoint(A + (iso.charCodeAt(0) - 65), A + (iso.charCodeAt(1) - 65));
      }
      if (iso === "UN") return "🌐";
    } catch {}
    return "🌐";
  })();
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
  const [draftNationality, setDraftNationality] = useState(cloudProfile?.nationality || "Filipino");
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
    setDraftNationality(cloudProfile?.nationality || "Filipino");
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
    setDraftNationality(cloudProfile?.nationality || "Filipino");
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
    const __natOpt = NATIONALITY_OPTIONS.find((o) => o.value === draftNationality) ?? NATIONALITY_OPTIONS[0];
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
          nationality: __natOpt.value,
          country: __natOpt.country,
          country_iso2: __natOpt.iso2,
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
    ["flag", "Nationality", `${nationalityFlag}  ${nationalityLabel}`, edit],
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
            <Card className="profile-settings-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {user?.uid && <AccountSecurityCard uid={user.uid} email={user.email ?? ""} emailVerified={Boolean(user.emailVerified)} />}
              <div style={{ height: 1, background: "#EEE" }} />
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
      <AppModal visible={editorOpen} title="Edit profile" onClose={() => !saving && setEditorOpen(false)} footer={<Button label="Save profile" onPress={saveProfile} loading={saving} />}>
        <div className="profile-editor-avatar">
          <div className="profile-editor-preview">
            {avatarSelection?.uri || avatarUrl ? <img src={avatarSelection?.uri ?? avatarUrl ?? ""} alt="Profile preview" /> : <span>{(draft.displayName || user?.email || "H").trim().charAt(0).toUpperCase()}</span>}
          </div>
          <div><strong>Profile photo</strong><span>Use a clear photo so your profile feels personal.</span></div>
          <button onClick={chooseAvatar}>{avatarSelection ? "Change" : "Choose"}</button>
        </div>
        <Field label="Display name (optional)" value={draft.displayName} onChangeText={(v) => setDraft({ ...draft, displayName: v })} placeholder="Enter your name" />
        <Field label="Language" value={draft.language} onChangeText={(v) => setDraft({ ...draft, language: v })} placeholder="English" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="field-label">Nationality · where are you from?</label>
          <div style={{ position: "relative" }}>
            <select value={draftNationality} onChange={(e) => setDraftNationality(e.target.value)} className="input" style={{ width: "100%", paddingRight: 40, appearance: "none" as const, WebkitAppearance: "none" as const, MozAppearance: "none" as const }} aria-label="Nationality">
              {NATIONALITY_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{iso2ToFlag(opt.iso2)} {opt.label} · {opt.country}</option>))}
            </select>
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 16 }}>{iso2ToFlag((NATIONALITY_OPTIONS.find((o) => o.value === draftNationality)?.iso2) ?? "PH")}</span>
          </div>
          <span style={{ color: "var(--c-muted)", fontSize: 11, lineHeight: "15px" }}>Shown as a flag badge on your Explore reviews so others know where you’re from.</span>
        </div>
        <div className="profile-budget-fields">
          <Field label="Minimum budget (PHP)" value={budgetMin} onChangeText={setBudgetMin} placeholder="0" keyboardType="number-pad" />
          <Field label="Maximum budget (PHP)" value={budgetMax} onChangeText={setBudgetMax} placeholder="No limit" keyboardType="number-pad" />
        </div>
        <Field label="Travel interests (optional)" value={interests} onChangeText={setInterests} placeholder="Food, nature, heritage" />
        <p className="profile-field-hint">Separate interests with commas to personalize recommendations.</p>
        {error && <p className="error-text" role="alert">{error}</p>}
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

// ── Main App Shell — ViewCache KeepAlive + IndexedDB cache ──

export function HilingaApp() {
  return (
    <ViewCacheProvider initial="Home">
      <HilingaAppShell />
    </ViewCacheProvider>
  );
}

function HilingaAppShell() {
  useNightMode();
  const db = useDatabase();
  const { activeTab, setActiveTab, visited } = useViewCache();
  const tab = activeTab as Tab;
  const setTab = setActiveTab as (t: Tab) => void;
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
        <div style={{ display: mapOpen ? "none" : "contents" }}>
          <KeepAliveTab tab="Home" active={tab} visited={visited}>
            <Home setTab={setTab} openMap={() => { setMapPlanId(null); setMapOpen(true); }} openEmergency={() => setEmergency(true)} showNotice={setNotice} />
          </KeepAliveTab>
          <KeepAliveTab tab="Explore" active={tab} visited={visited}>
            <Explore initialFilter={exploreFilter} initialBusinessId={exploreBusinessId} onFilterHandled={handleFilter} onBusinessHandled={handleBusiness} />
          </KeepAliveTab>
          <KeepAliveTab tab="Planner" active={tab} visited={visited}>
            <Planner onOpenMap={(planId) => { setMapPlanId(planId); setMapOpen(true); }} />
          </KeepAliveTab>
          <KeepAliveTab tab="Feed" active={tab} visited={visited}>
            <Feed onOpenBusiness={openBusiness} />
          </KeepAliveTab>
          <KeepAliveTab tab="Profile" active={tab} visited={visited}>
            <ProfileScreen goPlanner={() => setTab("Planner")} goExplore={() => setTab("Explore")} onReset={reset} businessMode={businessMode} />
          </KeepAliveTab>
        </div>
      </div>
      <BottomTabs active={mapOpen ? "Explore" : tab} onChange={(next) => { setMapOpen(false); setTab(next); }} />
      <AppModal visible={notice !== null} title={notice?.title ?? "Notice"} onClose={() => setNotice(null)}>
        <p style={{ color: "var(--c-body)", lineHeight: "22px" }}>{notice?.message}</p>
        <Button label="Close" onPress={() => setNotice(null)} secondary />
      </AppModal>
    </div>
  );
}
