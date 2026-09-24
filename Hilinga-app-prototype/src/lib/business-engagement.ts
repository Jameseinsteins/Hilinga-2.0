import { isSupabaseConfigured, supabase, withSupabaseTimeout } from "@/lib/supabase";
import {
  addCachedBusinessInquiry,
  cacheGetAll,
  deleteCachedBusinessInquiry,
  getCachedBusinessInquiries,
  subscribeToCachedInquiries,
  updateCachedInquiryStatus,
  type CachedBusinessInquiry,
} from "@/lib/cache-service";

export type BusinessInquiryStatus = "unread" | "read";

export type BusinessInquiry = {
  id: string;
  businessId: string;
  businessName: string;
  senderUid: string;
  senderName: string;
  senderEmail: string;
  message: string;
  status: BusinessInquiryStatus;
  createdAt: Date;
  updatedAt: Date;
};

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.");
  }
}

// ── Supabase types ──

type SupabaseInquiryRow = {
  id: string;
  business_id: string;
  business_name: string;
  sender_uid: string;
  sender_name: string;
  sender_email: string;
  message: string;
  status: BusinessInquiryStatus;
  created_at: string;
  updated_at: string;
};

function rowToInquiry(row: SupabaseInquiryRow): BusinessInquiry {
  return {
    id: row.id,
    businessId: row.business_id,
    businessName: row.business_name,
    senderUid: row.sender_uid,
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    message: row.message,
    status: row.status === "read" ? "read" : "unread",
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toCachedDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function cachedToInquiry(c: CachedBusinessInquiry): BusinessInquiry {
  return {
    id: c.id,
    businessId: c.businessId,
    businessName: c.businessName,
    senderUid: c.senderUid,
    senderName: c.senderName,
    senderEmail: c.senderEmail,
    message: c.message,
    status: c.status,
    createdAt: toCachedDate(c.createdAt),
    updatedAt: toCachedDate(c.updatedAt),
  };
}

function isOfflineError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("timed out");
}

async function supabaseSend(input: {
  businessId: string;
  businessName: string;
  senderUid: string;
  senderName: string;
  senderEmail: string;
  message: string;
}) {
  const { error } = await withSupabaseTimeout(
    supabase!.from("business_inquiries").insert({
      business_id: input.businessId,
      business_name: input.businessName.trim(),
      sender_uid: input.senderUid,
      sender_name: input.senderName.trim().slice(0, 80),
      sender_email: input.senderEmail.trim().slice(0, 160),
      message: input.message.trim(),
      status: "unread",
    } as never),
    "Supabase inquiry send timed out.",
  );
  if (error) throw new Error(error.message);
}

function supabaseSubscribe(
  businessId: string,
  onInquiries: (items: BusinessInquiry[]) => void,
  onError: (error: Error) => void,
): () => void {
  let cancelled = false;
  let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

  async function fetchAll() {
    const { data, error } = await withSupabaseTimeout(
      supabase!
        .from("business_inquiries")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(100),
      "Supabase inquiry fetch timed out.",
    );
    if (cancelled) return;
    if (error) {
      onError(new Error(error.message));
      return;
    }
    onInquiries((data as SupabaseInquiryRow[]).map(rowToInquiry));
  }

  void fetchAll();

  try {
    channel = supabase!
      .channel(`bi:${businessId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "business_inquiries", filter: `business_id=eq.${businessId}` },
        () => {
          void fetchAll();
        },
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

async function supabaseSetStatus(inquiryId: string, status: BusinessInquiryStatus) {
  const { error } = await withSupabaseTimeout(
    supabase!.from("business_inquiries").update({ status } as never).eq("id", inquiryId),
    "Supabase inquiry status update timed out.",
  );
  if (error) throw new Error(error.message);
}

async function supabaseDelete(inquiryId: string) {
  const { error } = await withSupabaseTimeout(
    supabase!.from("business_inquiries").delete().eq("id", inquiryId),
    "Supabase inquiry delete timed out.",
  );
  if (error) throw new Error(error.message);
}

// ── Public API — Supabase-only (IndexedDB offline fallback, no Firestore) ──

export async function sendBusinessInquiry(input: {
  businessId: string;
  businessName: string;
  senderUid: string;
  senderName: string;
  senderEmail: string;
  message: string;
}) {
  const message = input.message.trim();
  if (message.length < 10) throw new Error("Write at least 10 characters so the business can help you.");
  if (message.length > 1500) throw new Error("Keep your message under 1,500 characters.");

  requireSupabase();
  try {
    await supabaseSend({ ...input, message });
    return;
  } catch (error) {
    if (!isOfflineError(error)) throw error;
    // Offline: cache locally so the inquiry isn't lost; will sync when online
    const now = new Date().toISOString();
    await addCachedBusinessInquiry({
      id: crypto.randomUUID(),
      businessId: input.businessId,
      businessName: input.businessName.trim(),
      senderUid: input.senderUid,
      senderName: input.senderName.trim().slice(0, 80),
      senderEmail: input.senderEmail.trim().slice(0, 160),
      message,
      status: "unread",
      createdAt: now,
      updatedAt: now,
    });
  }
}

export function subscribeToBusinessInquiries(
  businessId: string,
  onInquiries: (items: BusinessInquiry[]) => void,
  onError: (error: Error) => void,
) {
  requireSupabase();

  // Supabase realtime with local-cache warm start for offline
  let localUnsubscribe: (() => void) | null = null;
  let supabaseUnsubscribe: (() => void) | null = null;
  let hasReceivedSupabase = false;

  void getCachedBusinessInquiries(businessId).then((cached) => {
    if (hasReceivedSupabase) return;
    if (cached.length > 0) {
      onInquiries(cached.map(cachedToInquiry).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
    }
  }).catch(() => undefined);

  // Also watch local cache for offline-sent inquiries
  localUnsubscribe = subscribeToCachedInquiries(businessId, (cached) => {
    if (hasReceivedSupabase) return;
    if (cached.length > 0) {
      onInquiries(cached.map(cachedToInquiry).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
    }
  });

  supabaseUnsubscribe = supabaseSubscribe(
    businessId,
    (items) => {
      hasReceivedSupabase = true;
      onInquiries(items);
    },
    onError,
  );

  return () => {
    if (localUnsubscribe) localUnsubscribe();
    if (supabaseUnsubscribe) supabaseUnsubscribe();
  };
}

export async function setBusinessInquiryStatus(inquiryId: string, status: BusinessInquiryStatus, businessId?: string) {
  requireSupabase();
  try {
    await supabaseSetStatus(inquiryId, status);
    return;
  } catch (error) {
    if (!isOfflineError(error)) throw error;
  }
  if (businessId) {
    await updateCachedInquiryStatus(businessId, inquiryId, status);
    return;
  }
  const allBuckets = await cacheGetAll<CachedBusinessInquiry[]>("business-inquiries");
  for (const bucket of allBuckets) {
    const found = bucket.find((i) => i.id === inquiryId);
    if (found) {
      await updateCachedInquiryStatus(found.businessId, inquiryId, status);
      return;
    }
  }
  throw new Error("Message not found locally.");
}

export async function deleteBusinessInquiry(inquiryId: string, businessId?: string) {
  requireSupabase();
  try {
    await supabaseDelete(inquiryId);
    return;
  } catch (error) {
    if (!isOfflineError(error)) throw error;
  }
  if (businessId) {
    await deleteCachedBusinessInquiry(businessId, inquiryId);
    return;
  }
  const allBuckets2 = await cacheGetAll<CachedBusinessInquiry[]>("business-inquiries");
  for (const bucket of allBuckets2) {
    const found = bucket.find((i) => i.id === inquiryId);
    if (found) {
      await deleteCachedBusinessInquiry(found.businessId, inquiryId);
      return;
    }
  }
}

// ── Likes / Views — Supabase-only ──

type SupabaseLikeRow = {
  post_id: string;
  user_id: string;
  created_at: string | null;
};

type SupabaseViewRow = {
  business_id: string;
  viewer_uid: string;
  viewed_at: string | null;
};

function supabaseSubscribeToLikedBusinessPosts(
  userId: string,
  onLikedIds: (postIds: Set<string>) => void,
  onError: (error: Error) => void,
): () => void {
  let cancelled = false;
  let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

  async function fetchAll() {
    try {
      const { data, error } = await withSupabaseTimeout(
        supabase!.from("business_post_likes").select("post_id").eq("user_id", userId).limit(500),
        "Supabase liked posts fetch timed out.",
      );
      if (cancelled) return;
      if (error) {
        onError(new Error(error.message));
        return;
      }
      const rows = (data as SupabaseLikeRow[]) ?? [];
      onLikedIds(new Set(rows.map((r) => String(r.post_id || "")).filter(Boolean)));
    } catch (err) {
      if (cancelled) return;
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  void fetchAll();

  try {
    channel = supabase!
      .channel(`bpl:${userId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "business_post_likes", filter: `user_id=eq.${userId}` },
        () => {
          void fetchAll();
        },
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

async function supabaseSetBusinessPostLiked(postId: string, userId: string, liked: boolean) {
  if (!liked) {
    const { error } = await withSupabaseTimeout(
      supabase!.from("business_post_likes").delete().eq("post_id", postId).eq("user_id", userId),
      "Supabase unlike timed out.",
    );
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await withSupabaseTimeout(
    supabase!.from("business_post_likes").upsert({ post_id: postId, user_id: userId } as never, {
      onConflict: "post_id,user_id",
    }),
    "Supabase like timed out.",
  );
  if (error) throw new Error(error.message);
}

async function supabaseRecordBusinessProfileView(input: {
  businessId: string;
  businessName: string;
  viewerUid: string;
}) {
  const { error } = await withSupabaseTimeout(
    supabase!.from("business_profile_views").upsert(
      {
        business_id: input.businessId,
        viewer_uid: input.viewerUid,
        viewed_at: new Date().toISOString(),
      } as never,
      { onConflict: "business_id,viewer_uid" },
    ),
    "Supabase profile view timed out.",
  );
  if (error) throw new Error(error.message);
}

function supabaseSubscribeToBusinessProfileViewCount(
  businessId: string,
  onCount: (count: number) => void,
  onError: (error: Error) => void,
): () => void {
  let cancelled = false;
  let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

  async function fetchCount() {
    try {
      const { data, error } = await withSupabaseTimeout(
        supabase!.from("business_profile_views").select("business_id").eq("business_id", businessId).limit(1000),
        "Supabase profile view count fetch timed out.",
      );
      if (cancelled) return;
      if (error) {
        onError(new Error(error.message));
        return;
      }
      const rows = (data as SupabaseViewRow[]) ?? [];
      onCount(rows.length);
    } catch (err) {
      if (cancelled) return;
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  void fetchCount();

  try {
    channel = supabase!
      .channel(`bpv:${businessId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "business_profile_views", filter: `business_id=eq.${businessId}` },
        () => {
          void fetchCount();
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") void fetchCount();
      });
  } catch {
    channel = null;
  }

  return () => {
    cancelled = true;
    if (channel) void supabase!.removeChannel(channel);
  };
}

export function subscribeToLikedBusinessPosts(
  userId: string,
  onLikedIds: (postIds: Set<string>) => void,
  onError: (error: Error) => void,
) {
  requireSupabase();
  return supabaseSubscribeToLikedBusinessPosts(userId, onLikedIds, onError);
}

export async function setBusinessPostLiked(postId: string, userId: string, liked: boolean) {
  requireSupabase();
  await supabaseSetBusinessPostLiked(postId, userId, liked);
}

export async function recordBusinessProfileView(input: {
  businessId: string;
  businessName: string;
  viewerUid: string;
}) {
  requireSupabase();
  await supabaseRecordBusinessProfileView(input);
}

export function subscribeToBusinessProfileViewCount(
  businessId: string,
  onCount: (count: number) => void,
  onError: (error: Error) => void,
) {
  requireSupabase();
  return supabaseSubscribeToBusinessProfileViewCount(businessId, onCount, onError);
}
