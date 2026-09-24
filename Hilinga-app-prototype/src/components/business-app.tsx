import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/providers/auth-provider";
import { AccountSecurityCard } from "@/components/account-security-card";
import { BusinessVisitors } from "@/components/business-visitors";
import { BusinessAnalytics } from "@/components/business-analytics";
import {
  BUSINESS_CONTENT_CHANGED_EVENT,
  ensureBusinessPage,
  publishBusinessPost,
  saveBusinessPage,
  subscribeToOwnedBusinessPosts,
  subscribeToOwnedBusinessPage,
  type BusinessPageInfo,
  type BusinessPostCategory,
  type StoredBusinessItem,
} from "@/lib/business-content";
import {
  setBusinessInquiryStatus,
  subscribeToBusinessInquiries,
  subscribeToBusinessProfileViewCount,
  type BusinessInquiry,
} from "@/lib/business-engagement";

type BusinessTab = "home" | "my-business" | "visitors" | "analytics" | "create" | "inbox" | "profile";
type BusinessItem = StoredBusinessItem;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const tabs: { id: BusinessTab; label: string; icon: string }[] = [
  { id: "home", label: "HOME", icon: "home" },
  { id: "my-business", label: "MY BIZ", icon: "storefront" },
  { id: "visitors", label: "VISITORS", icon: "qr_code_scanner" },
  { id: "create", label: "Create", icon: "add" },
  { id: "analytics", label: "ANALYTICS", icon: "analytics" },
  { id: "inbox", label: "INBOX", icon: "inbox" },
  { id: "profile", label: "PROFILE", icon: "person" },
];

function Icon({ name, size = 24 }: { name: string; size?: number }) {
  return <span className="material-symbols-outlined" style={{ fontSize: size }} aria-hidden="true">{name}</span>;
}

function EmptyBusinessState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return <div className="business-empty-state"><span><Icon name={icon} size={30} /></span><strong>{title}</strong><p>{body}</p></div>;
}

function BusinessInbox({ inquiries, error, onStatusChange }: {
  inquiries: BusinessInquiry[];
  error: string;
  onStatusChange: (inquiry: BusinessInquiry, status: "read" | "unread") => Promise<void>;
}) {
  const [filter, setFilter] = useState<"All" | "Unread">("All");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const visible = filter === "Unread" ? inquiries.filter((item) => item.status === "unread") : inquiries;

  async function toggleStatus(inquiry: BusinessInquiry) {
    if (pendingId) return;
    setPendingId(inquiry.id);
    try { await onStatusChange(inquiry, inquiry.status === "unread" ? "read" : "unread"); }
    finally { setPendingId(null); }
  }

  return <div className="business-screen"><header className="business-page-header"><span>MESSAGES</span><h1>Inbox</h1><p>Questions and visit inquiries from Hilinga travelers.</p></header><div className="business-filter-pills">{(["All", "Unread"] as const).map((value) => <button key={value} className={filter === value ? "selected" : ""} onClick={() => setFilter(value)}>{value}{value === "Unread" && inquiries.some((item) => item.status === "unread") ? ` (${inquiries.filter((item) => item.status === "unread").length})` : ""}</button>)}</div>{error && <p className="business-image-error" role="alert">{error}</p>}{visible.length === 0 ? <EmptyBusinessState icon="mark_email_unread" title={filter === "Unread" ? "You’re all caught up" : "No inquiries yet"} body={filter === "Unread" ? "New traveler messages will be highlighted here." : "Messages sent from your public business page will appear here in real time."} /> : <section className="business-inbox-list" aria-label="Customer inquiries">{visible.map((inquiry) => <article key={inquiry.id} className={inquiry.status === "unread" ? "unread" : ""}><header><span className="business-inbox-avatar">{inquiry.senderName.charAt(0).toUpperCase()}</span><div><strong>{inquiry.senderName}</strong><span>{inquiry.createdAt.getTime() ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(inquiry.createdAt) : "Just now"}</span></div><em>{inquiry.status === "unread" ? "NEW" : "READ"}</em></header><p>{inquiry.message}</p><footer><a href={`mailto:${encodeURIComponent(inquiry.senderEmail)}?subject=${encodeURIComponent(`Re: ${inquiry.businessName} inquiry`)}`}><Icon name="reply" size={17} />Reply by email</a><button disabled={pendingId === inquiry.id} onClick={() => void toggleStatus(inquiry)}><Icon name={inquiry.status === "unread" ? "mark_email_read" : "mark_email_unread"} size={17} />Mark {inquiry.status === "unread" ? "read" : "unread"}</button></footer></article>)}</section>}</div>;
}

