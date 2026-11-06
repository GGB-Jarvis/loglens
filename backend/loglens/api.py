from __future__ import annotations

import io
import json
import os
import re
import shutil
import tempfile
import threading
import traceback
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Any

import duckdb
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    FileResponse,
    JSONResponse,
    PlainTextResponse,
    StreamingResponse,
)
from pydantic import BaseModel

from . import __version__
from .llm import (
    LLMConfig,
    LLMError,
    clear_settings,
    read_settings,
    settings_path,
    test_connection,
    write_settings,
)
from .log import configure_logging, get_logger
from .opencode import detect_opencode_go
from .pack_ai import PackGenerationError, generate_pack_from_logs
from .packs import (
    PACK_ID_RE,
    PROTECTED_PACK_IDS,
    PackValidationError,
    delete_pack,
    duplicate_pack,
    import_pack_yaml,
    list_packs,
    load_pack,
    pack_to_dict,
    pack_yaml,
    parse_pack_payload,
    save_pack,
)
from .pipeline import analyze

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("LOGLENS_DATA_DIR", ROOT / "data"))
os.environ.setdefault("LOGLENS_DATA_DIR", str(DATA_DIR))
RUNS_DIR = DATA_DIR / "runs"
RUNS_DIR.mkdir(parents=True, exist_ok=True)
LOG_PATH = configure_logging()
logger = get_logger("api")
logger.info(
    "LogLens v%s API 启动 data_dir=%s packs_dir=%s log=%s",
    __version__,
    DATA_DIR,
    os.getenv("LOGLENS_PACKS_DIR", ROOT / "packs"),
    LOG_PATH,
)

app = FastAPI(title="LogLens", version=__version__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="loglens")
_lock = threading.Lock()


def _now() -> str:
    return datetime.now().isoformat(sep=" ", timespec="seconds")


class RunStore:
    def __init__(self, root: Path) -> None:
        self.root = root

    def path(self, run_id: str) -> Path:
        return self.root / run_id

    def create(self, name: str, pack: str, use_llm: bool) -> dict[str, Any]:
        run_id = datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]
        directory = self.path(run_id)
        (directory / "uploads").mkdir(parents=True, exist_ok=True)
        meta = {
            "id": run_id,
            "name": name or run_id,
            "pack": pack,
            "status": "queued",
            "progress": 0,
            "stage": "queued",
            "message": "等待工作线程",
            "created_at": _now(),
            "started_at": None,
            "finished_at": None,
            "use_llm": use_llm,
            "llm_used": False,
            "llm_model": None,
            "stats": {},
            "warnings": [],
            "error": None,
        }
        self.write(run_id, meta)
        return meta

    def write(self, run_id: str, meta: dict[str, Any]) -> None:
        directory = self.path(run_id)
        directory.mkdir(parents=True, exist_ok=True)
        tmp = directory / "meta.json.tmp"
        tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(directory / "meta.json")

    def update(self, run_id: str, **fields: Any) -> dict[str, Any]:
        with _lock:
            meta = self.get(run_id) or {"id": run_id}
            meta.update(fields)
            self.write(run_id, meta)
            return meta

    def get(self, run_id: str) -> dict[str, Any] | None:
        path = self.path(run_id) / "meta.json"
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None

    def list(self) -> list[dict[str, Any]]:
        items = []
        for path in self.root.glob("*/meta.json"):
            try:
                items.append(json.loads(path.read_text(encoding="utf-8")))
            except (json.JSONDecodeError, OSError):
                continue
        return sorted(items, key=lambda item: item.get("created_at") or "", reverse=True)

    def summary(self, run_id: str) -> dict[str, Any] | None:
        path = self.path(run_id) / "summary.json"
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None


store = RunStore(RUNS_DIR)


def _safe_name(value: str) -> str:
    name = Path(value.replace("\\", "/")).name
    return "".join(char for char in name if char.isprintable() and char not in '/\\:*?"<>|').strip() or "log"


