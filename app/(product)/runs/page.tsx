"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PageHead, SectionHead } from "@/components/layout/page-head";
import { ProductShell } from "@/components/layout/product-shell";
import { useRunContext } from "@/components/providers/run-context";
import {
  Arrow,
  ArrowUpRight,
  Download,
  Panel,
  PanelHead,
  PixelMeter,
  Stat,
} from "@/components/ui";
import {
  apiForm,
  apiGet,
  runArtifact,
  type PackListItem,
  type RunMeta,
} from "@/lib/api";
import {
  STATUS_LABEL,
  STATUS_TAG,
  duration,
  fmt,
  shortTime,
} from "@/lib/format";

const ARTIFACTS = [
  ["summary.json", "summary.json"],
  ["anomalies.json", "anomalies.json"],
  ["findings.json", "findings.json"],
  ["templates.csv", "templates.csv"],
  ["events.csv", "events.csv"],
];

export default function RunsPage() {
  const router = useRouter();
  const { runs, selectedRun, selectedRunId, refreshRuns, selectRun, loading } = useRunContext();
  const [packs, setPacks] = useState<PackListItem[]>([]);
  const [name, setName] = useState("");
  const [pack, setPack] = useState("generic");
  const [useLlm, setUseLlm] = useState(true);
  const [source, setSource] = useState<"files" | "archive" | "path">("files");
  const [sourcePath, setSourcePath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const archiveRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<PackListItem[]>("/api/packs")
      .then((items) => {
        setPacks(items);
        if (items.length && !items.some((item) => item.id === pack)) {
          setPack(items[0].id);
        }
      })
      .catch(() => setPacks([]));
  }, []);

  const activeRuns = runs.filter(
    (run) => run.status === "running" || run.status === "queued",
  );
  const doneRuns = runs.filter((run) => run.status === "done");
  const latest = runs[0];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData();
    form.set("name", name.trim());
    form.set("pack", pack);
    form.set("use_llm", useLlm ? "true" : "false");
    form.set("source_path", source === "path" ? sourcePath.trim() : "");
    if (source === "files") {
      const files = filesRef.current?.files;
      if (!files?.length) {
        setError("请选择日志文件");
        return;
      }
      for (const file of Array.from(files)) form.append("files", file, file.name);
    }
    if (source === "archive") {
      const archive = archiveRef.current?.files?.[0];
      if (!archive) {
        setError("请选择 zip 压缩包");
        return;
      }
      form.append("archive", archive, archive.name);
    }
    if (source === "path" && !sourcePath.trim()) {
      setError("请填写服务器路径");
      return;
    }
    setBusy(true);
    try {
      const created = await apiForm<RunMeta>("/api/runs", form);
      await refreshRuns();
      selectRun(created.id);
      router.push("/diagnose");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建分析失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProductShell active="runs">
      <PageHead
        actions={
          <>
            <a className="px-btn px-btn-brand" href="#new-run">
              新建分析 <Arrow />
            </a>
            <Link className="px-btn px-btn-ghost" href="/diagnose">
              打开最近运行 <ArrowUpRight />
            </Link>
          </>
        }
        en="RUNS"
        index="01"
        title="运行"
        description="日志从哪里来、排队到哪一步、产物落在哪。上传、队列、历史与归档全部收在这一页，离开后分析继续在后台执行。"
      />

      <div className="mx-auto max-w-[1520px] px-6">
        <Panel className="mt-6" variant="flat">
          <div className="grid grid-cols-2 lg:grid-cols-4">
            {[
              ["运行总数", fmt(runs.length), `${doneRuns.length} 个已完成`, "ink"],
              ["队列", fmt(activeRuns.length), `${loading ? "加载中" : "后台线程执行"}`, "brand"],
              ["已完成", fmt(doneRuns.length), "产物可下载", "ink"],
              ["最近运行", duration(latest?.message), `${fmt(latest?.stats?.records)} 行`, "ok"],
            ].map(([label, value, hint, tone], index) => (
              <Stat
                className={`border-line ${index < 3 ? "border-r-2" : ""} ${
                  index < 2 ? "border-b-2 lg:border-b-0" : ""
                }`}
                hint={hint}
                key={label}
                label={label}
                tone={tone as "ink" | "brand" | "ok"}
                value={value}
              />
            ))}
          </div>
        </Panel>
      </div>

      <section className="mx-auto max-w-[1520px] px-6 py-12" id="new-run">
        <SectionHead
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-tag px-tag-brand">后台线程</span>
              <span className="px-tag">可离开页面</span>
            </div>
          }
          description="三种接入方式只影响日志怎么进来；解析、统计与检测始终走同一条确定性流水线。"
          index="01"
          title="新建分析"
        />

        <div className="mt-6 grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8">
            <Panel>
              <PanelHead
                aside={<span className="px-tag">deterministic first</span>}
                kicker="New run"
                title="接入与参数"
              />
              <form className="p-6" onSubmit={submit}>
                <div className="grid grid-cols-12 gap-4">
                  <label className="col-span-12 md:col-span-5">
                    <span className="label">任务名称</span>
                    <input
                      className="px-field mt-2"
                      onChange={(event) => setName(event.target.value)}
                      placeholder="例如：订单服务 10-02 故障"
                      value={name}
                    />
                  </label>
                  <label className="col-span-12 md:col-span-4">
                    <span className="label">领域包</span>
                    <select
                      className="px-field mt-2"
                      onChange={(event) => setPack(event.target.value)}
                      value={pack}
                    >
                      {packs.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name || item.id} · {item.version}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-12 md:col-span-3">
                    <span className="label">AI 叙事</span>
                    <span className="mt-2 flex h-11 items-center gap-3 border-2 border-line-strong bg-surface px-3 text-[11.5px]">
                      <input
                        checked={useLlm}
                        className="h-4 w-4 accent-brand"
                        onChange={(event) => setUseLlm(event.target.checked)}
                        type="checkbox"
                      />
                      启用，失败回退
                    </span>
                  </label>
                </div>

                <fieldset className="mt-6">
                  <legend className="label">接入方式 / 三选一</legend>
                  <div className="mt-2 border-2 border-line-strong">
                    <SourceRow
                      checked={source === "files"}
                      hint="多选文件，按首行时间戳排序后流式解析。"
                      label="上传日志文件"
                      meta=".log / .jsonl / .txt"
                      onSelect={() => setSource("files")}
                      value="files"
                    >
                      <input className="sr-only" multiple ref={filesRef} type="file" />
                      <button
                        className="px-btn px-btn-ghost px-btn-sm"
                        onClick={() => filesRef.current?.click()}
                        type="button"
                      >
                        选择文件
                      </button>
                    </SourceRow>
                    <SourceRow
                      checked={source === "archive"}
                      hint="解包后递归发现文件，跳过 node_modules 与 .git。"
                      label="上传 zip 压缩包"
                      meta=".zip"
                      onSelect={() => setSource("archive")}
                      value="archive"
                    >
                      <input accept=".zip" className="sr-only" ref={archiveRef} type="file" />
                      <button
                        className="px-btn px-btn-ghost px-btn-sm"
                        onClick={() => archiveRef.current?.click()}
                        type="button"
                      >
                        选择文件
                      </button>
                    </SourceRow>
                    <SourceRow
                      checked={source === "path"}
                      hint="读取 LogLens 服务端可见的目录或文件。"
                      label="服务器路径"
                      meta="dir / file"
                      onSelect={() => setSource("path")}
                      value="path"
                    >
                      <input
                        className="px-field h-9 text-[11px]"
                        onChange={(event) => setSourcePath(event.target.value)}
                        placeholder="/mnt/d/LogsBackup/.../core"
                        value={sourcePath}
                      />
                    </SourceRow>
                  </div>
                </fieldset>

                <div className="mt-6 flex flex-wrap items-center gap-6">
                  <button className="px-btn px-btn-brand" disabled={busy} type="submit">
                    {busy ? "创建中…" : "开始分析"} {busy ? null : <Arrow />}
                  </button>
                  <p className="max-w-[48ch] text-[11px] leading-5 text-muted">
                    分析在后台线程执行，可以离开此页面。运行结束后会自动出现在诊断页。
                  </p>
                </div>
                {error ? (
                  <p className="mt-4 border-2 border-danger bg-danger-soft px-4 py-3 text-[11px] text-danger">
                    {error}
                  </p>
                ) : null}
              </form>
            </Panel>
          </div>

          <aside className="col-span-12 flex flex-col gap-6 lg:col-span-4">
            <Panel>
              <PanelHead
                aside={<span className="font-mono text-[9px] text-muted">{activeRuns.length} active</span>}
                kicker="Queue"
                title="队列"
              />
              {activeRuns.slice(0, 4).map((run) => (
                <div className="border-b-2 border-line px-6 py-5 last:border-0" key={run.id}>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[12.5px] font-semibold">{run.name}</span>
                    <span className="px-tag px-tag-brand">{run.progress}%</span>
                  </div>
                  <div className="mt-2 font-mono text-[9px] text-muted">
                    {run.stage} · {run.message || "等待中"}
                  </div>
                  <PixelMeter className="mt-4" value={run.progress} />
                </div>
              ))}
              {!activeRuns.length ? (
                <div className="px-6 py-8 text-[11px] text-muted">当前没有排队或运行中的任务。</div>
              ) : null}
            </Panel>

            <Panel variant="soft">
              <PanelHead kicker="Pipeline" title="一次运行的五个步骤" />
              <ol className="px-6 py-4">
                {[
                  ["01", "接入", "编码探测 · 轮转排序"],
                  ["02", "解析", "格式适配 · 模板掩码"],
                  ["03", "统计", "DuckDB · KPI / 事件"],
                  ["04", "检测", "稳健 z · 突增 / 新模板"],
                  ["05", "报告", "证据包 · LLM / 回退"],
                ].map(([no, title, body], index) => (
                  <li className="flex gap-3" key={no}>
                    <div className="flex flex-col items-center">
                      <span className="flex h-6 w-6 items-center justify-center border-2 border-ink bg-surface font-mono text-[8px] font-semibold">
                        {no}
                      </span>
                      {index < 4 ? <span className="h-6 w-[2px] bg-line" /> : null}
                    </div>
                    <div className="pb-2 pt-1">
                      <span className="text-[11.5px] font-semibold">{title}</span>
                      <span className="mt-1 block font-mono text-[8.5px] text-muted">{body}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          </aside>
        </div>
      </section>

      <section className="border-t-2 border-ink bg-surface">
        <div className="mx-auto max-w-[1520px] px-6 py-12">
          <SectionHead
            aside={
              <div className="flex items-center gap-2">
                <span className="px-tag">全部 {runs.length}</span>
                <span className="px-tag px-tag-ok">已完成 {doneRuns.length}</span>
                <span className="px-tag px-tag-danger">
                  失败 {runs.filter((run) => run.status === "error").length}
                </span>
              </div>
            }
            description="所有运行共用一套产物结构；删除运行会同时删除 evidence.json 与 DuckDB，操作不可撤销。"
            index="02"
            title="运行历史"
          />

          <Panel className="mt-6">
            <div className="md:overflow-x-auto">
              <table className="w-full min-w-0 text-left md:min-w-[980px]">
                <thead>
                  <tr className="border-b-2 border-ink bg-paper-2">
                    {["运行", "状态", "领域包", "规模", "异常", "耗时", "创建时间", ""].map(
                      (head, index) => (
                        <th
                          className={`px-4 py-3 font-mono text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted ${
                            index > 1 && index < 7 ? "hidden md:table-cell" : ""
                          }`}
                          key={head || "open"}
                        >
                          {head}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      className={`border-b border-line transition-colors last:border-0 hover:bg-brand-soft/40 ${
                        run.id === selectedRunId ? "bg-brand-soft/50" : ""
                      }`}
                      key={run.id}
                    >
                      <td className="px-4 py-4">
                        <button
                          className="block text-left"
                          onClick={() => selectRun(run.id)}
                          type="button"
                        >
                          <span className="block text-[12.5px] font-semibold">{run.name}</span>
                          <span className="mt-1 block font-mono text-[8.5px] text-muted">{run.id}</span>
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <span className={STATUS_TAG[run.status] || "px-tag"}>
                          {STATUS_LABEL[run.status] || run.status}
                        </span>
                      </td>
                      <td className="hidden px-4 py-4 font-mono text-[9.5px] text-muted md:table-cell">
                        {run.pack}
                      </td>
                      <td className="num hidden px-4 py-4 font-mono text-[9.5px] md:table-cell">
                        {fmt(run.stats?.records)}
                      </td>
                      <td className="num hidden px-4 py-4 font-mono text-[9.5px] md:table-cell">
                        {fmt(run.stats?.anomalies)}
                      </td>
                      <td className="num hidden px-4 py-4 font-mono text-[9.5px] text-muted md:table-cell">
                        {duration(run.message)}
                      </td>
                      <td className="hidden px-4 py-4 font-mono text-[9.5px] text-muted md:table-cell">
                        {shortTime(run.created_at)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          aria-label={`打开 ${run.name}`}
                          className="inline-flex h-8 w-8 items-center justify-center border-2 border-line-strong text-muted transition-colors hover:border-ink hover:bg-ink hover:text-white"
                          onClick={() => {
                            selectRun(run.id);
                            router.push("/diagnose");
                          }}
                          type="button"
                        >
                          <Arrow className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!runs.length && !loading ? (
                    <tr>
                      <td className="px-4 py-10 text-center text-[11px] text-muted" colSpan={8}>
                        还没有运行记录，先在上方创建一次分析。
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-ink px-4 py-3 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted">
              <span>显示 {runs.length} 条</span>
              <span className="flex items-center gap-2">
                <Download className="h-3 w-3" /> 产物按运行独立保存
              </span>
            </div>
          </Panel>

          {selectedRun ? (
            <Panel className="mt-6" variant="soft">
              <PanelHead
                aside={
                  <Link
                    className="px-btn px-btn-brand px-btn-sm"
                    href={`/api/runs/${selectedRun.id}/download.zip`}
                  >
                    下载全部 <Download />
                  </Link>
                }
                kicker="Artifacts"
                title={selectedRun.name}
              />
              <div className="flex flex-wrap gap-2 px-5 py-5">
                <Link className="px-btn px-btn-ghost px-btn-sm" href={`/api/runs/${selectedRun.id}/report.md`}>
                  报告 Markdown
                </Link>
                <Link className="px-btn px-btn-ghost px-btn-sm" href={`/api/runs/${selectedRun.id}/report.html`}>
                  报告 HTML
                </Link>
                <Link className="px-btn px-btn-ghost px-btn-sm" href={runArtifact(selectedRun.id, "evidence.json")}>
                  evidence.json
                </Link>
                {ARTIFACTS.map(([label, file]) => (
                  <Link
                    className="px-btn px-btn-ghost px-btn-sm"
                    href={runArtifact(selectedRun.id, file)}
                    key={file}
                  >
                    {label}
                  </Link>
                ))}
              </div>
              {selectedRun.warnings?.length ? (
                <div className="border-t-2 border-line px-5 py-4 text-[10px] leading-5 text-muted">
                  {selectedRun.warnings.map((warning) => (
                    <div key={warning}>· {warning}</div>
                  ))}
                </div>
              ) : null}
            </Panel>
          ) : null}
        </div>
      </section>
    </ProductShell>
  );
}

function SourceRow({
  checked,
  label,
  meta,
  hint,
  value,
  onSelect,
  children,
}: {
  checked: boolean;
  label: string;
  meta: string;
  hint: string;
  value: "files" | "archive" | "path";
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-12 items-center gap-x-4 gap-y-2 border-b-2 border-line px-4 py-4 last:border-b-0">
      <span className="col-span-1 flex items-center">
        <input
          checked={checked}
          className="h-4 w-4 accent-brand"
          name="source"
          onChange={onSelect}
          type="radio"
          value={value}
        />
      </span>
      <label className="col-span-11 cursor-pointer md:col-span-3" onClick={onSelect}>
        <span className="text-[12.5px] font-semibold">{label}</span>
        <span className="mt-1 block font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted">
          {meta}
        </span>
      </label>
      <span className="col-span-12 text-[11px] leading-5 text-muted md:col-span-4">{hint}</span>
      <span className="col-span-12 flex items-center gap-3 md:col-span-4">{children}</span>
    </div>
  );
}
