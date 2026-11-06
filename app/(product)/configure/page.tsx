"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PageHead, SectionHead } from "@/components/layout/page-head";
import { ProductShell } from "@/components/layout/product-shell";
import { useRunContext } from "@/components/providers/run-context";
import {
  Arrow,
  Check,
  Cube,
  Layers,
  Lock,
  Panel,
  PanelHead,
  Terminal,
} from "@/components/ui";
import {
  apiForm,
  apiGet,
  apiSend,
  apiText,
  type LLMSettings,
  type PackDetail,
  type PackListItem,
} from "@/lib/api";

type PackForm = {
  base_url: string;
  model: string;
  api_key: string;
  session_id: string;
  timeout: number;
  max_tokens: number;
  clear_api_key: boolean;
};

const EMPTY_FORM: PackForm = {
  base_url: "",
  model: "",
  api_key: "",
  session_id: "",
  timeout: 120,
  max_tokens: 4000,
  clear_api_key: false,
};

const STARTER_YAML = `id: my-service
name: My Service
version: 1.0.0
description: ""

ingest:
  include_globs: ["*.log", "*.log.*"]
  line_regex: null

events: []
kpis: []
faults: []
`;

export default function ConfigurePage() {
  const { refreshRuns } = useRunContext();
  const [packs, setPacks] = useState<PackListItem[]>([]);
  const [details, setDetails] = useState<Record<string, PackDetail>>({});
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [yaml, setYaml] = useState("");
  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [form, setForm] = useState<PackForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    model?: string;
    latency_ms?: number;
    reply?: string;
  } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [draftIsExisting, setDraftIsExisting] = useState(false);
  const [draftYaml, setDraftYaml] = useState("");
  const [aiForm, setAiForm] = useState({
    pack_id: "",
    name: "",
    hint: "",
    source_path: "",
  });
  const [aiFileNames, setAiFileNames] = useState<string[]>([]);
  const aiFilesRef = useRef<HTMLInputElement>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMeta, setAiMeta] = useState<{
    model?: string;
    files?: number;
    lines?: number;
  } | null>(null);

  async function refreshPacks() {
    const list = await apiGet<PackListItem[]>("/api/packs");
    setPacks(list);
    const loaded = await Promise.all(
      list.map((item) => apiGet<PackDetail>(`/api/packs/${encodeURIComponent(item.id)}`).catch(() => null)),
    );
    const map: Record<string, PackDetail> = {};
    loaded.forEach((item) => {
      if (item) map[item.id] = item;
    });
    setDetails(map);
    setSelectedPackId((current) =>
      current && list.some((item) => item.id === current) ? current : list[0]?.id || null,
    );
  }

  async function refreshSettings() {
    const next = await apiGet<LLMSettings>("/api/settings/llm");
    setSettings(next);
    setForm({
      base_url: next.base_url || "",
      model: next.model || "",
      api_key: "",
      session_id: next.session_id || "",
      timeout: next.timeout || 120,
      max_tokens: next.max_tokens || 4000,
      clear_api_key: false,
    });
  }

  useEffect(() => {
    void refreshPacks().catch((cause) => setError(cause instanceof Error ? cause.message : "加载领域包失败"));
    void refreshSettings().catch((cause) => setError(cause instanceof Error ? cause.message : "加载模型设置失败"));
  }, []);

  useEffect(() => {
    if (!selectedPackId) {
      setYaml("");
      return;
    }
    apiText(`/api/packs/${encodeURIComponent(selectedPackId)}/yaml`)
      .then(setYaml)
      .catch(() => setYaml(""));
  }, [selectedPackId]);

  useEffect(() => {
    setEditorOpen(false);
  }, [selectedPackId]);

  const selected = selectedPackId ? details[selectedPackId] : null;

  async function saveSettings() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const next = await apiSend<LLMSettings>("/api/settings/llm", "PUT", {
        ...form,
        timeout: Number(form.timeout) || 120,
        max_tokens: Number(form.max_tokens) || 4000,
      });
      setSettings(next);
      setForm((current) => ({ ...current, api_key: "", clear_api_key: false }));
      await refreshRuns();
      setMessage("模型设置已保存");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function testSettings() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiSend<{ ok: boolean; model: string; latency_ms: number; reply: string }>(
        "/api/settings/llm/test",
        "POST",
        { ...form, timeout: Number(form.timeout) || 120, max_tokens: Number(form.max_tokens) || 4000 },
      );
      setTestResult(result);
      setMessage("连接测试成功");
    } catch (cause) {
      setTestResult(null);
      setError(cause instanceof Error ? cause.message : "连接测试失败");
    } finally {
      setBusy(false);
    }
  }

  async function importOpenCode() {
    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/settings/llm/import-opencode", "POST");
      await refreshSettings();
      await refreshRuns();
      setMessage("已导入 OpenCode Go 配置");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function resetSettings() {
    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/settings/llm", "DELETE");
      await refreshSettings();
      await refreshRuns();
      setMessage("页面模型设置已清除");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "清除失败");
    } finally {
      setBusy(false);
    }
  }

  async function duplicatePack(packId: string) {
    setBusy(true);
    setError(null);
    try {
      const copy = await apiSend<PackDetail>(`/api/packs/${packId}/duplicate`, "POST");
      await refreshPacks();
      setSelectedPackId(copy.id);
      setMessage(`已复制为 ${copy.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "复制失败");
    } finally {
      setBusy(false);
    }
  }

  async function deletePack(packId: string) {
    if (!window.confirm(`删除领域包「${packId}」？`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/packs/${packId}`, "DELETE");
      setSelectedPackId(null);
      await refreshPacks();
      setMessage("领域包已删除");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  function scrollToEditor() {
    window.setTimeout(() => {
      document.getElementById("pack-editor")?.scrollIntoView({ block: "start" });
    }, 40);
  }

  function startNewPack() {
    setDraftId("");
    setDraftIsExisting(false);
    setDraftYaml(STARTER_YAML);
    setEditorOpen(true);
    setError(null);
    setMessage(null);
    scrollToEditor();
  }

  async function startEditPack() {
    if (!selected) return;
    setError(null);
    try {
      const content =
        selectedPackId === selected.id && yaml
          ? yaml
          : await apiText(`/api/packs/${encodeURIComponent(selected.id)}/yaml`);
      setDraftId(selected.id);
      setDraftIsExisting(true);
      setDraftYaml(content);
      setEditorOpen(true);
      scrollToEditor();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载 YAML 失败");
    }
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    try {
      const saved = await apiSend<PackDetail>("/api/packs/import", "POST", {
        content: draftYaml,
        overwrite: draftIsExisting,
      });
      setEditorOpen(false);
      setDraftYaml("");
      await refreshPacks();
      setSelectedPackId(saved.id);
      setMessage(`领域包 ${saved.id} 已保存`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存领域包失败");
    } finally {
      setBusy(false);
    }
  }

  async function generatePack() {
    const files = Array.from(aiFilesRef.current?.files ?? []);
    if (!files.length && !aiForm.source_path.trim()) {
      setError("请上传日志文件 / zip，或填写服务器路径");
      return;
    }
    setAiBusy(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("pack_id", aiForm.pack_id.trim());
      form.set("name", aiForm.name.trim());
      form.set("hint", aiForm.hint.trim());
      form.set("source_path", aiForm.source_path.trim());
      const archive = files.find((file) => file.name.toLowerCase().endsWith(".zip"));
      const logs = files.filter((file) => file !== archive);
      logs.forEach((file) => form.append("files", file));
      if (archive) form.append("archive", archive);
      const result = await apiForm<{
        pack: Record<string, unknown> & { id?: string };
        sample?: { files?: number; lines?: number };
        model?: string;
      }>("/api/packs/generate", form);
      const preview = await apiSend<{ yaml: string }>("/api/packs/yaml", "POST", result.pack);
      setDraftId(result.pack.id || "");
      setDraftIsExisting(false);
      setDraftYaml(preview.yaml);
      setAiMeta({
        model: result.model,
        files: result.sample?.files,
        lines: result.sample?.lines,
      });
      setEditorOpen(true);
      setMessage("AI 草稿已生成；检查 YAML 后点击「保存领域包」落盘");
      scrollToEditor();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成领域包失败");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <ProductShell active="configure">
      <PageHead
        actions={
          <>
            <button className="px-btn px-btn-brand" onClick={startNewPack} type="button">
              新建领域包 <Arrow />
            </button>
            <a className="px-btn px-btn-ghost" href="#ai-pack">
              AI 生成草稿
            </a>
            <button className="px-btn-quiet" onClick={() => void refreshPacks()} type="button">
              刷新
            </button>
          </>
        }
        en="CONFIGURE"
        index="05"
        title="配置"
        description="领域包决定怎么解析、算什么 KPI；模型决定怎么写报告。两者都是下一次运行的复现条件。"
      />

      <div className="mx-auto max-w-[1520px] px-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line py-3">
          <span className="px-tag px-tag-ink">{packs.length} packs</span>
          <span className="font-mono text-[9px] text-muted">
            默认包 generic · 受保护
          </span>
          <span className="font-mono text-[9px] text-muted">
            {settings?.model || "模型未配置"} ·{" "}
            {settings?.configured ? "已连接" : "未连接"}
          </span>
          <span className="ml-auto font-mono text-[9px] text-muted">
            {settings?.source === "settings" ? "页面设置" : settings?.source === "env" ? "环境变量" : "无配置"}
          </span>
        </div>

        {message ? (
          <div className="mt-4 border-2 border-ok bg-ok-soft px-4 py-3 text-[11px] text-ok">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 border-2 border-danger bg-danger-soft px-4 py-3 text-[11px] text-danger">
            {error}
          </div>
        ) : null}
      </div>

      <section className="mx-auto max-w-[1520px] px-6 py-12">
        <SectionHead
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-tag px-tag-brand">保存前校验</span>
              <span className="px-tag">YAML 可导出</span>
              <span className="px-tag">generic 受保护</span>
            </div>
          }
          description="一个软件一个包。事件命中 message，KPI 声明 direction，故障词典给出严重度与排查提示。"
          index="01"
          title="领域包"
        />

        <div className="mt-6 grid grid-cols-12 gap-6">
          <Panel className="col-span-12 lg:col-span-8">
            <div className="md:overflow-x-auto">
              <table className="w-full text-left md:min-w-[720px]">
                <thead>
                  <tr className="border-b-2 border-ink bg-paper-2">
                    {["名称 / ID", "版本", "事件", "KPI", "故障", "状态", ""].map(
                      (head, index) => (
                        <th
                          className={`px-4 py-3 font-mono text-[8.5px] font-semibold uppercase tracking-[0.1em] text-muted ${
                            index > 0 && index < 5 ? "hidden md:table-cell" : ""
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
                  {packs.map((pack) => {
                    const detail = details[pack.id];
                    return (
                      <tr
                        className={`border-b border-line transition-colors last:border-0 hover:bg-brand-soft/40 ${
                          pack.id === selectedPackId ? "bg-brand-soft/60" : ""
                        }`}
                        key={pack.id}
                      >
                        <td className="px-4 py-4">
                          <button className="block text-left" onClick={() => setSelectedPackId(pack.id)} type="button">
                            <span className="flex items-center gap-2">
                              <span className={`h-2 w-2 ${pack.id === selectedPackId ? "bg-brand" : "bg-line-strong"}`} />
                              <span className="text-[12px] font-semibold">{pack.name || pack.id}</span>
                            </span>
                            <span className="mt-1 block font-mono text-[8.5px] text-muted">
                              {pack.id} · {pack.version}
                            </span>
                          </button>
                        </td>
                        <td className="hidden px-4 py-4 font-mono text-[9.5px] md:table-cell">
                          {pack.version}
                        </td>
                        <td className="num hidden px-4 py-4 font-mono text-[9.5px] md:table-cell">
                          {detail?.events?.length ?? "—"}
                        </td>
                        <td className="num hidden px-4 py-4 font-mono text-[9.5px] md:table-cell">
                          {detail?.kpis?.length ?? "—"}
                        </td>
                        <td className="num hidden px-4 py-4 font-mono text-[9.5px] md:table-cell">
                          {detail?.faults?.length ?? "—"}
                        </td>
                        <td className="px-4 py-4">
                          <span className={pack.protected ? "px-tag px-tag-ink" : "px-tag px-tag-ok"}>
                            {pack.protected ? "受保护" : "可编辑"}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center border-2 border-line-strong text-muted transition-colors hover:border-ink hover:bg-ink hover:text-white"
                            onClick={() => setSelectedPackId(pack.id)}
                            type="button"
                          >
                            <Arrow className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink bg-paper-2 px-4 py-3 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted">
              <span>{packs.length} packs</span>
              <span>选择领域包查看 YAML；新建与编辑都在本页完成</span>
            </div>
          </Panel>

          <Panel className="col-span-12 lg:col-span-4" variant="soft">
            <div className="flex items-center justify-between border-b-2 border-line px-5 py-4">
              <div>
                <span className="label">Selected pack</span>
                <h3 className="mt-2 text-[14px] font-semibold">{selected?.name || "—"}</h3>
              </div>
              <span className="px-tag px-tag-ok">valid</span>
            </div>
            <div className="grid grid-cols-3 border-b-2 border-line">
              {[
                ["events", selected?.events?.length ?? "—"],
                ["kpis", selected?.kpis?.length ?? "—"],
                ["faults", selected?.faults?.length ?? "—"],
              ].map(([key, value], index) => (
                <div className={`px-5 py-4 ${index < 2 ? "border-r-2 border-line" : ""}`} key={key}>
                  <div className="label">{key}</div>
                  <div className="num mt-2 font-mono text-[16px] font-semibold">{value}</div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="label">YAML preview</span>
                <Terminal className="h-3.5 w-3.5 text-muted" />
              </div>
              <pre className="mt-3 max-h-[260px] overflow-auto border-2 border-ink bg-ink px-4 py-4 font-mono text-[8.5px] leading-[1.9] text-white/70">
                <code>{yaml || "加载中…"}</code>
              </pre>
            </div>
            <div className="flex flex-wrap gap-2 border-t-2 border-line px-5 py-4">
              <button
                className="px-btn px-btn-ghost px-btn-sm"
                disabled={!selected || Boolean(selected.protected) || busy}
                onClick={() => void startEditPack()}
                type="button"
              >
                编辑 YAML
              </button>
              <button
                className="px-btn px-btn-ghost px-btn-sm"
                disabled={!selected || busy}
                onClick={() => selected && void duplicatePack(selected.id)}
                type="button"
              >
                复制
              </button>
              {selected ? (
                <Link className="px-btn px-btn-ghost px-btn-sm" href={`/api/packs/${selected.id}/yaml`}>
                  导出
                </Link>
              ) : null}
              <button
                className="px-btn-quiet text-danger"
                disabled={!selected || selected.protected || busy}
                onClick={() => selected && void deletePack(selected.id)}
                type="button"
              >
                删除
              </button>
            </div>
          </Panel>
        </div>

        {editorOpen ? (
          <Panel className="mt-6" id="pack-editor">
            <PanelHead
              aside={
                <span className={draftIsExisting ? "px-tag" : "px-tag px-tag-brand"}>
                  {draftIsExisting ? `编辑 ${draftId}` : "新草稿"}
                </span>
              }
              kicker="YAML editor"
              title={draftIsExisting ? `编辑 ${draftId}` : "新建领域包"}
            />
            <div className="p-5">
              <label className="block">
                <span className="label">pack.yaml</span>
                <textarea
                  className="mt-2 min-h-[360px] w-full resize-y border-2 border-line-strong bg-paper-2 p-4 font-mono text-[10px] leading-5 text-ink outline-none transition-colors focus:border-brand"
                  onChange={(event) => setDraftYaml(event.target.value)}
                  spellCheck={false}
                  value={draftYaml}
                />
              </label>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  className="px-btn px-btn-brand px-btn-sm"
                  disabled={busy || !draftYaml.trim()}
                  onClick={() => void saveDraft()}
                  type="button"
                >
                  保存领域包 <Arrow />
                </button>
                <button
                  className="px-btn px-btn-ghost px-btn-sm"
                  onClick={() => setEditorOpen(false)}
                  type="button"
                >
                  取消
                </button>
                <span className="font-mono text-[8.5px] text-muted">
                  保存前由后端校验 ID、正则与 KPI 引用
                </span>
              </div>
              {aiMeta ? (
                <p className="mt-3 font-mono text-[8.5px] text-muted">
                  AI 草稿 · {aiMeta.model || "model"} · 样本 {aiMeta.files ?? "—"} 文件 /{" "}
                  {aiMeta.lines ?? "—"} 行
                </p>
              ) : null}
            </div>
          </Panel>
        ) : null}

        <div className="mt-12" id="ai-pack">
          <SectionHead
            aside={<span className="px-tag px-tag-warn">人工确认后落盘</span>}
            description="AI 生成只发送有明确上限的样本行；生成结果必须经过校验和人工确认，不会自动落盘。"
            index="02"
            title="AI 生成领域包"
          />
          <Panel className="mt-6" variant="dark">
            <PanelHead
              dark
              aside={<span className="px-tag px-tag-brand">max 180 lines / 60 KB</span>}
              kicker="AI pack builder"
              title="四步生成，人工确认"
            />
            <div className="grid grid-cols-1 md:grid-cols-4">
              {[
                ["01", "上传样本", "日志文件 / zip / 服务器路径"],
                ["02", "有界抽取", "最多 4 个文件、180 行、约 60 KB"],
                ["03", "生成草稿", "推断行格式、事件、KPI、故障词典"],
                ["04", "人工确认", "Pydantic + 语义校验后手动保存"],
              ].map(([no, title, body], index) => (
                <div
                  className={`px-5 py-5 ${
                    index < 3 ? "border-b border-white/15 md:border-b-0 md:border-r" : ""
                  }`}
                  key={no}
                >
                  <span className="flex h-6 w-6 items-center justify-center border border-white/30 font-mono text-[8px] text-white/70">
                    {no}
                  </span>
                  <div className="mt-3 text-[12px] font-semibold text-white">{title}</div>
                  <p className="mt-2 text-[9.5px] leading-4 text-white/65">{body}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-white/15 px-5 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label>
                  <span className="label-light">包 ID（可选）</span>
                  <input
                    className="mt-2 h-10 w-full border border-white/30 bg-white/5 px-3 font-mono text-[10px] text-white outline-none placeholder:text-white/30 focus:border-brand"
                    onChange={(event) => setAiForm({ ...aiForm, pack_id: event.target.value })}
                    placeholder="my-service"
                    value={aiForm.pack_id}
                  />
                </label>
                <label>
                  <span className="label-light">名称（可选）</span>
                  <input
                    className="mt-2 h-10 w-full border border-white/30 bg-white/5 px-3 font-mono text-[10px] text-white outline-none placeholder:text-white/30 focus:border-brand"
                    onChange={(event) => setAiForm({ ...aiForm, name: event.target.value })}
                    placeholder="My Service"
                    value={aiForm.name}
                  />
                </label>
                <label>
                  <span className="label-light">领域提示（可选）</span>
                  <input
                    className="mt-2 h-10 w-full border border-white/30 bg-white/5 px-3 font-mono text-[10px] text-white outline-none placeholder:text-white/30 focus:border-brand"
                    onChange={(event) => setAiForm({ ...aiForm, hint: event.target.value })}
                    placeholder="例如：库存服务，关注超时与鉴权"
                    value={aiForm.hint}
                  />
                </label>
                <label>
                  <span className="label-light">服务器路径（可选）</span>
                  <input
                    className="mt-2 h-10 w-full border border-white/30 bg-white/5 px-3 font-mono text-[10px] text-white outline-none placeholder:text-white/30 focus:border-brand"
                    onChange={(event) => setAiForm({ ...aiForm, source_path: event.target.value })}
                    placeholder="/var/log/my-service"
                    value={aiForm.source_path}
                  />
                </label>
                <label className="md:col-span-2">
                  <span className="label-light">样本文件 / zip</span>
                  <input
                    className="mt-2 block w-full border border-white/30 bg-white/5 p-2 font-mono text-[10px] text-white/60 file:mr-3 file:border-0 file:bg-brand file:px-3 file:py-1.5 file:font-mono file:text-[9px] file:font-semibold file:uppercase file:tracking-[0.1em] file:text-white"
                    multiple
                    onChange={(event) =>
                      setAiFileNames(Array.from(event.target.files ?? []).map((file) => file.name))
                    }
                    ref={aiFilesRef}
                    type="file"
                  />
                  <span className="mt-1 block font-mono text-[8px] text-white/45">
                    {aiFileNames.length ? aiFileNames.join(" · ") : "未选择文件"}
                  </span>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-[76ch] text-[9.5px] leading-5 text-white/65">
                  日志内容始终被视为不可信数据。样本有明确上限，生成结果不会自动落盘，保存前必须人工确认 YAML。
                </p>
                <button
                  className="px-btn px-btn-brand px-btn-sm"
                  disabled={aiBusy || busy}
                  onClick={() => void generatePack()}
                  type="button"
                >
                  {aiBusy ? "生成中…" : "生成草稿"} <Arrow />
                </button>
              </div>
            </div>
          </Panel>
        </div>
      </section>

      <section className="border-t-2 border-ink bg-surface" id="model">
        <div className="mx-auto max-w-[1520px] px-6 py-12">
          <SectionHead
            aside={
              <div className="flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.1em] text-ok">
                <span className="h-2 w-2 bg-ok" /> {settings?.configured ? "已配置" : "未配置"}
              </div>
            }
            description="OpenAI 兼容端点即可。页面设置优先于环境变量；API Key 只保存在服务端，不回传浏览器。"
            index="03"
            title="模型"
          />

          <div className="mt-6 grid grid-cols-12 gap-6">
            <Panel className="col-span-12 lg:col-span-7">
              <PanelHead
                aside={<span className="px-tag px-tag-ok">{settings?.api_key_set ? "密钥已保存" : "未保存密钥"}</span>}
                kicker="Provider"
                title="OpenAI compatible endpoint"
              />
              <div className="p-5">
                <div className="grid grid-cols-12 gap-4">
                  <label className="col-span-12">
                    <span className="label">Base URL</span>
                    <input
                      className="px-field mt-2"
                      onChange={(event) => setForm({ ...form, base_url: event.target.value })}
                      placeholder="https://api.deepseek.com/v1"
                      value={form.base_url}
                    />
                  </label>
                  <label className="col-span-12 md:col-span-6">
                    <span className="label">Model</span>
                    <input
                      className="px-field mt-2"
                      onChange={(event) => setForm({ ...form, model: event.target.value })}
                      placeholder="deepseek-chat"
                      value={form.model}
                    />
                  </label>
                  <label className="col-span-12 md:col-span-6">
                    <span className="label">API Key</span>
                    <input
                      className="px-field mt-2"
                      onChange={(event) => setForm({ ...form, api_key: event.target.value })}
                      placeholder={settings?.api_key_set ? "已保存，留空不修改" : "未保存"}
                      type="password"
                      value={form.api_key}
                    />
                  </label>
                  <label className="col-span-12">
                    <span className="label">OpenCode session ID（可选）</span>
                    <input
                      className="px-field mt-2"
                      onChange={(event) => setForm({ ...form, session_id: event.target.value })}
                      placeholder="ses_..."
                      value={form.session_id}
                    />
                  </label>
                  <label className="col-span-6">
                    <span className="label">Timeout（秒）</span>
                    <input
                      className="px-field mt-2"
                      min={1}
                      onChange={(event) => setForm({ ...form, timeout: Number(event.target.value) })}
                      type="number"
                      value={form.timeout}
                    />
                  </label>
                  <label className="col-span-6">
                    <span className="label">Max tokens</span>
                    <input
                      className="px-field mt-2"
                      min={1}
                      onChange={(event) => setForm({ ...form, max_tokens: Number(event.target.value) })}
                      type="number"
                      value={form.max_tokens}
                    />
                  </label>
                </div>
                <label className="mt-4 flex items-center gap-2 text-[10px] text-muted">
                  <input
                    checked={form.clear_api_key}
                    className="h-3.5 w-3.5 accent-brand"
                    onChange={(event) => setForm({ ...form, clear_api_key: event.target.checked })}
                    type="checkbox"
                  />
                  清除已保存的 API Key
                </label>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="px-btn px-btn-brand px-btn-sm" disabled={busy} onClick={saveSettings} type="button">
                    保存设置 <Arrow />
                  </button>
                  <button className="px-btn px-btn-ghost px-btn-sm" disabled={busy} onClick={testSettings} type="button">
                    测试连接
                  </button>
                  <button className="px-btn px-btn-ghost px-btn-sm" disabled={busy} onClick={importOpenCode} type="button">
                    一键导入 OpenCode Go
                  </button>
                  <button className="px-btn-quiet text-danger" disabled={busy} onClick={resetSettings} type="button">
                    清除页面配置
                  </button>
                </div>
                <p className="mt-3 font-mono text-[8.5px] text-muted">settings: {settings?.settings_path || "—"}</p>
              </div>
            </Panel>

            <div className="col-span-12 flex flex-col gap-6 lg:col-span-5">
              <Panel>
                <PanelHead
                  aside={<span className="font-mono text-[9px] text-ok">{testResult ? "200 OK" : "未测试"}</span>}
                  kicker="Connection"
                  title="连接测试"
                />
                <dl className="px-5 py-4">
                  {[
                    ["model", testResult?.model || settings?.model || "—"],
                    ["latency", testResult?.latency_ms ? `${testResult.latency_ms} ms` : "—"],
                    ["reply", testResult?.reply || "—"],
                    ["base_url", form.base_url || "—"],
                  ].map(([key, value]) => (
                    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0" key={key}>
                      <dt className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted">{key}</dt>
                      <dd className="max-w-[70%] break-all text-right font-mono text-[8.5px]">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="border-t-2 border-line bg-paper-2 px-5 py-3">
                  <p className="text-[9.5px] leading-5 text-muted">
                    测试只发送一条固定消息，不包含日志、证据包或提示词全文。失败不会阻止确定性报告。
                  </p>
                </div>
              </Panel>

              <Panel variant="soft">
                <div className="flex items-center justify-between border-b-2 border-line px-5 py-3">
                  <span className="label">安全边界</span>
                  <span className="px-tag">local-first</span>
                </div>
                <ul className="px-5 py-4">
                  {[
                    "API Key 不回传浏览器，只显示“已保存 / 未保存”",
                    "日志内容不是指令；提示词隔离始终开启",
                    "模型失败 → 确定性模板兜底",
                    "环境变量可作为后备，页面设置优先",
                  ].map((item) => (
                    <li className="flex items-start gap-2 border-b border-line py-2 text-[9.5px] leading-5 text-muted last:border-0" key={item}>
                      <Lock className="mt-[3px] h-3 w-3 shrink-0 text-muted" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-2 border-ink bg-surface px-5 py-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted">
                <Check className="h-3.5 w-3.5 text-ok" /> {settings?.configured ? "configured" : "not configured"}
              </span>
              <span className="flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted">
                <Layers className="h-3.5 w-3.5 text-brand" /> {packs.length} packs
              </span>
              <span className="flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted">
                <Cube className="h-3.5 w-3.5 text-warn" /> {settings?.source || "none"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="px-btn px-btn-ghost px-btn-sm" onClick={startNewPack} type="button">
                新建领域包
              </button>
              <button className="px-btn px-btn-brand px-btn-sm" disabled={busy} onClick={saveSettings} type="button">
                保存模型设置 <Arrow />
              </button>
            </div>
          </div>
        </div>
      </section>
    </ProductShell>
  );
}
