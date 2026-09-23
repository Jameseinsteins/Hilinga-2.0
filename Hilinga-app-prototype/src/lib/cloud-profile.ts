import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { firestore, isFirebaseStorageEnabled, storage } from "@/lib/firebase";
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
const FIREBASE_TIMEOUT_MS = 25_000;
const PROFILE_CACHE_PREFIX = "hilinga_cloud_profile_v1:";

function withFirebaseTimeout<T>(operation: Promise<T>, message: string) {
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), FIREBASE_TIMEOUT_MS);
  });

  return Promise.race([operation, timeoutPromise]).finally(() => clearTimeout(timeout));
}

// (using imported withSupabaseTimeout directly)

type StoredProfile = Omit<CloudProfile, "created_at" | "updated_at"> & {
  created_at?: Timestamp;
  updated_at?: Timestamp;
};

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

function toProfile(id: string, stored: StoredProfile): CloudProfile {
  return {
    ...stored,
    id,
    created_at: stored.created_at?.toDate().toISOString() ?? "",
    updated_at: stored.updated_at?.toDate().toISOString() ?? "",
  };
}

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

// ── Public API (Supabase-first, Firestore fallback) ──

export async function initializeCloudProfile(userId: string, displayName: string, accountMode: AccountMode) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabaseInitializeProfile(userId, displayName, accountMode);
      return;
    } catch (error) {
      console.warn("[cloud-profile] Supabase initialize fallback:", error);
    }
  }

  const profileRef = doc(firestore, "profiles", userId);
  if ((await getDoc(profileRef)).exists()) return;
  await setDoc(profileRef, {
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
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
}

export async function getCloudProfile(userId: string) {
  const cachedProfile = readCachedProfile(userId);

  if (isSupabaseConfigured && supabase) {
    try {
      const supabaseProfile = await supabaseGetProfile(userId);
      if (supabaseProfile) {
        cacheProfile(supabaseProfile);
        return supabaseProfile;
      }
      // supabaseProfile === null -> fall through to Firestore; don't return cached here
      // (migration coexistence: older rows may exist only in Firestore)
    } catch (err) {
      console.warn("[cloud-profile] getCloudProfile Supabase warning:", err);
      // fall through to Firestore below; cachedProfile is last resort
    }

    // Firestore fallback when Supabase miss/error
    try {
      const snapshot = await withFirebaseTimeout(
        getDoc(doc(firestore, "profiles", userId)),
        "Your profile is taking too long to load.",
      );
      if (!snapshot.exists()) return cachedProfile;
      const profile = toProfile(snapshot.id, snapshot.data() as StoredProfile);
      cacheProfile(profile);
      // Opportunistically backfill to Supabase so next read is Supabase-first
      try {
        await supabaseSaveProfile({
          id: profile.id,
          account_mode: profile.account_mode,
          display_name: profile.display_name,
          avatar_path: profile.avatar_path,
          interests: profile.interests,
          language: profile.language,
          budget_min: profile.budget_min,
          budget_max: profile.budget_max,
          notifications_enabled: profile.notifications_enabled,
          onboarding_completed: profile.onboarding_completed,
        });
      } catch {
        // backfill best-effort
      }
      return profile;
    } catch (err) {
      console.warn("[cloud-profile] getCloudProfile Firestore warning:", err);
      if (cachedProfile) return cachedProfile;
      throw err;
    }
  }

  try {
    const snapshot = await withFirebaseTimeout(
      getDoc(doc(firestore, "profiles", userId)),
      "Your profile is taking too long to load.",
    );
    if (!snapshot.exists()) return cachedProfile;
    const profile = toProfile(snapshot.id, snapshot.data() as StoredProfile);
    cacheProfile(profile);
    return profile;
  } catch (err) {
    console.warn("[cloud-profile] getCloudProfile network warning:", err);
    if (cachedProfile) return cachedProfile;
    throw err;
  }
}

export async function saveCloudProfile(
  profile: CloudProfileInput,
  existingProfile: CloudProfile | null = null,
) {
  const savedAt = new Date().toISOString();

  if (isSupabaseConfigured && supabase) {
    try {
      const saved = await supabaseSaveProfile(profile);
      // Ensure local cache reflects what we just saved, with server timestamps
      const withTimestamps: CloudProfile = {
        ...saved,
        created_at: saved.created_at || existingProfile?.created_at || savedAt,
        updated_at: saved.updated_at || savedAt,
      };
      cacheProfile(withTimestamps);
      return withTimestamps;
    } catch (err) {
      console.warn("[cloud-profile] Supabase save fallback:", err);
      // Fall through to Firestore; still cache locally so UI isn't blocked
    }
  }

  const profileRef = doc(firestore, "profiles", profile.id);

  try {
    await withFirebaseTimeout(
      setDoc(
        profileRef,
        {
          ...profile,
          ...(existingProfile ? {} : { created_at: serverTimestamp() }),
          updated_at: serverTimestamp(),
        },
        { merge: true },
      ),
      "Saving profile to cloud timed out.",
    );
  } catch (err) {
    console.warn("[cloud-profile] Could not sync profile to Firebase Cloud (proceeding with local session):", err);
  }

  const saved = {
    ...profile,
    created_at: existingProfile?.created_at || savedAt,
    updated_at: savedAt,
  } satisfies CloudProfile;
  cacheProfile(saved);
  return saved;
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
  const mimeType = selection.mimeType || (selection.file instanceof File ? selection.file.type : "") || "image/jpeg";
  if (!mimeType.startsWith("image/")) {
    throw new Error("Choose an image for your profile picture.");
  }
  if (selection.fileSize && selection.fileSize > MAX_AVATAR_BYTES) {
    throw new Error("Choose a profile picture smaller than 25 MB.");
  }

  const extension = avatarExtension(selection, mimeType);
  const path = `${userId}/avatar.${extension}`;

  // Supabase-first
  if (isSupabaseConfigured && supabase) {
    try {
      const blob = await avatarBytes(selection);
      // Use Supabase timeout wrapper for upload
      const { error } = await withSupabaseTimeout(
        supabase.storage.from("avatars").upload(path, blob, {
          contentType: mimeType,
          upsert: true,
        }),
        "Supabase avatar upload timed out.",
      );
      if (error) throw new Error(error.message);
      return path;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // If bucket missing or RLS, fall back to Firebase so user isn't blocked
      console.warn("[cloud-profile] Supabase avatar upload fallback:", msg);
      // Only throw for validation errors already handled above; otherwise fall through
      if (msg.includes("Choose an image") || msg.includes("smaller than")) throw error as Error;
    }
  }

  try {
    await withFirebaseTimeout(
      uploadBytes(
        ref(storage, `avatars/${path}`),
        await avatarBytes(selection),
        { contentType: mimeType },
      ),
      "Your photo upload is taking too long. Check your connection and try again.",
    );
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (code === "storage/unauthorized") {
      throw new Error("Photo upload permission is not enabled in Firebase Storage.");
    }
    throw error;
  }
  return path;
}

export async function getAvatarUrl(path: string | null) {
  if (!path) return null;

  // Supabase-first: public bucket URL is instant and does not need a network fetch.
  // We try HEAD verification; if it fails we fall back to Firebase for legacy avatars.
  if (isSupabaseConfigured && supabase) {
    const publicUrl = supabaseAvatarPublicUrl(path);
    if (publicUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(publicUrl, { method: "HEAD", signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) return publicUrl;
        // If HEAD 404, legacy file may still live on Firebase — try Firebase below
        if (res.status === 404 && isFirebaseStorageEnabled) {
          // fall through
        } else if (res.ok) {
          return publicUrl;
        } else if (!isFirebaseStorageEnabled) {
          // Bucket may be private but URL still valid for img src — return it anyway
          return publicUrl;
        }
      } catch {
        // Network/CORS HEAD failure: still return publicUrl if Firebase is disabled,
        // because the image src will still work in <img> even if HEAD was blocked
        if (!isFirebaseStorageEnabled) return publicUrl;
        // else fall through to Firebase download URL
      }
      // If we reach here and Firebase is disabled, return Supabase publicUrl as best effort
      if (!isFirebaseStorageEnabled) return publicUrl;
    }
  }

  if (!isFirebaseStorageEnabled) {
    // No Firebase and Supabase check didn't return — still try Supabase public URL as last resort
    if (isSupabaseConfigured && supabase) {
      const fallbackUrl = supabaseAvatarPublicUrl(path);
      if (fallbackUrl) return fallbackUrl;
    }
    return null;
  }

  return withFirebaseTimeout(
    getDownloadURL(ref(storage, `avatars/${path}`)),
    "Your profile photo is taking too long to load.",
  );
}
