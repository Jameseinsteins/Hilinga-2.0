import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { ConfettiBurst } from "@/components/Confetti";
import {
  STAMP_SPOTS,
  computePassportProgress,
  type StampSpot,
  type PassportProgress,
} from "@/lib/passport-stamps";
import type { TouristVisit, TouristPassport } from "@/lib/tourist-passport";

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return <span className="material-symbols-outlined" style={{ fontSize: size }} aria-hidden="true">{name}</span>;
}

function dateShort(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
  } catch { return iso.slice(0, 10); }
}

// spot -> earliest visit that unlocked it (for showing date ribbon)
function buildSpotVisitMap(visits: TouristVisit[]): Map<string, TouristVisit> {
  // reuse deterministic matching from lib but simplified here for dates
  const sorted = [...visits].sort((a, b) => String(a.visitedAt).localeCompare(String(b.visitedAt)));
  const map = new Map<string, TouristVisit>();
  // alias check helper (inline to avoid import cycle)
  function norm(s: string): string { return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim(); }
  function matches(visit: TouristVisit, spot: StampSpot): boolean {
    const hay = norm(`${visit.businessName} ${visit.businessLocation}`);
    for (const a of spot.aliases) if (hay.includes(norm(a))) return true;
    if (hay.includes(norm(spot.shortName))) return true;
    const nameNorm = norm(spot.name);
    if (hay.includes(nameNorm)) return true;
    const toks = nameNorm.split(" ").filter(Boolean); let hits=0; for(const t of toks) if(hay.includes(t)) hits++; if(hits>=2) return true;
    return false;
  }
  // Strict: only alias-matched visits produce a stamp date — no fallback filling.
  for (const v of sorted) {
    for (const sp of STAMP_SPOTS) {
      if (map.has(sp.id)) continue;
      if (matches(v, sp)) {
        // ensure visit not already claimed
        let used = false; for (const [, usedV] of map) if (usedV.id === v.id) { used = true; break; }
        if (!used) map.set(sp.id, v);
      }
    }
  }
  return map;
}

// progress ring around Mayon (SVG)
function MayonRing({ progress }: { progress: PassportProgress }) {
  const size = 98;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const pct = progress.total ? progress.unlocked / progress.total : 0;
  const dash = C * pct;
  return (
    <div className="mayon-ring-wrap" aria-hidden>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mayon-ring-svg" role="img">
        <circle cx={size/2} cy={size/2} r={r} className="mayon-ring-bg" />
        <circle
          cx={size/2} cy={size/2} r={r}
          className="mayon-ring-fg"
          strokeDasharray={`${dash} ${C}`}
          strokeDashoffset={C * 0.25}
        />
        {/* Mayon cone */}
        <g transform={`translate(${size/2}, ${size/2 + 2})`}>
          {/* shadow */}
          <path d="M -22 14 L 0 -18 L 22 14 Z" fill="#0F2A1A" opacity={0.14} />
          {/* snowcap */}
          <path d="M -15 -5 L 0 -18 L 15 -5 L 6 2 L -6 2 Z" fill="white" opacity={0.98} />
          {/* flanks */}
          <path d="M -22 14 L -6 2 L 0 -18 L 6 2 L 22 14 Z" fill="#197A4D" />
          <path d="M 0 -18 L 6 2 L 12 14 L 0 14 Z" fill="#105E3B" />
        </g>
      </svg>
      <span className="mayon-ring-count" aria-label={`${progress.unlocked} of ${progress.total} stamps`}>
        <strong>{progress.unlocked}</strong>/{progress.total}
      </span>
    </div>
  );
}

