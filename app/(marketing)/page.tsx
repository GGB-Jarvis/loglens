import Link from "next/link";
import {
  Arrow,
  ArrowUpRight,
  Check,
  FileLog,
  Lock,
  LogMark,
  Panel,
  Terminal,
} from "@/components/ui";

const PAGES = [
  {
    no: "01",
    zh: "运行",
    en: "RUNS",
    href: "/runs",
    question: "日志从哪来，跑到哪一步？",
    outcome: "接入、排队、历史、产物。一次运行从进入队列到归档全部在这里收口。",
    entries: ["上传文件 / zip", "服务器路径", "领域包", "队列", "历史", "产物"],
  },
  {
    no: "02",
    zh: "诊断",
    en: "DIAGNOSE",
    href: "/diagnose",
    question: "哪里偏离了基线？",
    outcome: "5 个 KPI 给规模，6 条异常标偏离，趋势与窗口共用同一次 DuckDB 查询。",
    entries: ["KPI", "小时趋势", "按日", "异常", "Top 故障", "Top 模板"],
  },
  {
    no: "03",
    zh: "报告",
    en: "REPORT",
    href: "/report",
    question: "发生了什么，证据在哪？",
    outcome: "结论与引用同屏。每条 finding 必须带有效 evidence_id，失败自动回退。",
    entries: ["findings", "置信度", "影响 / 建议", "证据包", "引用回查", "导出"],
  },
  {
    no: "04",
    zh: "日志",
    en: "LOGS",
    href: "/logs",
    question: "这条结论对应哪一行？",
    outcome: "模板是索引，原文是正文。一次点击完成从 24 个模式到文件:行号的定位。",
    entries: ["模板聚合", "级别过滤", "原文搜索", "下钻", "分页", "引用定位"],
  },
  {
    no: "05",
    zh: "配置",
    en: "CONFIGURE",
    href: "/configure",
    question: "下次怎么复现？",
    outcome: "解析口径与写作模型放在一起，保存前一起校验，运行前一次确认。",
    entries: ["领域包", "AI 生成包", "YAML 导入 / 导出", "端点", "模型", "连接测试"],
  },
];

const MERGES = [
  {
    kicker: "诊断页 · 数字 + 偏差",
    title: "数字和偏差，是同一次判断。",
    body: "旧版把 KPI 与异常放在两个标签页，诊断时在数字与告警之间来回切。现在同一屏：上面是事实，下面是偏离，引用直接跳到原文。",
    href: "/diagnose",
    link: "看诊断页",
    visual: <DiagnoseVisual />,
  },
  {
    kicker: "报告页 · 结论 + 证据",
    title: "结论和证据，不该分居两页。",
    body: "每条 finding 下方直接给出 evidence_id 与文件:行号。证据包不再占用顶级导航；审计时展开，不需要时让报告保持可读。",
    href: "/report",
    link: "看报告页",
    visual: <ReportVisual />,
  },
  {
    kicker: "日志页 · 模板 + 原文",
    title: "模板是索引，日志是正文。",
    body: "1,936 行收敛为 24 个模板。点击模板，右侧立刻过滤到对应原文；不再复制模板 ID 再切页粘贴。",
    href: "/logs",
    link: "看日志页",
    visual: <LogsVisual />,
  },
  {
    kicker: "配置页 · 领域包 + 模型",
    title: "领域包和模型，都是复现条件。",
    body: "领域包决定怎么解析、算什么 KPI；模型决定怎么写报告。两者都影响下一次运行，放在同一页，保存前一起校验。",
    href: "/configure",
    link: "看配置页",
    visual: <ConfigVisual />,
  },
];

