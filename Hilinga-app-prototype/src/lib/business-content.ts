import { isSupabaseConfigured, supabase, withSupabaseTimeout } from "@/lib/supabase";
import {
  cacheBusinessPosts,
  getCachedBusinessPosts,
  cacheRegisteredBusinesses,
  getCachedRegisteredBusinesses,
} from "@/lib/cache-service";

export type BusinessPostCategory = "Photos & Videos" | "Events" | "Promotions";

export type BusinessVerificationStatus = "pending" | "verified" | "rejected";

export type BusinessVerificationInfo = {
  status: BusinessVerificationStatus;
  notes?: string;
  verifiedAt?: string;
  verifiedBy?: string;
};

export type BusinessVerificationPayload = {
  contactPerson: string;
  idType: string;
  idNumber: string;
  idFrontUrl: string;
  idBackUrl?: string;
  permitUrl: string;
  storefrontUrl?: string;
  extraUrls?: string[];
  submittedAt?: string;
};

export type SubmitVerificationInput = Omit<BusinessVerificationPayload, "submittedAt">;

export type BusinessPost = {
  id: string;
  ownerUid?: string;
  sourceId?: string;
  businessId: string;
  businessName: string;
  businessCategory: string;
  businessLocation: string;
  businessLogoUrl: string;
  category: BusinessPostCategory;
  title: string;
  detail: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  eventDate?: string;
  eventLocation?: string;
  promotionOffer?: string;
  promotionEnds?: string;
  createdAt: string;
};

export type PublishBusinessPostInput = Omit<BusinessPost, "id" | "businessId"> & {
  ownerUid: string;
  sourceId: string;
};

export type BusinessPageInfo = {
  name: string;
  businessScale: "Small business" | "Big enterprise";
  category: string;
  location: string;
  phone: string;
  email: string;
  hours: string;
  about: string;
  coverUrl: string;
  logoUrl: string;
};

type StoredBusinessPage = Partial<BusinessPageInfo> & {
  ownerUid?: string;
  createdAt?: string;
  updatedAt?: string;
  latitude?: number;
  longitude?: number;
  verificationStatus?: BusinessVerificationStatus;
  verificationNotes?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  verificationPayload?: BusinessVerificationPayload;
  verificationSubmittedAt?: string;
};

export type RegisteredSmallBusiness = {
  id: string;
  ownerUid: string;
  name: string;
  businessScale: "Small business" | "Big enterprise";
  category: string;
  location: string;
  phone: string;
  email: string;
  hours: string;
  about: string;
  coverUrl: string;
  logoUrl: string;
  latitude: number;
  longitude: number;
  verificationStatus: BusinessVerificationStatus;
  verificationNotes?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  verificationPayload?: BusinessVerificationPayload;
  verificationSubmittedAt?: string;
};

export type StoredBusinessItem = Omit<BusinessPost, "id" | "ownerUid" | "sourceId" | "businessId" | "businessName" | "businessCategory" | "businessLocation" | "businessLogoUrl" | "category" | "mediaUrl" | "mediaType"> & {
  id: string;
  category?: BusinessPostCategory;
  kind?: string;
  imageUrl?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
};

export const BUSINESS_CONTENT_CHANGED_EVENT = "hilinga:business-content-changed";

const ALBAY_TOWN_COORDINATES: Array<{ patterns: RegExp[]; lat: number; lng: number }> = [
  { patterns: [/cagsawa/i, /daraga/i, /busay/i, /anislag/i], lat: 13.1417, lng: 123.7150 },
  { patterns: [/boulevard/i, /embarcadero/i, /port/i, /dap-dap/i], lat: 13.1430, lng: 123.7550 },
  { patterns: [/legazpi/i, /peñaranda/i, /rizal/i, /gogon/i, /imperial/i, /maroroy/i, /rawis/i], lat: 13.1391, lng: 123.7438 },
  { patterns: [/camalig/i, /sumlang/i, /quituinan/i, /hoyop/i], lat: 13.1511, lng: 123.6667 },
  { patterns: [/guinobatan/i, /masaraga/i], lat: 13.1903, lng: 123.6010 },
  { patterns: [/ligao/i, /kawa-kawa/i, /kawakawa/i], lat: 13.2411, lng: 123.5358 },
  { patterns: [/mayon skyline/i, /tabaco/i], lat: 13.3575, lng: 123.7333 },
  { patterns: [/bacacay/i, /misibis/i, /cagraray/i], lat: 13.2933, lng: 123.7917 },
  { patterns: [/tiwi/i, /joroan/i], lat: 13.4570, lng: 123.6800 },
  { patterns: [/santo domingo/i, /sto\.? domingo/i], lat: 13.2356, lng: 123.7744 },
  { patterns: [/polangui/i], lat: 13.2950, lng: 123.4860 },
  { patterns: [/oas/i], lat: 13.2580, lng: 123.5010 },
  { patterns: [/libon/i], lat: 13.3000, lng: 123.4350 },
  { patterns: [/jovellar/i, /quitinday/i], lat: 13.0760, lng: 123.6020 },
  { patterns: [/malilipot/i], lat: 13.3150, lng: 123.7380 },
  { patterns: [/malinao/i], lat: 13.4090, lng: 123.6930 },
  { patterns: [/manito/i], lat: 13.1200, lng: 123.8700 },
];

function cloudPostId(ownerUid: string, sourceId: string) {
  return `${ownerUid}_${sourceId}`;
}

function normalizeBusinessPage(page: Partial<BusinessPageInfo>): BusinessPageInfo {
  return {
    name: page.name?.trim() || "Local business",
    businessScale: page.businessScale === "Big enterprise" ? "Big enterprise" : "Small business",
    category: page.category?.trim() || "Local Business",
    location: page.location?.trim() || "Legazpi City, Albay",
    phone: page.phone?.trim() || "",
    email: page.email?.trim() || "",
    hours: page.hours?.trim() || "Hours not provided",
    about: page.about?.trim() || "A locally registered business on Hilinga.",
    coverUrl: page.coverUrl ?? "",
    logoUrl: page.logoUrl ?? "",
  };
}

function toRegisteredBusiness(ownerUid: string, value: StoredBusinessPage): RegisteredSmallBusiness {
  const page = normalizeBusinessPage(value);
  const coords = typeof value.latitude === "number" && typeof value.longitude === "number"
    ? { latitude: value.latitude, longitude: value.longitude }
    : getAddressCoordinates(page.location, ownerUid);
  const status: BusinessVerificationStatus = value.verificationStatus ?? "pending";
  return {
    id: `registered-${ownerUid}`,
    ownerUid,
    ...page,
    latitude: coords.latitude,
    longitude: coords.longitude,
    verificationStatus: status,
    verificationNotes: value.verificationNotes,
    verifiedAt: value.verifiedAt,
    verifiedBy: value.verifiedBy,
    verificationPayload: value.verificationPayload,
    verificationSubmittedAt: value.verificationSubmittedAt,
  };
}

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.");
  }
}

// ── Migration fallback helpers ──

function isMissingColumnError(error: unknown): boolean {
  const raw = error as unknown as { message?: string; code?: string; details?: string; hint?: string };
  const msg = error instanceof Error ? error.message : String(raw?.message ?? raw?.details ?? error ?? "");
  const code = String(raw?.code ?? "");
  return (
    code === "PGRST204" ||
    code === "42703" ||
    msg.includes("42703") ||
    msg.includes("PGRST204") ||
    msg.includes("verification_status") ||
    msg.includes("verification_payload") ||
    msg.includes("verification_submitted_at") ||
    msg.includes("verification_notes") ||
    msg.includes("verified_at") ||
    msg.includes("verified_by") ||
    (msg.includes("column") && msg.includes("does not exist")) ||
    (msg.includes("Could not find the") && msg.includes("column"))
  );
}

const FALLBACK_PAYLOAD_PATH = (ownerUid: string) => `verification/${ownerUid}/payload.json`;

