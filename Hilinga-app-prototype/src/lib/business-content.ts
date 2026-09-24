import { isSupabaseConfigured, supabase, withSupabaseTimeout } from "@/lib/supabase";
import {
  cacheBusinessPosts,
  getCachedBusinessPosts,
  cacheRegisteredBusinesses,
  getCachedRegisteredBusinesses,
} from "@/lib/cache-service";

export type BusinessPostCategory = "Photos & Videos" | "Events" | "Promotions";

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
  return {
    id: `registered-${ownerUid}`,
    ownerUid,
    ...page,
    latitude: coords.latitude,
    longitude: coords.longitude,
  };
}

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.");
  }
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
      const rows = (data as unknown as BusinessRow[]).map(businessRowToRegistered).sort((a, b) => a.name.localeCompare(b.name));
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
      onBusinesses(cachedBusinesses);
    }
  }).catch(() => undefined);

  void fetchAll();

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

function toBusinessPost(id: string, value: Omit<BusinessPost, "id">): BusinessPost {
  return { ...value, id };
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
