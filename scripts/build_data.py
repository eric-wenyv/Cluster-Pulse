#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import tarfile
from array import array
from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime, timezone
from heapq import heappush, heapreplace
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Sequence, Tuple

METRICS = ("cpu", "memory", "network", "disk")
METRIC_LABELS = {
    "cpu": "CPU",
    "memory": "Memory",
    "network": "Network",
    "disk": "Disk",
}
METRIC_DESCRIPTIONS = {
    "cpu": "15 分钟粒度的平均 CPU 利用率。",
    "memory": "15 分钟粒度的平均内存利用率。",
    "network": "15 分钟粒度内网络收发峰值（max(net_in, net_out)）。",
    "disk": "15 分钟粒度的平均磁盘 IO 利用率。",
}
MISSING_VALUE = 255
HIGHLIGHT_WINDOW_RADIUS = 4


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Cluster Pulse static data bundle.")
    parser.add_argument("--input-root", default="data/raw", help="Directory with full raw archives or extracted csv files.")
    parser.add_argument("--fallback-root", default="data/raw-sample", help="Directory with sampled csv files.")
    parser.add_argument("--output-root", default="public/data", help="Directory for generated JSON/BIN artifacts.")
    parser.add_argument("--bin-seconds", type=int, default=900, help="Aggregation bin size in seconds.")
    parser.add_argument("--period-seconds", type=int, default=8 * 24 * 60 * 60, help="Expected total time range.")
    return parser.parse_args()


