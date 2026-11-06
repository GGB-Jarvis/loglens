from __future__ import annotations

import json
import statistics
from collections.abc import Iterable
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import duckdb

from .models import LEVEL_ORDER, FileInfo, Record, TemplateInfo
from .packs import Pack

SEVERITY_WEIGHT = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def _jsonable(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat(sep=" ") if isinstance(value, datetime) else value.isoformat()
    if isinstance(value, timedelta):
        return value.total_seconds()
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return value


def _median(values: list[float]) -> float:
    return float(statistics.median(values)) if values else 0.0


def _mad(values: list[float], center: float) -> float:
    if not values:
        return 0.0
    return float(statistics.median([abs(value - center) for value in values]))


def _robust_z(value: float, values: list[float]) -> float:
    center = _median(values)
    mad = _mad(values, center)
    if mad > 0:
        return 0.6745 * (value - center) / mad
    stdev = statistics.pstdev(values) if len(values) > 1 else 0.0
    if stdev > 0:
        return (value - center) / stdev
    return 0.0 if value <= center else 10.0


class LogStore:
    """DuckDB-backed storage for one analysis run."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.conn = duckdb.connect(str(db_path))
        self._create_schema()

    def _create_schema(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS records (
                ts TIMESTAMP,
                date DATE,
                level VARCHAR,
                module VARCHAR,
                thread VARCHAR,
                message VARCHAR,
                raw VARCHAR,
                file VARCHAR,
                line_no INTEGER,
                template_id BIGINT,
                template VARCHAR
            );
            CREATE TABLE IF NOT EXISTS templates (
                template_id BIGINT,
                pattern VARCHAR,
                sample VARCHAR,
                count BIGINT,
                first_ts TIMESTAMP,
                last_ts TIMESTAMP,
                levels VARCHAR,
                modules VARCHAR,
                severity VARCHAR,
                category VARCHAR,
                meaning VARCHAR
            );
            CREATE TABLE IF NOT EXISTS events (
                ts TIMESTAMP,
                date DATE,
                event_id VARCHAR,
                event_name VARCHAR,
                category VARCHAR,
                module VARCHAR,
                file VARCHAR,
                line_no INTEGER,
                message VARCHAR
            );
            CREATE TABLE IF NOT EXISTS faults (
                ts TIMESTAMP,
                date DATE,
                fault_id VARCHAR,
                fault_name VARCHAR,
                severity VARCHAR,
                module VARCHAR,
                file VARCHAR,
                line_no INTEGER,
                message VARCHAR
            );
            """
        )

    def close(self) -> None:
        self.conn.close()

    def insert_batch(
        self,
        records: list[Record],
        events: list[tuple],
        faults: list[tuple],
    ) -> None:
        if records:
            self._insert_rows(
                "records",
                [
                    "ts", "date", "level", "module", "thread", "message", "raw",
                    "file", "line_no", "template_id", "template",
                ],
                [
                    (
                        record.ts,
                        record.ts.date() if record.ts else None,
                        record.level,
                        record.module,
                        record.thread,
                        record.message[:8000],
                        record.raw[:20000],
                        record.file,
                        record.line_no,
                        record.template_id,
                        record.template,
                    )
                    for record in records
                ],
            )
        if events:
            self._insert_rows(
                "events",
                ["ts", "date", "event_id", "event_name", "category", "module", "file", "line_no", "message"],
                events,
            )
        if faults:
            self._insert_rows(
                "faults",
                ["ts", "date", "fault_id", "fault_name", "severity", "module", "file", "line_no", "message"],
                faults,
            )

    def _insert_rows(self, table: str, columns: list[str], rows: list[tuple], chunk: int = 300) -> None:
        """Multi-row VALUES insert: DuckDB's executemany is row-by-row and much slower."""
        for start in range(0, len(rows), chunk):
            part = rows[start : start + chunk]
            placeholders = ", ".join(
                "(" + ", ".join("?" for _ in columns) + ")" for _ in part
            )
            sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES {placeholders}"
            self.conn.execute(sql, [value for row in part for value in row])

    def insert_templates(self, templates: Iterable[TemplateInfo]) -> None:
        rows = [
            (
                item.template_id,
                item.pattern,
                item.sample,
                item.count,
                item.first_ts,
                item.last_ts,
                json.dumps(item.levels, ensure_ascii=False),
                json.dumps(item.modules, ensure_ascii=False),
                item.severity,
                item.category,
                item.meaning,
            )
            for item in templates
        ]
        if rows:
            self._insert_rows(
                "templates",
                [
                    "template_id", "pattern", "sample", "count", "first_ts", "last_ts",
                    "levels", "modules", "severity", "category", "meaning",
                ],
                rows,
            )


