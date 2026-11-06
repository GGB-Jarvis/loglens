# SBD Core 领域包

面向机场 SBD（自助行李托运）CoreServer 日志，覆盖称重、读码、AI 识别、
状态机、CUSS 命令、PLC/串口/BHS 通信和打印设备。

## 日志格式

```text
[2026-10-29 11:36:31.080] [71438] [info] [CoreServer]  State transition: ...
```

- 适配器：显式 `line_regex`
- 时间格式：`%Y-%m-%d %H:%M:%S.%f`
- 文件：`applog*.log` / `*.log`
- 已排除目录：`analysis`、`images`、`data`、`.git`

## 业务口径

- **托运尝试**：`Found valid bag, requesting auto adjust`
- **托运成功**：状态机 `Reason: Xray check success`
- **Xray 拒检**：状态机 `Reason: Xray check reject`
- **检查失败**：`Bag inspection fail`
- **读码完成**：`Finish receiving tag.`
- **AI 超时**：`AI response timeout`

`success_rate` = 托运成功 / 托运尝试，方向为 `up`（越高越好）。
`tag_read_rate` = 读码完成 / 托运尝试，用于观察识别链路。
`ai_timeout_rate` = AI 超时 / 托运尝试，方向为 `down`（越低越好）。

## 实测结果

样本：`D:\LogsBackup\E19\20261029\10.10.10.2\core`（WSL 下为
`/mnt/d/LogsBackup/E19/20261029/10.10.10.2/core`），2 个文件约 35.7 万行。

- 解析率：99.999%（4 行解析失败）
- 托运尝试 / 成功：834 / 156
- 读码完成：242
- 卡包事件：727
- 设备离线/端口异常：191,568
- 状态 JSON 解析失败：49,337
- PLC 通信异常：7,465
- 串口异常：1,366

高频故障与真实日志一致：称重秤离线、称重秤/3D 相机/ATR/RFID 状态解析失败、
PLC/串口通信异常、打印机异常、卡包。

## 调整建议

- 如果只需要分析最近一段日志，在页面把来源指向单个文件
  `.../core/applog.log`，而不是整个目录。
- 如果现场设备命名或状态机文案不同，优先调整 `events` 里的正则和
  `kpis` 的事件引用。
- 告警阈值和“成功”定义属于业务口径，建议与现场运维确认后再改。
