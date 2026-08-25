import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/providers/auth-provider";
import {
  recordTouristVisit,
  resolveTouristQr,
  subscribeToBusinessVisits,
  type TouristPassport,
  type TouristVisit,
} from "@/lib/tourist-passport";

type BarcodeDetectorLike = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> };
type BarcodeDetectorConstructorLike = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

type BusinessVisitorsProps = {
  businessName: string;
  businessLocation: string;
  initialQrValue?: string;
};

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return <span className="material-symbols-outlined" style={{ fontSize: size }} aria-hidden="true">{name}</span>;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function removeIncomingTouristToken() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("tourist_token")) return;
  url.searchParams.delete("tourist_token");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function BusinessVisitors({ businessName, businessLocation, initialQrValue = "" }: BusinessVisitorsProps) {
  const { user } = useAuth();
  const [visitors, setVisitors] = useState<TouristVisit[]>([]);
  const [visitorsLoading, setVisitorsLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [passport, setPassport] = useState<TouristPassport | null>(null);
  const [message, setMessage] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const [filter, setFilter] = useState("Today");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const detectorTimerRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const consumedInitialQrRef = useRef("");

  useEffect(() => {
    if (!user?.uid) return;
    setVisitorsLoading(true);
    return subscribeToBusinessVisits(
      user.uid,
      (items) => { setVisitors(items); setVisitorsLoading(false); },
      (error) => { setMessage(error.message); setVisitorsLoading(false); },
    );
  }, [user?.uid]);

  const stopScanner = useCallback(() => {
    if (detectorTimerRef.current !== null) window.clearTimeout(detectorTimerRef.current);
    detectorTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    detectorRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => stopScanner, [stopScanner]);

  const scanValue = useCallback(async (value: string, method: "camera" | "manual") => {
    if (!user?.uid || scanningRef.current || !value.trim()) return;
    scanningRef.current = true;
    setScanning(true);
    setMessage("Validating this Tourist QR…");
    setPassport(null);
    try {
      const nextPassport = await resolveTouristQr(value);
      const result = await recordTouristVisit({
        passport: nextPassport,
        businessId: user.uid,
        businessName,
        businessLocation,
        scannedBy: user.uid,
        scanMethod: method,
      });
      setPassport(nextPassport);
      setMessage(result.duplicate
        ? `This tourist was already logged at ${timeLabel(result.visit.visitedAt)}. No duplicate visit was created.`
        : `Visit recorded at ${timeLabel(result.visit.visitedAt)}. Both logbooks are now updated.`);
      setManualToken("");
    } catch (error) {
      setPassport(null);
      setMessage(error instanceof Error ? error.message : "That QR could not be validated.");
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }, [businessLocation, businessName, user?.uid]);

  useEffect(() => {
    if (!initialQrValue || !user?.uid || consumedInitialQrRef.current === initialQrValue) return;
    consumedInitialQrRef.current = initialQrValue;
    // Remove the bearer token from browser history before the network request.
    removeIncomingTouristToken();
    void scanValue(initialQrValue, "camera");
  }, [initialQrValue, scanValue, user?.uid]);

  const detectLoop = useCallback(async () => {
    if (!detectorRef.current || !videoRef.current || !streamRef.current) return;
    if (!scanningRef.current) {
      try {
        const result = await detectorRef.current.detect(videoRef.current);
        const value = result[0]?.rawValue;
        if (value) {
          await scanValue(value, "camera");
          return;
        }
      } catch {
        // A video frame may be unavailable while the camera is starting.
      }
    }
    detectorTimerRef.current = window.setTimeout(() => void detectLoop(), 350);
  }, [scanValue]);

  async function startScanner() {
    setScannerOpen(true);
    setMessage("");
    setPassport(null);
    setCameraAvailable(true);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    const BarcodeDetectorClass = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructorLike }).BarcodeDetector;
    if (!BarcodeDetectorClass || !navigator.mediaDevices?.getUserMedia) {
      setCameraAvailable(false);
      setMessage("Camera scanning is unavailable in this browser. Paste the QR link or token below.");
      return;
    }
    try {
      detectorRef.current = new BarcodeDetectorClass({ formats: ["qr_code"] });
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play();
      }
      void detectLoop();
    } catch {
      stopScanner();
      setCameraAvailable(false);
      setMessage("Camera access is unavailable. Paste the QR link or token below instead.");
    }
  }

  function closeScanner() {
    stopScanner();
    setScannerOpen(false);
    setPassport(null);
    setCameraAvailable(true);
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const filteredVisitors = visitors.filter((visit) => (
    filter === "All"
    || filter === "Today" && new Date(visit.visitedAt) >= todayStart
    || filter === "This week" && new Date(visit.visitedAt).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000
  ));
  const localVisitors = filteredVisitors.filter((visit) => visit.touristCountry === "Philippines").length;
  const internationalVisitors = filteredVisitors.length - localVisitors;

  return (
    <div className="business-visitors-screen">
      <header className="business-page-header">
        <span>TOURIST PASSPORT</span>
        <h1>Visitors</h1>
        <p>Scan a Hilinga Tourist QR to record the visit in both your business logbook and the tourist’s profile.</p>
      </header>

      <section className="business-scan-hero">
        <div><span className="business-overline">DIGITAL TOURIST LOGBOOK</span><h2>Welcome visitors with one scan.</h2><p>Only active Hilinga Tourist QRs are accepted. Sensitive account information is never shown.</p></div>
        <button className="business-scan-button" onClick={() => void startScanner()} disabled={scanning}><Icon name="qr_code_scanner" size={23} /> Scan Tourist QR</button>
      </section>

      {message && !scannerOpen ? <p className="business-visitor-message" role="status" aria-live="polite">{message}</p> : null}

      <section className="business-visitor-stats" aria-label="Visitor summary">
        <article><span>Visitors</span><strong>{filteredVisitors.length}</strong><small>{filter.toLowerCase()}</small></article>
        <article><span>Domestic</span><strong>{localVisitors}</strong><small>Philippines</small></article>
        <article><span>International</span><strong>{internationalVisitors}</strong><small>Other countries</small></article>
      </section>

      <section className="business-visitor-list-card" aria-busy={visitorsLoading}>
        <div className="business-card-heading"><div><span>VISIT LOG</span><h2>Recent visitors</h2></div><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter visitor logs"><option>Today</option><option>This week</option><option>All</option></select></div>
        {visitorsLoading
          ? <div className="business-logbook-loading"><div className="spinner" /><span>Loading visitor logbook…</span></div>
          : filteredVisitors.length === 0
            ? <div className="business-empty-state"><span><Icon name="groups" size={30} /></span><strong>No visits in this period</strong><p>Successful scans will appear here automatically.</p></div>
            : <div className="business-visitor-table">{filteredVisitors.map((visit) => <article key={visit.id}><div className="business-visitor-avatar"><Icon name="person" size={20} /></div><div><strong>{visit.touristName || "Hilinga tourist"}</strong><span>{visit.touristCode} · {visit.touristProvince || visit.touristCountry}</span></div><time dateTime={visit.visitedAt}><strong>{dateLabel(visit.visitedAt)}</strong><span>{timeLabel(visit.visitedAt)}</span></time></article>)}</div>}
      </section>

      {scannerOpen ? <div className="business-modal-backdrop" onClick={(event) => event.target === event.currentTarget && closeScanner()}><section className="business-create-sheet business-scanner-sheet" role="dialog" aria-modal="true" aria-labelledby="business-scanner-title"><header><div><span>SCAN TOURIST</span><h2 id="business-scanner-title">Scan Tourist QR</h2></div><button type="button" onClick={closeScanner} aria-label="Close scanner"><Icon name="close" /></button></header>{cameraAvailable ? <div className="business-camera-frame"><video ref={videoRef} muted playsInline /><div className="business-camera-reticle" /><p>Place the tourist’s Hilinga QR inside the frame.</p></div> : <div className="business-camera-unavailable"><Icon name="no_photography" size={34} /><strong>Camera scanner unavailable</strong><span>Use the manual fallback below to validate a Hilinga QR token.</span></div>}<label className="business-token-field">QR link or token<input value={manualToken} onChange={(event) => setManualToken(event.target.value)} placeholder="Paste the tourist QR link or token" /></label><button className="business-publish-button" onClick={() => void scanValue(manualToken, "manual")} disabled={scanning || !manualToken.trim()}>{scanning ? "Validating…" : "Validate and record visit"}</button>{passport ? <div className="business-tourist-result"><span className="business-result-check"><Icon name="check" size={20} /></span><div><span>VISIT RECORDED</span><strong>{passport.firstName} {passport.lastName}</strong><p>{passport.touristCode} · {[passport.city, passport.province].filter(Boolean).join(", ") || passport.country}</p><small>{passport.nationality} · {passport.verificationStatus === "verified" ? "Verified tourist" : "Verification pending"}</small></div></div> : null}{message ? <p className="business-visitor-message" role="status" aria-live="polite">{message}</p> : null}</section></div> : null}
    </div>
  );
}
