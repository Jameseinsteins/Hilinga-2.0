import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";

import { firestore } from "@/lib/firebase";
import { isSupabaseConfigured, supabase, withSupabaseTimeout } from "@/lib/supabase";

export const experienceCategories = [
  "Place",
  "Restaurant",
  "Cafe",
  "Accommodation",
  "Shop",
  "Event",
  "Activity",
] as const;

export type ExperienceCategory = (typeof experienceCategories)[number];

export type CommunityPost = {
  id: string;
  authorUid: string;
  authorName: string;
  authorAvatarUrl: string | null;
  placeName: string;
  location: string;
  category: ExperienceCategory;
  experience: string;
  rating: number | null;
  createdAt: Timestamp | null;
};

export type NewCommunityPost = Pick<
  CommunityPost,
  | "authorUid"
  | "authorName"
  | "authorAvatarUrl"
  | "placeName"
  | "location"
  | "category"
  | "experience"
  | "rating"
>;

const postsCollection = collection(firestore, "communityPosts");

type SupabaseCommunityRow = {
  id: string;
  author_uid: string;
  author_name: string | null;
  author_avatar_url: string | null;
  place_name: string | null;
  location: string | null;
  category: string | null;
  experience: string | null;
  rating: number | null;
  created_at: string | null;
};

function rowToPost(row: SupabaseCommunityRow): CommunityPost {
  return {
    id: row.id,
    authorUid: row.author_uid ?? "",
    authorName: row.author_name ?? "",
    authorAvatarUrl: row.author_avatar_url ?? null,
    placeName: row.place_name ?? "",
    location: row.location ?? "",
    category: (row.category as ExperienceCategory) ?? "Place",
    experience: row.experience ?? "",
    rating: row.rating ?? null,
    createdAt: row.created_at ? Timestamp.fromDate(new Date(row.created_at)) : null,
  };
}

function supabaseSubscribeToCommunityPosts(
  onPosts: (posts: CommunityPost[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  let cancelled = false;
  let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

  async function fetchAll() {
    try {
      const { data, error } = await withSupabaseTimeout(
        supabase!.from("community_posts").select("*").order("created_at", { ascending: false }).limit(100),
        "Supabase community posts fetch timed out.",
      );
      if (cancelled) return;
      if (error) {
        onError(new Error(error.message));
        return;
      }
      onPosts((data as SupabaseCommunityRow[]).map(rowToPost));
    } catch (err) {
      if (cancelled) return;
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  void fetchAll();

  try {
    channel = supabase!
      .channel(`community-posts:all:${Math.random().toString(36).slice(2, 8)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "community_posts" },
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

async function supabaseCreateCommunityPost(input: NewCommunityPost) {
  const { error } = await withSupabaseTimeout(
    supabase!.from("community_posts").insert({
      author_uid: input.authorUid,
      author_name: input.authorName.trim().slice(0, 80),
      author_avatar_url: input.authorAvatarUrl,
      place_name: input.placeName.trim(),
      location: input.location.trim(),
      category: input.category,
      experience: input.experience.trim(),
      rating: input.rating,
    } as never),
    "Supabase create community post timed out.",
  );
  if (error) throw new Error(error.message);
}

async function supabaseDeleteCommunityPost(postId: string) {
  const { error } = await withSupabaseTimeout(
    supabase!.from("community_posts").delete().eq("id", postId),
    "Supabase delete community post timed out.",
  );
  if (error) throw new Error(error.message);
}

export function subscribeToCommunityPosts(
  onPosts: (posts: CommunityPost[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (isSupabaseConfigured && supabase) {
    return supabaseSubscribeToCommunityPosts(onPosts, onError);
  }
  const postsQuery = query(postsCollection, orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(
    postsQuery,
    (snapshot) => {
      onPosts(
        snapshot.docs.map((snapshotDoc) => ({
          ...(snapshotDoc.data() as Omit<CommunityPost, "id">),
          id: snapshotDoc.id,
        })),
      );
    },
    onError,
  );
}

export async function createCommunityPost(input: NewCommunityPost) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabaseCreateCommunityPost(input);
      return;
    } catch (error) {
      console.warn("[community-feed] Supabase create failed, falling back:", error);
    }
  }
  await addDoc(postsCollection, {
    ...input,
    placeName: input.placeName.trim(),
    location: input.location.trim(),
    experience: input.experience.trim(),
    createdAt: serverTimestamp(),
  });
}

export async function deleteCommunityPost(postId: string) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabaseDeleteCommunityPost(postId);
      return;
    } catch (error) {
      console.warn("[community-feed] Supabase delete failed, falling back:", error);
    }
  }
  await deleteDoc(doc(postsCollection, postId));
}
