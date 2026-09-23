import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";

import { firestore } from "@/lib/firebase";
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

const inquiries = collection(firestore, "businessInquiries");
const likes = collection(firestore, "businessPostLikes");
const profileViews = collection(firestore, "businessProfileViews");

function timestampDate(value: unknown) {
  return value && typeof (value as Timestamp).toDate === "function"
    ? (value as Timestamp).toDate()
    : new Date(0);
}

function toInquiry(id: string, value: Record<string, unknown>): BusinessInquiry {
  return {
    id,
    businessId: String(value.businessId || ""),
    businessName: String(value.businessName || "Hilinga business"),
    senderUid: String(value.senderUid || ""),
    senderName: String(value.senderName || "Hilinga traveler"),
    senderEmail: String(value.senderEmail || ""),
    message: String(value.message || ""),
    status: value.status === "read" ? "read" : "unread",
    createdAt: timestampDate(value.createdAt),
    updatedAt: timestampDate(value.updatedAt),
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

function isFirestoreUnavailable(error: unknown) {
  const code = (error as { code?: string })?.code || "";
  const msg = error instanceof Error ? error.message : String(error);
  return (
    code === "unavailable" ||
    code === "failed-precondition" ||
    msg.includes("PERMISSION_DENIED") ||
    msg.includes("Firestore API has not been used") ||
    msg.includes("Cloud Firestore API")
  );
}

// ── Supabase adapter (free, realtime) ──

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

async function supabaseSend(input: {
  businessId: string;
  businessName: string;
  senderUid: string;
  senderName: string;
  senderEmail: string;
  message: string;
}) {
  const { error } = await withSupabaseTimeout(supabase!.from("business_inquiries").insert({
    business_id: input.businessId,
    business_name: input.businessName.trim(),
    sender_uid: input.senderUid,
    sender_name: input.senderName.trim().slice(0, 80),
    sender_email: input.senderEmail.trim().slice(0, 160),
    message: input.message.trim(),
    status: "unread",
  } as never), "Supabase inquiry send timed out.");
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
    const { data, error } = await withSupabaseTimeout(supabase!
      .from("business_inquiries")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(100), "Supabase inquiry fetch timed out.");
    if (cancelled) return;
    if (error) { onError(new Error(error.message)); return; }
    onInquiries((data as SupabaseInquiryRow[]).map(rowToInquiry));
  }

  void fetchAll();

  try {
    channel = supabase!
      .channel(`bi:${businessId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "business_inquiries", filter: `business_id=eq.${businessId}` },
        () => { void fetchAll(); },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          void fetchAll();
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

async function supabaseSetStatus(inquiryId: string, status: BusinessInquiryStatus) {
  const { error } = await withSupabaseTimeout(supabase!.from("business_inquiries").update({ status } as never).eq("id", inquiryId), "Supabase inquiry status update timed out.");
  if (error) throw new Error(error.message);
}

async function supabaseDelete(inquiryId: string) {
  const { error } = await withSupabaseTimeout(supabase!.from("business_inquiries").delete().eq("id", inquiryId), "Supabase inquiry delete timed out.");
  if (error) throw new Error(error.message);
}

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

  if (isSupabaseConfigured && supabase) {
    try {
      await supabaseSend({ ...input, message });
      return;
    } catch (error) {
      // Fall through to Firestore/local so user isn't blocked by a transient Supabase error
      console.warn("[inquiries] Supabase send failed, falling back:", error);
    }
  }

  try {
    await addDoc(inquiries, {
      businessId: input.businessId,
      businessName: input.businessName.trim(),
      senderUid: input.senderUid,
      senderName: input.senderName.trim().slice(0, 80),
      senderEmail: input.senderEmail.trim().slice(0, 160),
      message,
      status: "unread",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  } catch (error) {
    if (!isFirestoreUnavailable(error)) throw error;
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
  if (isSupabaseConfigured && supabase) {
    return supabaseSubscribe(businessId, onInquiries, onError);
  }

  let useLocalFallback = false;
  let localUnsubscribe: (() => void) | null = null;
  let firestoreUnsubscribe: (() => void) | null = null;

  const inquiryQuery = query(inquiries, where("businessId", "==", businessId), limit(100));
  firestoreUnsubscribe = onSnapshot(
    inquiryQuery,
    (snapshot) => {
      onInquiries(
        snapshot.docs
          .map((item) => toInquiry(item.id, item.data()))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      );
    },
    (error) => {
      if (isFirestoreUnavailable(error) && !useLocalFallback) {
        useLocalFallback = true;
        if (firestoreUnsubscribe) {
          try { firestoreUnsubscribe(); } catch { /* ignore */ }
          firestoreUnsubscribe = null;
        }
        void getCachedBusinessInquiries(businessId).then((cached) => {
          onInquiries(cached.map(cachedToInquiry).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
        });
        localUnsubscribe = subscribeToCachedInquiries(businessId, (cached) => {
          onInquiries(cached.map(cachedToInquiry).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
        });
        return;
      }
      onError(error);
    },
  );

  return () => {
    if (firestoreUnsubscribe) try { firestoreUnsubscribe(); } catch { /* ignore */ }
    if (localUnsubscribe) localUnsubscribe();
  };
}

export async function setBusinessInquiryStatus(inquiryId: string, status: BusinessInquiryStatus, businessId?: string) {
  if (isSupabaseConfigured && supabase) {
    try { await supabaseSetStatus(inquiryId, status); return; }
    catch (error) { console.warn("[inquiries] Supabase status update failed, falling back:", error); }
  }
  try {
    await updateDoc(doc(inquiries, inquiryId), { status, updatedAt: serverTimestamp() });
    return;
  } catch (error) {
    if (!isFirestoreUnavailable(error)) throw error;
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
  if (isSupabaseConfigured && supabase) {
    try { await supabaseDelete(inquiryId); return; }
    catch (error) { console.warn("[inquiries] Supabase delete failed, falling back:", error); }
  }
  try {
    await deleteDoc(doc(inquiries, inquiryId));
    return;
  } catch (error) {
    if (!isFirestoreUnavailable(error)) throw error;
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

// ── Likes / Views Supabase adapters ──

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

function likeId(postId: string, userId: string) {
  return `${postId}_${userId}`;
}

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
      if (error) { onError(new Error(error.message)); return; }
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
    supabase!.from("business_post_likes").upsert({ post_id: postId, user_id: userId } as never, { onConflict: "post_id,user_id" }),
    "Supabase like timed out.",
  );
  if (error) throw new Error(error.message);
}

async function supabaseRecordBusinessProfileView(input: { businessId: string; businessName: string; viewerUid: string }) {
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
      if (error) { onError(new Error(error.message)); return; }
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
        () => { void fetchCount(); },
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
  if (isSupabaseConfigured && supabase) {
    return supabaseSubscribeToLikedBusinessPosts(userId, onLikedIds, onError);
  }
  const likesQuery = query(likes, where("userId", "==", userId), limit(500));
  return onSnapshot(likesQuery, (snapshot) => {
    onLikedIds(new Set(snapshot.docs.map((item) => String(item.data().postId || "")).filter(Boolean)));
  }, onError);
}

export async function setBusinessPostLiked(postId: string, userId: string, liked: boolean) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabaseSetBusinessPostLiked(postId, userId, liked);
      return;
    } catch (error) {
      console.warn("[likes] Supabase set liked failed, falling back:", error);
    }
  }
  const reference = doc(likes, likeId(postId, userId));
  if (!liked) {
    await deleteDoc(reference);
    return;
  }
  await setDoc(reference, { postId, userId, createdAt: serverTimestamp() });
}

export async function recordBusinessProfileView(input: {
  businessId: string;
  businessName: string;
  viewerUid: string;
}) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabaseRecordBusinessProfileView(input);
      return;
    } catch (error) {
      console.warn("[views] Supabase record view failed, falling back:", error);
    }
  }
  const viewId = `${input.businessId}_${input.viewerUid}`;
  await setDoc(doc(profileViews, viewId), {
    businessId: input.businessId,
    businessName: input.businessName,
    viewerUid: input.viewerUid,
    viewedAt: serverTimestamp(),
  });
}

export function subscribeToBusinessProfileViewCount(
  businessId: string,
  onCount: (count: number) => void,
  onError: (error: Error) => void,
) {
  if (isSupabaseConfigured && supabase) {
    return supabaseSubscribeToBusinessProfileViewCount(businessId, onCount, onError);
  }
  const viewsQuery = query(profileViews, where("businessId", "==", businessId), limit(1000));
  return onSnapshot(viewsQuery, (snapshot) => onCount(snapshot.size), onError);
}
