from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

LEVEL_ORDER = {
    "trace": 0,
    "debug": 1,
    "info": 2,
    "warn": 3,
    "warning": 3,
    "error": 4,
    "critical": 5,
    "fatal": 5,
}

LEVEL_ALIASES = {
    "w": "warn",
    "warning": "warn",
    "err": "error",
    "eror": "error",
    "fatal": "critical",
    "panic": "critical",
    "severe": "error",
    "notice": "info",
    "verbose": "trace",
}


def normalize_level(value: str | None, message: str = "") -> str:
    if value:
        candidate = value.strip().lower()
        candidate = LEVEL_ALIASES.get(candidate, candidate)
        if candidate in LEVEL_ORDER:
            return candidate
    lowered = message.lower()
    for level, needle in (
        ("critical", "fatal"),
        ("error", "exception"),
        ("error", " error"),
        ("warn", "warning"),
    ):
        if needle in lowered:
            return level
    return "info"


@dataclass(slots=True)
class Record:
    ts: datetime | None
    level: str
    module: str
    thread: str
    message: str
    raw: str
    file: str
    line_no: int
    template_id: int = 0
    template: str = ""


@dataclass(slots=True)
class FileInfo:
    rel_path: str
    size: int
    encoding: str
    first_ts: datetime | None = None
    last_ts: datetime | None = None
    lines: int = 0
    records: int = 0
    parse_errors: int = 0
    duplicates: int = 0
    truncated: bool = False


@dataclass
class TemplateInfo:
    template_id: int
    pattern: str
    sample: str
    count: int = 0
    first_ts: datetime | None = None
    last_ts: datetime | None = None
    levels: dict[str, int] = field(default_factory=dict)
    modules: dict[str, int] = field(default_factory=dict)
    severity: str = "info"
    category: str = "generic"
    meaning: str = ""


@dataclass
class AnalysisResult:
    run_id: str
    pack: str
    out_dir: str
    files: list[FileInfo]
    records: int
    parse_errors: int
    start: datetime | None
    end: datetime | None
    summary: dict[str, Any] = field(default_factory=dict)
    anomalies: list[dict[str, Any]] = field(default_factory=list)
    evidence: dict[str, Any] = field(default_factory=dict)
    findings: dict[str, Any] | None = None
    report_markdown: str = ""
    warnings: list[str] = field(default_factory=list)
    llm_used: bool = False
    llm_model: str | None = None
