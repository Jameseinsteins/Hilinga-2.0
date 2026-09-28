import { ReactNode, useMemo, useState } from "react";
import { readVerifiedSmallBusinesses } from "@/lib/business-content";

export function Icon({ name, size = 24, color, filled, className = "" }: { name: string; size?: number; color?: string; filled?: boolean; className?: string }) {
  return <span className={`material-symbols-outlined ${filled ? "icon-filled" : ""} ${className}`} style={{ fontSize: size, color }}>{name}</span>;
}

export function Card({ children, className = "", style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`card ${className}`} style={style}>{children}</div>;
}

export function Button({ label, onPress, disabled = false, destructive = false, loading = false, secondary = false }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  loading?: boolean;
  secondary?: boolean;
}) {
  const cls = destructive ? (secondary ? "btn btn-destructive" : "btn btn-destructive-fill") : secondary ? "btn btn-secondary" : "btn btn-primary";
  return (
    <button type="button" className={cls} disabled={disabled || loading} onClick={onPress}>
      {loading ? <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2, borderTopColor: secondary ? (destructive ? "var(--c-red)" : "var(--c-green)") : "white" }} /> : label}
    </button>
  );
}

export function AppModal({ visible, title, children, onClose }: { visible: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!visible) return null;
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button onClick={onClose} aria-label={`Close ${title}`}>
            <Icon name="cancel" size={28} color="var(--c-muted)" />
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}

export function ConfirmModal({ visible, title, message, confirmLabel, loading = false, onCancel, onConfirm }: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AppModal visible={visible} title={title} onClose={onCancel}>
      <p style={{ color: "var(--c-body)", lineHeight: "22px" }}>{message}</p>
      <Button label={confirmLabel} destructive onPress={onConfirm} loading={loading} />
      <Button label="Cancel" onPress={onCancel} secondary disabled={loading} />
    </AppModal>
  );
}

export function EmptyState({ icon, title, message, action, onAction }: { icon: string; title: string; message: string; action?: string; onAction?: () => void }) {
  return (
    <Card className="empty-state">
      <Icon name={icon} size={34} color="var(--c-muted)" />
      <span style={{ fontSize: 17, fontWeight: 800, textAlign: "center" }}>{title}</span>
      <span style={{ color: "var(--c-body)", textAlign: "center", lineHeight: "21px" }}>{message}</span>
      {action && onAction ? <Button label={action} onPress={onAction} secondary /> : null}
    </Card>
  );
}

export function ReplacePlaceModal({
  visible,
  target,
  onClose,
  onSelectReplacement,
}: {
  visible: boolean;
  target: { day: number; stopIndex: number; currentTitle: string } | null;
  onClose: () => void;
  onSelectReplacement: (newTitle: string) => void;
}) {
  const [customInput, setCustomInput] = useState("");
  const registeredBusinesses = useMemo(() => readVerifiedSmallBusinesses(), [visible]);
  const defaultSuggestions = useMemo(() => [
    { title: "Cagsawa Ruins", category: "Historic Site", location: "Daraga, Albay", icon: "account_balance" },
    { title: "Mayon ATV Adventure", category: "Adventure", location: "Mayon Foothills", icon: "sports_motorsports" },
    { title: "Sumlang Lake", category: "Nature & Views", location: "Camalig, Albay", icon: "water_drop" },
    { title: "Mayon Skyline", category: "Nature & Views", location: "Tabaco City, Albay", icon: "landscape" },
    { title: "Daraga faith and heritage trail", category: "Culture & History", location: "Daraga, Albay", icon: "church" },
    { title: "Sunset at Legazpi Boulevard", category: "Dining & Sunset", location: "Legazpi City", icon: "beach_access" },
    { title: "Quitinday Hills", category: "Hiking & Gems", location: "Camalig, Albay", icon: "explore" },
    { title: "Vera Falls", category: "Nature & Waterfalls", location: "Malinao, Albay", icon: "water_drop" },
  ], []);

  if (!visible || !target) return null;

  return (
    <AppModal visible={visible} title={`Replace "${target.currentTitle}"`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ color: "var(--c-body)", fontSize: 13 }}>Choose a registered local business or popular Albay spot to replace <strong>&quot;{target.currentTitle}&quot;</strong> in your plan:</p>

        {registeredBusinesses.length > 0 && (
          <div>
            <span className="eyebrow" style={{ marginBottom: 6, display: "block" }}>Registered Small Businesses</span>
            <div className="replace-option-grid">
              {registeredBusinesses.map((biz) => (
                <button
                  key={biz.name}
                  type="button"
                  className="replace-option-card"
                  onClick={() => { onSelectReplacement(biz.name); onClose(); }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 12, background: "var(--c-pale)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name="storefront" size={20} color="var(--c-green)" />
                  </div>
                  <div className="replace-option-info">
                    <strong>{biz.name} <small style={{ color: "var(--c-green)", fontWeight: 800 }}>• Registered</small></strong>
                    <span>{biz.category} in {biz.location}</span>
                  </div>
                  <Icon name="chevron_right" size={18} color="var(--c-muted)" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <span className="eyebrow" style={{ marginBottom: 6, display: "block", marginTop: 8 }}>Albay Popular Destinations</span>
          <div className="replace-option-grid">
            {defaultSuggestions.filter((item) => item.title.toLowerCase() !== target.currentTitle.toLowerCase()).map((item) => (
              <button
                key={item.title}
                type="button"
                className="replace-option-card"
                onClick={() => { onSelectReplacement(item.title); onClose(); }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 12, background: "var(--c-pale)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name={item.icon} size={20} color="var(--c-green)" />
                </div>
                <div className="replace-option-info">
                  <strong>{item.title}</strong>
                  <span>{item.category} • {item.location}</span>
                </div>
                <Icon name="chevron_right" size={18} color="var(--c-muted)" />
              </button>
            ))}
          </div>
        </div>

        <form
          className="replace-custom-box"
          onSubmit={(e) => {
            e.preventDefault();
            if (customInput.trim()) {
              onSelectReplacement(customInput.trim());
              setCustomInput("");
              onClose();
            }
          }}
        >
          <span className="eyebrow">Or type any custom place name</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="e.g. Jovellar Underground River"
              style={{ flex: 1, height: 42, border: "1px solid var(--c-line)", borderRadius: 13, padding: "0 12px" }}
            />
            <button
              type="submit"
              disabled={!customInput.trim()}
              style={{ padding: "0 16px", borderRadius: 13, background: "var(--c-green)", color: "white", fontWeight: 800, border: 0 }}
            >
              Replace
            </button>
          </div>
        </form>
      </div>
    </AppModal>
  );
}