def _resolve_source_path(value: str) -> Path:
    path = Path(value).expanduser()
    if path.exists():
        return path.resolve()
    match = re.match(r"^([A-Za-z]):[\\/](.*)$", value.strip())
    if match:
        # LogLens often runs inside WSL while users copy Windows paths.
        translated = Path(f"/mnt/{match.group(1).lower()}/{match.group(2).replace(chr(92), '/')}")
        if translated.exists():
            return translated.resolve()
    return path.resolve()


def _extract_zip(path: Path, target: Path) -> int:
    count = 0
    with zipfile.ZipFile(path) as archive:
        for member in archive.infolist():
            if member.is_dir():
                continue
            name = member.filename.replace("\\", "/")
            if name.startswith("/") or ".." in Path(name).parts:
                continue
            destination = (target / name).resolve()
            if not str(destination).startswith(str(target.resolve())):
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source, destination.open("wb") as output:
                shutil.copyfileobj(source, output)
            count += 1
    return count


def _execute(run_id: str, targets: list[str], pack: str, use_llm: bool) -> None:
    store.update(run_id, status="running", started_at=_now(), stage="starting", progress=1)
    logger.info("分析开始 run=%s pack=%s use_llm=%s inputs=%s", run_id, pack, use_llm, targets)

    def progress(stage: str, pct: int, message: str = "") -> None:
        store.update(run_id, stage=stage, progress=max(0, min(100, pct)), message=message)

    try:
        result = analyze(
            targets,
            pack=pack,
            out_dir=RUNS_DIR,
            run_id=run_id,
            use_llm=use_llm,
            cache_path=DATA_DIR / "cache" / "template_labels.json",
            progress=progress,
        )
        store.update(
            run_id,
            status="done",
            finished_at=_now(),
            progress=100,
            stage="done",
            message=f"完成，用时 {max(0.1, _elapsed(run_id)):.1f} 秒",
            stats={
                "records": result.records,
                "files": len(result.files),
                "anomalies": len(result.anomalies),
                "start": result.start,
                "end": result.end,
                "parse_errors": result.parse_errors,
            },
            llm_used=result.llm_used,
            llm_model=result.llm_model,
            warnings=result.warnings,
        )
        logger.info(
            "分析完成 run=%s records=%s files=%s anomalies=%s llm_used=%s model=%s warnings=%s",
            run_id,
            result.records,
            len(result.files),
            len(result.anomalies),
            result.llm_used,
            result.llm_model,
            len(result.warnings),
        )
    except Exception as exc:
        logger.exception("分析失败 run=%s", run_id)
        store.update(
            run_id,
            status="error",
            finished_at=_now(),
            progress=100,
            stage="error",
            message=str(exc)[:300],
            error=traceback.format_exc()[-6000:],
        )


def _elapsed(run_id: str) -> float:
    meta = store.get(run_id) or {}
    start = meta.get("started_at")
    if not start:
        return 0.0
    try:
        return (datetime.now() - datetime.fromisoformat(start)).total_seconds()
    except ValueError:
        return 0.0


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "version": __version__}


class PackImportPayload(BaseModel):
    content: str = ""
    overwrite: bool = False


def _pack_payload(pack: Any) -> dict[str, Any]:
    payload = pack_to_dict(pack)
    payload["protected"] = pack.id in PROTECTED_PACK_IDS
    return payload


def _check_pack_id(pack_id: str) -> None:
    if not PACK_ID_RE.fullmatch(pack_id):
        raise HTTPException(status_code=400, detail="领域包 ID 不合法")


@app.get("/api/packs")
def packs() -> list[dict[str, Any]]:
    return list_packs()