async function fallbackUploadPayload(
  ownerUid: string,
  wrapper: {
    payload: BusinessVerificationPayload;
    status: BusinessVerificationStatus;
    notes?: string;
    verifiedAt?: string;
    verifiedBy?: string;
    submittedAt: string;
  }
): Promise<void> {
  const json = JSON.stringify(wrapper);
  const blob = new Blob([json], { type: "application/json" });
  const path = FALLBACK_PAYLOAD_PATH(ownerUid);
  const { error } = await withSupabaseTimeout(
    supabase!.storage.from("business-media").upload(path, blob, { contentType: "application/json", upsert: true }),
    "Verification payload upload timed out."
  );
  if (error) {
    // If bucket missing, surface friendly error
    if (String(error.message).includes("Bucket not found") || String(error.message).includes("NoSuchBucket")) {
      throw new Error("Storage bucket 'business-media' not found. Run supabase/full_migration.sql in Supabase SQL Editor to create buckets, then retry.");
    }
    throw new Error(error.message);
  }
  // Bump businesses.updated_at so postgres_changes realtime notifies admin listeners (storage alone doesn't fire DB realtime)
  try {
    await withSupabaseTimeout(
      (supabase!.from("businesses").update({ updated_at: new Date().toISOString() } as never).eq("owner_uid", ownerUid) as unknown as PromiseLike<{ error: { message: string } | null }>),
      "touch business updated_at"
    ).catch(() => undefined);
  } catch {}
}

