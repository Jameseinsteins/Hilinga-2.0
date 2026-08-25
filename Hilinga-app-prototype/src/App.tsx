import { AccountLoadingScreen } from "@/components/account-loading-screen";
import { AuthScreen } from "@/components/auth-screen";
import { BusinessApp } from "@/components/business-app";
import { HilingaApp } from "@/components/hilinga-app";
import { OnboardingScreen } from "@/components/onboarding-screen";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { DatabaseProvider } from "@/providers/database-provider";
import { resolveAccountMode } from "@/lib/account-mode";

function AppContent() {
  const { configured, initializing, profileLoading, user, profile, error } = useAuth();

  if (initializing || (user && profileLoading)) return <AccountLoadingScreen />;
  if (!user) return <AuthScreen configured={configured} />;
  // A failed profile request is not proof that this is a new account. Keep a
  // restored Firebase session in the app instead of incorrectly restarting
  // onboarding; the profile cache/cloud request can recover on a later load.
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
