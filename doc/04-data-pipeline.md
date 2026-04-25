# 数据管道说明

本文档详细描述从原始 trace 到前端静态数据文件的完整处理流程、输出格式和修改注意事项。

## 数据来源

- **数据集**: Alibaba Cluster Trace 2018
- **使用的表**:
  - `machine_meta.csv` — 机器元数据（machine_id, failure_domain_1, failure_domain_2, cpu_num, mem_size, status）
  - `machine_usage.csv` — 机器利用率（machine_id, timestamp, cpu_util_percent, mem_util_percent, net_in, net_out, disk_io_percent）
- **官方文档**: 见 `manifest.json` 中的 `sources.datasetDocsUrl` 和 `sources.datasetSchemaUrl`

## 处理流程

```
machine_meta.tar.gz ──┐
                      ├─→ build_data.py ──→ 6 个输出文件 ──→ verify_data.py
machine_usage.tar.gz ─┘        ↑
                          download_alibaba.sh
```

### Step 1: 下载原始数据

[scripts/download_alibaba.sh](../scripts/download_alibaba.sh) 负责从阿里云 OSS 下载原始数据。

支持两种模式：

| 模式 | 命令 | 说明 |
|---|---|---|
| full | `bash scripts/download_alibaba.sh full` | 下载完整 tar.gz 压缩包，校验 SHA256 |
| sample | `bash scripts/download_alibaba.sh sample` | 流式抽取 machine_usage 的前 120 万行，配合完整 machine_meta |

download 后的文件存放位置：
- full → `data/raw/`
- sample → `data/raw-sample/`

### Step 2: 构建聚合数据

[scripts/build_data.py](../scripts/build_data.py) 是核心处理脚本，执行以下步骤：

#### 2.1 解析 machine_meta

- 按 machine_id 去重，保留时间戳最新的记录
- 提取 failure_domain_1 / failure_domain_2 作为两层故障域
- 收集每台机器的状态变更事件序列

#### 2.2 读取 machine_usage 并聚合

- 按 `bin_seconds`（默认 900s = 15min）分桶
- 对同机器同时间桶内的指标取平均
- 网络指标取 `max(net_in, net_out)` 的峰值
- 缺失或非法值（< 0, > 100, -1, 101）丢弃

#### 2.3 机器筛选与索引重建

- 过滤掉没有任何 usage 记录的机器
- 按 `(failure_domain_1, failure_domain_2, machine_id)` 排序，建立新索引
- 为每台机器计算：
  - `availableBins` — 有效时间桶数
  - `globalPeakScore` — 全周期内最强热点的 CDF 分位数得分
  - `globalPeakMetric` — 达到全局峰值的指标
  - `peakBin` — 峰值所在时间桶

#### 2.4 热点检测

- 使用最小堆维护 Top 256 个候选热点
- 每个热点按 `(score, peak_value, old_index, peak_bin, metric_index)` 排序
- 去重：相邻热点的时间窗口重叠时不保留
- 最终选取最多 4 个热点作为 `highlights`
- 热点窗口半径为 4 个 bin（即 ±1 小时）

#### 2.5 生成输出文件

脚本输出 6 个文件到 `--output-root`（默认 `public/data/`）：

### Step 3: 数据校验

[scripts/verify_data.py](../scripts/verify_data.py) 执行以下校验：

1. 6 个必需文件全部存在
2. `machine-grid.bin` 字节数 = `machineCount × binCount × metricCount`
3. `manifest.machineCount` 与 `machines.json` 长度一致
4. `cluster-summary.times` 长度与 `manifest.binCount` 一致
5. 每个指标的 summary（mean/p90/p99/max）长度与 `binCount` 一致
6. `domains.json` 中引用的 machine index 均存在于 `machines.json`
7. `hotspots.json` 中引用的 machine index 合法，时间窗口在范围内
8. 至少存在一个热点 highlight

## 输出文件格式

### manifest.json

元数据清单，描述整个数据包的生成信息和结构参数。

