import * as d3 from 'd3';
import { METRIC_META, METRIC_ORDER } from '../constants';
import type { AppData, AppState, DomainRecord, DomainWindowStat, GridData, WindowMachineStat } from '../types';
import { computeAverage, formatPercent, formatTime, gridValue } from '../utils';

export function renderScatter(
  root: HTMLElement,
  grid: GridData,
  state: AppState,
  stats: WindowMachineStat[],
  showTooltip: (x: number, y: number, html: string) => void,
  hideTooltip: () => void,
  onSelectMachine: (machineIndex: number) => void
): void {
  const svgNode = root.querySelector<SVGSVGElement>('#scatter-chart');
  const caption = root.querySelector<HTMLElement>('#scatter-caption');
  if (!svgNode || !grid || !caption) {
    return;
  }
  const width = svgNode.clientWidth || svgNode.parentElement?.clientWidth || 960;
  const height = 430;
  const svg = d3.select(svgNode);
  svg.selectAll('*').remove();
  svg.attr('viewBox', `0 0 ${width} ${height}`);

  const x = d3.scaleLinear().domain([0, 100]).range([60, width - 28]);
  const y = d3.scaleLinear().domain([0, 100]).range([height - 44, 18]);
  const radius = d3.scaleSqrt<number, number>().domain([0, 100]).range([4, 18]);

  svg.append('g').attr('class', 'axis').attr('transform', `translate(0, ${height - 44})`).call(d3.axisBottom(x).ticks(6).tickFormat((value) => `${value}%`));
  svg.append('g').attr('class', 'axis').attr('transform', 'translate(60,0)').call(d3.axisLeft(y).ticks(6).tickFormat((value) => `${value}%`));
  svg.append('text').attr('x', width - 28).attr('y', height - 8).attr('text-anchor', 'end').attr('fill', 'var(--muted)').attr('font-size', 12).text('CPU 均值');
  svg.append('text').attr('x', 12).attr('y', 18).attr('fill', 'var(--muted)').attr('font-size', 12).text('内存均值');

  svg
    .append('g')
    .selectAll('circle')
    .data(stats.slice(0, 240))
    .join('circle')
    .attr('cx', (d) => x(d.averages.cpu))
    .attr('cy', (d) => y(d.averages.memory))
    .attr('r', (d) => radius(d.peaks[state.metricId]))
    .attr('fill', `${METRIC_META[state.metricId].accent}bb`)
    .attr('stroke', (d) => (d.machineIndex === state.selectedMachineIndex ? '#231913' : 'rgba(35, 25, 19, 0.2)'))
    .attr('stroke-width', (d) => (d.machineIndex === state.selectedMachineIndex ? 2.4 : 1))
    .attr('opacity', 0.88)
    .style('cursor', 'pointer')
    .on('mouseenter', (event, datum) => {
      showTooltip(
        event.clientX,
        event.clientY,
        `<strong>${datum.machine.machineId}</strong><br />FD-${datum.domainId}<br />CPU ${formatPercent(
          datum.averages.cpu
        )} · 内存 ${formatPercent(datum.averages.memory)}<br />${METRIC_META[state.metricId].label} 峰值 ${formatPercent(
          datum.peaks[state.metricId]
        )}`
      );
    })
    .on('mouseleave', () => hideTooltip())
    .on('click', (_, datum) => onSelectMachine(datum.machineIndex));

  caption.textContent = `${stats.length} 台机器参与当前窗口分析，圆点大小表示 ${METRIC_META[state.metricId].label} 峰值`;
}

export function renderDomainBars(
  root: HTMLElement,
  grid: GridData,
  data: AppData,
  state: AppState,
  machineStats: WindowMachineStat[],
  showTooltip: (x: number, y: number, html: string) => void,
  hideTooltip: () => void,
  onToggleDomain: (domainId: string) => void
): void {
  const svgNode = root.querySelector<SVGSVGElement>('#domain-chart');
  if (!svgNode || !grid) {
    return;
  }
  const width = svgNode.clientWidth || svgNode.parentElement?.clientWidth || 520;
  const height = 430;
  const svg = d3.select(svgNode);
  svg.selectAll('*').remove();
  svg.attr('viewBox', `0 0 ${width} ${height}`);

  const stats = computeDomainWindowStats(data.domains.domains, machineStats, state.metricId).slice(0, 10);
  const x = d3.scaleLinear().domain([0, d3.max(stats, (item) => item.peak) ?? 100]).nice().range([110, width - 24]);
  const y = d3.scaleBand<string>().domain(stats.map((item) => item.domain.domainId)).range([18, height - 36]).padding(0.16);

  svg.append('g').attr('class', 'axis').attr('transform', `translate(0, ${height - 36})`).call(d3.axisBottom(x).ticks(5).tickFormat((value) => `${value}%`));
  svg.append('g').attr('class', 'axis').attr('transform', 'translate(110, 0)').call(d3.axisLeft(y).tickFormat((value) => `FD-${value}`));

  svg
    .append('g')
    .selectAll('rect')
    .data(stats)
    .join('rect')
    .attr('class', (d) => `domain-bar ${state.activeDomainId === d.domain.domainId ? 'is-active' : ''}`)
    .attr('x', x(0))
    .attr('y', (d) => y(d.domain.domainId) ?? 0)
    .attr('width', (d) => x(d.peak) - x(0))
    .attr('height', y.bandwidth())
    .attr('rx', 10)
    .attr('fill', (d) => (state.activeDomainId === d.domain.domainId ? METRIC_META[state.metricId].accent : `${METRIC_META[d.domain.peakMetric].accent}bb`))
    .on('mouseenter', (event, datum) => {
      showTooltip(
        event.clientX,
        event.clientY,
        `<strong>FD-${datum.domain.domainId}</strong><br />当前 ${METRIC_META[state.metricId].label} 峰值 ${formatPercent(datum.peak)}<br />机器数 ${datum.machineCount}`
      );
    })
    .on('mouseleave', () => hideTooltip())
    .on('click', (_, datum) => onToggleDomain(datum.domain.domainId));
}

