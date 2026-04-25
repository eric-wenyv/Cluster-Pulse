# 项目结构与文件约定

本文档说明各目录和关键文件的用途，以及模块之间的依赖边界。

## 根目录

```
.
├── data/
│   ├── raw/              # 完整原始数据（gitignore，本地生成）
│   └── raw-sample/       # sample 原始数据（gitignore，本地生成）
├── doc/                  # 项目文档（本文档所在目录）
├── docs/                 # Vite 构建输出 + GitHub Pages 发布目录
│   ├── index.html        # 构建产物入口
│   ├── assets/           # 构建产物 JS/CSS
│   └── data/             # 构建时复制自 public/data/
├── public/
│   └── data/             # 开发时静态数据（JSON + bin）
├── scripts/              # Python / Bash 数据管道脚本
├── src/
│   ├── components/       # Vue 组件入口层
│   ├── core/             # 可视化内核
│   │   └── renderers/    # 各视图渲染器
│   ├── styles.css        # 全局样式
│   ├── main.ts           # 应用入口
│   └── App.vue           # 根组件
├── index.html            # 开发入口 HTML
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### `docs/` 的特殊性

`docs/` 是 Vite 的 `build.outDir`，同时也是 GitHub Pages 的发布源。这意味着：

- **不要直接手动修改 `docs/` 下的文件**，所有变更都应通过源码修改后执行 `npm run build` 生成。
- `docs/data/` 在构建时由 Vite 从 `public/data/` 复制而来。
- `docs/` 已加入 git，因为 GitHub Pages 需要从仓库读取静态文件。

## `src/components/` — Vue 组件层

| 文件 | 职责 |
|---|---|
| [App.vue](../src/App.vue) | 根组件。加载初始数据，加载成功渲染 ClusterPulseViewport，失败才渲染 AppStatus。 |
| [ClusterPulseViewport.vue](../src/components/ClusterPulseViewport.vue) | 可视化挂载容器。实例化 ClusterPulseApp，传递 AppData，生命周期绑定。 |
| [AppStatus.vue](../src/components/AppStatus.vue) | 数据加载失败时的错误面板，附数据生成命令提示。 |

## `src/core/` — 可视化内核

### 核心控制器

| 文件 | 职责 |
|---|---|
| [cluster-pulse-app.ts](../src/core/cluster-pulse-app.ts) | 核心控制器类 `ClusterPulseApp`。管理 AppState、事件监听、渲染调度、缓存和 tooltip。 |

### 数据与类型

| 文件 | 职责 |
|---|---|
| [data.ts](../src/core/data.ts) | 数据加载器。`loadInitialData()` 并行加载 5 个 JSON；`loadGrid()` 拉取二进制矩阵并校验长度。 |
| [types.ts](../src/core/types.ts) | 全部 TypeScript 类型定义。包括 AppState、AppData、GridData、各类渲染数据类型。 |
| [constants.ts](../src/core/constants.ts) | 常量定义：指标顺序、指标元数据（标签/颜色/描述）、图表边距、术语解释表。 |

### 工具函数

| 文件 | 职责 |
|---|---|
| [utils.ts](../src/core/utils.ts) | 通用工具：asset 路径解析、数字/百分比/时间格式化、窗口裁剪、grid 值读取、HTML 转义、术语标签渲染。 |
| [selectors.ts](../src/core/selectors.ts) | 数据选择器与派生计算。负责可见机器过滤、排序、窗口统计、峰值缓存。 |
| [templates.ts](../src/core/templates.ts) | 静态 HTML 模板生成。`renderShell()` 生成页面骨架；`renderMethodologyMarkup()` 生成方法说明文章。 |

### 渲染器 `src/core/renderers/`

渲染器之间没有横向依赖，各自独立向 `ClusterPulseApp` 提供服务。

| 文件 | 职责 |
|---|---|
| [overview-renderer.ts](../src/core/renderers/overview-renderer.ts) | Hero 区统计、摘要 ribbon、热点锚点列表。 |
| [controls-renderer.ts](../src/core/renderers/controls-renderer.ts) | 指标按钮组、筛选状态 badge、热力图过滤按钮。 |
| [heatmap-renderer.ts](../src/core/renderers/heatmap-renderer.ts) | 热力图 base Canvas 绘制、overlay 交互层、brush 时间轴、窗口卡片、图例。 |
| [explorer-renderer.ts](../src/core/renderers/explorer-renderer.ts) | 散点图、故障域条形图、排行表、单机四条资源曲线。 |

## `scripts/` — 数据管道

| 文件 | 职责 |
|---|---|
| [download_alibaba.sh](../scripts/download_alibaba.sh) | 下载 Alibaba trace 原始数据。支持 `full`（完整 tar.gz）和 `sample`（流式抽取前 N 行）两种模式。 |
| [build_data.py](../scripts/build_data.py) | 核心数据构建脚本。读取原始 CSV，聚合、清洗、计算热点，输出 JSON 和二进制矩阵。 |
| [verify_data.py](../scripts/verify_data.py) | 数据校验脚本。检查所有必需文件、二进制长度、索引一致性、窗口合法性。 |

## `data/` 与 `public/data/`

| 目录 | 说明 |
|---|---|
| `data/raw/` | 完整原始数据存放处（`machine_meta.tar.gz` + `machine_usage.tar.gz`）。由 `download_alibaba.sh full` 生成。**已加入 .gitignore。** |
| `data/raw-sample/` | sample 模式原始数据存放处。由 `download_alibaba.sh sample` 生成。**已加入 .gitignore。** |
| `public/data/` | 前端开发服务器使用的静态数据。由 `npm run data` 或 `npm run data:sample` 生成。开发时必须存在，否则页面无法加载。 |

## 模块边界约定

1. **Vue 组件不直接 import 渲染器**。组件只实例化 `ClusterPulseApp`，所有渲染细节封装在 `src/core/` 内部。
2. **渲染器不直接修改 AppState**。渲染器是纯函数，接收数据和回调；状态变更通过回调委托给 `ClusterPulseApp`。
3. **选择器不直接操作 DOM**。选择器只负责数据计算，返回派生状态供渲染器消费。
4. **模板只输出 HTML 字符串**。`templates.ts` 不绑定事件，事件监听由 `ClusterPulseApp.attachStaticListeners()` 统一管理。
5. **数据脚本不依赖前端代码**。`scripts/` 是独立的数据管道，输出格式由 `types.ts` 中的类型定义约定，双向修改需同步。