@app.post("/api/packs/validate")
def validate_pack_endpoint(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        pack, warnings = parse_pack_payload(payload)
    except PackValidationError as exc:
        return {"ok": False, "errors": exc.errors, "warnings": exc.warnings}
    return {"ok": True, "errors": [], "warnings": warnings, "pack": _pack_payload(pack)}


@app.post("/api/packs")
def create_pack(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        pack = save_pack(payload, overwrite=False)
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PackValidationError as exc:
        raise HTTPException(
            status_code=400, detail={"message": "领域包校验失败", "errors": exc.errors, "warnings": exc.warnings}
        ) from exc
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"领域包写入失败：{exc}") from exc
    logger.info("领域包已创建 id=%s name=%s events=%s kpis=%s faults=%s", pack.id, pack.name, len(pack.events), len(pack.kpis), len(pack.faults))
    return _pack_payload(pack)


@app.post("/api/packs/import")
def import_pack(payload: PackImportPayload) -> dict[str, Any]:
    try:
        pack = import_pack_yaml(payload.content, overwrite=payload.overwrite)
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PackValidationError as exc:
        raise HTTPException(
            status_code=400, detail={"message": "YAML 导入失败", "errors": exc.errors, "warnings": exc.warnings}
        ) from exc
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"领域包写入失败：{exc}") from exc
    logger.info("领域包已从 YAML 导入 id=%s name=%s", pack.id, pack.name)
    return _pack_payload(pack)


@app.post("/api/packs/yaml")
def preview_pack_yaml(payload: dict[str, Any]) -> dict[str, str]:
    try:
        pack, _ = parse_pack_payload(payload)
    except PackValidationError as exc:
        raise HTTPException(status_code=400, detail={"message": "无法生成 YAML", "errors": exc.errors}) from exc
    return {"yaml": pack_yaml(pack)}


@app.post("/api/packs/generate")
def generate_pack_endpoint(
    files: list[UploadFile] | None = File(default=None),  # noqa: B008
    archive: UploadFile | None = File(default=None),  # noqa: B008
    source_path: str = Form(""),
    pack_id: str = Form(""),
    name: str = Form(""),
    hint: str = Form(""),
) -> dict[str, Any]:
    pack_id = pack_id.strip()
    if pack_id:
        _check_pack_id(pack_id)
        try:
            load_pack(pack_id)
        except FileNotFoundError:
            pass
        except (OSError, ValueError):
            pass
        else:
            raise HTTPException(status_code=409, detail=f"领域包已存在：{pack_id}")

    temp_root = DATA_DIR / "tmp"
    temp_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="pack-ai-", dir=temp_root) as tmp:
        tmp_path = Path(tmp)
        targets: list[str] = []
        if source_path.strip():
            candidate = _resolve_source_path(source_path)
            if not candidate.exists():
                raise HTTPException(status_code=400, detail=f"路径不存在：{candidate}")
            targets.append(str(candidate))

        if files:
            uploads = tmp_path / "uploads"
            uploads.mkdir(parents=True, exist_ok=True)
            for index, upload in enumerate(files):
                if not upload.filename:
                    continue
                destination = uploads / f"{index:03d}-{_safe_name(upload.filename)}"
                with destination.open("wb") as handle:
                    shutil.copyfileobj(upload.file, handle)
                targets.append(str(destination))

        if archive is not None and archive.filename:
            uploads = tmp_path / "uploads"
            uploads.mkdir(parents=True, exist_ok=True)
            archive_path = uploads / f"archive-{_safe_name(archive.filename)}"
            with archive_path.open("wb") as handle:
                shutil.copyfileobj(archive.file, handle)
            try:
                extracted = _extract_zip(archive_path, uploads / "extracted")
            except zipfile.BadZipFile as exc:
                raise HTTPException(status_code=400, detail="zip 压缩包无法解析") from exc
            if extracted == 0:
                raise HTTPException(status_code=400, detail="压缩包中没有文件")
            targets.append(str(uploads / "extracted"))

        if not targets:
            raise HTTPException(status_code=400, detail="请上传日志文件、zip 压缩包，或填写服务器路径")

        try:
            result = generate_pack_from_logs(
                targets,
                pack_id=pack_id,
                name=name.strip(),
                hint=hint.strip(),
            )
        except LLMError as exc:
            logger.warning("AI 生成领域包失败 LLM 未就绪：%s", exc)
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except PackGenerationError as exc:
            logger.warning("AI 生成领域包校验失败：%s errors=%s", exc, exc.errors)
            raise HTTPException(
                status_code=400,
                detail={"message": str(exc), "errors": exc.errors},
            ) from exc
        except (OSError, ValueError) as exc:
            logger.exception("AI 生成领域包异常")
            raise HTTPException(status_code=400, detail=f"生成领域包失败：{exc}") from exc
        logger.info(
            "AI 领域包草稿已生成 id=%s model=%s files=%s lines=%s chars=%s",
            result["pack"].get("id"),
            result.get("model"),
            result.get("sample", {}).get("files"),
            result.get("sample", {}).get("lines"),
            result.get("sample", {}).get("chars"),
        )
        return result


