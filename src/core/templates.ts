import { TERM_EXPLANATIONS } from './constants';
import type { AppData, Hotspot } from './types';
import { renderTerm } from './utils';

export function renderShell(): string {
  return `
    <div class="page-shell">
      <header class="site-header">
        <div class="site-badge">集群资源观察</div>
        <nav class="site-nav">
          <a href="#overview">概览</a>
          <a href="#pulse">热力图</a>
          <a href="#explorer">机器与故障域</a>
          <a href="#machine-detail">单机曲线</a>
          <a href="#methodology">方法说明</a>
        </nav>
      </header>

      <section id="overview" class="hero">
        <div class="eyebrow">Alibaba 2018 集群数据</div>
        <h1>集群压力判断</h1>
        <p class="hero-lead">
          这个页面聚焦机器级资源热点，回答生产集群里 CPU、内存、网络与磁盘压力何时抬头，
          热点是否集中在某些${renderTerm('故障域', TERM_EXPLANATIONS.failureDomain)}，以及单台机器在 8 天周期里的行为曲线如何变化。
        </p>
        <div class="hero-cta">
          <a href="#pulse">进入主图</a>
          <a href="#methodology">阅读方法说明</a>
        </div>
        <div class="hero-stats hero-meta" id="hero-stats"></div>
        <div class="hero-findings" id="hero-findings"></div>
        <div class="summary-ribbon-grid" id="summary-ribbons"></div>
        <div class="article-links" id="hero-highlights"></div>
      </section>
      <div class="section-bridge">
        <p>
          先从全局分布看起。把机器按故障域排列到同一条时间轴上之后，资源压力是零散抬升还是成片集中，会比单看均值更容易辨认。
        </p>
      </div>

      <section id="pulse" class="section">
        <div class="section-heading">
          <div class="eyebrow">资源热点</div>
          <h2>机器资源热点热力图</h2>
        </div>
        <div class="cluster-grid">
          <div class="section-panel">
            <div class="metric-controls">
              <div class="metric-buttons" id="metric-buttons"></div>
              <div class="metric-help" id="metric-help"></div>
            </div>
            <div class="heatmap-stage">
              <div class="heatmap-header">
                <div class="heatmap-header-copy">
                  <strong id="heatmap-title">数据加载中…</strong>
                  <span id="heatmap-subtitle"></span>
                  <span class="window-inline" id="window-copy">热力图进入视口后将自动加载压缩矩阵。</span>
                </div>
                <div class="heatmap-actions">
                  <button class="domain-clear" id="show-all-machines" type="button">全部机器</button>
                  <button class="domain-clear" id="clear-heatmap-filter" type="button">清除主图筛选</button>
                </div>
              </div>
              <div class="heatmap-canvas-wrap">
                <div class="heatmap-stack">
                  <canvas id="heatmap-base" width="1200" height="720"></canvas>
                  <canvas id="heatmap-overlay" width="1200" height="720"></canvas>
                </div>
              </div>
              <div class="brush-wrap">
                <svg id="brush-chart"></svg>
              </div>
              <div class="legend-row">
                <div>
                  <div class="legend-gradient" id="legend-gradient"></div>
                  <div class="legend-labels"><span>0%</span><span>50%</span><span>100%</span></div>
                </div>
                <div class="selection-badges" id="selection-badges"></div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <div class="section-bridge">
        <p>
          全局热力图能告诉我们热点出现在哪里，但还不能说明热点是由少数机器推动，还是在某个故障域中成簇出现。下一部分把当前窗口拆回机器与故障域。
        </p>
      </div>

      <section id="explorer" class="section">
        <div class="section-heading">
          <div class="eyebrow">机器与故障域</div>
          <h2>机器分布与故障域集中度</h2>
        </div>
        <div class="explorer-grid">
          <div class="metric-panel">
            <div class="metric-header">
              <div>
                <span class="label">散点图</span>
                <strong>CPU 与内存均值</strong>
              </div>
              <span id="scatter-caption"></span>
            </div>
            <svg id="scatter-chart" height="430"></svg>
          </div>
          <div class="metric-panel">
            <div class="metric-header">
              <div>
                <span class="label">故障域</span>
                <strong>热点集中度</strong>
              </div>
              <button class="domain-clear" id="clear-domain-filter" type="button">清除故障域过滤</button>
            </div>
            <svg id="domain-chart" height="430"></svg>
          </div>
        </div>
        <div class="explorer-detail-grid">
          <div class="metric-panel metric-panel-wide" id="machine-detail">
            <div class="machine-detail-title">
              <div>
                <span class="label">选中机器</span>
                <strong id="machine-title">等待加载</strong>
              </div>
              <span id="machine-subtitle"></span>
            </div>
            <p class="detail-copy">
              四条资源曲线共用同一时间轴。阴影区域对应当前窗口，便于把排行中的机器直接还原到完整 8 天曲线里。
            </p>
            <div class="small-multiples" id="machine-multiples"></div>
          </div>
          <div class="metric-panel">
            <div class="metric-header">
              <div>
                <span class="label">热点排行</span>
                <strong>当前窗口热点排行</strong>
              </div>
              <span id="table-caption"></span>
            </div>
            <div class="table-shell">
              <table class="ranking-table">
                <thead>
                  <tr>
                    <th>机器</th>
                    <th>故障域</th>
                    <th>CPU</th>
                    <th>内存</th>
                    <th>主导热点</th>
                    <th>峰值</th>
                  </tr>
                </thead>
                <tbody id="ranking-table-body"></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
      <div class="section-bridge">
        <p>
          当热点范围收缩到几台机器之后，还需要回到单机曲线确认它们的真实形态。最后一部分补充研究问题、设计取舍和数据处理方式，让图表与方法对应起来。
        </p>
      </div>

      <section id="methodology" class="section">
        <div class="section-heading">
          <div class="eyebrow">方法说明</div>
          <h2>问题、方法与数据来源</h2>
        </div>
        <article class="method-article" id="method-grid"></article>
      </section>
    </div>
  `;
}