function resizeImage(file: File, maxSide = 900, quality = 0.68) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That image could not be opened."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("That image could not be opened."));
      image.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function BusinessApp() {
  const { profile, user, avatarUrl, signOut } = useAuth();
  const [tab, setTab] = useState<BusinessTab>(() => {
    const route = window.location.hash.replace("#business/", "") as BusinessTab;
    return tabs.some((item) => item.id === route && route !== "create") ? route : "home";
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [category, setCategory] = useState<BusinessPostCategory>("Photos & Videos");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [promotionOffer, setPromotionOffer] = useState("");
  const [promotionEnds, setPromotionEnds] = useState("");
  const [imageError, setImageError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [items, setItems] = useState<BusinessItem[]>([]);
  const defaultPageInfo: BusinessPageInfo = {
    name: profile?.display_name?.trim() || "Your business",
    businessScale: "Small business",
    category: "Local Business",
    location: "Legazpi City, Albay",
    phone: "",
    email: user?.email ?? "",
    hours: "Open daily · 8:00 AM–6:00 PM",
    about: "Tell customers what makes your business special, what you offer, and the story behind your brand.",
    coverUrl: "",
    logoUrl: avatarUrl ?? "",
  };
  const [pageInfo, setPageInfo] = useState<BusinessPageInfo>(defaultPageInfo);
  const [pageReady, setPageReady] = useState(false);
  const [pageDraft, setPageDraft] = useState<BusinessPageInfo>(pageInfo);
  const [editPageOpen, setEditPageOpen] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageSaving, setPageSaving] = useState(false);
  const [inquiries, setInquiries] = useState<BusinessInquiry[]>([]);
  const [inquiryError, setInquiryError] = useState("");
  const [profileViewCount, setProfileViewCount] = useState(0);

  const businessName = pageInfo.name;
  const firstName = businessName.split(" ")[0];
  const today = useMemo(() => new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric" }).format(new Date()), []);
  const initialProfileQr = pageReady
    ? new URLSearchParams(window.location.search).get("profile_qr")
      ?? new URLSearchParams(window.location.search).get("tourist_token")
      ?? ""
    : "";

  useEffect(() => {
    const onPopState = () => {
      const route = window.location.hash.replace("#business/", "") as BusinessTab;
      setTab(tabs.some((item) => item.id === route && route !== "create") ? route : "home");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = subscribeToOwnedBusinessPosts(user.uid, (posts) => {
      setItems(posts.map((post) => ({
        id: post.sourceId ?? post.id,
        category: post.category,
        title: post.title,
        detail: post.detail,
        mediaUrl: post.mediaUrl,
        mediaType: post.mediaType,
        eventDate: post.eventDate,
        eventLocation: post.eventLocation,
        promotionOffer: post.promotionOffer,
        promotionEnds: post.promotionEnds,
        createdAt: post.createdAt,
      })));
    }, (error) => console.warn("[business-posts] Could not load cloud posts:", error));
    return unsubscribe;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribeInquiries = subscribeToBusinessInquiries(
      user.uid,
      (nextInquiries) => { setInquiries(nextInquiries); setInquiryError(""); },
      () => setInquiryError("Your inbox could not be loaded. Check your connection and Firebase rules."),
    );
    const unsubscribeViews = subscribeToBusinessProfileViewCount(
      user.uid,
      setProfileViewCount,
      () => undefined,
    );
    return () => { unsubscribeInquiries(); unsubscribeViews(); };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = subscribeToOwnedBusinessPage(user.uid, (nextPage) => {
      setPageInfo(nextPage);
      setPageReady(true);
      setPageDraft((current) => editPageOpen ? current : nextPage);
    }, (error) => console.warn("[business-pages] Could not load the cloud business page:", error));
    void ensureBusinessPage(user.uid, defaultPageInfo)
      .then((nextPage) => {
        setPageInfo(nextPage);
        setPageReady(true);
        setPageDraft(nextPage);
      })
      .catch((error) => {
        setPageReady(true);
        console.warn("[business-pages] Could not migrate the business page:", error);
        setPageError("Your cloud business page could not be loaded. Check Firebase permissions.");
      });
    return unsubscribe;
  }, [user?.uid]);

  function navigate(next: BusinessTab) {
    if (next === "create") { setCreateOpen(true); return; }
    setTab(next);
    window.history.pushState({ businessTab: next }, "", `#business/${next}`);
  }

  async function createItem(event: FormEvent) {
    event.preventDefault();
    if (!user?.uid || !title.trim() || !mediaUrl || publishing) return;
    if (category === "Events" && (!eventDate || !eventLocation.trim())) { setImageError("Add the event date and location."); return; }
    if (category === "Promotions" && !promotionOffer.trim()) { setImageError("Add the promotion or offer details."); return; }
    const item: BusinessItem = { id: crypto.randomUUID(), category, title: title.trim(), detail: detail.trim(), mediaUrl, mediaType, eventDate: category === "Events" ? eventDate : undefined, eventLocation: category === "Events" ? eventLocation.trim() : undefined, promotionOffer: category === "Promotions" ? promotionOffer.trim() : undefined, promotionEnds: category === "Promotions" ? promotionEnds : undefined, createdAt: new Date().toISOString() };
    setPublishing(true);
    setImageError("");
    try {
      const published = await publishBusinessPost({
        ownerUid: user.uid,
        sourceId: item.id,
        businessName: pageInfo.name,
        businessCategory: pageInfo.category,
        businessLocation: pageInfo.location || "Legazpi City, Albay",
        businessLogoUrl: pageInfo.logoUrl,
        category,
        title: item.title,
        detail: item.detail,
        mediaUrl,
        mediaType,
        eventDate: item.eventDate,
        eventLocation: item.eventLocation,
        promotionOffer: item.promotionOffer,
        promotionEnds: item.promotionEnds,
        createdAt: item.createdAt,
      });
      const savedItem = { ...item, mediaUrl: published.mediaUrl, mediaType: published.mediaType };
      setItems((current) => [savedItem, ...current.filter((existing) => existing.id !== savedItem.id)]);
      window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT));
      setTitle(""); setDetail(""); setMediaUrl(""); setMediaType("image"); setEventDate(""); setEventLocation(""); setPromotionOffer(""); setPromotionEnds(""); setImageError(""); setCreateOpen(false); navigate("my-business");
    } catch (error) {
      console.error("[business-posts] Publish failed:", error);
      setImageError(error instanceof Error ? error.message : "This post could not be shared. Check your connection and Firebase permissions, then try again.");
    } finally {
      setPublishing(false);
    }
  }

  async function chooseMedia(file: File | undefined) {
    if (!file) return;
    setImageError("");
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (isVideo) { setImageError("Video needs paid file storage. Choose a photo to keep Hilinga on the free Firebase plan."); return; }
    if (!isImage) { setImageError("Choose a photo file."); return; }
    if (isImage && file.size > MAX_UPLOAD_BYTES) { setImageError("Choose an image smaller than 10 MB."); return; }
    try {
      setMediaType("image");
      const resized = await resizeImage(file);
      if (resized.length > 700_000) { setImageError("This photo is still too detailed after compression. Choose a simpler or smaller photo."); return; }
      setMediaUrl(resized);
    } catch (error) { setImageError(error instanceof Error ? error.message : "That media file could not be opened."); }
  }

  function openPageEditor() {
    setPageDraft(pageInfo);
    setPageError("");
    setEditPageOpen(true);
  }

  async function choosePageImage(file: File | undefined, field: "coverUrl" | "logoUrl") {
    if (!file) return;
    setPageError("");
    if (!file.type.startsWith("image/")) { setPageError("Choose an image file for your business page."); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setPageError("Choose an image smaller than 10 MB."); return; }
    try {
      const resized = await resizeImage(file, field === "coverUrl" ? 720 : 360, field === "coverUrl" ? 0.6 : 0.65);
      setPageDraft((current) => ({ ...current, [field]: resized }));
    }
    catch (error) { setPageError(error instanceof Error ? error.message : "That image could not be opened."); }
  }

  async function savePageInfo(event: FormEvent) {
    event.preventDefault();
    if (!user?.uid || pageSaving) return;
    if (!pageDraft.name.trim() || !pageDraft.category.trim()) { setPageError("Add your business name and category."); return; }
    const next = { ...pageDraft, name: pageDraft.name.trim(), category: pageDraft.category.trim(), about: pageDraft.about.trim() };
    setPageSaving(true);
    setPageError("");
    try {
      const saved = await saveBusinessPage(user.uid, next);
      setPageInfo(saved);
      setPageDraft(saved);
      window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT));
      setEditPageOpen(false);
    } catch (error) {
      console.error("[business-pages] Save failed:", error);
      setPageError(error instanceof Error ? error.message : "This business page could not be synced. Check your connection.");
    } finally {
      setPageSaving(false);
    }
  }

  async function setBusinessScale(businessScale: BusinessPageInfo["businessScale"]) {
    if (!user?.uid || pageSaving) return;
    const next = { ...pageInfo, businessScale };
    setPageSaving(true);
    setPageError("");
    try {
      const saved = await saveBusinessPage(user.uid, next);
      setPageInfo(saved);
      setPageDraft(saved);
      window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT));
    } catch (error) {
      console.error("[business-pages] Listing type save failed:", error);
      setPageError("The Explore listing type could not be synced. Please try again.");
    } finally {
      setPageSaving(false);
    }
  }

  async function changeInquiryStatus(inquiry: BusinessInquiry, status: "read" | "unread") {
    setInquiryError("");
    try { await setBusinessInquiryStatus(inquiry.id, status, inquiry.businessId); }
    catch {
      setInquiryError("That message could not be updated. Please try again.");
      throw new Error("Inquiry status update failed");
    }
  }

  const unreadInquiryCount = inquiries.filter((item) => item.status === "unread").length;

  return (
    <div className="business-app-shell">
      <main className="business-app-content">
        {tab === "home" && <div className="business-screen">
          <header className="business-topbar"><div><span className="business-overline">HILINGA BUSINESS</span><h1>Good day, {firstName}</h1><p>{today}</p></div><div className="business-topbar-actions"><button className="business-alert-button" onClick={() => navigate("inbox")} aria-label={`${unreadInquiryCount} unread inquiries`}><Icon name="inbox" size={22} />{unreadInquiryCount > 0 && <em>{Math.min(99, unreadInquiryCount)}</em>}</button><button className="business-alert-button" aria-label="Notifications"><Icon name="notifications" size={22} /></button></div></header>
          <section className="business-welcome-card"><span className="business-welcome-icon"><Icon name="storefront" size={27} /></span><div><span>BUSINESS OVERVIEW</span><h2>{businessName}</h2><p>{unreadInquiryCount ? `You have ${unreadInquiryCount} new traveler ${unreadInquiryCount === 1 ? "inquiry" : "inquiries"} waiting in your inbox.` : "Your public page, posts, visitor log, and customer messages are connected."}</p></div><button onClick={() => unreadInquiryCount ? navigate("inbox") : navigate("my-business")}>{unreadInquiryCount ? "Open inbox" : "Manage"} <Icon name="arrow_forward" size={17} /></button></section>
          <section><div className="business-section-heading"><div><span>LIVE</span><h2>At a glance</h2></div></div><div className="business-stats"><article><Icon name="visibility" /><strong>{profileViewCount}</strong><span>Unique profile viewers</span></article><article><Icon name="forum" /><strong>{inquiries.length}</strong><span>Customer inquiries</span></article><article><Icon name="inventory_2" /><strong>{items.length}</strong><span>Published items</span></article></div></section>
          <section><div className="business-section-heading"><div><span>NEXT STEPS</span><h2>Grow your presence</h2></div></div><div className="business-task-list"><button onClick={() => navigate("my-business")}><span><Icon name="domain_add" /></span><div><strong>Complete your business details</strong><p>Add your location, hours, and contact information.</p></div><Icon name="chevron_right" /></button><button onClick={() => setCreateOpen(true)}><span><Icon name="add_circle" /></span><div><strong>Create your first offering</strong><p>Publish a listing, product, service, or promotion.</p></div><Icon name="chevron_right" /></button></div></section>
        </div>}

        {tab === "my-business" && <div className="business-page-screen">
          <section className="business-social-page">
            <div className={`business-cover ${pageInfo.coverUrl ? "has-image" : ""}`} style={pageInfo.coverUrl ? { backgroundImage: `url(${pageInfo.coverUrl})` } : undefined}>
              {!pageInfo.coverUrl && <div><Icon name="landscape" size={34} /><span>Add a cover photo</span></div>}
              <button onClick={openPageEditor}><Icon name="photo_camera" size={18} /><span>Edit cover</span></button>
            </div>
            <div className="business-page-intro">
              <div className="business-page-logo">{pageInfo.logoUrl ? <img src={pageInfo.logoUrl} alt={`${businessName} profile`} /> : <Icon name="storefront" size={42} />}</div>
              <div className="business-page-title">
                <div><h1>{businessName}</h1><span className="business-verified" title="Verified business"><Icon name="verified" size={21} /></span></div>
                <p>{pageInfo.category} · {pageInfo.location || "Location not added"}</p>
                <div className="business-rating" aria-label="Rated 4.8 out of 5 from 24 reviews"><strong>4.8</strong><span>★★★★★</span><button>24 reviews</button></div>
              </div>
              <button className="business-edit-page-button" onClick={openPageEditor}><Icon name="edit" size={18} /> Edit Page</button>
            </div>
            <div className="business-page-actions"><button className="primary" onClick={() => setCreateOpen(true)}><Icon name="add" size={20} /> Create</button><button><Icon name="chat" size={19} /> Message</button><button onClick={openPageEditor}><Icon name="more_horiz" size={20} /> More</button></div>
          </section>

          <section className="business-discovery-type" aria-label="Explore listing type">
            <div><span>EXPLORE LISTING</span><strong>How should this business appear?</strong><p>This places your page in the matching Explore showcase.</p></div>
            <div>{(["Small business", "Big enterprise"] as const).map((value) => <button key={value} disabled={pageSaving} className={pageInfo.businessScale === value ? "selected" : ""} onClick={() => void setBusinessScale(value)}><Icon name={value === "Small business" ? "storefront" : "apartment"} size={19} />{value}</button>)}</div>
          </section>

          <div className="business-page-columns">
            <div className="business-page-sidebar">
              <section className="business-page-card business-about-card"><div className="business-card-heading"><h2>About Us</h2><button onClick={openPageEditor}>Edit</button></div><p>{pageInfo.about || "Add your business story so customers can learn more about you."}</p></section>
              <section className="business-page-card business-info-card"><div className="business-card-heading"><h2>Business information</h2><button onClick={openPageEditor}><Icon name="edit" size={17} /></button></div><ul><li><Icon name="category" size={19} /><div><span>Category</span><strong>{pageInfo.category}</strong></div></li><li><Icon name="location_on" size={19} /><div><span>Location</span><strong>{pageInfo.location || "Add location"}</strong></div></li><li><Icon name="schedule" size={19} /><div><span>Business hours</span><strong>{pageInfo.hours || "Add business hours"}</strong></div></li><li><Icon name="call" size={19} /><div><span>Phone</span><strong>{pageInfo.phone || "Add phone number"}</strong></div></li><li><Icon name="mail" size={19} /><div><span>Email</span><strong>{pageInfo.email || "Add email address"}</strong></div></li></ul></section>
            </div>
            <section className="business-page-card business-posts-card"><div className="business-card-heading"><div><span>PAGE CONTENT</span><h2>Posts</h2></div><button onClick={() => setCreateOpen(true)}>+ Add new</button></div>{items.length === 0 ? <EmptyBusinessState icon="post_add" title="Create your first post" body="Share a photo, announce an event, or publish a promotion." /> : <div className="business-social-posts">{items.map((item) => {
              const postCategory = item.category ?? (item.kind === "Promotion" ? "Promotions" : item.kind === "Events" ? "Events" : "Photos & Videos");
              const postMedia = item.mediaUrl ?? item.imageUrl;
              return <article key={item.id} className={`business-category-${postCategory.toLowerCase().replace(/[^a-z]+/g, "-")}`}><header><div className="business-post-avatar">{pageInfo.logoUrl ? <img src={pageInfo.logoUrl} alt="" /> : <Icon name="storefront" size={20} />}</div><div><strong>{businessName} <span className="business-inline-verified"><Icon name="verified" size={15} /></span></strong><small>{new Date(item.createdAt).toLocaleDateString("en-PH", { month: "long", day: "numeric" })}</small></div><span className="business-post-category"><Icon name={postCategory === "Events" ? "event" : postCategory === "Promotions" ? "campaign" : "perm_media"} size={14} />{postCategory}</span></header><h3>{item.title}</h3>{item.detail && <p>{item.detail}</p>}{postCategory === "Events" && <div className="business-post-detail"><Icon name="event" size={18} /><div><strong>{item.eventDate ? new Date(`${item.eventDate}T00:00:00`).toLocaleDateString("en-PH", { weekday: "short", month: "long", day: "numeric", year: "numeric" }) : "Date to be announced"}</strong><span><Icon name="location_on" size={14} />{item.eventLocation || "Location to be announced"}</span></div></div>}{postCategory === "Promotions" && <div className="business-post-detail business-promo-detail"><Icon name="local_offer" size={18} /><div><strong>{item.promotionOffer || "Special promotion"}</strong><span>{item.promotionEnds ? `Available until ${new Date(`${item.promotionEnds}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}` : "Limited-time offer"}</span></div></div>}{postMedia && (item.mediaType === "video" ? <video src={postMedia} className="business-post-image" controls playsInline /> : <img src={postMedia} alt={item.title} className="business-post-image" />)}<footer><button><Icon name="thumb_up" size={18} /> Like</button><button><Icon name="chat_bubble" size={18} /> Comment</button><button><Icon name="share" size={18} /> Share</button></footer></article>;
            })}</div>}</section>
          </div>
        </div>}

        {tab === "visitors" && <BusinessVisitors businessName={businessName} businessLocation={pageInfo.location} initialQrValue={initialProfileQr} />}

        {tab === "analytics" && <BusinessAnalytics businessName={businessName} businessId={user?.uid || ""} />}

        {tab === "inbox" && <BusinessInbox inquiries={inquiries} error={inquiryError} onStatusChange={changeInquiryStatus} />}

        {tab === "profile" && <div className="business-screen"><header className="business-page-header"><span>ACCOUNT</span><h1>Business Profile</h1><p>Manage your business account settings and access.</p></header><section className="business-account-card"><div className="business-profile-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : businessName.charAt(0).toUpperCase()}</div><div><strong>{businessName}</strong><span>{user?.email ?? "Signed in"}</span><small><Icon name="verified_user" size={14} /> Secure account</small></div></section><section className="business-settings-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>{user?.uid && <div style={{ padding: "10px 12px", background: "white", borderRadius: 12, border: "1px solid #E6E6E6" }}><div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.6, color: "var(--c-green)", marginBottom: 8 }}>PRIVACY & ACCESS</div><AccountSecurityCard uid={user.uid} email={user.email ?? ""} emailVerified={Boolean(user.emailVerified)} /></div>}<button><Icon name="badge" /><span><strong>Account information</strong><small>Business identity and contact details</small></span><Icon name="chevron_right" /></button><button><Icon name="notifications" /><span><strong>Notification settings</strong><small>Inquiries, updates, and promotions</small></span><Icon name="chevron_right" /></button><button className="business-logout" onClick={() => void signOut()}><Icon name="logout" /><span><strong>Sign out</strong><small>Return to account selection</small></span></button></section></div>}
      </main>

      <nav className="business-tab-dock" aria-label="Business navigation"><div role="tablist">{tabs.map((item) => item.id === "create" ? <button key={item.id} className="business-create-tab" onClick={() => navigate(item.id)} aria-label="Create new business content"><span><Icon name="add" size={32} /></span><small>CREATE</small></button> : <button key={item.id} className={`business-tab ${tab === item.id ? "selected" : ""}`} onClick={() => navigate(item.id)} role="tab" aria-selected={tab === item.id}><Icon name={item.icon} size={22} />{item.id === "inbox" && unreadInquiryCount > 0 && <em>{Math.min(99, unreadInquiryCount)}</em>}<span>{item.label}</span></button>)}</div></nav>

      {createOpen && <div className="business-modal-backdrop" onClick={(event) => event.target === event.currentTarget && setCreateOpen(false)}><form className="business-create-sheet" onSubmit={createItem}><div className="business-sheet-handle" /><header><div><span>CREATE POST</span><h2>Choose a post category</h2></div><button type="button" onClick={() => setCreateOpen(false)} aria-label="Close"><Icon name="close" /></button></header><div className="business-kind-grid business-category-grid">{(["Photos & Videos", "Events", "Promotions"] as BusinessPostCategory[]).map((value) => <button type="button" key={value} className={category === value ? "selected" : ""} onClick={() => { setCategory(value); setImageError(""); }}><Icon name={{ "Photos & Videos": "perm_media", Events: "event", Promotions: "campaign" }[value]} size={22} /><span>{value}</span></button>)}</div><div className="business-image-field"><span className="business-image-label">Photo or video</span>{mediaUrl ? <div className="business-image-preview">{mediaType === "video" ? <video src={mediaUrl} aria-label="Video upload preview" controls playsInline /> : <img src={mediaUrl} alt="Upload preview" />}<div><label htmlFor="business-media-upload"><Icon name="photo_camera" size={18} /> Replace</label><button type="button" onClick={() => setMediaUrl("")}><Icon name="delete" size={18} /> Remove</button></div></div> : <label className="business-image-upload" htmlFor="business-media-upload"><Icon name="add_photo_alternate" size={30} /><strong>Upload a photo or video</strong><span>Images up to 10 MB · Videos up to 3 MB</span></label>}<input id="business-media-upload" className="file-input-hidden" type="file" accept="image/*,video/*" onChange={(event) => void chooseMedia(event.target.files?.[0])} />{imageError && <p className="business-image-error" role="alert">{imageError}</p>}</div><label>Post title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={category === "Events" ? "Name your event" : category === "Promotions" ? "Name your promotion" : "Add a title"} /></label>{category === "Events" && <div className="business-editor-grid"><label>Event date<input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></label><label>Event location<input value={eventLocation} onChange={(event) => setEventLocation(event.target.value)} placeholder="Venue or address" /></label></div>}{category === "Promotions" && <div className="business-editor-grid"><label>Offer details<input value={promotionOffer} onChange={(event) => setPromotionOffer(event.target.value)} placeholder="e.g. 20% off all tours" /></label><label>Offer ends <small>(optional)</small><input type="date" value={promotionEnds} onChange={(event) => setPromotionEnds(event.target.value)} /></label></div>}<label>Caption <small>(optional)</small><textarea value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Write something about this post" /></label><button className="business-publish-button" type="submit" disabled={!title.trim() || !mediaUrl}>Publish to {category}</button></form></div>}

      {editPageOpen && <div className="business-modal-backdrop" onClick={(event) => event.target === event.currentTarget && setEditPageOpen(false)}><form className="business-create-sheet business-page-editor" onSubmit={savePageInfo}><div className="business-sheet-handle" /><header><div><span>BUSINESS PAGE</span><h2>Edit business information</h2></div><button type="button" onClick={() => setEditPageOpen(false)} aria-label="Close"><Icon name="close" /></button></header><div className="business-page-image-editors"><label htmlFor="business-cover-upload"><span>Banner</span><div className="business-editor-cover">{pageDraft.coverUrl ? <img src={pageDraft.coverUrl} alt="Cover preview" /> : <Icon name="landscape" size={28} />}<strong><Icon name="photo_camera" size={17} /> {pageDraft.coverUrl ? "Replace" : "Upload"}</strong></div></label><label htmlFor="business-logo-upload"><span>Profile picture</span><div className="business-editor-logo">{pageDraft.logoUrl ? <img src={pageDraft.logoUrl} alt="Profile preview" /> : <Icon name="storefront" size={26} />}<strong><Icon name="photo_camera" size={16} /></strong></div></label><input id="business-cover-upload" className="file-input-hidden" type="file" accept="image/*" onChange={(event) => void choosePageImage(event.target.files?.[0], "coverUrl")} /><input id="business-logo-upload" className="file-input-hidden" type="file" accept="image/*" onChange={(event) => void choosePageImage(event.target.files?.[0], "logoUrl")} /></div><label>Business name<input value={pageDraft.name} onChange={(event) => setPageDraft({ ...pageDraft, name: event.target.value })} placeholder="Business name" /></label><label>Category<input value={pageDraft.category} onChange={(event) => setPageDraft({ ...pageDraft, category: event.target.value })} placeholder="Cafe, tours, retail..." /></label><label>Location<input value={pageDraft.location} onChange={(event) => setPageDraft({ ...pageDraft, location: event.target.value })} placeholder="City, province" /></label><div className="business-editor-grid"><label>Phone<input type="tel" value={pageDraft.phone} onChange={(event) => setPageDraft({ ...pageDraft, phone: event.target.value })} placeholder="Phone number" /></label><label>Email<input type="email" value={pageDraft.email} onChange={(event) => setPageDraft({ ...pageDraft, email: event.target.value })} placeholder="Business email" /></label></div><label>Business hours<input value={pageDraft.hours} onChange={(event) => setPageDraft({ ...pageDraft, hours: event.target.value })} placeholder="e.g. Mon–Sat · 9:00 AM–6:00 PM" /></label><label>About Us<textarea value={pageDraft.about} onChange={(event) => setPageDraft({ ...pageDraft, about: event.target.value })} placeholder="Tell customers about your business" /></label>{pageError && <p className="business-image-error" role="alert">{pageError}</p>}<button className="business-publish-button" type="submit">Save business page</button></form></div>}
    </div>
  );
}
