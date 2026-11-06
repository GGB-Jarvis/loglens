"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHead, SectionHead } from "@/components/layout/page-head";
import { ProductShell } from "@/components/layout/product-shell";
import { useRunContext } from "@/components/providers/run-context";
import {
  Arrow,
  Download,
  Panel,
  PanelHead,
  PixelMeter,
  SeverityTag,
  Stat,
} from "@/components/ui";
import { apiSend, type HourlyItem } from "@/lib/api";
import { duration, fmt, pct, shortDate, shortTime } from "@/lib/format";
import { useRunData } from "@/lib/hooks/use-run-data";

export default function DiagnosePage() {
  const router = useRouter();
  const { selectedRunId, selectedRun, refreshRuns } = useRunContext();
  const { data, anomalies, loading, error } = useRunData(selectedRunId);
  const run = data?.run ?? selectedRun;
  const summary = data?.summary;
  const overview = summary?.overview;

  async function removeRun() {
    if (!run) return;
    if (!window.confirm(`删除运行「${run.name}」及其全部产物？`)) return;
    try {
      await apiSend(`/api/runs/${run.id}`, "DELETE");
      await refreshRuns();
      router.push("/runs");
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : "删除失败");
    }
  }

  if (!selectedRunId) {
    return (
      <ProductShell active="diagnose">
        <PageHead
          actions={
            <Link className="px-btn px-btn-brand" href="/runs">
              新建分析 <Arrow />
            </Link>
          }
          en="DIAGNOSE"
          index="02"
          title="诊断"
          description="先用数字确认规模，再用异常定位偏离。"
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
    <ProductShell active="diagnose">
      <PageHead
        actions={
          <>
            <Link className="px-btn px-btn-brand" href="/report">
              查看报告 <Arrow />
            </Link>
            <Link className="px-btn px-btn-ghost" href={`/api/runs/${run?.id}/download.zip`}>
              下载产物 <Download />
            </Link>
            <button className="px-btn-quiet text-danger" onClick={removeRun} type="button">
              删除运行
            </button>
          </>
        }
        en="DIAGNOSE"
        index="02"
        title="诊断"
        description="规模、趋势和异常窗口来自同一次 DuckDB 查询；所有数字都可以回查原始日志行。"
      />

      <div className="mx-auto max-w-[1520px] px-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line py-3">
          <span className={run?.status === "done" ? "px-tag px-tag-ok" : "px-tag px-tag-brand"}>
            {run?.status === "done" ? "完成" : run?.status === "error" ? "失败" : "运行中"}
          </span>
          <span className="font-mono text-[9px] text-muted">
            {run?.name} · {run?.pack}
          </span>
          <span className="font-mono text-[9px] text-muted">
            {shortTime(overview?.start)} → {shortTime(overview?.end)}
          </span>
          <span className="ml-auto font-mono text-[9px] text-muted">
            {fmt(overview?.files)} 文件 · {fmt(overview?.records)} 行 · {duration(run?.message)}
          </span>
        </div>

        {error ? (
          <div className="mt-4 border-2 border-danger bg-danger-soft px-4 py-3 text-[11px] text-danger">
            {error}
          </div>
        ) : null}

        <Panel className="mt-6" variant="flat">
          <div className="grid grid-cols-2 md:grid-cols-5">
            {[
              ["记录", fmt(overview?.records), `${fmt(overview?.files)} 文件 / ${fmt(overview?.parse_errors)} 解析错误`, "ink"],
              ["错误", fmt(overview?.errors), `警告 ${fmt(overview?.warnings)}`, "danger"],
              ["错误率", pct(overview?.error_rate), "本次运行窗口", "danger"],
              ["解析率", pct(overview?.parse_rate), "确定性解析", "ok"],
              ["异常", fmt(anomalies.length), "按严重度排序", "brand"],
            ].map(([label, value, hint, tone], index) => (
              <Stat
                className={`border-line ${index < 4 ? "md:border-r-2" : ""} ${
                  index % 2 === 0 ? "border-r-2" : ""
                } ${index < 4 ? "border-b-2 md:border-b-0" : ""}`}
                hint={hint}
                key={label}
                label={label}
                tone={tone as "ink" | "brand" | "danger" | "ok"}
                value={value}
              />
            ))}
          </div>
        </Panel>
      </div>

      {loading && !summary ? (
        <div className="mx-auto max-w-[1520px] px-6 py-12 text-[11px] text-muted">加载诊断数据…</div>
      ) : null}

      {summary ? (
        <>
          <section className="mx-auto max-w-[1520px] px-6 py-12">
            <SectionHead
              aside={<span className="px-tag px-tag-brand">DuckDB · 单次查询</span>}
              description="柱体按小时聚合错误量；右侧是按日汇总。异常窗口在下方向你说明偏离发生在何时。"
              index="01"
              title="趋势与基线"
            />

            <div className="mt-6 grid grid-cols-12 gap-6">
              <Panel className="col-span-12 lg:col-span-8">
                <PanelHead
                  aside={
                    <div className="flex items-center gap-4 font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 bg-ink" /> 总量
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 bg-brand" /> 错误
                      </span>
                    </div>
                  }
                  kicker="Hourly"
                  title="小时级日志量"
                />
                <div className="px-4 pb-2 pt-6 sm:px-6">
                  <HourlyChart data={summary.hourly || []} />
                </div>
              </Panel>

              <div className="col-span-12 flex flex-col gap-6 lg:col-span-4">
                <Panel>
                  <PanelHead kicker="Daily" title="按日" />
                  <div className="max-h-[360px] overflow-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b-2 border-line bg-paper-2">
                          {["日期", "总量", "错误", "警告"].map((head) => (
                            <th
                              className="px-4 py-2 font-mono text-[8.5px] font-semibold uppercase tracking-[0.1em] text-muted"
                              key={head}
                            >
                              {head}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(summary.daily || []).slice(-14).map((item) => (
                          <tr className="border-b border-line last:border-0" key={item.date}>
                            <td className="px-4 py-2 font-mono text-[9px]">{shortDate(item.date)}</td>
                            <td className="num px-4 py-2 font-mono text-[9px]">{fmt(item.total)}</td>
                            <td className="num px-4 py-2 font-mono text-[9px] text-danger">{fmt(item.errors)}</td>
                            <td className="num px-4 py-2 font-mono text-[9px] text-warn">{fmt(item.warns)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </div>
            </div>
          </section>

          <section className="border-t-2 border-ink bg-surface">
            <div className="mx-auto max-w-[1520px] px-6 py-12">
              <SectionHead
                aside={<span className="px-tag px-tag-danger">{anomalies.length} 条</span>}
                description="异常按严重度和分数降序；每条都带 file:line 引用，点击后可回到原始日志。"
                index="02"
                title="异常与风险"
              />
              <Panel className="mt-6">
                <div className="divide-y divide-line">
                  {anomalies.map((item, index) => (
                    <div className="px-6 py-5" key={item.id || `${item.kind}-${index}`}>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-mono text-[9px] text-muted">{item.id || `A${index + 1}`}</span>
                        <SeverityTag severity={item.severity} />
                        <span className="text-[13px] font-semibold">{item.title}</span>
                        <span className="ml-auto font-mono text-[9px] text-muted">
                          score {item.score ?? "—"}
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-muted">{item.detail}</p>
                      <div className="mt-2 flex flex-wrap gap-3 font-mono text-[8.5px] text-muted">
                        {item.window ? (
                          <span>
                            {shortTime(item.window.from)} → {shortTime(item.window.to)}
                          </span>
                        ) : null}
                        {(item.citations || []).map((citation) => {
                          const split = citation.lastIndexOf(":");
                          const citationFile = split > 0 ? citation.slice(0, split) : citation;
                          const citationLine = split > 0 ? citation.slice(split + 1) : "";
                          return (
                            <Link
                              className="text-brand hover:underline"
                              href={`/logs?file=${encodeURIComponent(citationFile)}${
                                citationLine ? `&line=${encodeURIComponent(citationLine)}` : ""
                              }`}
                              key={citation}
                            >
                              {citation}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {!anomalies.length ? (
                    <div className="px-6 py-10 text-center text-[11px] text-muted">未检测到显著异常。</div>
                  ) : null}
                </div>
              </Panel>
            </div>
          </section>

          <section className="border-t-2 border-ink">
            <div className="mx-auto max-w-[1520px] px-6 py-12">
              <SectionHead
                aside={<span className="px-tag px-tag-brand">{summary.kpis.length} 个 KPI</span>}
                description="计数和比率由领域包定义；数字只由代码计算，模型不参与。"
                index="03"
                title="KPI 与故障分类"
              />
              <div className="mt-6 grid grid-cols-12 gap-6">
                <Panel className="col-span-12 lg:col-span-7">
                  <PanelHead kicker="KPI" title="领域指标" />
                  <div className="divide-y divide-line">
                    {summary.kpis.map((kpi) => {
                      const values = kpi.series.filter((item) => item.value !== null);
                      const total = kpi.total ?? values.reduce((sum, item) => sum + Number(item.value || 0), 0);
                      const latest = values[values.length - 1];
                      return (
                        <div className="flex items-center justify-between gap-4 px-6 py-4" key={kpi.id}>
                          <div>
                            <div className="text-[12px] font-semibold">{kpi.name}</div>
                            <div className="mt-1 font-mono text-[8.5px] text-muted">
                              {kpi.type === "ratio" ? "ratio" : "count"} · {kpi.direction || "up"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="num font-mono text-[15px] font-semibold">
                              {kpi.type === "ratio"
                                ? pct(latest?.value ?? null)
                                : fmt(total)}
                            </div>
                            <div className="mt-1 font-mono text-[8.5px] text-muted">
                              {latest?.date ? shortDate(latest.date) : "—"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>

                <div className="col-span-12 flex flex-col gap-6 lg:col-span-5">
                  <Panel>
                    <PanelHead kicker="Faults" title="Top 故障" />
                    <div className="divide-y divide-line">
                      {(summary.top_faults || []).slice(0, 6).map((fault) => (
                        <div className="flex items-center gap-3 px-5 py-3" key={fault.fault_id}>
                          <SeverityTag severity={fault.severity} />
                          <span className="min-w-0 flex-1 truncate text-[11px]">{fault.name}</span>
                          <span className="num font-mono text-[10px]">{fmt(fault.count)}</span>
                        </div>
                      ))}
                    </div>
                  </Panel>
                  <Panel variant="soft">
                    <PanelHead kicker="Modules" title="错误模块" />
                    <div className="space-y-3 px-5 py-5">
                      {(summary.top_error_modules || []).slice(0, 5).map((module) => {
                        const max = Math.max(
                          1,
                          ...(summary.top_error_modules || []).map((item) => item.count),
                        );
                        return (
                          <div key={module.module}>
                            <div className="flex justify-between font-mono text-[9px]">
                              <span>{module.module}</span>
                              <span>{fmt(module.count)}</span>
                            </div>
                            <PixelMeter className="mt-2" value={(module.count / max) * 100} />
                          </div>
                        );
                      })}
                    </div>
                  </Panel>
                </div>
              </div>

              <Panel className="mt-6">
                <PanelHead kicker="Templates" title="高频模板" />
                <div className="divide-y divide-line">
                  {(summary.top_templates || []).slice(0, 6).map((template) => (
                    <div className="flex flex-wrap items-center gap-3 px-6 py-3" key={template.template_id}>
                      <span className="font-mono text-[9px] text-muted">{fmt(template.count)}</span>
                      <SeverityTag severity={template.severity} />
                      <span className="min-w-0 flex-1 truncate font-mono text-[9.5px]">
                        {template.pattern}
                      </span>
                      <Link
                        className="font-mono text-[8.5px] text-brand hover:underline"
                        href={`/logs?template=${template.template_id}`}
                      >
                        下钻 →
                      </Link>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </section>
        </>
      ) : null}
    </ProductShell>
  );
}

function HourlyChart({ data }: { data: HourlyItem[] }) {
  const width = 820;
  const height = 230;
  const pad = { left: 42, right: 12, top: 18, bottom: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((item) => item.total));
  const barW = data.length ? innerW / data.length : 0;
  const step = Math.max(1, Math.ceil(data.length / 10));

  return (
    <svg
      aria-label="小时级日志量与错误数"
      className="h-auto w-full"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      {[0, 0.5, 1].map((ratio) => {
        const y = pad.top + innerH - ratio * innerH;
        return (
          <g key={ratio}>
            <line
              stroke="#cbd6e6"
              strokeDasharray="3 4"
              x1={pad.left}
              x2={width - pad.right}
              y1={y}
              y2={y}
            />
            <text
              fill="#57647c"
              fontFamily="monospace"
              fontSize="8.5"
              textAnchor="end"
              x={pad.left - 6}
              y={y + 3}
            >
              {fmt(Math.round(max * ratio))}
            </text>
          </g>
        );
      })}
      {data.map((item, index) => {
        const totalH = Math.max(1, (item.total / max) * innerH);
        const errorH = Math.min(totalH, ((item.errors || 0) / max) * innerH);
        const x = pad.left + index * barW;
        return (
          <g key={item.bucket}>
            <rect
              fill="#0a1022"
              height={totalH}
              opacity="0.2"
              width={Math.max(1, barW - 1)}
              x={x}
              y={pad.top + innerH - totalH}
            />
            <rect
              fill="#2563eb"
              height={Math.max(1, errorH)}
              width={Math.max(1, barW - 1)}
              x={x}
              y={pad.top + innerH - errorH}
            />
            {index % step === 0 ? (
              <text
                fill="#57647c"
                fontFamily="monospace"
                fontSize="8"
                textAnchor="middle"
                x={x + barW / 2}
                y={height - 8}
              >
                {item.bucket.slice(5, 13)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
