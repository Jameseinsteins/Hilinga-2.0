import { useEffect, useState } from "react";
import {
  getBusinessVisitorStats,
  subscribeToBusinessAnalytics,
  type BusinessVisitorStats,
  type AnalyticsPeriod,
} from "@/lib/analytics-service";

type BusinessAnalyticsProps = {
  businessName: string;
  businessId: string;
};

function Icon({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span className="material-symbols-outlined" style={{ fontSize: size }} aria-hidden="true">
      {name}
    </span>
  );
}

function SimpleLineChart({ data }: { data: Array<{ date: string; count: number }> }) {
  if (data.length === 0) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "var(--c-muted)" }}>
        No data to display
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const height = 120;
  const width = Math.max(300, data.length * 30);
  const padding = 40;

  return (
    <svg width="100%" height={height + padding} viewBox={`0 0 ${width} ${height + padding}`}>
      {/* Grid lines */}
      {[0, 0.5, 1].map((ratio) => (
        <line
          key={`grid-${ratio}`}
          x1={padding}
          y1={height - height * ratio + padding / 2}
          x2={width}
          y2={height - height * ratio + padding / 2}
          stroke="var(--c-line)"
          strokeWidth="1"
          opacity="0.5"
        />
      ))}

      {/* Y-axis labels */}
      {[0, 0.5, 1].map((ratio) => (
        <text
          key={`label-${ratio}`}
          x={padding - 10}
          y={height - height * ratio + padding / 2 + 4}
          fontSize="12"
          fill="var(--c-muted)"
          textAnchor="end"
        >
          {Math.round(maxCount * ratio)}
        </text>
      ))}

      {/* Axes */}
      <line x1={padding} y1={padding / 2} x2={padding} y2={height + padding / 2} stroke="var(--c-body)" strokeWidth="2" />
      <line x1={padding} y1={height + padding / 2} x2={width} y2={height + padding / 2} stroke="var(--c-body)" strokeWidth="2" />

      {/* Line chart */}
      {data.length > 1 && (
        <polyline
          points={data
            .map((d, i) => {
              const x = padding + (i / (data.length - 1)) * (width - padding - 20);
              const y = padding / 2 + (1 - d.count / maxCount) * height;
              return `${x},${y}`;
            })
            .join(" ")}
          fill="none"
          stroke="var(--c-green)"
          strokeWidth="2"
        />
      )}

      {/* Data points */}
      {data.map((d, i) => {
        const x = padding + (i / Math.max(data.length - 1, 1)) * (width - padding - 20);
        const y = padding / 2 + (1 - d.count / maxCount) * height;
        return (
          <circle key={`point-${i}`} cx={x} cy={y} r="3" fill="var(--c-green)" />
        );
      })}
    </svg>
  );
}