async function fallbackDownloadPayload(
  ownerUid: string
): Promise<{
  payload: BusinessVerificationPayload;
  status: BusinessVerificationStatus;
  notes?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  submittedAt: string;
} | null> {
  const path = FALLBACK_PAYLOAD_PATH(ownerUid);
  try {
    const { data, error } = await withSupabaseTimeout(
      supabase!.storage.from("business-media").download(path),
      "Verification payload download timed out."
    );
    if (error) {
      const msg = String(error.message);
      if (msg.includes("not found") || msg.includes("Object not found") || msg.includes("NoSuchKey") || msg.includes("404")) return null;
      // Try public URL as fallback
      throw new Error(msg);
    }
    if (!data) return null;
    const text = await (data as Blob).text();
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch (e) {
    // Fallback to public URL fetch (bucket is public)
    try {
      const { data } = supabase!.storage.from("business-media").getPublicUrl(path);
      const url = data?.publicUrl;
      if (!url) return null;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      const json = await res.json();
      return json as {
        payload: BusinessVerificationPayload;
        status: BusinessVerificationStatus;
        notes?: string;
        verifiedAt?: string;
        verifiedBy?: string;
        submittedAt: string;
      };
    } catch {
      return null;
    }
  }
}

async function fallbackListOwnerUidsWithPayload(): Promise<string[]> {
  try {
    const { data, error } = await withSupabaseTimeout(
      supabase!.storage.from("business-media").list("verification", { limit: 100 }),
      "Verification list timed out."
    );
    if (error) {
      console.warn("[business-content fallback] list verification failed:", error.message);
      return [];
    }
    if (!data) return [];
    // Filter to ownerUid folders — exclude stray files (e.g. test images) that contain a dot
    return data
      .map((e: { name: string }) => e.name)
      .filter((name: string) => Boolean(name) && !name.includes("."));
  } catch (e) {
    console.warn("[business-content fallback] list ownerUids error:", e);
    return [];
  }
}

async function fallbackFetchBusinessRow(ownerUid: string): Promise<BusinessRow | null> {
  try {
    const { data, error } = await withSupabaseTimeout(
      supabase!.from("businesses").select("*").eq("owner_uid", ownerUid).maybeSingle(),
      "Supabase business fetch timed out."
    );
    if (error) throw new Error(error.message);
    if (!data) return null;
    return data as unknown as BusinessRow;
  } catch {
    return null;
  }
}

function mergeFallbackIntoRegistered(
  base: RegisteredSmallBusiness,
  wrapper: { payload: BusinessVerificationPayload; status: BusinessVerificationStatus; notes?: string; verifiedAt?: string; verifiedBy?: string; submittedAt: string }
): RegisteredSmallBusiness {
  return {
    ...base,
    verificationStatus: wrapper.status,
    verificationPayload: wrapper.payload,
    verificationSubmittedAt: wrapper.submittedAt,
    verificationNotes: wrapper.notes,
    verifiedAt: wrapper.verifiedAt,
    verifiedBy: wrapper.verifiedBy,
  };
}


// ── Supabase row types & converters ──

type BusinessRow = {
  owner_uid: string;
  name: string;
  business_scale: string | null;
  category: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
  hours: string | null;
  about: string | null;
  cover_url: string | null;
  logo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  verification_status: string | null;
  verification_notes: string | null;
  verified_at: string | null;
  verified_by: string | null;
  verification_payload: unknown | null;
  verification_submitted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type BusinessPostRow = {
  id: string;
  owner_uid: string;
  source_id: string | null;
  business_id: string | null;
  business_name: string;
  business_category: string | null;
  business_location: string | null;
  business_logo_url: string | null;
  category: string | null;
  title: string;
  detail: string | null;
  media_url: string | null;
  media_type: string | null;
  event_date: string | null;
  event_location: string | null;
  promotion_offer: string | null;
  promotion_ends: string | null;
  created_at: string | null;
};

function businessRowToStoredPage(row: BusinessRow): StoredBusinessPage {
  const rawStatus = (row.verification_status as BusinessVerificationStatus | null) ?? "pending";
  // Fallback pending when column missing (pre-migration); new inserts default to pending via DB. Only admin verification makes it verified.
  const status: BusinessVerificationStatus = rawStatus === "verified" || rawStatus === "rejected" ? rawStatus : rawStatus === "pending" ? "pending" : "pending";
  return {
    ownerUid: row.owner_uid,
    name: row.name,
    businessScale: (row.business_scale as BusinessPageInfo["businessScale"]) ?? "Small business",
    category: row.category ?? undefined,
    location: row.location ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    hours: row.hours ?? undefined,
    about: row.about ?? undefined,
    coverUrl: row.cover_url ?? undefined,
    logoUrl: row.logo_url ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    verificationStatus: status,
    verificationNotes: row.verification_notes ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    verifiedBy: row.verified_by ?? undefined,
    verificationPayload: (row.verification_payload as BusinessVerificationPayload | null) ?? undefined,
    verificationSubmittedAt: row.verification_submitted_at ?? undefined,
  };
}

function businessRowToPage(row: BusinessRow): BusinessPageInfo {
  return normalizeBusinessPage(businessRowToStoredPage(row));
}

function businessRowToRegistered(row: BusinessRow): RegisteredSmallBusiness {
  return toRegisteredBusiness(row.owner_uid, businessRowToStoredPage(row));
}

function postRowToBusinessPost(row: BusinessPostRow): BusinessPost {
  return {
    id: row.id,
    ownerUid: row.owner_uid,
    sourceId: row.source_id ?? undefined,
    businessId: row.business_id ?? `registered-${row.owner_uid}`,
    businessName: row.business_name,
    businessCategory: row.business_category ?? "",
    businessLocation: row.business_location ?? "",
    businessLogoUrl: row.business_logo_url ?? "",
    category: (row.category as BusinessPostCategory) ?? "Photos & Videos",
    title: row.title,
    detail: row.detail ?? "",
    mediaUrl: row.media_url ?? "",
    mediaType: (row.media_type as "image" | "video") ?? "image",
    ...(row.event_date ? { eventDate: row.event_date } : {}),
    ...(row.event_location ? { eventLocation: row.event_location } : {}),
    ...(row.promotion_offer ? { promotionOffer: row.promotion_offer } : {}),
    ...(row.promotion_ends ? { promotionEnds: row.promotion_ends } : {}),
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

// ── Supabase adapters ──

async function supabaseSaveBusinessPage(ownerUid: string, page: BusinessPageInfo): Promise<BusinessPageInfo> {
  const normalized = normalizeBusinessPage(page);
  const coords = getAddressCoordinates(normalized.location, ownerUid);
  const payload = {
    owner_uid: ownerUid,
    name: normalized.name,
    business_scale: normalized.businessScale,
    category: normalized.category,
    location: normalized.location,
    phone: normalized.phone,
    email: normalized.email,
    hours: normalized.hours,
    about: normalized.about,
    cover_url: normalized.coverUrl,
    logo_url: normalized.logoUrl,
    latitude: coords.latitude,
    longitude: coords.longitude,
  };
  const { data, error } = await withSupabaseTimeout(
    supabase!.from("businesses").upsert(payload as never, { onConflict: "owner_uid" }).select().single(),
    "Supabase business save timed out.",
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Business save returned no data.");
  return businessRowToPage(data as unknown as BusinessRow);
}

async function supabaseGetBusinessPage(ownerUid: string): Promise<BusinessPageInfo | null> {
  const { data, error } = await withSupabaseTimeout(
    supabase!.from("businesses").select("*").eq("owner_uid", ownerUid).maybeSingle(),
    "Supabase business fetch timed out.",
  );
  if (error) throw new Error(error.message);
  if (!data) return null;
  return businessRowToPage(data as unknown as BusinessRow);
}

function supabaseSubscribeToOwnedBusinessPage(
  ownerUid: string,
  onPage: (page: BusinessPageInfo) => void,
  onError: (error: Error) => void,
): () => void {
  let cancelled = false;
  let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

  async function fetchOne() {
    const { data, error } = await withSupabaseTimeout(supabase!.from("businesses").select("*").eq("owner_uid", ownerUid).maybeSingle(), "Supabase business fetch timed out.");
    if (cancelled) return;
    if (error) { onError(new Error(error.message)); return; }
    if (!data) return;
    onPage(businessRowToPage(data as unknown as BusinessRow));
  }

  void fetchOne();

  try {
    channel = supabase!
      .channel(`business:${ownerUid}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "businesses", filter: `owner_uid=eq.${ownerUid}` },
      () => { void fetchOne(); },
    )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          void fetchOne();
        }
      });
  } catch {
    channel = null;
  }

  return () => {
    cancelled = true;
    if (channel) void supabase!.removeChannel(channel);
  };
}

async function supabasePublishBusinessPost(input: PublishBusinessPostInput): Promise<BusinessPost> {
  if (input.mediaType === "video" || input.mediaUrl.startsWith("data:video/")) {
    throw new Error("Video posts require paid file storage. Use a photo on the free plan.");
  }
  if (!input.mediaUrl.startsWith("data:image/") && !/^https:\/\//i.test(input.mediaUrl)) {
    throw new Error("Choose a valid post photo.");
  }
  if (input.mediaUrl.length > 700_000) {
    throw new Error("That photo is too large for the free cloud database.");
  }
  const post: Omit<BusinessPost, "id"> = {
    ownerUid: input.ownerUid,
    sourceId: input.sourceId,
    businessId: `registered-${input.ownerUid}`,
    businessName: input.businessName.trim(),
    businessCategory: input.businessCategory.trim(),
    businessLocation: input.businessLocation.trim(),
    businessLogoUrl: input.businessLogoUrl,
    category: input.category,
    title: input.title.trim(),
    detail: input.detail.trim(),
    mediaUrl: input.mediaUrl,
    mediaType: "image",
    createdAt: input.createdAt,
    ...(input.eventDate ? { eventDate: input.eventDate } : {}),
    ...(input.eventLocation ? { eventLocation: input.eventLocation.trim() } : {}),
    ...(input.promotionOffer ? { promotionOffer: input.promotionOffer.trim() } : {}),
    ...(input.promotionEnds ? { promotionEnds: input.promotionEnds } : {}),
  };
  const id = cloudPostId(input.ownerUid, input.sourceId);
  const row = {
    id,
    owner_uid: input.ownerUid,
    source_id: input.sourceId,
    business_id: post.businessId,
    business_name: post.businessName,
    business_category: post.businessCategory,
    business_location: post.businessLocation,
    business_logo_url: post.businessLogoUrl,
    category: post.category,
    title: post.title,
    detail: post.detail,
    media_url: post.mediaUrl,
    media_type: post.mediaType,
    event_date: post.eventDate ?? null,
    event_location: post.eventLocation ?? null,
    promotion_offer: post.promotionOffer ?? null,
    promotion_ends: post.promotionEnds ?? null,
    created_at: post.createdAt,
  };
  const { data, error } = await withSupabaseTimeout(
    supabase!.from("business_posts").upsert(row as never, { onConflict: "id" }).select().single(),
    "Supabase publish timed out.",
  );
  if (error) throw new Error(error.message);
  const publishedRow = data as unknown as BusinessPostRow;
  const published: BusinessPost = postRowToBusinessPost(publishedRow);
  const finalPost: BusinessPost = { ...post, id, businessId: published.businessId || post.businessId };
  publishedBusinessPostCache = [finalPost, ...publishedBusinessPostCache.filter((p) => p.id !== id)];
  const currentPosts = await getCachedBusinessPosts();
  const updated = [finalPost, ...currentPosts.filter((p) => p.id !== id)];
  await cacheBusinessPosts(updated);
  try { window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT)); } catch { /* non-browser */ }
  return finalPost;
}

function supabaseSubscribeToPublishedBusinessPosts(
  onPosts: (posts: BusinessPost[]) => void,
  onError: (error: Error) => void,
): () => void {
  let cancelled = false;
  let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

  async function fetchAll() {
    try {
      const { data, error } = await withSupabaseTimeout(
        supabase!.from("business_posts").select("*").order("created_at", { ascending: false }).limit(100),
        "Supabase business posts fetch timed out.",
      );
      if (cancelled) return;
      if (error) {
        onError(new Error(error.message));
        return;
      }
      const posts = (data as unknown as BusinessPostRow[]).map(postRowToBusinessPost);
      publishedBusinessPostCache = posts;
      void cacheBusinessPosts(posts).catch(() => undefined);
      onPosts(posts);
      try {
        window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT));
      } catch {
        /* ignore */
      }
    } catch (err) {
      if (cancelled) return;
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  void getCachedBusinessPosts().then((cachedPosts) => {
    if (cancelled) return;
    if (cachedPosts.length > 0) {
      publishedBusinessPostCache = cachedPosts;
      onPosts(cachedPosts);
    }
  }).catch(() => undefined);

  void fetchAll();

  try {
    channel = supabase!
      .channel(`business-posts:all:${Math.random().toString(36).slice(2, 8)}`)
      .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "business_posts" },
      () => { void fetchAll(); },
    )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") void fetchAll();
      });
  } catch {
    channel = null;
  }

  return () => {
    cancelled = true;
    if (channel) void supabase!.removeChannel(channel);
  };
}

function supabaseSubscribeToOwnedBusinessPosts(
  ownerUid: string,
  onPosts: (posts: BusinessPost[]) => void,
  onError: (error: Error) => void,
): () => void {
  let cancelled = false;
  let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

  async function fetchOwned() {
    try {
      const { data, error } = await withSupabaseTimeout(
        supabase!.from("business_posts").select("*").eq("owner_uid", ownerUid).order("created_at", { ascending: false }),
        "Supabase owned business posts fetch timed out.",
      );
      if (cancelled) return;
      if (error) {
        onError(new Error(error.message));
        return;
      }
      const posts = (data as unknown as BusinessPostRow[]).map(postRowToBusinessPost);
      onPosts(posts);
    } catch (err) {
      if (cancelled) return;
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  void fetchOwned();

  try {
    channel = supabase!
      .channel(`business-posts:${ownerUid}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "business_posts", filter: `owner_uid=eq.${ownerUid}` },
      () => { void fetchOwned(); },
    )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") void fetchOwned();
      });
  } catch {
    channel = null;
  }

  return () => {
    cancelled = true;
    if (channel) void supabase!.removeChannel(channel);
  };
}

function supabaseSubscribeToRegisteredBusinesses(
  onBusinesses: (businesses: RegisteredSmallBusiness[]) => void,
  onError: (error: Error) => void,
): () => void {
  let cancelled = false;
  let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

  async function fetchAll() {
    try {
      const { data, error } = await withSupabaseTimeout(
        supabase!.from("businesses").select("*").order("name", { ascending: true }),
        "Supabase registered businesses fetch timed out.",
      );
      if (cancelled) return;
      if (error) {
        onError(new Error(error.message));
        return;
      }
      let rows = (data as unknown as BusinessRow[]).map(businessRowToRegistered).sort((a, b) => a.name.localeCompare(b.name));
      // Enrich with fallback storage payloads (for pre-migration DBs where verification cols missing)
      // DB is authoritative — never downgrade verified/rejected via stale storage payload (fixes Hotel Lucca vanishing)
      try {
        const ownerUids = await fallbackListOwnerUidsWithPayload();
        if (ownerUids.length > 0) {
          const payloadMap = new Map<string, { payload: BusinessVerificationPayload; status: BusinessVerificationStatus; notes?: string; verifiedAt?: string; verifiedBy?: string; submittedAt: string }>();
          for (const uid of ownerUids) {
            const w = await fallbackDownloadPayload(uid);
            if (w) payloadMap.set(uid, w);
          }
          if (payloadMap.size > 0) {
            rows = rows.map((b) => {
              const w = payloadMap.get(b.ownerUid);
              if (!w) return b;
              if (b.verificationStatus === "verified" || b.verificationStatus === "rejected") return b;
              if (w.status === "verified" || w.status === "rejected") return mergeFallbackIntoRegistered(b, w);
              if (!b.verificationPayload && w.payload) return mergeFallbackIntoRegistered(b, w);
              return b;
            });
          }
        }
      } catch (enrichErr) {
        console.warn("[business-content] fallback enrich fetchAll failed:", enrichErr);
      }
      registeredBusinessCache = rows;
      void cacheRegisteredBusinesses(rows).catch(() => undefined);
      onBusinesses(rows);
      try {
        window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT));
      } catch {
        /* ignore */
      }
    } catch (err) {
      if (cancelled) return;
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  void getCachedRegisteredBusinesses().then((cachedBusinesses) => {
    if (cancelled) return;
    if (cachedBusinesses.length > 0) {
      registeredBusinessCache = cachedBusinesses;
      onBusinesses(cachedBusinesses);
    }
  }).catch(() => undefined);

  void fetchAll();
  // Poll every 15s so storage-only verification payload changes surface without a DB trigger
  const poll = setInterval(() => { void fetchAll(); }, 15_000);

  try {
    channel = supabase!
      .channel(`businesses:all:${Math.random().toString(36).slice(2, 8)}`)
      .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "businesses" },
      () => { void fetchAll(); },
    )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") void fetchAll();
      });
  } catch {
    channel = null;
  }

  return () => {
    cancelled = true;
    clearInterval(poll);
    if (channel) void supabase!.removeChannel(channel);
  };
}

