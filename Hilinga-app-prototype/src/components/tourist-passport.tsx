import { useEffect, useState } from "react";

import { useAuth } from "@/providers/auth-provider";
import {
  ensureTouristPassport,
  regenerateTouristQr,
  setTouristQrStatus,
  subscribeToTouristVisits,
  touristQrUrl,
  type TouristPassport,
  type TouristVisit,
} from "@/lib/tourist-passport";
import { generateQrDataUrl, downloadQrDataUrl } from "@/lib/qr-generator";

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

export function ProfileQrCard() {
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
  const [fullscreen, setFullscreen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user?.uid) {
      setPassport(null);
      setPassportLoading(false);
      return;
    }
    let cancelled = false;
    setPassportLoading(true);
    setPassportError("");
    void ensureTouristPassport(user.uid, profile?.display_name || user.email?.split("@")[0] || "Hilinga User", avatarUrl || "", {
      language: profile?.language,
      interests: profile?.interests,
    })
      .then((next) => {
        if (cancelled) return;
        setPassport(next);
      })
      .catch((error) => {
        if (cancelled) return;
        setPassport(null);
        setPassportError(error instanceof Error ? error.message : "Your Profile QR could not be loaded.");
      })
      .finally(() => { if (!cancelled) setPassportLoading(false); });
    return () => { cancelled = true; };
  }, [avatarUrl, passportLoadAttempt, profile?.display_name, profile?.interests, profile?.language, user?.email, user?.uid]);

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
    void generateQrDataUrl(touristQrUrl(qrToken), { width: 320 })
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

  const fullName = `${passport?.firstName || "Hilinga User"} ${passport?.lastName || ""}`.trim();
  const profileSummary = [passport?.language, passport?.interests.length ? `${passport.interests.length} travel interests` : "No interests added"].filter(Boolean).join(" · ");
  const qrReady = qrImageState === "ready" && Boolean(qrImage);

  async function enableQr() {
    if (!user?.uid || !passport || saving) return;
    setSaving(true);
    setMessage("");
    try {
      setPassport(await setTouristQrStatus(user.uid, "active", true));
      setMessage("Your Profile QR is active and ready for registered businesses.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Profile QR could not be enabled.");
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    if (!user?.uid || saving || !window.confirm("Regenerate your Profile QR? The current QR will stop working immediately.")) return;
    setSaving(true);
    setMessage("");
    try {
      setPassport(await regenerateTouristQr(user.uid));
      setMessage("A new Profile QR is active. Your old QR was revoked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Profile QR could not be regenerated.");
    } finally {
      setSaving(false);
    }
  }

  async function disable() {
    if (!user?.uid || !passport || saving || !window.confirm("Disable your Profile QR? Businesses will no longer be able to scan it.")) return;
    setSaving(true);
    setMessage("");
    try {
      setPassport(await setTouristQrStatus(user.uid, "disabled", false));
      setMessage("Your Profile QR is disabled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Profile QR could not be disabled.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadQr() {
    if (!qrReady || !passport) return;
    try {
      await downloadQrDataUrl(qrImage, `${passport.touristCode}-profile-qr.png`);
    } catch {
      // Fallback for edge cases (e.g. https URL with strict CORS) — open in new tab.
      if (qrImage.startsWith("http")) window.open(qrImage, "_blank", "noopener");
    }
  }

  if (passportLoading) {
    return <section className="passport-card passport-loading" aria-busy="true"><div className="spinner" /><span>Preparing your Profile QR…</span></section>;
  }

  if (!passport) {
    return <section className="passport-card passport-load-error" role="alert"><span><Icon name="qr_code_2" size={30} /></span><strong>Profile QR unavailable</strong><p>{passportError || "Your Profile QR could not be loaded."}</p><button className="passport-primary" onClick={() => setPassportLoadAttempt((value) => value + 1)}>Try again</button></section>;
  }

  return (
    <>
      <section className="passport-card" aria-labelledby="passport-title">
        <div className="passport-heading"><div><span className="passport-kicker">HILINGA USER PROFILE</span><h3 id="passport-title">My Profile QR</h3><p>Your secure Hilinga identity for check-ins at registered establishments.</p></div><span className={`passport-status ${passport.qrStatus}`}><span />{passport.qrStatus === "active" ? "Active" : "Not active"}</span></div>
        {passport.qrStatus === "active" ? <>
          <div className="passport-qr-stage" aria-busy={qrImageState === "generating"}>
            {qrReady ? <img src={qrImage} alt={`Profile QR for ${fullName}`} /> : null}
            {qrImageState === "generating" ? <div className="passport-qr-feedback"><div className="spinner" /><span>Generating secure QR…</span></div> : null}
            {qrImageState === "error" ? <div className="passport-qr-feedback passport-qr-error"><Icon name="error" size={26} /><span>{qrError}</span><button onClick={() => setQrGenerationAttempt((value) => value + 1)}>Try again</button></div> : null}
            <strong>{passport.touristCode}</strong>
          </div>
          <div className="passport-identity"><div className="passport-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : <Icon name="person" size={24} />}</div><div><strong>{fullName}</strong><span>{profileSummary}</span><small><Icon name="verified" size={15} /> {passport.verificationStatus === "verified" ? "Verified Hilinga profile" : "Profile verification pending"}</small></div></div>
          <div className="passport-actions"><button className="passport-primary" onClick={() => setFullscreen(true)} disabled={!qrReady}><Icon name="fullscreen" size={19} /> Show My QR</button><button onClick={downloadQr} disabled={!qrReady}><Icon name="download" size={18} /> Download</button><button onClick={regenerate} disabled={saving}><Icon name="autorenew" size={18} /> Regenerate</button></div>
          <button className="passport-danger-link" onClick={disable} disabled={saving}>Disable Profile QR</button>
        </> : <div className="passport-consent"><div className="passport-consent-icon"><Icon name="qr_code_2" size={34} /></div><h4>Enable your Profile QR</h4><p>Your QR represents your Hilinga user profile. Registered businesses can view your approved profile details and record a visit in both logbooks.</p><div className="passport-consent-list"><span><Icon name="check" size={16} /> Profile name and user ID</span><span><Icon name="check" size={16} /> Profile photo and location</span><span><Icon name="check" size={16} /> Shared visit logbook entry</span></div><button className="passport-primary" onClick={enableQr} disabled={saving}><Icon name="qr_code_2" size={19} /> {saving ? "Enabling…" : "Enable Profile QR"}</button></div>}
        {message ? <p className="passport-message" role="status" aria-live="polite">{message}</p> : null}
        <p className="passport-profile-source"><Icon name="sync" size={16} /> Name, photo, language, and interests stay synchronized with your Hilinga profile.</p>
      </section>

      <section className="passport-visits" aria-labelledby="passport-visits-title" aria-busy={visitsLoading}>
        <div className="passport-section-heading"><div><span>YOUR TRAVEL RECORD</span><h3 id="passport-visits-title">My Visits</h3></div><span>{visits.length}</span></div>
        {visitsLoading
          ? <div className="passport-empty"><div className="spinner" /><span>Loading your travel logbook…</span></div>
          : visitsError
            ? <div className="passport-empty passport-visits-error"><Icon name="error" size={28} /><span>{visitsError}</span></div>
            : visits.length === 0
              ? <div className="passport-empty"><Icon name="travel_explore" size={28} /><span>Your Hilinga visits will appear here after a business scans your Profile QR.</span></div>
              : <div className="passport-visit-list">{visits.map((visit) => <article key={visit.id}><span className="passport-visit-icon"><Icon name="storefront" size={18} /></span><div><strong>{visit.businessName}</strong><span>{[visit.businessLocation, `${dateLabel(visit.visitedAt)} · ${timeLabel(visit.visitedAt)}`].filter(Boolean).join(" · ")}</span></div><Icon name="check_circle" size={18} /></article>)}</div>}
      </section>

      {fullscreen && qrReady ? <div className="passport-fullscreen" onClick={() => setFullscreen(false)}><div className="passport-fullscreen-inner" role="dialog" aria-modal="true" aria-labelledby="fullscreen-passport-title" onClick={(event) => event.stopPropagation()}><button className="passport-close" onClick={() => setFullscreen(false)} aria-label="Close full screen QR"><Icon name="close" size={23} /></button><span className="passport-kicker">MY PROFILE QR</span><h2 id="fullscreen-passport-title">{fullName}</h2><img src={qrImage} alt="Fullscreen Profile QR" /><strong>{passport.touristCode}</strong><p>Present this Profile QR to a registered Hilinga business.</p></div></div> : null}
    </>
  );
}
