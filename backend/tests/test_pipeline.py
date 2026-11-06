from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from loglens.api import app
from loglens.llm import validate_findings
from loglens.packs import load_pack
from loglens.parsing import discover, parse_line, template_of
from loglens.pipeline import analyze

ROOT = Path(__file__).resolve().parents[2]
DEMO = ROOT / "examples" / "demo"


@pytest.fixture(scope="module")
def demo_run(tmp_path_factory):
    out = tmp_path_factory.mktemp("runs")
    return analyze([DEMO], pack="generic", out_dir=out, run_id="demo", use_llm=False)


def test_template_masks_dynamic_tokens():
    pattern = template_of("Order 550e8400-e29b-41d4-a716-446655440000 failed at 10.1.2.3:8080 after 3200ms")
    assert "<uuid>" in pattern
    assert "<ip>" in pattern
    assert "<num>" in pattern
    assert "550e8400" not in pattern


def test_parse_line_adapters():
    pack = load_pack("generic")
    bracket = parse_line("[2026-10-01 09:00:01.123] [42] [error] [Db]  boom", pack, None)
    assert bracket["level"] == "error"
    assert bracket["module"] == "Db"
    nginx = parse_line(
        '1.2.3.4 - - [01/Oct/2026:09:00:01 +0800] "GET /x HTTP/1.1" 502 12 "-" "curl"',
        pack,
        None,
    )
    assert nginx["level"] == "error"
    assert "502" in nginx["message"]
    micro = parse_line(
        '{"timestamp":"2026-10-05T09:00:00Z","level":"warn","logger":"svc","message":"slow"}',
        pack,
        None,
    )
    assert micro["level"] == "warn"
    assert micro["module"] == "svc"


def test_discover_does_not_exclude_absolute_data_dir(tmp_path):
    pack = load_pack("generic")
    root = tmp_path / "data" / "logs"
    root.mkdir(parents=True)
    (root / "a.log").write_text("hello", encoding="utf-8")
    found = discover([root], pack)
    assert [item.name for item in found] == ["a.log"]


def test_pipeline_demo(demo_run):
    assert demo_run.records > 1500
    assert demo_run.parse_errors == 0
    assert demo_run.summary["overview"]["errors"] > 100
    assert demo_run.summary["kpis"]
    assert any(kpi["id"] == "error_rate" and kpi["type"] == "ratio" for kpi in demo_run.summary["kpis"])
    kinds = {item["kind"] for item in demo_run.anomalies}
    assert "error_burst" in kinds
    assert demo_run.evidence["facts"]
    report = (Path(demo_run.out_dir) / "report.md").read_text(encoding="utf-8")
    assert "# 日志分析报告" in report
    assert "证据" in report
    report_html = (Path(demo_run.out_dir) / "report.html").read_text(encoding="utf-8")
    assert "--paper:#f3f6fb" in report_html
    assert "LOGLENS" in report_html
    assert "所有统计来自 DuckDB" in report_html
    meta = json.loads((Path(demo_run.out_dir) / "meta.json").read_text(encoding="utf-8"))
    assert meta["status"] == "done"
    assert meta["stats"]["records"] == demo_run.records


def test_anomalies_have_citations(demo_run):
    with_citation = [item for item in demo_run.anomalies if item["kind"] in {"error_burst", "template_spike"}]
    assert with_citation
    for item in with_citation:
        assert item["citations"], item


def test_jsonl_input(tmp_path):
    result = analyze([ROOT / "examples" / "jsonl"], pack="generic", out_dir=tmp_path, run_id="jsonl", use_llm=False)
    assert result.records == 220
    assert result.summary["overview"]["parse_errors"] == 0
    assert result.summary["top_templates"]