```typescript
type Manifest = {
  version: number;              // 数据格式版本，当前为 1
  dataset: string;              // "Alibaba Cluster Trace 2018"
  generatedAt: string;          // ISO 8601 生成时间
  subsetMode: string;           // "sample" 或 "full"
  usageRowCount: number;        // 原始 usage 行数
  machineCount: number;         // 有效机器数
  failureDomainCount: number;   // 故障域数量
  binSeconds: number;           // 聚合桶大小（秒）
  periodSeconds: number;        // 总时间跨度（秒）
  binCount: number;             // 时间桶数量
  missingValue: number;         // 缺失值标记（255）
  metrics: Array<{ id, label, unit, description }>;
  defaultWindow: { startBin, endBin };  // 默认聚焦窗口
  notes: string[];              // 数据说明备注
  sources: Record<string, string>; // 外部链接
};
```

### machines.json

```typescript
type MachinesFile = {
  machines: MachineRecord[];
};

type MachineRecord = {
  index: number;            // 重排后的新索引
  machineId: string;        // 原始 machine_id
  failureDomain1: string;   // 第一层故障域
  failureDomain2: string;   // 第二层故障域
  cpuNum: number;
  memSize: number;
  status: string;
  events: Array<{ time: number; status: string }>;
  availableBins: number;    // 有效时间桶数
  globalPeakScore: number;  // 全局峰值 CDF 得分
  globalPeakMetric: MetricId;
  peakBin: number;
};
```

### cluster-summary.json

全集群每时间桶的聚合统计：

```typescript
type ClusterSummary = {
  times: number[];  // 每个 bin 的起始秒数
  metrics: Record<MetricId, {
    mean: number[];  // 每台机器该桶均值的全局平均
    p90: number[];
    p99: number[];
    max: number[];
  }>;
};
```

### hotspots.json

```typescript
type HotspotsFile = {
  highlights: Hotspot[];  // 最多 4 个热点
  findings: string[];     // 自然语言摘要
};

type Hotspot = {
  id: string;
  title: string;
  summary: string;
  metricId: MetricId;
  startBin: number;
  endBin: number;
  peakBin: number;
  peakValue: number;   // 原始百分比值 0-100
  score: number;       // CDF 分位数得分
  machineId: string;
  machineIndex: number;
  domainId: string;
};
```

### domains.json

```typescript
type DomainsFile = {
  domains: DomainRecord[];
};

type DomainRecord = {
  domainId: string;
  label: string;           // 如 "FD-1"
  machineCount: number;
  machineIndices: number[];
  globalPeakScore: number;
  peakMetric: MetricId;
};
```

### machine-grid.bin

二进制扁平矩阵，格式为：

```
[metricCount][binCount][machineCount] bytes
```

按 `[metricIndex × binCount × machineCount + binIndex × machineCount + machineIndex]` 寻址。
每个值为 0-100 的整数百分比，255 表示缺失。

四指标的顺序固定为：`cpu`, `memory`, `network`, `disk`。

## 修改数据管道的注意事项

### 新增或修改指标

1. 修改 `scripts/build_data.py` 中的 `METRICS`、`METRIC_LABELS`、`METRIC_DESCRIPTIONS`
2. 修改 `src/core/constants.ts` 中的 `METRIC_ORDER` 和 `METRIC_META`
3. 修改 `src/core/types.ts` 中的 `MetricId` 联合类型
4. 重新运行 `npm run data:sample` 并执行 `npm run build`

### 修改聚合粒度

`bin_seconds` 和 `period_seconds` 会影响 `binCount` 和输出矩阵大小。修改后需同步检查前端 `types.ts` 中是否有硬编码的 bin 相关假设（当前没有）。

### 修改热点算法

热点检测逻辑集中在 `build_data.py` 的 `build_hotspots_payload()` 和 `build_filtered_machine_metadata()`。修改后建议：
1. 运行 `npm run data:sample`
2. 运行 `npm run check:data` 校验输出合法性
3. 启动 `npm run dev` 验证前端热点列表是否正常渲染

### 数据格式版本升级

如果输出 Schema 发生不兼容变更，应：
1. 提升 `manifest.json` 中的 `version`
2. 同步更新 `src/core/types.ts` 中的类型
3. 在 `verify_data.py` 中增加对应校验规则
