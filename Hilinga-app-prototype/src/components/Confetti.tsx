import { useEffect, useState } from "react";

// Lightweight CSS confetti — no deps, fires once then cleans up
export function ConfettiBurst({ active, onDone }: { active: boolean; onDone?: () => void }) {
  const [render, setRender] = useState(false);
  useEffect(() => {
    if (!active) return;
    setRender(true);
    const t = window.setTimeout(() => { setRender(false); onDone?.(); }, 1200);
    return () => clearTimeout(t);
  }, [active, onDone]);
  if (!render) return null;
  const pieces = Array.from({ length: 18 }, (_, i) => i);
  const colors = ["#197A4D", "#F5C518", "#FF6B6B", "#4ECDC4", "#FF9F1C", "#9B59B6"];
  return (
    <div aria-hidden className="confetti-layer">
      {pieces.map((i) => {
        const left = 8 + (i * 5.3) % 84;
        const delay = (i % 5) * 0.07;
        const dur = 0.7 + (i % 3) * 0.22;
        const color = colors[i % colors.length];
        const rot = (i * 47) % 360;
        return (
          <i
            key={i}
            className="confetti-piece"
            style={{
              left: `${left}%`,
              background: color,
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
              transform: `rotate(${rot}deg)`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}
