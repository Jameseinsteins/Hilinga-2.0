import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { firestore, storage } from "@/lib/firebase";
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

type StoredProfile = Omit<CloudProfile, "created_at" | "updated_at"> & {
  created_at?: Timestamp;
  updated_at?: Timestamp;
};

function toProfile(id: string, stored: StoredProfile): CloudProfile {
  return {
    ...stored,
    id,
    created_at: stored.created_at?.toDate().toISOString() ?? "",
    updated_at: stored.updated_at?.toDate().toISOString() ?? "",
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

export async function initializeCloudProfile(userId: string, displayName: string, accountMode: AccountMode) {
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
  const profileRef = doc(firestore, "profiles", profile.id);
  const savedAt = new Date().toISOString();

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
        ? String(error.code)
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
  return withFirebaseTimeout(
    getDownloadURL(ref(storage, `avatars/${path}`)),
    "Your profile photo is taking too long to load.",
  );
}
