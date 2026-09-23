import { useEffect, useState } from "react";
import { sendEmailVerification } from "firebase/auth";

import { auth } from "@/lib/firebase";
import {
  clearSessionVerified,
  createPin,
  getLockoutInfo,
  isPinSet,
  isSessionVerified,
  isValidPinFormat,
  verifyPin,
} from "@/lib/verification";

// ── Email verification gate ──────────────────────────────────────────

export function VerifyEmailScreen({
  email,
  onVerified,
  onSignOut,
}: {
  email: string;
  onVerified: () => void;
  onSignOut: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    if (cooldown > 0 || !auth.currentUser) return;
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setMessage("Verification email sent. Check your inbox (and spam).");
      setCooldown(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send verification email.");
    } finally {
      setSending(false);
    }
  }

  async function checkVerified() {
    if (!auth.currentUser) return;
    setChecking(true);
    setError(null);
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        setMessage("Email verified! Unlocking…");
        onVerified();
      } else {
        setError("Not verified yet. Click the link in your email, then try again.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check verification.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="auth-root">
      <div className="auth-scroll" style={{ maxWidth: 420, margin: "0 auto", width: "100%" }}>
        <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8, color: "var(--c-green)" }}>VERIFY YOUR EMAIL</span>
            <h1 style={{ fontSize: 22, fontWeight: 900, lineHeight: "26px" }}>Confirm your email to unlock Hilinga</h1>
            <p style={{ color: "var(--c-body)", fontSize: 13, lineHeight: "19px" }}>
              We sent a secure link to <strong style={{ color: "var(--c-ink)" }}>{email}</strong>. Open it to verify — then
              come back here and tap &quot;I&apos;ve verified&quot;. This protects your trips, saves, and QR.
            </p>
          </div>

          <div style={{ background: "#F0F7F3", border: "1px solid #DDE9E3", borderRadius: 12, padding: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "var(--c-green)" }}>shield</span>
            <span style={{ fontSize: 12, lineHeight: "17px", color: "var(--c-body)" }}>
              Why this? Email verification prevents account takeover and ensures only you can recover your trips and business page.
            </span>
          </div>

          {message && <p style={{ color: "var(--c-green-dark)", fontSize: 13, fontWeight: 700 }} role="status">{message}</p>}
          {error && <p className="error-text" role="alert">{error}</p>}

          <button
            type="button"
            className="btn btn-primary"
            disabled={checking}
            onClick={checkVerified}
            style={{ width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 8 }}
          >
            {checking ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2, borderTopColor: "white" }} /> : <span className="material-symbols-outlined" style={{ fontSize: 18 }}>verified_user</span>}
            I&apos;ve verified — continue
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            disabled={sending || cooldown > 0}
            onClick={resend}
            style={{ width: "100%" }}
          >
            {sending ? "Sending…" : cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend verification email"}
          </button>

          <button type="button" onClick={onSignOut} style={{ color: "var(--c-muted)", fontSize: 13, fontWeight: 700, background: "none", border: 0, cursor: "pointer" }}>
            Use a different account
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PIN create ───────────────────────────────────────────────────────

export function SetupPinScreen({ uid, onDone }: { uid: string; onDone: () => void }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    const p = pin.trim();
    const c = confirm.trim();
    if (!isValidPinFormat(p)) return setError("PIN must be exactly 6 digits.");
    if (p !== c) return setError("PINs do not match. Re-enter the confirmation.");
    setSaving(true);
    try {
      await createPin(uid, p);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save PIN.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-root">
      <div className="auth-scroll" style={{ maxWidth: 420, margin: "0 auto", width: "100%" }}>
        <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8, color: "var(--c-green)" }}>APP LOCK · STEP 1 OF 2</span>
            <h1 style={{ fontSize: 22, fontWeight: 900 }}>Create your 6-digit app PIN</h1>
            <p style={{ color: "var(--c-body)", fontSize: 13, lineHeight: "19px" }}>
              This PIN unlocks all content on <em>this device</em> — Explore, Planner, Feed, Map, business tools, and your Profile QR. It works offline and never leaves your phone.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label className="field-label">Choose a 6-digit PIN</label>
            <input
              inputMode="numeric"
              pattern="\d*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              className="input"
              style={{ letterSpacing: 8, fontSize: 18, textAlign: "center" }}
              autoComplete="off"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label className="field-label">Confirm PIN</label>
            <input
              inputMode="numeric"
              pattern="\d*"
              maxLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              className="input"
              style={{ letterSpacing: 8, fontSize: 18, textAlign: "center" }}
              autoComplete="off"
            />
          </div>

          {error && <p className="error-text" role="alert">{error}</p>}

          <button type="button" className="btn btn-primary" disabled={saving || pin.length !== 6 || confirm.length !== 6} onClick={submit} style={{ width: "100%" }}>
            {saving ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2, borderTopColor: "white" }} /> : "Save PIN & unlock"}
          </button>

          <p style={{ color: "var(--c-muted)", fontSize: 11, lineHeight: "15px", textAlign: "center" }}>
            Tip: Don&apos;t use 123456 or your birth year. You can change this later in Profile → Privacy &amp; security.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── PIN unlock ───────────────────────────────────────────────────────

