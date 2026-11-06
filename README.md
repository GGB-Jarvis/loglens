# LogLens

**面向软件日志集合的、以证据为依据的 AI 分析工具。**

LogLens 会接入一个应用日志目录，将其转化为结构化事实（模板、事件、KPI、异常），
然后让 LLM 仅依据这些事实撰写分析报告。每条结论都会保留指回原始
`文件:行号` 的引用。

> 状态：v0.1.0（首个版本）—— 确定性流水线 + 可选的 OpenAI 兼容 LLM +
> Next.js Web UI。关闭 LLM 时不需要任何外部服务。

---

## 为什么做这个

大多数日志工具是为**搜索**（grep、ELK、Loki）或**大盘**（Grafana）而生的。
它们向你展示日志行，却不会告诉你到底发生了什么。

把原始日志直接发给 LLM 更糟：成本高、会撑爆上下文窗口，还会编造数字和原因。

LogLens 把这两类工作分开：

```
确定性事实  →  受控证据包  →  LLM 叙事
```

- 计数、比率、时间窗口和异常全部由代码（DuckDB/SQL）计算。
- 模型只会收到一个小巧、经过校验的证据包 —— 永远拿不到原始日志。
- 没有有效引用的结论会被丢弃。
- 即使没有 LLM，LogLens 依然能产出确定性的 Markdown/HTML 报告。
- HTML 报告与 Web UI 使用同一套视觉规范（纸张底色、蓝色强调、
  2 像素边框、等宽标签）。

---

## 特性

- **支持任意文本日志格式** —— 方括号日志、JSON lines、syslog、nginx 访问日志、
  klog、logfmt，或通过领域包自定义正则。
- **流式接入** —— 轮转文件按首行时间戳排序，重复的快照行会被去除，
  并按文件逐个探测编码。
- **模板挖掘** —— 对动态 token（UUID、IP、URL、时间戳、数字、带引号字符串）
  做掩码，让数百万行日志收敛为几百个模式。
- **领域包** —— 用 YAML 定义事件、KPI、故障分类和提示词。
  一个软件对应一个包，无需修改核心代码。
- **KPI 引擎** —— 按日计数与比率、按小时日志量、按模块健康度。
- **异常检测** —— 对 5 分钟错误分桶做稳健 Z 分数检测、小时级模板突增、
  KPI 下降、新出现的错误模式。
- **证据包** —— 一份带 `文件:行号` 引用的白名单事实。
- **有依据的 AI 报告** —— OpenAI 兼容端点（OpenAI、DeepSeek、Qwen、
  vLLM、Ollama）。带引用与数字校验；失败时确定性回退。
  AI 报告正文、结论与建议固定输出简体中文。
- **Web UI** —— Next.js 五页工作台：运行、诊断、报告、日志、配置；
  上传与进度、KPI 大盘、模板下钻、原始日志检索、证据回查、
  领域包编辑与 AI 生成、模型设置与连接测试。
- **CLI** —— `loglens analyze ./logs --pack generic`。

---

## 快速开始

**前置条件**

- Python 3.11+
- Node.js 20+（含 npm）
- Linux / macOS；Windows 建议使用 WSL

**1. 安装后端**

```bash
cd loglens
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
```

**2. 启动 API**

```bash
.venv/bin/loglens serve --host 127.0.0.1 --port 8000
# API 文档：http://127.0.0.1:8000/docs
```

**3. 启动 Web UI**

```bash
# 另开一个终端
npm install
npm run dev
# 打开 http://127.0.0.1:3000
```

Next.js 会把 `/api/*` 反向代理到 `http://127.0.0.1:8000`。
也可以在「配置」页保存 OpenAI 兼容模型端点，再新建分析。

**4. 只跑 CLI（不需要前端）**

```bash
# 不需要 LLM
.venv/bin/loglens analyze examples/sample.log --pack generic --out data/runs --name demo --no-llm

# 分析内置的多日示例
.venv/bin/loglens analyze examples/demo --pack generic --name demo
```

