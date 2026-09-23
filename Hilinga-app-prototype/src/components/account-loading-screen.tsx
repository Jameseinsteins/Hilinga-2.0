import { SkeletonHome } from "@/components/skeleton";

export function AccountLoadingScreen({ label = "Loading your account\u2026" }: { label?: string }) {
  return (
    <div className="app-shell">
      <div className="app-content">
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, color: "var(--c-body)", fontSize: 13 }}>
            <span className="sk" style={{ width: 20, height: 20, borderRadius: 999 }} aria-hidden="true" />
            <span>{label}</span>
          </div>
          <SkeletonHome />
        </div>
      </div>
    </div>
  );
}