function StampCell({
  spot,
  visit,
  unlocked,
  animate,
  onDone,
}: {
  spot: StampSpot;
  visit: TouristVisit | undefined;
  unlocked: boolean;
  animate: boolean;
  onDone?: () => void;
}) {
  // ink spread end: remove animate after 900ms
  useEffect(() => {
    if (!animate) return;
    const t = window.setTimeout(() => onDone?.(), 900);
    return () => clearTimeout(t);
  }, [animate, onDone]);
  return (
    <div
      className={[
        "stamp-cell",
        unlocked ? "stamp-unlocked" : "stamp-locked",
        `stamp-tone-${spot.tone}`,
        animate ? "stamp-animate" : "",
        `stamp-rarity-${spot.rarity}`,
      ].join(" ")}
      aria-label={`${spot.name} — ${unlocked ? "collected" : "locked"}`}
    >
      <div className="stamp-paper">
        {unlocked ? <span className="stamp-foil-shimmer" aria-hidden /> : null}
        {animate ? <span className="stamp-ink-spread" aria-hidden /> : null}
        <div className="stamp-inner">
          <span className="stamp-icon" aria-hidden>
            {unlocked ? <Icon name={spot.icon} size={28} /> : <Icon name="lock" size={18} />}
          </span>
          <strong className="stamp-name">{spot.shortName}</strong>
          <span className="stamp-subtitle">{spot.subtitle}</span>
          {unlocked && visit ? (
            <span className="stamp-date">{dateShort(visit.visitedAt)}</span>
          ) : (
            <span className="stamp-hint">Visit to unlock</span>
          )}
        </div>
        {unlocked ? <span className="stamp-perf" aria-hidden /> : null}
        {spot.rarity === "legendary" && unlocked ? <span className="stamp-star" aria-hidden>✦</span> : null}
      </div>
      {/* foil corner glint */}
      {unlocked ? <span className="stamp-foil-corner-glint" aria-hidden /> : null}
    </div>
  );
}

