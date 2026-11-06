from __future__ import annotations

import json
import os
import sqlite3
import uuid
from pathlib import Path
from typing import Any

DEFAULT_BASE_URL = "https://opencode.ai/inference/go/openai/v1"
DEFAULT_MODEL = "deepseek-v4.1-flash"


def _state_dir() -> Path:
    return Path(os.getenv("OPENCODE_STATE_DIR", Path.home() / ".local" / "state" / "opencode"))


def _data_dir() -> Path:
    return Path(os.getenv("OPENCODE_DATA_DIR", Path.home() / ".local" / "share" / "opencode"))


def _read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _catalog_provider() -> dict[str, Any]:
    path = _data_dir() / "opencode.db"
    if not path.exists():
        return {}
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=2)
        try:
            row = conn.execute("SELECT value FROM kv WHERE key = 'models-dev:catalog'").fetchone()
        finally:
            conn.close()
    except sqlite3.Error:
        return {}
    if not row:
        return {}
    try:
        catalog = json.loads(row[0])
        body = catalog.get("body", catalog)
        if isinstance(body, str):
            body = json.loads(body)
        providers = body.get("providers", body)
        provider = providers.get("opencode-go", {})
    except (TypeError, ValueError, AttributeError):
        return {}
    return provider if isinstance(provider, dict) else {}


def _credential_key() -> str:
    path = _data_dir() / "opencode.db"
    if not path.exists():
        return ""
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=2)
        try:
            row = conn.execute(
                "SELECT value FROM credential WHERE integration_id = 'opencode-go' "
                "AND active = 1 ORDER BY time_updated DESC LIMIT 1"
            ).fetchone()
        finally:
            conn.close()
    except sqlite3.Error:
        return ""
    if not row:
        return ""
    try:
        value = json.loads(row[0])
    except (TypeError, ValueError):
        return ""
    if isinstance(value, dict):
        return str(value.get("key") or value.get("api_key") or "")
    return ""


def _model_name(provider: dict[str, Any]) -> str:
    model_file = _state_dir() / "model.json"
    data = _read_json(model_file)
    for item in data.get("recent", []):
        if not isinstance(item, dict):
            continue
        if item.get("providerID") == "opencode-go" and item.get("modelID"):
            return str(item["modelID"])
    models = provider.get("models", {})
    if isinstance(models, dict) and models:
        if DEFAULT_MODEL in models:
            return DEFAULT_MODEL
        return str(next(iter(models)))
    return DEFAULT_MODEL


def detect_opencode_go() -> dict[str, Any]:
    """Read the local OpenCode Go provider credential and model selection.

    The returned API key is only used to persist server-side settings; callers
    must never send it back to the browser.
    """
    provider = _catalog_provider()
    base_url = str(provider.get("api") or DEFAULT_BASE_URL)
    model = _model_name(provider)
    api_key = _credential_key() or os.getenv("OPENCODE_API_KEY") or ""
    session_id = os.getenv("LOGLENS_LLM_SESSION_ID") or f"ses_loglens_{uuid.uuid4().hex[:16]}"
    available = bool(api_key)
    return {
        "available": available,
        "provider": "opencode-go",
        "base_url": base_url,
        "model": model,
        "api_key": api_key,
        "session_id": session_id,
        "reason": "" if available else "未在 OpenCode 本地凭据中找到 opencode-go API Key",
    }
