# 本地开发指南

本文档说明如何在本地搭建开发环境、生成数据、启动调试和构建部署。

## 前置要求

- **Node.js** ≥ 18（推荐 LTS）
- **npm**（与 Node.js 捆绑）
- **Python** 3.10+
- **curl**、**tar**、**sha256sum**（用于下载原始数据）

验证环境：

```bash
node --version    # v18+ 或 v20+
npm --version     # 9+
python3 --version # 3.10+
```

## 安装依赖

```bash
npm install
```

这会安装 Vue 3、Vite、TypeScript、D3 及其类型定义。

## 数据准备

项目运行需要 `public/data/` 目录下的静态数据文件。有两种准备方式：

### 方式 A：使用 Sample 数据（推荐，首次开发）

Sample 数据体积小，下载快，足够用于前端开发和样式调试。

```bash
npm run data:sample
```

这条命令会：
1. 调用 `bash scripts/download_alibaba.sh sample` 流式下载 machine_meta 和 machine_usage 的前 120 万行
2. 调用 `python3 scripts/build_data.py` 生成聚合数据到 `public/data/`

完成后 `public/data/` 下应出现 6 个文件：

```
public/data/
├── manifest.json
├── machines.json
├── cluster-summary.json
├── hotspots.json
├── domains.json
└── machine-grid.bin
```

### 方式 B：使用完整数据

如果你需要基于全量数据做分析或验证：

```bash
bash scripts/download_alibaba.sh full
npm run data
```

完整数据下载约 4GB+（tar.gz 压缩包），聚合后 `machine-grid.bin` 会明显变大，构建产物也会更大。

### 校验数据

无论哪种方式，都建议校验生成的数据：

```bash
npm run check:data
```

校验项包括：
- 6 个必需文件是否齐全
- `machine-grid.bin` 长度是否与 manifest 声明一致
- `machines.json` 索引与 `domains.json`、`hotspots.json` 的交叉引用是否合法
- 时间窗口是否在合法范围内

## 启动开发服务器

```bash
npm run dev
```

Vite 默认监听 `http://localhost:5173/`。开发服务器支持热更新（HMR），修改 `src/` 下的源码会自动刷新页面。

**注意**：如果 `public/data/` 不存在，页面会加载失败并提示运行 `npm run data` 或 `npm run data:sample`。

## 开发调试建议

### 查看数据文件

开发服务器启动后，你可以直接访问静态数据文件验证内容：

```
http://localhost:5173/data/manifest.json
http://localhost:5173/data/machines.json
```

### 类型检查

项目使用 TypeScript，但没有配置独立的类型检查命令。你可以在编辑时依赖 IDE 的 TS 语言服务，或在提交前手动运行：

```bash
npx tsc --noEmit
```

`npm run build` 中已包含此步骤。

### 热力图数据延迟加载调试

`machine-grid.bin` 通过 `IntersectionObserver` 懒加载。如果你在页面顶部刷新后立刻想调试热力图，需要滚动到「机器资源热点热力图」区域触发加载。加载状态会显示为「正在加载热力图数据…」。

如果懒加载没有触发，检查控制台是否有 fetch 报错，或观察 Network 面板中 `machine-grid.bin` 的请求状态。

### 清理构建缓存

Vite 偶尔会出现 HMR 不同步的情况，此时可重启开发服务器：

```bash
# Ctrl+C 终止后重新启动
npm run dev
```

## 构建与预览

### 生产构建

```bash
npm run build
```

构建流程：
1. `npm run check:data` — 校验 `public/data/` 数据完整性
2. `tsc --noEmit` — TypeScript 类型检查
3. `vite build` — 打包前端资源到 `docs/`

构建产物位于 `docs/`，包含：
- `index.html`
- `assets/`（JS、CSS）
- `data/`（从 `public/data/` 复制的静态数据）

### 本地预览生产构建

```bash
npm run preview
```

默认在 `http://localhost:4173/` 启动预览服务器，用于确认构建产物是否正常。

### 部署

项目已配置 GitHub Actions 自动部署。PR 合并到 `main` 后，CI 会自动执行 `npm run build` 并将产物部署到 GitHub Pages，无需手动提交 `docs/`。

如需在本地验证生产构建效果：

```bash
npm run build
npm run preview
```

## 常见问题

**Q: `npm run dev` 启动后页面白屏，控制台报数据加载失败。**  
A: 检查 `public/data/` 是否存在。如果不存在，先运行 `npm run data:sample`。

**Q: 修改了数据脚本后，前端没有变化。**  
A: 数据脚本修改后需要重新执行 `npm run data`（或 `npm run data:sample`）生成新的 `public/data/`，然后刷新页面。Vite HMR 不监控 `public/data/` 的内部文件变化。

**Q: `npm run build` 失败，提示数据校验不通过。**  
A: 运行 `npm run check:data` 查看具体错误。常见原因：
- `machine-grid.bin` 长度与 manifest 不一致（可能是构建脚本被中断）
- `public/data/` 下缺少必需文件

**Q: 想修改热点算法或指标定义，应该改哪里？**  
A: 修改 `scripts/build_data.py` 中对应逻辑，然后重新运行 `npm run data:sample`。注意同步更新 `src/core/types.ts` 和 `src/core/constants.ts` 中的类型/元数据。
