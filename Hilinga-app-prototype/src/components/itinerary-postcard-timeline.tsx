import { useMemo, useState, useRef, useCallback } from "react";
import type { ItineraryDay } from "@/lib/database";
import { catalog } from "@/lib/catalog";
import { readVerifiedBusinessPosts, readVerifiedSmallBusinesses } from "@/lib/business-content";
import { useMayonWeather } from "@/lib/mayon-weather";
import { generateQrDataUrl } from "@/lib/qr-generator";

function Icon({ name, size = 16, color, filled }: { name: string; size?: number; color?: string; filled?: boolean }) {
  return <span className={`material-symbols-outlined ${filled ? "icon-filled" : ""}`} style={{ fontSize: size, color }}>{name}</span>;
}

// ── helpers ──

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function getStopPhoto(title: string): string {
  const lower = title.toLowerCase().trim();
  try {
    const posts = readVerifiedBusinessPosts();
    const match = posts.find((p) => {
      const bn = p.businessName.toLowerCase().trim();
      const pt = p.title.toLowerCase().trim();
      return bn === lower || pt === lower || lower.includes(bn) || bn.includes(lower);
    });
    if (match?.mediaUrl && /^data:image|^https?:\/\//.test(match.mediaUrl)) return match.mediaUrl;
  } catch {}
  const cat = catalog.find((c) => {
    const n = c.name.toLowerCase();
    return n === lower || lower.includes(n) || n.includes(lower);
  });
  if (cat?.source) return cat.source;
  // deterministic fallback from catalog
  return catalog[hashStr(title) % catalog.length].source;
}

function timeToMinutes(t: string): number {
  if (!t) return 720;
  const m = t.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 720;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function timeGradient(time: string): string {
  const mins = timeToMinutes(time);
  const h = mins / 60;
  if (h < 6) return "linear-gradient(90deg,#0B2545 0%,#2A3F6B 35%,#5B6FA8 100%)"; // pre-dawn
  if (h < 8) return "linear-gradient(90deg,#FF7E5F 0%,#FEB47B 38%,#FFD194 70%,#FFF2C5 100%)"; // dawn
  if (h < 11) return "linear-gradient(90deg,#4FC3F7 0%,#81D4FA 35%,#FFF59D 72%,#FFFDE7 100%)"; // morning
  if (h < 14) return "linear-gradient(90deg,#29B6F6 0%,#4FC3F7 28%,#FFF176 70%,#FFF9C4 100%)"; // midday
  if (h < 16) return "linear-gradient(90deg,#FFA726 0%,#FFB74D 30%,#FFE082 68%,#FFF8E1 100%)"; // afternoon
  if (h < 18.5) return "linear-gradient(90deg,#FF7043 0%,#FF8A65 22%,#FFAB91 42%,#CE93D8 72%,#7E57C2 100%)"; // sunset
  return "linear-gradient(90deg,#283593 0%,#3949AB 30%,#5C6BC0 60%,#1A237E 100%)"; // evening
}

function timeLabel(time: string): string {
  if (!time) return "Flexible";
  const mins = timeToMinutes(time);
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

function periodLabel(time: string): string {
  const h = timeToMinutes(time) / 60;
  if (h < 6) return "Pre-dawn";
  if (h < 8) return "Dawn";
  if (h < 11) return "Morning";
  if (h < 14) return "Midday";
  if (h < 16) return "Afternoon";
  if (h < 18.5) return "Sunset";
  return "Evening";
}

// ── Mayon badge ──

function MayonBadge() {
  const { data, loading } = useMayonWeather();
  if (loading && !data) {
    return <span className="mayon-badge mayon-badge-loading"><span className="mayon-badge-dot" /> Loading Mayon…</span>;
  }
  const w = data;
  if (!w) return null;
  const label = w.isClear ? "Clear — Mayon visible" : w.condition.includes("Cloud") || w.clouds > 60 ? "Cloudy — Mayon shy" : w.condition;
  return (
    <span className={`mayon-badge ${w.isClear ? "mayon-clear" : "mayon-cloudy"}`} title={`Mayon visibility via ${w.source} • ${w.clouds}% clouds • ${w.visibilityKm}km vis`}>
      <Icon name={w.icon} size={14} color={w.isClear ? "#0D7A3E" : "#5A6B7A"} filled />
      <strong>Mayon</strong>
      <span className="mayon-badge-sep">•</span>
      <span>{label}</span>
      <span className="mayon-badge-sep">•</span>
      <span>{w.tempC}°C</span>
    </span>
  );
}

// ── Export helpers (canvas) ──

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src || src.startsWith("data:image/svg")) return null;
  return new Promise((resolve) => {
    const img = new Image();
    // data: and same-origin don't need crossOrigin; https may taint but we skip photos for taint safety
    if (src.startsWith("https://")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 3) {
  const words = text.split(/\s+/);
  let line = "";
  let cy = y;
  let lines = 0;
  for (let n = 0; n < words.length; n++) {
    const test = line ? line + " " + words[n] : words[n];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = words[n];
      cy += lineHeight;
      lines++;
      if (lines >= maxLines - 1) {
        // last line with ellipsis if overflow
        let remaining = words.slice(n).join(" ");
        while (ctx.measureText(remaining + "…").width > maxWidth && remaining.length > 0) remaining = remaining.slice(0, -1);
        ctx.fillText(remaining + "…", x, cy);
        return cy + lineHeight;
      }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
  return cy + lineHeight;
}

export async function exportItineraryAsStory(itinerary: ItineraryDay[], opts: { title?: string; budgetText?: string | number | null; qrPayload?: string }) {
  const W = 1080, H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // bg
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0E2E22");
  bg.addColorStop(0.22, "#164A35");
  bg.addColorStop(1, "#F4F7F5");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // top cream card
  ctx.fillStyle = "#FFFFFF";
  // @ts-ignore roundRect may not be in lib yet
  if (ctx.roundRect) {
    ctx.beginPath();
    (ctx as any).roundRect(32, 32, W - 64, H - 64, 36);
    ctx.fill();
    ctx.strokeStyle = "rgba(16,94,59,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.fillRect(32, 32, W - 64, H - 64);
  }
  ctx.save();
  ctx.beginPath();
  if ((ctx as any).roundRect) (ctx as any).roundRect(32, 32, W - 64, H - 64, 36);
  ctx.clip();

  // header gradient
  const hg = ctx.createLinearGradient(32, 32, W - 32, 180);
  hg.addColorStop(0, "#12291E");
  hg.addColorStop(1, "#1D4330");
  ctx.fillStyle = hg;
  ctx.fillRect(32, 32, W - 64, 214);

  // header text
  ctx.fillStyle = "#A4E5C1";
  ctx.font = "800 22px Inter, system-ui, sans-serif";
  ctx.fillText("HILINGA  •  ALBAY ITINERARY", 64, 92);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 44px Inter, system-ui, sans-serif";
  const title = (opts.title || "Your Albay Adventure").slice(0, 42);
  ctx.fillText(title, 64, 142);
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.font = "600 22px Inter, system-ui, sans-serif";
  ctx.fillText(`${itinerary.length}-day trip  •  ${itinerary.reduce((a, d) => a + d.stops.length, 0)} stops`, 64, 178);
  // budget pill
  let budgetLabel = "Moderate";
  if (typeof opts.budgetText === "number") budgetLabel = `₱${opts.budgetText.toLocaleString()}`;
  else if (typeof opts.budgetText === "string" && opts.budgetText) budgetLabel = opts.budgetText;
  ctx.fillStyle = "#00A86B";
  const pill = `  ${budgetLabel}  `;
  ctx.font = "800 20px Inter, system-ui, sans-serif";
  const pw = ctx.measureText(pill).width + 28;
  const px = W - 64 - pw - 24;
  ctx.beginPath();
  // pill bg
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(px, 148, pw, 36, 999);
    ctx.fill();
  } else {
    ctx.fillRect(px, 148, pw, 36);
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(pill.trim(), px + 18, 172);

  // Mayon strip (simple)
  ctx.fillStyle = "#F2FAF5";
  ctx.fillRect(32, 246, W - 64, 44);
  ctx.fillStyle = "#105E3B";
  ctx.font = "700 18px Inter, system-ui, sans-serif";
  ctx.fillText("☀ Mayon Volcano  •  Check live weather before you go", 64, 274);
  ctx.fillStyle = "#75837B";
  ctx.font = "600 15px Inter, system-ui, sans-serif";
  ctx.fillText("Tip: clear mornings are best for the perfect cone view.", 64, 296);

  // days
  let y = 322;
  ctx.fillStyle = "#14231B";
  for (const day of itinerary.slice(0, 4)) {
    if (y > 1540) break;
    // day heading
    ctx.fillStyle = "#F4F7F5";
    ctx.fillRect(56, y, W - 112, 42);
    ctx.fillStyle = "#197A4D";
    ctx.font = "900 15px Inter, system-ui, sans-serif";
    ctx.fillText(`DAY ${day.day}`, 72, y + 26);
    ctx.fillStyle = "#14231B";
    ctx.font = "800 18px Inter, system-ui, sans-serif";
    ctx.fillText(day.title.slice(0, 38), 140, y + 26);
    y += 54;

    for (const stop of day.stops.slice(0, 5)) {
      if (y > 1520) break;
      const isBiz = stop.note.toLowerCase().includes("registered");
      // row bg
      ctx.fillStyle = "#FFFFFF";
      ctx.strokeStyle = "#E6EDE9";
      ctx.lineWidth = 1;
      const rh = 88;
      if ((ctx as any).roundRect) {
        ctx.beginPath();
        (ctx as any).roundRect(56, y, W - 112, rh, 16);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(56, y, W - 112, rh);
        ctx.strokeRect(56, y, W - 112, rh);
      }
      // time gradient left strip
      const grad = ctx.createLinearGradient(56, y, 72, y);
      // simple color by time
      const mins = timeToMinutes(stop.time);
      const h = mins / 60;
      let c1 = "#4FC3F7", c2 = "#FFF59D";
      if (h < 8) { c1 = "#FF7E5F"; c2 = "#FFD194"; }
      else if (h >= 17) { c1 = "#FF7043"; c2 = "#7E57C2"; }
      else if (h >= 14) { c1 = "#FFA726"; c2 = "#FFE082"; }
      grad.addColorStop(0, c1); grad.addColorStop(1, c2);
      ctx.fillStyle = grad;
      if ((ctx as any).roundRect) {
        ctx.beginPath();
        (ctx as any).roundRect(56, y, 8, rh, [16, 0, 0, 16]);
        ctx.fill();
      } else ctx.fillRect(56, y, 8, rh);

      ctx.fillStyle = "#75837B";
      ctx.font = "700 13px Inter, system-ui, sans-serif";
      ctx.fillText(timeLabel(stop.time), 84, y + 26);
      ctx.fillStyle = "#14231B";
      ctx.font = "800 18px Inter, system-ui, sans-serif";
      const t = stop.title.length > 32 ? stop.title.slice(0, 32) + "…" : stop.title;
      ctx.fillText(t, 84, y + 50);
      ctx.fillStyle = "#46584E";
      ctx.font = "500 13px Inter, system-ui, sans-serif";
      const note = stop.note.slice(0, 62) + (stop.note.length > 62 ? "…" : "");
      ctx.fillText(note, 84, y + 70);
      if (isBiz) {
        ctx.fillStyle = "#E8F5EE";
        ctx.font = "700 11px Inter, system-ui, sans-serif";
        const badge = "✓ Registered";
        const bw = ctx.measureText(badge).width + 14;
        const bx = W - 72 - bw;
        if ((ctx as any).roundRect) {
          ctx.beginPath();
          (ctx as any).roundRect(bx, y + 12, bw, 20, 999);
          ctx.fill();
        } else ctx.fillRect(bx, y + 12, bw, 20);
        ctx.fillStyle = "#105E3B";
        ctx.fillText(badge, bx + 7, y + 26);
      }
      y += rh + 10;
    }
    y += 6;
  }

  // QR section
  const qrPayload = opts.qrPayload || `https://hilinga.app/trip/${encodeURIComponent(title)}`;
  let qrDataUrl: string | null = null;
  try { qrDataUrl = await generateQrDataUrl(qrPayload, { width: 280, margin: 1 }); } catch {}
  // QR card
  const qrY = H - 64 - 280;
  ctx.fillStyle = "#12291E";
  ctx.fillRect(32, qrY, W - 64, 280);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 24px Inter, system-ui, sans-serif";
  ctx.fillText("Scan to open this trip in Hilinga", 64, qrY + 42);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = "500 16px Inter, system-ui, sans-serif";
  await drawWrappedText(ctx, qrPayload, 64, qrY + 66, 640, 22, 2);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "600 13px Inter, system-ui, sans-serif";
  ctx.fillText("Share this story — friends can scan to view your itinerary.", 64, qrY + 118);

  if (qrDataUrl) {
    const qrImg = await loadImage(qrDataUrl);
    if (qrImg) {
      ctx.fillStyle = "#FFFFFF";
      if ((ctx as any).roundRect) {
        ctx.beginPath();
        (ctx as any).roundRect(W - 64 - 200 - 32, qrY + 32, 200, 200, 18);
        ctx.fill();
      } else ctx.fillRect(W - 64 - 200 - 32, qrY + 32, 200, 200);
      ctx.drawImage(qrImg, W - 64 - 200 - 24, qrY + 40, 184, 184);
    }
  }

  // bottom brand
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "800 13px Inter, system-ui, sans-serif";
  ctx.fillText("HILINGA  •  Plan a Legazpi experience that feels made for you.", 64, qrY + 248);

  ctx.restore();
  return canvas.toDataURL("image/png");
}

export async function exportItineraryAsPoster(itinerary: ItineraryDay[], opts: { title?: string; budgetText?: string | number | null; qrPayload?: string }) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#12291E");
  bg.addColorStop(0.45, "#1A3D2D");
  bg.addColorStop(1, "#F4F7F5");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#FFFFFF";
  if ((ctx as any).roundRect) {
    ctx.beginPath();
    (ctx as any).roundRect(28, 28, W - 56, H - 56, 28);
    ctx.fill();
  } else ctx.fillRect(28, 28, W - 56, H - 56);
  ctx.save();
  ctx.beginPath();
  if ((ctx as any).roundRect) (ctx as any).roundRect(28, 28, W - 56, H - 56, 28);
  ctx.clip();

  const hg = ctx.createLinearGradient(28, 28, W - 28, 220);
  hg.addColorStop(0, "#102F23");
  hg.addColorStop(1, "#1E4D33");
  ctx.fillStyle = hg;
  ctx.fillRect(28, 28, W - 56, 190);

  ctx.fillStyle = "#A4E5C1";
  ctx.font = "800 18px Inter, system-ui, sans-serif";
  ctx.fillText("HILINGA  •  BOARDING PASS  •  ALBAY, PHILIPPINES", 56, 78);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 40px Inter, system-ui, sans-serif";
  const title = (opts.title || "Your Albay Adventure").slice(0, 44);
  ctx.fillText(title, 56, 126);
  ctx.fillStyle = "rgba(255,255,255,0.84)";
  ctx.font = "600 18px Inter, system-ui, sans-serif";
  ctx.fillText(`${itinerary.length} days  •  ${itinerary.reduce((a, d) => a + d.stops.length, 0)} stops  •  Ticket-like itinerary`, 56, 158);
  // budget
  let budgetLabel = "Moderate";
  if (typeof opts.budgetText === "number") budgetLabel = `₱${opts.budgetText.toLocaleString()} Total`;
  else if (typeof opts.budgetText === "string" && opts.budgetText) budgetLabel = opts.budgetText;
  ctx.fillStyle = "#00A86B";
  ctx.font = "800 16px Inter, system-ui, sans-serif";
  const pill = `  ${budgetLabel}  `;
  const pw = ctx.measureText(pill).width + 22;
  if ((ctx as any).roundRect) {
    ctx.beginPath();
    (ctx as any).roundRect(W - 56 - pw - 28, 136, pw, 30, 999);
    ctx.fill();
  } else ctx.fillRect(W - 56 - pw - 28, 136, pw, 30);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(pill.trim(), W - 56 - pw - 18, 156);

  // perforation line
  ctx.strokeStyle = "rgba(16,47,35,0.12)";
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(56, 218);
  ctx.lineTo(W - 56, 218);
  ctx.stroke();
  ctx.setLineDash([]);

  let y = 238;
  for (const day of itinerary.slice(0, 3)) {
    if (y > 1120) break;
    ctx.fillStyle = "#E8F5EE";
    ctx.fillRect(48, y, W - 96, 36);
    ctx.fillStyle = "#197A4D";
    ctx.font = "900 13px Inter, system-ui, sans-serif";
    ctx.fillText(`DAY ${day.day}`, 64, y + 22);
    ctx.fillStyle = "#14231B";
    ctx.font = "800 16px Inter, system-ui, sans-serif";
    ctx.fillText(day.title.slice(0, 46), 128, y + 22);
    y += 44;
    for (const stop of day.stops.slice(0, 4)) {
      if (y > 1100) break;
      const rh = 72;
      ctx.fillStyle = "#FFFFFF";
      ctx.strokeStyle = "#E2EAE6";
      ctx.lineWidth = 1;
      if ((ctx as any).roundRect) {
        ctx.beginPath();
        (ctx as any).roundRect(48, y, W - 96, rh, 14);
        ctx.fill(); ctx.stroke();
      } else { ctx.fillRect(48, y, W - 96, rh); ctx.strokeRect(48, y, W - 96, rh); }
      const mins = timeToMinutes(stop.time);
      const h = mins / 60;
      let c1 = "#4FC3F7", c2 = "#FFF59D";
      if (h < 8) { c1 = "#FF7E5F"; c2 = "#FFD194"; }
      else if (h >= 17) { c1 = "#FF7043"; c2 = "#7E57C2"; }
      else if (h >= 14) { c1 = "#FFA726"; c2 = "#FFE082"; }
      const grad = ctx.createLinearGradient(48, y, 62, y);
      grad.addColorStop(0, c1); grad.addColorStop(1, c2);
      ctx.fillStyle = grad;
      if ((ctx as any).roundRect) {
        ctx.beginPath();
        (ctx as any).roundRect(48, y, 7, rh, [14, 0, 0, 14]);
        ctx.fill();
      } else ctx.fillRect(48, y, 7, rh);
      ctx.fillStyle = "#75837B";
      ctx.font = "700 11px Inter, system-ui, sans-serif";
      ctx.fillText(timeLabel(stop.time), 68, y + 20);
      ctx.fillStyle = "#14231B";
      ctx.font = "800 15px Inter, system-ui, sans-serif";
      ctx.fillText(stop.title.slice(0, 38), 68, y + 40);
      ctx.fillStyle = "#46584E";
      ctx.font = "500 11px Inter, system-ui, sans-serif";
      ctx.fillText(stop.note.slice(0, 72) + (stop.note.length > 72 ? "…" : ""), 68, y + 56);
      y += rh + 8;
    }
    y += 8;
  }

  // QR bottom
  const qrPayload = opts.qrPayload || `https://hilinga.app/trip/${encodeURIComponent(title)}`;
  let qrDataUrl: string | null = null;
  try { qrDataUrl = await generateQrDataUrl(qrPayload, { width: 220, margin: 1 }); } catch {}
  ctx.fillStyle = "#F2FAF5";
  ctx.fillRect(28, H - 56 - 188, W - 56, 188);
  ctx.fillStyle = "#14231B";
  ctx.font = "900 18px Inter, system-ui, sans-serif";
  ctx.fillText("Scan to open in Hilinga", 56, H - 56 - 188 + 36);
  ctx.fillStyle = "#46584E";
  ctx.font = "500 13px Inter, system-ui, sans-serif";
  await drawWrappedText(ctx, qrPayload, 56, H - 56 - 188 + 58, 620, 18, 2);
  ctx.fillStyle = "#75837B";
  ctx.font = "600 11px Inter, system-ui, sans-serif";
  ctx.fillText("Notion / Capsule - grade ticket. Share your Albay story.", 56, H - 56 - 28);

  if (qrDataUrl) {
    const qrImg = await loadImage(qrDataUrl);
    if (qrImg) {
      ctx.fillStyle = "#FFFFFF";
      const qx = W - 56 - 160 - 32, qy = H - 56 - 188 + 18, qs = 150;
      if ((ctx as any).roundRect) {
        ctx.beginPath();
        (ctx as any).roundRect(qx, qy, qs, qs, 14);
        ctx.fill();
        ctx.strokeStyle = "#E2EAE6"; ctx.stroke();
      } else ctx.fillRect(qx, qy, qs, qs);
      ctx.drawImage(qrImg, qx + 8, qy + 8, qs - 16, qs - 16);
    }
  }

  ctx.restore();
  return canvas.toDataURL("image/png");
}

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ── Postcard carousel component ──

type PostcardTimelineProps = {
  itinerary: ItineraryDay[];
  budgetText?: string | number | null;
  title?: string;
  qrPayload?: string;
  compact?: boolean;
  onExclude?: (title: string) => void;
  onReplaceStop?: (day: number, stopIndex: number, currentTitle: string) => void;
};

export function PostcardTimeline({ itinerary, budgetText, title, qrPayload, compact, onExclude, onReplaceStop }: PostcardTimelineProps) {
  const { data: mayon } = useMayonWeather();
  const bizNames = useMemo(() => new Set(readVerifiedSmallBusinesses().map((b) => b.name.toLowerCase().trim())), []);
  const bizCount = useMemo(() => {
    let c = 0;
    for (const d of itinerary) for (const s of d.stops) if (bizNames.has(s.title.toLowerCase().trim()) || s.note.toLowerCase().includes("registered")) c++;
    return c;
  }, [itinerary, bizNames]);
  const totalStops = useMemo(() => itinerary.reduce((a, d) => a + d.stops.length, 0), [itinerary]);
  const scrollRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState<"story" | "poster" | null>(null);

  const scrollDay = useCallback((day: number, dir: -1 | 1) => {
    const el = scrollRefs.current[day];
    if (!el) return;
    const amount = Math.min(320, el.clientWidth * 0.85);
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
  }, []);

  const handleExport = useCallback(async (kind: "story" | "poster") => {
    if (exporting) return;
    setExporting(kind);
    try {
      const payload = qrPayload || (typeof window !== "undefined" ? window.location.href : `https://hilinga.app/trip/${encodeURIComponent(title || "albay-trip")}`);
      const dataUrl = kind === "story"
        ? await exportItineraryAsStory(itinerary, { title, budgetText, qrPayload: payload })
        : await exportItineraryAsPoster(itinerary, { title, budgetText, qrPayload: payload });
      const safe = (title || "hilinga-trip").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32) || "hilinga-trip";
      triggerDownload(dataUrl, kind === "story" ? `${safe}-story-1080x1920.png` : `${safe}-poster.png`);
    } catch (e) {
      console.error("[postcard export] failed", e);
    } finally {
      setExporting(null);
    }
  }, [exporting, itinerary, title, budgetText, qrPayload]);

  const formattedBudget = useMemo(() => {
    if (!budgetText) return "Moderate (₱700–₱1,500 / person)";
    if (typeof budgetText === "number") return `₱${budgetText.toLocaleString()} Total Budget`;
    if (budgetText === "Budget") return "₱300–₱700 per person / day (Budget)";
    if (budgetText === "Moderate") return "₱700–₱1,500 per person / day (Moderate)";
    if (budgetText === "Premium") return "₱1,500+ per person / day (Premium)";
    return String(budgetText);
  }, [budgetText]);

  if (!itinerary.length) return null;

  const showExport = !compact;

  return (
    <div className={`postcard-timeline ${compact ? "postcard-timeline-compact" : ""}`}>
      {/* Top: budget banner + Mayon + foil strip */}
      {!compact && (
        <div className="postcard-top-stack">
          <div className="itinerary-budget-banner postcard-budget-banner">
            <div className="itinerary-budget-icon"><Icon name="account_balance_wallet" size={20} color="white" /></div>
            <div className="itinerary-budget-copy">
              <span className="itinerary-budget-label">Trip Budget</span>
              <strong>{formattedBudget}</strong>
            </div>
            <span className="postcard-budget-foil" aria-hidden="true"><Icon name="workspace_premium" size={14} color="#8A6A1A" /> Capsule</span>
          </div>
          <div className="postcard-badge-row">
            <MayonBadge />
            {bizCount > 0 ? (
              <span className="foil-badge" title={`${bizCount} of ${totalStops} stops are registered local businesses`}>
                <span className="foil-badge-shimmer" aria-hidden="true" />
                <Icon name="verified" size={13} color="#7A5A12" filled />
                {bizCount} Registered Local Business{bizCount === 1 ? "" : "es"}
              </span>
            ) : (
              <span className="foil-badge foil-badge-muted">
                <Icon name="storefront" size={13} color="#6B7A6E" />
                Local businesses curated in
              </span>
            )}
            {mayon && (
              <span className="postcard-weather-summary" title={`Clouds ${mayon.clouds}% • Visibility ${mayon.visibilityKm}km`}>
                <Icon name={mayon.icon} size={12} color={mayon.isClear ? "#0D7A3E" : "#5A6B7A"} />
                {mayon.tempC}°C • {mayon.condition}
              </span>
            )}
          </div>
        </div>
      )}

      {compact && bizCount > 0 && (
        <div className="postcard-badge-row postcard-badge-row-compact">
          <span className="foil-badge foil-badge-sm">
            <Icon name="verified" size={12} color="#7A5A12" filled /> {bizCount} Registered
          </span>
          <MayonBadge />
        </div>
      )}

      {/* Days */}
      {itinerary.map((day) => {
        const canScroll = day.stops.length > 1;
        return (
          <div className="postcard-day" key={day.day}>
            <div className="postcard-day-head">
              <div className="postcard-day-title">
                <span className="postcard-day-kicker">Day {day.day}</span>
                <strong>{day.title}</strong>
                <span className="postcard-day-count">{day.stops.length} stops</span>
              </div>
              {canScroll && !compact && (
                <div className="postcard-day-nav" aria-label={`Scroll Day ${day.day}`}>
                  <button type="button" className="postcard-nav-btn" onClick={() => scrollDay(day.day, -1)} aria-label={`Scroll Day ${day.day} left`}>
                    <Icon name="chevron_left" size={18} color="var(--c-ink)" />
                  </button>
                  <button type="button" className="postcard-nav-btn" onClick={() => scrollDay(day.day, 1)} aria-label={`Scroll Day ${day.day} right`}>
                    <Icon name="chevron_right" size={18} color="var(--c-ink)" />
                  </button>
                </div>
              )}
            </div>

            <div
              className="postcard-carousel"
              ref={(el) => { scrollRefs.current[day.day] = el; }}
              role="list"
              aria-label={`Day ${day.day} stops`}
            >
              {day.stops.map((stop, stopIndex) => {
                const isBiz = bizNames.has(stop.title.toLowerCase().trim()) || stop.note.toLowerCase().includes("registered hilinga small business") || stop.note.toLowerCase().includes("registered local business");
                const priceMatch = stop.note.match(/₱[\d,]+(?:–₱[\d,]+|\+)?(?:\s*per\s*person)?/i);
                const img = getStopPhoto(stop.title);
                const noteKey = `${day.day}-${stopIndex}`;
                const expanded = Boolean(expandedNotes[noteKey]);
                const gradient = timeGradient(stop.time);
                const wIcon = mayon?.icon || "partly_cloudy_day";
                const wTemp = mayon ? `${mayon.tempC}°` : "";
                return (
                  <div className={`postcard ${isBiz ? "postcard-registered" : ""}`} key={`${day.day}-${stopIndex}-${stop.title}`} role="listitem">
                    <div className="postcard-time-rail" style={{ background: gradient }} title={`${periodLabel(stop.time)} • ${timeLabel(stop.time)}`}>
                      <span className="postcard-time-rail-label">{periodLabel(stop.time)}</span>
                    </div>
                    <div className="postcard-media">
                      <img src={img} alt={stop.title} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      <div className="postcard-media-scrim" />
                      <div className="postcard-media-top">
                        <span className="postcard-time-chip">
                          <Icon name="schedule" size={11} color="white" />
                          {timeLabel(stop.time)}
                        </span>
                        <span className="postcard-weather-chip" title={mayon ? `${mayon.condition} • ${mayon.tempC}°C` : "Weather"}>
                          <Icon name={wIcon} size={12} color="white" />
                          {wTemp || periodLabel(stop.time).slice(0, 3)}
                        </span>
                      </div>
                      {isBiz && <span className="postcard-foil-corner" title="Registered Local Business"><Icon name="verified" size={12} color="#7A5A12" filled /> Registered</span>}
                      <span className="postcard-index">{String(stopIndex + 1).padStart(2, "0")}</span>
                    </div>
                    <div className="postcard-body">
                      <div className="postcard-icon" aria-hidden="true"><Icon name={stop.icon || "place"} size={16} color="var(--c-green)" /></div>
                      <strong className="postcard-title">{stop.title}</strong>
                      {isBiz && <span className="itinerary-business-badge postcard-biz-badge"><Icon name="verified" size={12} color="var(--c-green)" filled /> Registered Local Business</span>}
                      {!compact && (
                        <button
                          type="button"
                          className={`postcard-note-toggle ${expanded ? "expanded" : ""}`}
                          onClick={() => setExpandedNotes((m) => ({ ...m, [noteKey]: !m[noteKey] }))}
                          aria-expanded={expanded}
                          aria-controls={`postcard-note-${noteKey}`}
                        >
                          <span className="postcard-note-preview">{expanded ? stop.note : (stop.note.length > 92 ? stop.note.slice(0, 92) + "…" : stop.note)}</span>
                          <span className="postcard-note-caret"><Icon name={expanded ? "expand_less" : "expand_more"} size={14} color="var(--c-muted)" /> {expanded ? "Less" : "Note"}</span>
                        </button>
                      )}
                      {compact && <p className="postcard-note-compact">{stop.note.length > 88 ? stop.note.slice(0, 88) + "…" : stop.note}</p>}
                      {priceMatch && <span className="stop-price-tag postcard-price"><Icon name="sell" size={11} color="var(--c-green)" /> {priceMatch[0]}</span>}
                      {(onReplaceStop || onExclude) && (
                        <div className="itinerary-actions-row postcard-actions">
                          {onReplaceStop && (
                            <button type="button" className="itinerary-replace-btn" onClick={() => onReplaceStop(day.day, stopIndex, stop.title)}>
                              <Icon name="swap_horiz" size={13} /> Replace
                            </button>
                          )}
                          {onExclude && (
                            <button type="button" className="itinerary-exclude" onClick={() => onExclude(stop.title)}>
                              <Icon name="remove_circle" size={13} /> Remove
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {!compact && <p className="itinerary-note postcard-footnote"><Icon name="info" size={14} /> Times are flexible. Check Mayon visibility at dawn, plus opening hours & local transport before you head out.</p>}

      {showExport && (
        <div className="postcard-export-row" role="group" aria-label="Export itinerary">
          <button
            type="button"
            className="postcard-export-btn postcard-export-story"
            onClick={() => void handleExport("story")}
            disabled={Boolean(exporting)}
            title="Download a 1080×1920 story image with QR — perfect for Instagram Stories"
          >
            <Icon name={exporting === "story" ? "hourglass_top" : "phone_iphone"} size={16} color="white" />
            {exporting === "story" ? "Building…" : "Story 1080×1920"}
            <span className="postcard-export-sub">QR to trip</span>
          </button>
          <button
            type="button"
            className="postcard-export-btn postcard-export-poster"
            onClick={() => void handleExport("poster")}
            disabled={Boolean(exporting)}
            title="Download a ticket-style poster PNG (print to PDF from your viewer)"
          >
            <Icon name={exporting === "poster" ? "hourglass_top" : "picture_as_pdf"} size={16} color="var(--c-green-dark)" />
            {exporting === "poster" ? "Building…" : "Poster / PDF"}
            <span className="postcard-export-sub">Ticket + QR</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default PostcardTimeline;
