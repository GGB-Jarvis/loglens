from __future__ import annotations

import csv
import json
import os
import re
import time
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

from .analysis import Analyzer, LogStore, build_evidence
from .llm import (
    PROMPT_VERSION,
    LLMProvider,
    classify_templates,
    fallback_findings,
    generate_findings,
)
from .log import get_logger
from .models import LEVEL_ORDER, AnalysisResult, FileInfo, Record
from .packs import Pack, load_pack
from .parsing import (
    discover,
    first_timestamp_hint,
    iter_file_records,
    line_hash,
    make_custom_regex,
    sniff_encoding,
)
from .report import build_report, render_html
from .templating import TemplateCollector

ProgressFn = Callable[[str, int, str], None]
logger = get_logger("pipeline")


def _noop(stage: str, pct: int, message: str = "") -> None:
    return None


def _clean_id(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_.-]+", "-", value).strip("-")
    return cleaned[:60] or "run"


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat(sep=" ")
    return str(value)


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=_json_default), encoding="utf-8")


def _write_csv(path: Path, headers: list[str], rows: list[tuple]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(headers)
        writer.writerows(rows)


def analyze(
    paths: list[str | Path],
    pack: str | Path | Pack = "generic",
    out_dir: str | Path = "data/runs",
    run_id: str | None = None,
    use_llm: bool = True,
    cache_path: str | Path | None = None,
    progress: ProgressFn | None = None,
) -> AnalysisResult:
    report_progress = progress or _noop
    started = time.time()
    domain = load_pack(pack) if not isinstance(pack, Pack) else pack
    run_id = _clean_id(run_id or datetime.now().strftime("%Y%m%d-%H%M%S"))
    run_dir = Path(out_dir) / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    warnings: list[str] = []
    logger.info("分析开始 run=%s pack=%s out=%s inputs=%s", run_id, domain.id, run_dir, paths)

    report_progress("discover", 2, "发现日志文件")
    discovered = discover(paths, domain)
    if not discovered:
        raise FileNotFoundError(f"在以下路径未找到日志文件：{[str(item) for item in paths]}")

    custom_re = make_custom_regex(domain)
    report_progress("ingest", 5, f"发现 {len(discovered)} 个文件")
    logger.info("发现日志文件 run=%s count=%s files=%s", run_id, len(discovered), [item.name for item in discovered])

    roots = [Path(item).expanduser().resolve() for item in paths]
    base = Path(os.path.commonpath([str(item if item.is_dir() else item.parent) for item in roots]))

    files: list[tuple[FileInfo, Path]] = []
    for index, path in enumerate(discovered, start=1):
        encoding, _ = sniff_encoding(path, domain.ingest.encodings)
        try:
            rel_path = str(path.relative_to(base))
        except ValueError:
            rel_path = path.name
        info = FileInfo(rel_path=rel_path, size=path.stat().st_size, encoding=encoding)
        info.first_ts = first_timestamp_hint(path, encoding, domain, custom_re)
        files.append((info, path))
        report_progress("ingest", 5 + int(index / len(discovered) * 5), f"已探测 {path.name} 编码")

    files.sort(key=lambda item: (item[0].first_ts is None, item[0].first_ts or datetime.max))

    # ---------------------------------------------------------------- parse
    store = LogStore(run_dir / "loglens.duckdb")
    collector = TemplateCollector()
    event_rules = [(rule, re.compile(rule.pattern)) for rule in domain.events]
    fault_rules = [(fault, [re.compile(pattern) for pattern in fault.patterns]) for fault in domain.faults]

    total_records = 0
    parse_errors = 0
    dedupe = len(files) > 1
    seen: set[int] = set()
    max_seen = 5_000_000
    dedupe_disabled = False

    record_batch: list[Record] = []
    event_batch: list[tuple] = []
    fault_batch: list[tuple] = []

    def flush() -> None:
        nonlocal record_batch, event_batch, fault_batch
        if record_batch:
            store.insert_batch(record_batch, event_batch, fault_batch)
            record_batch, event_batch, fault_batch = [], [], []

    report_progress("parse", 12, "解析日志记录")
    for file_index, (info, path) in enumerate(files, start=1):
        for record in iter_file_records(path, info.rel_path, info, domain, custom_re):
            info.records += 1
            if dedupe and not dedupe_disabled:
                key = line_hash(record)
                if key in seen:
                    info.duplicates += 1
                    info.records -= 1
                    continue
                seen.add(key)
                if len(seen) > max_seen:
                    dedupe_disabled = True
                    seen.clear()
                    warnings.append("唯一日志行超过 500 万条，已关闭去重以控制内存占用。")
            collector.add(record)
            total_records += 1
            if record.ts is not None:
                for rule, regex in event_rules:
                    if rule.level and LEVEL_ORDER.get(record.level, 2) < LEVEL_ORDER.get(rule.level, 2):
                        continue
                    if rule.module and rule.module.lower() not in record.module.lower():
                        continue
                    if regex.search(record.message):
                        event_batch.append(
                            (
                                record.ts,
                                record.ts.date(),
                                rule.id,
                                rule.name or rule.id,
                                rule.category,
                                record.module,
                                record.file,
                                record.line_no,
                                record.message[:1000],
                            )
                        )
                for fault, regexes in fault_rules:
                    if any(regex.search(record.message) for regex in regexes):
                        fault_batch.append(
                            (
                                record.ts,
                                record.ts.date(),
                                fault.id,
                                fault.name or fault.id,
                                fault.severity,
                                record.module,
                                record.file,
                                record.line_no,
                                record.message[:1000],
                            )
                        )
            record_batch.append(record)
            if len(record_batch) >= 3000:
                flush()
        parse_errors += info.parse_errors
        pct = 12 + int(file_index / len(files) * 46)
        report_progress("parse", pct, f"已解析 {info.rel_path}（{info.records:,} 行）")
    flush()
    store.insert_templates(collector.ranked())
    logger.info(
        "解析完成 run=%s records=%s parse_errors=%s templates=%s",
        run_id,
        total_records,
        parse_errors,
        len(collector.ranked()),
    )

    # --------------------------------------------------------------- analyze
    report_progress("analyze", 60, "计算 KPI")
    analyzer = Analyzer(store, domain, [item[0] for item in files], warnings)
    summary = analyzer.compute_summary(total_records, parse_errors)

    report_progress("detect", 68, "检测异常")
    anomalies = analyzer.detect_anomalies()
    logger.info(
        "指标与异常完成 run=%s records=%s errors=%s warnings=%s anomalies=%s",
        run_id,
        summary["overview"]["records"],
        summary["overview"]["errors"],
        summary["overview"]["warnings"],
        len(anomalies),
    )

    # ------------------------------------------------------------------- ai
    provider = LLMProvider()
    llm_used = False
    llm_model: str | None = None
    cache_file = Path(cache_path) if cache_path else run_dir.parent / "cache" / "template_labels.json"
    if use_llm:
        if not provider.available:
            warnings.append(
                "LLM 未配置（可在页面「模型设置」中填写，或设置 LOGLENS_LLM_BASE_URL / "
                "LOGLENS_LLM_MODEL）。报告已回退为确定性模板。"
            )
            logger.warning("LLM 未配置 run=%s，使用确定性报告", run_id)
        else:
            report_progress("ai", 74, f"使用 {provider.label} 分类模板")
            logger.info("开始模板分类 run=%s model=%s", run_id, provider.label)
            cache: dict[str, dict[str, Any]] = {}
            if cache_file.exists():
                try:
                    cache = json.loads(cache_file.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, OSError):
                    cache = {}
            labels = classify_templates(provider, collector.ranked()[:40], cache)
            applied = 0
            for info in collector.ranked()[:40]:
                label = cache.get(str(info.template_id))
                if not label:
                    continue
                applied += 1
                info.category = label["category"]
                info.meaning = label["meaning"]
                if LEVEL_ORDER.get(label["severity"], 0) > LEVEL_ORDER.get(info.severity, 0):
                    info.severity = label["severity"]
                store.conn.execute(
                    "UPDATE templates SET category = ?, severity = ?, meaning = ? WHERE template_id = ?",
                    [info.category, info.severity, info.meaning, info.template_id],
                )
            if applied:
                cache_file.parent.mkdir(parents=True, exist_ok=True)
                _write_json(cache_file, cache)
                summary = analyzer.compute_summary(total_records, parse_errors)
            logger.info("模板分类完成 run=%s labels=%s applied=%s", run_id, len(labels), applied)
            if not labels and not applied:
                warnings.append("模板分类未返回标签，继续使用确定性报告。")
    else:
        warnings.append("已按请求关闭 LLM，报告使用确定性模板生成。")

    run_meta = {
        "id": run_id,
        "pack": domain.id,
        "pack_version": domain.version,
        "generated_at": datetime.now().isoformat(sep=" "),
        "elapsed_s": round(time.time() - started, 2),
        "prompt_version": PROMPT_VERSION,
    }
    evidence = build_evidence(run_meta, summary, anomalies)

    findings: dict[str, Any] | None = None
    if provider.available and use_llm:
        report_progress("ai", 82, "生成分析结论")
        findings = generate_findings(provider, evidence)
        if findings:
            llm_used = True
            llm_model = provider.label
            logger.info(
                "LLM 报告生成成功 run=%s model=%s findings=%s",
                run_id,
                provider.label,
                len(findings.get("findings", [])),
            )
        else:
            warnings.append("LLM 报告未通过校验或没有返回结论，已使用确定性回退。")
            logger.warning("LLM 报告生成失败 run=%s，使用确定性回退", run_id)
    if findings is None:
        findings = fallback_findings(summary, anomalies)

    # --------------------------------------------------------------- output
    result = AnalysisResult(
        run_id=run_id,
        pack=domain.id,
        out_dir=str(run_dir),
        files=[item[0] for item in files],
        records=total_records,
        parse_errors=parse_errors,
        start=summary["overview"].get("start"),
        end=summary["overview"].get("end"),
        summary=summary,
        anomalies=anomalies,
        evidence=evidence,
        findings=findings,
        warnings=warnings,
        llm_used=llm_used,
        llm_model=llm_model,
    )

    report_progress("report", 90, "渲染报告")
    result.report_markdown = build_report(result)

    _write_json(run_dir / "summary.json", {"run": run_meta, **summary})
    _write_json(run_dir / "anomalies.json", anomalies)
    _write_json(run_dir / "evidence.json", evidence)
    _write_json(run_dir / "findings.json", findings)
    meta_path = run_dir / "meta.json"
    if not meta_path.exists():
        _write_json(
            meta_path,
            {
                "id": run_id,
                "name": run_id,
                "pack": domain.id,
                "status": "done",
                "progress": 100,
                "stage": "done",
                "message": f"Completed in {time.time() - started:.1f}s",
                "created_at": run_meta["generated_at"],
                "started_at": run_meta["generated_at"],
                "finished_at": datetime.now().isoformat(sep=" ", timespec="seconds"),
                "use_llm": use_llm,
                "llm_used": llm_used,
                "llm_model": llm_model,
                "stats": {
                    "records": total_records,
                    "files": len(files),
                    "anomalies": len(anomalies),
                    "start": summary["overview"].get("start"),
                    "end": summary["overview"].get("end"),
                    "parse_errors": parse_errors,
                },
                "warnings": warnings,
                "error": None,
            },
        )
    (run_dir / "report.md").write_text(result.report_markdown, encoding="utf-8")
    (run_dir / "report.html").write_text(
        render_html(result.report_markdown, title=f"LogLens · {run_id}"), encoding="utf-8"
    )

    _write_csv(
        run_dir / "templates.csv",
        ["template_id", "count", "severity", "category", "meaning", "pattern", "sample"],
        [
            (item.template_id, item.count, item.severity, item.category, item.meaning, item.pattern, item.sample)
            for item in collector.ranked()
        ],
    )
    event_rows = store.conn.execute(
        "SELECT ts, event_id, event_name, category, module, file, line_no, message FROM events ORDER BY ts"
    ).fetchall()
    _write_csv(
        run_dir / "events.csv",
        ["ts", "event_id", "event_name", "category", "module", "file", "line_no", "message"],
        [tuple(row) for row in event_rows],
    )

    store.close()
    elapsed = time.time() - started
    logger.info(
        "分析流水线完成 run=%s elapsed=%.1fs output=%s warnings=%s",
        run_id,
        elapsed,
        run_dir,
        len(warnings),
    )
    report_progress("done", 100, f"完成，用时 {elapsed:.1f} 秒")
    return result
