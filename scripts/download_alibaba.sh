#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-full}"
TARGET_DIR="${2:-}"
SAMPLE_LINES="${3:-1200000}"

BASE_URL="http://aliopentrace.oss-cn-beijing.aliyuncs.com/v2018Traces"
META_FILE="machine_meta.tar.gz"
USAGE_FILE="machine_usage.tar.gz"

META_SHA="b5b1b786b22cd413a3674b8f2ebfb2f02fac991c95df537f363ef2797c8f6d55"
USAGE_SHA="3e6ee87fd204bb85b9e234c5c75a5096580fdabc8f085b224033080090753a7a"

if [[ -z "${TARGET_DIR}" ]]; then
  if [[ "${MODE}" == "sample" ]]; then
    TARGET_DIR="${ROOT_DIR}/data/raw-sample"
  else
    TARGET_DIR="${ROOT_DIR}/data/raw"
  fi
fi

mkdir -p "${TARGET_DIR}"

require_cmd() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 1
  fi
}

verify_sha() {
  local file_path="$1"
  local expected_sha="$2"
  local actual_sha
  actual_sha="$(sha256sum "${file_path}" | awk '{print $1}')"
  if [[ "${actual_sha}" != "${expected_sha}" ]]; then
    echo "SHA256 mismatch for ${file_path}" >&2
    echo "expected: ${expected_sha}" >&2
    echo "actual:   ${actual_sha}" >&2
    exit 1
  fi
}

download_archive() {
  local file_name="$1"
  local expected_sha="$2"
  local file_path="${TARGET_DIR}/${file_name}"
  echo "Downloading ${file_name} to ${file_path}"
  curl -L -C - --fail --output "${file_path}" "${BASE_URL}/${file_name}"
  verify_sha "${file_path}" "${expected_sha}"
}

stream_extract() {
  local source_url="$1"
  local output_file="$2"
  echo "Streaming ${source_url} -> ${output_file}"
  curl -L --fail "${source_url}" | tar -xzOf - > "${output_file}"
}

stream_sample_usage() {
  local output_file="$1"
  local line_count="$2"
  echo "Streaming first ${line_count} real rows from machine_usage -> ${output_file}"
  set +o pipefail
  curl -L --fail "${BASE_URL}/${USAGE_FILE}" | tar -xzOf - | head -n "${line_count}" > "${output_file}"
  set -o pipefail
  if [[ ! -s "${output_file}" ]]; then
    echo "Failed to write sampled machine usage rows." >&2
    exit 1
  fi
}

require_cmd curl
require_cmd tar
require_cmd sha256sum

case "${MODE}" in
  full)
    download_archive "${META_FILE}" "${META_SHA}"
    download_archive "${USAGE_FILE}" "${USAGE_SHA}"
    ;;
  sample)
    stream_extract "${BASE_URL}/${META_FILE}" "${TARGET_DIR}/machine_meta.csv"
    stream_sample_usage "${TARGET_DIR}/machine_usage_sample.csv" "${SAMPLE_LINES}"
    cat > "${TARGET_DIR}/README.txt" <<EOF
This directory contains a stream-sampled subset of the official Alibaba Cluster Trace 2018 machine usage data.
- machine_meta.csv is fully extracted from ${META_FILE}
- machine_usage_sample.csv contains the first ${SAMPLE_LINES} rows streamed from ${USAGE_FILE}
- For full reproducibility, run: bash scripts/download_alibaba.sh full
EOF
    ;;
  *)
    echo "Usage: bash scripts/download_alibaba.sh [full|sample] [target_dir] [sample_lines]" >&2
    exit 1
    ;;
esac