class Analyzer:
    def __init__(self, store: LogStore, pack: Pack, files: list[FileInfo], warnings: list[str]) -> None:
        self.store = store
        self.conn = store.conn
        self.pack = pack
        self.files = files
        self.warnings = warnings

    # ---------------------------------------------------------------- summary
    def compute_summary(self, total_records: int, parse_errors: int) -> dict[str, Any]:
        conn = self.conn
        start, end = conn.execute("SELECT min(ts), max(ts) FROM records").fetchone()
        counts = dict(conn.execute("SELECT level, count(*) FROM records GROUP BY 1").fetchall())
        level_counts = {level: int(counts.get(level, 0)) for level in LEVEL_ORDER}
        errors = level_counts.get("error", 0) + level_counts.get("critical", 0)
        warns = level_counts.get("warn", 0)

        daily_rows = conn.execute(
            """
            SELECT CAST(date AS VARCHAR) AS day, count(*) AS total,
                   sum(CASE WHEN level IN ('error','critical') THEN 1 ELSE 0 END) AS errors,
                   sum(CASE WHEN level = 'warn' THEN 1 ELSE 0 END) AS warns,
                   sum(CASE WHEN level = 'info' THEN 1 ELSE 0 END) AS info
            FROM records WHERE date IS NOT NULL GROUP BY 1 ORDER BY 1
            """
        ).fetchall()
        daily = [
            {"date": row[0], "total": int(row[1]), "errors": int(row[2]), "warns": int(row[3]), "info": int(row[4])}
            for row in daily_rows
        ]

        hourly_rows = conn.execute(
            """
            SELECT strftime(date_trunc('hour', ts), '%Y-%m-%d %H:00') AS bucket,
                   count(*) AS total,
                   sum(CASE WHEN level IN ('error','critical') THEN 1 ELSE 0 END) AS errors
            FROM records WHERE ts IS NOT NULL GROUP BY 1 ORDER BY 1
            """
        ).fetchall()
        hourly = [{"bucket": row[0], "total": int(row[1]), "errors": int(row[2])} for row in hourly_rows]

        top_templates = [
            {
                "template_id": int(row[0]),
                "count": int(row[1]),
                "pattern": row[2],
                "sample": row[3],
                "severity": row[4],
                "modules": json.loads(row[5] or "{}"),
                "category": row[6],
                "meaning": row[7],
            }
            for row in conn.execute(
                """
                SELECT template_id, count, pattern, sample, severity, modules, category, meaning
                FROM templates ORDER BY count DESC LIMIT 20
                """
            ).fetchall()
        ]

        top_faults = [
            {
                "fault_id": row[0],
                "name": row[1],
                "severity": row[2],
                "count": int(row[3]),
                "modules": row[4],
            }
            for row in conn.execute(
                """
                SELECT fault_id, any_value(fault_name), any_value(severity), count(*),
                       string_agg(DISTINCT module, ', ')
                FROM faults GROUP BY fault_id ORDER BY count(*) DESC LIMIT 15
                """
            ).fetchall()
        ]

        top_modules = [
            {"module": row[0], "count": int(row[1])}
            for row in conn.execute(
                """
                SELECT module, count(*) FROM records
                WHERE level IN ('error','critical') GROUP BY 1 ORDER BY 2 DESC LIMIT 12
                """
            ).fetchall()
        ]

        kpis: list[dict[str, Any]] = []
        for definition in self.pack.kpis:
            kpis.append(self._compute_kpi(definition.id, definition.name, definition.type, definition.event,
                                          definition.numerator, definition.denominator, definition.unit,
                                          definition.direction))

        event_counts = [
            {"event_id": row[0], "name": row[1], "count": int(row[2])}
            for row in conn.execute(
                "SELECT event_id, any_value(event_name), count(*) FROM events GROUP BY 1 ORDER BY 3 DESC"
            ).fetchall()
        ]

        duration_hours = None
        if start and end:
            duration_hours = round((end - start).total_seconds() / 3600, 2)

        parse_rate = round(total_records / (total_records + parse_errors), 5) if total_records + parse_errors else 0.0

        return _jsonable(
            {
                "overview": {
                    "records": total_records,
                    "files": len(self.files),
                    "parse_errors": parse_errors,
                    "parse_rate": parse_rate,
                    "start": start,
                    "end": end,
                    "duration_hours": duration_hours,
                    "errors": errors,
                    "warnings": warns,
                    "error_rate": round(errors / total_records, 5) if total_records else 0.0,
                    "levels": level_counts,
                    "modules": len({item["module"] for item in top_modules}),
                },
                "daily": daily,
                "hourly": hourly,
                "kpis": kpis,
                "events": event_counts,
                "top_templates": top_templates,
                "top_faults": top_faults,
                "top_error_modules": top_modules,
                "files": [
                    {
                        "path": item.rel_path,
                        "size": item.size,
                        "encoding": item.encoding,
                        "lines": item.lines,
                        "records": item.records,
                        "parse_errors": item.parse_errors,
                        "duplicates": item.duplicates,
                        "first_ts": _jsonable(item.first_ts),
                        "last_ts": _jsonable(item.last_ts),
                    }
                    for item in self.files
                ],
            }
        )

    def _compute_kpi(
        self,
        kpi_id: str,
        name: str,
        kind: str,
        event: str | None,
        numerator: str | None,
        denominator: str | None,
        unit: str,
        direction: str = "up",
    ) -> dict[str, Any]:
        conn = self.conn
        if kind == "ratio":
            num_rows = dict(
                conn.execute(
                    "SELECT CAST(date AS VARCHAR), count(*) FROM events WHERE event_id = ? AND date IS NOT NULL GROUP BY 1",
                    [numerator],
                ).fetchall()
            )
            den_rows = dict(
                conn.execute(
                    "SELECT CAST(date AS VARCHAR), count(*) FROM events WHERE event_id = ? AND date IS NOT NULL GROUP BY 1",
                    [denominator],
                ).fetchall()
            )
            days = sorted(set(num_rows) | set(den_rows))
            series = []
            for day in days:
                den = int(den_rows.get(day, 0))
                num = int(num_rows.get(day, 0))
                value = round(num / den, 5) if den else None
                series.append({"date": day, "value": value, "numerator": num, "denominator": den})
            return {
                "id": kpi_id,
                "name": name or kpi_id,
                "type": "ratio",
                "unit": unit or "%",
                "direction": direction,
                "series": series,
                "total": None,
            }
        rows = conn.execute(
            "SELECT CAST(date AS VARCHAR), count(*) FROM events WHERE event_id = ? AND date IS NOT NULL GROUP BY 1 ORDER BY 1",
            [event],
        ).fetchall()
        series = [{"date": row[0], "value": int(row[1])} for row in rows]
        return {
            "id": kpi_id,
            "name": name or kpi_id,
            "type": "count",
            "unit": unit,
            "direction": direction,
            "series": series,
            "total": sum(item["value"] for item in series),
        }

    # -------------------------------------------------------------- anomalies
    def detect_anomalies(self) -> list[dict[str, Any]]:
        anomalies: list[dict[str, Any]] = []
        anomalies.extend(self._error_bursts())
        anomalies.extend(self._template_spikes())
        anomalies.extend(self._kpi_drops())
        anomalies.extend(self._new_patterns())
        anomalies.sort(key=lambda item: (SEVERITY_WEIGHT.get(item["severity"], 0), item.get("score") or 0), reverse=True)
        for index, item in enumerate(anomalies, start=1):
            item["id"] = f"A{index}"
        return anomalies

    def _error_bursts(self) -> list[dict[str, Any]]:
        span = self.conn.execute(
            "SELECT min(ts), max(ts) FROM records WHERE level IN ('error','critical') AND ts IS NOT NULL"
        ).fetchone()
        if not span or span[0] is None or span[1] is None:
            return []
        rows = self.conn.execute(
            """
            SELECT time_bucket(INTERVAL '5 minutes', ts) AS bucket,
                   count(*) AS c, arg_min(file, ts) AS file, arg_min(line_no, ts) AS line
            FROM records
            WHERE level IN ('error','critical') AND ts IS NOT NULL
            GROUP BY 1 ORDER BY 1
            """
        ).fetchall()
        if not rows:
            return []
        by_bucket = {row[0]: row for row in rows}
        grid: list[datetime] = []
        cursor = span[0].replace(second=0, microsecond=0)
        cursor -= timedelta(minutes=cursor.minute % 5)
        while cursor <= span[1]:
            grid.append(cursor)
            cursor += timedelta(minutes=5)
        counts = [int(by_bucket[item][1]) if item in by_bucket else 0 for item in grid]
        center = _median(counts)
        flagged: list[tuple[datetime, int, float, tuple | None]] = []
        for bucket, count in zip(grid, counts):
            if count <= 0:
                continue
            z = _robust_z(count, counts)
            if z >= 3.5 and count >= max(5, center * 3):
                flagged.append((bucket, count, z, by_bucket.get(bucket)))

        # Merge adjacent 5-minute buckets into one incident so the report does not
        # repeat the same outage as five separate findings.
        groups: list[list[tuple[datetime, int, float, tuple | None]]] = []
        for item in flagged:
            if groups and item[0] - groups[-1][-1][0] <= timedelta(minutes=10):
                groups[-1].append(item)
            else:
                groups.append([item])

        results = []
        for group in groups:
            first_bucket = group[0][0]
            last_bucket = group[-1][0] + timedelta(minutes=5)
            total = sum(item[1] for item in group)
            peak = max(group, key=lambda item: item[1])
            minutes = int((last_bucket - first_bucket).total_seconds() // 60)
            source = peak[3]
            results.append(
                {
                    "kind": "error_burst",
                    "severity": "high" if peak[2] >= 6 else "medium",
                    "title": f"错误突发：{minutes} 分钟内出现 {total} 个错误",
                    "detail": (
                        f"在 {first_bucket} 至 {last_bucket} 之间有 {total} 条 error/critical 记录；"
                        f"最繁忙的 5 分钟分桶有 {peak[1]} 个错误（稳健 z={peak[2]:.1f}，"
                        f"中位数分桶 {center:.0f}）。"
                    ),
                    "window": {"from": _jsonable(first_bucket), "to": _jsonable(last_bucket)},
                    "score": round(peak[2], 2),
                    "observed": total,
                    "baseline": round(center, 2),
                    "citations": [f"{source[2]}:{source[3]}"] if source else [],
                }
            )
        return sorted(results, key=lambda item: item["score"], reverse=True)[:5]

    def _template_spikes(self) -> list[dict[str, Any]]:
        span = self.conn.execute("SELECT min(ts), max(ts) FROM records WHERE ts IS NOT NULL").fetchone()
        if not span or span[0] is None or span[1] is None:
            return []
        rows = self.conn.execute(
            """
            SELECT template_id, any_value(template) AS pattern, date_trunc('hour', ts) AS bucket, count(*) AS c,
                   arg_min(file, ts) AS file, arg_min(line_no, ts) AS line
            FROM records
            WHERE ts IS NOT NULL AND level IN ('error','critical','warn')
            GROUP BY 1, 3 ORDER BY 1, 3
            """
        ).fetchall()
        by_template: dict[int, dict[datetime, tuple]] = {}
        for row in rows:
            by_template.setdefault(int(row[0]), {})[row[2]] = row

        hours: list[datetime] = []
        cursor = span[0].replace(minute=0, second=0, microsecond=0)
        while cursor <= span[1]:
            hours.append(cursor)
            cursor += timedelta(hours=1)
        if not hours:
            return []

        results = []
        for template_id, buckets in by_template.items():
            total = sum(int(item[3]) for item in buckets.values())
            if total < 15:
                continue
            counts = [int(buckets[item][3]) if item in buckets else 0 for item in hours]
            center = _median(counts)
            peak_index = max(range(len(counts)), key=lambda index: counts[index])
            peak_count = counts[peak_index]
            if peak_count < max(5, center * 4):
                continue
            z = _robust_z(peak_count, counts)
            if z < 3:
                continue
            peak = buckets[hours[peak_index]]
            results.append(
                {
                    "kind": "template_spike",
                    "severity": "high" if peak_count >= 50 else "medium",
                    "title": f"模板突增：一小时内出现 {peak_count} 次",
                    "detail": (
                        f"模板 `{peak[1][:160]}` 在 {peak[2]} 出现 {peak_count} 次"
                        f"（每小时中位数 {center:.0f}，总计 {total}）。"
                    ),
                    "window": {"from": _jsonable(peak[2]), "to": _jsonable(peak[2] + timedelta(hours=1))},
                    "score": round(z, 2),
                    "observed": peak_count,
                    "baseline": round(center, 2),
                    "citations": [f"{peak[4]}:{peak[5]}"],
                    "template_id": template_id,
                }
            )
        return sorted(results, key=lambda item: item["score"], reverse=True)[:5]

    def _kpi_drops(self) -> list[dict[str, Any]]:
        results = []
        for definition in self.pack.kpis:
            if definition.type != "ratio":
                continue
            kpi = self._compute_kpi(
                definition.id,
                definition.name,
                definition.type,
                definition.event,
                definition.numerator,
                definition.denominator,
                definition.unit,
                definition.direction,
            )
            series = [item for item in kpi["series"] if item["value"] is not None and item["denominator"] >= 10]
            if len(series) < 3:
                continue
            values = [float(item["value"]) for item in series]
            center = _median(values)
            if center <= 0:
                center = statistics.fmean(values)
            if center <= 0:
                continue
            for item in series:
                value = float(item["value"])
                if definition.direction == "up":
                    bad = value <= center * 0.5 and center - value >= 0.1
                    label = "下降"
                else:
                    bad = value >= max(center * 2, center + 0.05) and value >= 0.05
                    label = "上升"
                if not bad:
                    continue
                sample = self.conn.execute(
                    """
                    SELECT file, line_no FROM records
                    WHERE CAST(date AS VARCHAR) = ? AND level IN ('error','critical')
                    ORDER BY ts LIMIT 1
                    """,
                    [item["date"]],
                ).fetchone()
                results.append(
                    {
                        "kind": "kpi_deviation",
                        "severity": "high",
                        "title": f"{kpi['name']}于 {item['date']} {label}",
                        "detail": (
                            f"{kpi['name']} = {value:.2%}，中位数 {center:.2%}"
                            f"（{item['numerator']}/{item['denominator']}）。"
                        ),
                        "window": {"from": item["date"], "to": item["date"]},
                        "score": round(abs(value - center) * 100, 2),
                        "observed": value,
                        "baseline": round(center, 4),
                        "citations": [f"{sample[0]}:{sample[1]}"] if sample else [],
                    }
                )
        return results[:5]

    def _new_patterns(self) -> list[dict[str, Any]]:
        span = self.conn.execute("SELECT min(ts), max(ts) FROM records WHERE ts IS NOT NULL").fetchone()
        if not span or not span[0] or not span[1]:
            return []
        cutoff = span[0] + (span[1] - span[0]) * 0.7
        rows = self.conn.execute(
            """
            SELECT template_id, any_value(template) AS pattern, min(ts) AS first_ts, count(*) AS c,
                   arg_min(file, ts) AS file, arg_min(line_no, ts) AS line
            FROM records WHERE ts IS NOT NULL AND level IN ('error','critical','warn')
            GROUP BY 1
            HAVING min(ts) >= ? AND count(*) >= 10
            ORDER BY c DESC LIMIT 5
            """,
            [cutoff],
        ).fetchall()
        return [
            {
                "kind": "new_pattern",
                "severity": "low",
                "title": f"观测窗口后期出现新模板（{int(row[3])} 次）",
                "detail": f"模板 `{row[1][:160]}` 首次出现于 {row[2]}。",
                "window": {"from": _jsonable(row[2]), "to": _jsonable(span[1])},
                "score": float(row[3]),
                "observed": int(row[3]),
                "baseline": 0,
                "citations": [f"{row[4]}:{row[5]}"],
                "template_id": int(row[0]),
            }
            for row in rows
        ]

    # ------------------------------------------------------------------ query
    def query_logs(
        self,
        query: str | None = None,
        level: str | None = None,
        template_id: int | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        where = []
        params: list[Any] = []
        if query:
            where.append("(message ILIKE ? OR module ILIKE ?)")
            params.extend([f"%{query}%", f"%{query}%"])
        if level:
            where.append("level = ?")
            params.append(level)
        if template_id:
            where.append("template_id = ?")
            params.append(template_id)
        clause = ("WHERE " + " AND ".join(where)) if where else ""
        total = self.conn.execute(f"SELECT count(*) FROM records {clause}", params).fetchone()[0]
        rows = self.conn.execute(
            f"""
            SELECT ts, level, module, thread, message, raw, file, line_no, template_id
            FROM records {clause}
            ORDER BY ts DESC NULLS LAST, line_no DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        ).fetchall()
        return {
            "total": int(total),
            "items": [
                {
                    "ts": _jsonable(row[0]),
                    "level": row[1],
                    "module": row[2],
                    "thread": row[3],
                    "message": row[4],
                    "raw": row[5],
                    "file": row[6],
                    "line": row[7],
                    "template_id": row[8],
                    "citation": f"{row[6]}:{row[7]}",
                }
                for row in rows
            ],
        }


def build_evidence(
    run_meta: dict[str, Any],
    summary: dict[str, Any],
    anomalies: list[dict[str, Any]],
) -> dict[str, Any]:
    facts: list[dict[str, Any]] = []
    citations: dict[str, list[str]] = {}
    facts.append(
        {
            "id": "E1",
            "kind": "overview",
            "records": summary["overview"]["records"],
            "files": summary["overview"]["files"],
            "time_range": [summary["overview"]["start"], summary["overview"]["end"]],
            "errors": summary["overview"]["errors"],
            "warnings": summary["overview"]["warnings"],
            "error_rate": summary["overview"]["error_rate"],
            "parse_rate": summary["overview"]["parse_rate"],
        }
    )
    for kpi in summary.get("kpis", []):
        if kpi["type"] == "ratio":
            series = [item for item in kpi["series"] if item["value"] is not None]
            if not series:
                continue
            facts.append(
                {
                    "id": f"E{len(facts) + 1}",
                    "kind": "kpi",
                    "name": kpi["name"],
                    "unit": kpi["unit"],
                    "series": series,
                    "median": round(_median([float(item["value"]) for item in series]), 4),
                }
            )
    for item in anomalies:
        fact_id = f"E{len(facts) + 1}"
        facts.append(
            {
                "id": fact_id,
                "kind": item["kind"],
                "severity": item["severity"],
                "title": item["title"],
                "detail": item["detail"],
                "window": item["window"],
                "score": item.get("score"),
                "observed": item.get("observed"),
                "baseline": item.get("baseline"),
                "template_id": item.get("template_id"),
            }
        )
        if item.get("citations"):
            citations[fact_id] = item["citations"]

    top_templates = summary.get("top_templates", [])[:12]
    for template in top_templates:
        if template["severity"] not in ("error", "critical", "warn"):
            continue
        fact_id = f"E{len(facts) + 1}"
        facts.append(
            {
                "id": fact_id,
                "kind": "template",
                "template_id": template["template_id"],
                "pattern": template["pattern"],
                "count": template["count"],
                "severity": template["severity"],
            }
        )

    timeline = []
    for item in anomalies:
        timeline.append(
            {
                "ts": item["window"]["from"],
                "event": item["kind"],
                "title": item["title"],
                "severity": item["severity"],
            }
        )
    timeline.sort(key=lambda item: str(item["ts"]))

    return _jsonable(
        {
            "run": run_meta,
            "facts": facts,
            "timeline": timeline,
            "citations": citations,
            "method": {
                "templating": "dynamic-token masking (UUID, IP, URL, number, quoted string)",
                "anomaly": "robust z-score over 5-minute error buckets and hourly template counts",
                "baseline": "median / MAD within the analysed window",
            },
        }
    )
