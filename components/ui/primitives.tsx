import type { ReactNode } from "react";

/* ---------------- layout primitives ---------------- */

export function Panel({
  children,
  className = "",
  variant = "default",
  id,
}: {
  children: ReactNode;
  className?: string;
  variant?: "default" | "flat" | "soft" | "dark";
  id?: string;
}) {
  const tone =
    variant === "dark"
      ? "px-panel px-panel-dark"
      : variant === "flat"
        ? "px-panel-flat"
        : variant === "soft"
          ? "px-panel-soft"
          : "px-panel";
  return (
    <div className={`${tone} ${className}`} id={id}>
      {children}
    </div>
  );
}

export function PanelHead({
  kicker,
  title,
  aside,
  dark = false,
}: {
  kicker?: string;
  title?: string;
  aside?: ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[56px] flex-wrap items-center justify-between gap-4 border-b-2 px-6 py-4 ${
        dark ? "border-white/20" : "border-ink"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-3">
        {kicker ? (
          <span className={dark ? "label-light" : "label"}>{kicker}</span>
        ) : null}
        {title ? (
          <h2
            className={`text-[15px] font-semibold tracking-[-0.01em] ${
              dark ? "text-white" : "text-ink"
            }`}
          >
            {title}
          </h2>
        ) : null}
      </div>
      {aside}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "ink",
  className = "",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ink" | "brand" | "danger" | "warn" | "ok";
  className?: string;
}) {
  const tones = {
    ink: "text-ink",
    brand: "text-brand",
    danger: "text-danger",
    warn: "text-warn",
    ok: "text-ok",
  } as const;
  return (
    <div className={`px-6 py-6 ${className}`}>
      <div className="label">{label}</div>
      <div
        className={`num mt-4 font-mono text-[30px] font-semibold leading-none tracking-[-0.05em] ${tones[tone]}`}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-2 font-mono text-[9px] leading-4 text-muted">{hint}</div>
      ) : null}
    </div>
  );
}

export function PixelMeter({
  value,
  blocks = 16,
  tone = "brand",
  className = "",
}: {
  value: number;
  blocks?: number;
  tone?: "brand" | "ink" | "ok" | "warn" | "danger";
  className?: string;
}) {
  const safe = Math.max(0, Math.min(100, value));
  const filled = Math.round((safe / 100) * blocks);
  const fill = {
    brand: "bg-brand",
    ink: "bg-ink",
    ok: "bg-ok",
    warn: "bg-warn",
    danger: "bg-danger",
  }[tone];
  return (
    <div
      aria-hidden="true"
      className={`flex h-2 items-stretch gap-[2px] ${className}`}
    >
      {Array.from({ length: blocks }, (_, index) => (
        <span
          className={`flex-1 ${index < filled ? fill : "bg-line-2"}`}
          key={index}
        />
      ))}
    </div>
  );
}

export function SeverityTag({ severity }: { severity: string }) {
  const tone =
    severity === "high" || severity === "error"
      ? "px-tag-danger"
      : severity === "medium" || severity === "warn"
        ? "px-tag-warn"
        : "px-tag";
  return <span className={`px-tag ${tone}`}>{severity}</span>;
}

export function PixelCursor({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`px-cursor ${className}`} />;
}