def round_float(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


def percentile(sorted_values: Sequence[int], q: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    position = (len(sorted_values) - 1) * q
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
      return float(sorted_values[lower])
    lower_value = sorted_values[lower]
    upper_value = sorted_values[upper]
    return float(lower_value + (upper_value - lower_value) * (position - lower))


def format_time_range(start_bin: int, end_bin: int, bin_seconds: int) -> str:
    start = start_bin * bin_seconds
    end = (end_bin + 1) * bin_seconds
    return f"{format_seconds(start)} - {format_seconds(end)}"


def format_seconds(value: int) -> str:
    hours = value // 3600
    minutes = (value % 3600) // 60
    days = hours // 24
    hh = hours % 24
    if days > 0:
        return f"D{days + 1} {hh:02d}:{minutes:02d}"
    return f"{hh:02d}:{minutes:02d}"


@contextmanager
def open_csv_source(path: Path) -> Iterator[io.TextIOBase]:
    if path.suffixes[-2:] == [".tar", ".gz"]:
        archive = tarfile.open(path, "r:gz")
        members = [member for member in archive.getmembers() if member.isfile()]
        if not members:
            archive.close()
            raise FileNotFoundError(f"No file found inside archive: {path}")
        extracted = archive.extractfile(members[0])
        if extracted is None:
            archive.close()
            raise FileNotFoundError(f"Unable to extract member from archive: {path}")
        wrapper = io.TextIOWrapper(extracted, encoding="utf-8", newline="")
        try:
            yield wrapper
        finally:
            wrapper.close()
            archive.close()
    else:
        with path.open("r", encoding="utf-8", newline="") as handle:
            yield handle


def locate_input_file(root: Path, candidates: Sequence[str]) -> Optional[Path]:
    for candidate in candidates:
        file_path = root / candidate
        if file_path.exists():
            return file_path
    return None


def resolve_sources(primary_root: Path, fallback_root: Path) -> Tuple[Path, Path, str]:
    roots = [primary_root, fallback_root]
    meta_candidates = ("machine_meta.csv", "machine_meta.tar.gz")
    usage_candidates = ("machine_usage.csv", "machine_usage_sample.csv", "machine_usage.tar.gz")

    for root in roots:
        meta_path = locate_input_file(root, meta_candidates)
        usage_path = locate_input_file(root, usage_candidates)
        if meta_path and usage_path:
            subset_mode = "sample" if "sample" in usage_path.name or root == fallback_root else "full"
            return meta_path, usage_path, subset_mode

    raise FileNotFoundError(
        f"Unable to locate machine_meta and machine_usage under {primary_root} or {fallback_root}"
    )


def parse_int(value: str) -> int:
    return int(float(value))


def parse_metric_value(value: str) -> Optional[float]:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    number = float(value)
    if number < 0 or number > 100 or number in (-1, 101):
        return None
    return number


def parse_network(net_in: str, net_out: str) -> Optional[float]:
    in_value = parse_metric_value(net_in)
    out_value = parse_metric_value(net_out)
    if in_value is None and out_value is None:
        return None
    candidates = [value for value in (in_value, out_value) if value is not None]
    return max(candidates) if candidates else None


def load_machine_meta(meta_path: Path) -> Dict[str, dict]:
    records: Dict[str, dict] = {}
    with open_csv_source(meta_path) as handle:
        reader = csv.reader(handle)
        for row in reader:
            if len(row) < 7:
                continue
            machine_id = row[0].strip()
            time_stamp = parse_int(row[1])
            failure_domain_1 = row[2].strip()
            failure_domain_2 = row[3].strip()
            cpu_num = parse_int(row[4])
            mem_size = parse_int(row[5])
            status = row[6].strip()

            record = records.setdefault(
                machine_id,
                {
                    "machine_id": machine_id,
                    "failure_domain_1": failure_domain_1,
                    "failure_domain_2": failure_domain_2,
                    "cpu_num": cpu_num,
                    "mem_size": mem_size,
                    "status": status,
                    "events": [],
                    "last_time": -1,
                },
            )
            if time_stamp >= record["last_time"]:
                record["failure_domain_1"] = failure_domain_1
                record["failure_domain_2"] = failure_domain_2
                record["cpu_num"] = cpu_num
                record["mem_size"] = mem_size
                record["status"] = status
                record["last_time"] = time_stamp

            events: List[dict] = record["events"]
            if not events or events[-1]["time"] != time_stamp or events[-1]["status"] != status:
                events.append({"time": time_stamp, "status": status})

    return records


def build_machine_index(meta_records: Dict[str, dict]) -> Tuple[List[str], Dict[str, int]]:
    machine_ids = sorted(
        meta_records,
        key=lambda machine_id: (
            int(meta_records[machine_id]["failure_domain_1"]),
            meta_records[machine_id]["failure_domain_2"],
            machine_id,
        ),
    )
    return machine_ids, {machine_id: index for index, machine_id in enumerate(machine_ids)}


def aggregate_usage(
    usage_path: Path,
    machine_lookup: Dict[str, int],
    machine_count: int,
    bin_count: int,
    bin_seconds: int,
) -> Tuple[List[bytearray], List[List[int]], List[int], int]:
    cell_count = machine_count * bin_count
    sums = [array("f", [0.0]) * cell_count for _ in METRICS]
    counts = [array("I", [0]) * cell_count for _ in METRICS]
    aggregated = [bytearray([MISSING_VALUE]) * cell_count for _ in METRICS]
    histograms = [[0] * 101 for _ in METRICS]
    seen_machines = [0] * machine_count
    row_count = 0

    with open_csv_source(usage_path) as handle:
        reader = csv.reader(handle)
        for row in reader:
            if len(row) < 9:
                continue
            machine_id = row[0].strip()
            machine_index = machine_lookup.get(machine_id)
            if machine_index is None:
                continue
            timestamp = parse_int(row[1])
            if timestamp < 0:
                continue
            bin_index = timestamp // bin_seconds
            if bin_index < 0 or bin_index >= bin_count:
                continue

            row_count += 1
            seen_machines[machine_index] = 1
            cell_index = machine_index * bin_count + bin_index
            values = (
                parse_metric_value(row[2]),
                parse_metric_value(row[3]),
                parse_network(row[6], row[7]),
                parse_metric_value(row[8]),
            )

            for metric_index, value in enumerate(values):
                if value is None:
                    continue
                sums[metric_index][cell_index] += value
                counts[metric_index][cell_index] += 1

    for metric_index in range(len(METRICS)):
        metric_sum = sums[metric_index]
        metric_count = counts[metric_index]
        metric_output = aggregated[metric_index]
        histogram = histograms[metric_index]
        for cell_index in range(cell_count):
            count = metric_count[cell_index]
            if count == 0:
                continue
            value = int(round(metric_sum[cell_index] / count))
            value = max(0, min(100, value))
            metric_output[cell_index] = value
            histogram[value] += 1

    return aggregated, histograms, seen_machines, row_count


def cdf_lookup(histogram: List[int]) -> List[float]:
    total = sum(histogram)
    if total == 0:
        return [0.0] * len(histogram)
    cumulative = 0
    lookup = []
    for count in histogram:
        cumulative += count
        lookup.append(cumulative / total)
    return lookup


def build_filtered_machine_metadata(
    machine_ids: List[str],
    meta_records: Dict[str, dict],
    seen_machines: List[int],
    aggregated: List[bytearray],
    bin_count: int,
    quantiles: List[List[float]],
) -> Tuple[List[int], List[dict], List[Tuple[float, int, int, int]], Dict[str, List[int]]]:
    filtered_old_indices: List[int] = []
    machines_payload: List[dict] = []
    candidate_heap: List[Tuple[float, int, int, int, int]] = []
    domain_to_indices: Dict[str, List[int]] = defaultdict(list)

    for old_index, machine_id in enumerate(machine_ids):
        if not seen_machines[old_index]:
            continue

        best_score = -1.0
        best_metric_index = 0
        best_bin = 0
        valid_bins = 0
        for bin_index in range(bin_count):
            cell_index = old_index * bin_count + bin_index
            metric_scores: List[Tuple[float, int]] = []
            for metric_index, metric_values in enumerate(aggregated):
                value = metric_values[cell_index]
                if value == MISSING_VALUE:
                    continue
                metric_scores.append((quantiles[metric_index][value], metric_index))
            if metric_scores:
                valid_bins += 1
                score, metric_index = max(metric_scores, key=lambda item: item[0])
                if score > best_score:
                    best_score = score
                    best_metric_index = metric_index
                    best_bin = bin_index
                    peak_value = aggregated[metric_index][cell_index]
                    candidate = (score, peak_value, old_index, bin_index, best_metric_index)
                    if len(candidate_heap) < 256:
                        heappush(candidate_heap, candidate)
                    elif candidate > candidate_heap[0]:
                        heapreplace(candidate_heap, candidate)

        if valid_bins == 0:
            continue

        filtered_index = len(filtered_old_indices)
        filtered_old_indices.append(old_index)
        meta = meta_records[machine_id]
        domain_id = str(meta["failure_domain_1"])
        domain_to_indices[domain_id].append(filtered_index)
        machines_payload.append(
            {
                "index": filtered_index,
                "machineId": machine_id,
                "failureDomain1": domain_id,
                "failureDomain2": str(meta["failure_domain_2"]),
                "cpuNum": int(meta["cpu_num"]),
                "memSize": int(meta["mem_size"]),
                "status": meta["status"],
                "events": meta["events"][:12],
                "availableBins": valid_bins,
                "globalPeakScore": round_float(best_score, 4),
                "globalPeakMetric": METRICS[best_metric_index],
                "peakBin": best_bin,
            }
        )

    return filtered_old_indices, machines_payload, sorted(candidate_heap, reverse=True), domain_to_indices


def build_metric_grid(
    aggregated: List[bytearray],
    filtered_old_indices: List[int],
    bin_count: int,
) -> bytearray:
    machine_count = len(filtered_old_indices)
    metric_count = len(METRICS)
    output = bytearray([MISSING_VALUE]) * (metric_count * bin_count * machine_count)
    for metric_index, metric_values in enumerate(aggregated):
        metric_offset = metric_index * bin_count * machine_count
        for bin_index in range(bin_count):
            bin_offset = metric_offset + bin_index * machine_count
            for new_index, old_index in enumerate(filtered_old_indices):
                old_cell = old_index * bin_count + bin_index
                output[bin_offset + new_index] = metric_values[old_cell]
    return output


def build_cluster_summary(
    aggregated: List[bytearray],
    filtered_old_indices: List[int],
    bin_count: int,
    bin_seconds: int,
) -> dict:
    metric_payload = {}
    times = [bin_index * bin_seconds for bin_index in range(bin_count)]
    for metric_index, metric_id in enumerate(METRICS):
        metric_values = aggregated[metric_index]
        mean_values = []
        p90_values = []
        p99_values = []
        max_values = []
        for bin_index in range(bin_count):
            values = [
                metric_values[old_index * bin_count + bin_index]
                for old_index in filtered_old_indices
                if metric_values[old_index * bin_count + bin_index] != MISSING_VALUE
            ]
            if not values:
                mean_values.append(0.0)
                p90_values.append(0.0)
                p99_values.append(0.0)
                max_values.append(0.0)
                continue
            values.sort()
            mean_values.append(round_float(sum(values) / len(values)))
            p90_values.append(round_float(percentile(values, 0.9)))
            p99_values.append(round_float(percentile(values, 0.99)))
            max_values.append(round_float(values[-1]))

        metric_payload[metric_id] = {
            "mean": mean_values,
            "p90": p90_values,
            "p99": p99_values,
            "max": max_values,
        }

    return {"times": times, "metrics": metric_payload}


def build_domain_payload(
    domain_to_indices: Dict[str, List[int]],
    machines_payload: List[dict],
) -> dict:
    domains = []
    for domain_id, machine_indices in sorted(domain_to_indices.items(), key=lambda item: int(item[0])):
        peak_machine = max(
            (machines_payload[index] for index in machine_indices),
            key=lambda machine: (machine["globalPeakScore"], machine["availableBins"]),
        )
        domains.append(
            {
                "domainId": domain_id,
                "label": f"FD-{domain_id}",
                "machineCount": len(machine_indices),
                "machineIndices": machine_indices,
                "globalPeakScore": peak_machine["globalPeakScore"],
                "peakMetric": peak_machine["globalPeakMetric"],
            }
        )
    return {"domains": domains}


def build_hotspots_payload(
    candidates: List[Tuple[float, int, int, int, int]],
    filtered_old_indices: List[int],
    machine_ids: List[str],
    meta_records: Dict[str, dict],
    machines_payload: List[dict],
    bin_seconds: int,
    bin_count: int,
) -> dict:
    highlight_records = []
    used_ranges: List[Tuple[int, int]] = []
    old_to_new = {old_index: new_index for new_index, old_index in enumerate(filtered_old_indices)}

    for score, peak_value, old_index, peak_bin, metric_index in candidates:
        start_bin = max(0, peak_bin - HIGHLIGHT_WINDOW_RADIUS)
        end_bin = min(bin_count - 1, peak_bin + HIGHLIGHT_WINDOW_RADIUS)
        overlap = any(not (end_bin < used_start or start_bin > used_end) for used_start, used_end in used_ranges)
        if overlap:
            continue
        machine_id = machine_ids[old_index]
        new_index = old_to_new[old_index]
        meta = meta_records[machine_id]
        metric_id = METRICS[metric_index]
        domain_id = str(meta["failure_domain_1"])
        highlight_records.append(
            {
                "id": f"hotspot-{len(highlight_records) + 1}",
                "title": f"{METRIC_LABELS[metric_id]} 热点窗口 #{len(highlight_records) + 1}",
                "summary": f"{machine_id} 在 {format_time_range(start_bin, end_bin, bin_seconds)} 出现高强度 {METRIC_LABELS[metric_id]} 峰值，位于故障域 FD-{domain_id}。",
                "metricId": metric_id,
                "startBin": start_bin,
                "endBin": end_bin,
                "peakBin": peak_bin,
                "peakValue": peak_value,
                "score": round_float(score, 4),
                "machineId": machine_id,
                "machineIndex": new_index,
                "domainId": domain_id,
            }
        )
        used_ranges.append((start_bin, end_bin))
        if len(highlight_records) == 4:
            break

    findings = []
    if highlight_records:
        first = highlight_records[0]
        findings.append(
            f"最强热点出现在 {format_time_range(first['startBin'], first['endBin'], bin_seconds)}，机器 {first['machineId']} 的 {METRIC_LABELS[first['metricId']]} 峰值达到 {first['peakValue']}。"
        )

    return {"highlights": highlight_records, "findings": findings}


def build_manifest(
    output_root: Path,
    subset_mode: str,
    row_count: int,
    machines_payload: List[dict],
    domain_to_indices: Dict[str, List[int]],
    bin_seconds: int,
    period_seconds: int,
    default_window: dict,
) -> dict:
    return {
        "version": 1,
        "dataset": "Alibaba Cluster Trace 2018",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "outputRoot": str(output_root),
        "subsetMode": subset_mode,
        "usageRowCount": row_count,
        "machineCount": len(machines_payload),
        "failureDomainCount": len(domain_to_indices),
        "binSeconds": bin_seconds,
        "periodSeconds": period_seconds,
        "binCount": period_seconds // bin_seconds,
        "missingValue": MISSING_VALUE,
        "metrics": [
            {
                "id": metric_id,
                "label": METRIC_LABELS[metric_id],
                "unit": "%",
                "description": METRIC_DESCRIPTIONS[metric_id],
            }
            for metric_id in METRICS
        ],
        "defaultWindow": default_window,
        "notes": [
            "GitHub Pages 发布的是基于真实 Alibaba 2018 trace 的静态聚合结果。",
            "如果当前数据包由 sample 模式生成，则 machine_usage 来自官方压缩文件的流式真实子集。",
            "完整数据处理可通过 scripts/download_alibaba.sh full 与 npm run data 重新生成。",
        ],
        "sources": {
            "assignmentUrl": "https://bitvis2021.github.io/BITVIS-Course/assignment/assignment2.html",
            "datasetDocsUrl": "https://github.com/alibaba/clusterdata/blob/master/cluster-trace-v2018/trace_2018.md",
            "datasetSchemaUrl": "https://github.com/alibaba/clusterdata/blob/master/cluster-trace-v2018/schema.txt",
            "downloadBaseUrl": "http://aliopentrace.oss-cn-beijing.aliyuncs.com/v2018Traces",
        },
    }


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    args = parse_args()
    input_root = Path(args.input_root)
    fallback_root = Path(args.fallback_root)
    output_root = Path(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)

    meta_path, usage_path, subset_mode = resolve_sources(input_root, fallback_root)
    bin_count = args.period_seconds // args.bin_seconds

    meta_records = load_machine_meta(meta_path)
    machine_ids, machine_lookup = build_machine_index(meta_records)

    aggregated, histograms, seen_machines, row_count = aggregate_usage(
        usage_path=usage_path,
        machine_lookup=machine_lookup,
        machine_count=len(machine_ids),
        bin_count=bin_count,
        bin_seconds=args.bin_seconds,
    )

    quantiles = [cdf_lookup(histogram) for histogram in histograms]
    filtered_old_indices, machines_payload, candidates, domain_to_indices = build_filtered_machine_metadata(
        machine_ids=machine_ids,
        meta_records=meta_records,
        seen_machines=seen_machines,
        aggregated=aggregated,
        bin_count=bin_count,
        quantiles=quantiles,
    )

    if not filtered_old_indices:
        raise RuntimeError("No usable machine rows found in machine usage data.")

    metric_grid = build_metric_grid(aggregated, filtered_old_indices, bin_count)
    cluster_summary = build_cluster_summary(aggregated, filtered_old_indices, bin_count, args.bin_seconds)
    domains_payload = build_domain_payload(domain_to_indices, machines_payload)
    hotspots_payload = build_hotspots_payload(
        candidates=candidates,
        filtered_old_indices=filtered_old_indices,
        machine_ids=machine_ids,
        meta_records=meta_records,
        machines_payload=machines_payload,
        bin_seconds=args.bin_seconds,
        bin_count=bin_count,
    )

    default_window = hotspots_payload["highlights"][0] if hotspots_payload["highlights"] else {"startBin": 0, "endBin": min(15, bin_count - 1)}
    manifest = build_manifest(
        output_root=output_root,
        subset_mode=subset_mode,
        row_count=row_count,
        machines_payload=machines_payload,
        domain_to_indices=domain_to_indices,
        bin_seconds=args.bin_seconds,
        period_seconds=args.period_seconds,
        default_window={"startBin": default_window["startBin"], "endBin": default_window["endBin"]},
    )

    write_json(output_root / "manifest.json", manifest)
    write_json(output_root / "machines.json", {"machines": machines_payload})
    write_json(output_root / "cluster-summary.json", cluster_summary)
    write_json(output_root / "hotspots.json", hotspots_payload)
    write_json(output_root / "domains.json", domains_payload)
    (output_root / "machine-grid.bin").write_bytes(metric_grid)

    print(
        f"Built Cluster Pulse data bundle with {len(machines_payload)} machines, "
        f"{len(domain_to_indices)} failure domains, {row_count} usage rows -> {output_root}"
    )


if __name__ == "__main__":
    main()