### 启用 LLM（可选）

任何 OpenAI 兼容端点都可以：

```bash
export LOGLENS_LLM_BASE_URL=http://127.0.0.1:11434/v1   # Ollama
export LOGLENS_LLM_MODEL=qwen2.5:14b
# export LOGLENS_LLM_API_KEY=...

# 或使用云端端点
export LOGLENS_LLM_BASE_URL=https://api.deepseek.com/v1
export LOGLENS_LLM_MODEL=deepseek-chat
export LOGLENS_LLM_API_KEY=sk-...
```

不设置这些变量时，报告会由确定性模板渲染，并明确标注这一点。

---

## Web UI

前端只有一套：Next.js 15 + Tailwind v4。FastAPI 只提供 API。

```bash
# 终端 1：启动后端
.venv/bin/loglens serve --host 127.0.0.1 --port 8000

# 终端 2：启动 Next.js 前端
npm install
npm run dev
# 打开 http://127.0.0.1:3000
```

Next.js 会把 `/api/*` 反向代理到 `LOGLENS_API_URL`（默认
`http://127.0.0.1:8000`）。生产构建：

```bash
npm run build
npm run start
```

也可以使用 `make web` / `make web-build`。

Next.js 的「运行 / 诊断 / 报告 / 日志 / 配置」页面直接读取
`/api/runs`、`/api/runs/{id}`、`/api/packs`、`/api/settings/llm` 等真实接口：
新建分析、选择运行、查看 KPI/异常、模板下钻、日志分页、报告与证据下载、
领域包新建 / 编辑 / 复制 / 删除、AI 生成草稿和模型设置 / 连接测试都已接入后端。

---

## 模型设置（Web UI）

日常使用不需要改环境变量：打开「配置 → 模型」，填写 OpenAI 兼容端点后
点击「保存设置」即可。配置保存在 `data/config/llm.json`（已被 `.gitignore`
忽略），API Key 不会回传到浏览器；页面只显示“已保存/未保存”。

如果本机安装了 OpenCode，并且已经登录 `opencode-go`，可以直接点击
「一键导入 OpenCode Go」：LogLens 会读取本机 OpenCode 的凭据与最近使用模型，
自动填入：

- Base URL：`https://opencode.ai/inference/go/openai/v1`
- 模型：`deepseek-v4.1-flash`（或你在 OpenCode 中最近选择的 opencode-go 模型）
- 额外请求头：`x-opencode-session`

导入后点击「测试连接」确认可用，再新建分析即可使用 AI 报告。环境变量
（见 `.env.example`）仍然有效，但页面设置的优先级更高。同一个模型配置
也用于「AI 生成领域包」；该操作通常需要 30～120 秒。

---

## CLI

```bash
loglens packs
loglens analyze <path> [<path> ...] --pack generic --out data/runs --name my-run
loglens analyze <path> --pack ./my-pack/pack.yaml --no-llm
loglens serve --host 0.0.0.0 --port 8000
```

每次运行生成的产物：

```
data/runs/<run_id>/
├── meta.json          # 状态、耗时、统计信息
├── summary.json       # 总览、KPI、模板、故障、文件
├── anomalies.json
├── evidence.json      # 模型实际看到的内容
├── findings.json      # 校验后的结论（启用 LLM 时）
├── report.md
├── report.html
├── templates.csv
├── events.csv
└── loglens.duckdb     # 可查询的 records/events/faults
```

---

## 领域包

领域包是一个 YAML 文件，用来教会 LogLens 理解某一个软件：

```yaml
id: my-service
name: My Service

ingest:
  include_globs: ["*.log", "*.log.*"]
  line_regex: '^\[(?P<ts>[^\]]+)\]\s+\[(?P<level>\w+)\]\s+\[(?P<module>[^\]]+)\]\s+(?P<message>.*)$'

events:
  - id: request
    pattern: '(?i)\b(GET|POST|PUT|DELETE)\s+/'
  - id: error
    pattern: '(?i)\b(error|exception|failed)\b'

kpis:
  - id: requests
    name: Requests
    type: count
    event: request
  - id: error_rate
    name: Error rate
    type: ratio
    numerator: error
    denominator: request
    unit: "%"

faults:
  - id: connectivity
    name: Connectivity
    severity: high
    patterns: ['(?i)(connection refused|no route to host)']
    hint: "检查网络链路与上游服务健康状态。"
```

