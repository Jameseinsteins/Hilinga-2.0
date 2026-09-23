import { useEffect, useState } from "react";
import {
  getAdminTouristStats,
  subscribeToAdminAnalytics,
  type AdminTouristStats,
} from "@/lib/analytics-service";

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

function downloadCSV(stats: AdminTouristStats) {
  const headers = ["Month", "Tourist Arrivals"];
  const rows = stats.monthlyTrend.map((item) => [
    formatMonth(item.month),
    item.count.toString(),
  ]);

  const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `hilinga-tourism-report-${new Date().toISOString().split("T")[0]}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
            onClick={() => downloadCSV(stats)}
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
            Export CSV
          </button>
        )}
      </header>

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
