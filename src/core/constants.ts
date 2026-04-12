import * as d3 from 'd3';
import type { MetricId } from './types';

export const METRIC_ORDER: MetricId[] = ['cpu', 'memory', 'network', 'disk'];

export const METRIC_META: Record<
  MetricId,
  { label: string; short: string; accent: string; description: string; interpolator: (value: number) => string }
> = {
  cpu: {
    label: 'CPU',
    short: 'CPU',
    accent: '#d66d2e',
    description: '刻画机器在 15 分钟窗口内的平均 CPU 利用率。',
    interpolator: d3.interpolateRgbBasis(['#f5ebde', '#f8c36f', '#e58e2e', '#992d0f'])
  },
  memory: {
    label: '内存',
    short: '内存',
    accent: '#178f8f',
    description: '刻画机器在 15 分钟窗口内的平均内存占用。',
    interpolator: d3.interpolateRgbBasis(['#eaf5f1', '#8ed7c9', '#2aa79d', '#0e5a55'])
  },
  network: {
    label: '网络',
    short: '网络',
    accent: '#4673df',
    description: '使用 net_in 与 net_out 的峰值，暴露网络热点集中窗口。',
    interpolator: d3.interpolateRgbBasis(['#edf2fb', '#9ec3ff', '#4c7de7', '#173a8c'])
  },
  disk: {
    label: '磁盘',
    short: '磁盘',
    accent: '#8c62e0',
    description: '刻画磁盘 IO 利用率，用来捕捉后台写入或批量读写活动。',
    interpolator: d3.interpolateRgbBasis(['#f3edff', '#cab4ff', '#9568e8', '#5e2db4'])
  }
};

export const CHART_MARGINS = { top: 18, right: 20, bottom: 28, left: 48 };

export const TERM_EXPLANATIONS = {
  trace: '对生产集群运行状态按时间记录形成的原始轨迹数据。',
  failureDomain: '共享某类底层故障风险的一组机器。数据集中提供匿名化的两层故障域 failure_domain_1 和 failure_domain_2。',
  dag: '有向无环图，用来表示任务之间的依赖和执行先后关系。',
  machineMeta: '机器元数据表，包含机器编号、故障域、CPU 核数、内存规格和状态变化。',
  machineUsage: '机器利用率表，记录 CPU、内存、网络和磁盘等资源的时间序列使用情况。',
  treemap: '用矩形面积表示数值大小的图表，适合看占比，不适合精确排序。',
  brush: '在图上拖拽并框选连续范围的交互方式，这里主要用于选择时间窗口。',
  sample: '从真实原始数据中抽取的子集，用于降低网页体积并保持交互流畅。',
  full: '基于原始数据的完整聚合结果，覆盖范围更全，但文件体积更大。',
  githubPages: 'GitHub 提供的静态网站托管服务，这个项目从 main 分支的 docs 目录发布。',
  mbtaViz: '一个以波士顿地铁数据为主题的叙事式可视化案例，这里主要参考其页面组织方式。'
} as const;
