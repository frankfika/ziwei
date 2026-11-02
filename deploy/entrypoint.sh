#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# 紫微助手 —— 容器启动脚本
#
# 职责：
#   1. 启动前检查解读数据集是否就位（data/raw + data/index）
#   2. 数据缺失时打印中文指引并以非零码退出（不静默失败、不抛堆栈）
#   3. 数据就位则启动 Next.js 生产服务
#
# 用法：
#   docker run -v <宿主机数据目录>:/app/data ziwei-assistant:latest
#   docker run ziwei-assistant:latest sh -c "npm run index:build"   # 覆盖默认命令
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

DATA_DIR="${ZIWEI_DATA_DIR:-/app/data}"
RAW_DIR="${DATA_DIR}/raw"
COMPACT_DIR="${DATA_DIR}/compact"
INDEX_DIR="${DATA_DIR}/index"
PORT="${PORT:-3000}"
NEXT_BIN="/app/node_modules/next/dist/bin/next"

log() { printf '[ziwei] %s\n' "$*"; }

# 带参数时把命令原样交给用户（docker run <image> <cmd>），
# 此时跳过数据检查与服务启动 —— 运维命令（建索引 / 下载数据 / 看目录）要用。
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

# 统计目录下匹配正则的文件数
count_files() {
  local dir="$1" pattern="$2" n=0 f base
  if [ -d "$dir" ]; then
    for f in "$dir"/*; do
      [ -e "$f" ] || continue
      base="$(basename "$f")"
      if [[ "$base" =~ $pattern ]]; then
        n=$((n + 1))
      fi
    done
  fi
  printf '%s' "$n"
}

raw_years="$(count_files "$RAW_DIR" '^year-[0-9]{4}\.jsonl$')"
compact_years="$(count_files "$COMPACT_DIR" '^year-[0-9]{4}\.bin$')"
idx_years="$(count_files "$INDEX_DIR" '^year-[0-9]{4}\.idx\.json$')"

log "启动前数据检查"
log "  ZIWEI_DATA_DIR      : ${DATA_DIR}"
log "  解压后的原始数据    : ${raw_years} 个年份（raw/）"
log "  压缩数据            : ${compact_years} 个年份（compact/，优先使用）"
log "  偏移索引            : ${idx_years} 个年份（index/）"

# ── 情况 A：索引缺失，且没有原始数据 ─────────────────────────────
if [ "$idx_years" -eq 0 ] && [ "$raw_years" -eq 0 ]; then
  cat >&2 <<EOF

════════════════════════════════════════════════════════════════════
❌ 未找到解读数据集：${DATA_DIR}
════════════════════════════════════════════════════════════════════

紫微助手的解读正文来自「紫微斗数开源解读数据集 v4.0-13d」
（674,976 张命盘 × 13 维，1950–2026，许可 CC BY 4.0）。
这份数据解压后约 53GB，**不会打进镜像**，必须挂载到 ${DATA_DIR}。

请按下面三条命令准备数据（在宿主机执行）：

  ① 下载（压缩包，约 2MB/年）
     docker compose -f deploy/docker-compose.yml run --rm ziwei \\
       sh -c "scripts/download_data.sh --years 1990"

  ② 解压（必须带 --long=27，约 740MB/年）
     docker compose -f deploy/docker-compose.yml run --rm ziwei \\
       sh -c "scripts/download_data.sh --years 1990 --decompress 1990"

  ③ 建索引（约 3.3 秒/年）
     docker compose -f deploy/docker-compose.yml run --rm ziwei \\
       sh -c "npm run index:build -- --years 1990"

  ④ 重新启动
     docker compose -f deploy/docker-compose.yml up -d

补充说明：
  · 磁盘紧张时只铺需要的年份即可（全量 77 年需约 53GB）。
  · 数据已经在宿主机上？把 compose 里的 volume 从具名卷改成绑定挂载：
      - ziwei-data:/app/data          →  - /宿主机/数据目录:/app/data
  · 完整步骤见 deploy/README.md 与 docs/DEPLOY.md。

════════════════════════════════════════════════════════════════════
EOF
  exit 1
fi

# ── 情况 B：原始数据在，索引缺 ───────────────────────────────────
if [ "$idx_years" -eq 0 ]; then
  cat >&2 <<EOF

════════════════════════════════════════════════════════════════════
❌ 偏移索引缺失：${INDEX_DIR} 下没有 year-YYYY.idx.json
════════════════════════════════════════════════════════════════════

检测到 ${RAW_DIR} 下已有 ${raw_years} 个年份的解压数据，只差索引。

解读检索用的是「字节偏移索引」（key → [offset, length]）——
索引里只存正文在 .jsonl 里的位置，没有它就查不到任何解读。

请建索引：

  docker compose -f deploy/docker-compose.yml run --rm ziwei \\
    sh -c "npm run index:build -- --years 1990"

（不加 --years 则会为 raw/ 下所有年份建索引，约 3.3 秒/年）

════════════════════════════════════════════════════════════════════
EOF
  exit 1
fi

# ── 情况 C：索引在，但正文数据（raw 和 compact）都不在 ────────────
if [ "$raw_years" -eq 0 ] && [ "$compact_years" -eq 0 ]; then
  cat >&2 <<EOF

════════════════════════════════════════════════════════════════════
❌ 正文数据缺失：${RAW_DIR} 与 ${COMPACT_DIR} 下都没有 year-YYYY 数据
════════════════════════════════════════════════════════════════════

检测到 ${INDEX_DIR} 下已有 ${idx_years} 份索引，但正文数据不在。

正文数据有两种形态，有其一即可：
  · raw/year-YYYY.jsonl        解压后的原始数据（查询会按需走偏移索引）
  · compact/year-YYYY.bin      zstd 字典压缩版（优先使用，全量 77 年约 1.5GB）

请重新下载并解压：

  docker compose -f deploy/docker-compose.yml run --rm ziwei \\
    sh -c "scripts/download_data.sh --years 1990 --decompress 1990"

════════════════════════════════════════════════════════════════════
EOF
  exit 1
fi

# ── 数据就绪 ────────────────────────────────────────────────────
if [ "$compact_years" -gt 0 ]; then
  log "✅ 数据就绪（${idx_years} 个年份已建索引，${compact_years} 个年份走压缩数据）"
else
  log "✅ 数据就绪（${idx_years} 个年份已建索引）"
fi
log "启动 Next.js：监听 0.0.0.0:${PORT}"
cd /app/apps/web
exec node "$NEXT_BIN" start -H 0.0.0.0 -p "$PORT"
