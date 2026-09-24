import { isSupabaseConfigured, supabase, withSupabaseTimeout } from "@/lib/supabase";
export type Unsubscribe = () => void;

export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number) {}
  static fromDate(d: Date) { return new Timestamp(Math.floor(d.getTime()/1000), (d.getTime()%1000)*1e6); }
  toDate() { return new Date(this.seconds*1000 + this.nanoseconds/1e6); }
  toMillis() { return this.seconds*1000 + this.nanoseconds/1e6; }
}

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

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.");
  }
}

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
  requireSupabase();
  return supabaseSubscribeToCommunityPosts(onPosts, onError);
}

export async function createCommunityPost(input: NewCommunityPost) {
  requireSupabase();
  await supabaseCreateCommunityPost(input);
}

export async function deleteCommunityPost(postId: string) {
  requireSupabase();
  await supabaseDeleteCommunityPost(postId);
}