export function renderMethodologyMarkup(data: AppData, leadHighlight: Hotspot | undefined): string {
  return `
    <h3>可视化方案要解答什么问题</h3>
    <p>
      这个可视化围绕一个具体而可检验的问题展开：在 Alibaba 2018 集群的 8 天 ${renderTerm('trace', TERM_EXPLANATIONS.trace)} 中，CPU、内存、网络与磁盘压力何时出现，
      热点是零散分布在少数机器上，还是集中在某些${renderTerm('故障域', TERM_EXPLANATIONS.failureDomain)}中，以及被选中的机器在完整周期里究竟表现为短时尖峰、持续高负载，
      还是多种资源同时抬升。
    </p>
    <p>
      因此，主热力图负责回答“热点发生在什么时候、落在哪些机器上”，中段的散点图与故障域条形图负责回答“当前窗口里的热点是否集中成簇”，
      下方单机四条资源曲线则负责回答“某台机器的热点究竟是什么形态”。三个视图对应的是同一个问题的全局、局部和解释三个层次。
    </p>
    <h3>设计决策依据、替代方案与最终取舍</h3>
    <p>
      页面结构采用文章式布局，先提出问题，再进入图表，最后在页面结尾集中交代方法说明。这一结构参考了 ${renderTerm('MBTA Viz', TERM_EXPLANATIONS.mbtaViz)} 的长文式可视化组织方式，
      因为本项目更像一篇带交互的分析文章，而不是一组可以独立阅读的监控卡片。
    </p>
    <p>
      主图最终选择热力图，而没有采用多折线、堆叠面积图或汇总柱图。原因是这个任务必须同时保留连续时间轴和按故障域排序后的机器分布；
      若改用折线，机器数量一多就会严重遮挡；若只做汇总柱图，虽然便于比较均值，却会丢失热点是“成片出现”还是“局部闪现”的结构信息。
      中段采用 CPU 对内存的散点图，是为了把当前时间窗内的机器分布投影到一个便于比较的位置图上，再用点大小编码当前指标峰值，从而区分
      “均值偏高”和“峰值突刺”两类不同状态。故障域部分使用条形图而不是 ${renderTerm('treemap', TERM_EXPLANATIONS.treemap)} 或饼图，是因为这里更关心排序与集中度，而不是面积占比。
    </p>
    <p>
      交互上最终保留了指标切换、主图框选、故障域过滤和机器点击四类操作。也考虑过只保留底部时间轴 ${renderTerm('brush', TERM_EXPLANATIONS.brush)} 的方案，但那样无法直接在主图里同时选择
      时间与机器范围；也考虑过更复杂的筛选菜单，但会打断阅读路径。最终版本选择在主热力图上直接框选，再让散点图、排行表和单机曲线同步联动，
      以减少界面跳转成本。${leadHighlight ? `页面默认聚焦 ${leadHighlight.title}，也是为了让首次进入页面的读者立即看到一个真实的热点窗口。` : '页面默认从全局最强热点窗口开始，避免首屏停留在过于平缓的状态。'}
    </p>
    <h3>外部资源引用</h3>
    <p>
      数据源来自 Alibaba Cluster Trace 2018，本项目实际使用的是其中的 ${renderTerm('machine_meta', TERM_EXPLANATIONS.machineMeta)} 与 ${renderTerm('machine_usage', TERM_EXPLANATIONS.machineUsage)} 两张表。页面中的静态数据并非手工构造示例，
      而是由脚本下载原始数据后按 15 分钟时间窗聚合生成，再部署到 ${renderTerm('GitHub Pages', TERM_EXPLANATIONS.githubPages)}。
    </p>
    <p class="source-inline">
      参考资料：
      <a href="${data.manifest.sources.assignmentUrl}" target="_blank" rel="noreferrer">课程作业要求</a>
      <span> / </span>
      <a href="${data.manifest.sources.datasetDocsUrl}" target="_blank" rel="noreferrer">Alibaba trace 文档</a>
      <span> / </span>
      <a href="${data.manifest.sources.datasetSchemaUrl}" target="_blank" rel="noreferrer">Alibaba schema</a>
      <span> / </span>
      <a href="https://mbtaviz.github.io/" target="_blank" rel="noreferrer">MBTA Viz</a>
    </p>
    <h3>开发流程概述与评述</h3>
    <p>
      当前版本按单人项目推进，数据处理、前端实现、交互联动、样式调整与 GitHub Pages 部署均由同一人完成。如果按工时估算，
      从方案确定、数据脚本编写、前端实现到上线整理大约花费 25 到 35 小时，其中最耗时的并不是基础页面搭建，而是两类工作：
      一类是把原始 trace 清洗并压缩成适合静态网页加载的结构，另一类是反复调整主热力图和联动交互，使页面在 GitHub Pages 环境下既能显示真实数据，
      又不至于过于卡顿。
    </p>
    <p>
      开发过程前期主要时间投入在数据管线和指标定义上，例如如何处理缺失值、如何定义热点、如何在 ${renderTerm('sample', TERM_EXPLANATIONS.sample)} 与 ${renderTerm('full', TERM_EXPLANATIONS.full)} 两种模式之间共享统一输出接口。
      中后期则主要花在交互和版式迭代，包括主图框选、故障域过滤，以及把页面从仪表盘式布局收敛成文章式结构。回头看，最关键的取舍
      是先缩小问题范围，只做机器级资源热点，而不是把容器、批处理任务和调度关系同时塞进一个页面里；这个取舍让页面能够围绕同一个问题形成完整叙事，
      也让说明文档与图表之间保持一一对应。
    </p>
  `;
}