async function generateShareCanvas(opts: {
  fullName: string;
  touristCode: string;
  progress: PassportProgress;
  visits: TouristVisit[];
  spotMap: Map<string, TouristVisit>;
}): Promise<string> {
  const W = 1080;
  const H = 1720;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  // bg
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#F7FCF8");
  bg.addColorStop(1, "#FFFFFF");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // header bar
  ctx.fillStyle = "#0F2A1A";
  ctx.fillRect(0, 0, W, 240);
  // header text
  ctx.fillStyle = "#8FE0B6";
  ctx.font = "900 28px Inter, system-ui, sans-serif";
  ctx.letterSpacing = "2px";
  // fallback if letterSpacing unsupported: ignore
  ctx.fillText("HILINGA  ✦  ALBAY PASSPORT", 56, 62);
  ctx.fillStyle = "white";
  ctx.font = "900 56px Inter, system-ui, sans-serif";
  ctx.fillText(opts.fullName.slice(0, 28), 56, 132);
  ctx.fillStyle = "#CFE7D9";
  ctx.font = "700 26px Inter, system-ui, sans-serif";
  ctx.fillText(opts.touristCode, 56, 176);
  ctx.fillStyle = "#F5E6A3";
  // foil tier pill
  const tierLabel = `${opts.progress.tier.emoji}  ${opts.progress.tier.label}  ·  ${opts.progress.unlocked}/${opts.progress.total}`;
  // measure
  ctx.font = "900 30px Inter, system-ui, sans-serif";
  const pillW = ctx.measureText(tierLabel).width + 48;
  const pillX = W - pillW - 56;
  // pill bg gradient
  const pillGrad = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0);
  pillGrad.addColorStop(0, "#FFF8DC");
  pillGrad.addColorStop(0.5, "#D4AF37");
  pillGrad.addColorStop(1, "#FFEC8B");
  ctx.fillStyle = pillGrad;
  // rounded rect
  const r = 28;
  ctx.beginPath();
  (ctx as any).roundRect?.(pillX, 96, pillW, 56, r) ??
    (function() {
      ctx.beginPath();
      ctx.moveTo(pillX + r, 96);
      ctx.arcTo(pillX + pillW, 96, pillX + pillW, 96 + 56, r);
      ctx.arcTo(pillX + pillW, 96 + 56, pillX, 96 + 56, r);
      ctx.arcTo(pillX, 96 + 56, pillX, 96, r);
      ctx.arcTo(pillX, 96, pillX + pillW, 96, r);
      ctx.closePath();
    })();
  ctx.fill();
  ctx.fillStyle = "#4A3410";
  ctx.fillText(tierLabel, pillX + 24, 132);
  // progress bar under header
  const barX = 56, barY = 212, barW = W - 112, barH = 12;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  (ctx as any).roundRect?.(barX, barY, barW, barH, 99) ?? ctx.fillRect(barX, barY, barW, barH);
  if ((ctx as any).roundRect) ctx.fill(); else { /* already */ }
  ctx.fillStyle = "#00C07A";
  const fillW = barW * (opts.progress.total ? opts.progress.unlocked / opts.progress.total : 0);
  ctx.beginPath();
  (ctx as any).roundRect?.(barX, barY, fillW, barH, 99) ?? ctx.fillRect(barX, barY, fillW, barH);
  if ((ctx as any).roundRect) ctx.fill();

  // grid: 3 cols x 4 rows
  const cols = 3;
  const gap = 28;
  const cellW = (W - 56 * 2 - gap * (cols - 1)) / cols;
  const cellH = cellW + 36;
  const gridTop = 292;
  for (let i = 0; i < STAMP_SPOTS.length; i++) {
    const spot = STAMP_SPOTS[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 56 + col * (cellW + gap);
    const y = gridTop + row * (cellH + gap);
    const unlocked = opts.spotMap.has(spot.id) || opts.progress.unlockedIds.has(spot.id);
    // cell bg
    ctx.save();
    // shadow
    ctx.shadowColor = "rgba(15,42,26,0.08)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    // rounded rect
    const rr = 26;
    ctx.beginPath();
    if ((ctx as any).roundRect) {
      (ctx as any).roundRect(x, y, cellW, cellH, rr);
    } else {
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + cellW - rr, y);
      ctx.quadraticCurveTo(x + cellW, y, x + cellW, y + rr);
      ctx.lineTo(x + cellW, y + cellH - rr);
      ctx.quadraticCurveTo(x + cellW, y + cellH, x + cellW - rr, y + cellH);
      ctx.lineTo(x + rr, y + cellH);
      ctx.quadraticCurveTo(x, y + cellH, x, y + cellH - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.closePath();
    }
    if (unlocked) {
      const g = ctx.createLinearGradient(x, y, x, y + cellH);
      if (spot.tone === "volcano") { g.addColorStop(0,"#FFF6E8"); g.addColorStop(1,"#FFE8CC"); }
      else if (spot.tone === "lake") { g.addColorStop(0,"#EDFAFF"); g.addColorStop(1,"#D6F0FF"); }
      else if (spot.tone === "heritage") { g.addColorStop(0,"#FFF9EF"); g.addColorStop(1,"#F5E8D0"); }
      else if (spot.tone === "sunset") { g.addColorStop(0,"#FFF2F0"); g.addColorStop(1,"#FFE0D6"); }
      else if (spot.tone === "amber") { g.addColorStop(0,"#FFFBE8"); g.addColorStop(1,"#FFF0B8"); }
      else { g.addColorStop(0,"#F1FAF3"); g.addColorStop(1,"#E3F4E8"); }
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = "#F3F7F4";
    }
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = unlocked ? (spot.rarity === "legendary" ? "#D4AF37" : "#DCE9E0") : "#E4EAE6";
    ctx.lineWidth = unlocked && spot.rarity === "legendary" ? 3 : 1.5;
    ctx.stroke();
    // inner circle (stamp)
    const cx = x + cellW/2;
    const cy = y + cellW/2 - 10;
    const rad = cellW * 0.32;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI*2);
    if (unlocked) {
      const cg = ctx.createRadialGradient(cx - 12, cy - 14, 8, cx, cy, rad);
      if (spot.tone === "volcano") { cg.addColorStop(0,"#FFD9A8"); cg.addColorStop(1,"#E85A2B"); }
      else if (spot.tone === "lake") { cg.addColorStop(0,"#B8F0FF"); cg.addColorStop(1,"#0EA5B5"); }
      else if (spot.tone === "heritage") { cg.addColorStop(0,"#FFE8B8"); cg.addColorStop(1,"#8B5A1A"); }
      else if (spot.tone === "sunset") { cg.addColorStop(0,"#FFD6C2"); cg.addColorStop(1,"#E85D4E"); }
      else if (spot.tone === "amber") { cg.addColorStop(0,"#FFEC8B"); cg.addColorStop(1,"#C9A227"); }
      else { cg.addColorStop(0,"#CFEEDC"); cg.addColorStop(1,"#197A4D"); }
      ctx.fillStyle = cg;
    } else { ctx.fillStyle = "#E9EFEB"; }
    ctx.fill();
    if (unlocked) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6,6]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "#DCE6E0";
      ctx.setLineDash([7,7]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // icon text: emoji-ish — use shortName first letter
    ctx.fillStyle = unlocked ? "white" : "#8FA89A";
    ctx.font = unlocked ? "900 42px Inter, system-ui" : "700 28px Inter, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const letter = spot.shortName.slice(0, 2).toUpperCase();
    ctx.fillText(letter, cx, cy + 2);
    // reset align
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    // name
    ctx.fillStyle = "#0F2A1A";
    ctx.font = "900 26px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(spot.shortName, x + cellW/2, y + cellW + 18, cellW - 16);
    ctx.fillStyle = unlocked ? "#26734A" : "#8E9A94";
    ctx.font = "700 20px Inter, system-ui, sans-serif";
    const dateStr = unlocked ? (opts.spotMap.get(spot.id)?.visitedAt ? dateShort(opts.spotMap.get(spot.id)!.visitedAt) : "Collected") : "Visit to unlock";
    ctx.fillText(dateStr, x + cellW/2, y + cellW + 44, cellW - 12);
    ctx.restore();
  }

  // footer
  const footerY = gridTop + 4 * (cellH + gap) + 24;
  ctx.fillStyle = "#75837B";
  ctx.font = "700 22px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("hilinga.app  ·  Discover Albay  ·  Balik ka!", W/2, footerY);
  ctx.fillStyle = "#9AA8A0";
  ctx.font = "600 20px Inter, system-ui, sans-serif";
  ctx.fillText(new Date().toLocaleDateString("en-PH", { month:"long", day:"numeric", year:"numeric" }), W/2, footerY + 30);
  ctx.textAlign = "left";
  // border
  ctx.strokeStyle = "#E8EEEA";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W-2, H-2);
  return canvas.toDataURL("image/png");
}