@app.get("/api/packs/{pack_id}")
def pack_detail(pack_id: str) -> dict[str, Any]:
    _check_pack_id(pack_id)
    try:
        pack = load_pack(pack_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="领域包不存在") from exc
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"领域包无法解析：{exc}") from exc
    return _pack_payload(pack)


@app.put("/api/packs/{pack_id}")
def update_pack(pack_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    _check_pack_id(pack_id)
    try:
        load_pack(pack_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="领域包不存在") from exc
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"领域包无法解析：{exc}") from exc
    try:
        pack = save_pack(payload, pack_id=pack_id, overwrite=True)
    except PackValidationError as exc:
        raise HTTPException(
            status_code=400, detail={"message": "领域包校验失败", "errors": exc.errors, "warnings": exc.warnings}
        ) from exc
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"领域包写入失败：{exc}") from exc
    logger.info("领域包已更新 id=%s name=%s events=%s kpis=%s faults=%s", pack.id, pack.name, len(pack.events), len(pack.kpis), len(pack.faults))
    return _pack_payload(pack)


@app.delete("/api/packs/{pack_id}")
def remove_pack(pack_id: str) -> dict[str, str]:
    _check_pack_id(pack_id)
    try:
        delete_pack(pack_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="领域包不存在") from exc
    except PackValidationError as exc:
        raise HTTPException(status_code=400, detail=exc.errors[0] if exc.errors else str(exc)) from exc
    logger.info("领域包已删除 id=%s", pack_id)
    return {"deleted": pack_id}


@app.post("/api/packs/{pack_id}/duplicate")
def copy_pack(pack_id: str) -> dict[str, Any]:
    _check_pack_id(pack_id)
    try:
        pack = duplicate_pack(pack_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="领域包不存在") from exc
    except PackValidationError as exc:
        raise HTTPException(status_code=400, detail=exc.errors[0] if exc.errors else str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"领域包写入失败：{exc}") from exc
    logger.info("领域包已复制 source=%s target=%s", pack_id, pack.id)
    return _pack_payload(pack)


@app.get("/api/packs/{pack_id}/yaml")
def pack_yaml_endpoint(pack_id: str) -> PlainTextResponse:
    _check_pack_id(pack_id)
    try:
        pack = load_pack(pack_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="领域包不存在") from exc
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"领域包无法解析：{exc}") from exc
    return PlainTextResponse(
        pack_yaml(pack),
        media_type="text/yaml; charset=utf-8",
        headers={"Content-Disposition": f'inline; filename="{pack_id}.yaml"'},
    )


@app.get("/api/config")
def config() -> dict[str, Any]:
    llm = LLMConfig.load()
    return {
        "llm_configured": llm.configured,
        "llm_model": llm.model or None,
        "llm_source": _llm_source(),
        "data_dir": str(DATA_DIR),
    }


class LLMSettingsPayload(BaseModel):
    base_url: str = ""
    model: str = ""
    api_key: str | None = None
    session_id: str = ""
    timeout: float = 120.0
    max_tokens: int = 4000
    clear_api_key: bool = False


def _llm_source() -> str:
    saved = read_settings()
    if saved and (saved.get("base_url") or saved.get("model")):
        return "settings"
    if LLMConfig.from_env().configured:
        return "env"
    return "none"


def _llm_public() -> dict[str, Any]:
    payload = LLMConfig.load().public()
    payload["source"] = _llm_source()
    payload["settings_path"] = str(settings_path())
    return payload


