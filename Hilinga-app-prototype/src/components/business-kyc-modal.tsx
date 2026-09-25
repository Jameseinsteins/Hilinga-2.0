import { useEffect, useMemo, useRef, useState } from "react";
import {
  readRegisteredBusinesses,
  submitBusinessVerification,
  uploadVerificationDocument,
  type BusinessVerificationPayload,
  type BusinessVerificationStatus,
  type SubmitVerificationInput,
} from "@/lib/business-content";

// GCash-style 3-step KYC: Details -> ID -> Permit
// Uses Supabase storage `business-media/verification/{uid}/...` for docs

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

type Props = {
  open: boolean;
  onClose: () => void;
  ownerUid: string;
  businessName: string;
  status: BusinessVerificationStatus | null;
  existingPayload?: BusinessVerificationPayload;
  existingNotes?: string;
  onSubmitted: () => void;
};

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
    <div style={{ border: "1px dashed #CBD5E1", borderRadius: 14, padding: 14, background: value ? "#F8FAFC" : "white", display: "flex", gap: 12, alignItems: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: 12, overflow: "hidden", background: "#EEF2FF", border: "1px solid #E0E7FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#6366F1" }}>{uploading ? "hourglass_empty" : "add_a_photo"}</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1E293B", display: "flex", gap: 6, alignItems: "center" }}>
          {label} {required && <span style={{ color: "#DC2626" }}>*</span>} {uploading && <span style={{ fontSize: 11, color: "#6366F1", fontWeight: 700 }}>Uploading…</span>}
          {value && !uploading && <span style={{ fontSize: 11, color: "#059669", fontWeight: 800, background: "#ECFDF5", border: "1px solid #A7F3D0", padding: "2px 8px", borderRadius: 999 }}>Uploaded</span>}
        </div>
        {hint && <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{hint}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} style={{ padding: "7px 12px", borderRadius: 999, border: "1px solid #6366F1", background: uploading ? "#EEF2FF" : "white", color: "#4338CA", fontWeight: 800, fontSize: 12 }}>{value ? "Replace" : "Upload"}</button>
          {value && <button type="button" disabled={uploading} onClick={onRemove} style={{ padding: "7px 12px", borderRadius: 999, border: "1px solid #E2E8F0", background: "white", color: "#475569", fontWeight: 700, fontSize: 12 }}>Remove</button>}
          {value && <a href={value} target="_blank" rel="noreferrer" style={{ padding: "7px 12px", borderRadius: 999, background: "#F1F5F9", color: "#334155", fontWeight: 700, fontSize: 12, textDecoration: "none" }}>View</a>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.currentTarget.value = ""; }} />
    </div>
  );
}

