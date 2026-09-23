import { useCallback, useEffect, useRef, useState } from "react";
import { sendItineraryChat, type ChatMessage } from "@/lib/ai-itinerary-chat";
import { buildPromptItinerary } from "@/lib/prompt-itinerary-builder";
import { readRegisteredSmallBusinesses } from "@/lib/business-content";
import type { ItineraryDay } from "@/lib/database";
import { SkeletonItinerary } from "@/components/skeleton";
import { Tooltip } from "@/components/tooltip";

function Icon({ name, size = 18, color, filled }: { name: string; size?: number; color?: string; filled?: boolean }) {
  return <span className={`material-symbols-outlined ${filled ? "icon-filled" : ""}`} style={{ fontSize: size, color }}>{name}</span>;
}

function ItineraryCard({ itinerary, budgetText, onExclude, onReplaceStop, compact }: {
  itinerary: ItineraryDay[];
  budgetText?: string | number | null;
  onExclude?: (title: string) => void;
  onReplaceStop?: (day: number, stopIndex: number, title: string) => void;
  compact?: boolean;
}) {
  const bizNames = new Set(readRegisteredSmallBusinesses().map((b) => b.name.toLowerCase().trim()));
  const budgetLabel = !budgetText ? "Moderate (₱700–₱1,500 / person)" : typeof budgetText === "number" ? `₱${budgetText.toLocaleString()} Total` : budgetText === "Budget" ? "₱300–₱700 / person (Budget)" : budgetText === "Premium" ? "₱1,500+ / person (Premium)" : String(budgetText);
  return (
    <div className={`itinerary-preview ${compact ? "itinerary-preview-compact" : ""}`}>
      {!compact && (
        <div className="itinerary-budget-banner">
          <div className="itinerary-budget-icon"><Icon name="account_balance_wallet" size={18} color="white" /></div>
          <div className="itinerary-budget-copy"><span className="itinerary-budget-label">Trip Budget</span><strong>{budgetLabel}</strong></div>
        </div>
      )}
      {itinerary.map((day) => (
        <div className="itinerary-day" key={day.day}>
          <div className="itinerary-day-heading"><span>Day {day.day}</span><strong>{day.title}</strong></div>
          <div className="itinerary-timeline">
            {day.stops.map((stop, si) => {
              const isBiz = bizNames.has(stop.title.toLowerCase().trim()) || stop.note.includes("registered Hilinga small business");
              return (
                <div className="itinerary-stop" key={`${day.day}-${si}-${stop.title}`}>
                  <div className="itinerary-stop-icon"><Icon name={stop.icon} size={16} color="var(--c-green)" /></div>
                  <div className="itinerary-stop-copy">
                    <span>{stop.time}</span>
                    {isBiz && <span className="itinerary-business-badge"><Icon name="verified" size={12} color="var(--c-green)" filled /> Registered Local Business</span>}
                    <strong>{stop.title}</strong>
                    {!compact && <p>{stop.note}</p>}
                    {(onReplaceStop || onExclude) && (
                      <div className="itinerary-actions-row">
                        {onReplaceStop && (
                          <Tooltip content={`Replace ${stop.title}`}>
                            <button type="button" className="itinerary-replace-btn" onClick={() => onReplaceStop(day.day, si, stop.title)} aria-label={`Replace ${stop.title}`}>
                              <Icon name="swap_horiz" size={14} /> Replace
                            </button>
                          </Tooltip>
                        )}
                        {onExclude && (
                          <Tooltip content={`Remove ${stop.title}`}>
                            <button type="button" className="itinerary-exclude" onClick={() => onExclude(stop.title)} aria-label={`Remove ${stop.title}`}>
                              <Icon name="remove_circle" size={14} /> Remove
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ItineraryChatPanel({
  selectedDays, selectedPace, selectedBudget,
  onSaveItinerary,
  saving,
}: {
  selectedDays: number;
  selectedPace: "Relaxed" | "Balanced" | "Packed";
  selectedBudget: "Budget" | "Moderate" | "Premium";
  onSaveItinerary: (itinerary: ItineraryDay[], promptText: string) => Promise<void>;
  saving: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [days, setDays] = useState(selectedDays);
  const [pace, setPace] = useState(selectedPace);
  const [budget, setBudget] = useState(selectedBudget);
  const [replaceTarget, setReplaceTarget] = useState<{ day: number; stopIndex: number; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDays(selectedDays); }, [selectedDays]);
  useEffect(() => { setPace(selectedPace); }, [selectedPace]);
  useEffect(() => { setBudget(selectedBudget); }, [selectedBudget]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const historyForApi = messages.filter((m) => !m.pending && !m.error).slice(-10).map((m) => ({ role: m.role, content: m.content }));

  const send = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;
    setError(null);
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString() };
    const pendingId = `a-${Date.now()}`;
    const pending: ChatMessage = { id: pendingId, role: "assistant", content: "", createdAt: new Date().toISOString(), pending: true };
    setMessages((prev) => [...prev, userMsg, pending]);
    setInput("");
    setSending(true);
    try {
      const businesses = readRegisteredSmallBusinesses().map(({ name, category, location, hours, about }) => ({ name, category, location, hours, about }));
      const res = await sendItineraryChat({ prompt: text, days, budget, pace, localBusinesses: businesses, history: historyForApi.map((h) => ({ role: h.role as any, content: h.content })) });
      const assistant: ChatMessage = {
        id: pendingId,
        role: "assistant",
        content: res.text || (res.itinerary ? `Here's your ${res.itinerary.length}-day Albay itinerary, grounded in the app database.` : "Here's a response."),
        itinerary: res.itinerary,
        warnings: res.warnings,
        grounded: res.grounded,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => prev.map((m) => m.id === pendingId ? assistant : m));
    } catch (e: any) {
      // fallback to local builder so user still gets an itinerary
      const businesses = readRegisteredSmallBusinesses();
      const fallback = buildPromptItinerary(text, days, budget, pace, businesses);
      const assistant: ChatMessage = {
        id: pendingId,
        role: "assistant",
        content: `Crafted locally — AI was unavailable (${e?.message || "network error"}). This itinerary was built from your app's database.`,
        itinerary: fallback,
        grounded: true,
        warnings: ["AI unavailable — showing locally built itinerary from verified places."],
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => prev.map((m) => m.id === pendingId ? assistant : m));
      setError(null);
    } finally {
      setSending(false);
    }
  }, [input, sending, days, budget, pace, historyForApi]);

  function excludeFromLast(title: string) {
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === "assistant" && next[i].itinerary) {
          const it = next[i].itinerary!;
          next[i] = { ...next[i], itinerary: it.map((d) => ({ ...d, stops: d.stops.filter((s) => s.title.toLowerCase() !== title.toLowerCase()) })) };
          break;
        }
      }
      return next;
    });
  }
  function replaceInLast(day: number, stopIndex: number, newTitle: string) {
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === "assistant" && next[i].itinerary) {
          const it = next[i].itinerary!.map((d) => d.day !== day ? d : {
            ...d, stops: d.stops.map((s, idx) => idx !== stopIndex ? s : ({ ...s, title: newTitle, note: `Customized stop: ${newTitle}.` }))
          });
          next[i] = { ...next[i], itinerary: it };
          break;
        }
      }
      return next;
    });
    setReplaceTarget(null);
  }

  const lastAssistantWithItinerary = [...messages].reverse().find((m) => m.role === "assistant" && m.itinerary && m.itinerary.length);
  const canSave = Boolean(lastAssistantWithItinerary?.itinerary && !saving);

  return (
    <div className="chat-shell" style={{ minHeight: 420 }}>
      <div className="chat-thread" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <span style={{ width: 44, height: 44, borderRadius: 14, background: "var(--c-pale)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="auto_awesome" size={22} color="var(--c-green)" filled />
            </span>
            <strong>Chat with Hilinga AI</strong>
            <p style={{ fontSize: 13, lineHeight: "18px", maxWidth: 320 }}>Describe your trip in natural language — e.g. “2-day relaxed food trip near Legazpi, budget” — and I’ll build an Albay itinerary using only places in the app’s database.</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
              {["Make it more relaxed", "Add a local cafe", "Swap Day 2 for nature"].map((s) => (
                <button key={s} onClick={() => send(s)} style={{ padding: "6px 10px", borderRadius: 999, background: "var(--c-chip)", fontSize: 12, fontWeight: 800 }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-bubble-row ${m.role === "user" ? "user" : ""}`}>
            {m.role === "assistant" && <span className="chat-avatar"><Icon name="auto_awesome" size={14} color="white" filled /></span>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: m.role === "user" ? "82%" : "92%", alignItems: m.role === "user" ? "flex-end" : "stretch" }}>
              <div className={`chat-bubble ${m.role === "user" ? "user" : ""}`}>
                {m.pending ? (
                  <span className="chat-typing"><i /><i /><i /></span>
                ) : m.error ? (
                  <span style={{ color: "var(--c-red)" }}>{m.error}</span>
                ) : (
                  m.content
                )}
              </div>
              {m.warnings && m.warnings.length > 0 && (
                <div className="chat-warnings">
                  {m.warnings.map((w, i) => (
                    <span key={i} className="chat-warning"><Icon name="info" size={14} color="#A76116" />{w}</span>
                  ))}
                </div>
              )}
              {m.itinerary && m.itinerary.length > 0 && (
                <div className="card" style={{ padding: 12 }}>
                  <ItineraryCard
                    itinerary={m.itinerary}
                    budgetText={budget}
                    onExclude={excludeFromLast}
                    onReplaceStop={(day, idx, title) => setReplaceTarget({ day, stopIndex: idx, title })}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <Tooltip content="Save this itinerary to your trip plans">
                      <button
                        onClick={() => {
                          const promptForTitle = messages.find((x) => x.role === "user")?.content || "Albay Adventure";
                          void onSaveItinerary(m.itinerary!, promptForTitle);
                        }}
                        disabled={!canSave}
                        style={{ flex: 1, minHeight: 42, borderRadius: 13, background: canSave ? "var(--c-green)" : "var(--c-line)", color: "white", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                      >
                        <Icon name="bookmark_add" size={18} color="white" /> Save itinerary
                      </button>
                    </Tooltip>
                  </div>
                </div>
              )}
            </div>
            {m.role === "user" && <span className="chat-avatar user"><Icon name="person" size={14} color="white" /></span>}
          </div>
        ))}
        {sending && messages[messages.length - 1]?.pending !== true && (
          <div className="chat-bubble-row"><span className="chat-avatar"><Icon name="auto_awesome" size={14} color="white" filled /></span><SkeletonItinerary /></div>
        )}
      </div>

      <div className="chat-composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask for an itinerary or refine the last one — e.g. Make Day 1 more relaxed and add a registered cafe..."
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
        />
        <Tooltip content={sending ? "Hilinga is replying..." : "Send message (Enter)"}>
          <button className="chat-send" onClick={() => void send()} disabled={!input.trim() || sending} aria-label="Send chat message">
            <Icon name={sending ? "hourglass_top" : "send"} size={18} color="white" />
          </button>
        </Tooltip>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}

      {replaceTarget && (
        <div className="card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <strong style={{ fontSize: 13 }}>Replace "{replaceTarget.title}"</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              autoFocus
              placeholder="New place name (must be in database)"
              defaultValue=""
              id="chat-replace-input"
              style={{ flex: 1, height: 40, border: "1px solid var(--c-line)", borderRadius: 12, padding: "0 10px" }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v) replaceInLast(replaceTarget.day, replaceTarget.stopIndex, v);
                }
              }}
            />
            <button
              onClick={() => {
                const el = document.getElementById("chat-replace-input") as HTMLInputElement | null;
                const v = el?.value.trim();
                if (v) replaceInLast(replaceTarget.day, replaceTarget.stopIndex, v);
              }}
              style={{ padding: "0 14px", borderRadius: 12, background: "var(--c-green)", color: "white", fontWeight: 800 }}
            >
              Replace
            </button>
            <button onClick={() => setReplaceTarget(null)} style={{ padding: "0 10px", color: "var(--c-body)", fontWeight: 800 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
