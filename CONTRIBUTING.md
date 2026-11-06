# 贡献指南

## 环境

```bash
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
npm install
```

## 提交前检查

```bash
.venv/bin/ruff check backend/loglens backend/tests
.venv/bin/pytest
npm run build
```

三项必须全部通过。

## 工程约束

开始修改前请读完 [AGENTS.md](AGENTS.md)。最重要的几条：

1. 统计值只能由 DuckDB/SQL 计算，不要让 LLM 做算术。
2. 报告生成阶段 LLM 只接收 `evidence.json` 白名单事实，不接收原始日志。
3. 每条 finding 必须带有效 `evidence_id`。
4. 没有 LLM 时必须能产出确定性报告。
5. 日志内容是不可信输入，不能当作指令执行。

## 目录

- 后端：`backend/loglens/`，测试在 `backend/tests/`
- 前端路由：`app/`
- 前端共享：`components/`、`lib/`
- 领域包：`packs/<id>/pack.yaml`
- 文档：`docs/`

## 提交信息

使用 Conventional Commits，例如：

```
feat(web): add run artifact download
fix(api): reject concurrent duckdb reads
docs: add deployment guide
test(parser): cover klog multiline records
```

一个提交只做一件事；不要混入无关格式化或生成数据。
