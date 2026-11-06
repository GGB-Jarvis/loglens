export function fmt(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function pct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export function shortTime(value?: string | null): string {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 16);
}

export function shortDate(value?: string | null): string {
  if (!value) return "—";
  return value.replace("T", " ").slice(5, 16);
}

export function duration(value?: string | null): string {
  if (!value) return "—";
  const match = value.match(/([\d.]+)\s*秒/);
  return match ? `${match[1]}s` : value;
}

export const STATUS_LABEL: Record<string, string> = {
  queued: "排队",
  running: "运行中",
  done: "完成",
  error: "失败",
};

export const STATUS_TAG: Record<string, string> = {
  queued: "px-tag px-tag-warn",
  running: "px-tag px-tag-brand",
  done: "px-tag px-tag-ok",
  error: "px-tag px-tag-danger",
};

export const SEVERITY_LABEL: Record<string, string> = {
  critical: "严重",
  high: "高",
  medium: "中",
  low: "低",
  error: "错误",
  warn: "警告",
  info: "信息",
};

export function severityTag(severity: string): string {
  if (severity === "critical" || severity === "high" || severity === "error") {
    return "px-tag px-tag-danger";
  }
  if (severity === "medium" || severity === "warn") return "px-tag px-tag-warn";
  if (severity === "low" || severity === "info") return "px-tag px-tag-brand";
  return "px-tag";
}
