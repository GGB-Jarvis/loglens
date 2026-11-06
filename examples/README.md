# 示例

| 路径 | 说明 |
|---|---|
| `demo/` | 连续四天的订单服务日志，每天一个文件。第 2 天发生库存超时故障；第 3 天发布后出现鉴权错误。 |
| `sample.log` | 同一服务的单日日志（第 2 天）。 |
| `jsonl/app.jsonl` | JSON-lines 格式，包含一次数据库超时突发。 |
| `make_sample.py` | 以确定性方式（`random.seed`）重新生成以上全部示例。 |

```bash
python examples/make_sample.py
loglens analyze examples/demo --pack generic --name demo --no-llm
loglens analyze examples/jsonl --pack generic --name jsonl --no-llm
```

`demo/` 的预期结果：约 1,900 条记录、约 174 条错误、6 个异常候选
（其中包括 2026-10-02 的错误突发和模板突增），以及同一天的
`error_rate` 偏离。
