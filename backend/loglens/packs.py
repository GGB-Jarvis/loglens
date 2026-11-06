from __future__ import annotations

import os
import re
import shutil
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field, ValidationError, field_validator

PACKS_DIR = Path(os.getenv("LOGLENS_PACKS_DIR", Path(__file__).resolve().parents[2] / "packs"))
PACK_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
PROTECTED_PACK_IDS = {"generic"}


class IngestConfig(BaseModel):
    include_globs: list[str] = Field(
        default_factory=lambda: ["*.log", "*.log.*", "*.txt", "*.jsonl", "*.out", "*.err"]
    )
    exclude_dirs: list[str] = Field(
        default_factory=lambda: [
            ".git",
            ".venv",
            "node_modules",
            "__pycache__",
            "data",
            "dist",
            "build",
            "target",
        ]
    )
    encodings: list[str] = Field(default_factory=lambda: ["utf-8-sig", "utf-8", "gbk", "latin-1"])
    line_regex: str | None = None
    ts_formats: list[str] = Field(
        default_factory=lambda: [
            "%Y-%m-%d %H:%M:%S.%f",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S",
            "%Y/%m/%d %H:%M:%S",
            "%d/%b/%Y:%H:%M:%S %z",
            "%b %d %H:%M:%S",
        ]
    )
    multiline: bool = True
    max_file_mb: int = 2048

    @field_validator("line_regex")
    @classmethod
    def _valid_regex(cls, value: str | None) -> str | None:
        if value:
            re.compile(value)
        return value


class EventRule(BaseModel):
    id: str
    name: str = ""
    pattern: str
    category: str = "generic"
    level: str | None = None
    module: str | None = None

    @field_validator("pattern")
    @classmethod
    def _valid(cls, value: str) -> str:
        re.compile(value)
        return value


class KpiDef(BaseModel):
    id: str
    name: str = ""
    type: Literal["count", "ratio"] = "count"
    event: str | None = None
    numerator: str | None = None
    denominator: str | None = None
    unit: str = ""
    direction: Literal["up", "down"] = "up"
    description: str = ""


class FaultDef(BaseModel):
    id: str
    name: str = ""
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    patterns: list[str] = Field(default_factory=list)
    hint: str = ""

    @field_validator("patterns")
    @classmethod
    def _valid(cls, values: list[str]) -> list[str]:
        for value in values:
            re.compile(value)
        return values


class Pack(BaseModel):
    id: str
    name: str = ""
    version: str = "1.0"
    description: str = ""
    ingest: IngestConfig = Field(default_factory=IngestConfig)
    events: list[EventRule] = Field(default_factory=list)
    kpis: list[KpiDef] = Field(default_factory=list)
    faults: list[FaultDef] = Field(default_factory=list)
    glossary: dict[str, str] = Field(default_factory=dict)
    prompts: dict[str, str] = Field(default_factory=dict)

    @property
    def event_by_id(self) -> dict[str, EventRule]:
        return {item.id: item for item in self.events}


def load_pack(ref: str | Path) -> Pack:
    path = Path(ref)
    if not path.exists():
        candidate = PACKS_DIR / str(ref) / "pack.yaml"
        if candidate.exists():
            path = candidate
        else:
            fallback = PACKS_DIR / f"{ref}.yaml"
            if fallback.exists():
                path = fallback
            else:
                raise FileNotFoundError(f"domain pack not found: {ref}")
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    pack = Pack(**data)
    if not pack.name:
        pack.name = pack.id
    return pack


def list_packs() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if not PACKS_DIR.exists():
        return items
    for path in sorted(PACKS_DIR.glob("*/pack.yaml")):
        try:
            pack = load_pack(path)
        except (OSError, ValueError, yaml.YAMLError) as exc:  # pragma: no cover - defensive
            items.append({"id": path.parent.name, "name": path.parent.name, "error": str(exc)})
            continue
        items.append(
            {
                "id": pack.id,
                "name": pack.name,
                "version": pack.version,
                "description": pack.description,
                "protected": pack.id in PROTECTED_PACK_IDS,
            }
        )
    return items


class PackValidationError(ValueError):
    def __init__(self, errors: list[str], warnings: list[str] | None = None) -> None:
        super().__init__("；".join(errors))
        self.errors = errors
        self.warnings = warnings or []


def _format_validation_error(exc: ValidationError) -> list[str]:
    messages = []
    for item in exc.errors():
        location = ".".join(str(part) for part in item.get("loc", ())) or "领域包"
        messages.append(f"{location}: {item.get('msg', '格式不正确')}")
    return messages


