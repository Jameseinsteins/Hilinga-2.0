import { useCallback, useEffect, useMemo, useState } from "react";
import type { ItineraryDay, TripPlan } from "@/lib/database";
import { getTripPlans, updateTripPlan } from "@/lib/cloud-user-data";
import {
  cancelBooking as cancelBookingRow,
  createBooking,
  getBookings,
  recordPayment,
  updateBookingStatus,
} from "@/lib/booking-system";
import {
  calculateTotalPrice,
  generateConfirmationNumber,
  type Booking,
  type PaymentMethod_Card,
  type PaymentMethod_Cash,
  type PaymentMethod_Wallet,
  type PaymentTransaction,
  type PriceBreakdown,
} from "@/lib/payment-system";
import { createPaymentProcessor } from "@/lib/payment-processor";
import { insertStop as insertItineraryStopEditor } from "@/lib/itinerary-editor";
import { readRegisteredSmallBusinesses } from "@/lib/business-content";
import { useAuth } from "@/providers/auth-provider";
import { useDatabase } from "@/providers/database-provider";

// ── Helpers ──
function formatPHP(n: number): string {
  return `₱${Math.round(n).toLocaleString("en-PH")}`;
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(start: string, days: number): string {
  const d = new Date(`${start}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function luhnValid(num: string): boolean {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}
function detectBrand(num: string): string {
  const d = num.replace(/\D/g, "");
  if (/^4/.test(d)) return "Visa";
  if (/^5[1-5]/.test(d)) return "Mastercard";
  if (/^3[47]/.test(d)) return "Amex";
  if (/^6/.test(d)) return "Discover";
  return "Card";
}

// ── Shared primitives (reuse app look without importing hilinga-app internals) ──
function Icon({ name, size = 20, color, filled }: { name: string; size?: number; color?: string; filled?: boolean }) {
  return <span className={`material-symbols-outlined ${filled ? "icon-filled" : ""}`} style={{ fontSize: size, color }}>{name}</span>;
}
function Pill({ label, tone = "green" }: { label: string; tone?: "green" | "amber" | "red" | "gray" }) {
  const bg = tone === "amber" ? "#FFF7E6" : tone === "red" ? "#FFF1EF" : tone === "gray" ? "#F1F5F3" : "#EAF6EF";
  const fg = tone === "amber" ? "#8A6A1A" : tone === "red" ? "#A2443C" : tone === "gray" ? "#526159" : "#26734A";
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 900, letterSpacing: .2 }}>{label}</span>;
}
function Fieldish({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 800, color: "var(--c-ink)" }}>{label}{children}{error && <span style={{ color: "var(--c-red)", fontSize: 11, fontWeight: 600 }}>{error}</span>}</label>;
}
function AppModalLike({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  if (!visible) return null;
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button onClick={onClose} aria-label={`Close ${title}`}><Icon name="cancel" size={28} color="var(--c-muted)" /></button>
        </div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
      </div>
    </div>
  );
}

// ── BookingFlowModal ──
export function BookingFlowModal({
  plan,
  open,
  onClose,
  onBooked,
}: {
  plan: TripPlan | null;
  open: boolean;
  onClose: () => void;
  onBooked: (b: Booking) => void;
}) {
  const db = useDatabase();
  const { user } = useAuth();
  const [participants, setParticipants] = useState(2);
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(() => addDaysISO(todayISO(), 2));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open && plan) {
      const s = todayISO();
      const days = Math.max(1, Math.ceil((plan.preferences.durationHours || 24) / 10));
      setParticipants(2);
      setStartDate(s);
      setEndDate(addDaysISO(s, Math.max(1, days - 1)));
      setNotes("");
      setErr(null);
      setOkMsg(null);
    }
  }, [open, plan]);

  const pricing: PriceBreakdown | null = useMemo(() => {
    if (!plan) return null;
    const basePerTrip = plan.preferences.budget ?? 3000;
    const base = basePerTrip * Math.max(1, participants);
    return calculateTotalPrice(base);
  }, [plan, participants]);

  const canSubmit = !!plan && !!user && !!pricing && !!startDate && !!endDate && endDate >= startDate && !busy;

  const submit = useCallback(async () => {
    if (!plan || !user || !pricing) return;
    if (endDate < startDate) { setErr("End date must be on or after start date."); return; }
    setBusy(true); setErr(null);
    try {
      const confirmation = generateConfirmationNumber();
      const booking = await createBooking(db, user.uid, plan.id, participants, startDate, endDate, pricing, confirmation);
      // move to awaiting_payment immediately so Pay CTA is valid via status transition helper
      try { await updateBookingStatus(db, user.uid, booking.id, "awaiting_payment", "pending"); } catch {}
      setOkMsg(`Booked — ${confirmation}. You can pay now.`);
      onBooked({ ...booking, status: "awaiting_payment", paymentStatus: "pending", confirmationNumber: confirmation } as Booking);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Booking failed. Please try again.");
    } finally { setBusy(false); }
  }, [plan, user, pricing, participants, startDate, endDate, db, onBooked]);

  if (!open || !plan) return null;
  return (
    <AppModalLike visible={open} title={`Book: ${plan.title}`} onClose={() => !busy && onClose()}>
      <div className="booking-flow">
        <div className="booking-flow-hero">
          <span className="eyebrow">Booking</span>
          <h3>{plan.title}</h3>
          <p>{plan.preferences.durationHours} hours · {plan.preferences.transportation || "Local transport"} · {(plan.itinerary?.length ?? 0)} day(s)</p>
        </div>

        {!user && <p className="error-text">Sign in to book. Your booking will be saved locally and synced when online.</p>}

        <div className="booking-grid">
          <Fieldish label="Travelers">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button type="button" onClick={() => setParticipants((n) => Math.max(1, n - 1))} style={{ width: 42, height: 42, borderRadius: 12, border: "1px solid var(--c-line)", background: "white", fontWeight: 900 }}>-</button>
              <strong style={{ minWidth: 44, textAlign: "center", fontSize: 18 }}>{participants}</strong>
              <button type="button" onClick={() => setParticipants((n) => Math.min(10, n + 1))} style={{ width: 42, height: 42, borderRadius: 12, border: "1px solid var(--c-line)", background: "white", fontWeight: 900 }}>+</button>
              <span style={{ color: "var(--c-muted)", fontSize: 11, fontWeight: 700 }}>1–10</span>
            </div>
          </Fieldish>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Fieldish label="Start date">
              <input type="date" value={startDate} min={todayISO()} onChange={(e) => { const v = e.target.value; setStartDate(v); if (endDate < v) setEndDate(v); }} style={{ minHeight: 44, border: "1px solid var(--c-line)", borderRadius: 12, padding: "0 12px" }} />
            </Fieldish>
            <Fieldish label="End date">
              <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} style={{ minHeight: 44, border: "1px solid var(--c-line)", borderRadius: 12, padding: "0 12px" }} />
            </Fieldish>
          </div>

          <Fieldish label="Notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Dietary, accessibility, or pickup notes" style={{ minHeight: 72, border: "1px solid var(--c-line)", borderRadius: 12, padding: 12, resize: "vertical" }} />
          </Fieldish>
        </div>

        {pricing && (
          <div className="booking-price-card">
            <div className="booking-price-row"><span>Base × {participants}</span><strong>{formatPHP(pricing.basePrice)}</strong></div>
            <div className="booking-price-row"><span>Taxes (12%)</span><span>{formatPHP(pricing.taxes)}</span></div>
            <div className="booking-price-row"><span>Fees (5%)</span><span>{formatPHP(pricing.fees)}</span></div>
            <div className="booking-price-total"><span>Total</span><strong>{formatPHP(pricing.total)} <small style={{ fontWeight: 700, color: "var(--c-muted)" }}>{pricing.currencyCode}</small></strong></div>
            <p className="booking-price-note"><Icon name="info" size={14} /> Pay securely inside the app — no external redirect. You can pay now or from My Bookings.</p>
          </div>
        )}

        {err && <p className="error-text" role="alert">{err}</p>}
        {okMsg && <p style={{ padding: "10px 12px", borderRadius: 12, background: "#EAF6EF", color: "#26734A", fontWeight: 800 }} role="status">{okMsg}</p>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ minHeight: 46, borderRadius: 13, background: "white", border: "1px solid var(--c-line)", fontWeight: 900 }}>Close</button>
          <button type="button" onClick={() => void submit()} disabled={!canSubmit} style={{ minHeight: 46, borderRadius: 13, background: !canSubmit ? "#C8D2CC" : "var(--c-green)", color: "white", fontWeight: 900, opacity: busy ? .7 : 1 }}>{busy ? "Booking…" : `Book for ${pricing ? formatPHP(pricing.total) : ""}`}</button>
        </div>
      </div>
    </AppModalLike>
  );
}

// ── PaymentPanelModal (in-app, no redirect) ──
export function PaymentPanelModal({
  booking,
  tripTitle,
  open,
  onClose,
  onPaid,
}: {
  booking: Booking | null;
  tripTitle?: string;
  open: boolean;
  onClose: () => void;
  onPaid: (b: Booking) => void;
}) {
  const db = useDatabase();
  const { user } = useAuth();
  const [method, setMethod] = useState<"card" | "digital_wallet" | "cash_on_arrival" | null>("card");
  const [walletProvider, setWalletProvider] = useState<"apple_pay" | "google_pay" | "paypal">("google_pay");
  const [cardNumber, setCardNumber] = useState("4242424242424242");
  const [expiry, setExpiry] = useState("12/30");
  const [cvv, setCvv] = useState("123");
  const [cardName, setCardName] = useState("Juan Dela Cruz");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<PaymentTransaction | null>(null);

  useEffect(() => {
    if (open) { setErr(null); setSuccess(null); }
  }, [open, booking?.id]);

  const amount = booking?.pricing.total ?? 0;
  const currency = booking?.pricing.currencyCode ?? "PHP";

  const pay = useCallback(async () => {
    if (!booking || !user || !method) return;
    if (method === "card") {
      const num = cardNumber.replace(/\D/g, "");
      if (!luhnValid(num)) { setErr("Card number is not valid."); return; }
      const m = expiry.match(/^\s*(\d{1,2})\s*\/\s*(\d{2,4})\s*$/);
      if (!m) { setErr("Expiry must be MM/YY or MM/YYYY."); return; }
      const mm = parseInt(m[1], 10); const yyRaw = parseInt(m[2], 10);
      const yy = yyRaw < 100 ? 2000 + yyRaw : yyRaw;
      const now = new Date(); const curY = now.getFullYear(); const curM = now.getMonth() + 1;
      if (mm < 1 || mm > 12) { setErr("Month must be 1–12."); return; }
      if (yy < curY || (yy === curY && mm < curM)) { setErr("Card has expired."); return; }
      if (!/^\d{3,4}$/.test(cvv.trim())) { setErr("CVV must be 3–4 digits."); return; }
      if (!cardName.trim()) { setErr("Name on card is required."); return; }
    }
    setBusy(true); setErr(null);
    try {
      // Transition to awaiting_payment if still draft
      if (booking.status === "draft") {
        try { await updateBookingStatus(db, user.uid, booking.id, "awaiting_payment", "processing"); } catch {}
      } else if (booking.paymentStatus === "pending" || booking.paymentStatus === "failed") {
        try { await updateBookingStatus(db, user.uid, booking.id, booking.status === "paid" ? "paid" : "awaiting_payment", "processing"); } catch {}
      }

      let payMethod: PaymentMethod_Card | PaymentMethod_Wallet | PaymentMethod_Cash;
      if (method === "card") {
        const num = cardNumber.replace(/\D/g, "");
        const m = expiry.match(/^\s*(\d{1,2})\s*\/\s*(\d{2,4})\s*$/);
        const mm = m ? parseInt(m[1], 10) : 12;
        const yyRaw = m ? parseInt(m[2], 10) : 30;
        const yy = yyRaw < 100 ? 2000 + yyRaw : yyRaw;
        payMethod = { type: "card", last4: num.slice(-4), brand: detectBrand(num), expiryMonth: mm, expiryYear: yy } as PaymentMethod_Card;
      } else if (method === "digital_wallet") {
        payMethod = { type: "digital_wallet", provider: walletProvider } as PaymentMethod_Wallet;
      } else {
        payMethod = { type: "cash_on_arrival" } as PaymentMethod_Cash;
      }

      const processor = createPaymentProcessor(db, user.uid);
      const txn: PaymentTransaction = await processor.processPayment(booking, payMethod);

      if (txn.status === "completed" || txn.status === "processing") {
        // For cash_on_arrival we keep payment pending but mark booking paid (pay on arrival)
        const finalPaymentStatus = method === "cash_on_arrival" ? "pending" as const : "completed" as const;
        const finalBookingStatus = "paid" as const;
        await recordPayment(db, user.uid, { ...txn, status: finalPaymentStatus });
        await updateBookingStatus(db, user.uid, booking.id, finalBookingStatus, finalPaymentStatus);
        setSuccess({ ...txn, status: finalPaymentStatus });
        onPaid({ ...booking, status: finalBookingStatus, paymentStatus: finalPaymentStatus, paymentId: txn.id } as Booking);
      } else {
        await recordPayment(db, user.uid, txn);
        await updateBookingStatus(db, user.uid, booking.id, booking.status, "failed" as const);
        setErr(txn.failureReason || "Payment failed. You can retry.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Payment could not be processed. Please try again.");
    } finally { setBusy(false); }
  }, [booking, user, method, cardNumber, expiry, cvv, cardName, walletProvider, db, onPaid]);

  if (!open || !booking) return null;

  return (
    <AppModalLike visible={open} title={success ? "Payment confirmed" : `Pay — ${tripTitle ?? booking.tripPlanId.slice(0, 8)}`} onClose={() => !busy && onClose()}>
      {success ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center" }}>
          <span style={{ width: 56, height: 56, borderRadius: 18, background: "#EAF6EF", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--c-green)" }}><Icon name="verified" size={32} filled /></span>
          <h3 style={{ fontSize: 18 }}>{method === "cash_on_arrival" ? "Booking confirmed — pay on arrival" : "Payment completed"}</h3>
          <p style={{ color: "var(--c-body)", fontSize: 13, lineHeight: "18px" }}>Confirmation <strong>{booking.confirmationNumber}</strong> · {formatPHP(amount)} {currency}{success.transactionId ? ` · Ref ${success.transactionId}` : ""}</p>
          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{ minHeight: 44, borderRadius: 12, background: "white", border: "1px solid var(--c-line)", fontWeight: 900 }}>Done</button>
            <button type="button" onClick={() => { setSuccess(null); onClose(); }} style={{ minHeight: 44, borderRadius: 12, background: "var(--c-green)", color: "white", fontWeight: 900 }}>View bookings</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding: "10px 14px", borderRadius: 14, background: "#F2FAF5", border: "1px solid #C7EBD4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900 }}><Icon name="payments" size={18} color="var(--c-green)" /> {formatPHP(amount)} <small style={{ fontWeight: 700, color: "var(--c-muted)" }}>{currency}</small></span>
            <span style={{ fontSize: 11, color: "var(--c-body)", fontWeight: 700 }}>{booking.confirmationNumber}</span>
          </div>

          <div className="payment-methods">
            <button type="button" onClick={() => setMethod("card")} className={method === "card" ? "pay-method-active" : "pay-method"}><Icon name="credit_card" size={18} /> Card</button>
            <button type="button" onClick={() => setMethod("digital_wallet")} className={method === "digital_wallet" ? "pay-method-active" : "pay-method"}><Icon name="account_balance_wallet" size={18} /> Wallet</button>
            <button type="button" onClick={() => setMethod("cash_on_arrival")} className={method === "cash_on_arrival" ? "pay-method-active" : "pay-method"}><Icon name="payments" size={18} /> Cash on arrival</button>
          </div>

          {method === "card" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Fieldish label="Card number" error={!luhnValid(cardNumber.replace(/\D/g, "")) && cardNumber.trim() ? "Check the number" : undefined}>
                <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} inputMode="numeric" placeholder="4242 4242 4242 4242" style={{ minHeight: 44, border: "1px solid var(--c-line)", borderRadius: 12, padding: "0 12px" }} />
              </Fieldish>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Fieldish label="Expiry (MM/YY)">
                  <input value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="12/30" style={{ minHeight: 44, border: "1px solid var(--c-line)", borderRadius: 12, padding: "0 12px" }} />
                </Fieldish>
                <Fieldish label="CVV">
                  <input value={cvv} onChange={(e) => setCvv(e.target.value)} inputMode="numeric" placeholder="123" style={{ minHeight: 44, border: "1px solid var(--c-line)", borderRadius: 12, padding: "0 12px" }} />
                </Fieldish>
              </div>
              <Fieldish label="Name on card">
                <input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Full name" style={{ minHeight: 44, border: "1px solid var(--c-line)", borderRadius: 12, padding: "0 12px" }} />
              </Fieldish>
              <p style={{ fontSize: 11, color: "var(--c-muted)", lineHeight: "16px", display: "flex", gap: 6 }}><Icon name="lock" size={14} /> Simulated in-app payment — no external redirect. Processor mocked with 1 s delay + retry support.</p>
            </div>
          )}

          {method === "digital_wallet" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Fieldish label="Choose wallet">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(["google_pay", "apple_pay", "paypal"] as const).map((w) => (
                    <button key={w} type="button" onClick={() => setWalletProvider(w)} style={{ padding: "10px 14px", borderRadius: 999, border: walletProvider === w ? "2px solid var(--c-green)" : "1px solid var(--c-line)", background: walletProvider === w ? "#EAF6EF" : "white", fontWeight: 900, fontSize: 12 }}>{w.replace("_", " ")}</button>
                  ))}
                </div>
              </Fieldish>
              <p style={{ fontSize: 11, color: "var(--c-body)" }}>You will be charged {formatPHP(amount)} to your {walletProvider.replace("_", " ")} account inside the app.</p>
            </div>
          )}

          {method === "cash_on_arrival" && (
            <div style={{ padding: 12, borderRadius: 12, background: "#FFF9ED", border: "1px solid #F0D9B0", color: "#7A5B2D", fontSize: 12, lineHeight: "18px" }}>
              <strong style={{ display: "flex", gap: 6 }}><Icon name="storefront" size={16} /> Pay on arrival</strong>
              No card needed now. Your booking is confirmed and you pay the host/guide in person ({formatPHP(amount)}). Bring confirmation <strong>{booking.confirmationNumber}</strong>.
            </div>
          )}

          {err && <p className="error-text" role="alert">{err}</p>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 10 }}>
            <button type="button" onClick={onClose} disabled={busy} style={{ minHeight: 46, borderRadius: 13, background: "white", border: "1px solid var(--c-line)", fontWeight: 900 }}>Cancel</button>
            <button type="button" onClick={() => void pay()} disabled={busy || !method} style={{ minHeight: 46, borderRadius: 13, background: busy ? "#C8D2CC" : "var(--c-green)", color: "white", fontWeight: 900, opacity: busy ? .7 : 1 }}>{busy ? "Processing…" : method === "cash_on_arrival" ? `Confirm booking` : `Pay ${formatPHP(amount)}`}</button>
          </div>
        </>
      )}
    </AppModalLike>
  );
}

// ── ItineraryEditModal (insert a stop from catalog/registered) ──
const SUGGESTIONS: Array<{ title: string; subtitle: string; icon: string }> = [
  { title: "Cagsawa Ruins", subtitle: "Historic · Daraga", icon: "account_balance" },
  { title: "Mayon Skyline", subtitle: "Nature · Tabaco", icon: "landscape" },
  { title: "Sumlang Lake", subtitle: "Nature & Lake · Camalig", icon: "water_drop" },
  { title: "Legazpi Boulevard", subtitle: "Waterfront · Legazpi", icon: "beach_access" },
  { title: "Daraga Church", subtitle: "Heritage · Daraga", icon: "church" },
  { title: "Vera Falls", subtitle: "Waterfall · Malinao", icon: "water_drop" },
  { title: "Quitinday Hills", subtitle: "Hills · Camalig", icon: "hiking" },
  { title: "Mayon ATV Adventure", subtitle: "Adventure · Mayon", icon: "sports_motorsports" },
];

export function ItineraryEditModal({
  open,
  booking,
  plan,
  onClose,
  onSaved,
}: {
  open: boolean;
  booking: Booking | null;
  plan: TripPlan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const db = useDatabase();
  const { user } = useAuth();
  const [dayIndex, setDayIndex] = useState(0);
  const [position, setPosition] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const registered = useMemo(() => readRegisteredSmallBusinesses(), [open]);
  const itinerary = plan?.itinerary ?? [];
  const day = itinerary[dayIndex];

  useEffect(() => {
    if (open) { setDayIndex(0); setPosition(0); setErr(null); setQ(""); }
  }, [open, plan?.id]);

  useEffect(() => {
    if (day) setPosition(Math.min(position, day.stops.length));
  }, [dayIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredSuggestions = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = [
      ...registered.map((r) => ({ title: r.name, subtitle: `${r.category} · ${r.location} (Registered)`, icon: "storefront" })),
      ...SUGGESTIONS,
    ];
    if (!needle) return all;
    return all.filter((s) => `${s.title} ${s.subtitle}`.toLowerCase().includes(needle));
  }, [q, registered]);

  const add = useCallback(async (title: string, icon: string) => {
    if (!plan || !user || !day) return;
    setBusy(true); setErr(null);
    try {
      const newStop = {
        title: title.trim(),
        latitude: 13.139,
        longitude: 123.7336,
        durationMinutes: 60,
        note: `Added from booking ${booking?.confirmationNumber ?? ""}`.trim() || "Custom stop",
        icon: icon || "place",
        cost: 0,
      };
      const insertionPoint = { dayIndex, stopIndex: position, positionLabel: "after" as const };
      const result = insertItineraryStopEditor(plan.itinerary ?? [], insertionPoint, newStop);
      if (!result.success || !result.updatedItinerary) {
        setErr(result.error || "Could not insert stop.");
        return;
      }
      await updateTripPlan(db, user.uid, plan.id, { itinerary: result.updatedItinerary });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update itinerary.");
    } finally { setBusy(false); }
  }, [plan, user, day, dayIndex, position, booking, db, onSaved, onClose]);

  if (!open || !plan || !booking) return null;
  return (
    <AppModalLike visible={open} title={`Edit itinerary — ${plan.title}`} onClose={() => !busy && onClose()}>
      {itinerary.length === 0 ? (
        <p className="error-text">This trip has no itinerary yet — create one from the Planner first.</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Fieldish label="Day">
              <select value={dayIndex} onChange={(e) => setDayIndex(Number(e.target.value))} style={{ minHeight: 44, borderRadius: 12, border: "1px solid var(--c-line)", padding: "0 10px", background: "white" }}>
                {itinerary.map((d, i) => <option key={d.day} value={i}>Day {d.day}: {d.title.slice(0, 22)}</option>)}
              </select>
            </Fieldish>
            <Fieldish label="Insert after stop">
              <select value={position} onChange={(e) => setPosition(Number(e.target.value))} style={{ minHeight: 44, borderRadius: 12, border: "1px solid var(--c-line)", padding: "0 10px", background: "white" }}>
                {day && [...Array(day.stops.length + 1)].map((_, i) => (
                  <option key={i} value={i}>{i === 0 ? "At start" : `After ${i}: ${day.stops[i - 1]?.title.slice(0, 20) ?? ""}`}</option>
                ))}
                {!day && <option value={0}>At start</option>}
              </select>
            </Fieldish>
          </div>

          {day && (
            <div style={{ padding: 10, borderRadius: 12, background: "#F9FCFA", border: "1px solid #E1E9E3", fontSize: 11, lineHeight: "16px", color: "var(--c-body)" }}>
              Day {day.day} has {day.stops.length} stop(s). New stop will be inserted at position {position + 1} and times will be recalculated.
            </div>
          )}

          <Fieldish label="Search places & registered businesses">
            <div style={{ position: "relative" }}>
              <Icon name="search" size={18} color="var(--c-muted)" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Cagsawa, AVT, or a registered business" style={{ width: "100%", minHeight: 42, border: "1px solid var(--c-line)", borderRadius: 12, padding: "0 12px 0 36px", marginLeft: -24 }} />
            </div>
          </Fieldish>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", paddingRight: 2 }}>
            {filteredSuggestions.slice(0, 14).map((s) => (
              <button key={s.title} type="button" disabled={busy} onClick={() => void add(s.title, s.icon)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 13, background: "white", border: "1px solid var(--c-line)", textAlign: "left" }}>
                <span style={{ width: 38, height: 38, borderRadius: 12, background: "var(--c-pale)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={s.icon} size={18} color="var(--c-green)" /></span>
                <span style={{ flex: 1 }}><strong style={{ fontSize: 13 }}>{s.title}</strong><small style={{ display: "block", color: "var(--c-body)", fontSize: 11 }}>{s.subtitle}</small></span>
                <Icon name="add" size={18} color="var(--c-green)" />
              </button>
            ))}
            {filteredSuggestions.length === 0 && <p style={{ color: "var(--c-muted)", fontSize: 12, textAlign: "center", padding: 12 }}>No matches.</p>}
          </div>

          {err && <p className="error-text" role="alert">{err}</p>}
          <p style={{ fontSize: 11, color: "var(--c-muted)", lineHeight: "16px" }}><Icon name="info" size={14} /> The itinerary is saved to your trip plan and visible on the smart map. Edits are kept locally and synced when online — the booking’s itinerary link stays in sync.</p>
        </>
      )}
    </AppModalLike>
  );
}

// ── MyBookingsSection (self-contained list) ──
export function MyBookingsSection({
  onPay,
  onEditItinerary,
  refreshKey = 0,
}: {
  onPay: (b: Booking) => void;
  onEditItinerary: (b: Booking) => void;
  refreshKey?: number;
}) {
  const db = useDatabase();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [plansById, setPlansById] = useState<Map<string, TripPlan>>(new Map());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setBookings([]); setPlansById(new Map()); setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      const [bs, pls] = await Promise.all([getBookings(db, user.uid), getTripPlans(db, user.uid)]);
      setBookings(bs);
      setPlansById(new Map(pls.map((p) => [p.id, p])));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Bookings could not be loaded.");
    } finally { setLoading(false); }
  }, [db, user]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const doCancel = useCallback(async (b: Booking) => {
    if (!user) return;
    setCancelBusy(true);
    try { await cancelBookingRow(db, user.uid, b.id); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Cancel failed."); }
    finally { setCancelBusy(false); setCancelId(null); }
  }, [db, user, load]);

  if (!user) {
    return <div className="card" style={{ padding: 16, textAlign: "center", color: "var(--c-body)", fontSize: 13 }}>Sign in to see your bookings. Bookings are saved locally even offline.</div>;
  }
  if (loading) return <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 10 }}><span className="spinner" style={{ width: 18, height: 18 }} /> <span style={{ fontSize: 13, color: "var(--c-body)" }}>Loading bookings…</span></div>;
  if (err) return <div className="card" style={{ padding: 16 }}><p className="error-text">{err}</p><button onClick={() => void load()} style={{ marginTop: 8, padding: "8px 12px", borderRadius: 10, background: "var(--c-green)", color: "white", fontWeight: 800 }}>Try again</button></div>;
  if (bookings.length === 0) {
    return (
      <div className="card" style={{ padding: 18, display: "flex", gap: 14, alignItems: "center", background: "#F9FCFA", borderStyle: "dashed" as const }}>
        <span style={{ width: 46, height: 46, borderRadius: 15, background: "var(--c-pale)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="confirmation_number" size={22} color="var(--c-green)" /></span>
        <div><strong style={{ fontSize: 14 }}>No bookings yet</strong><p style={{ color: "var(--c-body)", fontSize: 12, lineHeight: "18px", marginTop: 3 }}>Book a saved trip above — it will appear here with its itinerary. You can pay in-app and edit the itinerary from the booking.</p></div>
      </div>
    );
  }

  return (
    <div className="my-bookings-list" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {bookings.map((b) => {
        const plan = plansById.get(b.tripPlanId);
        const statusTone: "green" | "amber" | "red" | "gray" = b.status === "paid" || b.status === "in_progress" || b.status === "completed" ? "green" : b.status === "cancelled" ? "red" : b.status === "awaiting_payment" ? "amber" : "gray";
        const payTone: "green" | "amber" | "red" | "gray" = b.paymentStatus === "completed" ? "green" : b.paymentStatus === "failed" ? "red" : b.paymentStatus === "processing" ? "amber" : "gray";
        const isExpanded = expanded === b.id;
        const canPay = b.status !== "cancelled" && b.status !== "completed" && b.paymentStatus !== "completed";
        const canEdit = !!plan && b.status !== "cancelled" && b.status !== "completed";
        return (
          <div key={b.id} className="card my-booking-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontWeight: 900, fontSize: 15 }}>{plan?.title ?? `Trip ${b.tripPlanId.slice(0, 8)}`} <small style={{ color: "var(--c-muted)", fontWeight: 700 }}>· {b.confirmationNumber}</small></span>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Pill label={b.status.replace("_", " ")} tone={statusTone} />
                  <Pill label={`pay: ${b.paymentStatus}`} tone={payTone} />
                  {b.participants ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 8px", borderRadius: 999, background: "var(--c-chip)", fontSize: 11, fontWeight: 800 }}><Icon name="group" size={13} /> {b.participants}</span> : null}
                </span>
                <span style={{ color: "var(--c-body)", fontSize: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Icon name="calendar_month" size={14} /> {b.startDate} → {b.endDate}</span>
                  <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Icon name="payments" size={14} color="var(--c-green)" /> <strong style={{ color: "var(--c-ink)" }}>{formatPHP(b.pricing.total)} {b.pricing.currencyCode}</strong></span>
                </span>
              </div>
              <button aria-label={`Cancel booking ${b.confirmationNumber}`} onClick={() => setCancelId(b.id)} disabled={b.status === "cancelled" || b.status === "completed"} style={{ width: 38, height: 38, borderRadius: 12, background: b.status === "cancelled" ? "#F1F5F3" : "#FFF1EF", color: "var(--c-red)", display: "flex", alignItems: "center", justifyContent: "center", opacity: b.status === "cancelled" || b.status === "completed" ? .5 : 1 }}><Icon name="cancel" size={18} /></button>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canPay && <button onClick={() => onPay(b)} style={{ flex: "1 1 140px", minHeight: 42, borderRadius: 12, background: "var(--c-green)", color: "white", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="lock" size={16} color="white" /> {b.paymentStatus === "failed" ? "Retry payment" : "Pay in app"}</button>}
              <button onClick={() => setExpanded(isExpanded ? null : b.id)} style={{ flex: "1 1 120px", minHeight: 42, borderRadius: 12, background: "white", border: "1px solid var(--c-line)", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{isExpanded ? "Hide itinerary" : "View itinerary"} <Icon name={isExpanded ? "expand_less" : "expand_more"} size={18} /></button>
              {canEdit && <button onClick={() => onEditItinerary(b)} style={{ flex: "1 1 130px", minHeight: 42, borderRadius: 12, background: "var(--c-pale)", color: "var(--c-green-dark)", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="edit" size={16} /> Edit itinerary</button>}
            </div>

            {isExpanded && (
              <div style={{ paddingTop: 8, borderTop: "1px solid var(--c-line)" }}>
                {plan?.itinerary && plan.itinerary.length > 0 ? (
                  <div className="itinerary-preview itinerary-preview-compact" style={{ gap: 10 }}>
                    {plan.itinerary.map((day) => (
                      <div key={day.day} className="itinerary-day">
                        <div className="itinerary-day-heading"><span>Day {day.day}</span><strong>{day.title}</strong></div>
                        <div className="itinerary-timeline">
                          {day.stops.map((s, i) => (
                            <div key={`${day.day}-${i}-${s.title}`} className="itinerary-stop">
                              <div className="itinerary-stop-icon"><Icon name={s.icon || "place"} size={15} color="var(--c-green)" /></div>
                              <div className="itinerary-stop-copy">
                                {s.time && <span>{s.time}</span>}
                                <strong>{s.title}</strong>
                                <p style={{ margin: 0, color: "var(--c-body)", fontSize: 11, lineHeight: "16px" }}>{s.note}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    <p style={{ fontSize: 10, color: "var(--c-muted)", display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}><Icon name="info" size={12} /> Itinerary is linked to this booking — edits from the booking update the trip plan.</p>
                  </div>
                ) : (
                  <p style={{ color: "var(--c-body)", fontSize: 12 }}>No itinerary on this trip yet.</p>
                )}
              </div>
            )}

            {cancelId === b.id && (
              <div style={{ padding: 12, borderRadius: 12, background: "#FFF1EF", border: "1px solid #F0C9C2", display: "flex", flexDirection: "column", gap: 10 }}>
                <strong style={{ fontSize: 13 }}>Cancel booking {b.confirmationNumber}?</strong>
                <p style={{ fontSize: 12, color: "var(--c-body)", lineHeight: "18px" }}>This will mark the booking as cancelled. You can re-book the same trip again.</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button disabled={cancelBusy} onClick={() => setCancelId(null)} style={{ flex: 1, minHeight: 40, borderRadius: 10, background: "white", border: "1px solid var(--c-line)", fontWeight: 800 }}>Keep</button>
                  <button disabled={cancelBusy} onClick={() => void doCancel(b)} style={{ flex: 1, minHeight: 40, borderRadius: 10, background: "var(--c-red)", color: "white", fontWeight: 900, opacity: cancelBusy ? .6 : 1 }}>{cancelBusy ? "Cancelling…" : "Cancel booking"}</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
