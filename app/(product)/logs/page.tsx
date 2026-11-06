"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHead, SectionHead } from "@/components/layout/page-head";
import { ProductShell } from "@/components/layout/product-shell";
import { useRunContext } from "@/components/providers/run-context";
import {
  Arrow,
  Download,
  Panel,
  PanelHead,
  Search,
  SeverityTag,
} from "@/components/ui";
import {
  apiGet,
  runArtifact,
  type LogItem,
  type TemplateItem,
} from "@/lib/api";
import { fmt, shortTime } from "@/lib/format";
import { useRunData } from "@/lib/hooks/use-run-data";

const PAGE_SIZE = 50;

export default function LogsPage() {
  const { selectedRunId, selectedRun } = useRunContext();
  const { data } = useRunData(selectedRunId);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [level, setLevel] = useState("");
  const [severity, setSeverity] = useState("");
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [file, setFile] = useState("");
  const [line, setLine] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = data?.run ?? selectedRun;
  const summary = data?.summary;
  const status = run?.status;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextTemplate = Number(params.get("template") || "");
    if (Number.isFinite(nextTemplate) && nextTemplate > 0) setTemplateId(nextTemplate);
    const nextQuery = params.get("q");
    if (nextQuery) setQ(nextQuery);
    const nextFile = params.get("file");
    if (nextFile) setFile(nextFile);
    const nextLine = Number(params.get("line") || "");
    if (Number.isFinite(nextLine) && nextLine > 0) setLine(nextLine);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (!selectedRunId || status !== "done") {
      setTemplates([]);
      return;
    }
    let cancelled = false;
    apiGet<{ items: TemplateItem[] }>(
      `/api/runs/${selectedRunId}/templates?q=${encodeURIComponent(debouncedQ)}&severity=${encodeURIComponent(severity)}&limit=80`,
    )
      .then((result) => {
        if (!cancelled) setTemplates(result.items);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "加载模板失败");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRunId, status, debouncedQ, severity]);

  useEffect(() => {
    if (!selectedRunId || status !== "done") {
      setLogs([]);
      setTotal(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      q: debouncedQ,
      level,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (templateId) params.set("template_id", String(templateId));
    if (file) params.set("file", file);
    if (line) params.set("line", String(line));
    apiGet<{ total: number; items: LogItem[] }>(`/api/runs/${selectedRunId}/logs?${params}`)
      .then((result) => {
        if (cancelled) return;
        setLogs(result.items);
        setTotal(result.total);
        setError(null);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "加载日志失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRunId, status, debouncedQ, level, templateId, file, line, offset]);

  const activeTemplate = useMemo(
    () => templates.find((item) => item.template_id === templateId) ?? null,
    [templates, templateId],
  );

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!selectedRunId) {
    return (
      <ProductShell active="logs">
        <PageHead
          actions={
            <Link className="px-btn px-btn-brand" href="/runs">
              新建分析 <Arrow />
            </Link>
          }
          en="LOGS"
          index="04"
          title="日志"
          description="模板是索引，原文是正文；引用格式始终是文件:行号。"
        />
        <div className="mx-auto max-w-[1520px] px-6 py-16">
          <Panel className="p-10 text-center text-[12px] text-muted">
            还没有运行记录。先去「运行」页创建一次分析。
          </Panel>
        </div>
      </ProductShell>
    );
  }

  return (
    <ProductShell active="logs">
      <PageHead
        actions={
          <>
            <Link className="px-btn px-btn-brand" href={runArtifact(run?.id || "", "templates.csv")}>
              下载 templates.csv <Download />
            </Link>
            <Link className="px-btn px-btn-ghost" href={runArtifact(run?.id || "", "events.csv")}>
              下载 events.csv
            </Link>
            <Link className="px-btn-quiet" href="/report">
              返回报告 <Arrow />
            </Link>
          </>
        }
        en="LOGS"
        index="04"
        title="日志"
        description="模板把海量日志压成可读模式；点击任意模板，右侧立刻过滤到对应原文。"
      />

      <div className="mx-auto max-w-[1520px] px-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-tag px-tag-ink">全部 {fmt(total)}</span>
            <span className="px-tag">info {fmt(summary?.overview.levels?.info)}</span>
            <span className="px-tag px-tag-warn">warn {fmt(summary?.overview.levels?.warn)}</span>
            <span className="px-tag px-tag-danger">error {fmt(summary?.overview.levels?.error)}</span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-4 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted">
            <span>{fmt(templates.length)} templates</span>
            <span>{fmt(summary?.overview.files)} files</span>
            <span className={summary?.overview.parse_errors ? "text-warn" : "text-ok"}>
              {fmt(summary?.overview.parse_errors)} parse errors
            </span>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mx-auto mt-4 max-w-[1520px] px-6">
          <div className="border-2 border-danger bg-danger-soft px-4 py-3 text-[11px] text-danger">
            {error}
          </div>
        </div>
      ) : null}

      <section className="mx-auto max-w-[1520px] px-6 py-12">
        <SectionHead
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-tag">{fmt(templates.length)} templates</span>
              <span className="px-tag px-tag-brand">{fmt(total)} records</span>
            </div>
          }
          description="左侧是收敛后的模式，右侧是过滤后的原文；选中模板会同步过滤。"
          index="01"
          title="模板索引与原文"
        />

        <div className="mt-6 grid grid-cols-12 gap-6">
          <aside className="col-span-12 lg:col-span-4">
            <Panel>
              <PanelHead
                aside={<span className="font-mono text-[9px] text-muted">{templates.length} total</span>}
                kicker="Index"
                title="模板索引"
              />
              <div className="space-y-3 border-b-2 border-line p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
                  <input
                    aria-label="搜索模板"
                    className="px-field h-10 pl-9 text-[11px]"
                    onChange={(event) => {
                      setQ(event.target.value);
                      setOffset(0);
                    }}
                    placeholder="搜索 pattern / module / 含义"
                    type="search"
                    value={q}
                  />
                </div>
                <select
                  className="px-field h-9 text-[10px]"
                  onChange={(event) => {
                    setSeverity(event.target.value);
                    setOffset(0);
                  }}
                  value={severity}
                >
                  <option value="">全部模板级别</option>
                  <option value="error">error</option>
                  <option value="warn">warning</option>
                  <option value="info">info</option>
                </select>
              </div>
              <div className="max-h-[720px] overflow-auto">
                {templates.map((template) => (
                  <button
                    className={`block w-full border-b border-line px-4 py-3 text-left transition-colors last:border-0 hover:bg-brand-soft/40 ${
                      templateId === template.template_id
                        ? "border-l-4 border-l-brand bg-brand-soft pl-3"
                        : ""
                    }`}
                    key={template.template_id}
                    onClick={() => {
                      setTemplateId(template.template_id);
                      setOffset(0);
                    }}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 bg-line-strong" />
                        <SeverityTag severity={template.severity} />
                      </div>
                      <span className="num font-mono text-[9px] text-muted">{fmt(template.count)}</span>
                    </div>
                    <div className="mt-2 line-clamp-2 font-mono text-[9.5px] leading-4">
                      {template.pattern}
                    </div>
                    <div className="mt-1 font-mono text-[8px] text-muted">
                      {Object.keys(template.modules || {})[0] || template.category || "—"}
                    </div>
                  </button>
                ))}
                {!templates.length && !loading ? (
                  <div className="px-4 py-8 text-center text-[10px] text-muted">没有匹配模板</div>
                ) : null}
              </div>
            </Panel>
          </aside>

          <div className="col-span-12 lg:col-span-8">
            <Panel>
              <PanelHead
                aside={
                  <span className="font-mono text-[9px] text-muted">
                    {loading ? "loading…" : `${fmt(total)} records`}
                  </span>
                }
                kicker="Raw logs"
                title={activeTemplate ? `模板 #${activeTemplate.template_id}` : "全部原文"}
              />
              <div className="flex flex-wrap items-center gap-3 border-b-2 border-line p-3">
                <select
                  className="px-field h-9 text-[10px]"
                  onChange={(event) => {
                    setLevel(event.target.value);
                    setOffset(0);
                  }}
                  value={level}
                >
                  {["", "error", "critical", "warn", "info", "debug"].map((item) => (
                    <option key={item || "all"} value={item}>
                      {item || "全部级别"}
                    </option>
                  ))}
                </select>
                {templateId ? (
                  <button
                    className="px-tag px-tag-brand"
                    onClick={() => {
                      setTemplateId(null);
                      setOffset(0);
                    }}
                    type="button"
                  >
                    模板 #{templateId} ×
                  </button>
                ) : null}
                {file ? (
                  <button
                    className="px-tag px-tag-brand"
                    onClick={() => {
                      setFile("");
                      setLine(null);
                      setOffset(0);
                    }}
                    type="button"
                  >
                    {file}{line ? `:${line}` : ""} ×
                  </button>
                ) : null}
                <span className="ml-auto font-mono text-[8.5px] text-muted">
                  第 {Math.floor(offset / PAGE_SIZE) + 1} / {pages} 页
                </span>
              </div>
              <div className="overflow-auto">
                <table className="w-full min-w-[860px] text-left">
                  <thead>
                    <tr className="border-b-2 border-line bg-paper-2">
                      {["时间", "级别", "模块", "消息", "位置"].map((head) => (
                        <th
                          className="px-3 py-2 font-mono text-[8px] font-semibold uppercase tracking-[0.1em] text-muted"
                          key={head}
                        >
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((item) => (
                      <tr className="border-b border-line last:border-0" key={`${item.file}-${item.line}`}>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-[8.5px] text-muted">
                          {shortTime(item.ts)}
                        </td>
                        <td className="px-3 py-3">
                          <SeverityTag severity={item.level} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-[9px]">{item.module}</td>
                        <td className="px-3 py-3 font-mono text-[9.5px] leading-5">{item.message}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-[8.5px] text-brand">
                          {item.citation}
                        </td>
                      </tr>
                    ))}
                    {!logs.length && !loading ? (
                      <tr>
                        <td className="px-4 py-12 text-center text-[11px] text-muted" colSpan={5}>
                          没有匹配日志
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-end gap-2 border-t-2 border-line px-4 py-3">
                <button
                  className="px-btn px-btn-ghost px-btn-sm"
                  disabled={offset <= 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  type="button"
                >
                  上一页
                </button>
                <span className="font-mono text-[8.5px] text-muted">
                  {Math.floor(offset / PAGE_SIZE) + 1} / {pages}
                </span>
                <button
                  className="px-btn px-btn-ghost px-btn-sm"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  type="button"
                >
                  下一页
                </button>
              </div>
            </Panel>

            {activeTemplate ? (
              <Panel className="mt-6" variant="soft">
                <PanelHead kicker="Template sample" title="模板与样例" />
                <div className="px-5 py-5">
                  <pre className="whitespace-pre-wrap break-words border-2 border-ink bg-ink px-4 py-4 font-mono text-[9px] leading-5 text-white/70">
                    {activeTemplate.pattern}
                  </pre>
                  <div className="mt-3 flex flex-wrap gap-3 font-mono text-[8.5px] text-muted">
                    <span>{fmt(activeTemplate.count)} 次</span>
                    <span>{activeTemplate.first_ts} → {activeTemplate.last_ts}</span>
                    <span>{activeTemplate.meaning || "未分类"}</span>
                  </div>
                </div>
              </Panel>
            ) : null}
          </div>
        </div>
      </section>
    </ProductShell>
  );
}