export function BusinessKycModal({ open, onClose, ownerUid, businessName, status, existingPayload, existingNotes, onSubmitted }: Props) {
  const [step, setStep] = useState(0);
  const [contactPerson, setContactPerson] = useState(existingPayload?.contactPerson ?? "");
  const [idType, setIdType] = useState(existingPayload?.idType ?? ID_TYPES[0]);
  const [idNumber, setIdNumber] = useState(existingPayload?.idNumber ?? "");
  const [idFrontUrl, setIdFrontUrl] = useState(existingPayload?.idFrontUrl ?? "");
  const [idBackUrl, setIdBackUrl] = useState(existingPayload?.idBackUrl ?? "");
  const [permitUrl, setPermitUrl] = useState(existingPayload?.permitUrl ?? "");
  const [storefrontUrl, setStorefrontUrl] = useState(existingPayload?.storefrontUrl ?? "");
  const [agreed, setAgreed] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // hydrate when reopened with existing payload (rejected -> resubmit)
  useEffect(() => {
    if (!open) return;
    if (existingPayload) {
      setContactPerson(existingPayload.contactPerson ?? "");
      setIdType(existingPayload.idType ?? ID_TYPES[0]);
      setIdNumber(existingPayload.idNumber ?? "");
      setIdFrontUrl(existingPayload.idFrontUrl ?? "");
      setIdBackUrl(existingPayload.idBackUrl ?? "");
      setPermitUrl(existingPayload.permitUrl ?? "");
      setStorefrontUrl(existingPayload.storefrontUrl ?? "");
    }
    setStep(0);
    setError("");
    setAgreed(false);
  }, [open, existingPayload]);

  const canStep1 = useMemo(() => contactPerson.trim().length >= 3, [contactPerson]);
  const canStep2 = useMemo(() => idType.trim().length > 1 && idNumber.trim().length >= 4 && Boolean(idFrontUrl), [idType, idNumber, idFrontUrl]);
  const canStep3 = useMemo(() => Boolean(permitUrl) && agreed, [permitUrl, agreed]);

  async function handleUpload(file: File, setter: (v: string) => void, label: string) {
    setError("");
    setUploadingKey(label);
    try {
      const url = await uploadVerificationDocument(ownerUid, file, label);
      setter(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try a smaller image.");
    } finally {
      setUploadingKey(null);
    }
  }

  async function handleSubmit() {
    setError("");
    if (!canStep1) { setStep(0); setError("Enter the contact person full name (at least 3 characters)."); return; }
    if (!canStep2) { setStep(1); setError("Select ID type, enter ID number, and upload the front of your valid ID."); return; }
    if (!canStep3) { setStep(2); setError(permitUrl ? "Check the agreement to submit." : "Upload your business permit (DTI / Barangay / Mayor's / BIR)."); return; }
    const payload: SubmitVerificationInput = {
      contactPerson: contactPerson.trim(),
      idType: idType.trim(),
      idNumber: idNumber.trim(),
      idFrontUrl,
      idBackUrl: idBackUrl || undefined,
      permitUrl,
      storefrontUrl: storefrontUrl || undefined,
    };
    setSubmitting(true);
    try {
      await submitBusinessVerification(ownerUid, payload);
      onSubmitted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const steps = [
    { label: "Details", icon: "badge", desc: "Contact person" },
    { label: "Valid ID", icon: "id_card", desc: "Government ID" },
    { label: "Permit", icon: "approval", desc: "Business proof" },
  ];

  return (
    <div className="business-modal-backdrop" onClick={(e) => e.target === e.currentTarget && !submitting && onClose()} style={{ zIndex: 60 }}>
      <div className="business-create-sheet" style={{ maxWidth: 560, gap: 0, padding: 0, overflow: "hidden", borderRadius: 20 }}>
        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #E2E8F0", background: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: "#6366F1" }}>GCASH-STYLE VERIFICATION</div>
              <h2 style={{ fontSize: 18, fontWeight: 900, margin: "4px 0 2px", color: "#0F172A" }}>Get Verified — {businessName}</h2>
              <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>Submit requirements once. Admin reviews within 24 hours. You cannot post until verified.</p>
              {status === "rejected" && existingNotes && (
                <div style={{ marginTop: 8, padding: "8px 10px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, fontSize: 12, color: "#991B1B" }}><strong>Previous rejection:</strong> {existingNotes}</div>
              )}
            </div>
            <button type="button" onClick={onClose} disabled={submitting} aria-label="Close" style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid #E2E8F0", background: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
            </button>
          </div>

          {/* Stepper */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 16 }}>
            {steps.map((s, i) => {
              const active = i === step;
              const done = i < step;
              const isPast = done;
              return (
                <div key={s.label} style={{ flex: 1, display: "flex", alignItems: "center", gap: 0 }}>
                  <button type="button" onClick={() => setStep(i)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "6px 4px", border: "none", background: "transparent", cursor: "pointer" }}>
                    <span style={{
                      width: 36, height: 36, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
                      background: active ? "#4F46E5" : isPast ? "#10B981" : "#F1F5F9",
                      color: active || isPast ? "white" : "#64748B",
                      border: active ? "2px solid #4F46E5" : isPast ? "2px solid #10B981" : "1px solid #E2E8F0",
                      fontWeight: 800, fontSize: 13,
                    }}>
                      {isPast ? <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check</span> : <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{s.icon}</span>}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: active ? 800 : 600, color: active ? "#4F46E5" : isPast ? "#059669" : "#64748B" }}>{s.label}</span>
                    <span style={{ fontSize: 10, color: "#94A3B8" }}>{s.desc}</span>
                  </button>
                  {i < steps.length - 1 && <div style={{ height: 2, flex: 1, background: i < step ? "#10B981" : "#E2E8F0", borderRadius: 999, margin: "0 2px", marginBottom: 18 }} />}
                </div>
              );
            })}
          </div>
          <div style={{ height: 4, background: "#E2E8F0", borderRadius: 999, overflow: "hidden", marginTop: 12 }}>
            <div style={{ width: `${((step + 1) / steps.length) * 100}%`, height: "100%", background: "#4F46E5", transition: "width 0.3s" }} />
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 20px", background: "#F8FAFC", overflowY: "auto", maxHeight: "62vh", display: "flex", flexDirection: "column", gap: 14 }}>
          {error && <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: 12 }}>{error}</div>}

          {step === 0 && (
            <>
              <div style={{ padding: "12px 14px", background: "white", border: "1px solid #E0E7FF", borderRadius: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#3730A3", display: "flex", gap: 6, alignItems: "center" }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>info</span> Why we ask for this</div>
                <p style={{ fontSize: 12, color: "#475569", margin: "6px 0 0", lineHeight: 1.5 }}>Like GCash, we verify the <strong>real person behind the business</strong> so travelers trust what they see in Explore & Feed. One verified account = one business. Fake or duplicate listings are rejected.</p>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#1E293B" }}>Contact person (full name) <span style={{ color: "#DC2626" }}>*</span></span>
                <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Juan Dela Cruz" style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid #CBD5E1", fontSize: 14 }} />
                <span style={{ fontSize: 11, color: "#64748B" }}>Must match the name on your valid ID below.</span>
              </label>
              <div style={{ padding: "12px 14px", background: "white", borderRadius: 12, border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#64748B", letterSpacing: 0.5 }}>BUSINESS ON FILE</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginTop: 4 }}>{businessName}</div>
                <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>This is the business that will be verified. To change name/category/location, close this and Edit Page first.</div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>Government ID <span style={{ color: "#DC2626" }}>*</span></div>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>ID type</span>
                <select value={idType} onChange={(e) => setIdType(e.target.value)} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid #CBD5E1", fontSize: 14, background: "white" }}>
                  {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>ID / document number <span style={{ color: "#DC2626" }}>*</span></span>
                <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="e.g. 1234-5678-9012" style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid #CBD5E1", fontSize: 14 }} />
              </label>
              <Uploader label="Front of valid ID" required value={idFrontUrl} uploading={uploadingKey === "id-front"} onPick={(f) => void handleUpload(f, setIdFrontUrl, "id-front")} onRemove={() => setIdFrontUrl("")} hint="Clear photo of the front. Must show name, photo, and ID number. JPG/PNG up to 8 MB." />
              <Uploader label="Back of valid ID (optional)" value={idBackUrl} uploading={uploadingKey === "id-back"} onPick={(f) => void handleUpload(f, setIdBackUrl, "id-back")} onRemove={() => setIdBackUrl("")} hint="Back side if your ID has address/expiry on the back." />
              <div style={{ padding: "10px 12px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, fontSize: 11, color: "#92400E", display: "flex", gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, flexShrink: 0 }}>verified_user</span>
                <span>Your ID is only used for verification and is visible only to Hilinga admins. We never share it with travelers.</span>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Uploader label="Business permit" required value={permitUrl} uploading={uploadingKey === "permit"} onPick={(f) => void handleUpload(f, setPermitUrl, "permit")} onRemove={() => setPermitUrl("")} hint="DTI certificate, Barangay clearance, Mayor's permit, or BIR 2303 — any one that proves the business is registered. Must show business name." />
              <Uploader label="Storefront / product photo (optional but helps approval)" value={storefrontUrl} uploading={uploadingKey === "storefront"} onPick={(f) => void handleUpload(f, setStorefrontUrl, "storefront")} onRemove={() => setStorefrontUrl("")} hint="Photo of your shop, stall, menu, or products. Increases trust and approval speed." />
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", background: "white", border: "1px solid #E2E8F0", borderRadius: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 2 }} />
                <span style={{ fontSize: 12, color: "#334155", lineHeight: 1.5 }}>I confirm these documents are true and belong to <strong>{businessName}</strong> and <strong>{contactPerson || "the contact person"}</strong>. I understand fake documents will be rejected and the account may be blocked. <span style={{ color: "#DC2626" }}>*</span></span>
              </label>
              <div style={{ padding: "10px 12px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, fontSize: 11, color: "#1E40AF" }}>
                After you tap <strong>Submit for review</strong>, your business becomes <strong>Pending</strong> and is not visible in Explore/Feed until an admin approves it. You will stay pending if you close without submitting — you can reopen this form anytime.
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", background: "white", borderTop: "1px solid #E2E8F0", display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
          <button type="button" onClick={() => step === 0 ? onClose() : setStep(step - 1)} disabled={submitting} style={{ padding: "10px 16px", borderRadius: 999, border: "1px solid #E2E8F0", background: "white", fontWeight: 700, fontSize: 13, color: "#334155" }}>
            {step === 0 ? "Cancel" : "Back"}
          </button>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#94A3B8" }}>Step {step + 1} of 3</span>
            {step < 2 ? (
              <button type="button" onClick={() => { setError(""); if (step === 0 && !canStep1) { setError("Enter the contact person full name."); return; } if (step === 1 && !canStep2) { setError("Complete ID type, number, and front photo."); return; } setStep(step + 1); }} disabled={submitting} style={{ padding: "10px 18px", borderRadius: 999, border: "none", background: (step === 0 ? canStep1 : canStep2) ? "#4F46E5" : "#CBD5E1", color: "white", fontWeight: 800, fontSize: 13 }}>
                Next
              </button>
            ) : (
              <button type="button" onClick={() => void handleSubmit()} disabled={submitting} style={{ padding: "10px 18px", borderRadius: 999, border: "none", background: !submitting ? "#0EA5E9" : "#CBD5E1", color: "white", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                {submitting ? "Submitting…" : "Submit for review"} {!submitting && <span className="material-symbols-outlined" style={{ fontSize: 16 }}>send</span>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