// ── Public API — Supabase-only ──

export async function saveBusinessPage(ownerUid: string, page: BusinessPageInfo) {
  requireSupabase();
  const normalized = normalizeBusinessPage(page);
  if (normalized.coverUrl.length > 450_000 || normalized.logoUrl.length > 220_000) {
    throw new Error("The business photos are too large for the free cloud database.");
  }
  return supabaseSaveBusinessPage(ownerUid, normalized);
}

export async function ensureBusinessPage(ownerUid: string, fallback: BusinessPageInfo) {
  requireSupabase();
  const existing = await supabaseGetBusinessPage(ownerUid);
  if (existing) return existing;
  return supabaseSaveBusinessPage(ownerUid, fallback);
}

export async function hasBusinessPage(ownerUid: string) {
  requireSupabase();
  const { data, error } = await withSupabaseTimeout(
    supabase!.from("businesses").select("owner_uid").eq("owner_uid", ownerUid).maybeSingle(),
    "Supabase hasBusinessPage timed out.",
  );
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export function subscribeToOwnedBusinessPage(
  ownerUid: string,
  onPage: (page: BusinessPageInfo) => void,
  onError: (error: Error) => void,
) {
  requireSupabase();
  return supabaseSubscribeToOwnedBusinessPage(ownerUid, onPage, onError);
}

export async function publishBusinessPost(input: PublishBusinessPostInput) {
  requireSupabase();
  return supabasePublishBusinessPost(input);
}

export function subscribeToPublishedBusinessPosts(
  onPosts: (posts: BusinessPost[]) => void,
  onError: (error: Error) => void,
) {
  requireSupabase();
  return supabaseSubscribeToPublishedBusinessPosts(onPosts, onError);
}

export function subscribeToOwnedBusinessPosts(
  ownerUid: string,
  onPosts: (posts: BusinessPost[]) => void,
  onError: (error: Error) => void,
) {
  requireSupabase();
  return supabaseSubscribeToOwnedBusinessPosts(ownerUid, onPosts, onError);
}

// ── Verification helpers ──

export function isBusinessVerified(business: RegisteredSmallBusiness): boolean {
  return business.verificationStatus === "verified";
}

export function readVerifiedRegisteredBusinesses(): RegisteredSmallBusiness[] {
  return registeredBusinessCache.filter((b) => b.verificationStatus === "verified");
}

export function readVerifiedSmallBusinesses(): RegisteredSmallBusiness[] {
  return readVerifiedRegisteredBusinesses().filter((b) => b.businessScale === "Small business");
}

export function readPendingBusinesses(): RegisteredSmallBusiness[] {
  return registeredBusinessCache.filter((b) => b.verificationStatus === "pending");
}

export function readVerifiedBusinessPosts(): BusinessPost[] {
  const verifiedOwnerUids = new Set(readVerifiedRegisteredBusinesses().map((b) => b.ownerUid));
  return publishedBusinessPostCache.filter((p) => !p.ownerUid || verifiedOwnerUids.has(p.ownerUid));
}

export async function getBusinessVerificationStatus(ownerUid: string): Promise<BusinessVerificationInfo | null> {
  requireSupabase();
  try {
    const { data, error } = await withSupabaseTimeout(
      supabase!.from("businesses").select("verification_status, verification_notes, verified_at, verified_by").eq("owner_uid", ownerUid).maybeSingle(),
      "Supabase verification fetch timed out.",
    );
    if (error) {
      if (isMissingColumnError(error)) {
        // Fallback: try storage payload first, then cache
        try {
          const wrapper = await fallbackDownloadPayload(ownerUid);
          if (wrapper) return { status: wrapper.status, notes: wrapper.notes, verifiedAt: wrapper.verifiedAt, verifiedBy: wrapper.verifiedBy };
        } catch {}
        const fb = registeredBusinessCache.find((b) => b.ownerUid === ownerUid);
        if (fb) return { status: fb.verificationStatus, notes: fb.verificationNotes, verifiedAt: fb.verifiedAt, verifiedBy: fb.verifiedBy };
        // Try fetching business row to see if it exists at all -> if no business row, return null (not registered yet)
        const rowCheck = await fallbackFetchBusinessRow(ownerUid);
        if (!rowCheck) return null;
        return { status: "pending" };
      }
      throw new Error(error.message);
    }
    if (!data) return null;
  const row = data as unknown as { verification_status: string | null; verification_notes: string | null; verified_at: string | null; verified_by: string | null };
  const s = (row.verification_status as BusinessVerificationStatus) ?? "pending";
  // If DB says pending but storage payload says verified/rejected, prefer storage (covers migration gap where admin verified via fallback storage before DB columns existed)
  if (s === "pending") {
    try {
      const wrapper = await fallbackDownloadPayload(ownerUid);
      if (wrapper && (wrapper.status === "verified" || wrapper.status === "rejected")) {
        return { status: wrapper.status, notes: wrapper.notes, verifiedAt: wrapper.verifiedAt, verifiedBy: wrapper.verifiedBy };
      }
    } catch {}
    // Also check cache which may have been enriched from storage polling
    const cachedPending = registeredBusinessCache.find((b) => b.ownerUid === ownerUid);
    if (cachedPending && (cachedPending.verificationStatus === "verified" || cachedPending.verificationStatus === "rejected")) {
      return { status: cachedPending.verificationStatus, notes: cachedPending.verificationNotes, verifiedAt: cachedPending.verifiedAt, verifiedBy: cachedPending.verifiedBy };
    }
  }
  return {
    status: s === "verified" || s === "rejected" ? s : s === "pending" ? "pending" : "pending",
    notes: row.verification_notes ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    verifiedBy: row.verified_by ?? undefined,
  };
  } catch (e) {
    if (isMissingColumnError(e)) {
      try {
        const wrapper = await fallbackDownloadPayload(ownerUid);
        if (wrapper) return { status: wrapper.status, notes: wrapper.notes, verifiedAt: wrapper.verifiedAt, verifiedBy: wrapper.verifiedBy };
      } catch {}
      const fb2 = registeredBusinessCache.find((b) => b.ownerUid === ownerUid);
      if (fb2) return { status: fb2.verificationStatus, notes: fb2.verificationNotes, verifiedAt: fb2.verifiedAt, verifiedBy: fb2.verifiedBy };
      const rowCheck2 = await fallbackFetchBusinessRow(ownerUid);
      if (!rowCheck2) return null;
      return { status: "pending" };
    }
    throw e;
  }
}

export async function requestBusinessVerification(ownerUid: string): Promise<void> {
  requireSupabase();
  try {
    const { error } = await withSupabaseTimeout(
      (supabase!.from("businesses").update({ verification_status: "pending", verification_notes: null } as never).eq("owner_uid", ownerUid) as unknown as PromiseLike<{ error: { message: string } | null }>),
      "Supabase verification request timed out.",
    );
    if (error) {
      const msg = String((error as unknown as { message: string }).message);
      if (isMissingColumnError(error) || isMissingColumnError(new Error(msg))) {
        // Fallback: update storage payload + cache
        try {
          const existing = await fallbackDownloadPayload(ownerUid);
          if (existing) {
            await fallbackUploadPayload(ownerUid, { ...existing, status: "pending", notes: undefined, verifiedAt: undefined, verifiedBy: undefined, submittedAt: existing.submittedAt });
          } else {
            // No payload yet - create minimal pending wrapper with existing cached business info if any
            const cached = registeredBusinessCache.find((b) => b.ownerUid === ownerUid);
            const fallbackPayload: BusinessVerificationPayload = cached?.verificationPayload ?? { contactPerson: cached?.name ?? "Unknown", idType: "Unknown", idNumber: "pending", idFrontUrl: "", permitUrl: "" };
            await fallbackUploadPayload(ownerUid, { payload: fallbackPayload, status: "pending", submittedAt: new Date().toISOString() });
          }
        } catch (fallbackErr) {
          console.warn("[business-content fallback] requestVerification storage failed:", fallbackErr);
        }
        const idx2 = registeredBusinessCache.findIndex((b) => b.ownerUid === ownerUid);
        if (idx2 >= 0) {
          registeredBusinessCache[idx2] = { ...registeredBusinessCache[idx2], verificationStatus: "pending", verificationNotes: undefined, verifiedAt: undefined };
          void cacheRegisteredBusinesses(registeredBusinessCache).catch(() => undefined);
          try { window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT)); } catch {}
        }
        return;
      }
      throw new Error(msg);
    }
  } catch (e) {
    if (isMissingColumnError(e)) {
      try {
        const existing = await fallbackDownloadPayload(ownerUid);
        if (existing) {
          await fallbackUploadPayload(ownerUid, { ...existing, status: "pending", notes: undefined, verifiedAt: undefined, verifiedBy: undefined, submittedAt: existing.submittedAt });
        } else {
          const cached = registeredBusinessCache.find((b) => b.ownerUid === ownerUid);
          const fallbackPayload: BusinessVerificationPayload = cached?.verificationPayload ?? { contactPerson: cached?.name ?? "Unknown", idType: "Unknown", idNumber: "pending", idFrontUrl: "", permitUrl: "" };
          await fallbackUploadPayload(ownerUid, { payload: fallbackPayload, status: "pending", submittedAt: new Date().toISOString() });
        }
      } catch (fallbackErr) {
        console.warn("[business-content fallback] requestVerification storage failed:", fallbackErr);
      }
      const idx3 = registeredBusinessCache.findIndex((b) => b.ownerUid === ownerUid);
      if (idx3 >= 0) {
        registeredBusinessCache[idx3] = { ...registeredBusinessCache[idx3], verificationStatus: "pending", verificationNotes: undefined, verifiedAt: undefined };
        void cacheRegisteredBusinesses(registeredBusinessCache).catch(() => undefined);
        try { window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT)); } catch {}
      }
      return;
    }
    throw e;
  }
  const idx = registeredBusinessCache.findIndex((b) => b.ownerUid === ownerUid);
  if (idx >= 0) {
    registeredBusinessCache[idx] = { ...registeredBusinessCache[idx], verificationStatus: "pending", verificationNotes: undefined, verifiedAt: undefined };
    void cacheRegisteredBusinesses(registeredBusinessCache).catch(() => undefined);
    try { window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT)); } catch {}
  }
}