def _pack_directory(pack_id: str) -> Path:
    if not PACK_ID_RE.fullmatch(pack_id):
        raise PackValidationError(
            ["领域包 ID 只能包含小写字母、数字、-、_，且必须以字母或数字开头，长度不超过 64。"]
        )
    root = PACKS_DIR.resolve()
    directory = (root / pack_id).resolve()
    if directory.parent != root:
        raise PackValidationError(["领域包路径不合法。"])
    return directory


def pack_to_dict(pack: Pack) -> dict[str, Any]:
    return pack.model_dump(mode="json", exclude_none=True)


def pack_yaml(pack: Pack) -> str:
    return yaml.safe_dump(
        pack_to_dict(pack),
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )


def validate_pack(pack: Pack) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not PACK_ID_RE.fullmatch(pack.id):
        errors.append("领域包 ID 只能包含小写字母、数字、-、_，且必须以字母或数字开头。")

    def check_ids(items: list[Any], label: str) -> set[str]:
        seen: set[str] = set()
        for item in items:
            if not item.id.strip():
                errors.append(f"{label}存在空 ID。")
            elif item.id in seen:
                errors.append(f"{label} ID 重复：{item.id}")
            else:
                seen.add(item.id)
        return seen

    event_ids = check_ids(pack.events, "事件")
    check_ids(pack.kpis, "KPI")
    check_ids(pack.faults, "故障")

    if not pack.events:
        warnings.append("未定义事件，计数型 KPI 将无法使用。")
    if not pack.kpis:
        warnings.append("未定义 KPI，报告会缺少业务指标。")
    if not pack.faults:
        warnings.append("未定义故障词典，报告无法按领域分类故障。")
    if not pack.prompts.get("domain_context", "").strip():
        warnings.append("建议填写领域提示词，帮助模型理解业务上下文。")

    for kpi in pack.kpis:
        if kpi.type == "count":
            if not kpi.event:
                errors.append(f"KPI「{kpi.id}」是计数型，必须指定 event。")
            elif kpi.event not in event_ids:
                errors.append(f"KPI「{kpi.id}」引用了不存在的事件：{kpi.event}")
        else:
            if not kpi.numerator or not kpi.denominator:
                errors.append(f"KPI「{kpi.id}」是比率型，必须指定 numerator 和 denominator。")
            for role, event_id in (("numerator", kpi.numerator), ("denominator", kpi.denominator)):
                if event_id and event_id not in event_ids:
                    errors.append(f"KPI「{kpi.id}」的 {role} 引用了不存在的事件：{event_id}")

    for fault in pack.faults:
        if not fault.patterns:
            warnings.append(f"故障「{fault.id}」没有配置匹配模式。")
    return errors, warnings


def parse_pack_payload(data: dict[str, Any]) -> tuple[Pack, list[str]]:
    if not isinstance(data, dict):
        raise PackValidationError(["领域包内容必须是一个 YAML/JSON 对象。"])
    try:
        pack = Pack(**data)
    except ValidationError as exc:
        raise PackValidationError(_format_validation_error(exc)) from exc
    if not pack.name:
        pack.name = pack.id
    errors, warnings = validate_pack(pack)
    if errors:
        raise PackValidationError(errors, warnings)
    return pack, warnings


def save_pack(data: dict[str, Any], pack_id: str | None = None, overwrite: bool = False) -> Pack:
    pack, _ = parse_pack_payload(data)
    if pack_id and pack.id != pack_id:
        raise PackValidationError(["领域包 ID 创建后不可修改。"])
    directory = _pack_directory(pack.id)
    if directory.exists() and not overwrite:
        raise FileExistsError(f"领域包已存在：{pack.id}")
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "pack.yaml").write_text(pack_yaml(pack), encoding="utf-8")
    return pack


def delete_pack(pack_id: str) -> None:
    if pack_id in PROTECTED_PACK_IDS:
        raise PackValidationError([f"默认领域包「{pack_id}」不能删除；可以先复制再修改。"])
    directory = _pack_directory(pack_id)
    if not (directory / "pack.yaml").exists():
        raise FileNotFoundError(f"领域包不存在：{pack_id}")
    shutil.rmtree(directory)


def duplicate_pack(pack_id: str) -> Pack:
    source = load_pack(pack_id)
    base_id = f"{pack_id}-copy"
    new_id = base_id
    index = 2
    while _pack_directory(new_id).exists():
        new_id = f"{base_id}-{index}"
        index += 1
    data = pack_to_dict(source)
    data["id"] = new_id
    data["name"] = f"{source.name or source.id} 副本"
    return save_pack(data, overwrite=False)


def import_pack_yaml(content: str, overwrite: bool = False) -> Pack:
    try:
        data = yaml.safe_load(content) or {}
    except yaml.YAMLError as exc:
        raise PackValidationError([f"YAML 解析失败：{exc}"]) from exc
    if not isinstance(data, dict):
        raise PackValidationError(["YAML 根节点必须是对象。"])
    return save_pack(data, overwrite=overwrite)
