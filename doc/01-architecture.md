# 架构说明

本文档描述 Cluster Pulse 的整体系统架构、前端渲染模式、数据流和核心设计决策。

## 系统全景

```
┌─────────────────────────────────────────────────────────────────┐
│                        数据源层                                   │
│  Alibaba Cluster Trace 2018 (machine_meta + machine_usage)       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        数据管道 (Python 3)                        │
│  download_alibaba.sh → build_data.py → verify_data.py            │
│  输出: JSON 元数据 + machine-grid.bin 压缩矩阵                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        前端应用 (浏览器)                           │
│  Vue 3 组件壳 + ClusterPulseApp 命令式渲染内核                    │
│  部署目标: GitHub Pages (docs/ 目录)                              │
└─────────────────────────────────────────────────────────────────┘
```

整个系统是无后端架构：原始 trace 数据经 Python 脚本离线预处理后，生成一组静态文件（JSON + 二进制），由前端直接加载并渲染。

## 前端架构：混合渲染模式

前端采用** Vue 3 声明式模板 + D3 命令式渲染**的混合架构。

### 组件层（Vue）

Vue 组件仅承担**挂载入口**和**生命周期管理**职责：

- [App.vue](../src/App.vue) — 根组件，负责调用 `loadInitialData()` 加载首屏 JSON。加载成功渲染 `ClusterPulseViewport`，失败才渲染 `AppStatus`，加载过程中不显示任何占位页。
- [ClusterPulseViewport.vue](../src/components/ClusterPulseViewport.vue) — 纯粹的挂载容器，在 `onMounted` 中实例化 `ClusterPulseApp`，在 `onBeforeUnmount` 中调用 `destroy()`。
- [AppStatus.vue](../src/components/AppStatus.vue) — 数据加载失败时的错误提示面板。

Vue 不管理任何可视化状态或 DOM 更新。所有图表 DOM 由 `ClusterPulseApp` 直接操作。

### 内核层：ClusterPulseApp

[ClusterPulseApp](../src/core/cluster-pulse-app.ts) 是整个可视化的核心控制器，采用类似 MVC 的分层结构：

```
┌──────────────────────────────────────────┐
│           ClusterPulseApp                 │
│  (控制器: 状态管理 + 事件监听 + 渲染调度)   │
└──────────────────────────────────────────┘
              │
    ┌─────────┴─────────┐
    ↓                   ↓
┌─────────┐      ┌─────────────┐
│ AppState │      │  Selectors  │
│ (模型)   │      │  (数据派生)  │
└─────────┘      └─────────────┘
    │                   │
    └─────────┬─────────┘
              ↓
    ┌─────────────────┐
    │    Renderers    │
    │   (视图渲染)     │
    └─────────────────┘
```

#### 状态模型 AppState

[AppState](../src/core/types.ts) 是单一事实来源，包含五个字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `metricId` | `MetricId` | 当前选中的指标（cpu / memory / network / disk） |
| `timeWindow` | `[number, number]` | 当前时间窗口，以 bin 索引表示 |
| `activeDomainId` | `string \| null` | 当前激活的故障域过滤 |
| `selectedMachineIndex` | `number \| null` | 当前选中的机器 |
| `machineFilterIndices` | `number[] \| null` | 主图框选产生的机器子集过滤 |

任何用户交互最终都体现为对 `AppState` 的修改，随后触发 `renderInteractiveViews()` 重新渲染。

#### 选择器 Selectors

[selectors.ts](../src/core/selectors.ts) 负责从 `AppState` 和原始数据派生渲染所需视图数据。所有选择器都带缓存机制，避免重复计算：

- `getVisibleMachineIndices()` — 根据当前指标和故障域过滤，返回可见机器索引列表，并按峰值排序。最多返回 48 台，防止热力图过于密集。
- `getFilteredMachineIndices()` — 在可见机器基础上应用框选过滤。
- `getWindowMachineStats()` — 为当前窗口内的每台可见机器计算均值、峰值、主导指标等统计量。

#### 渲染器 Renderers

渲染器是纯粹的绘制函数，接收数据和 DOM 挂载点，执行命令式 DOM/Canvas 操作。

| 渲染器 | 文件 | 职责 |
|---|---|---|
| overview-renderer | `renderers/overview-renderer.ts` | Hero 区域统计数字、摘要 ribbon、热点列表 |
| controls-renderer | `renderers/controls-renderer.ts` | 指标切换按钮、筛选状态 badge、热力图过滤按钮 |
| heatmap-renderer | `renderers/heatmap-renderer.ts` | 主热力图 Canvas 绘制、brush 时间轴、框选交互 overlay |
| explorer-renderer | `renderers/explorer-renderer.ts` | 散点图、故障域条形图、排行表、单机四指标曲线 |

[templates.ts](../src/core/templates.ts) 提供页面静态 HTML 骨架（`renderShell()`），渲染器在此基础上填充动态内容。

## 数据加载策略

前端数据分两级加载，以控制 GitHub Pages 首屏体积：

1. **首屏 JSON（同步并行加载）** — `loadInitialData()` 并行拉取 `manifest.json`、`machines.json`、`cluster-summary.json`、`hotspots.json`、`domains.json`。这些文件体积小，承载页面标题、热点列表、故障域结构等元信息。
2. **二进制网格（懒加载）** — `machine-grid.bin` 是真正的时序矩阵（machineCount × binCount × 4 metrics，每格 1 byte）。它通过 `IntersectionObserver` 延迟加载：只有当用户滚动到 `#pulse` 区域进入视口时才触发 `loadGrid()`。

二进制格式采用扁平 Uint8Array，按 `[metricIndex][binIndex][machineIndex]` 排布，`255` 表示缺失值。这种格式比 JSON 紧凑数十倍。

## 交互与渲染调度

所有交互遵循统一的事件循环：

```
用户交互（点击/框选/brush）
    ↓
修改 AppState
    ↓
renderInteractiveViews() → requestAnimationFrame
    ↓
executeRender() — 差异渲染
    ↓
各 Renderer 按需更新 DOM/Canvas
```

`executeRender()` 会对比前后状态，只重新渲染真正变化的部分：

- 指标切换 → 重绘热力图 base + overlay、brush、散点图、故障域图、排行表、单机曲线
- 时间窗口变化 → 重绘 brush、散点图、故障域图、排行表、单机曲线
- 故障域过滤 → 重绘热力图 base（机器排序改变）、散点图、故障域图、排行表、单机曲线
- 机器选中 → 仅重绘单机曲线和 overlay 高亮

## 关键设计决策

### 为什么用命令式 D3 而不是 Vue 响应式渲染图表？

本项目涉及大量自定义 Canvas 绘制、D3 scale/axis/brush 的精细控制和复杂的交叉高亮逻辑。Vue 的虚拟 DOM 和响应式系统对这类高度优化的可视化场景反而是负担。采用命令式渲染可以直接操作 Canvas 和 SVG，避免不必要的 diff 开销，也方便实现 tooltip、pointer capture 等底层交互。

### 为什么选择静态数据 + GitHub Pages，而不是服务端？

数据集是固定的历史 trace，没有实时更新需求。静态聚合后体积可控（sample 模式下整个数据包约数百 KB），无需维护后端服务，部署成本为零。

### 为什么热力图机器数限制为 48 台？

在 sample 数据集中，原始机器数约数百台。全部渲染会导致 Canvas 行高过密、交互命中率下降、视觉辨识度变差。选择器按当前指标的峰值排序并截取 Top 48，既保留了最热点的机器，又保证了渲染性能和可读性。
