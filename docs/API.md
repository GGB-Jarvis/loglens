# API 参考

Base URL：`http://127.0.0.1:8000`。交互式文档：`/docs`，OpenAPI JSON：`/openapi.json`。

Web UI 不直接跨域请求后端；Next.js 通过 rewrite 把同源 `/api/*`
转发到 FastAPI。

## 约定

- 请求/响应均为 JSON，文件上传使用 `multipart/form-data`。
- 分析创建返回 `202`，随后通过 `GET /api/runs/{id}` 轮询状态。
- 运行期间读取同一 DuckDB 返回 `409`；运行结束后才可查询。
- 错误使用 FastAPI 的 `detail` 字段；可能是字符串或校验错误对象。
- 没有鉴权。请只部署在本地或可信内网，或在外层网关做认证。

## 端点

### 健康与配置

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/health` | 存活检查与版本 |
| `GET` | `/api/config` | 数据目录、LLM 是否配置 |
| `GET` | `/` | API 元信息（JSON） |

### 运行

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/runs` | 创建分析，返回 `202` |
| `GET` | `/api/runs` | 运行列表（含状态、统计） |
| `GET` | `/api/runs/{id}` | `{ run, summary }` |
| `DELETE` | `/api/runs/{id}` | 删除运行及全部产物 |
| `GET` | `/api/runs/{id}/report.html` | HTML 报告 |
| `GET` | `/api/runs/{id}/report.md` | Markdown 报告 |
| `GET` | `/api/runs/{id}/evidence` | 证据包 JSON |
| `GET` | `/api/runs/{id}/templates` | 模板列表 |
| `GET` | `/api/runs/{id}/logs` | 原始日志分页 |
| `GET` | `/api/runs/{id}/artifacts/{name}` | 白名单产物文件 |
| `GET` | `/api/runs/{id}/download.zip` | 打包下载 |

`POST /api/runs` 的 multipart 字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `files` | 三选一 | 一个或多个日志文件 |
| `archive` | 三选一 | `.zip` 压缩包 |
| `source_path` | 三选一 | 服务器端目录或文件 |
| `pack` | 否 | 领域包 ID，默认 `generic` |
| `name` | 否 | 运行名称 |
| `use_llm` | 否 | `true` / `false`，默认 `true` |

`GET /api/runs/{id}/templates` 参数：`q`、`severity`、`limit`。

`GET /api/runs/{id}/logs` 参数：`q`、`level`、`template_id`、`file`、
`line`、`limit`（最大 500）、`offset`。

### 领域包

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/packs` | 领域包列表 |
| `POST` | `/api/packs` | 新建领域包（JSON） |
| `POST` | `/api/packs/validate` | 校验定义，不落盘 |
| `POST` | `/api/packs/import` | 从 YAML 导入或覆盖 |
| `POST` | `/api/packs/generate` | 用有界样本 + LLM 生成草稿 |
| `POST` | `/api/packs/yaml` | 把定义渲染成 YAML |
| `GET` | `/api/packs/{id}` | 完整定义 |
| `PUT` | `/api/packs/{id}` | 更新定义 |
| `DELETE` | `/api/packs/{id}` | 删除（`generic` 受保护） |
| `GET` | `/api/packs/{id}/yaml` | 导出 YAML |
| `POST` | `/api/packs/{id}/duplicate` | 复制 |

`POST /api/packs/import` 请求体：

```json
{ "content": "id: my-service\n...", "overwrite": false }
```

`POST /api/packs/generate` 使用 multipart：

| 字段 | 说明 |
|---|---|
| `files` | 一个或多个样本日志 |
| `archive` | `.zip` 样本 |
| `source_path` | 服务器端路径 |
| `pack_id` | 可选，目标 ID |
| `name` | 可选，显示名 |
| `hint` | 可选，领域提示 |

生成结果不会自动落盘；需要再调用 `/api/packs/import` 或在 Web 编辑器中保存。

### 模型设置

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/settings/llm` | 当前设置（不含 Key 明文） |
| `PUT` | `/api/settings/llm` | 保存页面设置 |
| `DELETE` | `/api/settings/llm` | 清除页面设置 |
| `POST` | `/api/settings/llm/test` | 测试连接 |
| `POST` | `/api/settings/llm/import-opencode` | 从本机 OpenCode Go 导入 |

## 示例

### 创建一次不启用 LLM 的分析

```bash
curl -X POST http://127.0.0.1:8000/api/runs \
  -F "files=@examples/demo/app-2026-10-01.log" \
  -F "files=@examples/demo/app-2026-10-02.log" \
  -F "pack=generic" \
  -F "name=演示运行" \
  -F "use_llm=false"
```

响应：

```json
{
  "id": "20261106-143000-ab12cd",
  "status": "queued",
  "name": "演示运行",
  "pack": "generic",
  "progress": 0
}
```

轮询：

```bash
curl http://127.0.0.1:8000/api/runs/20261106-143000-ab12cd
```

`run.status` 为 `done` 后下载报告：

```bash
curl -o report.md \
  http://127.0.0.1:8000/api/runs/20261106-143000-ab12cd/report.md
```

### 校验并保存领域包

```bash
# 1) 校验一个 JSON 定义（不落盘）
curl -X POST http://127.0.0.1:8000/api/packs/validate \
  -H "Content-Type: application/json" \
  --data '{"id":"my-service","name":"My Service"}'

# 2) 用完整 YAML 导入；overwrite=true 覆盖同 ID 包
curl -X POST http://127.0.0.1:8000/api/packs/import \
  -H "Content-Type: application/json" \
  --data '{"content":"id: my-service\nname: My Service\nversion: 1.0.0\nevents: []\nkpis: []\nfaults: []\n","overwrite":false}'
```
