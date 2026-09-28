import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { catalog } from "@/lib/catalog";
import type { ExploreKind, ExploreView, ExploreItem } from "@/lib/catalog";
import explore4 from "@/assets/images/hilinga/explore-4.png";
import {
  BUSINESS_CONTENT_CHANGED_EVENT,
  readPublishedBusinessPosts,
  readVerifiedRegisteredBusinesses,
  readVerifiedBusinessPosts,
  subscribeToRegisteredBusinesses,
} from "@/lib/business-content";
import { getSavedIds, removeSavedItem, saveItem } from "@/lib/cloud-user-data";
import {
  createCommunityPost,
  deleteCommunityPost,
  subscribeToCommunityPosts,
  type CommunityPost,
} from "@/lib/community-feed";
import { recordBusinessProfileView, sendBusinessInquiry } from "@/lib/business-engagement";
import { useAuth } from "@/providers/auth-provider";
import { useDatabase } from "@/providers/database-provider";
import { countryToFlag, formatNationality } from "@/lib/nationality";
import { Icon, Button, EmptyState, AppModal, ConfirmModal } from "@/components/ui-helpers";
import { haptic } from "@/lib/haptics";
import { ConfettiBurst } from "@/components/Confetti";
import { notifyBoulevardEnter } from "@/hooks/useNightMode";
import type { BusinessPost } from "@/lib/business-content";

