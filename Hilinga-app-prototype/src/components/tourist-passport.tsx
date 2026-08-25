import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/providers/auth-provider";
import {
  ensureTouristPassport,
  regenerateTouristQr,
  saveTouristPassport,
  setTouristQrStatus,
  subscribeToTouristVisits,
  touristQrUrl,
  type TouristPassport,
  type TouristVisit,
} from "@/lib/tourist-passport";

type QrImageState = "idle" | "generating" | "ready" | "error";

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return <span className="material-symbols-outlined" style={{ fontSize: size }} aria-hidden="true">{name}</span>;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function TouristPassport() {
  const { user, profile, avatarUrl } = useAuth();
  const [passport, setPassport] = useState<TouristPassport | null>(null);
  const [passportLoading, setPassportLoading] = useState(true);
  const [passportError, setPassportError] = useState("");
  const [passportLoadAttempt, setPassportLoadAttempt] = useState(0);
  const [visits, setVisits] = useState<TouristVisit[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(true);
  const [visitsError, setVisitsError] = useState("");
  const [qrImage, setQrImage] = useState("");
  const [qrImageState, setQrImageState] = useState<QrImageState>("idle");
  const [qrError, setQrError] = useState("");
  const [qrGenerationAttempt, setQrGenerationAttempt] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState({ nationality: "Filipino", country: "Philippines", region: "", province: "", city: "" });

  useEffect(() => {
    if (!user?.uid) {
      setPassport(null);
      setPassportLoading(false);
      return;
    }
    let cancelled = false;
    setPassportLoading(true);
    setPassportError("");
    void ensureTouristPassport(user.uid, profile?.display_name || user.email?.split("@")[0] || "Traveler", avatarUrl || "")
      .then((next) => {
        if (cancelled) return;
        setPassport(next);
        setDraft({ nationality: next.nationality, country: next.country, region: next.region, province: next.province, city: next.city });
      })
      .catch((error) => {
        if (cancelled) return;
        setPassport(null);
        setPassportError(error instanceof Error ? error.message : "Your tourist passport could not be loaded.");
      })
      .finally(() => { if (!cancelled) setPassportLoading(false); });
    return () => { cancelled = true; };
  }, [avatarUrl, passportLoadAttempt, profile?.display_name, user?.email, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setVisits([]);
      setVisitsLoading(false);
      return;
    }
    setVisitsLoading(true);
    setVisitsError("");
    return subscribeToTouristVisits(
      user.uid,
      (items) => { setVisits(items); setVisitsLoading(false); },
      (error) => { setVisitsError(error.message); setVisitsLoading(false); },
    );
  }, [user?.uid]);

  const qrToken = passport?.qrToken ?? "";
  const qrStatus = passport?.qrStatus ?? "disabled";
  useEffect(() => {
    if (!qrToken || qrStatus !== "active") {
      setQrImage("");
      setQrImageState("idle");
      setQrError("");
      return;
    }
    let cancelled = false;
    setQrImage("");
    setQrImageState("generating");
    setQrError("");
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(touristQrUrl(qrToken), {
        width: 320,
        margin: 3,
        errorCorrectionLevel: "M",
        color: { dark: "#102f23", light: "#ffffff" },
      }))
      .then((image) => {
        if (cancelled) return;
        setQrImage(image);
        setQrImageState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setQrImageState("error");
        setQrError("The QR image could not be generated. Check your connection and try again.");
      });
    return () => { cancelled = true; };
  }, [qrGenerationAttempt, qrStatus, qrToken]);

  useEffect(() => {
    if (!fullscreen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [fullscreen]);

  const fullName = useMemo(() => `${passport?.firstName || "Traveler"} ${passport?.lastName || ""}`.trim(), [passport?.firstName, passport?.lastName]);
  const origin = [passport?.city, passport?.province || passport?.region].filter(Boolean).join(", ") || "Add your hometown";
  const qrReady = qrImageState === "ready" && Boolean(qrImage);

  async function saveDetails() {
    if (!user?.uid || !passport || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const next = await saveTouristPassport(user.uid, { ...draft, profilePhoto: avatarUrl || passport.profilePhoto });
      setPassport(next);
      setDetailsOpen(false);
      setMessage("Tourist passport updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your tourist details could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function enableQr() {
    if (!user?.uid || !passport || saving) return;
    setSaving(true);
    setMessage("");
    try {
      setPassport(await setTouristQrStatus(user.uid, "active", true));
      setMessage("Your Tourist QR is active and ready for registered businesses.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Tourist QR could not be enabled.");
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    if (!user?.uid || saving || !window.confirm("Regenerate your Tourist QR? The current QR will stop working immediately.")) return;
    setSaving(true);
    setMessage("");
    try {
      setPassport(await regenerateTouristQr(user.uid));
      setMessage("A new Tourist QR is active. Your old QR was revoked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Tourist QR could not be regenerated.");
    } finally {
      setSaving(false);
    }
  }

  async function disable() {
    if (!user?.uid || !passport || saving || !window.confirm("Disable your Tourist QR? Businesses will no longer be able to scan it.")) return;
    setSaving(true);
    setMessage("");
    try {
      setPassport(await setTouristQrStatus(user.uid, "disabled", false));
      setMessage("Your Tourist QR is disabled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Tourist QR could not be disabled.");
    } finally {
      setSaving(false);
    }
  }

  function downloadQr() {
    if (!qrReady || !passport) return;
    const link = document.createElement("a");
    link.href = qrImage;
    link.download = `${passport.touristCode}-tourist-qr.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  if (passportLoading) {
    return <section className="passport-card passport-loading" aria-busy="true"><div className="spinner" /><span>Preparing your Tourist Passport…</span></section>;
  }

  if (!passport) {
    return <section className="passport-card passport-load-error" role="alert"><span><Icon name="qr_code_2" size={30} /></span><strong>Tourist Passport unavailable</strong><p>{passportError || "Your passport could not be loaded."}</p><button className="passport-primary" onClick={() => setPassportLoadAttempt((value) => value + 1)}>Try again</button></section>;
  }

  return (
    <>
      <section className="passport-card" aria-labelledby="passport-title">
        <div className="passport-heading"><div><span className="passport-kicker">HILINGA TOURIST PASSPORT</span><h3 id="passport-title">My Tourist QR</h3><p>Use this secure QR at registered Hilinga establishments.</p></div><span className={`passport-status ${passport.qrStatus}`}><span />{passport.qrStatus === "active" ? "Active" : "Not active"}</span></div>
        {passport.qrStatus === "active" ? <>
          <div className="passport-qr-stage" aria-busy={qrImageState === "generating"}>
            {qrReady ? <img src={qrImage} alt={`Tourist QR for ${fullName}`} /> : null}
            {qrImageState === "generating" ? <div className="passport-qr-feedback"><div className="spinner" /><span>Generating secure QR…</span></div> : null}
            {qrImageState === "error" ? <div className="passport-qr-feedback passport-qr-error"><Icon name="error" size={26} /><span>{qrError}</span><button onClick={() => setQrGenerationAttempt((value) => value + 1)}>Try again</button></div> : null}
            <strong>{passport.touristCode}</strong>
          </div>
          <div className="passport-identity"><div className="passport-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : <Icon name="person" size={24} />}</div><div><strong>{fullName}</strong><span>{origin} · {passport.country}</span><small><Icon name="verified" size={15} /> {passport.verificationStatus === "verified" ? "Verified tourist" : "Verification pending"}</small></div></div>
          <div className="passport-actions"><button className="passport-primary" onClick={() => setFullscreen(true)} disabled={!qrReady}><Icon name="fullscreen" size={19} /> Show My QR</button><button onClick={downloadQr} disabled={!qrReady}><Icon name="download" size={18} /> Download</button><button onClick={regenerate} disabled={saving}><Icon name="autorenew" size={18} /> Regenerate</button></div>
          <button className="passport-danger-link" onClick={disable} disabled={saving}>Disable Tourist QR</button>
        </> : <div className="passport-consent"><div className="passport-consent-icon"><Icon name="qr_code_2" size={34} /></div><h4>Enable your Tourist QR</h4><p>Your QR lets registered businesses see your name, tourist ID, photo, city/province, country, and nationality. Each successful scan adds the visit to your profile and the business logbook.</p><div className="passport-consent-list"><span><Icon name="check" size={16} /> Name and tourist ID</span><span><Icon name="check" size={16} /> City, province, and country</span><span><Icon name="check" size={16} /> Shared visit logbook entry</span></div><button className="passport-primary" onClick={enableQr} disabled={saving}><Icon name="qr_code_2" size={19} /> {saving ? "Enabling…" : "Enable Tourist QR"}</button></div>}
        {message ? <p className="passport-message" role="status" aria-live="polite">{message}</p> : null}
        <button className="passport-details-toggle" onClick={() => setDetailsOpen((value) => !value)} aria-expanded={detailsOpen}><span><Icon name="badge" size={19} /> Passport details</span><Icon name={detailsOpen ? "expand_less" : "expand_more"} size={19} /></button>
        {detailsOpen ? <div className="passport-details"><p>Keep your origin details accurate so businesses and Hilinga analytics can understand where visitors come from.</p><div className="passport-form-grid"><label>Nationality<input value={draft.nationality} onChange={(event) => setDraft({ ...draft, nationality: event.target.value })} /></label><label>Country<input value={draft.country} onChange={(event) => setDraft({ ...draft, country: event.target.value })} /></label><label>Region / state<input value={draft.region} onChange={(event) => setDraft({ ...draft, region: event.target.value })} /></label><label>Province<input value={draft.province} onChange={(event) => setDraft({ ...draft, province: event.target.value })} /></label><label>City / municipality<input value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} /></label></div><button className="passport-primary" onClick={() => void saveDetails()} disabled={saving}>{saving ? "Saving…" : "Save passport details"}</button></div> : null}
      </section>

      <section className="passport-visits" aria-labelledby="passport-visits-title" aria-busy={visitsLoading}>
        <div className="passport-section-heading"><div><span>YOUR TRAVEL RECORD</span><h3 id="passport-visits-title">My Visits</h3></div><span>{visits.length}</span></div>
        {visitsLoading
          ? <div className="passport-empty"><div className="spinner" /><span>Loading your travel logbook…</span></div>
          : visitsError
            ? <div className="passport-empty passport-visits-error"><Icon name="error" size={28} /><span>{visitsError}</span></div>
            : visits.length === 0
              ? <div className="passport-empty"><Icon name="travel_explore" size={28} /><span>Your Hilinga visits will appear here after a business scans your QR.</span></div>
              : <div className="passport-visit-list">{visits.map((visit) => <article key={visit.id}><span className="passport-visit-icon"><Icon name="storefront" size={18} /></span><div><strong>{visit.businessName}</strong><span>{[visit.businessLocation, `${dateLabel(visit.visitedAt)} · ${timeLabel(visit.visitedAt)}`].filter(Boolean).join(" · ")}</span></div><Icon name="check_circle" size={18} /></article>)}</div>}
      </section>

      {fullscreen && qrReady ? <div className="passport-fullscreen" onClick={() => setFullscreen(false)}><div className="passport-fullscreen-inner" role="dialog" aria-modal="true" aria-labelledby="fullscreen-passport-title" onClick={(event) => event.stopPropagation()}><button className="passport-close" onClick={() => setFullscreen(false)} aria-label="Close full screen QR"><Icon name="close" size={23} /></button><span className="passport-kicker">SHOW MY QR</span><h2 id="fullscreen-passport-title">{fullName}</h2><img src={qrImage} alt="Fullscreen Tourist QR" /><strong>{passport.touristCode}</strong><p>Place this QR inside the registered business scanner.</p></div></div> : null}
    </>
  );
}