def _llm_from_payload(payload: LLMSettingsPayload) -> LLMConfig:
    base = LLMConfig.load()
    timeout = max(1.0, min(600.0, float(payload.timeout or base.timeout)))
    max_tokens = max(1, min(32768, int(payload.max_tokens or base.max_tokens)))
    return LLMConfig(
        base_url=payload.base_url.strip() or base.base_url,
        model=payload.model.strip() or base.model,
        api_key=(payload.api_key or "").strip() or base.api_key,
        timeout=timeout,
        max_tokens=max_tokens,
        session_id=payload.session_id.strip() or base.session_id,
        headers=base.headers,
    )


@app.get("/api/settings/llm")
def llm_settings() -> dict[str, Any]:
    payload = _llm_public()
    try:
        detected = detect_opencode_go()
        payload["opencode"] = {
            "available": detected["available"],
            "provider": detected["provider"],
            "base_url": detected["base_url"],
            "model": detected["model"],
            "reason": detected["reason"],
        }
    except Exception as exc:  # noqa: BLE001 - settings page should still render
        payload["opencode"] = {"available": False, "reason": str(exc)[:200]}
    return payload


@app.put("/api/settings/llm")
def save_llm_settings(payload: LLMSettingsPayload) -> dict[str, Any]:
    saved = read_settings()
    saved["base_url"] = payload.base_url.strip()
    saved["model"] = payload.model.strip()
    saved["session_id"] = payload.session_id.strip()
    saved["timeout"] = max(1.0, min(600.0, float(payload.timeout or 120)))
    saved["max_tokens"] = max(1, min(32768, int(payload.max_tokens or 4000)))
    if payload.clear_api_key:
        saved.pop("api_key", None)
    elif payload.api_key and payload.api_key.strip():
        saved["api_key"] = payload.api_key.strip()
    write_settings(saved)
    logger.info("模型设置已保存 base_url=%s model=%s key_set=%s", saved.get("base_url"), saved.get("model"), bool(saved.get("api_key")))
    return _llm_public()


@app.post("/api/settings/llm/test")
def test_llm_settings(payload: LLMSettingsPayload) -> dict[str, Any]:
    try:
        result = test_connection(_llm_from_payload(payload))
        logger.info("模型连接测试成功 model=%s latency_ms=%s", result.get("model"), result.get("latency_ms"))
        return result
    except LLMError as exc:
        logger.warning("模型连接测试失败：%s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/settings/llm/import-opencode")
def import_opencode_settings() -> dict[str, Any]:
    detected = detect_opencode_go()
    if not detected["available"]:
        raise HTTPException(status_code=400, detail=detected["reason"])
    saved = read_settings()
    saved["base_url"] = detected["base_url"]
    saved["model"] = detected["model"]
    saved["api_key"] = detected["api_key"]
    if not saved.get("session_id"):
        saved["session_id"] = detected["session_id"]
    write_settings(saved)
    logger.info("已导入 OpenCode Go 模型配置 model=%s", detected["model"])
    payload = _llm_public()
    payload["imported"] = True
    payload["provider"] = detected["provider"]
    return payload


@app.delete("/api/settings/llm")
def reset_llm_settings() -> dict[str, Any]:
    clear_settings()
    logger.info("页面模型设置已清除")
    return _llm_public()