export function PassportStampBook({
  visits,
  visitsLoading,
  visitsError,
  passport,
  fullName,
}: {
  visits: TouristVisit[];
  visitsLoading: boolean;
  visitsError: string;
  passport: TouristPassport | null;
  fullName: string;
}) {
  const progress = computePassportProgress(visits);
  const spotMap = buildSpotVisitMap(visits);
  const [celebratingId, setCelebratingId] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const prevUnlockedRef = useRef<Set<string>>(new Set());
  const tier = progress.tier;
  const nextTier = progress.nextTier;

  // detect newly unlocked
  useEffect(() => {
    const prev = prevUnlockedRef.current;
    const cur = progress.unlockedIds;
    let newly: string | null = null;
    for (const id of cur) if (!prev.has(id)) { newly = id; break; }
    if (newly && prev.size !== 0) {
      // not on initial load where prev empty: still celebrate but haptic+confetti
      setCelebratingId(newly);
      setConfetti(true);
      try { haptic("success"); } catch {}
      const t = window.setTimeout(() => setCelebratingId(null), 1400);
      return () => clearTimeout(t);
    }
    prevUnlockedRef.current = new Set(cur);
    if (prev.size === 0 && cur.size > 0) {
      prevUnlockedRef.current = new Set(cur);
    }
  }, [progress.unlockedIds]);

  // keep ref in sync after first render without double fire
  useEffect(() => {
    prevUnlockedRef.current = new Set(progress.unlockedIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    setShareMsg("");
    try {
      const dataUrl = await generateShareCanvas({
        fullName: fullName || passport?.firstName || "Hilinga Traveler",
        touristCode: passport?.touristCode || "HLG-U-000000",
        progress,
        visits,
        spotMap,
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `hilinga-passport-${progress.unlocked}of${progress.total}.png`, { type: "image/png" });
      // Try Web Share with files
      const canShare = (navigator as any).canShare?.({ files: [file] });
      if (canShare && (navigator as any).share) {
        await (navigator as any).share({ files: [file], title: "My Hilinga Albay Passport", text: `${fullName} — ${progress.unlocked}/${progress.total} Albay stamps · ${tier.label}` });
        setShareMsg("Shared!");
        try { haptic("success"); } catch {}
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `hilinga-passport-${progress.unlocked}of${progress.total}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setShareMsg("Image saved — share it anywhere!");
      }
    } catch (e) {
      setShareMsg(e instanceof Error ? e.message : "Could not generate image.");
    } finally {
      setSharing(false);
      window.setTimeout(() => setShareMsg(""), 3200);
    }
  }

  if (visitsLoading) {
    return (
      <section className="stamp-book stamp-book-loading" aria-busy="true">
        <div className="spinner" /><span>Opening your Albay passport…</span>
      </section>
    );
  }

  return (
    <section className="stamp-book" aria-labelledby="stamp-book-title">
      <ConfettiBurst active={confetti} onDone={() => setConfetti(false)} />
      <div className="stamp-book-kicker">FOIL STAMP BOOK · 12 VERIFIED ALBAY SPOTS</div>
      <div className="stamp-book-header">
        <MayonRing progress={progress} />
        <div className="stamp-book-copy">
          <h3 id="stamp-book-title" className="stamp-book-title">
            <span className="stamp-tier-emoji" aria-hidden>{tier.emoji}</span> {tier.label}
          </h3>
          <p className="stamp-book-blurb">{tier.blurb}</p>
          <div className="stamp-book-meta">
            <span className="stamp-count-pill">{progress.unlocked}/{progress.total} stamps</span>
            {nextTier ? (
              <span className="stamp-next">
                {progress.neededForNext} more to <strong>{nextTier.emoji} {nextTier.label}</strong>
              </span>
            ) : (
              <span className="stamp-next stamp-complete">All stamps collected — Albay Ano! 👑</span>
            )}
          </div>
          <div className="stamp-progress-track" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Passport progress">
            <span className="stamp-progress-fill" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      </div>

      {visitsError ? (
        <div className="stamp-book-error" role="alert"><Icon name="error" size={18} /> {visitsError}</div>
      ) : null}

      <div className="stamp-grid" role="list" aria-label="Albay stamp collection">
        {STAMP_SPOTS.map((spot) => {
          const unlocked = progress.unlockedIds.has(spot.id);
          const visit = spotMap.get(spot.id);
          return (
            <div key={spot.id} role="listitem">
              <StampCell
                spot={spot}
                visit={visit}
                unlocked={unlocked}
                animate={celebratingId === spot.id}
                onDone={() => setCelebratingId(null)}
              />
            </div>
          );
        })}
      </div>

      <div className="stamp-book-actions">
        <button className="stamp-share-btn" onClick={handleShare} disabled={sharing} aria-label="Share stamp page as image">
          <Icon name={sharing ? "hourglass_top" : "ios_share"} size={18} />
          {sharing ? "Preparing image…" : "Share my stamps"}
        </button>
        <span className="stamp-share-hint">Generates a shareable image — no upload needed.</span>
      </div>
      {shareMsg ? <p className="stamp-share-msg" role="status" aria-live="polite">{shareMsg}</p> : null}

      {/* Detail drawer: compact log under stamps */}
      <details className="stamp-log-details">
        <summary>
          <Icon name="receipt_long" size={16} /> Detailed logbook ({visits.length})
          <Icon name="expand_more" size={18} />
        </summary>
        {visits.length === 0 ? (
          <p className="stamp-log-empty">No visits yet — let a registered business scan your Profile QR to earn your first foil stamp.</p>
        ) : (
          <ul className="stamp-log-list">
            {visits.slice(0, 30).map((v) => (
              <li key={v.id}>
                <span className="stamp-log-icon"><Icon name="storefront" size={16} /></span>
                <span className="stamp-log-copy">
                  <strong>{v.businessName}</strong>
                  <span>{[v.businessLocation, dateShort(v.visitedAt)].filter(Boolean).join(" · ")}</span>
                </span>
                <Icon name="check_circle" size={16} />
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
