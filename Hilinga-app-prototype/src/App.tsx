import { useCallback, useState } from "react";
import { AccountLoadingScreen } from "@/components/account-loading-screen";
import { AuthScreen } from "@/components/auth-screen";
import { BusinessApp } from "@/components/business-app";
import { HilingaApp } from "@/components/hilinga-app";
import { OnboardingScreen } from "@/components/onboarding-screen";
import { PinLockScreen, SetupPinScreen, VerifyEmailScreen } from "@/components/verification-gate";
import { auth } from "@/lib/firebase";
import { clearPin, isPinSet, isSessionVerified } from "@/lib/verification";
import { resolveAccountMode } from "@/lib/account-mode";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { DatabaseProvider } from "@/providers/database-provider";

function AppContent() {
  const { configured, initializing, profileLoading, user, profile, error } = useAuth();
  const [gateTick, setGateTick] = useState(0);

  const bumpGate = useCallback(() => setGateTick((n) => n + 1), []);
  void gateTick;

  const handleSignOut = useCallback(async () => {
    try {
      if (user?.uid) clearPin(user.uid);
    } catch {}
    try {
      const { signOut } = await import("firebase/auth");
      await signOut(auth);
    } catch {}
  }, [user?.uid]);

  const handleResetPin = useCallback(() => {
    if (!user?.uid) return;
    clearPin(user.uid);
    bumpGate();
  }, [user?.uid, bumpGate]);

  if (initializing || (user && profileLoading)) return <AccountLoadingScreen />;
  if (!user) return <AuthScreen configured={configured} />;

  // 1) Email verification gate — blocks EVERYTHING until verified.
  // Google OAuth accounts are auto-verified by Firebase.
  const isEmailVerified = Boolean(auth.currentUser?.emailVerified ?? user.emailVerified);
  if (!isEmailVerified) {
    return (
      <VerifyEmailScreen
        email={user.email ?? ""}
        onVerified={async () => {
          try {
            await auth.currentUser?.reload();
          } catch {}
          bumpGate();
        }}
        onSignOut={handleSignOut}
      />
    );
  }

  // 2) Local app PIN gate — offline, hashed, per-device, session-scoped.
  // Locks all features: Explore, Planner, AI chat, Map, Feed, business tools, QR.
  if (!isPinSet(user.uid)) {
    return <SetupPinScreen uid={user.uid} onDone={bumpGate} />;
  }
  if (!isSessionVerified(user.uid)) {
    return (
      <PinLockScreen
        uid={user.uid}
        displayName={profile?.display_name ?? user.displayName ?? undefined}
        onUnlocked={bumpGate}
        onSignOut={handleSignOut}
        onResetPin={handleResetPin}
      />
    );
  }

  // 3) Onboarding / routing — only reachable after both gates pass.
  if (!profile && error) return resolveAccountMode(user.uid) === "business" ? <BusinessApp /> : <HilingaApp />;
  if (!profile?.onboarding_completed) return <OnboardingScreen />;
  if (resolveAccountMode(user.uid, profile.account_mode) === "business") return <BusinessApp />;
  return <HilingaApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <DatabaseProvider>
        <AppContent />
      </DatabaseProvider>
    </AuthProvider>
  );
}