export function BusinessAnalytics({ businessName, businessId }: BusinessAnalyticsProps) {
  const [stats, setStats] = useState<BusinessVisitorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<AnalyticsPeriod>("month");

  useEffect(() => {
    if (!businessId) return;

    setLoading(true);
    setError("");

    // Get initial stats
    getBusinessVisitorStats(businessId, period)
      .then(setStats)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
        setStats(null);
      })
      .finally(() => setLoading(false));

    // Subscribe to real-time updates
    const unsubscribe = subscribeToBusinessAnalytics(
      businessId,
      (newStats) => {
        setStats(newStats);
        setError("");
      },
      (err) => {
        setError(err instanceof Error ? err.message : "Analytics subscription error");
      }
    );

    return () => unsubscribe();
  }, [businessId, period]);

  const avgVisitorsPerDay = stats && stats.dailyBreakdown.length > 0
    ? Math.round(stats.totalVisitors / stats.dailyBreakdown.length)
    : 0;

  return (
    <div className="business-screen">
      <header className="business-page-header">
        <span>VISITOR INSIGHTS</span>
        <h1>Analytics</h1>
        <p>Track visitor trends, geographic distribution, and engagement metrics for {businessName}.</p>
      </header>

      {error && <p className="business-image-error" role="alert">{error}</p>}

      <div className="business-analytics-period">
        <div className="business-card-heading">
          <span>PERIOD</span>
          <h2>Select timeframe</h2>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {(["day", "week", "month", "year"] as AnalyticsPeriod[]).map((p) => (
            <button
              key={p}
              className={`business-period-button ${period === p ? "selected" : ""}`}
              onClick={() => setPeriod(p)}
              disabled={loading}
              style={{
                padding: "8px 16px",
                border: period === p ? "2px solid var(--c-green)" : "1px solid var(--c-line)",
                borderRadius: "8px",
                backgroundColor: period === p ? "var(--c-pale)" : "var(--c-white)",
                color: "var(--c-ink)",
                cursor: "pointer",
                textTransform: "capitalize",
                fontWeight: period === p ? "600" : "400",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "40px 20px" }}>
          <div className="spinner" />
          <span style={{ color: "var(--c-muted)" }}>Loading analytics…</span>
        </div>
      ) : stats ? (
        <>
          <section className="business-analytics-stats" aria-label="Visitor summary">
            <article className="business-stat-card">
              <Icon name="visibility" />
              <strong>{stats.totalVisitors}</strong>
              <span>Total visitors</span>
              <small>{period}</small>
            </article>
            <article className="business-stat-card">
              <Icon name="trending_up" />
              <strong>{avgVisitorsPerDay}</strong>
              <span>Avg per day</span>
              <small>{stats.dailyBreakdown.length} days</small>
            </article>
            <article className="business-stat-card">
              <Icon name="public" />
              <strong>{stats.uniqueCountries}</strong>
              <span>Countries</span>
              <small>represented</small>
            </article>
            <article className="business-stat-card">
              <Icon name="location_on" />
              <strong>{stats.uniqueProvinces}</strong>
              <span>Provinces</span>
              <small>visited from</small>
            </article>
          </section>

          <section className="business-analytics-chart">
            <div className="business-card-heading">
              <span>TREND</span>
              <h2>Daily visitor breakdown</h2>
            </div>
            <SimpleLineChart data={stats.dailyBreakdown} />
          </section>

          <div className="business-analytics-grid">
            <section className="business-analytics-card">
              <div className="business-card-heading">
                <span>TOP COUNTRIES</span>
                <h3>Visitor origins</h3>
              </div>
              {stats.topCountries.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: "var(--c-muted)" }}>
                  No data yet
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid var(--c-line)", fontSize: "12px", color: "var(--c-muted)", fontWeight: "600" }}>Country</th>
                      <th style={{ textAlign: "right", padding: "8px", borderBottom: "1px solid var(--c-line)", fontSize: "12px", color: "var(--c-muted)", fontWeight: "600" }}>Visitors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topCountries.map((item, i) => (
                      <tr key={i} style={{ borderBottom: i < stats.topCountries.length - 1 ? "1px solid var(--c-line)" : "none" }}>
                        <td style={{ padding: "12px 8px" }}>{item.country}</td>
                        <td style={{ textAlign: "right", padding: "12px 8px", fontWeight: "600", color: "var(--c-green)" }}>
                          {item.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="business-analytics-card">
              <div className="business-card-heading">
                <span>TOP PROVINCES</span>
                <h3>Local distribution</h3>
              </div>
              {stats.topProvinces.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: "var(--c-muted)" }}>
                  No data yet
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid var(--c-line)", fontSize: "12px", color: "var(--c-muted)", fontWeight: "600" }}>Province</th>
                      <th style={{ textAlign: "right", padding: "8px", borderBottom: "1px solid var(--c-line)", fontSize: "12px", color: "var(--c-muted)", fontWeight: "600" }}>Visitors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topProvinces.map((item, i) => (
                      <tr key={i} style={{ borderBottom: i < stats.topProvinces.length - 1 ? "1px solid var(--c-line)" : "none" }}>
                        <td style={{ padding: "12px 8px" }}>{item.province}</td>
                        <td style={{ textAlign: "right", padding: "12px 8px", fontWeight: "600", color: "var(--c-green)" }}>
                          {item.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <section style={{ padding: "12px", textAlign: "center", color: "var(--c-muted)", fontSize: "12px" }}>
            Last updated: {stats.lastUpdated.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </section>
        </>
      ) : (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <div style={{ color: "var(--c-muted)", marginBottom: "12px" }}>
            <Icon name="info" size={32} />
          </div>
          <p style={{ color: "var(--c-muted)" }}>No visitor data available yet</p>
        </div>
      )}
    </div>
  );
}
