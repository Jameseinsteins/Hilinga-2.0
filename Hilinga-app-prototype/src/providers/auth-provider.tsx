import type { User } from "firebase/auth";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  createContext,
  PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getAvatarUrl,
  getCloudProfile,
  saveCloudProfile,
  uploadAvatar,
  type AvatarUpload,
} from "@/lib/cloud-profile";
import {
  auth,
  isFirebaseConfigured,
} from "@/lib/firebase";
import { resolveAccountMode } from "@/lib/account-mode";
import { hasBusinessPage } from "@/lib/business-content";
import { ensureTouristPassport } from "@/lib/tourist-passport";
import type { CloudProfile, CloudProfileInput } from "@/types/profile";

type OnboardingProfile = Omit<CloudProfileInput, "id" | "avatar_path"> & {
  avatarPath?: string | null;
  avatarSelection?: AvatarUpload | null;
};

type AuthContextValue = {
  configured: boolean;
  initializing: boolean;
  profileLoading: boolean;
  user: User | null;
  profile: CloudProfile | null;
  avatarUrl: string | null;
  error: string | null;
  refreshProfile: () => Promise<void>;
  completeOnboarding: (input: OnboardingProfile) => Promise<void>;
  updateCloudProfile: (input: Omit<OnboardingProfile, "onboarding_completed">) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected account error occurred.";
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CloudProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    const userId = user?.uid;
    if (!userId) {
      setProfile(null);
      setAvatarUrl(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    setError(null);
    try {
      let nextProfile = await getCloudProfile(userId);
      if (nextProfile && !nextProfile.account_mode) {
        const localMode = resolveAccountMode(userId);
        const migratedMode = localMode === "business" || await hasBusinessPage(userId).catch(() => false)
          ? "business"
          : "explore";
        nextProfile = await saveCloudProfile({
          id: nextProfile.id,
          account_mode: migratedMode,
          display_name: nextProfile.display_name,
          avatar_path: nextProfile.avatar_path,
          interests: nextProfile.interests,
          language: nextProfile.language,
          budget_min: nextProfile.budget_min,
          budget_max: nextProfile.budget_max,
          notifications_enabled: nextProfile.notifications_enabled,
          onboarding_completed: nextProfile.onboarding_completed,
        }, nextProfile);
      } else if (nextProfile) {
        // If the user explicitly chose a different mode at login (pending mode),
        // resolveAccountMode will return it and consume the pending key. Persist
        // it to the cloud so subsequent logins don't revert to the old mode.
        const effectiveMode = resolveAccountMode(userId, nextProfile.account_mode);
        if (effectiveMode !== nextProfile.account_mode) {
          nextProfile = await saveCloudProfile({
            id: nextProfile.id,
            account_mode: effectiveMode,
            display_name: nextProfile.display_name,
            avatar_path: nextProfile.avatar_path,
            interests: nextProfile.interests,
            language: nextProfile.language,
            budget_min: nextProfile.budget_min,
            budget_max: nextProfile.budget_max,
            notifications_enabled: nextProfile.notifications_enabled,
            onboarding_completed: nextProfile.onboarding_completed,
          }, nextProfile);
        }
      }
      setProfile(nextProfile);
      if (nextProfile?.avatar_path) {
        try {
          setAvatarUrl(await getAvatarUrl(nextProfile.avatar_path));
        } catch (avatarError) {
          console.warn("[profile] photo URL unavailable", avatarError);
          setAvatarUrl(user?.photoURL ?? null);
        }
      } else {
        setAvatarUrl(user?.photoURL ?? null);
      }
    } catch (nextError) {
      setError(errorMessage(nextError));
      setProfile(null);
      setAvatarUrl(user?.photoURL ?? null);
    } finally {
      setProfileLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setInitializing(false);
      return;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setProfileLoading(Boolean(nextUser));
      setUser(nextUser);
      setInitializing(false);
      if (!nextUser) {
        setProfile(null);
        setAvatarUrl(null);
      } else {
        setAvatarUrl(nextUser.photoURL);
      }
    }, (nextError) => {
      setError(errorMessage(nextError));
      setInitializing(false);
    });
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  // Debounce timer refs for profile saves to prevent race conditions
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup: cancel any pending profile saves on unmount
  useEffect(() => {
    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const persistProfile = useCallback(
    async (input: OnboardingProfile) => {
      const userId = user?.uid;
      if (!userId) throw new Error("Your session has expired. Please sign in again.");

      // Cancel any pending save and abort in-flight requests
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this save
      abortControllerRef.current = new AbortController();

      return new Promise<void>((resolve, reject) => {
        // Debounce profile saves by 300ms to batch rapid updates
        persistTimeoutRef.current = setTimeout(async () => {
          const startedAt = performance.now();
          console.info("[profile] save started", { hasAvatarUpload: Boolean(input.avatarSelection) });
          try {
            let avatarPath = input.avatarPath ?? profile?.avatar_path ?? null;
            let localAvatarUrl = input.avatarSelection?.uri ?? user.photoURL ?? avatarUrl;
            if (input.avatarSelection) {
              try {
                avatarPath = await uploadAvatar(userId, input.avatarSelection);
              } catch (avatarError) {
                console.warn("[profile] photo upload unavailable; saving profile without it", avatarError);
              }
            }

            // Check if this save was cancelled
            if (abortControllerRef.current?.signal.aborted) {
              reject(new Error("Profile save was cancelled"));
              return;
            }

            const saved = await saveCloudProfile({
              id: userId,
              account_mode: resolveAccountMode(userId, profile?.account_mode),
              display_name: input.display_name.trim(),
              avatar_path: avatarPath,
              interests: input.interests,
              language: input.language,
              budget_min: input.budget_min,
              budget_max: input.budget_max,
              notifications_enabled: input.notifications_enabled,
              onboarding_completed: input.onboarding_completed,
            }, profile);

            // Check again before updating state
            if (abortControllerRef.current?.signal.aborted) {
              reject(new Error("Profile save was cancelled"));
              return;
            }

            setProfile(saved);
            setError(null);

            if (saved.avatar_path) {
              try {
                localAvatarUrl = await getAvatarUrl(saved.avatar_path);
              } catch (avatarError) {
                console.warn("[profile] photo URL unavailable", avatarError);
              }
            }
            setAvatarUrl(localAvatarUrl ?? null);
            if (resolveAccountMode(userId, saved.account_mode) !== "business") {
              void ensureTouristPassport(userId, saved.display_name, localAvatarUrl ?? "", {
                language: saved.language,
                interests: saved.interests,
              })
                .catch((profileQrError) => console.warn("[profile-qr] Could not initialize the Profile QR:", profileQrError));
            }
            console.info("[profile] save completed", { durationMs: Math.round(performance.now() - startedAt) });
            resolve();
          } catch (nextError) {
            // Don't report errors from cancelled saves
            if (!(abortControllerRef.current?.signal.aborted)) {
              console.error("[profile] save failed", nextError);
              setError(errorMessage(nextError));
              reject(nextError);
            }
          }
        }, 300);
      });
    },
    [avatarUrl, profile, user?.uid, user?.photoURL],
  );

  const completeOnboarding = useCallback(
    (input: OnboardingProfile) => persistProfile(input),
    [persistProfile],
  );

  const updateCloudProfile = useCallback(
    (input: Omit<OnboardingProfile, "onboarding_completed">) =>
      persistProfile({ ...input, onboarding_completed: true }),
    [persistProfile],
  );

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isFirebaseConfigured,
      initializing,
      profileLoading,
      user,
      profile,
      avatarUrl,
      error,
      refreshProfile,
      completeOnboarding,
      updateCloudProfile,
      signOut,
    }),
    [
      avatarUrl,
      completeOnboarding,
      error,
      initializing,
      profile,
      profileLoading,
      refreshProfile,
      signOut,
      updateCloudProfile,
      user,
    ],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = use(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
