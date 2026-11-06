# LogLens Web UI — 五页像素工作台

Next.js 15 App Router + Tailwind v4。营销页是 Server Component；
五个产品页是 Client Component，因为要读取实时运行上下文并轮询进度。
没有 Tailwind 之外的 UI 依赖，图表与图标全部内联 SVG。

```bash
npm install
npm run dev
```

## 信息架构

不按技术模块切页，按维护人员真正会问的问题切页。跨页只共享运行上下文。

| 路由 | 页面 | 回答的问题 | 整合进来的功能 |
|---|---|---|---|
| `/` | 页面地图 | 为什么是这五页？ | 五个工作区说明、旧入口合并理由、证据边界 |
| `/runs` | 运行 | 日志从哪来，跑到哪一步？ | 新建分析、上传文件 / zip、服务器路径、领域包选择、LLM 开关、队列、进度、运行历史、删除、产物归档 |
| `/diagnose` | 诊断 | 哪里偏离了基线？ | 总览、5 个 KPI、小时趋势、按日表、异常列表、严重度分布、Top 故障、Top 模板、模块错误量、解析率 |
| `/report` | 报告 | 发生了什么，证据在哪？ | AI 报告、确定性回退、findings、置信度、影响 / 建议、证据包、引用回查、Markdown / HTML |
| `/logs` | 日志 | 这条结论对应哪一行？ | 模板聚合、模板搜索、级别过滤、原文搜索、模板下钻、分页、文件定位、引用复制 |
| `/configure` | 配置 | 下次怎么复现？ | 领域包列表、页内 YAML 新建 / 编辑 / 复制 / 删除 / 导入导出、AI 生成草稿，模型 Base URL / 模型 / API Key / 超时 / 连接测试 / OpenCode 导入 |

## 视觉方向：Pixel SaaS

面向软件调试与维护人员，第一印象是清爽舒适，而不是游戏化。
像素语言用于结构，不用于噪音。

### 颜色

| Token | 值 | 用途 |
|---|---|---|
| `paper` | `#f3f6fb` | 页面底色 |
| `surface` | `#ffffff` | 面板 / 表格 |
| `ink` | `#0a1022` | 文字、2px 结构线、深色控制台 |
| `muted` | `#57647c` | 次级文字 |
| `brand` | `#2563eb` | 主操作、选中态、峰值 |
| `ok` / `warn` / `danger` | `#047857` / `#b45309` / `#dc2626` | 只表达数据语义 |

所有颜色都走 `app/globals.css` 的 `@theme` token；页面里不写一次性色值。

### 像素结构

- 全局圆角为 0；主面板使用 2px 墨线 + 6px 硬阴影，阴影不使用模糊。
- 面板左上角固定 8px 品牌色方块；深色面板使用品牌色硬阴影。
- 按钮按下时位移 3px 并收起阴影；`prefers-reduced-motion` 下全部退化为即时状态。
- 图标为 16×16 网格、2px 方头描边、`shape-rendering: crispEdges`。
- 图表使用整数坐标的块状柱体与点阵网格，不使用平滑曲线。
- 进度 / 置信度使用分段方块（`PixelMeter`），不用连续进度条。
- 纹理只用 2px 棋盘 pattern（`px-dither` / `px-dither-brand`），**不使用渐变**。

### 排版与间距

- 8px 间距基线；区块垂直节奏为 24px 的整数倍（48 / 72 / 96）。
- 标题用系统无衬线 + 紧字距；标签、数字、表格用等宽字体。
- 页面标题左侧带像素光标，作为唯一的持续动效；尊重 reduced motion。
- 12 列非对称网格；禁止三栏等宽卡片，统计信息一律用带分隔线的横条。

### 无障碍

- 所有可点击元素有可见焦点环（3px 品牌色）。
- 正文与次级文字对白底 ≥ 4.5:1；深色面板的说明文字不低于 60% 白。
- 图标按钮带 `aria-label`；装饰性 SVG 统一 `aria-hidden`。
- 导航使用 `aria-current="page"`；表格保留语义表头。
- 交互只依赖原生 `Link` / `details` / `summary` / 表单控件；数据页通过
  `RunProvider` 和 `useRunData` 做客户端轮询，不引入状态管理库。

## 前端目录

```
app/
├── (marketing)/page.tsx        # 页面地图
├── (product)/                  # 五个工作区
│   ├── runs/ diagnose/ report/ logs/ configure/
├── layout.tsx                  # RunProvider + 全站 metadata
└── globals.css                 # Pixel SaaS tokens 与组件原语
components/
├── layout/                     # ProductShell、PageHead
├── providers/                  # RunProvider 运行上下文
└── ui/                         # icons / primitives / index barrel
lib/
├── api/                        # client.ts + types.ts + index.ts
├── hooks/                      # useRunData
└── format.ts                   # 数字 / 时间 / 状态格式化
```

共享 UI 原语从 `@/components/ui`、API 从 `@/lib/api` 的 barrel 引入；
布局与运行上下文分别从 `@/components/layout`、`@/components/providers`
直接引入。新增 API 类型写入 `lib/api/types.ts`，新增请求函数写入
`lib/api/client.ts`。

## 数据加载

- `components/providers/run-context.tsx` 负责全局运行列表、选中运行、
  模型状态；有排队或运行中的任务时每 2.5 秒刷新一次。
- `lib/hooks/use-run-data.ts` 负责单个运行的 summary 与 anomalies；
  运行中每 2 秒刷新。
- 所有请求都走 `lib/api/client.ts`，由 `next.config.ts` 把 `/api/*`
  反代到 FastAPI；浏览器不直接持有 API Key。