def test_validate_findings_drops_uncited_and_flags_numbers():
    evidence = {"facts": [{"id": "E1", "kind": "overview", "records": 10}]}
    payload = {
        "executive_summary": ["ok"],
        "findings": [
            {"title": "good", "summary": "10 records", "evidence_ids": ["E1"], "severity": "high", "confidence": 0.7},
            {"title": "bad", "summary": "no citation", "evidence_ids": []},
            {"title": "numbers", "summary": "999 records", "evidence_ids": ["E1"]},
        ],
    }
    result = validate_findings(payload, evidence)
    assert result is not None
    assert [item["title"] for item in result["findings"]] == ["good", "numbers"]
    assert result["validation_warnings"]


def test_nginx_pack(tmp_path):
    (tmp_path / "access.log").write_text(
        '1.2.3.4 - - [01/Oct/2026:10:00:01 +0800] "GET /a HTTP/1.1" 200 123 "-" "curl"\n'
        '1.2.3.4 - - [01/Oct/2026:10:00:05 +0800] "POST /b HTTP/1.1" 500 20 "-" "curl"\n'
        '1.2.3.4 - - [01/Oct/2026:10:00:09 +0800] "GET /c HTTP/1.1" 502 20 "-" "curl"\n',
        encoding="utf-8",
    )
    result = analyze([tmp_path], pack="nginx", out_dir=tmp_path / "runs", run_id="nginx", use_llm=False)
    kpis = {item["id"]: item for item in result.summary["kpis"]}
    assert kpis["requests"]["total"] == 3
    assert kpis["server_errors"]["total"] == 2
    assert kpis["error_rate"]["series"][0]["value"] == pytest.approx(2 / 3, rel=1e-3)


def test_api_health_and_packs():
    client = TestClient(app)
    assert client.get("/api/health").json()["ok"] is True
    root = client.get("/")
    assert root.status_code == 200
    assert root.headers["content-type"].startswith("application/json")
    assert root.json()["name"] == "LogLens"
    assert client.get("/legacy").status_code == 404
    packs = client.get("/api/packs").json()
    assert {item["id"] for item in packs} >= {"generic", "nginx"}
    detail = client.get("/api/packs/generic").json()
    assert detail["id"] == "generic"
    assert detail["events"]
    assert detail["kpis"]


def test_api_llm_settings_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("LOGLENS_DATA_DIR", str(tmp_path))
    client = TestClient(app)
    saved = client.put(
        "/api/settings/llm",
        json={
            "base_url": "http://127.0.0.1:9999/v1",
            "model": "test-model",
            "api_key": "secret-key",
            "session_id": "ses_test",
            "timeout": 30,
            "max_tokens": 512,
        },
    )
    assert saved.status_code == 200
    payload = saved.json()
    assert payload["configured"] is True
    assert payload["model"] == "test-model"
    assert payload["api_key_set"] is True
    assert "api_key" not in payload

    fetched = client.get("/api/settings/llm").json()
    assert fetched["source"] == "settings"
    assert "secret-key" not in fetched.__repr__()

    monkeypatch.setattr(
        "loglens.api.test_connection",
        lambda config: {"ok": True, "model": config.model, "latency_ms": 1, "reply": "连接成功"},
    )
    tested = client.post(
        "/api/settings/llm/test",
        json={"base_url": "http://127.0.0.1:9999/v1", "model": "test-model"},
    )
    assert tested.status_code == 200
    assert tested.json()["reply"] == "连接成功"

    deleted = client.delete("/api/settings/llm")
    assert deleted.status_code == 200
    assert deleted.json()["source"] in {"none", "env"}