export function PinLockScreen({
  uid,
  displayName,
  onUnlocked,
  onSignOut,
  onResetPin,
}: {
  uid: string;
  displayName?: string;
  onUnlocked: () => void;
  onSignOut: () => void;
  onResetPin: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [lockUntil, setLockUntil] = useState<number | null>(null);

  useEffect(() => {
    const info = getLockoutInfo(uid);
    if (info.locked) setLockUntil(info.until);
    else setLockUntil(null);
  }, [uid]);

  useEffect(() => {
    if (lockUntil === null) return;
    const remaining = lockUntil - Date.now();
    if (remaining <= 0) { setLockUntil(null); return; }
    const t = setTimeout(() => setLockUntil(null), remaining + 200);
    return () => clearTimeout(t);
  }, [lockUntil]);

  async function submit() {
    if (lockUntil && lockUntil > Date.now()) return;
    setError(null);
    setVerifying(true);
    try {
      const res = await verifyPin(uid, pin);
      if (res.ok) {
        onUnlocked();
      } else {
        setError(res.error ?? "Incorrect PIN.");
        if (res.lockedUntil) setLockUntil(res.lockedUntil);
        setPin("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify PIN.");
    } finally {
      setVerifying(false);
    }
  }

  const locked = lockUntil !== null && lockUntil > Date.now();
  const remainingSec = locked ? Math.ceil((lockUntil! - Date.now()) / 1000) : 0;

  function lockApp() {
    clearSessionVerified(uid);
    setPin("");
    setError("App locked.");
  }

  return (
    <div className="auth-root">
      <div className="auth-scroll" style={{ maxWidth: 420, margin: "0 auto", width: "100%" }}>
        <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 44, height: 44, borderRadius: 999, background: "#E8F5EE", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: "var(--c-green)" }}>lock</span>
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <strong style={{ fontSize: 16 }}>App locked</strong>
              <span style={{ color: "var(--c-body)", fontSize: 12 }}>{displayName ? `Welcome back, ${displayName}` : "Enter your PIN to continue"}</span>
            </div>
          </div>

          <p style={{ color: "var(--c-body)", fontSize: 13, lineHeight: "18px" }}>
            All features — Explore, Planner, AI chat, Map, Feed, and your business tools — stay locked until you verify. Your PIN works offline.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label className="field-label">Enter 6-digit PIN</label>
            <input
              inputMode="numeric"
              pattern="\d*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              className="input"
              style={{ letterSpacing: 8, fontSize: 20, textAlign: "center" }}
              autoComplete="off"
              disabled={locked}
              onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
            />
          </div>

          {locked ? (
            <p className="error-text" role="alert">Too many attempts. Try again in {remainingSec}s.</p>
          ) : error ? (
            <p className="error-text" role="alert">{error}</p>
          ) : null}

          <button
            type="button"
            className="btn btn-primary"
            disabled={verifying || locked || pin.length !== 6}
            onClick={submit}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {verifying ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2, borderTopColor: "white" }} /> : <span className="material-symbols-outlined" style={{ fontSize: 18 }}>lock_open</span>}
            Unlock
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={lockApp}>Lock</button>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onResetPin}>Forgot PIN?</button>
          </div>

          <button type="button" onClick={onSignOut} style={{ color: "var(--c-muted)", fontSize: 13, fontWeight: 700, background: "none", border: 0, cursor: "pointer" }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small hook for anywhere else (e.g. Profile → Lock app) ──────────

export function useAppLock(uid: string | undefined) {
  const [verified, setVerified] = useState(() => (uid ? isSessionVerified(uid) : false));
  const [pinSet, setPinSet] = useState(() => (uid ? isPinSet(uid) : false));

  useEffect(() => {
    if (!uid) return;
    setVerified(isSessionVerified(uid));
    setPinSet(isPinSet(uid));
    const onStorage = () => {
      setVerified(isSessionVerified(uid));
      setPinSet(isPinSet(uid));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [uid]);

  return { verified, pinSet, refresh: () => { if (uid) { setVerified(isSessionVerified(uid)); setPinSet(isPinSet(uid)); } } };
}
