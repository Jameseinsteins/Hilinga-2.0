import { useEffect, useState } from "react";
import { generateQrDataUrl, type QrGenerateOptions } from "@/lib/qr-generator";

type QrCodeProps = {
  /** Payload to encode — for profile QR this is touristQrUrl(qrToken), unique per user */
  value: string;
  size?: number;
  margin?: number;
  errorCorrectionLevel?: QrGenerateOptions["errorCorrectionLevel"];
  fgColor?: string;
  bgColor?: string;
  alt?: string;
  className?: string;
  /** optional callback with final data URL */
  onReady?: (dataUrl: string) => void;
};

export function QrCode({
  value,
  size = 320,
  margin = 3,
  errorCorrectionLevel = "M",
  fgColor = "#102f23",
  bgColor = "#ffffff",
  alt = "QR code",
  className,
  onReady,
}: QrCodeProps) {
  const [src, setSrc] = useState<string>("");
  const [state, setState] = useState<"idle" | "generating" | "ready" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const text = String(value ?? "").trim();
    if (!text) {
      setSrc("");
      setState("idle");
      setError("");
      return;
    }
    let cancelled = false;
    setState("generating");
    setError("");
    setSrc("");
    void generateQrDataUrl(text, {
      width: size,
      margin,
      errorCorrectionLevel,
      color: { dark: fgColor, light: bgColor },
    })
      .then((url) => {
        if (cancelled) return;
        setSrc(url);
        setState("ready");
        onReady?.(url);
      })
      .catch((e) => {
        if (cancelled) return;
        setState("error");
        setError(e instanceof Error ? e.message : "Could not generate QR");
      });
    return () => {
      cancelled = true;
    };
  }, [value, size, margin, errorCorrectionLevel, fgColor, bgColor, onReady]);

  if (state === "generating") {
    return (
      <div className="qr-code-loading" aria-busy="true" style={{ width: size, height: size, display: "grid", placeItems: "center" }}>
        <span className="spinner" aria-hidden="true" />
      </div>
    );
  }
  if (state === "error") {
    return (
      <div role="alert" className="qr-code-error" style={{ width: size, minHeight: size, display: "grid", placeItems: "center", padding: 12, textAlign: "center", fontSize: 12 }}>
        {error}
      </div>
    );
  }
  if (state === "ready" && src) {
    return <img src={src} alt={alt} width={size} height={size} className={className} style={{ width: size, height: size, imageRendering: "pixelated" as const }} />;
  }
  return null;
}

/**
 * Hook version for cases where you need the data URL directly (e.g. fullscreen modal, download).
 */
export function useQrDataUrl(value: string, size = 320, options: Omit<QrGenerateOptions, "width"> = {}) {
  const [dataUrl, setDataUrl] = useState("");
  const [state, setState] = useState<"idle" | "generating" | "ready" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const text = String(value ?? "").trim();
    if (!text) {
      setDataUrl("");
      setState("idle");
      return;
    }
    let cancelled = false;
    setState("generating");
    setError("");
    void generateQrDataUrl(text, { width: size, ...options })
      .then((url) => {
        if (cancelled) return;
        setDataUrl(url);
        setState("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setState("error");
        setError(e instanceof Error ? e.message : "Could not generate QR");
      });
    return () => {
      cancelled = true;
    };
  }, [value, size, JSON.stringify(options)]);

  return { dataUrl, state, error };
}