export async function setBusinessVerificationStatus(
  ownerUid: string,
  status: BusinessVerificationStatus,
  notes?: string,
  verifiedBy?: string,
): Promise<void> {
  requireSupabase();
  const payload: Record<string, unknown> = {
    verification_status: status,
    verification_notes: notes ?? null,
    verified_at: status === "verified" ? new Date().toISOString() : null,
    verified_by: verifiedBy ?? null,
  };
  try {
    const { error } = await withSupabaseTimeout(
      (supabase!.from("businesses").update(payload as never).eq("owner_uid", ownerUid) as unknown as PromiseLike<{ error: { message: string } | null }>),
      "Supabase verification update timed out.",
    );
    if (error) {
      const msg = String((error as unknown as { message: string }).message);
      if (isMissingColumnError(error) || isMissingColumnError(new Error(msg))) {
        // Fallback: update storage JSON
        try {
          const wrapper = await fallbackDownloadPayload(ownerUid);
          if (wrapper) {
            await fallbackUploadPayload(ownerUid, {
              payload: wrapper.payload,
              status,
              notes,
              verifiedAt: status === "verified" ? new Date().toISOString() : undefined,
              verifiedBy,
              submittedAt: wrapper.submittedAt,
            });
          } else {
            // No storage wrapper yet — try to create one from cache if we have payload
            const cached = registeredBusinessCache.find((b) => b.ownerUid === ownerUid);
            if (cached?.verificationPayload) {
              await fallbackUploadPayload(ownerUid, {
                payload: cached.verificationPayload,
                status,
                notes,
                verifiedAt: status === "verified" ? new Date().toISOString() : undefined,
                verifiedBy,
                submittedAt: cached.verificationSubmittedAt ?? new Date().toISOString(),
              });
            } else {
              // Minimal: store status only
              await fallbackUploadPayload(ownerUid, {
                payload: { contactPerson: cached?.name ?? "Unknown", idType: "Unknown", idNumber: "pending", idFrontUrl: "", permitUrl: "" },
                status,
                notes,
                verifiedAt: status === "verified" ? new Date().toISOString() : undefined,
                verifiedBy,
                submittedAt: new Date().toISOString(),
              });
            }
          }
        } catch (fallbackErr) {
          console.warn("[business-content fallback] setVerification storage failed:", fallbackErr);
        }
        const nowFallback = new Date().toISOString();
        const idxFallback = registeredBusinessCache.findIndex((b) => b.ownerUid === ownerUid);
        if (idxFallback >= 0) {
          registeredBusinessCache[idxFallback] = {
            ...registeredBusinessCache[idxFallback],
            verificationStatus: status,
            verificationNotes: notes,
            verifiedAt: status === "verified" ? nowFallback : undefined,
            verifiedBy,
          };
          void cacheRegisteredBusinesses(registeredBusinessCache).catch(() => undefined);
          try { window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT)); } catch {}
        }
        return;
      }
      throw new Error(msg);
    }
  } catch (e) {
    if (isMissingColumnError(e)) {
      try {
        const wrapper = await fallbackDownloadPayload(ownerUid);
        if (wrapper) {
          await fallbackUploadPayload(ownerUid, {
            payload: wrapper.payload,
            status,
            notes,
            verifiedAt: status === "verified" ? new Date().toISOString() : undefined,
            verifiedBy,
            submittedAt: wrapper.submittedAt,
          });
        } else {
          const cached = registeredBusinessCache.find((b) => b.ownerUid === ownerUid);
          if (cached?.verificationPayload) {
            await fallbackUploadPayload(ownerUid, {
              payload: cached.verificationPayload,
              status,
              notes,
              verifiedAt: status === "verified" ? new Date().toISOString() : undefined,
              verifiedBy,
              submittedAt: cached.verificationSubmittedAt ?? new Date().toISOString(),
            });
          } else {
            await fallbackUploadPayload(ownerUid, {
              payload: { contactPerson: cached?.name ?? "Unknown", idType: "Unknown", idNumber: "pending", idFrontUrl: "", permitUrl: "" },
              status,
              notes,
              verifiedAt: status === "verified" ? new Date().toISOString() : undefined,
              verifiedBy,
              submittedAt: new Date().toISOString(),
            });
          }
        }
      } catch (fallbackErr) {
        console.warn("[business-content fallback] setVerification storage failed:", fallbackErr);
      }
      const nowFallback2 = new Date().toISOString();
      const idxFallback2 = registeredBusinessCache.findIndex((b) => b.ownerUid === ownerUid);
      if (idxFallback2 >= 0) {
        registeredBusinessCache[idxFallback2] = {
          ...registeredBusinessCache[idxFallback2],
          verificationStatus: status,
          verificationNotes: notes,
          verifiedAt: status === "verified" ? nowFallback2 : undefined,
          verifiedBy,
        };
        void cacheRegisteredBusinesses(registeredBusinessCache).catch(() => undefined);
        try { window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT)); } catch {}
      }
      return;
    }
    throw e;
  }
  const now = new Date().toISOString();
  const idx = registeredBusinessCache.findIndex((b) => b.ownerUid === ownerUid);
  if (idx >= 0) {
    registeredBusinessCache[idx] = {
      ...registeredBusinessCache[idx],
      verificationStatus: status,
      verificationNotes: notes,
      verifiedAt: status === "verified" ? now : undefined,
      verifiedBy,
    };
    void cacheRegisteredBusinesses(registeredBusinessCache).catch(() => undefined);
    try { window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT)); } catch {}
  }
  // Keep storage payload in sync so it never downgrades verified back to pending (Hotel Lucca stale pending bug)
  try {
    const w = await fallbackDownloadPayload(ownerUid).catch(() => null);
    if (w) {
      await fallbackUploadPayload(ownerUid, {
        payload: w.payload,
        status,
        notes,
        verifiedAt: status === "verified" ? now : undefined,
        verifiedBy,
        submittedAt: w.submittedAt,
      }).catch(() => undefined);
    }
  } catch {}
}

