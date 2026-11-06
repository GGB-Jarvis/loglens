# 领域包

领域包用于教 LogLens 如何阅读某一个软件的日志。它就是一个 `pack.yaml`
文件，不需要修改任何 Python 代码。

日常管理可以直接在 Web UI 左侧「领域包」中完成：表单化新建/编辑、校验、
复制、删除、导入与导出 YAML。也可以点击「AI 生成领域包」，上传日志或填写
服务器路径，让模型阅读少量样本后生成草稿，再人工确认保存。
`generic` 默认包受保护，建议复制后修改。下面的 YAML 结构仍然是理解领域包
和排查问题的最佳参考。

```
packs/
├── generic/pack.yaml   # 与格式无关的起始模板
└── nginx/pack.yaml     # 访问日志 + 上游错误的组合
```

## 最小领域包

```yaml
id: my-service
name: My Service
version: "1.0"
description: 这个软件是做什么的。

ingest:
  include_globs: ["*.log", "*.log.*"]
  exclude_dirs: [".git", "node_modules", "data"]
  encodings: ["utf-8", "gbk", "latin-1"]
  # 可选：命名组为 ts/level/module/thread/message。
  # 不配置时，会使用内置适配器（bracket、JSON、syslog、nginx、klog）。
  line_regex: '^\[(?P<ts>[^\]]+)\]\s+\[(?P<level>\w+)\]\s+\[(?P<module>[^\]]+)\]\s+(?P<message>.*)$'
  ts_formats: ["%Y-%m-%d %H:%M:%S.%f"]
  multiline: true

events:
  - id: request
    name: 请求
    pattern: '(?i)\b(GET|POST|PUT|DELETE)\s+/'
    category: traffic

kpis:
  - id: requests
    name: 请求数
    type: count
    event: request
  - id: error_rate
    name: 错误率
    type: ratio
    numerator: error
    denominator: request
    unit: "%"
    direction: down     # 越低越好 -> 上升会被标记为异常

faults:
  - id: connectivity
    name: 连接故障
    severity: high
    patterns: ['(?i)(connection refused|no route to host)']
    hint: 检查 DNS、防火墙以及上游服务健康状态。
```

## 规则

- `id` 必须唯一，并建议与目录名保持一致。
- 正则使用 Python 语法；命名组区分大小写。
- `direction` 仅对比率型 KPI 生效：`up` = 越高越好（默认），
  `down` = 越低越好（错误率、延迟）。
- `events` 与 `faults` 都匹配 `message`；事件可以要求最低 `level`
  或某个模块子串。
- `include_globs` 尽量收紧。`discover` 按**相对扫描根目录**的目录名排除，
  而不是绝对路径。

## 测试领域包

```bash
loglens analyze ./logs --pack ./packs/my-service/pack.yaml --no-llm
```

检查 `templates.csv`（解析质量）、`events.csv`（事件命中）和
`summary.json`（KPI 是否合理）。解析率低于 99% 通常意味着行正则或编码列表
还需要调整。