export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-paper">
      <SiteHeader />
      <Hero />
      <PipelineBand />
      <PageMap />
      <MergeStories />
      <EvidenceBand />
      <Closing />
      <SiteFooter />
    </main>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper/95 backdrop-blur-[2px]">
      <div className="mx-auto flex h-16 max-w-[1520px] items-center gap-4 px-6">
        <Link className="group flex items-center gap-3" href="/">
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

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {[
            ["运行", "/runs"],
            ["诊断", "/diagnose"],
            ["报告", "/report"],
            ["日志", "/logs"],
            ["配置", "/configure"],
          ].map(([label, href]) => (
            <Link
              className="flex h-9 items-center border-2 border-transparent px-3 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-muted transition-colors hover:border-line-strong hover:bg-surface hover:text-ink"
              href={href}
              key={href}
            >
              {label}
            </Link>
          ))}
        </nav>

        <Link className="px-btn px-btn-brand px-btn-sm ml-auto md:ml-2" href="/runs">
          打开工作台 <Arrow />
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="border-b-2 border-ink bg-surface">
      <div className="mx-auto grid max-w-[1520px] grid-cols-12 gap-6 px-6 py-12 md:py-18">
        <div className="col-span-12 flex flex-col justify-center lg:col-span-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-tag px-tag-ink">v0.2</span>
            <span className="px-tag px-tag-brand">evidence first</span>
            <span className="px-tag">no raw logs to model</span>
          </div>

          <h1 className="pixel-title mt-6 text-[46px] leading-[0.98] sm:text-[62px] lg:text-[74px]">
            把日志变成
            <br />
            能回查的判断。
          </h1>

          <p className="mt-6 max-w-[48ch] text-[13px] leading-6 text-muted">
            计数、比率、窗口和异常由 DuckDB 计算；模型只收到白名单证据包。
            每条结论都带
            <span className="font-mono text-ink"> 文件:行号 </span>
            ，没有 LLM 也能出报告。
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link className="px-btn px-btn-brand" href="/runs">
              新建分析 <Arrow />
            </Link>
            <Link className="px-btn px-btn-ghost" href="/diagnose">
              查看示例运行 <ArrowUpRight />
            </Link>
          </div>

          <dl className="mt-8 grid grid-cols-3 border-t-2 border-line pt-4">
            {[
              ["10", "证据事实"],
              ["0", "原始日志入模"],
              ["100%", "引用可回查"],
            ].map(([value, label], index) => (
              <div
                className={`px-3 ${index < 2 ? "border-r-2 border-line" : ""} ${
                  index === 0 ? "pl-0" : ""
                }`}
                key={label}
              >
                <dt className="num font-mono text-[20px] font-semibold leading-none">
                  {value}
                </dt>
                <dd className="mt-1 font-mono text-[8px] uppercase tracking-[0.1em] text-muted">
                  {label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="col-span-12 lg:col-span-5">
          <div className="relative">
            <div
              aria-hidden="true"
              className="px-dither-brand absolute -right-3 -top-3 h-16 w-16 opacity-20"
            />
            <Panel variant="dark">
              <div className="flex items-center justify-between border-b border-white/15 px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 bg-ok" />
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-white/60">
                    run / order-api
                  </span>
                </div>
                <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-white/55">
                  1.11s
                </span>
              </div>

              <div className="px-5 py-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="label-light">error rate · 10-02</div>
                    <div className="num mt-2 font-mono text-[42px] font-semibold leading-none tracking-[-0.05em] text-white">
                      33.25%
                    </div>
                  </div>
                  <span className="px-tag px-tag-danger">A1 HIGH</span>
                </div>
                <p className="mt-2 font-mono text-[8.5px] text-white/60">
                  126 / 379 requests failed · robust z 28.18
                </p>

                <div className="mt-6 flex h-24 items-end gap-2 border-b border-white/20 pb-0">
                  {[3, 6, 6, 22, 100, 32, 3, 8, 3].map((value, index) => (
                    <div
                      className={`flex-1 ${
                        value === 100 ? "bg-brand" : "bg-white/30"
                      }`}
                      key={index}
                      style={{ height: `${Math.max(4, value * 0.88)}%` }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-between font-mono text-[7.5px] text-white/45">
                  <span>09</span>
                  <span>13</span>
                  <span>17</span>
                </div>
              </div>

              <div className="border-t border-white/15 px-5 py-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-white/60">
                    evidence pack
                  </span>
                  <span className="font-mono text-[8.5px] text-brand">10 facts</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["E3", "E4", "E5", "E10"].map((id) => (
                    <span
                      className="border border-white/25 px-2 py-1 font-mono text-[8px] text-white/60"
                      key={id}
                    >
                      {id}
                    </span>
                  ))}
                  <span className="border border-brand bg-brand px-2 py-1 font-mono text-[8px] text-white">
                    app-2026-10-02.log:386
                  </span>
                </div>
              </div>
            </Panel>

            <div className="absolute -bottom-4 -left-4 border-2 border-ink bg-surface px-3 py-2 shadow-[4px_4px_0_0_var(--color-line)]">
              <div className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-ok" />
                <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.1em]">
                  6 / 6 citations valid
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PipelineBand() {
  return (
    <div className="border-b-2 border-ink bg-paper-2">
      <div className="mx-auto max-w-[1520px] px-6 py-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ["01", "接入", "流式 · 编码探测"],
            ["02", "解析", "模板掩码 · 事件"],
            ["03", "统计", "DuckDB · KPI"],
            ["04", "检测", "稳健 z · 突增"],
            ["05", "报告", "证据包 · 校验"],
          ].map(([no, title, body], index) => (
            <div
              className={`flex items-center gap-3 border-2 border-line-strong bg-surface px-3 py-2 ${
                index === 4 ? "col-span-2 md:col-span-1" : ""
              }`}
              key={no}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink bg-ink font-mono text-[8px] text-white">
                {no}
              </span>
              <span>
                <span className="block text-[10.5px] font-semibold">{title}</span>
                <span className="mt-1 block font-mono text-[7.5px] uppercase tracking-[0.06em] text-muted">
                  {body}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PageMap() {
  return (
    <section className="mx-auto max-w-[1520px] px-6 py-12 md:py-18">
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4">
          <div className="sticky top-24">
            <span className="label label-brand">Page map / 5 workspaces</span>
            <h2 className="pixel-title mt-4 text-[36px]">
              五个页面，
              <br />
              五个问题。
            </h2>
            <p className="mt-4 max-w-[36ch] text-[12px] leading-6 text-muted">
              不按技术模块切页，按维护人员真正会问的问题切页。
              每个入口只保留一个主任务，跨页只带运行上下文。
            </p>
            <div className="mt-6 flex items-center gap-2">
              <span className="px-tag px-tag-ink">5 pages</span>
              <span className="px-tag">1 run context</span>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-8">
          <div className="border-t-2 border-ink">
            {PAGES.map((page) => (
              <Link
                className="group grid grid-cols-12 gap-x-4 gap-y-3 border-b-2 border-line px-2 py-5 transition-colors hover:bg-surface sm:px-4"
                href={page.href}
                key={page.no}
              >
                <div className="col-span-3 flex items-start gap-3 sm:col-span-2">
                  <span className="flex h-8 w-8 items-center justify-center border-2 border-ink bg-surface font-mono text-[9px] font-semibold transition-colors group-hover:bg-ink group-hover:text-white">
                    {page.no}
                  </span>
                  <span className="label mt-2 hidden sm:inline">{page.en}</span>
                </div>

                <div className="col-span-9 sm:col-span-3">
                  <h3 className="text-[20px] font-semibold leading-none tracking-[-0.02em]">
                    {page.zh}
                  </h3>
                  <p className="mt-2 text-[10.5px] leading-5 text-muted">
                    {page.question}
                  </p>
                </div>

                <div className="col-span-12 sm:col-span-5">
                  <p className="text-[10.5px] leading-5 text-ink-2">{page.outcome}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {page.entries.map((entry) => (
                      <span
                        className="border border-line px-1.5 py-1 font-mono text-[7.5px] uppercase tracking-[0.04em] text-muted"
                        key={entry}
                      >
                        {entry}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="col-span-12 flex items-center justify-end sm:col-span-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center border-2 border-line-strong text-muted transition-colors group-hover:border-ink group-hover:bg-ink group-hover:text-white">
                    <Arrow className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MergeStories() {
  return (
    <section className="border-y-2 border-ink bg-surface">
      <div className="mx-auto max-w-[1520px] px-6 py-12 md:py-18">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="label label-brand">Consolidation</span>
            <h2 className="pixel-title mt-4 text-[34px]">把同类工作，关进同一页。</h2>
          </div>
          <p className="max-w-[52ch] text-[11.5px] leading-5 text-muted">
            四组旧入口被合并：概览并进诊断，证据并进报告，模板并进日志，
            领域包并进配置。导航里没有“更多”，也没有只放一个按钮的页面。
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          {MERGES.map((item) => (
            <Panel key={item.title}>
              <div className="border-b-2 border-ink px-5 py-4">
                <span className="label">{item.kicker}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                <div className="flex flex-col justify-between px-5 py-5">
                  <div>
                    <h3 className="text-[18px] font-semibold leading-tight tracking-[-0.02em]">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-[10.5px] leading-5 text-muted">
                      {item.body}
                    </p>
                  </div>
                  <Link
                    className="mt-4 inline-flex items-center gap-2 font-mono text-[8.5px] font-semibold uppercase tracking-[0.1em] text-brand hover:underline"
                    href={item.href}
                  >
                    {item.link} <Arrow className="h-3 w-3" />
                  </Link>
                </div>
                <div className="border-t-2 border-line bg-paper-2 p-4 sm:border-l-2 sm:border-t-0">
                  {item.visual}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </section>
  );
}

function EvidenceBand() {
  return (
    <section className="mx-auto max-w-[1520px] px-6 py-12">
      <Panel variant="dark">
        <div className="grid grid-cols-2 md:grid-cols-4">
          {[
            ["10", "白名单事实", "模型只看到这些"],
            ["0", "原始日志", "永不进入提示词"],
            ["6", "findings", "全部带 evidence_id"],
            ["100%", "引用可回查", "文件:行号"],
          ].map(([value, label, hint], index) => (
            <div
              className={`px-5 py-6 ${
                index % 2 === 0 ? "border-r border-white/15" : ""
              } ${index < 2 ? "border-b border-white/15 md:border-b-0" : ""} ${
                index === 1 ? "md:border-r md:border-white/15" : ""
              }`}
              key={label}
            >
              <div className="num font-mono text-[28px] font-semibold leading-none text-white">
                {value}
              </div>
              <div className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.1em] text-brand">
                {label}
              </div>
              <div className="mt-1 text-[9.5px] text-white/60">{hint}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/15 px-5 py-4">
          <div className="flex items-center gap-3">
            <Lock className="h-4 w-4 text-brand" />
            <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-white/65">
              logs are data, not instructions
            </span>
          </div>
          <span className="font-mono text-[8.5px] text-white/55">
            validate → fallback → deterministic report
          </span>
        </div>
      </Panel>
    </section>
  );
}

function Closing() {
  return (
    <section className="border-y-2 border-ink bg-paper-2">
      <div className="mx-auto grid max-w-[1520px] grid-cols-12 items-center gap-6 px-6 py-12 md:py-18">
        <div className="col-span-12 lg:col-span-8">
          <span className="label label-brand">Start</span>
          <h2 className="pixel-title mt-4 max-w-[20ch] text-[40px] md:text-[54px]">
            下一次排障，从一次可回查的运行开始。
          </h2>
        </div>
        <div className="col-span-12 flex flex-col gap-3 lg:col-span-4">
          <Link className="px-btn px-btn-brand w-full" href="/runs">
            新建分析 <Arrow />
          </Link>
          <Link className="px-btn px-btn-ghost w-full" href="/report">
            先看一份示例报告 <ArrowUpRight />
          </Link>
          <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted">
            不需要 LLM 也能完成 · 上传即分析
          </p>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-surface">
      <div className="mx-auto flex max-w-[1520px] flex-wrap items-center justify-between gap-4 px-6 py-6">
        <div className="flex items-center gap-3">
          <LogMark className="h-4 w-4 text-brand" />
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
            LogLens v0.2 · 以证据为依据的日志分析
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-2">
          <span className="flex items-center gap-2">
            <Terminal className="h-3 w-3" /> deterministic first
          </span>
          <span className="flex items-center gap-2">
            <FileLog className="h-3 w-3" /> file:line citations
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ---------- small pixel diagrams ---------- */

function DiagnoseVisual() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[7.5px] uppercase tracking-[0.08em] text-muted">
          errors / 10-02
        </span>
        <span className="font-mono text-[7.5px] text-danger">33.25%</span>
      </div>
      <div className="mt-2 flex h-16 items-end gap-1 border-b-2 border-line-strong">
        {[2, 4, 4, 12, 100, 24, 2, 6, 2].map((value, index) => (
          <div
            className={`flex-1 ${value === 100 ? "bg-brand" : "bg-ink"}`}
            key={index}
            style={{ height: `${Math.max(4, value * 0.9)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 space-y-1">
        {[
          ["A1", "high", "33.25% vs 5.07%"],
          ["A3", "high", "96 / hour"],
        ].map(([id, sev, text]) => (
          <div
            className="flex items-center justify-between border border-line bg-surface px-2 py-1"
            key={id}
          >
            <span className="font-mono text-[7.5px] text-muted">{id}</span>
            <span className="font-mono text-[7.5px]">{text}</span>
            <span
              className={`h-1.5 w-1.5 ${
                sev === "high" ? "bg-danger" : "bg-warn"
              }`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportVisual() {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="border-2 border-ink bg-ink px-1.5 py-1 font-mono text-[7.5px] text-white">
          F01
        </span>
        <span className="font-mono text-[7.5px] uppercase tracking-[0.08em] text-danger">
          high
        </span>
        <span className="ml-auto font-mono text-[7.5px] text-muted">0.82</span>
      </div>
      <p className="mt-2 text-[9.5px] font-semibold leading-4">
        库存依赖超时把错误率推到 33.25%
      </p>
      <div className="mt-2 border-l-2 border-brand pl-2">
        <span className="font-mono text-[7.5px] text-muted">建议</span>
        <p className="mt-1 text-[8.5px] leading-4 text-muted">
          先查连接池，再确认 3000ms 超时与重试。
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {["E3", "E4", "E5"].map((id) => (
          <span
            className="border border-brand bg-brand-soft px-1.5 py-1 font-mono text-[7.5px] text-brand-ink"
            key={id}
          >
            {id}
          </span>
        ))}
        <span className="ml-auto font-mono text-[7.5px] text-muted">
          log:386
        </span>
      </div>
    </div>
  );
}

function LogsVisual() {
  return (
    <div>
      <div className="border-2 border-brand bg-surface px-2 py-1">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[7.5px] text-muted">InventoryClient</span>
          <span className="font-mono text-[7.5px] font-semibold">118</span>
        </div>
        <p className="mt-1 font-mono text-[7.5px] leading-4">
          Inventory reservation failed: timeout after &lt;num&gt;ms
        </p>
      </div>
      <div className="mt-2 space-y-1">
        {[
          "12:55:03.030",
          "12:55:03.060",
          "12:55:04.180",
        ].map((time) => (
          <div className="flex gap-2 bg-surface px-2 py-1" key={time}>
            <span className="font-mono text-[7px] text-muted">{time}</span>
            <span className="h-2 w-2 bg-danger" />
            <span className="truncate font-mono text-[7px]">
              timeout order=705032
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 text-right font-mono text-[7px] text-brand">
        app-2026-10-02.log:234
      </div>
    </div>
  );
}

function ConfigVisual() {
  return (
    <div>
      <div className="flex items-center justify-between border border-line bg-surface px-2 py-1">
        <span className="font-mono text-[7.5px]">order-api</span>
        <span className="font-mono text-[7.5px] text-ok">valid</span>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1">
        {[
          ["8", "events"],
          ["5", "kpis"],
          ["6", "faults"],
        ].map(([value, label]) => (
          <div className="bg-surface px-2 py-1 text-center" key={label}>
            <div className="font-mono text-[10px] font-semibold">{value}</div>
            <div className="font-mono text-[6.5px] uppercase text-muted">{label}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 border-2 border-ink bg-ink px-2 py-2 font-mono text-[7px] leading-4 text-white/60">
        model: deepseek-chat
        <br />
        endpoint: .../v1
        <br />
        <span className="text-brand">status: 200 OK</span>
      </div>
    </div>
  );
}
