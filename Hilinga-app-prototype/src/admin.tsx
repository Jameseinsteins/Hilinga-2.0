import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/global.css";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { DatabaseProvider } from "@/providers/database-provider";
import { AccountLoadingScreen } from "@/components/account-loading-screen";
import { AuthScreen } from "@/components/auth-screen";

function AdminGate() {
  const { configured, initializing, profileLoading, user } = useAuth();
  if (initializing || (user && profileLoading)) return <AccountLoadingScreen />;
  if (!user) return <AuthScreen configured={configured} />;
  // For Phase 1 the admin dashboard is not gated by role — any authenticated user can verify.
  // To restrict to a specific admin email, uncomment below:
  // const ADMIN_EMAILS = ["admin@hilinga.ph"];
  // if (!ADMIN_EMAILS.includes(user.email ?? "")) return <div style={{padding:40,textAlign:"center"}}>Not authorized.</div>;
  return <AdminDashboard />;
}

createRoot(document.getElementById("admin-root")!).render(
  <StrictMode>
    <AuthProvider>
      <DatabaseProvider>
        <div style={{ height: "100dvh", overflowY: "auto", overflowX: "hidden", background: "var(--c-bg, #F6F1E7)", display: "flex", flexDirection: "column", WebkitOverflowScrolling: "touch" as const, overscrollBehavior: "contain" as const }}>
          <div style={{ position: "sticky", top: 0, zIndex: 20, padding: "10px 16px", background: "#111827", color: "white", fontSize: 12, display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <span style={{ fontWeight: 800, letterSpacing: 0.6 }}>HILINGA ADMIN</span>
            <a href="/" style={{ color: "#93C5FD", fontWeight: 700, textDecoration: "none" }}>← Back to Hilinga app</a>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "visible" }}>
            <AdminGate />
          </div>
        </div>
      </DatabaseProvider>
    </AuthProvider>
  </StrictMode>,
);