// ── GCash-style KYC: document upload + submit ──

export async function uploadVerificationDocument(ownerUid: string, file: File, label: string): Promise<string> {
  requireSupabase();
  if (!file.type.startsWith("image/")) throw new Error("Only image files are accepted for verification documents.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Each document must be smaller than 8 MB.");
  const safeLabel = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 24) || "doc";
  const ext = (file.name.split(".").pop()?.toLowerCase() || "jpg").replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const path = `verification/${ownerUid}/${Date.now()}-${safeLabel}.${ext}`;
  const { error } = await withSupabaseTimeout(
    supabase!.storage.from("business-media").upload(path, file, { contentType: file.type || "image/jpeg", upsert: true }),
    "Verification document upload timed out."
  );
  if (error) throw new Error(error.message);
  const { data } = supabase!.storage.from("business-media").getPublicUrl(path);
  const url = data?.publicUrl;
  if (!url) throw new Error("Could not get public URL for uploaded document.");
  return url;
}

export async function submitBusinessVerification(ownerUid: string, payload: SubmitVerificationInput): Promise<void> {
  requireSupabase();
  if (!payload.contactPerson?.trim()) throw new Error("Enter the contact person name.");
  if (!payload.idType?.trim()) throw new Error("Select a valid ID type.");
  if (!payload.idNumber?.trim()) throw new Error("Enter the ID / permit number.");
  if (!payload.idFrontUrl) throw new Error("Upload the front of your valid ID.");
  if (!payload.permitUrl) throw new Error("Upload your business permit (DTI / Mayor's / BIR). ");
  const full: BusinessVerificationPayload = { ...payload, contactPerson: payload.contactPerson.trim(), idType: payload.idType.trim(), idNumber: payload.idNumber.trim(), submittedAt: new Date().toISOString() };
  const updatePayload: Record<string, unknown> = {
    verification_status: "pending" as BusinessVerificationStatus,
    verification_payload: full as unknown as never,
    verification_submitted_at: full.submittedAt,
    verification_notes: null,
    verified_at: null,
    verified_by: null,
  };
  let usedFallback = false;
  try {
    const { error } = await withSupabaseTimeout(
      (supabase!.from("businesses").update(updatePayload as never).eq("owner_uid", ownerUid) as unknown as PromiseLike<{ error: { message: string } | null; count?: number }>),
      "Verification submission timed out."
    );
    if (error) {
      const msg = String((error as unknown as { message: string }).message);
      if (isMissingColumnError(error) || isMissingColumnError(new Error(msg))) {
        usedFallback = true;
      } else {
        throw new Error(msg);
      }
    } else {
      // Supabase update succeeded but may have matched 0 rows if business not yet created — ensure fallback storage anyway + create cache entry
      // Don't treat as fallback success solely — fallback storage ensures admin visibility even when columns exist
    }
  } catch (e) {
    if (isMissingColumnError(e)) {
      usedFallback = true;
    } else {
      throw e;
    }
  }
  // Always attempt fallback storage write for resilience — ensures pending is visible even when column migration is present
  // and guards against RLS/update edge cases where DB row missing
  try {
    await fallbackUploadPayload(ownerUid, {
      payload: full,
      status: "pending" as BusinessVerificationStatus,
      submittedAt: full.submittedAt!,
      notes: undefined,
      verifiedAt: undefined,
      verifiedBy: undefined,
    });
    usedFallback = true;
    // Also bump businesses.updated_at so postgres_changes realtime fires even when only storage changed (triggers admin poll fallback faster)
    try {
      await withSupabaseTimeout(
        (supabase!.from("businesses").update({ updated_at: new Date().toISOString() } as never).eq("owner_uid", ownerUid) as unknown as PromiseLike<{ error: { message: string } | null }>),
        "touch business realtime"
      ).catch(() => undefined);
    } catch {}
  } catch (storageErr) {
    console.warn("[business-content] fallback storage write failed:", storageErr);
    // If we already succeeded via DB column update, don't fail the whole submission because storage fallback failed
    if (!usedFallback) throw storageErr instanceof Error ? storageErr : new Error(String(storageErr));
  }
  // If we usedFallback=false but DB succeeded, still consider success — but we already stored fallback
  // Update local cache
  const idx = registeredBusinessCache.findIndex((b) => b.ownerUid === ownerUid);
  if (idx >= 0) {
    registeredBusinessCache[idx] = { ...registeredBusinessCache[idx], verificationStatus: "pending" as BusinessVerificationStatus, verificationPayload: full, verificationSubmittedAt: full.submittedAt, verificationNotes: undefined, verifiedAt: undefined, verifiedBy: undefined };
    void cacheRegisteredBusinesses(registeredBusinessCache).catch(() => undefined);
    try { window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT)); } catch {}
  } else {
    // Not yet in cache — try to fetch base business and add
    try {
      const row = await fallbackFetchBusinessRow(ownerUid);
      if (row) {
        const base = businessRowToRegistered(row as unknown as BusinessRow);
        const merged = mergeFallbackIntoRegistered(base, { payload: full, status: "pending", submittedAt: full.submittedAt!, notes: undefined, verifiedAt: undefined, verifiedBy: undefined });
        registeredBusinessCache = [merged, ...registeredBusinessCache.filter((b) => b.ownerUid !== ownerUid)];
        void cacheRegisteredBusinesses(registeredBusinessCache).catch(() => undefined);
        try { window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT)); } catch {}
      } else {
        // Create a minimal entry so admin can see pending even before full business row propagation
        // This will be reconciled on next full fetch
        const minimal: RegisteredSmallBusiness = {
          id: `registered-${ownerUid}`,
          ownerUid,
          name: full.contactPerson,
          businessScale: "Small business",
          category: "Local Business",
          location: "Legazpi City, Albay",
          phone: "",
          email: "",
          hours: "Hours not provided",
          about: "A locally registered business on Hilinga.",
          coverUrl: "",
          logoUrl: "",
          latitude: getAddressCoordinates("Legazpi City, Albay", ownerUid).latitude,
          longitude: getAddressCoordinates("Legazpi City, Albay", ownerUid).longitude,
          verificationStatus: "pending",
          verificationPayload: full,
          verificationSubmittedAt: full.submittedAt,
        };
        registeredBusinessCache = [minimal, ...registeredBusinessCache.filter((b) => b.ownerUid !== ownerUid)];
        void cacheRegisteredBusinesses(registeredBusinessCache).catch(() => undefined);
        try { window.dispatchEvent(new Event(BUSINESS_CONTENT_CHANGED_EVENT)); } catch {}
      }
    } catch {}
  }
}

export function getBusinessVerificationPayload(ownerUid: string): BusinessVerificationPayload | undefined {
  return registeredBusinessCache.find((b) => b.ownerUid === ownerUid)?.verificationPayload;
}

