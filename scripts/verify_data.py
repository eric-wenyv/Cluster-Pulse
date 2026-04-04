#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path


REQUIRED_FILES = [
    "manifest.json",
    "machines.json",
    "cluster-summary.json",
    "hotspots.json",
    "domains.json",
    "machine-grid.bin",
]


def fail(message: str) -> None:
    raise SystemExit(message)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    if len(sys.argv) < 2:
        fail("Usage: python3 scripts/verify_data.py <data_dir>")

    data_dir = Path(sys.argv[1])
    for file_name in REQUIRED_FILES:
        path = data_dir / file_name
        if not path.exists():
            fail(f"Missing required output file: {path}")

    manifest = load_json(data_dir / "manifest.json")
    machines = load_json(data_dir / "machines.json")["machines"]
    domains = load_json(data_dir / "domains.json")["domains"]
    summary = load_json(data_dir / "cluster-summary.json")
    hotspots = load_json(data_dir / "hotspots.json")["highlights"]
    grid = (data_dir / "machine-grid.bin").read_bytes()

    machine_count = len(machines)
    bin_count = manifest["binCount"]
    metric_count = len(manifest["metrics"])
    expected_length = machine_count * bin_count * metric_count
    if len(grid) != expected_length:
        fail(f"machine-grid.bin length mismatch: expected {expected_length}, got {len(grid)}")

    if manifest["machineCount"] != machine_count:
        fail("manifest.machineCount does not match machines.json")

    if len(summary["times"]) != bin_count:
        fail("cluster-summary times length does not match manifest.binCount")

    for metric in manifest["metrics"]:
        metric_id = metric["id"]
        metric_summary = summary["metrics"].get(metric_id)
        if metric_summary is None:
            fail(f"Missing metric summary for {metric_id}")
        for key in ("mean", "p90", "p99", "max"):
            if len(metric_summary[key]) != bin_count:
                fail(f"Metric {metric_id} summary {key} length mismatch")

    machine_indices = {machine["index"] for machine in machines}
    for domain in domains:
        for machine_index in domain["machineIndices"]:
            if machine_index not in machine_indices:
                fail(f"Domain {domain['domainId']} references invalid machine index {machine_index}")

    for highlight in hotspots:
        if highlight["machineIndex"] not in machine_indices:
            fail(f"Invalid machine index in hotspot {highlight['id']}")
        if not (0 <= highlight["startBin"] <= highlight["endBin"] < bin_count):
            fail(f"Invalid time window in hotspot {highlight['id']}")

    if not hotspots:
        fail("Expected at least one hotspot highlight")

    print(f"Verified {data_dir}: {machine_count} machines, {len(domains)} domains, {len(hotspots)} hotspots")


if __name__ == "__main__":
    main()

