from __future__ import annotations

import statistics
from datetime import datetime
from typing import Any

import markdown as md

SEVERITY_LABEL = {
    "low": "低",
    "medium": "中",
    "high": "高",
    "critical": "严重",
}

LEVEL_LABEL = {
    "trace": "TRACE",
    "debug": "DEBUG",
    "info": "INFO",
    "warn": "WARN",
    "error": "ERROR",
    "critical": "CRITICAL",
}


def _esc(text: Any) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("`", "\\`")
    )


def _num(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if number == int(number):
        return f"{int(number):,}"
    return f"{number:,.2f}"


def _pct(value: Any) -> str:
    try:
        return f"{float(value) * 100:.2f}%"
    except (TypeError, ValueError):
        return "—"


def _kpi_value(kpi: dict[str, Any]) -> str:
    if kpi["type"] == "ratio":
        series = [item for item in kpi["series"] if item["value"] is not None]
        if not series:
            return "—"
        return _pct(statistics.median(float(item["value"]) for item in series))
    return _num(kpi.get("total", 0))


def _kpi_trend(kpi: dict[str, Any]) -> str:
    series = [item for item in kpi["series"] if item["value"] is not None]
    if kpi["type"] == "ratio":
        if not series:
            return ""
        chooser = min if kpi.get("direction", "up") == "up" else max
        worst = chooser(series, key=lambda item: float(item["value"]))
        return f"最差 {worst['date']} {_pct(worst['value'])}"
    if len(series) < 2:
        return ""
    peak = max(series, key=lambda item: float(item["value"]))
    return f"峰值 {peak['date']} {_num(peak['value'])}"


def build_report(result: Any) -> str:
    summary = result.summary
    overview = summary["overview"]
    findings = result.findings or {}
    anomalies = result.anomalies

    lines: list[str] = []
    lines.append(f"# 日志分析报告 · {_esc(result.run_id)}")
    lines.append("")
    lines.append(
        f"> 领域包 `{_esc(result.pack)}` · 生成于 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} · "
        f"分析引擎 LogLens v0.1"
    )
    if result.llm_used:
        lines.append(f"> AI 叙事：`{_esc(result.llm_model or '')}`（结论已通过引用校验）")
    else:
        lines.append("> AI 叙事：未启用（当前为确定性报告，所有数字直接来自日志统计）")
    lines.append("")

    lines.append("## 1. 执行摘要")
    lines.append("")
    bullets = findings.get("executive_summary") or []
    if bullets:
        for item in bullets:
            lines.append(f"- {_esc(item)}")
    else:
        lines.append(
            f"- 共处理 **{_num(overview['records'])}** 条日志，来自 **{_num(overview['files'])}** 个文件，"
            f"解析成功率 **{_pct(overview['parse_rate'])}**。"
        )
        lines.append(
            f"- 错误/严重日志 **{_num(overview['errors'])}** 条（{_pct(overview['error_rate'])}），"
            f"警告 **{_num(overview['warnings'])}** 条。"
        )
        if anomalies:
            lines.append(f"- 检测到 **{len(anomalies)}** 个异常候选，最严重的是「{_esc(anomalies[0]['title'])}」。")
    if overview.get("start") and overview.get("end"):
        lines.append(
            f"- 时间范围：`{_esc(overview['start'])}` → `{_esc(overview['end'])}`"
            + (f"，约 {overview['duration_hours']:.1f} 小时。" if overview.get("duration_hours") else "。")
        )
    lines.append("")

    lines.append("## 2. 业务 / 领域指标")
    lines.append("")
    if summary.get("kpis"):
        lines.append("| 指标 | 类型 | 代表值 | 变化 / 最差日 | 单位 |")
        lines.append("|---|---|---:|---:|---|")
        for kpi in summary["kpis"]:
            lines.append(
                f"| {_esc(kpi['name'])} | {'比率' if kpi['type'] == 'ratio' else '计数'} | "
                f"{_kpi_value(kpi)} | {_kpi_trend(kpi) or '—'} | {_esc(kpi.get('unit') or '')} |"
            )
        lines.append("")
        for kpi in summary["kpis"]:
            if kpi["type"] != "ratio" or not kpi["series"]:
                continue
            lines.append(f"**{_esc(kpi['name'])} 按日：**")
            lines.append("")
            lines.append("| 日期 | 数值 | 分子 | 分母 |")
            lines.append("|---|---:|---:|---:|")
            for item in kpi["series"]:
                lines.append(
                    f"| {_esc(item['date'])} | {_pct(item['value'])} | {_num(item.get('numerator', 0))} | "
                    f"{_num(item.get('denominator', 0))} |"
                )
            lines.append("")
    else:
        lines.append("_当前领域包未定义 KPI。_")
        lines.append("")

    lines.append("## 3. 运行健康")
    lines.append("")
    lines.append("| 指标 | 数值 |")
    lines.append("|---|---:|")
    lines.append(f"| 日志条数 | {_num(overview['records'])} |")
    lines.append(f"| 文件数 | {_num(overview['files'])} |")
    lines.append(f"| 解析成功率 | {_pct(overview['parse_rate'])} |")
    lines.append(f"| 错误/严重 | {_num(overview['errors'])} |")
    lines.append(f"| 警告 | {_num(overview['warnings'])} |")
    lines.append(f"| 错误率 | {_pct(overview['error_rate'])} |")
    lines.append("")
    levels = overview.get("levels", {})
    present = [(level, levels.get(level, 0)) for level in LEVEL_LABEL if levels.get(level, 0)]
    if present:
        lines.append("**日志级别分布：** " + " · ".join(f"{LEVEL_LABEL[level]} {_num(count)}" for level, count in present))
        lines.append("")
    if summary.get("daily"):
        lines.append("**按日趋势：**")
        lines.append("")
        lines.append("| 日期 | 总量 | 错误 | 警告 |")
        lines.append("|---|---:|---:|---:|")
        for item in summary["daily"]:
            lines.append(f"| {_esc(item['date'])} | {_num(item['total'])} | {_num(item['errors'])} | {_num(item['warns'])} |")
        lines.append("")

    lines.append("## 4. 异常与风险")
    lines.append("")
    if anomalies:
        for item in anomalies:
            lines.append(f"### A{anomalies.index(item) + 1}. {_esc(item['title'])}")
            lines.append("")
            lines.append(f"- 严重度：**{SEVERITY_LABEL.get(item['severity'], item['severity'])}**")
            if item.get("window"):
                lines.append(f"- 时间窗：`{_esc(item['window'].get('from'))}` → `{_esc(item['window'].get('to'))}`")
            if item.get("observed") is not None:
                lines.append(f"- 观测值：{_num(item['observed'])}；基线：{_num(item.get('baseline', 0))}")
            lines.append(f"- 说明：{_esc(item['detail'])}")
            if item.get("citations"):
                lines.append("- 证据：" + " ".join(f"`{_esc(value)}`" for value in item["citations"]))
            lines.append("")
    else:
        lines.append("_未检测到显著异常。_")
        lines.append("")

    lines.append("## 5. 归因与建议")
    lines.append("")
    if findings.get("findings"):
        for index, item in enumerate(findings["findings"], start=1):
            lines.append(f"### F{index}. {_esc(item['title'])}")
            lines.append("")
            lines.append(
                f"- 严重度：**{SEVERITY_LABEL.get(item['severity'], item['severity'])}** · "
                f"置信度：**{item.get('confidence', 0):.0%}**"
                + (" · 建议人工复核" if item.get("needs_human_review") else "")
            )
            if item.get("evidence_ids"):
                lines.append("- 引用：" + " ".join(f"`{_esc(value)}`" for value in item["evidence_ids"]))
            lines.append("")
            lines.append(_esc(item.get("summary", "")))
            lines.append("")
            if item.get("impact"):
                lines.append(f"**影响：** {_esc(item['impact'])}")
                lines.append("")
            if item.get("recommendations"):
                lines.append("**建议：**")
                for recommendation in item["recommendations"]:
                    lines.append(f"- {_esc(recommendation)}")
                lines.append("")
            if item.get("counter_evidence"):
                lines.append("**反证 / 待确认：**")
                for counter in item["counter_evidence"]:
                    lines.append(f"- {_esc(counter)}")
                lines.append("")
    else:
        lines.append("_未生成归因结论。_")
        lines.append("")
    if findings.get("data_gaps"):
        lines.append("**建议补充的数据：**")
        for gap in findings["data_gaps"]:
            lines.append(f"- {_esc(gap)}")
        lines.append("")
    if findings.get("validation_warnings"):
        lines.append("**校验提示：**")
        for warning in findings["validation_warnings"]:
            lines.append(f"- {_esc(warning)}")
        lines.append("")

    lines.append("## 6. 高频模板")
    lines.append("")
    if summary.get("top_templates"):
        lines.append("| 次数 | 级别 | 模板 |")
        lines.append("|---:|---|---|")
        for template in summary["top_templates"][:12]:
            lines.append(
                f"| {_num(template['count'])} | {LEVEL_LABEL.get(template['severity'], template['severity'])} | "
                f"`{_esc(template['pattern'][:160])}` |"
            )
        lines.append("")

    if summary.get("top_faults"):
        lines.append("## 7. 故障分类 Top")
        lines.append("")
        lines.append("| 次数 | 类别 | 严重度 | 模块 |")
        lines.append("|---:|---|---|---|")
        for fault in summary["top_faults"]:
            lines.append(
                f"| {_num(fault['count'])} | {_esc(fault['name'])} | "
                f"{SEVERITY_LABEL.get(fault['severity'], fault['severity'])} | {_esc(fault['modules'] or '—')} |"
            )
        lines.append("")

    lines.append("## 附录")
    lines.append("")
    lines.append("**分析方法**：")
    lines.append("")
    lines.append("- 模板挖掘：动态 token 掩码（UUID、IP、URL、时间戳、数字、引号字符串）。")
    lines.append("- 异常检测：5 分钟错误桶与小时级模板计数的稳健 Z 分数（median/MAD）；KPI 相对中位数下跌。")
    lines.append("- 数字口径：所有统计来自 DuckDB SQL，AI 只负责解释与组织语言。")
    lines.append("- 引用格式：`文件路径:行号`。")
    lines.append("")
    lines.append("**输入文件：**")
    lines.append("")
    lines.append("| 文件 | 大小 | 编码 | 行数 | 解析错误 | 重复行 |")
    lines.append("|---|---:|---|---:|---:|---:|")
    for item in summary.get("files", []):
        lines.append(
            f"| `{_esc(item['path'])}` | {_num(item['size'])} B | {_esc(item['encoding'])} | "
            f"{_num(item['lines'])} | {_num(item['parse_errors'])} | {_num(item['duplicates'])} |"
        )
    lines.append("")
    if result.warnings:
        lines.append("**运行警告：**")
        for warning in result.warnings:
            lines.append(f"- {_esc(warning)}")
        lines.append("")
    return "\n".join(lines)


HTML_TEMPLATE = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{TITLE}}</title>
<style>
  :root {
    --paper:#f3f6fb; --paper-2:#e9eff8; --surface:#ffffff; --ink:#0a1022; --ink-2:#1b2740;
    --muted:#57647c; --line:#cbd6e6; --line-strong:#9fb0c9; --brand:#2563eb;
    --brand-soft:#e3ecff; --ok:#047857; --warn:#b45309; --danger:#dc2626;
    --font-sans:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
    --font-mono:ui-monospace,"SFMono-Regular","Cascadia Mono","JetBrains Mono",Menlo,Consolas,"Liberation Mono",monospace;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font:14px/1.7 var(--font-sans); }
  .topbar { border-bottom:2px solid var(--ink); background:var(--surface); }
  .topbar::before { content:""; display:block; height:6px; background:var(--brand); }
  .topbar .wrap { max-width:1120px; margin:0 auto; padding:18px 24px; display:flex; align-items:center; gap:14px; }
  .mark { width:36px; height:36px; display:grid; place-items:center; background:var(--brand); color:#fff;
    border:2px solid var(--ink); box-shadow:3px 3px 0 0 var(--ink); font-family:var(--font-mono); font-weight:800; }
  .brand { display:flex; flex-direction:column; gap:3px; }
  .brand b { font-family:var(--font-mono); font-size:13px; letter-spacing:.16em; line-height:1; }
  .brand small { font-family:var(--font-mono); font-size:8px; letter-spacing:.18em; text-transform:uppercase; color:var(--muted); }
  .top-meta { margin-left:auto; font-family:var(--font-mono); font-size:8.5px; letter-spacing:.12em;
    text-transform:uppercase; color:var(--muted); text-align:right; }
  main { max-width:1120px; margin:0 auto; padding:36px 24px 24px; }
  article { background:var(--surface); border:2px solid var(--ink); box-shadow:6px 6px 0 0 var(--line);
    padding:34px 38px 48px; }
  h1 { font-size:30px; line-height:1.15; letter-spacing:-.03em; margin:0 0 18px;
    padding-bottom:16px; border-bottom:2px solid var(--ink); }
  h2 { font-size:20px; line-height:1.25; margin:42px 0 14px; padding:10px 12px;
    background:var(--paper-2); border-left:6px solid var(--brand); border-bottom:2px solid var(--ink); }
  h3 { font-size:15px; line-height:1.35; margin:26px 0 8px; padding-left:10px; border-left:4px solid var(--brand); }
  p, li { color:var(--ink-2); }
  strong { color:var(--ink); font-weight:700; }
  blockquote { margin:18px 0; padding:12px 16px; background:var(--brand-soft);
    border-left:4px solid var(--brand); color:var(--muted); }
  blockquote p { margin:0; }
  code { font-family:var(--font-mono); font-size:12px; background:var(--paper-2);
    border:1px solid var(--line); padding:1px 5px; }
  pre { background:var(--ink); color:#dbe7ff; border:2px solid var(--ink); padding:16px;
    overflow:auto; font-size:12px; line-height:1.65; }
  pre code { background:transparent; border:0; color:inherit; padding:0; }
  table { width:100%; border-collapse:collapse; margin:16px 0; font-size:12.5px; }
  th { background:var(--paper-2); border-top:2px solid var(--ink); border-bottom:2px solid var(--ink);
    padding:8px 9px; text-align:left; font-family:var(--font-mono); font-size:9.5px;
    letter-spacing:.06em; text-transform:uppercase; color:var(--muted); font-weight:600; }
  td { border-bottom:1px solid var(--line); padding:8px 9px; vertical-align:top; }
  tbody tr:hover td { background:var(--brand-soft); }
  a { color:var(--brand); text-decoration-thickness:1px; text-underline-offset:3px; }
  hr { border:0; border-top:2px solid var(--line); margin:32px 0; }
  .page-foot { max-width:1120px; margin:0 auto; padding:20px 24px 44px; display:flex;
    flex-wrap:wrap; gap:12px 24px; justify-content:space-between;
    font-family:var(--font-mono); font-size:8.5px; letter-spacing:.1em;
    text-transform:uppercase; color:var(--muted); }
  @media (max-width:720px) {
    .topbar .wrap { padding:14px 16px; }
    .top-meta { display:none; }
    main { padding:20px 14px 18px; }
    article { padding:22px 18px 32px; }
    h1 { font-size:24px; }
    h2 { font-size:17px; }
    table { font-size:11.5px; }
    th, td { padding:6px; }
  }
  @media print {
    body { background:#fff; }
    .topbar { border-bottom:2px solid #000; }
    .topbar::before { background:#000; }
    main { max-width:none; padding:0; }
    article { border:0; box-shadow:none; padding:0; }
    h2 { background:none; border-left:4px solid #000; }
    a { color:inherit; text-decoration:none; }
  }
</style>
</head>
<body>
  <header class="topbar">
    <div class="wrap">
      <div class="mark">L</div>
      <div class="brand">
        <b>LOGLENS</b>
        <small>日志证据工作台 · REPORT</small>
      </div>
      <div class="top-meta">确定性事实 → 证据包 → LLM 叙事<br>EVIDENCE FIRST</div>
    </div>
  </header>
  <main><article>{{BODY}}</article></main>
  <footer class="page-foot">
    <span>LogLens · 所有统计来自 DuckDB，AI 只负责解释</span>
    <span>引用格式：文件:行号</span>
  </footer>
</body>
</html>"""


def render_html(markdown_text: str, title: str = "LogLens Report") -> str:
    body = md.markdown(markdown_text, extensions=["tables", "fenced_code", "sane_lists"])
    return HTML_TEMPLATE.replace("{{TITLE}}", _esc(title)).replace("{{BODY}}", body)
