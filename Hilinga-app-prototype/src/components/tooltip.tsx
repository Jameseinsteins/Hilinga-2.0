import { useId, useState, type ReactNode } from "react";

type TooltipProps = {
  content: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  delay?: number;
};

export function Tooltip({ content, children, side = "top", delay = 120 }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (timer) clearTimeout(timer);
    const t = setTimeout(() => setOpen(true), delay);
    setTimer(t);
  }
  function hide() {
    if (timer) clearTimeout(timer);
    setOpen(false);
  }

  return (
    <span
      className="tooltip-wrap"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={open ? id : undefined}
      style={{ display: "inline-flex" }}
    >
      {children}
      {open && (
        <span id={id} role="tooltip" className={`tooltip-bubble tooltip-${side}`}>
          {content}
        </span>
      )}
    </span>
  );
}

export function IconTooltip({ label, children }: { label: string; children: ReactNode }) {
  return <Tooltip content={label}>{children}</Tooltip>;
}
