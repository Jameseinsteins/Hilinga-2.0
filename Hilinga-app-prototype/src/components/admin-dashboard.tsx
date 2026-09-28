import { useEffect, useState } from "react";
import {
  getAdminTouristStats,
  subscribeToAdminAnalytics,
  type AdminTouristStats,
} from "@/lib/analytics-service";
import { downloadAdminExcel } from "@/lib/admin-excel-export";
import {
  fetchAllBusinessesForAdmin,
  fetchPendingBusinesses,
  getBusinessVerificationStats,
  setBusinessVerificationStatus,
  subscribeToPendingBusinesses,
  type BusinessVerificationStatus,
  type RegisteredSmallBusiness,
} from "@/lib/business-content";

function Icon({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span className="material-symbols-outlined" style={{ fontSize: size }} aria-hidden="true">
      {name}
    </span>
  );
}

function formatMonth(monthStr: string): string {
  const date = new Date(`${monthStr}-01`);
  return date.toLocaleDateString("en-PH", { month: "short", year: "numeric" });
}

function MonthlyTrendChart({ data }: { data: Array<{ month: string; count: number }> }) {
  if (data.length === 0) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--c-muted)" }}>
        No monthly data available
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const barWidth = 60;
  const spacing = 12;
  const width = data.length * (barWidth + spacing) + 60;
  const height = 200;
  const padding = 40;

  return (
    <svg width="100%" height={height + padding * 2} viewBox={`0 0 ${width} ${height + padding * 2}`}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
        <line
          key={`grid-${ratio}`}
          x1={padding}
          y1={height - height * ratio + padding}
          x2={width - padding}
          y2={height - height * ratio + padding}
          stroke="var(--c-line)"
          strokeWidth="1"
          opacity="0.3"
        />
      ))}

      {/* Y-axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
        <text
          key={`label-${ratio}`}
          x={padding - 10}
          y={height - height * ratio + padding + 4}
          fontSize="11"
          fill="var(--c-muted)"
          textAnchor="end"
        >
          {Math.round(maxCount * ratio)}
        </text>
      ))}

      {/* Axes */}
      <line
        x1={padding}
        y1={padding}
        x2={padding}
        y2={height + padding}
        stroke="var(--c-body)"
        strokeWidth="2"
      />
      <line
        x1={padding}
        y1={height + padding}
        x2={width - padding}
        y2={height + padding}
        stroke="var(--c-body)"
        strokeWidth="2"
      />

      {/* Bars */}
      {data.map((d, i) => {
        const x = padding + i * (barWidth + spacing) + spacing;
        const barHeight = (d.count / maxCount) * height;
        const y = height + padding - barHeight;

        return (
          <g key={`bar-${i}`}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill="var(--c-green)"
              opacity="0.8"
            />
            <text
              x={x + barWidth / 2}
              y={height + padding + 20}
              fontSize="10"
              fill="var(--c-body)"
              textAnchor="middle"
              transform={`rotate(-45, ${x + barWidth / 2}, ${height + padding + 20})`}
            >
              {formatMonth(d.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Business Verification ──
function BusinessVerificationPanel() {
  const [filter, setFilter] = useState<"pending" | "verified" | "rejected" | "all">("pending");
  const [businesses, setBusinesses] = useState<RegisteredSmallBusiness[]>([]);
  const [stats, setStats] = useState<{ pending: number; verified: number; rejected: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);

  async function loadBusinesses() {
    setLoading(true);
    setError("");
    try {
      const [list, vStats] = await Promise.all([
        filter === "pending" ? fetchPendingBusinesses() : filter === "all" ? fetchAllBusinessesForAdmin() : fetchAllBusinessesForAdmin().then((all) => all.filter((b) => b.verificationStatus === filter)),
        getBusinessVerificationStats().catch(() => null),
      ]);
      setBusinesses(list);
      if (vStats) setStats(vStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load businesses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadBusinesses(); }, [filter]);

  useEffect(() => {
    const unsub = subscribeToPendingBusinesses(
      () => { void loadBusinesses(); getBusinessVerificationStats().then(setStats).catch(() => undefined); },
      () => undefined,
    );
    return unsub;
  }, [filter]);

  async function handleVerify(ownerUid: string, status: BusinessVerificationStatus) {
    const notes = status === "rejected" ? (rejectNotes[ownerUid]?.trim() || "Did not meet verification requirements.") : undefined;
    if (status === "rejected" && !rejectNotes[ownerUid]?.trim()) {
      setError("Add a rejection reason so the business knows what to fix.");
      return;
    }
    setActionId(ownerUid);
    setError("");
    setSuccessMsg("");
    try {
      await setBusinessVerificationStatus(ownerUid, status, notes, "admin");
      setSuccessMsg(status === "verified" ? "Business verified — now live in Explore & Feed." : "Business rejected.");
      await loadBusinesses();
      const vStats = await getBusinessVerificationStats().catch(() => null);
      if (vStats) setStats(vStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification update failed.");
    } finally {
      setActionId(null);
    }
  }

  const filteredCountLabel = filter === "pending" ? `${businesses.length} pending` : filter === "all" ? `${businesses.length} total` : `${businesses.length} ${filter}`;

  return (
    <section className="admin-verify-card" style={{ background: "var(--c-white)", borderRadius: 16, padding: 24, border: "1px solid var(--c-line)", boxShadow: "0 4px 12px rgba(24,69,45,0.04)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <span className="eyebrow">BUSINESS VERIFICATION</span>
          <h2 style={{ fontSize: 22, fontWeight: 900, margin: "6px 0" }}>Verify businesses for Explore & Feed</h2>
          <p style={{ color: "var(--c-body)", fontSize: 13, margin: 0 }}>Only <strong>verified</strong> businesses appear in traveler Explore and Feed. Approve legitimate Albay businesses; reject or request fixes when needed.</p>
        </div>
        {stats && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ padding: "6px 10px", borderRadius: 999, background: "#FFFBEB", border: "1px solid #FDE68A", fontSize: 12, fontWeight: 700, color: "#92400E" }}>Pending: {stats.pending}</span>
            <span style={{ padding: "6px 10px", borderRadius: 999, background: "#ECFDF5", border: "1px solid #A7F3D0", fontSize: 12, fontWeight: 700, color: "#065F46" }}>Verified: {stats.verified}</span>
            <span style={{ padding: "6px 10px", borderRadius: 999, background: "#FEF2F2", border: "1px solid #FECACA", fontSize: 12, fontWeight: 700, color: "#991B1B" }}>Rejected: {stats.rejected}</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {(["pending", "verified", "rejected", "all"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            style={{
              padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800, letterSpacing: 0.3,
              border: filter === v ? "2px solid var(--c-green)" : "1px solid var(--c-line)",
              background: filter === v ? "var(--c-green)" : "white",
              color: filter === v ? "white" : "var(--c-body)",
            }}
          >
            {v === "pending" ? "Pending" : v === "verified" ? "Verified" : v === "rejected" ? "Rejected" : "All"} {stats ? (v === "pending" ? `(${stats.pending})` : v === "verified" ? `(${stats.verified})` : v === "rejected" ? `(${stats.rejected})` : `(${stats.total})`) : ""}
          </button>
        ))}
        <button onClick={() => void loadBusinesses()} style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 999, border: "1px solid var(--c-line)", background: "white", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="refresh" size={16} /> Refresh
        </button>
      </div>

      <div style={{ fontSize: 12, color: "var(--c-muted)", marginBottom: 12 }}>Showing {filteredCountLabel} • Newest first when viewing All; oldest pending first in queue.</div>

      {successMsg && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46", fontSize: 13, marginBottom: 12 }}>{successMsg}</div>}
      {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 20px" }}><div className="spinner" /><span style={{ color: "var(--c-muted)", fontSize: 13 }}>Loading businesses…</span></div>
      ) : businesses.length === 0 ? (
        <div style={{ padding: "32px 20px", textAlign: "center", border: "1px dashed var(--c-line)", borderRadius: 12 }}>
          <Icon name={filter === "pending" ? "verified" : "search"} size={32} />
          <p style={{ fontWeight: 700, margin: "12px 0 4px" }}>{filter === "pending" ? "No pending verifications" : filter === "verified" ? "No verified businesses yet" : filter === "rejected" ? "No rejected businesses" : "No businesses found"}</p>
          <p style={{ color: "var(--c-muted)", fontSize: 13, margin: 0 }}>{filter === "pending" ? "New business registrations will appear here for your approval before they go live in Explore & Feed." : "Businesses will appear here once they match this filter."}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {businesses.map((b) => (
            <article key={b.ownerUid} style={{ border: "1px solid var(--c-line)", borderRadius: 14, padding: 16, background: b.verificationStatus === "pending" ? "#FFFBEB" : b.verificationStatus === "verified" ? "#F0FDF4" : "#FEF2F2" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: "white", border: "1px solid var(--c-line)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {b.logoUrl ? <img src={b.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="storefront" size={22} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 15 }}>{b.name}</strong>
                    <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: 0.4, background: b.verificationStatus === "verified" ? "#10B981" : b.verificationStatus === "rejected" ? "#EF4444" : "#F59E0B", color: "white" }}>{b.verificationStatus.toUpperCase()}</span>
                    <span style={{ fontSize: 11, color: "var(--c-muted)", background: "white", border: "1px solid var(--c-line)", padding: "2px 8px", borderRadius: 999 }}>{b.businessScale}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--c-body)", marginTop: 4 }}>{b.category} • {b.location}</div>
                  <div style={{ fontSize: 11, color: "var(--c-muted)", marginTop: 2, wordBreak: "break-all" }}>Owner: {b.ownerUid} • {b.email || "no email"} • {b.phone || "no phone"}</div>
                  <div style={{ fontSize: 11, color: "var(--c-muted)", marginTop: 2 }}>Hours: {b.hours || "—"} • About: {(b.about || "").slice(0, 160) || "—"}</div>
                  {b.coverUrl && <div style={{ marginTop: 8 }}><img src={b.coverUrl} alt="cover" style={{ width: "100%", maxHeight: 120, objectFit: "cover", borderRadius: 8, border: "1px solid var(--c-line)" }} /></div>}
                  {/* ── GCash-style submitted documents ── */}
                  {(b.verificationPayload || b.verificationSubmittedAt) && (
                    <div style={{ marginTop: 10, padding: 12, background: "white", borderRadius: 12, border: "1px solid #E0E7FF" }}>
                      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.6, color: "#4338CA", display: "flex", gap: 6, alignItems: "center" }}><Icon name="verified_user" size={14} /> SUBMITTED REQUIREMENTS {b.verificationSubmittedAt ? <span style={{ fontWeight: 600, color: "#64748B" }}>• {new Date(b.verificationSubmittedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</span> : null}</div>
                      {b.verificationPayload ? (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8, fontSize: 12 }}>
                            <div><span style={{ color: "#64748B", fontWeight: 700 }}>Contact</span><div style={{ fontWeight: 700, color: "#0F172A" }}>{b.verificationPayload.contactPerson || "—"}</div></div>
                            <div><span style={{ color: "#64748B", fontWeight: 700 }}>ID</span><div style={{ fontWeight: 700, color: "#0F172A" }}>{b.verificationPayload.idType} • {b.verificationPayload.idNumber}</div></div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 10 }}>
                            {([
                              ["ID Front", b.verificationPayload.idFrontUrl],
                              ["ID Back", b.verificationPayload.idBackUrl],
                              ["Permit", b.verificationPayload.permitUrl],
                              ["Storefront", b.verificationPayload.storefrontUrl],
                            ] as const).filter(([, url]) => Boolean(url)).map(([label, url]) => (
                              <button key={label} type="button" onClick={() => setLightbox(url as string)} style={{ border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden", background: "#F8FAFC", padding: 0, textAlign: "left", cursor: "zoom-in" }}>
                                <img src={url as string} alt={label} style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />
                                <div style={{ padding: "6px 8px", fontSize: 11, fontWeight: 800, color: "#334155", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span>{label}</span><span className="material-symbols-outlined" style={{ fontSize: 14, color: "#6366F1" }}>open_in_new</span>
                                </div>
                              </button>
                            ))}
                          </div>
                          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {[
                              ["ID Front", b.verificationPayload.idFrontUrl],
                              ["Permit", b.verificationPayload.permitUrl],
                            ].filter(([, u]) => Boolean(u)).map(([label, url]) => (
                              <a key={label} href={url as string} target="_blank" rel="noreferrer" style={{ fontSize: 11, padding: "6px 10px", borderRadius: 999, background: "#EEF2FF", border: "1px solid #C7D2FE", color: "#4338CA", fontWeight: 700, textDecoration: "none" }}>{label} — open full</a>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 12, color: "#64748B", marginTop: 6 }}>No document bundle on file — business was created before the GCash-style flow. Ask them to tap Get Verified and resubmit.</div>
                      )}
                    </div>
                  )}
                  {b.verificationNotes && <div style={{ marginTop: 8, padding: "8px 10px", background: "white", borderRadius: 8, border: "1px solid var(--c-line)", fontSize: 12 }}><strong>Notes:</strong> {b.verificationNotes}</div>}
                  {b.verifiedAt && <div style={{ fontSize: 11, color: "var(--c-muted)", marginTop: 4 }}>Verified: {new Date(b.verifiedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })} {b.verifiedBy ? `by ${b.verifiedBy}` : ""}</div>}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
                {filter !== "verified" && b.verificationStatus !== "verified" && (
                  <button
                    disabled={actionId === b.ownerUid}
                    onClick={() => void handleVerify(b.ownerUid, "verified")}
                    style={{ padding: "10px 16px", borderRadius: 999, border: "none", background: actionId === b.ownerUid ? "#6EE7B7" : "#10B981", color: "white", fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Icon name="verified" size={16} />{actionId === b.ownerUid ? "Verifying…" : "Verify — publish to Explore & Feed"}
                  </button>
                )}
                {b.verificationStatus !== "rejected" && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flex: 1 }}>
                    <input
                      value={rejectNotes[b.ownerUid] ?? ""}
                      onChange={(e) => setRejectNotes((m) => ({ ...m, [b.ownerUid]: e.target.value }))}
                      placeholder="Reason if rejecting (e.g. missing address, unclear category)"
                      style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 999, border: "1px solid var(--c-line)", fontSize: 12 }}
                    />
                    <button
                      disabled={actionId === b.ownerUid}
                      onClick={() => void handleVerify(b.ownerUid, "rejected")}
                      style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid #FECACA", background: "white", color: "#DC2626", fontWeight: 700, fontSize: 12 }}
                    >
                      {actionId === b.ownerUid ? "…" : "Reject"}
                    </button>
                  </div>
                )}
                {b.verificationStatus === "verified" && filter !== "pending" && (
                  <span style={{ fontSize: 12, color: "#065F46", display: "flex", alignItems: "center", gap: 6 }}><Icon name="check_circle" size={16} />Live in Explore & Feed</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 80, cursor: "zoom-out" }}>
          <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh", background: "white", borderRadius: 12, overflow: "hidden", padding: 8 }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setLightbox(null)} style={{ position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: 999, border: "none", background: "rgba(15,23,42,0.8)", color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}><span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span></button>
            <img src={lightbox} alt="Document" style={{ maxWidth: "90vw", maxHeight: "85vh", objectFit: "contain", display: "block", borderRadius: 8 }} />
            <div style={{ padding: "8px 4px 0", display: "flex", gap: 8, justifyContent: "center" }}>
              <a href={lightbox} target="_blank" rel="noreferrer" style={{ fontSize: 12, padding: "8px 14px", borderRadius: 999, background: "#4F46E5", color: "white", fontWeight: 800, textDecoration: "none" }}>Open full size</a>
              <button onClick={() => setLightbox(null)} style={{ fontSize: 12, padding: "8px 14px", borderRadius: 999, border: "1px solid #E2E8F0", background: "white", fontWeight: 700 }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminTouristStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");

    // Get initial stats
    getAdminTouristStats()
      .then(setStats)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load admin analytics");
        setStats(null);
      })
      .finally(() => setLoading(false));

    // Subscribe to real-time updates
    const unsubscribe = subscribeToAdminAnalytics(
      (newStats) => {
        setStats(newStats);
        setError("");
      },
      (err) => {
        setError(err instanceof Error ? err.message : "Admin analytics subscription error");
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <div>
          <span className="eyebrow">GOVERNMENT TOURISM ANALYTICS</span>
          <h1 style={{ fontSize: "32px", fontWeight: "900", margin: "8px 0" }}>
            Tourism Dashboard
          </h1>
          <p style={{ color: "var(--c-body)", margin: "4px 0" }}>
            Real-time tourism data, arrival statistics, and regional insights for government planning.
          </p>
        </div>
        {stats && (
          <button
            onClick={() => { void downloadAdminExcel(stats); }}
            style={{
              padding: "12px 20px",
              backgroundColor: "var(--c-green)",
              color: "white",
              borderRadius: "8px",
              fontWeight: "600",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Icon name="download" size={20} />
            Export Excel
          </button>
        )}
      </header>

      <BusinessVerificationPanel />

      {error && (
        <div style={{ padding: "16px", backgroundColor: "var(--c-red-pale)", borderRadius: "12px", color: "var(--c-red)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "60px 20px" }}>
          <div className="spinner" />
          <span style={{ color: "var(--c-muted)", fontSize: "16px" }}>Loading tourism analytics…</span>
        </div>
      ) : stats ? (
        <>
          {/* Key Metrics */}
          <section className="admin-metrics-grid">
            <div className="admin-metric-card">
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <Icon name="groups" size={28} />
                <span className="eyebrow">TOTAL ARRIVALS</span>
              </div>
              <h2 style={{ fontSize: "48px", fontWeight: "900", color: "var(--c-green)", margin: "8px 0" }}>
                {stats.totalVisits.toLocaleString()}
              </h2>
              <p style={{ color: "var(--c-body)", fontSize: "14px" }}>Tourist visits recorded</p>
            </div>

            <div className="admin-metric-card">
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <Icon name="public" size={28} />
                <span className="eyebrow">COUNTRIES</span>
              </div>
              <h2 style={{ fontSize: "48px", fontWeight: "900", color: "var(--c-green)", margin: "8px 0" }}>
                {stats.uniqueCountries}
              </h2>
              <p style={{ color: "var(--c-body)", fontSize: "14px" }}>Represented globally</p>
            </div>

            <div className="admin-metric-card">
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <Icon name="event" size={28} />
                <span className="eyebrow">PEAK SEASON</span>
              </div>
              <h2 style={{ fontSize: "28px", fontWeight: "900", color: "var(--c-green)", margin: "8px 0" }}>
                {stats.peakMonth ? formatMonth(stats.peakMonth.month) : "N/A"}
              </h2>
              <p style={{ color: "var(--c-body)", fontSize: "14px" }}>
                {stats.peakMonth ? `${stats.peakMonth.count} arrivals` : "No data"}
              </p>
            </div>

            <div className="admin-metric-card">
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <Icon name="trending_up" size={28} />
                <span className="eyebrow">AVG PER MONTH</span>
              </div>
              <h2 style={{ fontSize: "48px", fontWeight: "900", color: "var(--c-green)", margin: "8px 0" }}>
                {Math.round(stats.totalVisits / Math.max(stats.monthlyTrend.filter((m) => m.count > 0).length, 1))}
              </h2>
              <p style={{ color: "var(--c-body)", fontSize: "14px" }}>Monthly average</p>
            </div>
          </section>

          {/* Monthly Trend */}
          <section className="admin-chart-card">
            <div style={{ marginBottom: "20px" }}>
              <span className="eyebrow">12-MONTH TREND</span>
              <h2 style={{ fontSize: "24px", fontWeight: "900", margin: "8px 0" }}>Monthly Tourist Arrivals</h2>
              <p style={{ color: "var(--c-body)", fontSize: "14px" }}>Historical arrival data showing seasonal patterns</p>
            </div>
            <MonthlyTrendChart data={stats.monthlyTrend} />
          </section>

          {/* Geographic Distribution */}
          <div className="admin-geo-grid">
            <section className="admin-table-card">
              <div style={{ marginBottom: "16px" }}>
                <span className="eyebrow">TOP 10 COUNTRIES</span>
                <h2 style={{ fontSize: "20px", fontWeight: "900", margin: "8px 0" }}>International Arrivals</h2>
              </div>
              {stats.topCountries.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--c-muted)" }}>No data yet</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--c-line)" }}>
                      <th style={{ textAlign: "left", padding: "12px 8px", fontSize: "12px", color: "var(--c-muted)", fontWeight: "700" }}>RANK</th>
                      <th style={{ textAlign: "left", padding: "12px 8px", fontSize: "12px", color: "var(--c-muted)", fontWeight: "700" }}>COUNTRY</th>
                      <th style={{ textAlign: "right", padding: "12px 8px", fontSize: "12px", color: "var(--c-muted)", fontWeight: "700" }}>ARRIVALS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topCountries.map((item, i) => (
                      <tr key={i} style={{ borderBottom: i < stats.topCountries.length - 1 ? "1px solid var(--c-line)" : "none" }}>
                        <td style={{ padding: "16px 8px", color: "var(--c-muted)" }}>#{i + 1}</td>
                        <td style={{ padding: "16px 8px", fontWeight: "600" }}>{item.country}</td>
                        <td style={{ textAlign: "right", padding: "16px 8px", fontWeight: "700", color: "var(--c-green)", fontSize: "18px" }}>
                          {item.count.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="admin-table-card">
              <div style={{ marginBottom: "16px" }}>
                <span className="eyebrow">TOP 10 PROVINCES</span>
                <h2 style={{ fontSize: "20px", fontWeight: "900", margin: "8px 0" }}>Regional Distribution</h2>
              </div>
              {stats.topProvinces.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--c-muted)" }}>No data yet</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--c-line)" }}>
                      <th style={{ textAlign: "left", padding: "12px 8px", fontSize: "12px", color: "var(--c-muted)", fontWeight: "700" }}>RANK</th>
                      <th style={{ textAlign: "left", padding: "12px 8px", fontSize: "12px", color: "var(--c-muted)", fontWeight: "700" }}>PROVINCE</th>
                      <th style={{ textAlign: "right", padding: "12px 8px", fontSize: "12px", color: "var(--c-muted)", fontWeight: "700" }}>VISITORS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topProvinces.map((item, i) => (
                      <tr key={i} style={{ borderBottom: i < stats.topProvinces.length - 1 ? "1px solid var(--c-line)" : "none" }}>
                        <td style={{ padding: "16px 8px", color: "var(--c-muted)" }}>#{i + 1}</td>
                        <td style={{ padding: "16px 8px", fontWeight: "600" }}>{item.province}</td>
                        <td style={{ textAlign: "right", padding: "16px 8px", fontWeight: "700", color: "var(--c-green)", fontSize: "18px" }}>
                          {item.count.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          {/* Footer */}
          <footer style={{ padding: "20px", textAlign: "center", borderTop: "1px solid var(--c-line)" }}>
            <p style={{ color: "var(--c-muted)", fontSize: "13px", marginBottom: "4px" }}>
              Data updates in real-time • Last refreshed: {stats.lastUpdated.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
            </p>
            <p style={{ color: "var(--c-muted)", fontSize: "12px" }}>
              Department of Tourism • Republic of the Philippines
            </p>
          </footer>
        </>
      ) : (
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <Icon name="info" size={40} />
          <h3 style={{ marginTop: "16px", fontSize: "18px", fontWeight: "600" }}>No Tourism Data Available</h3>
          <p style={{ color: "var(--c-muted)", marginTop: "8px" }}>Tourism statistics will appear here once visitor data is recorded</p>
        </div>
      )}

      <style>{`
        .admin-dashboard {
          max-width: 1400px;
          margin: 0 auto;
          padding: 32px 24px;
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          flex-wrap: wrap;
        }

        .admin-metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
        }

        .admin-metric-card {
          background: var(--c-white);
          border-radius: 16px;
          padding: 24px;
          border: 1px solid var(--c-line);
          box-shadow: 0 4px 12px rgba(24, 69, 45, 0.04);
        }

        .admin-chart-card {
          background: var(--c-white);
          border-radius: 16px;
          padding: 32px;
          border: 1px solid var(--c-line);
          box-shadow: 0 4px 12px rgba(24, 69, 45, 0.04);
          overflow-x: auto;
        }

        .admin-geo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 24px;
        }

        .admin-table-card {
          background: var(--c-white);
          border-radius: 16px;
          padding: 24px;
          border: 1px solid var(--c-line);
          box-shadow: 0 4px 12px rgba(24, 69, 45, 0.04);
        }

        @media (max-width: 768px) {
          .admin-dashboard {
            padding: 20px 16px;
            gap: 20px;
          }

          .admin-header {
            flex-direction: column;
          }

          .admin-geo-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