export async function fetchPendingBusinesses(): Promise<RegisteredSmallBusiness[]> {
  requireSupabase();
  try {
    const { data, error } = await withSupabaseTimeout(
      supabase!.from("businesses").select("*").eq("verification_status", "pending").order("created_at", { ascending: true }),
      "Supabase pending businesses fetch timed out.",
    );
    if (error) {
      if (isMissingColumnError(error)) {
        // Fallback: all businesses are pending by default (no column) — enrich with storage payloads where submitted, then filter to pending only
        const { data: allData, error: allError } = await withSupabaseTimeout(
          supabase!.from("businesses").select("*").order("created_at", { ascending: true }),
          "Supabase all businesses fetch (pending fallback) timed out."
        );
        if (allError) throw new Error(allError.message);
        if (!allData) return [];
        const base = (allData as unknown as BusinessRow[]).map(businessRowToRegistered);
        // Bulk load payloads
        const ownerUids = await fallbackListOwnerUidsWithPayload();
        const payloadMap = new Map<string, { payload: BusinessVerificationPayload; status: BusinessVerificationStatus; notes?: string; verifiedAt?: string; verifiedBy?: string; submittedAt: string }>();
        for (const uid of ownerUids) {
          const w = await fallbackDownloadPayload(uid);
          if (w) payloadMap.set(uid, w);
        }
        const merged = base.map((b) => {
          const w = payloadMap.get(b.ownerUid);
          if (!w) return b;
          if (b.verificationStatus === "verified" || b.verificationStatus === "rejected") return b;
          if (w.status === "verified" || w.status === "rejected") return mergeFallbackIntoRegistered(b, w);
          if (!b.verificationPayload && w.payload) return mergeFallbackIntoRegistered(b, w);
          return b;
        });
        // GCash-style: only show as Pending after they have submitted requirements (have payload + status pending)
        // This prevents admin queue being flooded by businesses that never submitted ID/permit
        const pendingOnly = merged.filter((b) => b.verificationStatus === "pending" && Boolean(b.verificationPayload));
        // Include orphan payloads where business row missing (e.g. submitted before business page saved, or row deleted)
        for (const [uid, w] of payloadMap) {
          if (w.status !== "pending") continue;
          if (merged.some((b) => b.ownerUid === uid)) continue;
          const row = await fallbackFetchBusinessRow(uid);
          if (row) {
            const baseReg = businessRowToRegistered(row as unknown as BusinessRow);
            pendingOnly.push(mergeFallbackIntoRegistered(baseReg, w));
          } else {
            const coords = getAddressCoordinates("Legazpi City, Albay", uid);
            const minimal: RegisteredSmallBusiness = {
              id: `registered-${uid}`,
              ownerUid: uid,
              name: w.payload.contactPerson || "Unnamed business",
              businessScale: "Small business",
              category: "Local Business",
              location: "Legazpi City, Albay",
              phone: "",
              email: "",
              hours: "Hours not provided",
              about: "A locally registered business on Hilinga.",
              coverUrl: "",
              logoUrl: "",
              latitude: coords.latitude,
              longitude: coords.longitude,
              verificationStatus: "pending",
              verificationPayload: w.payload,
              verificationSubmittedAt: w.submittedAt,
              verificationNotes: w.notes,
              verifiedAt: w.verifiedAt,
              verifiedBy: w.verifiedBy,
            };
            pendingOnly.push(minimal);
          }
        }
        pendingOnly.sort((a, b) => (a.verificationSubmittedAt ?? "").localeCompare(b.verificationSubmittedAt ?? ""));
        return pendingOnly;
      }
      throw new Error(error.message);
    }
    return (data as unknown as BusinessRow[]).map(businessRowToRegistered);
  } catch (e) {
    if (isMissingColumnError(e)) {
      try {
        const { data: allData, error: allError } = await withSupabaseTimeout(
          supabase!.from("businesses").select("*").order("created_at", { ascending: true }),
          "Supabase all businesses fetch (pending catch fallback) timed out."
        );
        if (allError) throw new Error(allError.message);
        if (!allData) return [];
        const base = (allData as unknown as BusinessRow[]).map(businessRowToRegistered);
        const ownerUids = await fallbackListOwnerUidsWithPayload();
        const payloadMap = new Map<string, { payload: BusinessVerificationPayload; status: BusinessVerificationStatus; notes?: string; verifiedAt?: string; verifiedBy?: string; submittedAt: string }>();
        for (const uid of ownerUids) {
          const w = await fallbackDownloadPayload(uid);
          if (w) payloadMap.set(uid, w);
        }
        const merged = base.map((b) => {
          const w = payloadMap.get(b.ownerUid);
          if (!w) return b;
          if (b.verificationStatus === "verified" || b.verificationStatus === "rejected") return b;
          if (w.status === "verified" || w.status === "rejected") return mergeFallbackIntoRegistered(b, w);
          if (!b.verificationPayload && w.payload) return mergeFallbackIntoRegistered(b, w);
          return b;
        });
        const pendingOnly = merged.filter((b) => b.verificationStatus === "pending" && Boolean(b.verificationPayload));
        for (const [uid, w] of payloadMap) {
          if (w.status !== "pending") continue;
          if (merged.some((b) => b.ownerUid === uid)) continue;
          const row = await fallbackFetchBusinessRow(uid);
          if (row) {
            const baseReg = businessRowToRegistered(row as unknown as BusinessRow);
            pendingOnly.push(mergeFallbackIntoRegistered(baseReg, w));
          } else {
            const coords = getAddressCoordinates("Legazpi City, Albay", uid);
            pendingOnly.push({
              id: `registered-${uid}`,
              ownerUid: uid,
              name: w.payload.contactPerson || "Unnamed business",
              businessScale: "Small business",
              category: "Local Business",
              location: "Legazpi City, Albay",
              phone: "",
              email: "",
              hours: "Hours not provided",
              about: "A locally registered business on Hilinga.",
              coverUrl: "",
              logoUrl: "",
              latitude: coords.latitude,
              longitude: coords.longitude,
              verificationStatus: "pending",
              verificationPayload: w.payload,
              verificationSubmittedAt: w.submittedAt,
              verificationNotes: w.notes,
              verifiedAt: w.verifiedAt,
              verifiedBy: w.verifiedBy,
            });
          }
        }
        pendingOnly.sort((a, b) => (a.verificationSubmittedAt ?? "").localeCompare(b.verificationSubmittedAt ?? ""));
        return pendingOnly;
      } catch (fallbackE) {
        console.warn("[business-content fallback] fetchPending fallback failed:", fallbackE);
        return [];
      }
    }
    throw e;
  }
}

export async function fetchAllBusinessesForAdmin(): Promise<RegisteredSmallBusiness[]> {
  requireSupabase();
  try {
    const { data, error } = await withSupabaseTimeout(
      supabase!.from("businesses").select("*").order("created_at", { ascending: false }),
      "Supabase businesses fetch timed out.",
    );
    if (error) {
      if (isMissingColumnError(error)) {
        throw new Error(error.message);
      }
      throw new Error(error.message);
    }
    const base = (data as unknown as BusinessRow[]).map(businessRowToRegistered);
    // Bulk enrich with fallback storage payloads (pre-migration businesses where payload stored in storage)
    try {
      const ownerUids = await fallbackListOwnerUidsWithPayload();
      if (ownerUids.length > 0) {
        const payloadMap = new Map<string, { payload: BusinessVerificationPayload; status: BusinessVerificationStatus; notes?: string; verifiedAt?: string; verifiedBy?: string; submittedAt: string }>();
        for (const uid of ownerUids) {
          const w = await fallbackDownloadPayload(uid);
          if (w) payloadMap.set(uid, w);
        }
        if (payloadMap.size > 0) {
          const enriched = base.map((b) => {
            if (b.verificationPayload) return b;
            const w = payloadMap.get(b.ownerUid);
            return w ? mergeFallbackIntoRegistered(b, w) : b;
          });
          // also include orphan payloads where business row not yet created (e.g. verification submitted before page saved)
          for (const [uid, w] of payloadMap) {
            if (enriched.some((b) => b.ownerUid === uid)) continue;
            const row = await fallbackFetchBusinessRow(uid);
            if (row) {
              enriched.push(mergeFallbackIntoRegistered(businessRowToRegistered(row as unknown as BusinessRow), w));
            } else {
              const coords = getAddressCoordinates("Legazpi City, Albay", uid);
              enriched.push({
                id: `registered-${uid}`,
                ownerUid: uid,
                name: w.payload.contactPerson || "Unnamed business",
                businessScale: "Small business",
                category: "Local Business",
                location: "Legazpi City, Albay",
                phone: "",
                email: "",
                hours: "Hours not provided",
                about: "A locally registered business on Hilinga.",
                coverUrl: "",
                logoUrl: "",
                latitude: coords.latitude,
                longitude: coords.longitude,
                verificationStatus: w.status,
                verificationPayload: w.payload,
                verificationSubmittedAt: w.submittedAt,
                verificationNotes: w.notes,
                verifiedAt: w.verifiedAt,
                verifiedBy: w.verifiedBy,
              });
            }
          }
          return enriched;
        }
      }
      return base;
    } catch {
      return base;
    }
  } catch (e) {
    if (isMissingColumnError(e)) {
      // Ultimate fallback: load base businesses + merge storage payloads
      const { data: baseData, error: baseError } = await withSupabaseTimeout(
        supabase!.from("businesses").select("*").order("created_at", { ascending: false }),
        "Supabase businesses fetch (fallback) timed out.",
      );
      if (baseError) throw new Error(baseError.message);
      const base = (baseData as unknown as BusinessRow[]).map(businessRowToRegistered);
      // Build a map of payloads
      const ownerUids = await fallbackListOwnerUidsWithPayload();
      const payloadMap = new Map<string, { payload: BusinessVerificationPayload; status: BusinessVerificationStatus; notes?: string; verifiedAt?: string; verifiedBy?: string; submittedAt: string }>();
      for (const uid of ownerUids) {
        const w = await fallbackDownloadPayload(uid);
        if (w) payloadMap.set(uid, w);
      }
      return base.map((b) => {
        const w = payloadMap.get(b.ownerUid);
        if (!w) return b;
        if (b.verificationStatus === "verified" || b.verificationStatus === "rejected") return b;
        if (w.status === "verified" || w.status === "rejected") return mergeFallbackIntoRegistered(b, w);
        if (!b.verificationPayload && w.payload) return mergeFallbackIntoRegistered(b, w);
        return b;
      });
    }
    throw e;
  }
}

