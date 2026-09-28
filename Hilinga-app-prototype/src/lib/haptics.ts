export type HapticKind = "light" | "medium" | "success" | "selection";

export function haptic(kind: HapticKind = "light") {
  try {
    const v = (navigator as unknown as { vibrate?: (p: number | number[]) => boolean }).vibrate;
    if (!v) return;
    switch (kind) {
      case "light": v.call(navigator, 10); break;
      case "selection": v.call(navigator, 8); break;
      case "medium": v.call(navigator, 20); break;
      case "success": v.call(navigator, [12, 30, 18]); break;
      default: v.call(navigator, 10);
    }
  } catch { /* ignore */ }
}

export function hapticIfReducedMotion(kind: HapticKind = "light") {
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  } catch {}
  haptic(kind);
}
