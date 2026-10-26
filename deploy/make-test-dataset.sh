#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# 造一份「迷你假数据集」—— 用于 Docker 部署冒烟测试
#
# 真实数据集解压后 53GB，验证部署时不必下载全量。
# 这里造 1 个年份、4 条合法记录（字段照 docs/DATA.md 第 6 节），
# 再用真正的 index:build 生成偏移索引 —— 走的是与生产完全一样的代码路径。
#
# 用法：
#   # 宿主机：造数据 + 建索引（需要 node 与仓库）
#   deploy/make-test-dataset.sh /tmp/ziwei-test-data 1990
#
#   # 容器内：造数据 + 建索引（镜像里已带 node 与源码）
#   docker run --rm -v /tmp/ziwei-test-data:/app/data ziwei-assistant:latest \
#     sh -c "deploy/make-test-dataset.sh /app/data 1990 && npm run index:build -- --years 1990"
#
#   # 只造数据（不建索引），留给调用方自己跑 npm run index:build
#   deploy/make-test-dataset.sh /tmp/ziwei-test-data 1990 --no-index
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

TARGET="${1:-/tmp/ziwei-test-data}"
YEAR="${2:-1990}"
DO_INDEX=1
[[ "${3:-}" == "--no-index" ]] && DO_INDEX=0

command -v node >/dev/null || { echo "需要 node" >&2; exit 1; }

mkdir -p "$TARGET/raw" "$TARGET/index"

# ── 1. 生成 year-YYYY.jsonl ───────────────────────────────────
node --input-type=module -e "
import fs from 'node:fs';
const year = Number('$YEAR');
const dims = ['overview','personality','love','career','wealth','health','family',
              'children','move','friends','home','spirit','parents'];
const pad = (n) => String(n).padStart(2, '0');
const rec = (m, d, h, g) => {
  const c = {}; const t = {};
  for (const k of dims) {
    c[k] = ('**【' + k + '】**\n\n' + year + '-' + m + '-' + d + ' 时辰' + h + ' ' + g +
            ' 的测试解读正文第 ' + k + ' 维。').repeat(3);
    t[k] = c[k].length;
  }
  return { k: year + '-' + pad(m) + '-' + pad(d) + '-' + h + '-' + g,
           y: year, m, d, h, g, ms: '天府', t, c };
};
const rows = [rec(1,1,0,'male'), rec(1,1,0,'female'), rec(6,15,5,'female'), rec(12,31,11,'male')];
fs.writeFileSync('$TARGET/raw/year-' + year + '.jsonl', rows.map(r => JSON.stringify(r)).join('\n') + '\n');
console.log('已生成 ' + rows.length + ' 条记录 → ' + '$TARGET/raw/year-' + year + '.jsonl');
"

# ── 2. 建索引（与生产同一条命令）───────────────────────────────
if [ "$DO_INDEX" -eq 1 ]; then
  if [ -f package.json ] && [ -d packages/reading-index ]; then
    npm run index:build -- --years "$YEAR" --data-dir "$TARGET"
  else
    echo
    echo "当前目录不是仓库根，无法自动建索引。请用下面任一方式补上："
    echo "  · 宿主机： cd <仓库根> && npm run index:build -- --years $YEAR --data-dir $TARGET"
    echo "  · 容器内： docker run --rm -v $TARGET:/app/data ziwei-assistant:latest \\"
    echo "                sh -c \"npm run index:build -- --years $YEAR\""
  fi
fi

echo
echo "完成。挂载这个目录即可冒烟："
echo "  docker run --rm -p 3000:3000 -v $TARGET:/app/data ziwei-assistant:latest"
echo "  curl 'http://localhost:3000/chart?y=$YEAR&m=1&d=1&h=0&g=male'"