@app.post("/api/runs")
async def create_run(
    files: list[UploadFile] | None = File(default=None),  # noqa: B008
    archive: UploadFile | None = File(default=None),  # noqa: B008
    pack: str = Form("generic"),
    name: str = Form(""),
    source_path: str = Form(""),
    use_llm: bool = Form(True),
) -> JSONResponse:
    meta = store.create(name=name, pack=pack, use_llm=use_llm)
    run_dir = store.path(meta["id"])
    uploads = run_dir / "uploads"
    targets: list[str] = []

    if source_path.strip():
        candidate = Path(source_path).expanduser().resolve()
        if not candidate.exists():
            store.update(meta["id"], status="error", error=f"路径不存在：{candidate}")
            raise HTTPException(status_code=400, detail=f"路径不存在：{candidate}")
        targets.append(str(candidate))

    if files:
        for index, upload in enumerate(files):
            if not upload.filename:
                continue
            destination = uploads / f"{index:03d}-{_safe_name(upload.filename)}"
            with destination.open("wb") as handle:
                shutil.copyfileobj(upload.file, handle)
            targets.append(str(destination))

    if archive is not None and archive.filename:
        archive_path = uploads / f"archive-{_safe_name(archive.filename)}"
        with archive_path.open("wb") as handle:
            shutil.copyfileobj(archive.file, handle)
        try:
            extracted = _extract_zip(archive_path, uploads / "extracted")
        except zipfile.BadZipFile as exc:
            store.update(meta["id"], status="error", error=f"zip 压缩包无法解析：{exc}")
            raise HTTPException(status_code=400, detail="zip 压缩包无法解析") from exc
        if extracted == 0:
            store.update(meta["id"], status="error", error="压缩包中没有文件")
            raise HTTPException(status_code=400, detail="压缩包中没有文件")
        targets.append(str(uploads / "extracted"))

    if not targets:
        store.update(meta["id"], status="error", error="没有输入文件")
        raise HTTPException(status_code=400, detail="请上传文件、zip 压缩包，或填写服务器路径")

    logger.info(
        "分析任务已创建 run=%s name=%s pack=%s use_llm=%s inputs=%s",
        meta["id"],
        meta["name"],
        pack,
        use_llm,
        targets,
    )
    _executor.submit(_execute, meta["id"], targets, pack, use_llm)
    return JSONResponse(store.get(meta["id"]) or meta, status_code=202)


@app.get("/api/runs")
def list_runs() -> list[dict[str, Any]]:
    return store.list()


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    meta = store.get(run_id)
    if not meta:
        raise HTTPException(status_code=404, detail="运行记录不存在")
    return {"run": meta, "summary": store.summary(run_id)}


@app.delete("/api/runs/{run_id}")
def delete_run(run_id: str) -> dict[str, str]:
    meta = store.get(run_id)
    if not meta:
        raise HTTPException(status_code=404, detail="运行记录不存在")
    if meta.get("status") == "running":
        raise HTTPException(status_code=409, detail="运行仍在进行中")
    shutil.rmtree(store.path(run_id), ignore_errors=True)
    logger.info("分析记录已删除 run=%s", run_id)
    return {"deleted": run_id}


def _open_db(run_id: str) -> duckdb.DuckDBPyConnection:
    meta = store.get(run_id)
    if not meta:
        raise HTTPException(status_code=404, detail="运行记录不存在")
    if meta.get("status") == "running":
        raise HTTPException(status_code=409, detail="分析仍在进行中")
    path = store.path(run_id) / "loglens.duckdb"
    if not path.exists():
        raise HTTPException(status_code=404, detail="数据库尚未就绪")
    try:
        return duckdb.connect(str(path), read_only=True)
    except duckdb.Error as exc:
        raise HTTPException(status_code=409, detail=f"数据库正忙：{exc}") from exc


@app.get("/api/runs/{run_id}/report.html")
def report_html(run_id: str) -> FileResponse:
    path = store.path(run_id) / "report.html"
    if not path.exists():
        raise HTTPException(status_code=404, detail="报告尚未就绪")
    return FileResponse(path, media_type="text/html")


@app.get("/api/runs/{run_id}/report.md")
def report_md(run_id: str) -> FileResponse:
    path = store.path(run_id) / "report.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail="报告尚未就绪")
    return FileResponse(path, media_type="text/markdown; charset=utf-8")


@app.get("/api/runs/{run_id}/evidence")
def evidence(run_id: str) -> JSONResponse:
    path = store.path(run_id) / "evidence.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="证据包尚未就绪")
    return JSONResponse(json.loads(path.read_text(encoding="utf-8")))