def test_detect_opencode_go(tmp_path, monkeypatch):
    from loglens.opencode import detect_opencode_go

    state = tmp_path / "state"
    data = tmp_path / "data"
    state.mkdir()
    data.mkdir()
    (state / "model.json").write_text(
        json.dumps({"recent": [{"providerID": "opencode-go", "modelID": "test-model"}]}),
        encoding="utf-8",
    )
    conn = sqlite3.connect(data / "opencode.db")
    try:
        conn.execute("CREATE TABLE kv (key TEXT, value TEXT)")
        catalog = {"body": json.dumps({"opencode-go": {"api": "https://example.test/v1", "models": {"test-model": {}}}})}
        conn.execute("INSERT INTO kv VALUES ('models-dev:catalog', ?)", (json.dumps(catalog),))
        conn.execute(
            "CREATE TABLE credential (integration_id TEXT, active INTEGER, time_updated INTEGER, value TEXT)"
        )
        conn.execute(
            "INSERT INTO credential VALUES ('opencode-go', 1, 1, ?)",
            (json.dumps({"type": "key", "key": "test-key"}),),
        )
        conn.commit()
    finally:
        conn.close()

    monkeypatch.setenv("OPENCODE_STATE_DIR", str(state))
    monkeypatch.setenv("OPENCODE_DATA_DIR", str(data))
    detected = detect_opencode_go()
    assert detected["available"] is True
    assert detected["base_url"] == "https://example.test/v1"
    assert detected["model"] == "test-model"
    assert detected["api_key"] == "test-key"


def test_pack_crud(tmp_path, monkeypatch):
    from loglens import packs as packs_module

    monkeypatch.setattr(packs_module, "PACKS_DIR", tmp_path)
    client = TestClient(app)
    payload = {
        "id": "test-pack",
        "name": "测试包",
        "version": "1.0",
        "description": "用于测试的领域包",
        "ingest": {
            "include_globs": ["*.log"],
            "exclude_dirs": ["data"],
            "encodings": ["utf-8"],
            "multiline": True,
        },
        "events": [{"id": "request", "name": "请求", "pattern": "GET", "category": "traffic"}],
        "kpis": [{"id": "requests", "name": "请求数", "type": "count", "event": "request"}],
        "faults": [
            {"id": "connect", "name": "连接", "severity": "high", "patterns": ["refused"], "hint": "检查网络"}
        ],
        "prompts": {"domain_context": "测试上下文"},
    }
    created = client.post("/api/packs", json=payload)
    assert created.status_code == 200
    assert created.json()["id"] == "test-pack"
    assert created.json()["protected"] is False

    listed = client.get("/api/packs").json()
    assert any(item["id"] == "test-pack" for item in listed)

    payload["description"] = "更新后的说明"
    updated = client.put("/api/packs/test-pack", json=payload)
    assert updated.status_code == 200
    assert updated.json()["description"] == "更新后的说明"

    assert client.put("/api/packs/missing-pack", json=payload).status_code == 404

    invalid = json.loads(json.dumps(payload))
    invalid["kpis"][0]["event"] = "missing"
    checked = client.post("/api/packs/validate", json=invalid)
    assert checked.status_code == 200
    assert checked.json()["ok"] is False
    assert any("不存在的事件" in item for item in checked.json()["errors"])

    yaml_text = client.get("/api/packs/test-pack/yaml").text
    assert "id: test-pack" in yaml_text

    imported = client.post(
        "/api/packs/import",
        json={"content": yaml_text.replace("id: test-pack", "id: imported-pack")},
    )
    assert imported.status_code == 200
    assert imported.json()["id"] == "imported-pack"

    copied = client.post("/api/packs/test-pack/duplicate")
    assert copied.status_code == 200
    assert copied.json()["id"] == "test-pack-copy"

    generic = json.loads(json.dumps(payload))
    generic["id"] = "generic"
    assert client.post("/api/packs", json=generic).status_code == 200
    assert client.delete("/api/packs/generic").status_code == 400

    for pack_id in ("test-pack", "test-pack-copy", "imported-pack"):
        assert client.delete(f"/api/packs/{pack_id}").status_code == 200
    assert client.get("/api/packs/test-pack").status_code == 404


def test_logging_writes_file(tmp_path):
    import logging

    from loglens.log import configure_logging, get_logger, reset_logging

    log_path = tmp_path / "loglens.log"
    configured = configure_logging("INFO", log_path, force=True)
    assert configured == log_path
    get_logger("test").info("hello-log")
    for handler in logging.getLogger("loglens").handlers:
        handler.flush()
    assert "hello-log" in log_path.read_text(encoding="utf-8")
    reset_logging()