// Helpers
function hashVariant(id: string): "tall" | "wide" | "square" {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const r = h % 3;
  if (r === 0) return "tall";
  if (r === 1) return "wide";
  return "square";
}
function isToday(dateStr: string): boolean {
  try {
    return dateStr.slice(0, 10) === new Date().toISOString().slice(0, 10);
  } catch {
    return false;
  }
}
function timeAgo(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return "now";
    if (diff < 3600_000) return `${Math.round(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
    return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(d);
  } catch {
    return "";
  }
}

export function ExploreScreen({ initialFilter, initialBusinessId, onFilterHandled, onBusinessHandled }: { initialFilter: string | null; initialBusinessId: string | null; onFilterHandled: () => void; onBusinessHandled: () => void }) {
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

  const [businessDirectory, setBusinessDirectory] = useState(() => readVerifiedRegisteredBusinesses());
  const [tick, setTick] = useState(0);
  const [confettiKey, setConfettiKey] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  // Stories state
  const [activeStoryIdx, setActiveStoryIdx] = useState<number | null>(null);
  const [storyProgress, setStoryProgress] = useState(0);
  const [viewedStories, setViewedStories] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("hilinga:stories_viewed");
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {}
    return new Set();
  });
  const [storyInquiryOpen, setStoryInquiryOpen] = useState(false);
  const [storyInquiryMessage, setStoryInquiryMessage] = useState("");
  const [storyInquirySending, setStoryInquirySending] = useState(false);
  const [storyInquiryError, setStoryInquiryError] = useState<string | null>(null);
  const [storyInquirySent, setStoryInquirySent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Business directory live
  useEffect(() => {
    const refreshBusinesses = () => {
      setBusinessDirectory([...readVerifiedRegisteredBusinesses()]);
      setTick((t) => t + 1);
    };
    const unsubscribe = subscribeToRegisteredBusinesses(() => refreshBusinesses(), () => undefined);
    window.addEventListener(BUSINESS_CONTENT_CHANGED_EVENT, refreshBusinesses);
    window.addEventListener("storage", refreshBusinesses);
    return () => {
      unsubscribe();
      window.removeEventListener(BUSINESS_CONTENT_CHANGED_EVENT, refreshBusinesses);
      window.removeEventListener("storage", refreshBusinesses);
    };
  }, []);

  // Stories: today's verified business posts (fallback to recent 12)
  const stories: BusinessPost[] = useMemo(() => {
    // Access tick to react to business-content changes
    void tick;
    try {
      const all = readVerifiedBusinessPosts();
      // If no verified posts (empty DB on fresh install), fall back to readPublishedBusinessPosts to still show something
      const pool = all.length > 0 ? all : readPublishedBusinessPosts();
      const todays = pool.filter((p) => isToday(p.createdAt) || (p.eventDate && isToday(p.eventDate)));
      if (todays.length > 0) return todays.slice(0, 14);
      // fallback: most recent 14
      return [...pool].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 14);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, businessDirectory.length]);

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
    // Night mode: boulevard trigger
    if (selected && /boulevard/i.test(`${selected.name} ${selected.location ?? ""} ${selected.subtitle}`)) {
      notifyBoulevardEnter(`${selected.name} ${selected.location ?? ""}`);
      try { sessionStorage.setItem("hilinga:explore_selected", selected.name); } catch {}
      try { window.dispatchEvent(new Event("hilinga:boulevard-trigger")); } catch {}
    } else if (selected) {
      try { sessionStorage.setItem("hilinga:explore_selected", selected.name); } catch {}
    }
  }, [selected?.id]);
  useEffect(() => {
    if (!user?.uid || !selected?.registered || !selected.ownerUid) return;
    void recordBusinessProfileView({
      businessId: selected.ownerUid,
      businessName: selected.name,
      viewerUid: user.uid,
    }).catch(() => undefined);
  }, [selected, user?.uid]);

  // Parallax on scroll for masonry images (subtle, respects reduced-motion)
  useEffect(() => {
    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    } catch {}
    const scroller = document.querySelector(".app-content") as HTMLElement | null;
    if (!scroller) return;
    let raf = 0;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(() => {
        const cards = scroller.querySelectorAll<HTMLElement>(".explore-masonry-card");
        const vh = window.innerHeight;
        const mid = vh * 0.5;
        cards.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const center = rect.top + rect.height / 2;
          const dist = center - mid;
          // subtle parallax: images move opposite to scroll, max ~10px
          const y = Math.max(-12, Math.min(12, dist * 0.06));
          const img = el.querySelector("img") as HTMLElement | null;
          if (img) img.style.transform = `translateY(${y * 0.5}px) scale(1.04)`;
          el.style.setProperty("--parallax-y", `${y * 0.15}px`);
        });
        ticking = false;
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    // initial
    onScroll();
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [filter, kind, view, query]);

  // Stories auto-progress
  const activeStory = activeStoryIdx !== null ? stories[activeStoryIdx] ?? null : null;
  useEffect(() => {
    if (activeStoryIdx === null || storyInquiryOpen) return;
    setStoryProgress(0);
    const dur = 5000;
    const started = Date.now();
    let raf = 0;
    let cancelled = false;
    const tickProgress = () => {
      if (cancelled) return;
      const elapsed = Date.now() - started;
      const p = Math.min(1, elapsed / dur);
      setStoryProgress(p);
      if (p >= 1) {
        // advance or close
        if (activeStoryIdx !== null && activeStoryIdx < stories.length - 1) {
          const next = activeStoryIdx + 1;
          setActiveStoryIdx(next);
          // mark viewed
          const s = stories[next];
          if (s) markStoryViewed(s.id);
        } else {
          setActiveStoryIdx(null);
        }
        return;
      }
      raf = requestAnimationFrame(tickProgress);
    };
    raf = requestAnimationFrame(tickProgress);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [activeStoryIdx, stories.length, storyInquiryOpen]);

  // close story on Escape
  useEffect(() => {
    if (activeStoryIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveStoryIdx(null);
      if (e.key === "ArrowLeft") goStoryPrev();
      if (e.key === "ArrowRight") goStoryNext();
    };
    window.addEventListener("keydown", onKey);
    // prevent background scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [activeStoryIdx, stories]);

  function markStoryViewed(id: string) {
    setViewedStories((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem("hilinga:stories_viewed", JSON.stringify([...next])); } catch {}
      return next;
    });
  }
  function openStory(idx: number) {
    haptic("selection");
    markStoryViewed(stories[idx].id);
    setStoryInquiryOpen(false);
    setStoryInquirySent(false);
    setStoryInquiryError(null);
    setStoryInquiryMessage("");
    setStoryProgress(0);
    setActiveStoryIdx(idx);
  }
  function goStoryPrev() {
    if (activeStoryIdx === null) return;
    haptic("light");
    if (activeStoryIdx > 0) {
      const prev = activeStoryIdx - 1;
      setActiveStoryIdx(prev);
      markStoryViewed(stories[prev].id);
    } else {
      setStoryProgress(0);
    }
  }
  function goStoryNext() {
    if (activeStoryIdx === null) return;
    haptic("light");
    if (activeStoryIdx < stories.length - 1) {
      const next = activeStoryIdx + 1;
      setActiveStoryIdx(next);
      markStoryViewed(stories[next].id);
    } else {
      setActiveStoryIdx(null);
    }
  }
  function closeStory() {
    haptic("light");
    setActiveStoryIdx(null);
    setStoryInquiryOpen(false);
  }

  async function submitStoryInquiry() {
    if (!user || !activeStory) {
      setStoryInquiryError("Sign in to message this business.");
      return;
    }
    const ownerUid = activeStory.ownerUid || activeStory.businessId.replace(/^registered-/, "");
    if (!ownerUid) {
      setStoryInquiryError("This business cannot be messaged yet.");
      return;
    }
    if (storyInquiryMessage.trim().length < 10) {
      setStoryInquiryError("Write at least 10 characters so the business can help you.");
      return;
    }
    setStoryInquirySending(true);
    setStoryInquiryError(null);
    try {
      await sendBusinessInquiry({
        businessId: ownerUid,
        businessName: activeStory.businessName,
        senderUid: user.uid,
        senderName: profile?.display_name?.trim() || user.displayName || user.email?.split("@")[0] || "Hilinga traveler",
        senderEmail: user.email || "",
        message: storyInquiryMessage,
      });
      setStoryInquiryMessage("");
      setStoryInquirySent(true);
      haptic("success");
      setShowConfetti(true);
      setConfettiKey((k) => k + 1);
      window.setTimeout(() => setStoryInquirySent(false), 2200);
    } catch (e) {
      setStoryInquiryError(e instanceof Error ? e.message : "Your message could not be sent. Please try again.");
    } finally {
      setStoryInquirySending(false);
    }
  }

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
    const wasSaved = savedIds.has(item.id);
    setPendingId(item.id);
    setError(null);
    haptic(wasSaved ? "light" : "selection");
    try {
      if (!user) throw new Error("Your session has expired.");
      if (wasSaved) await removeSavedItem(db, user.uid, item.id);
      else await saveItem(db, user.uid, { id: item.id, title: item.name, subtitle: item.subtitle, kind: item.savedKind, imageKey: item.imageKey });
      await refresh();
      if (!wasSaved) {
        haptic("success");
        setShowConfetti(true);
        setConfettiKey((k) => k + 1);
      } else {
        haptic("light");
      }
    } catch { setError("That change could not be saved. Please try again."); } finally { setPendingId(null); }
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
        await createCommunityPost({ authorUid: user.uid, authorName: profile?.display_name.trim() || user.displayName || user.email?.split("@")[0] || "Hilinga traveler", authorAvatarUrl: avatarUrl, placeName: selectedBusiness.name, location: selectedBusiness.location || "Legazpi City, Albay", category: selectedBusiness.category === "Cafes" ? "Cafe" : selectedBusiness.category === "Stay" ? "Accommodation" : selectedBusiness.category === "Shopping" ? "Shop" : "Restaurant", experience: reviewText, rating: reviewRating, authorNationality: profile?.nationality ?? null, authorCountry: profile?.country ?? null, authorCountryIso2: profile?.country_iso2 ?? null });
        setReviewText(""); setReviewRating(null);
        haptic("success");
        setShowConfetti(true); setConfettiKey((k)=>k+1);
      } catch { setReviewError("Your review could not be posted. Please try again."); }
      finally { setReviewPosting(false); }
    }

    async function removeReview() {
      if (!reviewDeleteTarget) return;
      setReviewPosting(true); setReviewError(null);
      try { await deleteCommunityPost(reviewDeleteTarget.id); setReviewDeleteTarget(null); haptic("light"); }
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
        haptic("success");
        setShowConfetti(true); setConfettiKey((k)=>k+1);
      } catch (nextError) {
        setInquiryError(nextError instanceof Error ? nextError.message : "Your message could not be sent. Please try again.");
      } finally {
        setInquirySending(false);
      }
    }
    return (
      <div className="screen explore-business-profile-screen">
        <ConfettiBurst key={confettiKey} active={showConfetti} onDone={() => setShowConfetti(false)} />
        <header className="business-public-nav">
          <button onClick={() => { haptic("light"); setSelected(null); }} aria-label="Back to Explore"><Icon name="arrow_back" size={23} /></button>
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
            <button onClick={() => { haptic("selection"); selected.ownerUid ? setInquiryOpen(true) : window.location.assign(`mailto:?subject=${encodeURIComponent(`Inquiry for ${selected.name}`)}`); }}><Icon name="chat_bubble" size={18} />Message</button>
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
            <div className="thread-rating" aria-label="Your rating"><span>Your rating</span>{[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" className={reviewRating !== null && star <= reviewRating ? "thread-star-active" : ""} onClick={() => { haptic("selection"); setReviewRating(star); }} aria-label={`${star} stars`}><Icon name="star" size={24} filled={reviewRating !== null && star <= reviewRating} /></button>)}</div>
            <textarea value={reviewText} maxLength={1500} rows={3} onChange={(event) => setReviewText(event.target.value)} placeholder={`How was your experience with ${selected.name}?`} />
            <div><small>{reviewText.length}/1500</small><button className="thread-publish" disabled={reviewPosting || reviewRating === null || reviewText.trim().length < 10} onClick={() => void publishReview()}>{reviewPosting ? <div className="spinner" /> : <Icon name="send" size={17} />}Post review</button></div>
          </div>
          {reviewError && <p className="error-text" role="alert">{reviewError}</p>}
          {reviewsLoading ? <div className="thread-loading"><div className="spinner" /><span>Loading customer experiences...</span></div> : businessReviews.length === 0 ? <div className="business-reviews-empty"><Icon name="rate_review" size={27} /><strong>No reviews yet</strong><span>Be the first to share an experience with this business.</span></div> : <div className="business-review-list">{businessReviews.map((review) => <article key={review.id}><header><span className="thread-avatar">{review.authorAvatarUrl ? <img src={review.authorAvatarUrl} alt="" /> : review.authorName.charAt(0).toUpperCase()}</span><div><strong style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{review.authorName}<span className="review-nationality-badge" title={formatNationality(review.authorNationality, review.authorCountry)}>{countryToFlag(review.authorCountry, review.authorCountryIso2, review.authorNationality)} {formatNationality(review.authorNationality, review.authorCountry)}</span></strong><span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>{review.createdAt ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(review.createdAt.toDate()) : "Posting now"}</span></div>{review.authorUid === user?.uid && <button onClick={() => setReviewDeleteTarget(review)} aria-label="Delete your review"><Icon name="delete" size={18} /></button>}</header>{review.rating !== null && <div className="business-review-stars">{[1, 2, 3, 4, 5].map((star) => <Icon key={star} name="star" size={17} filled={star <= review.rating!} />)}</div>}<p>{review.experience}</p></article>)}</div>}
        </section>

        {relatedBusinesses.length > 0 && <section className="explore-shelf business-related"><div className="explore-shelf-heading"><div><span>YOU MAY ALSO LIKE</span><h2>Similar businesses</h2></div></div><div className="explore-card-row">{relatedBusinesses.map((item) => <article className="explore-poster-card" key={item.id}><button className="explore-poster-main" onClick={() => { haptic("selection"); setSelected(item); document.querySelector(".app-content")?.scrollTo({ top: 0, behavior: "smooth" }); }}><span className="explore-poster-image-wrap"><img src={item.source} alt={item.name} className="explore-poster-image" /><small>{item.category.toUpperCase()}</small></span><span className="explore-poster-copy"><strong>{item.name}</strong><span>{item.subtitle}</span><em><Icon name="location_on" size={14} />{item.location || "Legazpi City"}</em></span></button></article>)}</div></section>}
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
        <header className="explore-collection-header"><button onClick={() => { haptic("light"); setCollection(null); }} aria-label="Back to Explore"><Icon name="arrow_back" size={23} /></button><div><span>{collection.eyebrow}</span><h1>{collection.title}</h1><p>All {collectionItems.length} recommendations in this category.</p></div></header>
        <div className="explore-collection-grid">
          {collectionItems.map((item) => <article className="explore-collection-card" key={item.id}><button className="explore-collection-main" onClick={() => { haptic("selection"); setSelected(item); }}><img src={item.source} alt={item.name} /><span className="destination-kind">{item.kind === "Businesses" ? "BUSINESS" : item.kind.slice(0, -1).toUpperCase()}</span><div><small>{item.category}</small><h2>{item.name}</h2><p>{item.subtitle}</p><span><Icon name={item.kind === "Events" ? "event" : "location_on"} size={15} />{item.location || item.detail || "Legazpi & nearby"}</span></div></button><button className={`explore-collection-save ${savedIds.has(item.id) ? "saved" : ""}`} onClick={() => void toggleSaved(item)} aria-label={savedIds.has(item.id) ? `Remove ${item.name} from saved items` : `Save ${item.name}`}>{pendingId === item.id ? <div className="spinner" /> : <Icon name="favorite" size={20} filled={savedIds.has(item.id)} />}</button></article>)}
        </div>
      </div>
    );
  }

  // Main Explore masonry view
  const masonryVariant = (id: string) => {
    const v = hashVariant(id);
    if (v === "tall") return "explore-masonry-tall";
    if (v === "wide") return "explore-masonry-wide";
    return "explore-masonry-square";
  };

  return (
    <div className="screen explore-screen" ref={scrollRef}>
      <ConfettiBurst key={confettiKey} active={showConfetti} onDone={() => setShowConfetti(false)} />
      <header className="explore-topbar">
        <nav aria-label="Explore views">{(["For you", "All", "Latest"] as ExploreView[]).map((value) => <button key={value} className={view === value ? "active" : ""} onClick={() => { haptic("selection"); setView(value); }}>{value}</button>)}</nav>
        <button className="explore-search-button" onClick={() => { haptic("light"); document.getElementById("explore-search")?.focus(); }} aria-label="Search Explore"><Icon name="search" size={24} /></button>
      </header>

      <section className="explore-intro">
        <span>DISCOVER LEGAZPI</span>
        <h1>Find your next local favorite.</h1>
        <p>Hotspots, homegrown businesses, major establishments, and experiences around the city.</p>
        <div className="search-box explore-search-box"><Icon name="search" size={20} color="var(--c-muted)" /><input id="explore-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search places and businesses" aria-label="Search Explore" />{query && <button onClick={() => { haptic("light"); setQuery(""); }} aria-label="Clear search"><Icon name="cancel" size={20} color="var(--c-muted)" /></button>}</div>
      </section>

      {/* Stories Reel — Today's business posts */}
      {stories.length > 0 && (
        <div className="explore-stories-reel" aria-label="Today's business stories">
          <div className="explore-stories-label">
            <span>TODAY&apos;S STORIES</span>
            <small>{stories.length} new · tap to view</small>
          </div>
          <div className="explore-stories-scroll" role="list">
            {stories.map((post, idx) => {
              const viewed = viewedStories.has(post.id);
              const avatar = post.businessLogoUrl || post.mediaUrl || explore4;
              return (
                <button
                  key={post.id}
                  role="listitem"
                  className={`story-ring ${viewed ? "viewed" : ""}`}
                  onClick={() => openStory(idx)}
                  aria-label={`${post.businessName}: ${post.title}`}
                >
                  <span className="story-ring-avatar">
                    <img src={avatar} alt={post.businessName} loading="lazy" />
                    {!viewed && <span className="story-ring-live">NEW</span>}
                  </span>
                  <span className="story-ring-label">{post.businessName}</span>
                  <span className="story-ring-sub">{post.category === "Events" ? "Event" : post.category === "Promotions" ? "Offer" : timeAgo(post.createdAt)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sticky category chips */}
      <div className="explore-sticky-chips" aria-label="Explore content types">
        {(["All", "Places", "Businesses", "Events", "Experiences"] as ExploreKind[]).map((value) => (
          <button
            key={value}
            className={`chip feed-kind-chip ${kind === value ? "chip-selected explore-sticky-chips chip-selected" : ""} ${kind === value ? "chip-selected" : ""}`}
            onClick={() => { haptic("selection"); setKind(value); }}
          >
            <Icon name={{ All: "apps", Places: "location_on", Businesses: "storefront", Events: "event", Experiences: "hiking" }[value]} size={17} />{value}
          </button>
        ))}
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}

      {results.length === 0 ? (
        <EmptyState icon="search" title="Nothing found" message="Try a different search, type, or interest." action="Clear filters" onAction={() => { haptic("light"); setQuery(""); setFilter("All"); setKind("All"); }} />
      ) : (
        <div className="explore-results">
          {/* When no search/filter, show masonry of all results; when searching, same masonry but filtered */}
          {query || filter !== "All" || kind !== "All" ? (
            <>
              <div className="explore-shelf-heading" style={{ padding: "0 2px", marginBottom: 8 }}>
                <div><span>{results.length} RESULTS</span><h2>{query ? `“${query}”` : filter !== "All" ? filter : kind}</h2></div>
              </div>
              <div className="explore-masonry">
                {results.map((item) => (
                  <article key={item.id} className={`explore-masonry-card ${masonryVariant(item.id)}`} onClick={() => { haptic("selection"); setSelected(item); }}>
                    <span className="explore-masonry-image-wrap">
                      <img src={item.source} alt={item.name} loading="lazy" />
                      <small className="explore-masonry-badge">{item.registered ? "NEW" : item.category.toUpperCase()}</small>
                      <button className={`explore-masonry-save ${savedIds.has(item.id) ? "saved" : ""}`} aria-label={savedIds.has(item.id) ? `Remove ${item.name}` : `Save ${item.name}`} disabled={pendingId !== null} onClick={(e) => { e.stopPropagation(); void toggleSaved(item); }}>
                        {pendingId === item.id ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Icon name="favorite" size={17} filled={savedIds.has(item.id)} />}
                      </button>
                    </span>
                    <span className="explore-masonry-copy">
                      <strong>{item.name}</strong>
                      <span>{item.subtitle}</span>
                      <em><Icon name={item.kind === "Businesses" ? "storefront" : item.kind === "Events" ? "event" : "location_on"} size={13} />{item.registered ? "Registered business" : item.detail || item.location || "Legazpi & nearby"}</em>
                    </span>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* For you: masonry replaces Trending near you */}
              <div className="explore-shelf-heading"><div><span>TRENDING NEAR YOU</span><h2>Hotspots in Legazpi</h2></div><button onClick={() => { haptic("light"); setCollection({ title: "Hotspots in Legazpi", eyebrow: "TRENDING NEAR YOU", itemIds: results.filter((i) => i.kind === "Places").map((i) => i.id) }); }}>See all <Icon name="arrow_forward" size={16} /></button></div>
              <div className="explore-masonry">
                {results.filter((i) => i.kind === "Places").map((item) => (
                  <article key={item.id} className={`explore-masonry-card ${masonryVariant(item.id)}`} onClick={() => { haptic("selection"); setSelected(item); }}>
                    <span className="explore-masonry-image-wrap">
                      <img src={item.source} alt={item.name} loading="lazy" />
                      <small className="explore-masonry-badge">{item.category.toUpperCase()}</small>
                      <button className={`explore-masonry-save ${savedIds.has(item.id) ? "saved" : ""}`} onClick={(e) => { e.stopPropagation(); void toggleSaved(item); }} aria-label={savedIds.has(item.id) ? `Remove ${item.name}` : `Save ${item.name}`}>
                        {pendingId === item.id ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Icon name="favorite" size={17} filled={savedIds.has(item.id)} />}
                      </button>
                    </span>
                    <span className="explore-masonry-copy"><strong>{item.name}</strong><span>{item.subtitle}</span><em><Icon name="location_on" size={13} />{item.detail || "Legazpi & nearby"}</em></span>
                  </article>
                ))}
              </div>

              <aside className="explore-business-banner"><span><Icon name="storefront" size={25} /></span><div><strong>Local businesses belong here</strong><p>Profiles registered in Business mode are automatically showcased in Explore.</p></div><Icon name="verified" size={21} /></aside>

              {(() => {
                const smallBiz = results.filter((i) => i.businessScale === "Small business");
                if (smallBiz.length === 0) return null;
                return (
                  <>
                    <div className="explore-shelf-heading"><div><span>SHOP & SUPPORT LOCAL</span><h2>Small businesses</h2></div><button onClick={() => { haptic("light"); setCollection({ title: "Small businesses", eyebrow: "SHOP & SUPPORT LOCAL", itemIds: smallBiz.map((i) => i.id) }); }}>See all <Icon name="arrow_forward" size={16} /></button></div>
                    <div className="explore-masonry">
                      {smallBiz.map((item) => (
                        <article key={item.id} className={`explore-masonry-card ${masonryVariant(item.id)}`} onClick={() => { haptic("selection"); setSelected(item); }}>
                          <span className="explore-masonry-image-wrap"><img src={item.source} alt={item.name} loading="lazy" /><small className="explore-masonry-badge">{item.registered ? "NEW" : item.category.toUpperCase()}</small><button className={`explore-masonry-save ${savedIds.has(item.id) ? "saved" : ""}`} onClick={(e) => { e.stopPropagation(); void toggleSaved(item); }}>{pendingId === item.id ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Icon name="favorite" size={17} filled={savedIds.has(item.id)} />}</button></span>
                          <span className="explore-masonry-copy"><strong>{item.name}</strong><span>{item.subtitle}</span><em><Icon name="storefront" size={13} />{item.location || "Registered business"}</em></span>
                        </article>
                      ))}
                    </div>
                  </>
                );
              })()}

              {(() => {
                const bigBiz = results.filter((i) => i.businessScale === "Big enterprise");
                if (bigBiz.length === 0) return null;
                return (
                  <>
                    <div className="explore-shelf-heading"><div><span>ESTABLISHED IN LEGAZPI</span><h2>Big enterprises</h2></div><button onClick={() => { haptic("light"); setCollection({ title: "Big enterprises", eyebrow: "ESTABLISHED IN LEGAZPI", itemIds: bigBiz.map((i) => i.id) }); }}>See all <Icon name="arrow_forward" size={16} /></button></div>
                    <div className="explore-masonry">
                      {bigBiz.map((item) => (
                        <article key={item.id} className={`explore-masonry-card ${masonryVariant(item.id)}`} onClick={() => { haptic("selection"); setSelected(item); }}>
                          <span className="explore-masonry-image-wrap"><img src={item.source} alt={item.name} loading="lazy" /><small className="explore-masonry-badge">{item.category.toUpperCase()}</small><button className={`explore-masonry-save ${savedIds.has(item.id) ? "saved" : ""}`} onClick={(e) => { e.stopPropagation(); void toggleSaved(item); }}>{pendingId === item.id ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Icon name="favorite" size={17} filled={savedIds.has(item.id)} />}</button></span>
                          <span className="explore-masonry-copy"><strong>{item.name}</strong><span>{item.subtitle}</span><em><Icon name="storefront" size={13} />{item.location || "Legazpi City"}</em></span>
                        </article>
                      ))}
                    </div>
                  </>
                );
              })()}

              {(() => {
                const more = results.filter((i) => i.kind === "Events" || i.kind === "Experiences");
                if (more.length === 0) return null;
                return (
                  <>
                    <div className="explore-shelf-heading"><div><span>MORE TO DISCOVER</span><h2>Events & experiences</h2></div><button onClick={() => { haptic("light"); setCollection({ title: "Events & experiences", eyebrow: "MORE TO DISCOVER", itemIds: more.map((i) => i.id) }); }}>See all <Icon name="arrow_forward" size={16} /></button></div>
                    <div className="explore-masonry">
                      {more.map((item) => (
                        <article key={item.id} className={`explore-masonry-card ${masonryVariant(item.id)}`} onClick={() => { haptic("selection"); setSelected(item); }}>
                          <span className="explore-masonry-image-wrap"><img src={item.source} alt={item.name} loading="lazy" /><small className="explore-masonry-badge">{item.category.toUpperCase()}</small><button className={`explore-masonry-save ${savedIds.has(item.id) ? "saved" : ""}`} onClick={(e) => { e.stopPropagation(); void toggleSaved(item); }}>{pendingId === item.id ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Icon name="favorite" size={17} filled={savedIds.has(item.id)} />}</button></span>
                          <span className="explore-masonry-copy"><strong>{item.name}</strong><span>{item.subtitle}</span><em><Icon name={item.kind === "Events" ? "event" : "hiking"} size={13} />{item.detail || "Legazpi & nearby"}</em></span>
                        </article>
                      ))}
                    </div>
                  </>
                );
              })()}

              <section className="explore-category-block"><div className="explore-shelf-heading"><div><span>BROWSE YOUR WAY</span><h2>Other categories</h2></div></div><div className="explore-category-grid">{[{ label: "Nature", icon: "landscape" }, { label: "Heritage", icon: "account_balance" }, { label: "Food", icon: "restaurant" }, { label: "Cafes", icon: "local_cafe" }, { label: "Shopping", icon: "shopping_bag" }, { label: "Activities", icon: "hiking" }].map((item) => <button key={item.label} className={filter === item.label ? "active" : ""} onClick={() => { haptic("selection"); setFilter(item.label); }}><span><Icon name={item.icon} size={22} /></span><strong>{item.label}</strong><Icon name="chevron_right" size={18} /></button>)}</div></section>
            </>
          )}
        </div>
      )}

      {/* Keep the non-business destination modal for Places/Events/Experiences */}
      <AppModal visible={selected !== null && (selected as unknown as ExploreItem).kind !== "Businesses"} title={selected?.name ?? "Destination"} onClose={() => { haptic("light"); setSelected(null); }}>
        {selected && (
          <>
            <img src={selected.source} alt={selected.name} style={{ width: "100%", height: 210, borderRadius: 14, objectFit: "cover" }} />
            <p style={{ color: "var(--c-body)", lineHeight: "21px" }}>{selected.subtitle}. Detailed descriptions, directions, opening hours, and live availability require a connected destination data service.</p>
            <Button label={savedIds.has(selected.id) ? "Remove from saved" : `Save ${selected.kind.slice(0, -1).toLowerCase()}`} onPress={() => toggleSaved(selected)} loading={pendingId === selected.id} secondary={savedIds.has(selected.id)} />
          </>
        )}
      </AppModal>

      {/* Story Viewer — Instagram-like full-screen with inquiry CTA */}
      {activeStory && (
        <div className="story-viewer-backdrop" role="dialog" aria-modal="true" aria-label={`${activeStory.businessName} story`}>
          <div className="story-viewer-top">
            <div className="story-progress-row" aria-hidden>
              {stories.map((s, i) => {
                const isPast = i < (activeStoryIdx ?? 0);
                const isActive = i === activeStoryIdx;
                const p = isPast ? 1 : isActive ? storyProgress : 0;
                return <i key={s.id} className={isPast ? "done" : ""} style={{ ["--p" as unknown as string]: String(p) } as React.CSSProperties} />;
              })}
            </div>
            <div className="story-viewer-header">
              <img src={activeStory.businessLogoUrl || activeStory.mediaUrl} alt="" />
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <strong>{activeStory.businessName}</strong>
                <span>{timeAgo(activeStory.createdAt)} · {activeStory.businessLocation}</span>
              </div>
              <button className="story-viewer-close" onClick={closeStory} aria-label="Close story"><Icon name="close" size={18} /></button>
            </div>
          </div>

          <div className="story-viewer-media">
            <div className="story-tap-zones" aria-hidden>
              <button onClick={goStoryPrev} aria-label="Previous story" />
              <button onClick={goStoryNext} aria-label="Next story" />
            </div>
            {activeStory.mediaType === "video" ? (
              <video src={activeStory.mediaUrl} autoPlay muted playsInline controls={false} />
            ) : (
              <img src={activeStory.mediaUrl} alt={activeStory.title} />
            )}
            {!storyInquiryOpen && (
              <div className="story-viewer-copy">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 900, letterSpacing: 0.8, color: "rgba(255,255,255,0.92)", background: "rgba(255,255,255,0.14)", padding: "4px 8px", borderRadius: 999, width: "fit-content", backdropFilter: "blur(8px)" }}>
                  <Icon name={activeStory.category === "Events" ? "event" : activeStory.category === "Promotions" ? "local_offer" : "photo_library"} size={12} />{activeStory.category.toUpperCase()}
                </span>
                <h2>{activeStory.title}</h2>
                <p>{activeStory.detail}</p>
                {activeStory.category === "Events" && activeStory.eventDate && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: "white", background: "rgba(0,0,0,0.28)", padding: "6px 10px", borderRadius: 999, backdropFilter: "blur(8px)", width: "fit-content" }}>
                    <Icon name="calendar_month" size={14} />{new Date(`${activeStory.eventDate}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric" })} · {activeStory.eventLocation || activeStory.businessLocation}
                  </span>
                )}
                {activeStory.category === "Promotions" && activeStory.promotionOffer && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: "#0F2A1A", background: "#F5B731", padding: "6px 10px", borderRadius: 999, width: "fit-content" }}>
                    <Icon name="sell" size={14} />{activeStory.promotionOffer}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Story inquiry CTA / form */}
          <div className="story-viewer-cta" style={storyInquiryOpen ? { background: "white", borderRadius: 16, padding: 12, flexDirection: "column", display: "flex", gap: 10, bottom: 10, top: "auto" } : undefined}>
            {storyInquiryOpen ? (
              storyInquirySent ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "8px 4px", textAlign: "center" }}>
                  <span style={{ width: 44, height: 44, borderRadius: "50%", background: "#E6F4EB", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="mark_email_read" size={24} color="var(--c-green)" /></span>
                  <strong style={{ color: "#0F2A1A", fontSize: 14 }}>Message sent to {activeStory.businessName}</strong>
                  <span style={{ color: "#5A6B60", fontSize: 12, lineHeight: "16px" }}>They&apos;ll reply in their Hilinga inbox. You can also tap below to view their profile.</span>
                  <div style={{ display: "flex", gap: 8, width: "100%", marginTop: 4 }}>
                    <button onClick={() => { const biz = allItems.find((it) => it.id === activeStory.businessId); if (biz) setSelected(biz); closeStory(); }} style={{ flex: 1, minHeight: 44, borderRadius: 12, background: "#0F2A1A", color: "white", fontWeight: 900, fontSize: 13 }}>View profile</button>
                    <button onClick={() => { setStoryInquiryOpen(false); setStoryInquirySent(false); }} style={{ flex: 1, minHeight: 44, borderRadius: 12, background: "#F0F2F0", color: "#0F2A1A", fontWeight: 900, fontSize: 13 }}>Done</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <strong style={{ color: "#0F2A1A", fontSize: 13 }}>Message {activeStory.businessName}</strong>
                    <button onClick={() => { haptic("light"); setStoryInquiryOpen(false); }} aria-label="Close inquiry"><Icon name="close" size={18} color="#6B7C72" /></button>
                  </div>
                  <textarea
                    autoFocus
                    value={storyInquiryMessage}
                    onChange={(e) => setStoryInquiryMessage(e.target.value)}
                    placeholder={`Hi ${activeStory.businessName}, I’d like to ask about…`}
                    rows={3}
                    maxLength={1500}
                    style={{ width: "100%", borderRadius: 12, border: "1px solid #DCE6E0", padding: "10px 12px", fontSize: 13, lineHeight: "18px", resize: "none", outline: "none" }}
                  />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <small style={{ color: "#6B7C72", fontSize: 11 }}>{storyInquiryMessage.length}/1500</small>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setStoryInquiryOpen(false)} style={{ minHeight: 38, padding: "0 14px", borderRadius: 999, background: "#F0F2F0", color: "#0F2A1A", fontWeight: 800, fontSize: 12 }}>Cancel</button>
                      <button onClick={() => void submitStoryInquiry()} disabled={storyInquirySending || storyInquiryMessage.trim().length < 10} style={{ minHeight: 38, padding: "0 16px", borderRadius: 999, background: storyInquiryMessage.trim().length < 10 ? "#B9C9BE" : "#0F2A1A", color: "white", fontWeight: 900, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {storyInquirySending ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: "white" }} /> : <Icon name="send" size={14} color="white" />}{storyInquirySending ? "Sending…" : "Send"}
                      </button>
                    </div>
                  </div>
                  {storyInquiryError && <p style={{ color: "#E53935", fontSize: 11, fontWeight: 700, margin: 0 }} role="alert">{storyInquiryError}</p>}
                </>
              )
            ) : (
              <>
                <button onClick={() => { haptic("selection"); setStoryInquiryOpen(true); }}>
                  <Icon name="chat_bubble" size={18} />Message {activeStory.businessName}
                </button>
                <button
                  onClick={() => {
                    haptic("light");
                    const biz = allItems.find((it) => it.id === activeStory.businessId);
                    if (biz) {
                      setSelected(biz);
                      closeStory();
                    } else {
                      // fallback: just open inquiry if no matching explore item
                      setStoryInquiryOpen(true);
                    }
                  }}
                  aria-label="View business profile"
                >
                  <Icon name="storefront" size={18} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Alias for inline compatibility — hilinga-app renders <Explore ... />
export const Explore = ExploreScreen;
