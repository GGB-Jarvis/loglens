from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Iterable, Iterator
from datetime import datetime
from pathlib import Path

from .models import FileInfo, Record, normalize_level
from .packs import Pack

BRACKET_RE = re.compile(
    r"^\[(?P<ts>[^\]]+)\]\s*\[(?P<thread>\d+)\]\s*\[(?P<level>[A-Za-z]+)\]\s*"
    r"\[(?P<module>[^\]]+)\]\s*(?P<message>.*)$"
)
ISO_LEVEL_RE = re.compile(
    r"^(?P<ts>\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?)\s+"
    r"(?P<level>TRACE|DEBUG|INFO|WARN|WARNING|ERROR|CRITICAL|FATAL)\b\s*[-:]?\s*(?P<message>.*)$",
    re.IGNORECASE,
)
KLOG_RE = re.compile(r"^(?P<level>[IWEF])(?P<mmdd>\d{4})\s+(?P<time>\d{2}:\d{2}:\d{2}\.\d+)\s+\d+\s+[^]]+\]\s*(?P<message>.*)$")
SYSLOG_RE = re.compile(
    r"^(?P<ts>[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+\S+\s+(?P<module>[^:\[]+)(?:\[\d+\])?:\s*(?P<message>.*)$"
)
NGINX_RE = re.compile(
    r'^(?P<ip>\S+) \S+ \S+ \[(?P<ts>[^\]]+)\]\s+"(?P<message>[^"]*)"\s+(?P<status>\d{3})\s+(?P<size>\S+)'
)
LOGFMT_LEVEL_RE = re.compile(
    r"\b(?:level|severity|lvl)=(?P<level>trace|debug|info|warn|warning|error|critical|fatal)\b",
    re.IGNORECASE,
)

_TEMPLATE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"), "<uuid>"),
    (
        re.compile(r"\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b"),
        "<timestamp>",
    ),
    (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b"), "<ip>"),
    (re.compile(r"\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b"), "<ip>"),
    (re.compile(r"https?://[^\s\"'<>]+"), "<url>"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "<email>"),
    (re.compile(r"\b(?:0x)?[0-9a-fA-F]{12,}\b"), "<hex>"),
    (re.compile(r"(?<![\w.])(-?\d+(?:\.\d+)?)(?=(?:ms|us|ns|s|m|h|kb|mb|gb|tb|%|px|d)?\b)"), "<num>"),
    (re.compile(r"\"[^\"]*\"|'[^']*'"), "<str>"),
]


def template_of(message: str) -> str:
    text = message.strip()
    for pattern, replacement in _TEMPLATE_PATTERNS:
        text = pattern.sub(replacement, text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:400] or "<empty>"


def template_id_of(pattern: str) -> int:
    digest = hashlib.blake2b(pattern.encode("utf-8", "replace"), digest_size=8).digest()
    return (int.from_bytes(digest, "big") & 0x7FFF_FFFF_FFFF_FFFF) or 1


