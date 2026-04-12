import * as d3 from 'd3';
import { METRIC_META } from '../constants';
import type { AppData } from '../types';
import { formatNumber, formatPercent } from '../utils';

export function renderHero(root: HTMLElement, data: AppData): void {
  const heroStats = root.querySelector<HTMLDivElement>('#hero-stats');
  const heroFindings = root.querySelector<HTMLDivElement>('#hero-findings');
  const heroHighlights = root.querySelector<HTMLDivElement>('#hero-highlights');
  if (!heroStats || !heroFindings || !heroHighlights) {
    return;
  }

  const leadHighlight = data.hotspots.highlights[0];
  heroStats.innerHTML = [
    { label: '机器数', value: formatNumber(data.manifest.machineCount) },
    { label: '故障域', value: formatNumber(data.manifest.failureDomainCount) },
    { label: '处理记录', value: formatNumber(data.manifest.usageRowCount) },
    { label: '发布数据', value: data.manifest.subsetMode === 'sample' ? '真实子集' : '全量聚合' }
  ]
    .map((item) => `<span class="hero-stat"><span class="label">${item.label}</span>${item.value}</span>`)
    .join('');

  heroFindings.innerHTML = data.hotspots.findings
    .map((finding, index) => `<p><span class="inline-label">发现 ${index + 1}</span>${finding}</p>`)
    .join('');

  if (leadHighlight) {
    heroHighlights.innerHTML = `
      <a class="annotation-link" href="#pulse" data-hotspot-id="${leadHighlight.id}">
        从 ${leadHighlight.title} 开始：${leadHighlight.summary}
      </a>
    `;
  }
}

export function renderSummaryRibbons(root: HTMLElement, data: AppData): void {
  const container = root.querySelector<HTMLDivElement>('#summary-ribbons');
  if (!container) {
    return;
  }

  container.innerHTML = data.manifest.metrics
    .map(
      (metric) => `
        <div class="mini-metric-card">
          <span class="label">${METRIC_META[metric.id].label}</span>
          <svg data-ribbon="${metric.id}" viewBox="0 0 220 48" preserveAspectRatio="none"></svg>
          <div class="metric-summary-value">${formatPercent(d3.max(data.summary.metrics[metric.id].p99) ?? 0)} P99 峰值</div>
        </div>
      `
    )
    .join('');

  data.manifest.metrics.forEach((metric) => {
    const svg = container.querySelector<SVGSVGElement>(`svg[data-ribbon="${metric.id}"]`);
    if (!svg) {
      return;
    }
    const values = data.summary.metrics[metric.id].p90;
    const width = 220;
    const height = 48;
    const x = d3.scaleLinear().domain([0, values.length - 1]).range([0, width]);
    const y = d3.scaleLinear().domain([0, 100]).range([height, 4]);
    const area = d3.area<number>().x((_, index) => x(index)).y0(height).y1((value) => y(value)).curve(d3.curveMonotoneX);
    const line = d3.line<number>().x((_, index) => x(index)).y((value) => y(value)).curve(d3.curveMonotoneX);

    const selection = d3.select(svg);
    selection.selectAll('*').remove();
    selection.append('path').attr('d', area(values) ?? '').attr('fill', `${METRIC_META[metric.id].accent}22`);
    selection
      .append('path')
      .attr('d', line(values) ?? '')
      .attr('fill', 'none')
      .attr('stroke', METRIC_META[metric.id].accent)
      .attr('stroke-width', 2.4);
  });
}
