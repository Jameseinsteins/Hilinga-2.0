import { useMemo, useRef, useState } from "react";

import { useAuth } from "@/providers/auth-provider";
import {
  saveBusinessPage,
  submitBusinessVerification,
  uploadVerificationDocument,
  type BusinessPageInfo,
  type SubmitVerificationInput,
} from "@/lib/business-content";

// Distinct from traveler onboarding — business users must pass GCash-style KYC at signup
// before they can post or appear in Explore/Feed. Admin manually reviews ID/permit photos.

const ID_TYPES = [
  "Philippine National ID (PhilSys)",
  "Driver's License",
  "Passport",
  "UMID",
  "Voter's ID",
  "Postal ID",
  "PRC ID",
  "SSS ID",
  "TIN ID",
] as const;

const BUSINESS_CATEGORIES = [
  "Cafe",
  "Restaurant",
  "Stay / Accommodation",
  "Shopping",
  "Tours & Activities",
  "Services",
  "Local Business",
  "Other",
] as const;

function resizeImage(file: File, maxSide = 900, quality = 0.68) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That image could not be opened."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("That image could not be opened."));
      image.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function Uploader({
  label,
  required,
  value,
  uploading,
  onPick,
  onRemove,
  hint,
}: {
  label: string;
  required?: boolean;
  value: string;
  uploading: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      style={{
        border: "1px dashed #CBD5E1",
        borderRadius: 14,
        padding: 14,
        background: value ? "#F8FAFC" : "white",
        display: "flex",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          overflow: "hidden",
          background: "#EEF2FF",
          border: "1px solid #E0E7FF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {value ? (
          <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#6366F1" }}>
            {uploading ? "hourglass_empty" : "add_a_photo"}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1E293B", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {label} {required && <span style={{ color: "#DC2626" }}>*</span>}{" "}
          {uploading && <span style={{ fontSize: 11, color: "#6366F1", fontWeight: 700 }}>Uploading…</span>}
          {value && !uploading && (
            <span style={{ fontSize: 11, color: "#059669", fontWeight: 800, background: "#ECFDF5", border: "1px solid #A7F3D0", padding: "2px 8px", borderRadius: 999 }}>
              Uploaded
            </span>
          )}
        </div>
        {hint && <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{hint}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            style={{
              padding: "7px 12px",
              borderRadius: 999,
              border: "1px solid #6366F1",
              background: uploading ? "#EEF2FF" : "white",
              color: "#4338CA",
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            {value ? "Replace" : "Upload"}
          </button>
          {value && (
            <button
              type="button"
              disabled={uploading}
              onClick={onRemove}
              style={{ padding: "7px 12px", borderRadius: 999, border: "1px solid #E2E8F0", background: "white", color: "#475569", fontWeight: 700, fontSize: 12 }}
            >
              Remove
            </button>
          )}
          {value && (
            <a href={value} target="_blank" rel="noreferrer" style={{ padding: "7px 12px", borderRadius: 999, background: "#F1F5F9", color: "#334155", fontWeight: 700, fontSize: 12, textDecoration: "none" }}>
              View
            </a>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}

export function BusinessOnboardingScreen() {
  const { user, completeOnboarding, signOut } = useAuth();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  // Step 0: Business info
  const [businessName, setBusinessName] = useState(user?.displayName ?? "");
  const [category, setCategory] = useState<(typeof BUSINESS_CATEGORIES)[number]>("Local Business");
  const [location, setLocation] = useState("Legazpi City, Albay");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState("Open daily · 8:00 AM–6:00 PM");
  const [about, setAbout] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  // Step 1: ID
  const [contactPerson, setContactPerson] = useState(user?.displayName ?? "");
  const [idType, setIdType] = useState<(typeof ID_TYPES)[number]>(ID_TYPES[0]);
  const [idNumber, setIdNumber] = useState("");
  const [idFrontUrl, setIdFrontUrl] = useState("");
  const [idBackUrl, setIdBackUrl] = useState("");
  // Step 2: Permit
  const [permitUrl, setPermitUrl] = useState("");
  const [storefrontUrl, setStorefrontUrl] = useState("");
  const [agreed, setAgreed] = useState(false);

  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [imageError, setImageError] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canStep0 = useMemo(() => businessName.trim().length >= 2 && location.trim().length >= 3 && category.trim().length > 0, [businessName, location, category]);
  const canStep1 = useMemo(() => contactPerson.trim().length >= 3 && idNumber.trim().length >= 4 && Boolean(idFrontUrl), [contactPerson, idNumber, idFrontUrl]);
  const canSubmit = useMemo(() => Boolean(permitUrl) && agreed, [permitUrl, agreed]);

  async function handleCoverLogo(file: File | undefined, setter: (v: string) => void, maxSide: number, quality: number) {
    if (!file) return;
    setImageError("");
    if (!file.type.startsWith("image/")) { setImageError("Choose an image file."); return; }
    if (file.size > 10 * 1024 * 1024) { setImageError("Choose an image smaller than 10 MB."); return; }
    try {
      const dataUrl = await resizeImage(file, maxSide, quality);
      setter(dataUrl);
    } catch (e) { setImageError(e instanceof Error ? e.message : "That image could not be opened."); }
  }

  async function handleKycUpload(file: File, setter: (v: string) => void, label: string) {
    if (!user?.uid) return;
    setError(null);
    setUploadingKey(label);
    try {
      const url = await uploadVerificationDocument(user.uid, file, label);
      setter(url);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed. Try a smaller image."); }
    finally { setUploadingKey(null); }
  }

  async function save() {
    if (!user?.uid) { setError("Your session has expired. Please sign in again."); return; }
    if (!canStep0) { setStep(0); setError("Enter your business name and location (at least 2 characters)."); return; }
    if (!canStep1) { setStep(1); setError("Enter contact person, ID number, and upload the front of your valid ID."); return; }
    if (!canSubmit) { setStep(2); setError(permitUrl ? "Check the agreement to submit." : "Upload your business permit (DTI / Barangay / Mayor's / BIR)."); return; }
    if (businessName.trim().length < 2) return setError("Enter your business name.");
    if (idNumber.trim().length < 4) return setError("Enter the ID / document number.");
    if (!idFrontUrl) return setError("Upload the front of your valid ID.");
    if (!permitUrl) return setError("Upload your business permit.");
    setError(null);
    setImageError("");
    setSaving(true);
    try {
      // 1) Create profile as business — onboarding_completed true, account_mode business is persisted via auth-provider's resolveAccountMode
      // We save interests as [category] so traveler personalization doesn't leak into business.
      await completeOnboarding({
        display_name: businessName.trim(),
        avatarSelection: null,
        interests: [category],
        language: "English",
        budget_min: null,
        budget_max: null,
        notifications_enabled: true,
        onboarding_completed: true,
      });

      // 2) Create business page row — DB default is pending; posting stays locked until admin verifies.
      const pageInfo: BusinessPageInfo = {
        name: businessName.trim(),
        businessScale: "Small business",
        category: category.trim(),
        location: location.trim() || "Legazpi City, Albay",
        phone: phone.trim(),
        email: user.email ?? "",
        hours: hours.trim() || "Hours not provided",
        about: about.trim() || "A locally registered business on Hilinga.",
        coverUrl,
        logoUrl,
      };
      // saveBusinessPage upserts; if this throws (e.g. photo too large) we surface it
      try { await saveBusinessPage(user.uid, pageInfo); } catch (e) { throw new Error(e instanceof Error ? e.message : "Business page could not be saved."); }

      // 3) Submit KYC payload — sets verification_status pending + stores doc URLs for admin review. Admin must manually Verify.
      const payload: SubmitVerificationInput = {
        contactPerson: contactPerson.trim(),
        idType: idType.trim(),
        idNumber: idNumber.trim(),
        idFrontUrl,
        idBackUrl: idBackUrl || undefined,
        permitUrl,
        storefrontUrl: storefrontUrl || undefined,
      };
      try { await submitBusinessVerification(user.uid, payload); } catch (e) {
        // If payload columns not yet migrated, surface actionable message
        throw new Error(e instanceof Error ? e.message : "Verification submission failed.");
      }

      // Success: App.tsx will rerender -> BusinessApp with pending banner (locked until admin verifies).
      // No navigation needed — profile onboarding_completed now true triggers route switch.
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Your business could not be set up. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const steps = [
    { label: "Business", icon: "storefront", desc: "Name & location" },
    { label: "Valid ID", icon: "id_card", desc: "Government ID" },
    { label: "Permit", icon: "approval", desc: "Business proof" },
  ];

  return (
    <div className="onboarding-root">
      <div className="onboarding-scroll">
        <div className="onboarding-heading">
          <span className="onboarding-step">BUSINESS ACCOUNT · VERIFICATION REQUIRED</span>
          <h1 className="onboarding-title">Set up your business — like GCash, verify first</h1>
          <p className="onboarding-subtitle">
            You must pass verification before you can post or appear in Explore & Feed. Submit your valid ID + business permit now — an admin will review the photos and manually verify you. No auto-verify.
          </p>
          <div style={{ marginTop: 10, padding: "10px 12px", background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#4F46E5" }}>verified_user</span>
            <span style={{ fontSize: 12, color: "#4338CA", lineHeight: 1.5 }}>
              <strong>How it works:</strong> submit requirements → <strong>Pending</strong> (not visible) → admin checks if the photo is a true document → <strong>Verified</strong> (live in Explore & Feed). Fake documents are rejected.
            </span>
          </div>
        </div>

        {/* Stepper */}
        <div style={{ marginTop: 16, padding: "14px 14px 10px", background: "white", border: "1px solid #E2E8F0", borderRadius: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {steps.map((s, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <div key={s.label} style={{ flex: 1, display: "flex", alignItems: "center", gap: 0 }}>
                  <button
                    type="button"
                    onClick={() => setStep(i as 0 | 1 | 2)}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "6px 4px", border: "none", background: "transparent", cursor: "pointer" }}
                  >
                    <span
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 999,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: active ? "#4F46E5" : done ? "#10B981" : "#F1F5F9",
                        color: active || done ? "white" : "#64748B",
                        border: active ? "2px solid #4F46E5" : done ? "2px solid #10B981" : "1px solid #E2E8F0",
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    >
                      {done ? <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check</span> : <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{s.icon}</span>}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: active ? 800 : 600, color: active ? "#4F46E5" : done ? "#059669" : "#64748B" }}>{s.label}</span>
                    <span style={{ fontSize: 10, color: "#94A3B8" }}>{s.desc}</span>
                  </button>
                  {i < steps.length - 1 && <div style={{ height: 2, flex: 1, background: i < step ? "#10B981" : "#E2E8F0", borderRadius: 999, margin: "0 2px", marginBottom: 18 }} />}
                </div>
              );
            })}
          </div>
          <div style={{ height: 4, background: "#E2E8F0", borderRadius: 999, overflow: "hidden", marginTop: 10 }}>
            <div style={{ width: `${((step + 1) / steps.length) * 100}%`, height: "100%", background: "#4F46E5", transition: "width 0.3s" }} />
          </div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6, textAlign: "center" }}>Step {step + 1} of 3 — requirements are required before you can post</div>
        </div>

        <div className="onboarding-card" style={{ gap: 14 }}>
          {error && <p className="error-text" role="alert">{error}</p>}
          {imageError && <p className="error-text" role="alert">{imageError}</p>}

          {step === 0 && (
            <>
              <div style={{ padding: "12px 14px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#4338CA", display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>info</span> Business identity
                </div>
                <p style={{ fontSize: 12, color: "#475569", margin: "6px 0 0", lineHeight: 1.5 }}>
                  This is separate from the traveler profile. Travelers set interests & budget to get recommendations; businesses set <strong>business name, category, and location</strong> to appear in Explore. You will edit hours and story after verification.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <label className="field-label">Business name <span style={{ color: "#DC2626" }}>*</span></label>
                <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Mayon Cafe & Tours" className="input" />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <label className="field-label">Category <span style={{ color: "#DC2626" }}>*</span></label>
                <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="input" style={{ background: "white" }}>
                  {BUSINESS_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <label className="field-label">Location <span style={{ color: "#DC2626" }}>*</span></label>
                <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Barangay, City, Albay" className="input" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <label className="field-label">Phone</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxxx" className="input" />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <label className="field-label">Business hours</label>
                  <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Open daily 8AM–6PM" className="input" />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <label className="field-label">About your business</label>
                <textarea value={about} onChange={(e) => setAbout(e.target.value)} placeholder="What makes your business special? Tell travelers your story, what you offer, and why they should visit." className="input" style={{ minHeight: 80, resize: "vertical" }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <label className="field-label">Cover photo</label>
                  <label htmlFor="biz-cover-upload" style={{ border: "1px dashed #CBD5E1", borderRadius: 12, padding: 12, background: coverUrl ? "#F8FAFC" : "white", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" as const }}>
                    {coverUrl ? <img src={coverUrl} alt="Cover preview" style={{ width: "100%", maxHeight: 90, objectFit: "cover", borderRadius: 8 }} /> : <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#94A3B8" }}>landscape</span>}
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#4338CA" }}>{coverUrl ? "Replace cover" : "Upload cover"}</span>
                    <span style={{ fontSize: 11, color: "#64748B" }}>Up to 10 MB</span>
                  </label>
                  <input id="biz-cover-upload" type="file" accept="image/*" className="file-input-hidden" onChange={(e) => void handleCoverLogo(e.target.files?.[0], setCoverUrl, 720, 0.6)} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <label className="field-label">Logo</label>
                  <label htmlFor="biz-logo-upload" style={{ border: "1px dashed #CBD5E1", borderRadius: 12, padding: 12, background: logoUrl ? "#F8FAFC" : "white", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" as const }}>
                    {logoUrl ? <img src={logoUrl} alt="Logo preview" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 12, border: "1px solid #E2E8F0" }} /> : <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#94A3B8" }}>storefront</span>}
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#4338CA" }}>{logoUrl ? "Replace logo" : "Upload logo"}</span>
                  </label>
                  <input id="biz-logo-upload" type="file" accept="image/*" className="file-input-hidden" onChange={(e) => void handleCoverLogo(e.target.files?.[0], setLogoUrl, 360, 0.65)} />
                </div>
              </div>

              <div style={{ padding: "10px 12px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, fontSize: 11, color: "#92400E", display: "flex", gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>lock</span>
                <span>Next you will submit your <strong>valid ID + business permit</strong>. You cannot post until an admin manually verifies the photos are true documents.</span>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div style={{ padding: "12px 14px", background: "white", border: "1px solid #E0E7FF", borderRadius: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#3730A3" }}>Why we ask for an ID</div>
                <p style={{ fontSize: 12, color: "#475569", margin: "6px 0 0", lineHeight: 1.5 }}>
                  Like GCash, we verify the <strong>real person behind the business</strong>. Your ID is visible only to Hilinga admins and is never shown to travelers.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <label className="field-label">Contact person (full name) <span style={{ color: "#DC2626" }}>*</span></label>
                <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Juan Dela Cruz" className="input" />
                <span style={{ fontSize: 11, color: "#64748B" }}>Must match the name on your valid ID.</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <label className="field-label">ID type <span style={{ color: "#DC2626" }}>*</span></label>
                <select value={idType} onChange={(e) => setIdType(e.target.value as typeof idType)} className="input" style={{ background: "white" }}>
                  {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <label className="field-label">ID / document number <span style={{ color: "#DC2626" }}>*</span></label>
                <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="e.g. 1234-5678-9012" className="input" />
              </div>

              <Uploader label="Front of valid ID" required value={idFrontUrl} uploading={uploadingKey === "id-front"} onPick={(f) => void handleKycUpload(f, setIdFrontUrl, "id-front")} onRemove={() => setIdFrontUrl("")} hint="Clear photo of the front. Must show name, photo, and ID number. JPG/PNG up to 8 MB." />
              <Uploader label="Back of valid ID (optional)" value={idBackUrl} uploading={uploadingKey === "id-back"} onPick={(f) => void handleKycUpload(f, setIdBackUrl, "id-back")} onRemove={() => setIdBackUrl("")} hint="Back side if your ID has address/expiry on the back." />

              <div style={{ padding: "10px 12px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, fontSize: 11, color: "#1E40AF", display: "flex", gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>verified_user</span>
                <span>Admin will check that the photo is a true government ID and that the name matches the contact person. Blurry, cropped, or fake photos are rejected.</span>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Uploader label="Business permit" required value={permitUrl} uploading={uploadingKey === "permit"} onPick={(f) => void handleKycUpload(f, setPermitUrl, "permit")} onRemove={() => setPermitUrl("")} hint="DTI certificate, Barangay clearance, Mayor's permit, or BIR 2303 — any one that proves the business is registered. Must show business name." />
              <Uploader label="Storefront / product photo (optional, helps approval)" value={storefrontUrl} uploading={uploadingKey === "storefront"} onPick={(f) => void handleKycUpload(f, setStorefrontUrl, "storefront")} onRemove={() => setStorefrontUrl("")} hint="Photo of your shop, stall, menu, or products. Increases trust and approval speed." />

              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", background: "white", border: "1px solid #E2E8F0", borderRadius: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 2 }} />
                <span style={{ fontSize: 12, color: "#334155", lineHeight: 1.5 }}>
                  I confirm these documents are true and belong to <strong>{businessName || "my business"}</strong> and <strong>{contactPerson || "the contact person"}</strong>. I understand fake documents will be rejected and the account may be blocked. <span style={{ color: "#DC2626" }}>*</span>
                </span>
              </label>

              <div style={{ padding: "12px 14px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, fontSize: 12, color: "#14532D", lineHeight: 1.5 }}>
                <strong>What happens after you submit?</strong> Your business becomes <strong>Pending</strong> and is not visible in Explore or Feed. An admin opens your photos in the Admin dashboard and taps <strong>Verify</strong> only if they are true documents — otherwise <strong>Reject</strong> with a reason so you can fix and resubmit. No auto-verify.
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button disabled={saving || !!uploadingKey} onClick={() => (step === 0 ? void signOut().catch(() => undefined) : setStep((step - 1) as 0 | 1 | 2))} className="input" style={{ flex: 1, fontWeight: 700, background: "white", cursor: "pointer" as const }}>
              {step === 0 ? "Use different account" : "Back"}
            </button>
            {step < 2 ? (
              <button
                disabled={saving || !!uploadingKey}
                onClick={() => {
                  setError(null);
                  if (step === 0 && !canStep0) { setError("Complete business name and location."); return; }
                  if (step === 1 && !canStep1) { setError("Complete contact person, ID number, and front photo."); return; }
                  setStep((step + 1) as 1 | 2);
                }}
                className="onboarding-primary"
                style={{ flex: 1, opacity: saving || uploadingKey ? 0.55 : 1 }}
              >
                Next <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
              </button>
            ) : (
              <button disabled={saving || !canSubmit || !!uploadingKey} onClick={() => void save()} className="onboarding-primary" style={{ flex: 1, opacity: saving || !canSubmit || uploadingKey ? 0.55 : 1 }}>
                {saving ? <div className="spinner" style={{ borderTopColor: "white", width: 20, height: 20, borderWidth: 2 }} /> : <>Submit for admin review <span className="material-symbols-outlined" style={{ fontSize: 18 }}>send</span></>}
              </button>
            )}
          </div>

          <div style={{ fontSize: 11, color: "#94A3B8", textAlign: "center" }}>
            Business onboarding is separate from traveler onboarding — travelers choose interests & budget, businesses submit requirements first.
          </div>
        </div>
      </div>
    </div>
  );
}