def test_pack_ai_sample_and_generate(tmp_path):
    from loglens.pack_ai import generate_pack_from_logs, sample_logs

    log = tmp_path / "device.log"
    log.write_text(
        "[2026-10-29 10:00:00.000] [1] [info] [Core]  started\n"
        "[2026-10-29 10:00:01.000] [1] [error] [Scale]  Scale offline.\n",
        encoding="utf-8",
    )
    analysis = tmp_path / "analysis"
    analysis.mkdir()
    (analysis / "report.txt").write_text("this is not a log", encoding="utf-8")
    sample, meta = sample_logs([tmp_path])
    assert "### FILE: device.log" in sample
    assert "Scale offline" in sample
    assert "report.txt" not in sample
    assert meta["lines"] >= 2

    class FakeProvider:
        available = True
        label = "fake-model"

        def chat(self, messages, **kwargs):
            return json.dumps(
                {
                    "id": "generated",
                    "name": "Generated",
                    "version": "1.0.0",
                    "ingest": {"include_globs": ["*.log"]},
                    "events": [
                        {"id": "error", "name": "错误", "pattern": "(?i)error", "category": "error"}
                    ],
                    "kpis": [
                        {"id": "errors", "name": "错误数", "type": "count", "event": "error"}
                    ],
                    "faults": [],
                    "prompts": {"domain_context": "测试日志"},
                }
            )

    result = generate_pack_from_logs(
        [tmp_path],
        pack_id="ai-pack",
        name="AI 测试包",
        provider=FakeProvider(),
    )
    assert result["pack"]["id"] == "ai-pack"
    assert result["pack"]["name"] == "AI 测试包"
    assert result["pack"]["events"][0]["id"] == "error"
    assert result["model"] == "fake-model"
    assert result["sample"]["files"] == ["device.log"]


def test_api_pack_generate(tmp_path, monkeypatch):
    from loglens import api as api_module

    monkeypatch.setattr(
        api_module,
        "generate_pack_from_logs",
        lambda targets, **kwargs: {
            "pack": {
                "id": "ai-draft",
                "name": "AI 草稿",
                "version": "1.0.0",
                "ingest": {"include_globs": ["*.log"]},
                "events": [{"id": "e", "name": "事件", "pattern": "x", "category": "generic"}],
                "kpis": [{"id": "k", "name": "计数", "type": "count", "event": "e"}],
                "faults": [],
                "prompts": {"domain_context": "测试"},
            },
            "warnings": [],
            "sample": {"files": ["a.log"], "lines": 2, "chars": 20, "truncated": False},
            "model": "fake",
            "prompt_version": "test",
        },
    )
    client = TestClient(app)
    response = client.post(
        "/api/packs/generate",
        data={"pack_id": "ai-draft", "name": "AI 草稿", "hint": "测试"},
        files={"files": ("a.log", b"[2026-10-29 10:00:00] [1] [info] [Core]  started\n", "text/plain")},
    )
    assert response.status_code == 200
    assert response.json()["pack"]["id"] == "ai-draft"
    assert response.json()["sample"]["lines"] == 2
    assert client.get("/api/packs/ai-draft").status_code == 404


def test_api_run_zip(tmp_path, monkeypatch):
    from loglens import api as api_module

    store = api_module.RunStore(tmp_path)
    monkeypatch.setattr(api_module, "store", store)
    meta = store.create(name="zip", pack="generic", use_llm=False)
    run_dir = store.path(meta["id"])
    (run_dir / "summary.json").write_text("{}", encoding="utf-8")
    (run_dir / "report.md").write_text("# report", encoding="utf-8")
    response = TestClient(app).get(f"/api/runs/{meta['id']}/download.zip")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert response.content[:2] == b"PK"
