# 合作指南

本文档说明如何参与本项目的开发，包括工作流程、代码规范和提交前检查。

## 分支策略

本项目采用标准 GitHub Flow，所有变更通过 Pull Request（PR）合并到 `main` 分支。

### 工作流

1. 从 `main` 切出特性分支：
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/xxx
   ```
2. 开发和本地提交
3. 推送分支到远程：
   ```bash
   git push -u origin feature/xxx
   ```
4. 在 GitHub 上创建 Pull Request，填写变更说明
5. 等待 CI 检查通过，并通过 Code Review
6. 使用 **Squash and Merge** 合并回 `main`
7. 删除远程和本地分支：
   ```bash
   git branch -d feature/xxx
   git push origin --delete feature/xxx
   ```

### 分支命名

| 前缀 | 用途 | 示例 |
|---|---|---|
| `feature/` | 新功能 | `feature/heatmap-zoom` |
| `fix/` | Bug 修复 | `fix/tooltip-position` |
| `docs/` | 文档更新 | `docs/deployment-guide` |
| `refactor/` | 重构 | `refactor/split-renderers` |
| `data/` | 数据管道变更 | `data/add-gpu-metric` |

### PR 规范

- **标题**：简洁描述变更内容，使用与 Commit 相同的前缀风格，如 `feat: add heatmap zoom interaction`
- **描述**：说明变更动机、主要改动点和测试方式
- **审查**：至少一名协作者批准后方可合并（单人维护时可自审后合并）
- **合并策略**：使用 Squash and Merge，保持 `main` 分支历史整洁


## Commit 规范

Commit message 采用简洁的英文前缀风格：

| 前缀 | 用途 |
|---|---|
| `feat:` | 新功能 |
| `fix:` | Bug 修复 |
| `refactor:` | 重构（不改变外部行为） |
| `docs:` | 文档更新 |
| `build:` | 构建相关（含数据更新导致的 `docs/` 重建） |
| `style:` | 纯样式调整（CSS、布局） |
| `chore:` | 杂项（依赖升级、配置调整等） |

示例：

```
feat: add disk metric prominence ranking
fix: heatmap overlay flicker on rapid brush
refactor: extract color palette builder to utils
docs: update methodology copy and term explanations
```

## 提交前检查清单

在提交代码前，必须完成以下检查：

```bash
# 1. 数据校验（如修改了数据或数据脚本）
npm run check:data

# 2. TypeScript 类型检查
npx tsc --noEmit

# 3. 生产构建
npm run build

# 4. 构建后验证预览
npm run preview
```

## 修改不同模块的注意事项

### 修改 `src/core/cluster-pulse-app.ts`

这是核心控制器，修改时需格外谨慎：

- **状态变更必须通过 `renderInteractiveViews()` 触发渲染**，不要直接调用 `executeRender()` 或单个渲染器。
- **新增交互事件时**，在 `attachStaticListeners()` 中统一注册，不要在渲染器内部绑定事件。
- **新增缓存字段时**，确保在 `ensureGridLoaded()` 和 `destroy()` 中正确初始化和清理。
- **注意 rAF 调度**：`renderInteractiveViews()` 使用 `requestAnimationFrame` 批量渲染，避免在一次事件处理中多次重绘。

### 修改渲染器

- 渲染器是纯函数，接收数据 + DOM 挂载点 + 回调，**不持有状态**。
- 渲染器内部使用 D3 时，优先使用 `d3-selection` 和 `d3-scale`，避免引入整个 D3 bundle（已配置 tree-shaking，但仍需注意）。
- 修改 Canvas 绘制逻辑后，在 1x 和 2x DPR 屏幕上都测试一下。

### 修改选择器

- 选择器返回派生数据，**不应有副作用**。
- 如果新增选择器，请参照现有模式实现缓存机制（cacheKey 比较）。
- `getVisibleMachineIndices()` 的 48 台上限是产品决策，修改前需确认对性能和可读性的影响。

### 修改模板

- `renderShell()` 生成的是完整页面骨架，修改 HTML 结构后需同步检查 `attachStaticListeners()` 中的选择器是否仍然命中。
- `renderMethodologyMarkup()` 中的文案支持 `renderTerm()` 自动绑定术语 tooltip，新术语需在 `constants.ts` 的 `TERM_EXPLANATIONS` 中定义。

### 修改数据脚本

- `scripts/` 下的脚本应保持可独立运行，不依赖前端构建环境。
- 修改后必须在 sample 和（如条件允许）full 两种模式下测试。
- 如果输出格式变化，**必须同步更新** `src/core/types.ts`、`verify_data.py`，并考虑提升 `manifest.json` 的 `version`。

## 数据文件协作提醒

- **`public/data/`** 开发时由各自环境本地生成，**不应提交到 git**（已配置 .gitignore）。
- **`docs/`** 由 GitHub Actions 自动构建并部署，**不再需要手动提交到 git**。如果你本地执行了 `npm run build`，生成的 `docs/` 变更无需 stage 和提交。
- 多人同时修改数据脚本时，各自本地重新运行 `npm run data:sample` 验证即可，无需关心构建产物的冲突。

## 扩展指引

### 新增一种可视化视图

1. 在 `src/core/types.ts` 中定义新视图所需的数据类型。
2. 在 `src/core/selectors.ts` 中新增选择器函数（如有需要）。
3. 在 `src/core/renderers/` 下新建渲染器文件，暴露接收 `(root, data, callbacks)` 签名的绘制函数。
4. 在 `templates.ts` 的 `renderShell()` 中添加新视图的 DOM 挂载点。
5. 在 `cluster-pulse-app.ts` 中：
   - 在 `executeRender()` 的差异渲染逻辑中注册新视图
   - 在 `destroy()` 中清理新增的全局监听器或资源

### 新增一种资源指标

见 [数据管道说明](04-data-pipeline.md) 中的「新增或修改指标」章节。