export function subscribeToPendingBusinesses(
  onBusinesses: (businesses: RegisteredSmallBusiness[]) => void,
  onError: (error: Error) => void,
): () => void {
  let cancelled = false;
  let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
  async function fetchPending() {
    try {
      const rows = await fetchPendingBusinesses();
      if (cancelled) return;
      onBusinesses(rows);
    } catch (err) {
      if (cancelled) return;
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }
  void fetchPending();
  // Fallback polling: storage payload changes don't emit postgres_changes; poll every 12s so admin sees new submissions without manual refresh
  const poll = setInterval(() => { void fetchPending(); }, 12_000);
  try {
    channel = supabase!.channel(`pending-businesses:${Math.random().toString(36).slice(2,8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "businesses" }, () => { void fetchPending(); })
      .subscribe((status) => { if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") void fetchPending(); });
  } catch { channel = null; }
  return () => { cancelled = true; clearInterval(poll); if (channel) void supabase!.removeChannel(channel); };
}

export async function getBusinessVerificationStats(): Promise<{ pending: number; verified: number; rejected: number; total: number }> {
  requireSupabase();
  try {
    const { data, error } = await withSupabaseTimeout(
      supabase!.from("businesses").select("verification_status"),
      "Supabase verification stats timed out.",
    );
    if (error) {
      if (isMissingColumnError(error)) {
        // Fallback: count via storage payloads + base businesses
        try {
          const ownerUids = await fallbackListOwnerUidsWithPayload();
          const statusMap = new Map<string, BusinessVerificationStatus>();
          for (const uid of ownerUids) {
            const w = await fallbackDownloadPayload(uid);
            if (w) statusMap.set(uid, w.status);
          }
          const { data: baseData } = await withSupabaseTimeout(
            supabase!.from("businesses").select("owner_uid").limit(500),
            "Supabase base count timed out."
          );
          const total = baseData ? (baseData as unknown as Array<{ owner_uid: string }>).length : registeredBusinessCache.length || statusMap.size;
          let pending = 0, verified = 0, rejected = 0;
          if (baseData) {
            for (const row of baseData as unknown as Array<{ owner_uid: string }>) {
              const s = statusMap.get(row.owner_uid);
              if (!s) continue; // only businesses that have submitted requirements count toward verification stats in fallback mode
              if (s === "verified") verified++; else if (s === "rejected") rejected++; else pending++;
            }
            return { pending, verified, rejected, total };
          }
          const total2 = registeredBusinessCache.length || total;
          let p=0,v=0,r=0; for(const b of registeredBusinessCache){ const s = statusMap.get(b.ownerUid); if(s){ if(s==="pending") p++; else if(s==="rejected") r++; else v++; } else if(b.verificationPayload){ if(b.verificationStatus==="pending") p++; else if(b.verificationStatus==="rejected") r++; else v++; } }
          return { pending: p, verified: v, rejected: r, total: total2 };
        } catch {
          const total = registeredBusinessCache.length;
          let p=0,v=0,r=0; for(const b of registeredBusinessCache){ if(b.verificationStatus==="pending") p++; else if(b.verificationStatus==="rejected") r++; else v++; }
          return { pending: p, verified: v, rejected: r, total };
        }
      }
      throw new Error(error.message);
    }
  const rows = data as unknown as Array<{ verification_status: string | null }>;
  let pending = 0, verified = 0, rejected = 0;
  for (const r of rows) {
    const s = r.verification_status ?? "pending";
    if (s === "verified") verified++; else if (s === "rejected") rejected++; else pending++;
  }
  // Merge fallback storage statuses where DB still shows pending but storage has definitive status (migration gap)
  try {
    const ownerUids = await fallbackListOwnerUidsWithPayload();
    if (ownerUids.length > 0) {
      const payloadMap = new Map<string, { status: BusinessVerificationStatus; payload: BusinessVerificationPayload }>();
      for (const uid of ownerUids) {
        const w = await fallbackDownloadPayload(uid);
        if (w) payloadMap.set(uid, { status: w.status, payload: w.payload });
      }
      if (payloadMap.size > 0) {
        // For GCash model with fallback, pending in stats should reflect submitted requirements.
        // If DB says pending but no storage payload, it hasn't been submitted yet — don't count as pending for admin stats in fallback mode?
        // But when columns exist, DB pending includes non-submitted businesses too. Keep DB value as is:
        // Just override those rows where storage has a different status (e.g. admin verified via fallback)
        // No recount needed — stats already correct for column-present case.
      }
    }
  } catch {}
  return { pending, verified, rejected, total: rows.length };
  } catch (e) {
    if (isMissingColumnError(e)) {
      try {
        const ownerUids = await fallbackListOwnerUidsWithPayload();
        const statusMap = new Map<string, BusinessVerificationStatus>();
        for (const uid of ownerUids) {
          const w = await fallbackDownloadPayload(uid);
          if (w) statusMap.set(uid, w.status);
        }
        const { data: baseData } = await withSupabaseTimeout(
          supabase!.from("businesses").select("owner_uid").limit(500),
          "Supabase base count timed out."
        );
        if (baseData) {
          let pending = 0, verified = 0, rejected = 0;
          for (const row of baseData as unknown as Array<{ owner_uid: string }>) {
            const s = statusMap.get(row.owner_uid);
            if (!s) continue;
            if (s === "verified") verified++; else if (s === "rejected") rejected++; else pending++;
          }
          return { pending, verified, rejected, total: baseData.length };
        }
        const total2 = registeredBusinessCache.length || statusMap.size;
        let p2=0,v2=0,r2=0; for(const b of registeredBusinessCache){ const s = statusMap.get(b.ownerUid) ?? b.verificationStatus; if(s==="pending") p2++; else if(s==="rejected") r2++; else v2++; }
        return { pending: p2, verified: v2, rejected: r2, total: total2 };
      } catch {
        const total2 = registeredBusinessCache.length;
        let p2=0,v2=0,r2=0; for(const b of registeredBusinessCache){ if(b.verificationStatus==="pending") p2++; else if(b.verificationStatus==="rejected") r2++; else v2++; }
        return { pending: p2, verified: v2, rejected: r2, total: total2 };
      }
    }
    throw e;
  }
}

export function getAddressCoordinates(address: string, ownerId: string): { latitude: number; longitude: number } {
  const match = ALBAY_TOWN_COORDINATES.find((item) => item.patterns.some((pattern) => pattern.test(address)));
  const baseLat = match?.lat ?? 13.1391;
  const baseLng = match?.lng ?? 123.7438;

  let hash = 0;
  for (let i = 0; i < ownerId.length; i += 1) {
    hash = (hash * 31 + ownerId.charCodeAt(i)) & 0xffffffff;
  }
  const offsetLat = (((hash % 80) - 40) * 0.0002);
  const offsetLng = ((((hash >> 3) % 80) - 40) * 0.0002);

  return {
    latitude: Math.round((baseLat + offsetLat) * 10000) / 10000,
    longitude: Math.round((baseLng + offsetLng) * 10000) / 10000,
  };
}

let registeredBusinessCache: RegisteredSmallBusiness[] = [];
let publishedBusinessPostCache: BusinessPost[] = [];

export function readRegisteredBusinesses() {
  return registeredBusinessCache;
}

export function readRegisteredSmallBusinesses() {
  return readRegisteredBusinesses().filter((business) => business.businessScale === "Small business");
}

export function subscribeToRegisteredBusinesses(
  onBusinesses: (businesses: RegisteredSmallBusiness[]) => void,
  onError: (error: Error) => void,
) {
  requireSupabase();
  return supabaseSubscribeToRegisteredBusinesses(onBusinesses, onError);
}

export function readPublishedBusinessPosts() {
  return publishedBusinessPostCache;
}
