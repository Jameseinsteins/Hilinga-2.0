import { useMemo, useRef, useState } from "react";

import type { AvatarUpload } from "@/lib/cloud-profile";
import { useAuth } from "@/providers/auth-provider";
import { NATIONALITY_OPTIONS, iso2ToFlag } from "@/lib/nationality";

const interestOptions = [
  "Nature",
  "Heritage",
  "Food & cafes",
  "Adventure",
  "Photography",
  "Events",
  "Relaxation",
  "Local culture",
];

const languageOptions = ["English", "Filipino", "Bikol"];

export function OnboardingScreen() {
  const { user, profile, avatarUrl, completeOnboarding, signOut } = useAuth();
  const suggestedName = user?.displayName ?? "";
  const providerAvatar = user?.photoURL ?? null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(profile?.display_name || suggestedName);
  const [avatar, setAvatar] = useState<AvatarUpload | null>(null);
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [language, setLanguage] = useState(profile?.language || "English");
  const [nationality, setNationality] = useState(profile?.nationality || "Filipino");
  const [budgetMin, setBudgetMin] = useState(profile?.budget_min?.toString() ?? "");
  const [budgetMax, setBudgetMax] = useState(profile?.budget_max?.toString() ?? "");
  const [notifications, setNotifications] = useState(profile?.notifications_enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownAvatar = useMemo(() => avatar?.uri ?? avatarUrl ?? providerAvatar, [avatar?.uri, avatarUrl, providerAvatar]);

  function toggleInterest(value: string) {
    setInterests((current) =>
      current.includes(value)
        ? current.filter((interest) => interest !== value)
        : [...current, value],
    );
  }

  function chooseAvatar() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setAvatar({
      uri: URL.createObjectURL(file),
      mimeType: file.type,
      fileName: file.name,
      fileSize: file.size,
      file,
    });
    e.target.value = "";
  }

  async function save() {
    const min = budgetMin.trim() ? Number(budgetMin) : null;
    const max = budgetMax.trim() ? Number(budgetMax) : null;
    setError(null);
    if (!displayName.trim()) return setError("Enter the name you want Hilinga to use.");
    if (interests.length === 0) return setError("Choose at least one interest.");
    if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0))) return setError("Budget values must be non-negative numbers.");
    if (min !== null && max !== null && min > max) return setError("Minimum budget cannot be greater than maximum budget.");

    setSaving(true);
    try {
      const natOpt = NATIONALITY_OPTIONS.find((o) => o.value === nationality) ?? NATIONALITY_OPTIONS[0];
      await completeOnboarding({
        display_name: displayName,
        avatarSelection: avatar,
        interests,
        language,
        budget_min: min,
        budget_max: max,
        notifications_enabled: notifications,
        nationality: natOpt.value,
        country: natOpt.country,
        country_iso2: natOpt.iso2,
        onboarding_completed: true,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Your profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="onboarding-root">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="file-input-hidden" />

      <div className="onboarding-scroll">
        <div className="onboarding-heading">
          <span className="onboarding-step">NEW ACCOUNT · PROFILE SETUP</span>
          <h1 className="onboarding-title">Make Hilinga yours</h1>
          <p className="onboarding-subtitle">Tell us what you enjoy so recommendations and trip ideas can fit your travel style.</p>
        </div>

        <div className="onboarding-card">
          <div className="avatar-row">
            <button className="onboarding-avatar" onClick={chooseAvatar}>
              {shownAvatar ? (
                <img src={shownAvatar} alt="Profile" />
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: 72, color: "var(--c-green)" }}>account_circle</span>
              )}
              <span className="camera-badge">
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: "white" }}>photo_camera</span>
              </span>
            </button>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontWeight: 900, fontSize: 16 }}>Profile picture</span>
              <span style={{ color: "var(--c-body)", fontSize: 13, lineHeight: "18px" }}>Choose a clear photo. You can change it later.</span>
              <button onClick={chooseAvatar} style={{ color: "var(--c-green)", fontWeight: 900, background: "none", border: "none", textAlign: "left", cursor: "pointer", fontSize: 14 }}>Choose photo</button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label className="field-label">Display name</label>
            <input
              autoCapitalize="words"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="What should we call you?"
              className="input"
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="field-label">What are you interested in?</label>
            <div className="interest-chips">
              {interestOptions.map((interest) => {
                const selected = interests.includes(interest);
                return (
                  <button
                    key={interest}
                    className={`interest-chip ${selected ? "interest-chip-selected" : ""}`}
                    onClick={() => toggleInterest(interest)}
                  >
                    {interest}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="field-label">Preferred language</label>
            <div className="language-row">
              {languageOptions.map((value) => {
                const selected = language === value;
                return (
                  <button
                    key={value}
                    className={`language-btn ${selected ? "language-btn-selected" : ""}`}
                    onClick={() => setLanguage(value)}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <label className="field-label">Nationality · where are you from?</label>
            <div style={{ position: "relative" }}>
              <select
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                className="input"
                style={{ width: "100%", paddingRight: 40, appearance: "none" }}
                aria-label="Select nationality"
              >
                {NATIONALITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {iso2ToFlag(opt.iso2)} {opt.label} · {opt.country}
                  </option>
                ))}
              </select>
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 16 }}>
                {iso2ToFlag((NATIONALITY_OPTIONS.find((o) => o.value === nationality)?.iso2) ?? "PH")}
              </span>
            </div>
            <span style={{ color: "var(--c-muted)", fontSize: 11, lineHeight: "15px" }}>
              Shown as a flag badge in Explore reviews so locals and businesses know where visitors are from.
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <label className="field-label">Usual trip budget in PHP (optional)</label>
            <div className="budget-row">
              <input
                type="number"
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
                placeholder="Minimum"
                className="input"
                style={{ flex: 1 }}
              />
              <span style={{ color: "var(--c-muted)" }}>to</span>
              <input
                type="number"
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
                placeholder="Maximum"
                className="input"
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div className="notification-row">
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontWeight: 900, fontSize: 16 }}>Notifications</span>
              <span style={{ color: "var(--c-body)", fontSize: 13, lineHeight: "18px" }}>Receive useful trip reminders and Hilinga updates.</span>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={notifications} onChange={(e) => setNotifications(e.target.checked)} />
              <span className="toggle-track" />
            </label>
          </div>

          {error && <p className="error-text" role="alert">{error}</p>}

          <button
            disabled={saving}
            onClick={save}
            className="onboarding-primary"
            style={{ opacity: saving ? 0.55 : 1 }}
          >
            {saving ? (
              <div className="spinner" style={{ borderTopColor: "white", width: 20, height: 20, borderWidth: 2 }} />
            ) : (
              <>
                Finish profile
                <span className="material-symbols-outlined" style={{ fontSize: 19 }}>arrow_forward</span>
              </>
            )}
          </button>

          <button
            disabled={saving}
            onClick={() => void signOut().catch((e) => setError(e instanceof Error ? e.message : "Sign out failed."))}
            className="sign-out-link"
          >
            Use a different account
          </button>
        </div>
      </div>
    </div>
  );
}
