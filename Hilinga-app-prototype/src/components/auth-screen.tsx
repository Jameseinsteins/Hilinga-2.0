import { useState } from "react";

import {
  createEmailAccount,
  readableAuthError,
  requestPasswordReset,
  signInWithEmail,
  signInWithGoogle,
} from "@/lib/auth";
import { getLastAccountMode, selectAccountMode, type AccountMode } from "@/lib/account-mode";

import welcomeBg from "@/assets/images/hilinga/welcome-bg.png";
import hilingaLogo from "@/assets/images/hilinga/hilinga-logo.png";

type Mode = "login" | "signup" | "forgot";

function entryAccountMode(): AccountMode {
  return new URLSearchParams(window.location.search).has("tourist_token") ? "business" : getLastAccountMode();
}

export function AuthScreen({ configured }: { configured: boolean }) {
  const [mode, setMode] = useState<Mode>("login");
  const [accountMode, setAccountMode] = useState<AccountMode>(entryAccountMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    const cleanEmail = email.trim().toLowerCase();
    setError(null);
    setMessage(null);
    if (!cleanEmail || !cleanEmail.includes("@")) return setError("Enter a valid email address.");
    if (mode !== "forgot" && password.length < 6) return setError("Password must contain at least 6 characters.");

    setLoading(true);
    try {
      selectAccountMode(accountMode);
      if (mode === "login") {
        await signInWithEmail(cleanEmail, password);
      } else if (mode === "signup") {
        await createEmailAccount(cleanEmail, password, accountMode);
        setMessage("Account created. Check your email to confirm your address, then sign in.");
        setMode("login");
      } else {
        await requestPasswordReset(cleanEmail);
        setMessage("Password reset email sent. Follow the secure link in your inbox.");
      }
    } catch (nextError) {
      setError(readableAuthError(nextError));
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    setGoogleLoading(true);
    setError(null);
    setMessage(null);
    try {
      selectAccountMode(accountMode);
      await signInWithGoogle(accountMode);
    } catch (nextError) {
      setError(readableAuthError(nextError));
    } finally {
      setGoogleLoading(false);
    }
  }

  const title = mode === "login" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password";
  const action = mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send reset link";

  return (
    <div className="auth-root">
      <img src={welcomeBg} alt="" className="auth-bg" />
      <div className="auth-overlay" />

      <div className="auth-scroll">
        <div className="auth-brand">
          <img src={hilingaLogo} alt="Hilinga logo" className="auth-logo" />
          <h1 className="auth-brand-title">Hilinga</h1>
          <p className="auth-brand-body">Plan a Legazpi experience that feels made for you.</p>
        </div>

        <div className="auth-card">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h2 className="auth-title">{title}</h2>
            <p className="auth-subtitle">
              {mode === "forgot" ? "We'll email you a secure recovery link." : "Use your email or continue with Google."}
            </p>
          </div>

          {mode !== "forgot" && (
            <fieldset className="account-mode-fieldset">
              <legend>Choose your Hilinga experience</legend>
              <div className="account-mode-options">
                <button
                  type="button"
                  className={`account-mode-option ${accountMode === "explore" ? "account-mode-option-selected" : ""}`}
                  onClick={() => setAccountMode("explore")}
                  aria-pressed={accountMode === "explore"}
                >
                  <span className="account-mode-icon material-symbols-outlined">explore</span>
                  <span><strong>EXPLORE</strong><small>Plan trips and discover Legazpi</small></span>
                  <span className="account-mode-check material-symbols-outlined">check_circle</span>
                </button>
                <button
                  type="button"
                  className={`account-mode-option ${accountMode === "business" ? "account-mode-option-selected" : ""}`}
                  onClick={() => setAccountMode("business")}
                  aria-pressed={accountMode === "business"}
                >
                  <span className="account-mode-icon material-symbols-outlined">storefront</span>
                  <span><strong>BUSINESS</strong><small>Manage and grow your local business</small></span>
                  <span className="account-mode-check material-symbols-outlined">check_circle</span>
                </button>
              </div>
            </fieldset>
          )}

          {!configured && (
            <div className="auth-error-box">
              Firebase is not configured yet. Add the Firebase web app values to the VITE_FIREBASE_* environment variables.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label className="field-label">Email</label>
            <input
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>

          {mode !== "forgot" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <label className="field-label">Password</label>
              <input
                type={showPassword ? "text" : "password"}
                autoCapitalize="none"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="input"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <div className="show-password-row">
                <span style={{ color: "var(--c-body)", fontSize: 13 }}>Show password</span>
                <label className="toggle">
                  <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
                  <span className="toggle-track" />
                </label>
              </div>
            </div>
          )}

          {error && <p className="error-text" role="alert">{error}</p>}
          {message && <p className="auth-message" role="alert">{message}</p>}

          <button
            disabled={!configured || loading}
            onClick={submit}
            className="auth-primary"
          >
            {loading ? <div className="spinner" style={{ borderTopColor: "white", width: 20, height: 20, borderWidth: 2 }} /> : action}
          </button>

          {mode !== "forgot" && (
            <>
              <div className="auth-divider">
                <div className="auth-divider-line" />
                <span style={{ color: "var(--c-body)", fontSize: 13 }}>or</span>
                <div className="auth-divider-line" />
              </div>
              <button
                disabled={!configured || googleLoading}
                onClick={google}
                className="auth-google-btn"
              >
                {googleLoading ? (
                  <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                ) : (
                  <>
                    <span style={{ color: "#4285F4", fontSize: 20, fontWeight: 900 }}>G</span>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>Continue with Google</span>
                  </>
                )}
              </button>
            </>
          )}

          <div className="auth-links">
            {mode === "login" && (
              <button className="auth-link" onClick={() => { setMode("forgot"); setError(null); setMessage(null); }}>
                Forgot password?
              </button>
            )}
            <button className="auth-link" onClick={() => { setMode(mode === "signup" ? "login" : mode === "login" ? "signup" : "login"); setError(null); setMessage(null); }}>
              {mode === "login" ? "Create an account" : "Back to login"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
