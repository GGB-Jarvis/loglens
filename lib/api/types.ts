export type RunStats = {
  records?: number;
  files?: number;
  anomalies?: number;
  start?: string;
  end?: string;
  parse_errors?: number;
};

export type RunMeta = {
  id: string;
  name: string;
  pack: string;
  status: "queued" | "running" | "done" | "error" | string;
  progress: number;
  stage: string;
  message: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  use_llm: boolean;
  llm_used: boolean;
  llm_model?: string | null;
  stats: RunStats;
  warnings: string[];
  error?: string | null;
};

export type KpiSeriesItem = {
  date: string;
  value: number | null;
  numerator?: number;
  denominator?: number;
};

export type Kpi = {
  id: string;
  name: string;
  type: "count" | "ratio" | string;
  unit?: string;
  direction?: "up" | "down" | string;
  total?: number;
  series: KpiSeriesItem[];
};

export type DailyItem = {
  date: string;
  total: number;
  errors: number;
  warns: number;
  info: number;
};

export type HourlyItem = {
  bucket: string;
  total: number;
  errors: number;
};

export type TemplateSummary = {
  template_id: number;
  count: number;
  pattern: string;
  sample?: string;
  severity: string;
  modules?: Record<string, number>;
  category?: string;
  meaning?: string;
};

export type FaultSummary = {
  fault_id: string;
  name: string;
  severity: string;
  count: number;
  modules?: string;
};

export type Summary = {
  run?: {
    id: string;
    pack: string;
    pack_version: string;
    generated_at: string;
    elapsed_s: number;
    prompt_version?: string;
  };
  overview: {
    records: number;
    files: number;
    parse_errors: number;
    parse_rate: number;
    start?: string;
    end?: string;
    duration_hours?: number;
    errors: number;
    warnings: number;
    error_rate: number;
    levels: Record<string, number>;
    modules: number;
  };
  daily: DailyItem[];
  hourly: HourlyItem[];
  kpis: Kpi[];
  events: Array<{ event_id: string; name: string; count: number }>;
  top_templates: TemplateSummary[];
  top_faults: FaultSummary[];
  top_error_modules: Array<{ module: string; count: number }>;
  files: Array<{
    path: string;
    size: number;
    encoding: string;
    lines: number;
    records: number;
    parse_errors: number;
    duplicates: number;
    first_ts?: string | null;
    last_ts?: string | null;
  }>;
};

export type RunDetail = {
  run: RunMeta;
  summary: Summary | null;
};

export type Anomaly = {
  id?: string;
  kind: string;
  severity: string;
  title: string;
  detail: string;
  window?: { from: string; to: string };
  score?: number;
  observed?: number;
  baseline?: number;
  citations?: string[];
  template_id?: number;
};

export type TemplateItem = {
  template_id: number;
  count: number;
  severity: string;
  category: string;
  meaning: string;
  pattern: string;
  sample: string;
  first_ts: string;
  last_ts: string;
  modules?: Record<string, number>;
};

export type LogItem = {
  ts: string;
  level: string;
  module: string;
  thread: string;
  message: string;
  file: string;
  line: number;
  template_id: number;
  citation: string;
};

export type Finding = {
  title: string;
  category: string;
  severity: string;
  confidence: number;
  summary: string;
  evidence_ids: string[];
  impact?: string;
  recommendations?: string[];
  counter_evidence?: string[];
  needs_human_review?: boolean;
};

export type Findings = {
  executive_summary: string[];
  findings: Finding[];
  data_gaps: string[];
  validation_warnings?: string[];
};

export type EvidenceFact = {
  id: string;
  kind: string;
  [key: string]: unknown;
};

export type Evidence = {
  facts: EvidenceFact[];
  timeline?: Array<{ ts: string; event: string; title: string }>;
  citations?: Record<string, string[]>;
  method?: Record<string, string>;
};

export type PackListItem = {
  id: string;
  name: string;
  version: string;
  description: string;
  protected?: boolean;
  error?: string;
};

export type PackDetail = PackListItem & {
  ingest?: Record<string, unknown>;
  events?: Array<Record<string, unknown>>;
  kpis?: Array<Record<string, unknown>>;
  faults?: Array<Record<string, unknown>>;
  glossary?: Record<string, string>;
  prompts?: Record<string, string>;
};

export type LLMSettings = {
  configured: boolean;
  base_url: string;
  model: string;
  api_key_set: boolean;
  session_id: string;
  timeout: number;
  max_tokens: number;
  source: string;
  settings_path: string;
  opencode?: {
    available: boolean;
    provider?: string;
    base_url?: string;
    model?: string;
    reason?: string;
  };
};

export type AppConfig = {
  llm_configured: boolean;
  llm_model?: string | null;
  llm_source?: string;
  data_dir: string;
};
