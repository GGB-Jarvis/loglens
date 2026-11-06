# backend/loglens

Python 包。对外入口只有两个：

- `loglens.cli:main`：`loglens analyze / serve / packs`
- `loglens.api:app`：FastAPI 应用，由 `loglens serve` 启动

## 模块边界

| 模块 | 职责 |
|---|---|
| `pipeline.py` | 唯一编排入口：ingest → parse → analyze → detect → ai → report |
| `parsing.py` | 文件发现、编码探测、格式适配、多行合并、模板掩码 |
| `templating.py` | 模板收集与计数 |
| `analysis.py` | DuckDB 存储、KPI、异常检测、日志查询、证据构建 |
| `llm.py` | Provider、提示词、JSON 解析、引用/数字校验、确定性回退 |
| `pack_ai.py` | 有界样本 + AI 生成领域包草稿 |
| `packs.py` | 领域包 Pydantic 模型、加载、校验与 CRUD |
| `report.py` | Markdown / HTML 报告 |
| `api.py` | FastAPI、运行存储、上传与查询接口 |
| `opencode.py` | 本机 OpenCode Go 凭据探测 |
| `log.py` | 应用运行日志与轮转 |
| `models.py` | 内部数据类 |
| `cli.py` | 命令行入口 |

根目录约定：

- 领域包在 `packs/`，由 `LOGLENS_PACKS_DIR` 覆盖。
- 运行产物在 `data/runs/`，由 `LOGLENS_DATA_DIR` 覆盖。
- 测试在 `backend/tests/`，从仓库根目录运行 `.venv/bin/pytest`。