@app.get("/api/runs/{run_id}/templates")
def templates(run_id: str, q: str = "", severity: str = "", limit: int = 500) -> dict[str, Any]:
    conn = _open_db(run_id)
    try:
        where = []
        params: list[Any] = []
        if q:
            where.append("(pattern ILIKE ? OR sample ILIKE ? OR meaning ILIKE ?)")
            params.extend([f"%{q}%"] * 3)
        if severity:
            where.append("severity = ?")
            params.append(severity)
        clause = ("WHERE " + " AND ".join(where)) if where else ""
        rows = conn.execute(
            f"""
            SELECT template_id, count, severity, category, meaning, pattern, sample,
                   CAST(first_ts AS VARCHAR), CAST(last_ts AS VARCHAR)
            FROM templates {clause}
            ORDER BY count DESC LIMIT ?
            """,
            params + [limit],
        ).fetchall()
        return {
            "items": [
                {
                    "template_id": row[0],
                    "count": row[1],
                    "severity": row[2],
                    "category": row[3],
                    "meaning": row[4],
                    "pattern": row[5],
                    "sample": row[6],
                    "first_ts": row[7],
                    "last_ts": row[8],
                }
                for row in rows
            ]
        }
    finally:
        conn.close()


@app.get("/api/runs/{run_id}/logs")
def logs(
    run_id: str,
    q: str = "",
    level: str = "",
    template_id: int | None = None,
    file: str = "",
    line: int | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    conn = _open_db(run_id)
    try:
        where = []
        params: list[Any] = []
        if q:
            where.append("(message ILIKE ? OR module ILIKE ? OR file ILIKE ?)")
            params.extend([f"%{q}%", f"%{q}%", f"%{q}%"])
        if level:
            where.append("level = ?")
            params.append(level)
        if template_id:
            where.append("template_id = ?")
            params.append(template_id)
        if file:
            where.append("file = ?")
            params.append(file)
        if line is not None:
            where.append("line_no = ?")
            params.append(line)
        clause = ("WHERE " + " AND ".join(where)) if where else ""
        total = conn.execute(f"SELECT count(*) FROM records {clause}", params).fetchone()[0]
        rows = conn.execute(
            f"""
            SELECT CAST(ts AS VARCHAR), level, module, thread, message, file, line_no, template_id
            FROM records {clause}
            ORDER BY ts DESC NULLS LAST, line_no DESC
            LIMIT ? OFFSET ?
            """,
            params + [max(1, min(limit, 500)), max(0, offset)],
        ).fetchall()
        return {
            "total": int(total),
            "items": [
                {
                    "ts": row[0],
                    "level": row[1],
                    "module": row[2],
                    "thread": row[3],
                    "message": row[4],
                    "file": row[5],
                    "line": row[6],
                    "template_id": row[7],
                    "citation": f"{row[5]}:{row[6]}",
                }
                for row in rows
            ],
        }
    finally:
        conn.close()


@app.get("/api/runs/{run_id}/artifacts/{name}")
def artifact(run_id: str, name: str) -> FileResponse:
    allowed = {
        "templates.csv",
        "events.csv",
        "anomalies.json",
        "evidence.json",
        "findings.json",
        "summary.json",
        "meta.json",
        "report.md",
        "report.html",
        "loglens.duckdb",
    }
    if name not in allowed:
        raise HTTPException(status_code=404, detail="产物不存在")
    path = store.path(run_id) / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="产物尚未就绪")
    return FileResponse(path)


@app.get("/api/runs/{run_id}/download.zip")
def download_run(run_id: str) -> StreamingResponse:
    meta = store.get(run_id)
    if not meta:
        raise HTTPException(status_code=404, detail="运行记录不存在")
    run_dir = store.path(run_id)
    names = [
        "meta.json",
        "summary.json",
        "anomalies.json",
        "evidence.json",
        "findings.json",
        "report.md",
        "report.html",
        "templates.csv",
        "events.csv",
        "loglens.duckdb",
    ]
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in names:
            path = run_dir / name
            if path.exists():
                archive.write(path, arcname=name)
    buffer.seek(0)
    headers = {"Content-Disposition": f'attachment; filename="loglens-{run_id}.zip"'}
    return StreamingResponse(buffer, media_type="application/zip", headers=headers)



@app.get("/", include_in_schema=False)
def index() -> dict[str, str]:
    return {
        "name": "LogLens",
        "version": __version__,
        "ui": "Next.js 前端：npm run dev（默认 http://127.0.0.1:3000）",
        "health": "/api/health",
        "docs": "/docs",
    }