打开 Web UI 的「配置 → 领域包」即可完成日常管理，也可以直接编辑 YAML：

- 新建：在页内 YAML 编辑器从模板开始，保存前由后端校验。
- AI 生成：上传日志或填写服务器路径，AI 阅读有界样本后生成领域包草稿，
  进入编辑器人工确认后保存。
- 校验：保存前检查 ID、正则、KPI 引用和重复 ID。
- 编辑 / 复制 / 删除：默认领域包 `generic` 受保护，可复制后修改。
- 导入 / 导出：支持上传 YAML 导入，也可以把任意领域包导出为单文件 YAML。
- 预览：在 YAML 标签页查看当前表单生成的完整配置。

> AI 生成领域包是一个受控例外：只抽取少量样本行（默认最多 180 行、
> 约 60 KB）发送给模型，不会发送完整日志。日志内容始终被视为数据，
> 生成结果必须经过校验并由人工确认后才会落盘。

也可以把 YAML 放到 `packs/<id>/pack.yaml`，然后在 UI 中选择，或通过
`--pack <id>` 指定。

完整架构与路线图见 `docs/DESIGN.md`。

---

## 开发

```bash
# 后端
.venv/bin/ruff check backend/loglens backend/tests
.venv/bin/pytest

# 前端
npm run build
```

目录结构：

```
backend/
├── loglens/         # Python 包
│   ├── parsing.py   # 文件发现、编码、格式适配、多行合并
│   ├── templating.py # 动态 token 掩码 + 模板计数
│   ├── analysis.py  # DuckDB 存储、KPI、异常检测、日志查询
│   ├── llm.py       # Provider、提示词、护栏、确定性回退
│   ├── report.py    # Markdown + HTML 渲染
│   ├── pipeline.py  # 编排
│   ├── api.py       # FastAPI 应用
│   ├── log.py       # 应用运行日志
│   ├── pack_ai.py   # AI 生成领域包
│   └── cli.py
└── tests/           # pytest
packs/               # 领域包
app/                 # Next.js 15 路由
components/          # layout / providers / ui
lib/                 # api / hooks / format
examples/            # 示例日志
docs/                # 架构、Web UI、归档
```

---

## 运行日志

LogLens 会把应用自身的运行日志写入：

```text
data/logs/loglens.log
```

默认按 10 MB 轮转，保留 5 个历史文件。日志内容包含：

- Web/CLI 启动、配置路径和版本
- 分析任务创建、开始、完成、失败（含 traceback）
- 领域包创建/修改/复制/删除、AI 生成领域包
- LLM 请求的模型、HTTP 状态、耗时和失败原因
- 模型设置保存/连接测试（只记录是否设置密钥，不记录密钥内容）

日志不会记录原始日志内容、API Key 或完整提示词。可通过环境变量调整：

```bash
LOGLENS_LOG_LEVEL=INFO          # DEBUG / INFO / WARNING / ERROR
LOGLENS_LOG_DIR=data/logs       # 日志目录
LOGLENS_LOG_MAX_BYTES=10485760  # 单文件大小
LOGLENS_LOG_BACKUPS=5           # 历史文件数量
LOGLENS_LOG_DISABLE=0           # 设为 1 时只输出到 stderr
```

排查分析失败时，除了本日志，还可以查看
`data/runs/<run_id>/meta.json` 中的 `error` 字段和运行产物。

---

