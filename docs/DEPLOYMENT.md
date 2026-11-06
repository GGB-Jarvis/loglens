# 部署指南

LogLens 由两个进程组成：

| 进程 | 默认端口 | 作用 |
|---|---|---|
| FastAPI（`loglens serve`） | `8000` | 分析、DuckDB、领域包、模型设置、全部 `/api/*` |
| Next.js（`npm run dev/start`） | `3000` | 五页 Web UI，把 `/api/*` 反代到 FastAPI |

两者可以分开部署，也可以放在同一台内网主机上。

---

## 1. 本地开发

```bash
# 终端 1：API
.venv/bin/loglens serve --host 127.0.0.1 --port 8000

# 终端 2：Web
npm install
npm run dev
```

打开 <http://127.0.0.1:3000>。API 文档在 <http://127.0.0.1:8000/docs>。

前端通过 `next.config.ts` 的 rewrite 访问 `/api/*`，目标地址由
`LOGLENS_API_URL` 决定（默认 `http://127.0.0.1:8000`）。

---

## 2. 生产构建

```bash
# 后端
python3 -m venv .venv
.venv/bin/pip install "."

# 前端
npm ci
npm run build
```

启动：

```bash
# 终端 1
LOGLENS_DATA_DIR=/var/lib/loglens/data \
LOGLENS_PACKS_DIR=/var/lib/loglens/packs \
.venv/bin/loglens serve --host 0.0.0.0 --port 8000

# 终端 2
LOGLENS_API_URL=http://127.0.0.1:8000 \
npm run start -- -p 3000
```

`LOGLENS_API_URL` 需要在启动 Next.js 时可用。建议让 Next.js 只监听
`127.0.0.1`，由 Nginx / Caddy 对外提供 HTTPS。

---

## 3. Docker（仅 API）

仓库提供的 `Dockerfile` 只构建 FastAPI 后端。前端使用 Node 运行时独立部署。

```bash
docker compose up --build
```

Compose 会：

- 暴露 `8000` 端口；
- 把 `./data` 挂到 `/app/data`；
- 把 `./packs` 以只读方式挂到 `/app/packs`；
- 读取 `.env` 中的 `LOGLENS_LLM_*` 变量。

如果要容器化前端，需要单独构建 Next.js 镜像，并在运行时设置
`LOGLENS_API_URL` 指向 API 容器。

---

## 4. 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `LOGLENS_API_URL` | `http://127.0.0.1:8000` | Next.js 的 API 反代目标 |
| `LOGLENS_DATA_DIR` | `./data` | 运行记录、缓存、日志的根目录 |
| `LOGLENS_PACKS_DIR` | `./packs` | 领域包目录 |
| `LOGLENS_LLM_BASE_URL` | 空 | OpenAI 兼容端点，需包含 `/v1` |
| `LOGLENS_LLM_MODEL` | 空 | 模型名 |
| `LOGLENS_LLM_API_KEY` | 空 | API Key；页面保存的配置优先 |
| `LOGLENS_LLM_TIMEOUT` | `120` | 请求超时（秒） |
| `LOGLENS_LLM_MAX_TOKENS` | `4000` | 单次生成上限 |
| `LOGLENS_LLM_SESSION_ID` | 空 | 部分网关需要的会话头 |
| `LOGLENS_LOG_LEVEL` | `INFO` | 应用日志级别 |
| `LOGLENS_LOG_DIR` | `<data>/logs` | 应用日志目录 |
| `LOGLENS_LOG_MAX_BYTES` | `10485760` | 单文件轮转大小 |
| `LOGLENS_LOG_BACKUPS` | `5` | 保留的历史日志数 |
| `LOGLENS_LOG_DISABLE` | `0` | 设为 `1` 时只输出到 stderr |

模型也可以在 Web「配置 → 模型」中保存，写入
`data/config/llm.json`（已被 git 忽略）。页面设置优先于环境变量。

---

## 5. Nginx 反向代理

推荐只对外暴露 Next.js，由 Next.js 反代 `/api/*`：

```nginx
server {
    listen 443 ssl;
    server_name loglens.example.com;

    client_max_body_size 512m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

上传大文件或等待 LLM 生成时，需要同步放宽 `client_max_body_size` 与
`proxy_read_timeout`。

---

## 6. 数据与备份

| 路径 | 内容 | 是否必须备份 |
|---|---|---|
| `data/runs/<run_id>/` | 运行产物、DuckDB、报告 | 是 |
| `data/config/llm.json` | 页面保存的模型设置（含 API Key） | 按需，注意保密 |
| `data/cache/template_labels.json` | 模板分类缓存 | 否，可重建 |
| `data/logs/loglens.log` | 应用日志 | 按需 |
| `packs/` | 领域包源码 | 是 |

备份时直接复制 `data/runs` 与 `packs` 即可；DuckDB 文件在运行结束后才可安全读取。

---

## 7. 安全清单

- 不要把 `8000` 端口直接暴露到公网；至少放在内网或反向代理之后。
- LogLens 没有用户体系与权限；多人使用时请用网关做认证。
- `data/config/llm.json` 含 API Key，权限建议 `600`。
- 日志内容被当作不可信数据；不要关闭提示词隔离。
- 服务器路径读取接口只应在可信环境开放。

---

## 8. 排障

| 现象 | 检查 |
|---|---|
| 页面 `/api/*` 404 或 502 | `LOGLENS_API_URL` 是否正确；API 是否已启动 |
| 分析一直排队 | `data/runs/<id>/meta.json` 的 `status`、`error`；`data/logs/loglens.log` |
| 上传大文件失败 | 反向代理的 `client_max_body_size` |
| LLM 未配置 | 「配置 → 模型」保存后点「测试连接」；或检查环境变量 |
| 端口被占用 | `loglens serve --port <port>`；`npm run start -- -p <port>` |
