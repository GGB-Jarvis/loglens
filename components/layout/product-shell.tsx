"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useRunContext } from "@/components/providers/run-context";
import { Arrow, Chevron, LogMark } from "@/components/ui";
import { fmt, shortDate } from "@/lib/format";

const NAV = [
  { id: "runs", no: "01", zh: "运行", en: "RUNS", href: "/runs" },
  { id: "diagnose", no: "02", zh: "诊断", en: "DIAGNOSE", href: "/diagnose" },
  { id: "report", no: "03", zh: "报告", en: "REPORT", href: "/report" },
  { id: "logs", no: "04", zh: "日志", en: "LOGS", href: "/logs" },
  { id: "configure", no: "05", zh: "配置", en: "CONFIGURE", href: "/configure" },
] as const;

export function ProductShell({
  active,
  children,
}: {
  active: "runs" | "diagnose" | "report" | "logs" | "configure";
  children: ReactNode;
}) {
  const { runs, selectedRun, selectedRunId, selectRun, config } = useRunContext();

  return (
    <div className="min-h-screen bg-paper">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-4 focus:z-50 focus:border-2 focus:border-ink focus:bg-surface focus:px-4 focus:py-2 focus:font-mono focus:text-[11px]"
        href="#main"
      >
        跳到主要内容
      </a>

      <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper">
        <div className="mx-auto flex h-16 max-w-[1520px] items-center gap-4 px-6">
          <Link
            className="group flex shrink-0 items-center gap-3"
            href="/"
            aria-label="LogLens 首页"
          >
            <span className="flex h-9 w-9 items-center justify-center border-2 border-ink bg-brand text-white shadow-[3px_3px_0_0_var(--color-ink)] transition-transform duration-100 group-hover:-translate-y-[2px]">
              <LogMark className="h-5 w-5" />
            </span>
            <span className="flex flex-col gap-1">
              <span className="font-mono text-[13px] font-bold leading-none tracking-[0.16em]">
                LOGLENS
              </span>
              <span className="hidden font-mono text-[8px] uppercase leading-none tracking-[0.18em] text-muted sm:block">
                日志证据工作台
              </span>
            </span>
          </Link>

          <span aria-hidden="true" className="hidden h-8 w-[2px] bg-line md:block" />

          <nav aria-label="主导航" className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => {
              const current = active === item.id;
              return (
                <Link
                  aria-current={current ? "page" : undefined}
                  className={`group flex h-10 items-center gap-2 border-2 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors duration-100 ${
                    current
                      ? "border-ink bg-ink text-white shadow-[3px_3px_0_0_var(--color-brand)]"
                      : "border-transparent text-muted hover:border-line-strong hover:bg-surface hover:text-ink"
                  }`}
                  href={item.href}
                  key={item.id}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center border text-[8px] ${
                      current
                        ? "border-white/40 text-white/80"
                        : "border-line text-muted-2 group-hover:border-line-strong"
                    }`}
                  >
                    {item.no}
                  </span>
                  {item.zh}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <details className="group relative hidden min-w-0 text-[10px] sm:block">
              <summary
                className="flex min-h-10 w-[136px] cursor-pointer list-none items-center gap-[0.8em] overflow-hidden border-2 border-line-strong bg-surface px-3 font-mono text-[1em] text-ink transition-colors duration-100 hover:border-ink xl:w-[248px]"
                title={
                  selectedRun
                    ? `${selectedRun.pack} / ${selectedRun.name}`
                    : "暂无运行"
                }
              >
                <span
                  className={`h-[0.8em] w-[0.8em] shrink-0 ${
                    selectedRun ? "bg-ok" : "bg-danger"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate">
                  <span className="hidden xl:inline">
                    {selectedRun
                      ? `${selectedRun.pack} / ${selectedRun.name}`
                      : "暂无运行"}
                  </span>
                  <span className="xl:hidden">
                    {selectedRun ? selectedRun.pack : "暂无运行"}
                  </span>
                </span>
                <Chevron className="h-[1.2em] w-[1.2em] shrink-0 text-muted" />
              </summary>

              <div className="absolute right-0 top-[calc(100%+12px)] flex max-h-[70vh] w-[360px] max-w-[calc(100vw-32px)] flex-col overflow-hidden border-2 border-ink bg-surface text-[12px] shadow-[6px_6px_0_0_var(--color-line)]">
                <div className="flex shrink-0 items-center justify-between border-b-2 border-ink px-4 py-3">
                  <span className="label text-[0.83em]">切换运行</span>
                  <span className="font-mono text-[0.75em] text-muted">
                    {runs.length} runs
                  </span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
                  {runs.slice(0, 8).map((run) => {
                    const current = run.id === selectedRunId;
                    return (
                      <Link
                        className={`flex items-start justify-between gap-3 border-b border-line px-4 py-3 transition-colors last:border-0 hover:bg-brand-soft ${
                          current ? "bg-brand-soft" : ""
                        }`}
                        href="/diagnose"
                        key={run.id}
                        onClick={() => selectRun(run.id)}
                      >
                        <span className="min-w-0 flex-1">
                          <span
                            className="block truncate text-[1em] font-medium"
                            title={run.name}
                          >
                            {run.name}
                          </span>
                          <span className="mt-1 block truncate font-mono text-[0.75em] text-muted">
                            {fmt(run.stats?.records)} 行 ·{" "}
                            {fmt(run.stats?.anomalies)} 异常 ·{" "}
                            {shortDate(run.created_at)}
                          </span>
                        </span>
                        {current ? (
                          <span className="h-[2em] shrink-0 px-tag px-tag-brand text-[0.75em]">
                            当前
                          </span>
                        ) : (
                          <Arrow className="mt-1 h-[1.15em] w-[1.15em] shrink-0 text-muted-2" />
                        )}
                      </Link>
                    );
                  })}
                  {!runs.length ? (
                    <div className="px-4 py-6 text-center text-[0.92em] text-muted">
                      还没有分析记录
                    </div>
                  ) : null}
                </div>

                <Link
                  className="flex shrink-0 items-center justify-between border-t-2 border-line px-4 py-3 font-mono text-[0.75em] font-semibold uppercase tracking-[0.1em] text-brand transition-colors hover:bg-brand-soft"
                  href="/runs"
                >
                  管理全部运行 <Arrow className="h-[1.15em] w-[1.15em]" />
                </Link>
              </div>
            </details>

            <Link
              className={`hidden h-10 items-center gap-2 border-2 px-3 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] transition-colors md:flex ${
                config?.llm_configured
                  ? "border-ok bg-ok-soft text-ok hover:bg-ok hover:text-white"
                  : "border-warn bg-warn-soft text-warn hover:bg-warn hover:text-white"
              }`}
              href="/configure#model"
            >
              <span className={`h-2 w-2 ${config?.llm_configured ? "bg-ok" : "bg-warn"}`} />
              {config?.llm_configured ? "LLM 就绪" : "LLM 未配置"}
            </Link>
          </div>
        </div>

        <nav
          aria-label="移动端主导航"
          className="grid grid-cols-5 border-t-2 border-ink lg:hidden"
        >
          {NAV.map((item) => {
            const current = active === item.id;
            return (
              <Link
                aria-current={current ? "page" : undefined}
                className={`flex h-12 items-center justify-center gap-1 border-r-2 border-line last:border-r-0 ${
                  current
                    ? "bg-ink text-white"
                    : "bg-surface text-muted hover:bg-brand-soft hover:text-ink"
                }`}
                href={item.href}
                key={item.id}
              >
                <span className="font-mono text-[8px] opacity-60">{item.no}</span>
                <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.06em]">
                  {item.zh}
                </span>
              </Link>
            );
          })}
        </nav>
      </header>

      <main id="main">{children}</main>

      <footer className="border-t-2 border-ink bg-surface">
        <div className="mx-auto flex max-w-[1520px] flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div className="flex items-center gap-3">
            <LogMark className="h-4 w-4 text-brand" />
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
              LogLens v0.2 · 确定性事实 → 证据包 → LLM 叙事
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-2">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 bg-ok" /> local first
            </span>
            <span>no raw logs to model</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
