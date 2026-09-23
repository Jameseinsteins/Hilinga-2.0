import { useEffect, useState } from "react";
import { sendEmailVerification } from "firebase/auth";

import { auth } from "@/lib/firebase";
import {
  clearPin,
  clearSessionVerified,
  getLockoutInfo,
  isPinSet,
  isSessionVerified,
  verifyPin,
  createPin,
} from "@/lib/verification";

type Props = { uid: string; email: string; emailVerified: boolean };

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <span className="material-symbols-outlined" style={{ fontSize: size }} aria-hidden="true">{name}</span>;
}

export function AccountSecurityCard({ uid, email, emailVerified }: Props) {
  const [pinSet, setPinSet] = useState(() => isPinSet(uid));
  const [sessionOk, setSessionOk] = useState(() => isSessionVerified(uid));
  const [resendState, setResendState] = useState<{ msg: string | null; err: string | null; cooldown: number; sending: boolean }>({ msg: null, err: null, cooldown: 0, sending: false });
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [showSetPin, setShowSetPin] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  // inputs for set/change
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [oldPin, setOldPin] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (resendState.cooldown <= 0) return;
    const t = setTimeout(() => setResendState((s) => ({ ...s, cooldown: s.cooldown - 1 })), 1000);
    return () => clearTimeout(t);
  }, [resendState.cooldown]);

  useEffect(() => {
    if (lockoutUntil === null) return;
    const remaining = lockoutUntil - Date.now();
    if (remaining <= 0) { setLockoutUntil(null); return; }
    const t = setTimeout(() => setLockoutUntil(null), remaining + 200);
    return () => clearTimeout(t);
  }, [lockoutUntil]);

  async function resend() {
    if (!auth.currentUser || resendState.cooldown > 0) return;
    setResendState({ msg: null, err: null, cooldown: 0, sending: true });
    try {
      await sendEmailVerification(auth.currentUser);
      setResendState({ msg: "Verification email sent — check inbox and spam.", err: null, cooldown: 60, sending: false });
    } catch (e) {
      setResendState({ msg: null, err: e instanceof Error ? e.message : "Could not send email.", cooldown: 0, sending: false });
    }
  }

  function refreshPinState() {
    setPinSet(isPinSet(uid));
    setSessionOk(isSessionVerified(uid));
    const info = getLockoutInfo(uid);
    setLockoutUntil(info.locked ? info.until : null);
  }

  async function handleCreatePin() {
    setPinErr(null); setPinMsg(null);
    const a = newPin.trim(); const b = confirmPin.trim();
    if (!/^\d{6}$/.test(a)) return setPinErr("PIN must be exactly 6 digits.");
    if (a !== b) return setPinErr("PINs do not match.");
    setBusy(true);
    try {
      await createPin(uid, a);
      setPinMsg("PIN created — app will lock each new session.");
      setShowSetPin(false); setNewPin(""); setConfirmPin("");
      refreshPinState();
    } catch (e) { setPinErr(e instanceof Error ? e.message : "Could not save PIN."); }
    finally { setBusy(false); }
  }

  async function handleChangePin() {
    setPinErr(null); setPinMsg(null);
    if (!/^\d{6}$/.test(oldPin.trim())) return setPinErr("Enter your current 6-digit PIN.");
    const nxt = newPin.trim(); const c = confirmPin.trim();
    if (!/^\d{6}$/.test(nxt)) return setPinErr("New PIN must be exactly 6 digits.");
    if (nxt !== c) return setPinErr("New PINs do not match.");
    if (nxt === oldPin.trim()) return setPinErr("New PIN must differ from the old one.");
    const lock = getLockoutInfo(uid);
    if (lock.locked) { setLockoutUntil(lock.until); return setPinErr(`Too many attempts. Try again in ${Math.ceil(lock.remainingMs/1000)}s.`); }
    setBusy(true);
    try {
      const v = await verifyPin(uid, oldPin.trim());
      if (!v.ok) {
        if (v.lockedUntil) setLockoutUntil(v.lockedUntil);
        setPinErr(v.error ?? "Incorrect PIN.");
        return;
      }
      // old ok — now overwrite with new
      await createPin(uid, nxt);
      setPinMsg("PIN changed.");
      setShowChangePin(false); setOldPin(""); setNewPin(""); setConfirmPin("");
      refreshPinState();
    } catch (e) { setPinErr(e instanceof Error ? e.message : "Could not change PIN."); }
    finally { setBusy(false); }
  }

  async function handleRemovePin() {
    setPinErr(null); setPinMsg(null);
    if (!/^\d{6}$/.test(oldPin.trim())) return setPinErr("Enter your current PIN to confirm removal.");
    const lock = getLockoutInfo(uid);
    if (lock.locked) { setLockoutUntil(lock.until); return setPinErr(`Too many attempts. Try again in ${Math.ceil(lock.remainingMs/1000)}s.`); }
    setBusy(true);
    try {
      const v = await verifyPin(uid, oldPin.trim());
      if (!v.ok) { if (v.lockedUntil) setLockoutUntil(v.lockedUntil); setPinErr(v.error ?? "Incorrect PIN."); return; }
      clearPin(uid);
      setPinMsg("PIN removed — set a new one to re-enable app lock.");
      setShowChangePin(false); setOldPin(""); setNewPin(""); setConfirmPin("");
      refreshPinState();
    } finally { setBusy(false); }
  }

  function handleLockNow() {
    clearSessionVerified(uid);
    setSessionOk(false);
    // Force the top-level gate (App.tsx) to re-evaluate: sessionStorage was cleared.
    // A reload is the most reliable cross-tab way — instantaneous, no data loss.
    window.location.reload();
  }

  const locked = lockoutUntil !== null && lockoutUntil > Date.now();
  const remainingSec = locked ? Math.ceil((lockoutUntil! - Date.now()) / 1000) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Email row */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 12, background: emailVerified ? "#E8F5EE" : "#FFF3E6", border: `1px solid ${emailVerified ? "#CDE9DB" : "#FFD9B0"}` }}>
        <span style={{ width: 36, height: 36, borderRadius: 999, background: emailVerified ? "white" : "#FFF", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #E6E6E6" }}>
          <Icon name={emailVerified ? "verified_user" : "mark_email_unread"} size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 13, display: "block" }}>{emailVerified ? "Email verified" : "Email not verified"}</strong>
          <span style={{ fontSize: 12, color: "var(--c-body)", wordBreak: "break-all" }}>{email || "No email on file"}</span>
        </div>
        {!emailVerified && (
          <button type="button" className="btn btn-secondary" disabled={resendState.sending || resendState.cooldown > 0} onClick={resend} style={{ whiteSpace: "nowrap", fontSize: 12, padding: "8px 10px" }}>
            {resendState.sending ? "Sending…" : resendState.cooldown > 0 ? `Resend in ${resendState.cooldown}s` : "Resend link"}
          </button>
        )}
      </div>
      {resendState.msg && <span style={{ color: "var(--c-green-dark)", fontSize: 12, fontWeight: 700 }} role="status">{resendState.msg}</span>}
      {resendState.err && <span className="error-text" role="alert" style={{ fontSize: 12 }}>{resendState.err}</span>}

      {/* PIN row */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 12, background: pinSet ? "#F0F4FF" : "#FFF8E1", border: `1px solid ${pinSet ? "#D6E0FF" : "#FFE9A8"}` }}>
        <span style={{ width: 36, height: 36, borderRadius: 999, background: "white", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #E6E6E6" }}>
          <Icon name={pinSet ? "lock" : "lock_open"} size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 13, display: "block" }}>{pinSet ? (sessionOk ? "App PIN — session unlocked" : "App PIN — locked") : "App PIN — not set"}</strong>
          <span style={{ fontSize: 12, color: "var(--c-body)" }}>
            {pinSet ? "6-digit PIN protects all features on this device. Works offline. Locks each session." : "Create a 6-digit PIN to lock Explore, Planner, AI chat, Map, Feed and QR."}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {!pinSet ? (
          <button type="button" className="btn btn-primary" onClick={() => { setPinErr(null); setPinMsg(null); setShowSetPin(true); }} style={{ flex: 1, minWidth: 140 }}>
            <Icon name="pin" size={16} /> Set app PIN
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" onClick={handleLockNow} style={{ flex: 1, minWidth: 120 }}>
              <Icon name="lock" size={16} /> Lock now
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { setPinErr(null); setPinMsg(null); setShowChangePin(true); }} style={{ flex: 1, minWidth: 120 }}>
              <Icon name="key" size={16} /> Change / Remove
            </button>
          </>
        )}
      </div>

      {pinMsg && <span style={{ color: "var(--c-green-dark)", fontSize: 12, fontWeight: 700 }} role="status">{pinMsg}</span>}
      {pinErr && !showSetPin && !showChangePin && <span className="error-text" role="alert" style={{ fontSize: 12 }}>{pinErr}</span>}
      {locked && <span className="error-text" role="alert" style={{ fontSize: 12 }}>Too many attempts. Try again in {remainingSec}s.</span>}

      {/* Set PIN modal */}
      {showSetPin && (
        <div className="business-modal-backdrop" onClick={(e) => e.target === e.currentTarget && !busy && setShowSetPin(false)} style={{ zIndex: 60 }}>
          <div className="card" style={{ width: "min(420px, 92vw)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Set app PIN</strong>
              <button type="button" onClick={() => !busy && setShowSetPin(false)} aria-label="Close"><Icon name="close" /></button>
            </div>
            <p style={{ fontSize: 12, color: "var(--c-body)", lineHeight: "17px" }}>6 digits. Hashed on device (SHA-256). Never leaves your phone. Needed to unlock all content each session.</p>
            <label className="field-label">New 6-digit PIN</label>
            <input inputMode="numeric" pattern="\d*" maxLength={6} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" className="input" style={{ letterSpacing: 8, textAlign: "center", fontSize: 18 }} autoComplete="off" />
            <label className="field-label">Confirm PIN</label>
            <input inputMode="numeric" pattern="\d*" maxLength={6} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" className="input" style={{ letterSpacing: 8, textAlign: "center", fontSize: 18 }} autoComplete="off" />
            {pinErr && <span className="error-text" role="alert">{pinErr}</span>}
            <button type="button" className="btn btn-primary" disabled={busy || newPin.length !== 6 || confirmPin.length !== 6} onClick={handleCreatePin} style={{ width: "100%" }}>{busy ? "Saving…" : "Save PIN"}</button>
          </div>
        </div>
      )}

      {/* Change / Remove PIN modal */}
      {showChangePin && (
        <div className="business-modal-backdrop" onClick={(e) => e.target === e.currentTarget && !busy && setShowChangePin(false)} style={{ zIndex: 60 }}>
          <div className="card" style={{ width: "min(420px, 92vw)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Change or remove PIN</strong>
              <button type="button" onClick={() => !busy && setShowChangePin(false)} aria-label="Close"><Icon name="close" /></button>
            </div>
            <label className="field-label">Current PIN</label>
            <input inputMode="numeric" pattern="\d*" maxLength={6} value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" className="input" style={{ letterSpacing: 8, textAlign: "center", fontSize: 18 }} autoComplete="off" disabled={locked} />
            <div style={{ height: 1, background: "#EEE", margin: "4px 0" }} />
            <label className="field-label">New PIN (for change)</label>
            <input inputMode="numeric" pattern="\d*" maxLength={6} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" className="input" style={{ letterSpacing: 8, textAlign: "center", fontSize: 18 }} autoComplete="off" disabled={locked} />
            <label className="field-label">Confirm new PIN</label>
            <input inputMode="numeric" pattern="\d*" maxLength={6} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" className="input" style={{ letterSpacing: 8, textAlign: "center", fontSize: 18 }} autoComplete="off" disabled={locked} />
            {pinErr && <span className="error-text" role="alert">{pinErr}</span>}
            {locked && <span className="error-text" role="alert">Too many attempts. Try again in {remainingSec}s.</span>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-secondary" disabled={busy || locked || oldPin.length !== 6} onClick={handleRemovePin} style={{ flex: 1 }}>Remove PIN</button>
              <button type="button" className="btn btn-primary" disabled={busy || locked || oldPin.length !== 6 || newPin.length !== 6 || confirmPin.length !== 6} onClick={handleChangePin} style={{ flex: 1 }}>{busy ? "Saving…" : "Change PIN"}</button>
            </div>
            <p style={{ fontSize: 11, color: "var(--c-muted)", lineHeight: "15px", textAlign: "center" }}>Removing the PIN disables the app lock on this device. Any app lock state is local to this browser.</p>
          </div>
        </div>
      )}
    </div>
  );
}
