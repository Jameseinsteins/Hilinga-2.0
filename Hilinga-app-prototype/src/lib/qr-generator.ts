/**
 * Built-in QR Generator — zero external API, no key, works offline.
 * Wraps npm `qrcode` (already in dependencies) with a clean app API.
 * Every user gets a unique QR because the payload is touristQrUrl(qrToken) per user.
 */

export type QrGenerateOptions = {
  /** pixel size of the rendered image (width=height). Default 320 */
  width?: number;
  /** quiet zone margin modules. Default 3 */
  margin?: number;
  /** error correction: L(7%) M(15%) Q(25%) H(30%). Default M */
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  /** colors — dark = QR modules, light = background. Defaults Hilinga brand. */
  color?: { dark: string; light: string };
  /** image format for data URL — qrcode `toDataURL` only supports PNG data URLs. */
  type?: "image/png";
};

const DEFAULTS: Required<QrGenerateOptions> = {
  width: 320,
  margin: 3,
  errorCorrectionLevel: "M",
  color: { dark: "#102f23", light: "#ffffff" },
  type: "image/png",
};

function normalizeOptions(options: QrGenerateOptions = {}): Required<QrGenerateOptions> {
  return {
    width: options.width ?? DEFAULTS.width,
    margin: options.margin ?? DEFAULTS.margin,
    errorCorrectionLevel: options.errorCorrectionLevel ?? DEFAULTS.errorCorrectionLevel,
    color: options.color ?? DEFAULTS.color,
    type: "image/png",
  };
}

/**
 * Generate a PNG data URL for any text/URL payload.
 * Throws if payload is empty.
 */
export async function generateQrDataUrl(data: string, options: QrGenerateOptions = {}): Promise<string> {
  const text = String(data ?? "").trim();
  if (!text) throw new Error("QR payload is empty");
  const opts = normalizeOptions(options);
  // dynamic import keeps initial bundle small; `qrcode` is code-split
  const mod = (await import("qrcode")) as unknown as {
    default: { toDataURL: (text: string, opts: unknown) => Promise<string> };
  };
  const QRCode = mod.default ?? (mod as unknown as { toDataURL: (t: string, o: unknown) => Promise<string> });
  const fn = (QRCode as { toDataURL: (t: string, o: unknown) => Promise<string> }).toDataURL ?? (mod as unknown as { toDataURL: (t: string, o: unknown) => Promise<string> }).toDataURL;
  return fn(text, {
    width: opts.width,
    margin: opts.margin,
    errorCorrectionLevel: opts.errorCorrectionLevel,
    color: opts.color,
    type: opts.type,
  });
}

/**
 * Generate an SVG string for the same payload — useful for print-quality or
 * embedding. Returns raw `<svg ...>` markup.
 */
export async function generateQrSvgString(data: string, options: QrGenerateOptions = {}): Promise<string> {
  const text = String(data ?? "").trim();
  if (!text) throw new Error("QR payload is empty");
  const opts = normalizeOptions(options);
  const mod = (await import("qrcode")) as unknown as {
    default: { toString: (text: string, opts: unknown) => Promise<string> };
    toString: (text: string, opts: unknown) => Promise<string>;
  };
  const toString = (mod.default?.toString ?? mod.toString) as (t: string, o: unknown) => Promise<string>;
  return toString(text, {
    type: "svg",
    width: opts.width,
    margin: opts.margin,
    errorCorrectionLevel: opts.errorCorrectionLevel,
    color: opts.color,
  });
}

/**
 * Quick payload validation before generation — prevents confusing errors
 * from the underlying library.
 */
export function isValidQrPayload(data: string): boolean {
  const t = String(data ?? "").trim();
  // QR can encode up to ~2953 bytes; we just check non-empty and not insane length
  return t.length > 0 && t.length <= 4000;
}

/**
 * Trigger a PNG download from a data URL (or any image URL).
 * For data URLs this is instant; for external https URLs the caller should
 * have already fetched to a data URL (but this helper still handles both).
 */
export async function downloadQrDataUrl(dataUrl: string, filename: string): Promise<void> {
  if (!dataUrl) throw new Error("No QR image to download");
  const isExternal = dataUrl.startsWith("http://") || dataUrl.startsWith("https://");
  let href = dataUrl;
  let objectUrl: string | null = null;
  if (isExternal) {
    const res = await fetch(dataUrl);
    if (!res.ok) throw new Error(`QR fetch failed: ${res.status}`);
    const blob = await res.blob();
    objectUrl = URL.createObjectURL(blob);
    href = objectUrl;
  }
  const link = document.createElement("a");
  link.href = href;
  link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 1000);
}
