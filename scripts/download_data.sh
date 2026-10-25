#!/usr/bin/env bash
# 下载 / 解压 紫微斗数开源解读数据集 v4.0-13d
#
#   数据集: 674,976 张命盘 × 13 维解读（公历 1950-2026 真实日期 × 12 时辰 × 男女）
#   许可:   CC BY 4.0（须署名，见 ATTRIBUTION.md）
#   来源:   https://github.com/Renhuai123/ziwei-doushu  作者: 王多鱼AI
#
# 用法:
#   scripts/download_data.sh --years 1990,2000,2020   # 只下指定年份（压缩包）
#   scripts/download_data.sh --all                    # 下全部 77 个年份（压缩包，约 161MB）
#   scripts/download_data.sh --decompress 1990        # 解压指定年份（必须带 --long=27）
#
# 注意：--decompress 会显著占用磁盘（解压后每份约 735MB，全部约 56.6GB）。
set -euo pipefail

REPO="Renhuai123/ziwei-doushu"
TAG="v4.0-13d"
BASE="https://github.com/${REPO}/releases/download/${TAG}"
DATA_DIR="${ZIWEI_DATA_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/data}"
RAW_DIR="${DATA_DIR}/raw"
ZST_DIR="${DATA_DIR}/zst"

YEARS=""
DECOMPRESS=0
ALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --years)       YEARS="$2"; shift 2 ;;
    --decompress)  DECOMPRESS=1; YEARS="${2:-$YEARS}"; shift 2 || shift ;;
    --all)         ALL=1; shift ;;
    -h|--help)     sed -n '2,18p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

command -v zstd >/dev/null || { echo "需要 zstd: brew install zstd" >&2; exit 1; }
mkdir -p "$RAW_DIR" "$ZST_DIR"

fetch() {
  local year="$1"
  local out="${ZST_DIR}/year-${year}.jsonl.zst"
  if [[ -s "$out" ]]; then
    echo "跳过 year-${year}.jsonl.zst（已存在, $(du -h "$out" | cut -f1)）"
    return 0
  fi
  echo "下载 year-${year}.jsonl.zst ..."
  # -L 跟随重定向到对象存储；--fail 在 404 时直接失败
  if ! curl -fL --retry 3 --retry-delay 2 --max-time 600 -o "${out}.part" "${BASE}/year-${year}.jsonl.zst"; then
    rm -f "${out}.part"
    echo "下载失败: year-${year}" >&2
    return 1
  fi
  mv "${out}.part" "$out"
  echo "  -> $(du -h "$out" | cut -f1)"
}

decompress_one() {
  local year="$1"
  local src="${ZST_DIR}/year-${year}.jsonl.zst"
  local dst="${RAW_DIR}/year-${year}.jsonl"
  [[ -s "$src" ]] || { echo "缺压缩包: $src" >&2; return 1; }
  if [[ -s "$dst" ]]; then
    echo "跳过解压 year-${year}.jsonl（已存在, $(du -h "$dst" | cut -f1)）"
    return 0
  fi
  echo "解压 year-${year}.jsonl.zst ...（--long=27 必须）"
  # --long=27: 上游用了长窗口压缩，不带会解码失败
  zstd -d --long=27 -f "$src" -o "${dst}.part"
  mv "${dst}.part" "$dst"
  echo "  -> $(du -h "$dst" | cut -f1)"
}

if [[ "$ALL" == "1" ]]; then
  # 1950-2026
  for y in $(seq 1950 2026); do fetch "$y"; done
else
  [[ -n "$YEARS" ]] || { echo "请用 --years 1990,2000 或 --all" >&2; exit 2; }
  IFS=',' read -ra arr <<< "$YEARS"
  for y in "${arr[@]}"; do fetch "$(echo "$y" | tr -d ' ')"; done
fi

if [[ "$DECOMPRESS" == "1" ]]; then
  IFS=',' read -ra arr <<< "$YEARS"
  for y in "${arr[@]}"; do decompress_one "$(echo "$y" | tr -d ' ')"; done
fi

echo
echo "完成。压缩包目录: $ZST_DIR"
echo "解压后目录:     $RAW_DIR"
du -sh "$ZST_DIR" "$RAW_DIR" 2>/dev/null || true