## API

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/health` | 存活检查 + 版本 |
| `GET` | `/api/packs` | 可用领域包 |
| `POST` | `/api/packs` | 新建领域包 |
| `POST` | `/api/packs/validate` | 校验领域包定义（不落盘） |
| `POST` | `/api/packs/generate` | 用 AI 阅读日志样本生成领域包草稿 |
| `POST` | `/api/packs/import` | 导入 YAML 领域包 |
| `POST` | `/api/packs/yaml` | 根据表单数据生成 YAML 预览 |
| `GET` | `/api/packs/{id}` | 领域包完整定义（事件 / KPI / 故障） |
| `PUT` | `/api/packs/{id}` | 更新领域包 |
| `DELETE` | `/api/packs/{id}` | 删除领域包（`generic` 受保护） |
| `GET` | `/api/packs/{id}/yaml` | 导出领域包 YAML |
| `POST` | `/api/packs/{id}/duplicate` | 复制领域包 |
| `GET` | `/api/config` | LLM / 数据目录状态 |
| `GET` | `/api/settings/llm` | 当前模型设置（不含 API Key） |
| `PUT` | `/api/settings/llm` | 保存模型设置 |
| `DELETE` | `/api/settings/llm` | 清除页面保存的模型设置 |
| `POST` | `/api/settings/llm/test` | 测试模型连接 |
| `POST` | `/api/settings/llm/import-opencode` | 从本机 OpenCode Go 导入配置 |
| `POST` | `/api/runs` | 创建运行（`files`、`archive`、`source_path`、`pack`、`use_llm`） |
| `GET` | `/api/runs` | 罗列运行记录 |
| `GET` | `/api/runs/{id}` | 运行元数据 + 概要 |
| `DELETE` | `/api/runs/{id}` | 删除某次运行及其产物 |
| `GET` | `/api/runs/{id}/report.html` | 渲染后的报告 |
| `GET` | `/api/runs/{id}/report.md` | Markdown 报告 |
| `GET` | `/api/runs/{id}/templates` | 挖掘出的模板（`q`、`severity`） |
| `GET` | `/api/runs/{id}/logs` | 原始记录（`q`、`level`、`template_id`、分页） |
| `GET` | `/api/runs/{id}/evidence` | 发送给模型的证据包 |
| `GET` | `/api/runs/{id}/artifacts/{name}` | CSV / JSON / Markdown / DuckDB 产物 |
| `GET` | `/api/runs/{id}/download.zip` | 打包下载全部产物 |

---

## 文档

- [docs/DESIGN.md](docs/DESIGN.md) —— 架构、数据模型、AI 护栏、路线图
- [docs/WEB_UI.md](docs/WEB_UI.md) —— 五页信息架构与 Pixel SaaS 视觉规范
- [docs/API.md](docs/API.md) —— REST 端点与调用示例
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) —— 生产部署、Docker、环境变量、Nginx
- [CHANGELOG.md](CHANGELOG.md) —— 版本记录
- [CONTRIBUTING.md](CONTRIBUTING.md) —— 开发与提交约定
- [AGENTS.md](AGENTS.md) —— 面向贡献者与编码代理的工程约束

---

## 限制（v0.1）

- **单进程。** 分析在本地线程池中运行；运行结束后，API 以只读方式打开
  DuckDB。分析期间读取会返回 409。
- **没有鉴权 / 多租户。** 仅适用于本地或可信内网环境。
- **去重启发式。** 重复行通过
  `时间戳 + 文件名 basename + 原始文本` 判断，这适用于单个实例的快照目录。
  如果你要分析多个实例且它们复用相同文件名，请关闭去重（规划中的选项）
  或将运行分开。
- **模板挖掘** 使用确定性 token 掩码，而不是 Drain3。它速度快且无额外依赖，
  但完整的 Drain3 适配器仍在路线图中。
- **暂不支持 PDF。** 目前产出 Markdown + HTML + CSV；PDF 是 P3 事项。
- **没有增量分析。** 每次运行都会重新解析输入。

---

## 许可证

MIT。参见 `LICENSE`。

本项目设计借鉴了一些开源项目的思路；归属与许可说明见 `docs/DESIGN.md`。