export function renderRankingTable(root: HTMLElement, state: AppState, stats: WindowMachineStat[], onSelectMachine: (machineIndex: number) => void): void {
  const body = root.querySelector<HTMLTableSectionElement>('#ranking-table-body');
  const caption = root.querySelector<HTMLElement>('#table-caption');
  if (!body || !caption) {
    return;
  }

  caption.textContent = `${stats.length} 台机器中按 ${METRIC_META[state.metricId].label} 峰值排序`;
  body.innerHTML = stats
    .slice(0, 10)
    .map(
      (stat) => `
        <tr class="${stat.machineIndex === state.selectedMachineIndex ? 'is-selected' : ''}" data-machine-index="${stat.machineIndex}">
          <td>${stat.machine.machineId}</td>
          <td>FD-${stat.domainId}</td>
          <td>${formatPercent(stat.averages.cpu)}</td>
          <td>${formatPercent(stat.averages.memory)}</td>
          <td>${METRIC_META[state.metricId].label}</td>
          <td>${formatPercent(stat.peaks[state.metricId])}</td>
        </tr>
      `
    )
    .join('');

  body.querySelectorAll<HTMLTableRowElement>('tr[data-machine-index]').forEach((row) => {
    row.addEventListener('click', () => onSelectMachine(Number(row.dataset.machineIndex)));
  });
}

export function renderMachineDetail(root: HTMLElement, data: AppData, grid: GridData, state: AppState): number {
  const title = root.querySelector<HTMLElement>('#machine-title');
  const subtitle = root.querySelector<HTMLElement>('#machine-subtitle');
  const container = root.querySelector<HTMLDivElement>('#machine-multiples');
  if (!title || !subtitle || !container) {
    return state.selectedMachineIndex ?? 0;
  }

  const machine = data.machines.machines.find((item) => item.index === state.selectedMachineIndex) ?? data.machines.machines[0];
  title.textContent = `${machine.machineId} · FD-${machine.failureDomain1}`;
  subtitle.textContent = `CPU ${machine.cpuNum} 核 · 内存 ${machine.memSize} 归一化单位 · 状态 ${machine.status}`;
  container.innerHTML = METRIC_ORDER.map((metricId) => `<div class="small-metric"><span class="label">${METRIC_META[metricId].label}</span><svg data-machine-metric="${metricId}"></svg></div>`).join('');

  METRIC_ORDER.forEach((metricId) => {
    const svgNode = container.querySelector<SVGSVGElement>(`svg[data-machine-metric="${metricId}"]`);
    if (!svgNode) {
      return;
    }
    const width = svgNode.clientWidth || container.clientWidth || 920;
    const height = 120;
    const svg = d3.select(svgNode);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const values = Array.from({ length: data.manifest.binCount }, (_, index) => gridValue(grid, metricId, index, machine.index) ?? 0);
    const x = d3.scaleLinear().domain([0, values.length - 1]).range([48, width - 18]);
    const y = d3.scaleLinear().domain([0, 100]).range([height - 24, 12]);
    const line = d3.line<number>().x((_, index) => x(index)).y((value) => y(value)).curve(d3.curveMonotoneX);
    const [windowStart, windowEnd] = state.timeWindow;

    svg.append('rect').attr('x', x(windowStart)).attr('y', 10).attr('width', x(windowEnd + 1) - x(windowStart)).attr('height', height - 32).attr('fill', `${METRIC_META[metricId].accent}18`);
    svg.append('path').attr('d', line(values) ?? '').attr('fill', 'none').attr('stroke', METRIC_META[metricId].accent).attr('stroke-width', 2.2);
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0, ${height - 24})`).call(d3.axisBottom(x).tickValues([0, 192, 384, 576, 767]).tickFormat((value) => formatTime(Number(value) * data.manifest.binSeconds)));
    svg.append('g').attr('class', 'axis').attr('transform', 'translate(48,0)').call(d3.axisLeft(y).ticks(4).tickFormat((value) => `${value}%`));
  });

  return machine.index;
}

function computeDomainWindowStats(domains: DomainRecord[], machineStats: WindowMachineStat[], metricId: AppState['metricId']): DomainWindowStat[] {
  const byDomain = d3.group(machineStats, (stat) => stat.domainId);
  return domains
    .map((domain) => {
      const members = byDomain.get(domain.domainId) ?? [];
      const values = members.map((member) => member.averages[metricId]);
      const peaks = members.map((member) => member.peaks[metricId]);
      return { domain, mean: computeAverage(values), peak: d3.max(peaks) ?? 0, machineCount: members.length };
    })
    .filter((domain) => domain.machineCount > 0)
    .sort((left, right) => right.peak - left.peak || right.mean - left.mean);
}