def _naive(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone().replace(tzinfo=None)
    return value


def _parse_ts(value: str | None, formats: list[str]) -> datetime | None:
    if not value:
        return None
    raw = value.strip().strip("[]")
    if re.fullmatch(r"\d{10}(?:\.\d+)?", raw):
        return _naive(datetime.fromtimestamp(float(raw)))
    if re.fullmatch(r"\d{13}", raw):
        return _naive(datetime.fromtimestamp(int(raw) / 1000))
    normalized = raw.replace(",", ".")
    candidates = [normalized, normalized.replace("Z", "+00:00")]
    for candidate in candidates:
        try:
            return _naive(datetime.fromisoformat(candidate))
        except ValueError:
            pass
    for fmt in formats:
        try:
            parsed = datetime.strptime(normalized, fmt)
            if "%Y" not in fmt:
                parsed = parsed.replace(year=datetime.now().year)
            return _naive(parsed)
        except ValueError:
            continue
    return None


def _json_record(text: str, pack: Pack) -> dict[str, str] | None:
    if not text.lstrip().startswith("{"):
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    nested = data.get("log") if isinstance(data.get("log"), dict) else {}
    ts = data.get("timestamp") or data.get("ts") or data.get("time") or data.get("@timestamp") or nested.get("timestamp")
    level = data.get("level") or data.get("severity") or data.get("lvl") or nested.get("level")
    module = (
        data.get("module")
        or data.get("logger")
        or data.get("source")
        or data.get("service")
        or nested.get("logger")
        or "-"
    )
    message = data.get("message") or data.get("msg") or data.get("event") or nested.get("message") or text
    return {
        "ts": str(ts) if ts is not None else "",
        "level": str(level) if level is not None else "",
        "module": str(module),
        "thread": str(data.get("thread") or data.get("pid") or ""),
        "message": str(message),
    }


def parse_line(text: str, pack: Pack, custom_re: re.Pattern[str] | None) -> dict[str, str] | None:
    if custom_re is not None:
        match = custom_re.match(text)
        if match:
            groups = match.groupdict()
            return {
                "ts": groups.get("ts") or "",
                "level": groups.get("level") or "",
                "module": groups.get("module") or "-",
                "thread": groups.get("thread") or "",
                "message": groups.get("message") or text,
            }
    parsed = _json_record(text, pack)
    if parsed:
        return parsed
    match = BRACKET_RE.match(text)
    if match:
        return match.groupdict()
    match = ISO_LEVEL_RE.match(text)
    if match:
        groups = match.groupdict()
        groups["module"] = groups.get("module") or "-"
        groups["thread"] = groups.get("thread") or ""
        return groups
    match = KLOG_RE.match(text)
    if match:
        level = {"I": "info", "W": "warn", "E": "error", "F": "critical"}.get(match.group("level"), "info")
        return {
            "ts": f"{datetime.now().year}-{match.group('mmdd')[:2]}-{match.group('mmdd')[2:]} {match.group('time')}",
            "level": level,
            "module": "klog",
            "thread": "",
            "message": match.group("message"),
        }
    match = NGINX_RE.match(text)
    if match:
        status = int(match.group("status"))
        level = "error" if status >= 500 else ("warn" if status >= 400 else "info")
        return {
            "ts": match.group("ts"),
            "level": level,
            "module": "http",
            "thread": "",
            "message": f'{match.group("message")} -> {status}',
        }
    match = SYSLOG_RE.match(text)
    if match:
        groups = match.groupdict()
        groups["level"] = ""
        groups["thread"] = ""
        return groups
    level_match = LOGFMT_LEVEL_RE.search(text)
    return {
        "ts": "",
        "level": level_match.group("level") if level_match else "",
        "module": "-",
        "thread": "",
        "message": text,
    }


def sniff_encoding(path: Path, encodings: list[str]) -> tuple[str, int]:
    """Return (encoding, bytes_read) using a sample of the file."""
    sample = path.open("rb").read(64 * 1024)
    for encoding in encodings:
        try:
            sample.decode(encoding)
            return encoding, len(sample)
        except (UnicodeDecodeError, LookupError):
            continue
    return "latin-1", len(sample)


def iter_file_records(
    path: Path,
    rel_path: str,
    info: FileInfo,
    pack: Pack,
    custom_re: re.Pattern[str] | None,
) -> Iterator[Record]:
    encoding = info.encoding
    buffer_text: list[str] = []
    buffer_start = 0

    def flush() -> Iterator[Record]:
        nonlocal buffer_text, buffer_start
        if not buffer_text:
            return
        raw = "\n".join(buffer_text)
        first_line = buffer_text[0]
        parsed = parse_line(first_line, pack, custom_re) or {}
        ts = _parse_ts(parsed.get("ts"), pack.ingest.ts_formats)
        message = parsed.get("message") or first_line
        if len(buffer_text) > 1:
            message = message + "\n" + "\n".join(buffer_text[1:])
        if ts is None:
            info.parse_errors += 1
        record = Record(
            ts=ts,
            level=normalize_level(parsed.get("level"), message),
            module=(parsed.get("module") or "-")[:120],
            thread=str(parsed.get("thread") or ""),
            message=message[:8000],
            raw=raw[:20000],
            file=rel_path,
            line_no=buffer_start,
        )
        buffer_text = []
        buffer_start = 0
        yield record

    with path.open("r", encoding=encoding, errors="replace") as handle:
        for line_no, line in enumerate(handle, start=1):
            line = line.rstrip("\n").rstrip("\r")
            info.lines += 1
            if not line.strip():
                continue
            is_continuation = line[:1].isspace() and buffer_text and pack.ingest.multiline
            if is_continuation:
                buffer_text.append(line)
                continue
            for record in flush():
                yield record
            buffer_text = [line]
            buffer_start = line_no
    for record in flush():
        yield record


def discover(paths: Iterable[str | Path], pack: Pack) -> list[Path]:
    roots = [Path(item).expanduser().resolve() for item in paths]
    found: list[Path] = []
    for root in roots:
        if root.is_file():
            found.append(root)
            continue
        if not root.exists():
            continue
        for pattern in pack.ingest.include_globs:
            for path in root.rglob(pattern):
                if not path.is_file():
                    continue
                try:
                    relative_parts = path.relative_to(root).parts[:-1]
                except ValueError:
                    relative_parts = path.parts[:-1]
                if any(part in pack.ingest.exclude_dirs for part in relative_parts):
                    continue
                if path.stat().st_size > pack.ingest.max_file_mb * 1024 * 1024:
                    continue
                if path not in found:
                    found.append(path)
    return sorted(found)


def first_timestamp_hint(path: Path, encoding: str, pack: Pack, custom_re: re.Pattern[str] | None) -> datetime | None:
    try:
        with path.open("r", encoding=encoding, errors="replace") as handle:
            for _, line in zip(range(60), handle):
                parsed = parse_line(line.rstrip("\n"), pack, custom_re)
                if not parsed:
                    continue
                ts = _parse_ts(parsed.get("ts"), pack.ingest.ts_formats)
                if ts is not None:
                    return ts
    except OSError:
        return None
    return None


def line_hash(record: Record) -> int:
    stamp = record.ts.isoformat() if record.ts else "none"
    payload = f"{stamp}\x1f{record.file.rsplit('/', 1)[-1]}\x1f{record.raw}".encode("utf-8", "replace")
    return int.from_bytes(hashlib.blake2b(payload, digest_size=8).digest(), "big")


def make_custom_regex(pack: Pack) -> re.Pattern[str] | None:
    if not pack.ingest.line_regex:
        return None
    return re.compile(pack.ingest.line_regex)
