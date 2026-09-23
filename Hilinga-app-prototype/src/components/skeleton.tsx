import type { CSSProperties } from "react";

type SkProps = {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  className?: string;
  style?: CSSProperties;
};

export function Skeleton({ width, height, radius = 12, className = "", style }: SkProps) {
  return (
    <div
      className={`sk ${className}`}
      style={{
        width: width as any,
        height: height as any,
        borderRadius: typeof radius === "number" ? `${radius}px` : radius,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 3, gap = 8 }: { lines?: number; gap?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? "62%" : "100%"} radius={999} />
      ))}
    </div>
  );
}

export function SkeletonExploreShelf() {
  return (
    <section className="explore-shelf">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Skeleton width={110} height={10} radius={999} />
          <Skeleton width={160} height={16} radius={8} />
        </div>
        <Skeleton width={64} height={28} radius={999} />
      </div>
      <div className="explore-card-row">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="explore-poster-card" style={{ pointerEvents: "none" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <Skeleton height={148} radius={14} style={{ marginBottom: 10 }} />
              <Skeleton width="82%" height={14} radius={6} style={{ marginBottom: 6 }} />
              <Skeleton width="100%" height={10} radius={6} style={{ marginBottom: 4 }} />
              <Skeleton width="62%" height={10} radius={6} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SkeletonFeedCard() {
  return (
    <div className="feed-card" style={{ pointerEvents: "none" }}>
      <Skeleton height={170} radius={14} />
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton width={88} height={10} radius={999} />
        <Skeleton width="74%" height={15} radius={6} />
        <SkeletonText lines={2} />
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <Skeleton width={88} height={28} radius={999} />
          <Skeleton width={88} height={28} radius={999} />
        </div>
      </div>
    </div>
  );
}

export function SkeletonItinerary() {
  return (
    <div className="itinerary-preview">
      <Skeleton height={62} radius={14} />
      {Array.from({ length: 2 }).map((_, di) => (
        <div key={di} className="itinerary-day">
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <Skeleton width={46} height={10} radius={999} />
            <Skeleton width={180} height={14} radius={6} />
          </div>
          <div className="itinerary-timeline">
            {Array.from({ length: 3 }).map((_, si) => (
              <div key={si} className="itinerary-stop">
                <Skeleton width={32} height={32} radius={10} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <Skeleton width={74} height={10} radius={999} />
                  <Skeleton width="68%" height={13} radius={6} />
                  <SkeletonText lines={2} gap={6} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonPlanner() {
  return (
    <div className="screen planner-screen">
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        <Skeleton width={160} height={22} radius={8} />
        <Skeleton width="78%" height={12} radius={6} />
      </div>
      <Skeleton height={148} radius={18} />
      <div style={{ display: "flex", gap: 8 }}>
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={28} radius={999} style={{ flex: 1 }} />)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 6 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <Skeleton width="62%" height={16} radius={6} />
            <div style={{ display: "flex", gap: 8 }}>
              <Skeleton width={96} height={24} radius={999} />
              <Skeleton width={140} height={24} radius={999} />
            </div>
            <Skeleton height={42} radius={13} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonHome() {
  return (
    <div className="screen" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="card" style={{ padding: 18, display: "flex", gap: 14, alignItems: "center" }}>
        <Skeleton width={52} height={52} radius={14} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton width="54%" height={16} radius={6} />
          <Skeleton width="84%" height={10} radius={6} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={72} radius={16} />)}
      </div>
      <SkeletonExploreShelf />
    </div>
  );
}

export function SkeletonProfile() {
  return (
    <div className="screen" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Skeleton width={72} height={72} radius={22} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton width="42%" height={18} radius={6} />
          <Skeleton width="64%" height={11} radius={6} />
          <Skeleton width="88%" height={10} radius={999} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={86} radius={16} />)}
      </div>
      <Skeleton height={120} radius={16} />
    </div>
  );
}

export function SkeletonSaved() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card" style={{ padding: 12, display: "flex", gap: 12, alignItems: "center" }}>
          <Skeleton width={56} height={56} radius={12} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton width="68%" height={14} radius={6} />
            <Skeleton width="88%" height={11} radius={999} />
          </div>
          <Skeleton width={36} height={36} radius={999} />
        </div>
      ))}
    </div>
  );
}

