"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHead, SectionHead } from "@/components/layout/page-head";
import { ProductShell } from "@/components/layout/product-shell";
import { useRunContext } from "@/components/providers/run-context";
import {
  Arrow,
  ArrowUpRight,
  Doc,
  Download,
  Panel,
  PanelHead,
  SeverityTag,
} from "@/components/ui";
import {
  apiGet,
  runArtifact,
  type Evidence,
  type EvidenceFact,
  type Findings,
} from "@/lib/api";
import { fmt, pct, shortTime } from "@/lib/format";
import { useRunData } from "@/lib/hooks/use-run-data";

export default function ReportPage() {
  const { selectedRunId, selectedRun } = useRunContext();
  const { data, loading } = useRunData(selectedRunId);
  const [findings, setFindings] = useState<Findings | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = data?.run ?? selectedRun;
  const summary = data?.summary;

  const status = data?.run.status;

  useEffect(() => {
    if (!selectedRunId || status !== "done") {
      setFindings(null);
      setEvidence(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      apiGet<Findings>(runArtifact(selectedRunId, "findings.json")),
      apiGet<Evidence>(`/api/runs/${selectedRunId}/evidence`),
    ])
      .then(([nextFindings, nextEvidence]) => {
        if (cancelled) return;
        setFindings(nextFindings);
        setEvidence(nextEvidence);
        setError(null);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "加载报告失败");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRunId, status]);

  if (!selectedRunId) {
    return (
      <ProductShell active="report">
        <PageHead
          actions={
            <Link className="px-btn px-btn-brand" href="/runs">
              新建分析 <Arrow />
            </Link>
          }
          en="REPORT"
          index="03"
          title="报告"
          description="结论与引用同屏；每条结论必须带有效 evidence_id。"
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
    <ProductShell active="report">
      <PageHead
        actions={
          <>
            <Link className="px-btn px-btn-brand" href={`/api/runs/${run?.id}/report.md`}>
              下载 Markdown <Download />
            </Link>
            <Link className="px-btn px-btn-ghost" href={`/api/runs/${run?.id}/report.html`}>
              打开 HTML <ArrowUpRight />
            </Link>
            <Link className="px-btn-quiet" href="/logs">
              跳到原始日志 <Arrow />
            </Link>
          </>
        }
        en="REPORT"
        index="03"
        title="报告"
        description="结论与引用同屏。每条 finding 必须带有效 evidence_id；AI 不可用时，同一套证据自动回退为确定性报告。"
      />

      <div className="mx-auto max-w-[1520px] px-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line py-3">
          <div className="flex items-center gap-2">
            <span className={run?.llm_used ? "px-tag px-tag-ok" : "px-tag px-tag-warn"}>
              {run?.llm_used ? "AI 叙事 · 已校验" : "确定性回退"}
            </span>
            <span className="px-tag">引用可回查</span>
          </div>
          <span className="font-mono text-[9px] text-muted">
            {run?.llm_model || "no-llm"} · {shortTime(run?.finished_at)}
          </span>
          <span className="ml-auto flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.1em] text-ok">
            <span className="h-2 w-2 bg-ok" /> {findings?.findings.length || 0} findings
          </span>
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
              <span className="px-tag px-tag-ok">已校验</span>
              <span className="px-tag">可回退</span>
            </div>
          }
          description="摘要只使用证据包中的事实；证据清单与报告并排，审计时不需要切换页面。"
          index="01"
          title="摘要与证据"
        />

        <div className="mt-6 grid grid-cols-12 gap-6">
          <Panel className="col-span-12 lg:col-span-8">
            <PanelHead
              aside={<span className="px-tag px-tag-brand">{findings?.findings.length || 0} findings</span>}
              kicker="Executive summary"
              title="先给结论，再给证据"
            />
            <div className="px-6 py-6">
              <h2 className="max-w-[32ch] text-[26px] font-semibold leading-[1.15] tracking-[-0.03em]">
                {summary
                  ? `${summary.overview.errors.toLocaleString()} 条错误，解析率 ${pct(summary.overview.parse_rate)}。`
                  : "正在加载报告…"}
              </h2>
              <ul className="mt-6 border-t-2 border-line">
                {(findings?.executive_summary || []).map((item, index) => (
                  <li
                    className="flex items-baseline gap-4 border-b border-line py-3 text-[11.5px] leading-5 text-ink-2 last:border-0"
                    key={`${index}-${item}`}
                  >
                    <span className="font-mono text-[8.5px] text-brand">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {item}
                  </li>
                ))}
                {!findings && loading ? (
                  <li className="py-4 text-[11px] text-muted">加载中…</li>
                ) : null}
              </ul>
            </div>
            {findings?.data_gaps?.length ? (
              <div className="border-t-2 border-line bg-paper-2 px-6 py-4">
                <div className="label">数据缺口</div>
                <ul className="mt-2 space-y-1 text-[10px] leading-5 text-muted">
                  {findings.data_gaps.map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>

          <Panel className="col-span-12 lg:col-span-4" variant="dark">
            <PanelHead
              dark
              aside={<span className="px-tag px-tag-brand">{evidence?.facts.length || 0} facts</span>}
              kicker="Evidence pack"
              title="evidence.json"
            />
            <div className="grid grid-cols-2 border-b border-white/15">
              {[
                ["facts", fmt(evidence?.facts.length)],
                ["citations", fmt(Object.keys(evidence?.citations || {}).length)],
                ["findings", fmt(findings?.findings.length)],
                ["raw logs", "0"],
              ].map(([key, value], index) => (
                <div
                  className={`px-5 py-4 ${index % 2 === 0 ? "border-r border-white/15" : ""} ${
                    index < 2 ? "border-b border-white/15" : ""
                  }`}
                  key={key}
                >
                  <div className="label-light">{key}</div>
                  <div className="num mt-2 font-mono text-[20px] font-semibold leading-none text-white">
                    {value}
                  </div>
                </div>
              ))}
            </div>
            <div className="max-h-[340px] overflow-auto px-5 py-2">
              {(evidence?.facts || []).map((fact) => (
                <div
                  className="flex items-baseline gap-3 border-b border-white/10 py-2 last:border-0"
                  key={fact.id}
                >
                  <span className="w-6 font-mono text-[8.5px] text-brand">{fact.id}</span>
                  <span className="w-[74px] font-mono text-[7.5px] uppercase tracking-[0.06em] text-white/60">
                    {fact.kind}
                  </span>
                  <span className="flex-1 text-[9.5px] leading-4 text-white/70">
                    {factSummary(fact)}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-white/15 px-5 py-3">
              <Link
                className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-brand hover:underline"
                href={run ? `/api/runs/${run.id}/artifacts/evidence.json` : "#"}
              >
                查看完整 evidence.json →
              </Link>
            </div>
          </Panel>
        </div>
      </section>

      <section className="border-t-2 border-ink bg-surface">
        <div className="mx-auto max-w-[1520px] px-6 py-12">
          <SectionHead
            aside={<span className="px-tag px-tag-brand">{findings?.findings.length || 0} 条</span>}
            description="每条结论都显示严重度、置信度、证据 ID、影响与建议；没有引用的结论不会出现。"
            index="02"
            title="归因与建议"
          />
          <div className="mt-6 space-y-6">
            {(findings?.findings || []).map((finding, index) => (
              <Panel key={`${finding.title}-${index}`}>
                <div className="flex flex-wrap items-center gap-3 border-b-2 border-line px-6 py-4">
                  <span className="font-mono text-[9px] text-muted">
                    F{String(index + 1).padStart(2, "0")}
                  </span>
                  <SeverityTag severity={finding.severity} />
                  <span className="px-tag">置信度 {Math.round(finding.confidence * 100)}%</span>
                  <span className="text-[14px] font-semibold">{finding.title}</span>
                  <span className="ml-auto flex flex-wrap gap-1">
                    {finding.evidence_ids.map((id) => (
                      <span className="px-tag px-tag-brand" key={id}>
                        {id}
                      </span>
                    ))}
                  </span>
                </div>
                <div className="px-6 py-5">
                  <p className="max-w-[100ch] text-[11.5px] leading-6 text-ink-2">{finding.summary}</p>
                  {finding.impact ? (
                    <p className="mt-3 text-[11px] leading-5 text-muted">
                      <strong className="text-ink">影响：</strong>
                      {finding.impact}
                    </p>
                  ) : null}
                  {finding.recommendations?.length ? (
                    <div className="mt-4">
                      <div className="label">建议</div>
                      <ul className="mt-2 space-y-1 text-[11px] leading-5 text-muted">
                        {finding.recommendations.map((item) => (
                          <li key={item}>· {item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {finding.counter_evidence?.length ? (
                    <div className="mt-4">
                      <div className="label">反证 / 待确认</div>
                      <ul className="mt-2 space-y-1 text-[11px] leading-5 text-muted">
                        {finding.counter_evidence.map((item) => (
                          <li key={item}>· {item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {finding.needs_human_review ? (
                    <div className="mt-4 font-mono text-[8.5px] uppercase tracking-[0.1em] text-warn">
                      建议人工复核
                    </div>
                  ) : null}
                </div>
              </Panel>
            ))}
            {findings && !findings.findings.length ? (
              <Panel className="p-10 text-center text-[11px] text-muted">
                本次运行没有可展示的结论。
              </Panel>
            ) : null}
          </div>
        </div>
      </section>

      <section className="border-t-2 border-ink">
        <div className="mx-auto max-w-[1520px] px-6 py-12">
          <SectionHead
            aside={<Doc className="h-4 w-4 text-muted" />}
            description="报告产物与证据包都是运行的一部分，可下载归档。"
            index="03"
            title="产物"
          />
          <Panel className="mt-6">
            <div className="flex flex-wrap gap-2 px-5 py-5">
              {run ? (
                <>
                  <Link className="px-btn px-btn-brand px-btn-sm" href={`/api/runs/${run.id}/report.md`}>
                    报告 Markdown <Download />
                  </Link>
                  <Link className="px-btn px-btn-ghost px-btn-sm" href={`/api/runs/${run.id}/report.html`}>
                    报告 HTML
                  </Link>
                  <Link className="px-btn px-btn-ghost px-btn-sm" href={`/api/runs/${run.id}/download.zip`}>
                    打包下载
                  </Link>
                  {["summary.json", "anomalies.json", "findings.json", "templates.csv", "events.csv"].map(
                    (file) => (
                      <Link
                        className="px-btn px-btn-ghost px-btn-sm"
                        href={runArtifact(run.id, file)}
                        key={file}
                      >
                        {file}
                      </Link>
                    ),
                  )}
                </>
              ) : null}
            </div>
          </Panel>
        </div>
      </section>
    </ProductShell>
  );
}

function factSummary(fact: EvidenceFact): string {
  const entries = Object.entries(fact)
    .filter(([key]) => !["id", "kind"].includes(key))
    .slice(0, 3)
    .map(([key, value]) => `${key}=${typeof value === "object" ? "…" : String(value)}`);
  return entries.join(" · ") || fact.kind;
}
