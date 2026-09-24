import { isSupabaseConfigured, supabase, withSupabaseTimeout } from "@/lib/supabase";
import type { AccountMode } from "@/lib/account-mode";
import type { CloudProfile, CloudProfileInput } from "@/types/profile";

export type AvatarUpload = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  file?: Blob | File | null;
};

const MAX_AVATAR_BYTES = 25 * 1024 * 1024;
const PROFILE_CACHE_PREFIX = "hilinga_cloud_profile_v1:";

type SupabaseProfileRow = {
  id: string;
  account_mode: string | null;
  display_name: string;
  avatar_path: string | null;
  interests: string[] | null;
  language: string | null;
  budget_min: number | null;
  budget_max: number | null;
  notifications_enabled: boolean | null;
  onboarding_completed: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

function supabaseRowToProfile(row: SupabaseProfileRow): CloudProfile {
  return {
    id: row.id,
    account_mode: (row.account_mode as AccountMode) ?? undefined,
    display_name: row.display_name ?? "",
    avatar_path: row.avatar_path ?? null,
    interests: Array.isArray(row.interests) ? row.interests : [],
    language: row.language ?? "English",
    budget_min: row.budget_min ?? null,
    budget_max: row.budget_max ?? null,
    notifications_enabled: row.notifications_enabled ?? true,
    onboarding_completed: row.onboarding_completed ?? false,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

function toSupabaseRow(profile: CloudProfileInput): Record<string, unknown> {
  return {
    id: profile.id,
    account_mode: profile.account_mode ?? null,
    display_name: profile.display_name,
    avatar_path: profile.avatar_path ?? null,
    interests: profile.interests ?? [],
    language: profile.language ?? "English",
    budget_min: profile.budget_min ?? null,
    budget_max: profile.budget_max ?? null,
    notifications_enabled: profile.notifications_enabled ?? true,
    onboarding_completed: profile.onboarding_completed ?? false,
  };
}

function profileCacheKey(userId: string) {
  return `${PROFILE_CACHE_PREFIX}${userId}`;
}

function readCachedProfile(userId: string): CloudProfile | null {
  try {
    const value = localStorage.getItem(profileCacheKey(userId));
    if (!value) return null;
    const profile = JSON.parse(value) as CloudProfile;
    return profile.id === userId && typeof profile.onboarding_completed === "boolean"
      ? profile
      : null;
  } catch (error) {
    console.warn("[cloud-profile] Could not read the cached profile:", error);
    return null;
  }
}

function cacheProfile(profile: CloudProfile) {
  try {
    localStorage.setItem(profileCacheKey(profile.id), JSON.stringify(profile));
  } catch (error) {
    console.warn("[cloud-profile] Could not cache the profile:", error);
  }
}

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.");
  }
}

// ── Supabase adapters ──

async function supabaseGetProfile(userId: string): Promise<CloudProfile | null> {
  const { data, error } = await withSupabaseTimeout(
    supabase!.from("profiles").select("*").eq("id", userId).maybeSingle(),
    "Supabase profile fetch timed out.",
  );
  if (error) throw new Error(error.message);
  if (!data) return null;
  return supabaseRowToProfile(data as SupabaseProfileRow);
}

async function supabaseSaveProfile(profile: CloudProfileInput): Promise<CloudProfile> {
  const row = toSupabaseRow(profile);
  const { data, error } = await withSupabaseTimeout(
    supabase!
      .from("profiles")
      .upsert(row as never, { onConflict: "id" })
      .select()
      .single(),
    "Supabase profile save timed out.",
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Profile save returned no data.");
  return supabaseRowToProfile(data as SupabaseProfileRow);
}

async function supabaseInitializeProfile(userId: string, displayName: string, accountMode: AccountMode) {
  const existing = await supabaseGetProfile(userId);
  if (existing) return;
  const { error: insertError } = await withSupabaseTimeout(
    supabase!.from("profiles").insert({
      id: userId,
      account_mode: accountMode,
      display_name: displayName.trim(),
      avatar_path: null,
      interests: [],
      language: "English",
      budget_min: null,
      budget_max: null,
      notifications_enabled: true,
      onboarding_completed: false,
    } as never),
    "Supabase profile init timed out.",
  ) as { error: { message: string } | null };
  if (insertError) throw new Error(insertError.message);
}

function supabaseAvatarPublicUrl(path: string): string | null {
  if (!supabase) return null;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data?.publicUrl ?? null;
}

// ── Public API — Supabase-only ──

export async function initializeCloudProfile(userId: string, displayName: string, accountMode: AccountMode) {
  requireSupabase();
  await supabaseInitializeProfile(userId, displayName, accountMode);
}

export async function getCloudProfile(userId: string) {
  const cachedProfile = readCachedProfile(userId);
  requireSupabase();
  try {
    const supabaseProfile = await supabaseGetProfile(userId);
    if (supabaseProfile) {
      cacheProfile(supabaseProfile);
      return supabaseProfile;
    }
    return cachedProfile;
  } catch (err) {
    if (cachedProfile) {
      console.warn("[cloud-profile] getCloudProfile using cache after error:", err);
      return cachedProfile;
    }
    throw err;
  }
}

export async function saveCloudProfile(
  profile: CloudProfileInput,
  existingProfile: CloudProfile | null = null,
) {
  requireSupabase();
  const savedAt = new Date().toISOString();
  const saved = await supabaseSaveProfile(profile);
  const withTimestamps: CloudProfile = {
    ...saved,
    created_at: saved.created_at || existingProfile?.created_at || savedAt,
    updated_at: saved.updated_at || savedAt,
  };
  cacheProfile(withTimestamps);
  return withTimestamps;
}

function avatarExtension(selection: AvatarUpload, mimeType: string) {
  const nameExtension = selection.fileName?.split(".").pop()?.toLowerCase();
  if (nameExtension && /^[a-z0-9]{2,5}$/.test(nameExtension)) {
    return nameExtension.replace("jpeg", "jpg");
  }
  return (mimeType.split("/")[1] || "jpg").replace("jpeg", "jpg");
}

async function avatarBytes(selection: AvatarUpload): Promise<Blob> {
  if (selection.file) {
    return selection.file instanceof Blob ? selection.file : new Blob([selection.file]);
  }
  const response = await fetch(selection.uri);
  if (!response.ok) {
    throw new Error("That photo could not be opened. Please choose it again.");
  }
  return response.blob();
}

export async function uploadAvatar(userId: string, selection: AvatarUpload) {
  requireSupabase();
  const mimeType = selection.mimeType || (selection.file instanceof File ? selection.file.type : "") || "image/jpeg";
  if (!mimeType.startsWith("image/")) {
    throw new Error("Choose an image for your profile picture.");
  }
  if (selection.fileSize && selection.fileSize > MAX_AVATAR_BYTES) {
    throw new Error("Choose a profile picture smaller than 25 MB.");
  }

  const extension = avatarExtension(selection, mimeType);
  const path = `${userId}/avatar.${extension}`;

  const blob = await avatarBytes(selection);
  const { error } = await withSupabaseTimeout(
    supabase!.storage.from("avatars").upload(path, blob, {
      contentType: mimeType,
      upsert: true,
    }),
    "Supabase avatar upload timed out.",
  );
  if (error) throw new Error(error.message);
  return path;
}

export async function getAvatarUrl(path: string | null) {
  if (!path) return null;
  requireSupabase();
  return supabaseAvatarPublicUrl(path);
}
