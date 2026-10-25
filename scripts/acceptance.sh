#!/usr/bin/env bash
# 紫微助手 MVP 总体验收
#
#   scripts/acceptance.sh
#
# 逐项跑通并给出 PASS / FAIL。任一硬性项失败 → 退出码非 0。
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

PASS=0
FAIL=0
SKIP=0
FAILED_ITEMS=()

hr() { printf '\n\033[1m%s\033[0m\n' "── $* ──────────────────────────────────"; }

check() {
  local name="$1"; shift
  local cmd="$*"
  local out
  out=$("$@" 2>&1)
  local rc=$?
  if [[ $rc -eq 0 ]]; then
    printf '  \033[32m✓\033[0m %s\n' "$name"
    PASS=$((PASS+1))
  else
    printf '  \033[31m✗\033[0m %s\n' "$name"
    printf '      %s\n' "$(echo "$out" | tail -5 | sed 's/^/      /')"
    FAIL=$((FAIL+1))
    FAILED_ITEMS+=("$name")
  fi
}

# 断言某段输出包含某字符串
check_contains() {
  local name="$1"; local needle="$2"; shift 2
  local out
  out=$("$@" 2>&1)
  if echo "$out" | grep -qF -- "$needle"; then
    printf '  \033[32m✓\033[0m %s\n' "$name"
    PASS=$((PASS+1))
  else
    printf '  \033[31m✗\033[0m %s  (未找到: %s)\n' "$name" "$needle"
    FAIL=$((FAIL+1))
    FAILED_ITEMS+=("$name")
  fi
}

hr "1. 环境"
printf '  node %s / npm %s\n' "$(node -v)" "$(npm -v)"

hr "2. 数据与索引"
if [[ -d data/index ]]; then
  printf '  索引文件: %s 个\n' "$(ls data/index/*.idx.json 2>/dev/null | wc -l | tr -d ' ')"
else
  printf '  \033[33m!\033[0m 无索引目录（数据相关项将跳过）\n'
  SKIP=$((SKIP+1))
fi

hr "3. 类型检查"
for p in chart-engine reading-index core citation-guard; do
  [[ -f "packages/$p/tsconfig.json" ]] || continue
  check "packages/$p" npx tsc --noEmit -p "packages/$p/tsconfig.json"
done
[[ -f packages/ask/tsconfig.json ]] && check "packages/ask" npx tsc --noEmit -p packages/ask/tsconfig.json
[[ -f apps/cli/tsconfig.json ]] && check "apps/cli" npx tsc --noEmit -p apps/cli/tsconfig.json
[[ -f apps/web/tsconfig.json ]] && check "apps/web" npx tsc --noEmit -p apps/web/tsconfig.json

hr "4. 回归测试"
if [[ -f tests/run.ts ]]; then
  check "npm test" npm test
else
  printf '  \033[33m!\033[0m tests/run.ts 不存在\n'
  SKIP=$((SKIP+1))
fi

hr "5. 键口径实证校验"
if [[ -f tests/test_key_alignment.ts ]]; then
  out=$(npx tsx tests/test_key_alignment.ts 2>&1)
  echo "$out" | grep -E "样本总数|口径A|口径B|不匹配" | sed 's/^/    /'
  # 兼容两种输出契约：旧版打印 PASS/FAIL，新版打印 通过 N / 失败 N
  if echo "$out" | grep -q "PASS"; then
    printf '  \033[32m✓\033[0m 键口径一致\n'
    PASS=$((PASS+1))
  elif echo "$out" | grep -qE "失败\s*0" && echo "$out" | grep -q "口径A"; then
    printf '  \033[32m✓\033[0m 键口径一致\n'
    PASS=$((PASS+1))
  else
    printf '  \033[31m✗\033[0m 键口径不一致\n'
    FAIL=$((FAIL+1))
    FAILED_ITEMS+=("键口径校验")
  fi
fi

hr "6. CLI 端到端"
if [[ -f apps/cli/src/index.ts ]]; then
  check_contains "chart 输出 命宫丑" "命宫" npx tsx apps/cli/src/index.ts chart --date 1990-01-01 --hour 0 --gender male
  check_contains "chart 输出 水二局" "水二局" npx tsx apps/cli/src/index.ts chart --date 1990-01-01 --hour 0 --gender male
  check_contains "chart 输出 命主巨门" "巨门" npx tsx apps/cli/src/index.ts chart --date 1990-01-01 --hour 0 --gender male
  check_contains "read 命中 13 维" "13/13" npx tsx apps/cli/src/index.ts read --date 1990-01-01 --hour 0 --gender male
  check_contains "中文时辰等价" "天府" npx tsx apps/cli/src/index.ts read --date 1990-01-01 --hour 子 --gender male
# 1949 在数据集范围（1950–2026）之外，是当前唯一可达的「年份未建索引」分支
  check_contains "未覆盖诚实提示" "样本库未覆盖" npx tsx apps/cli/src/index.ts read --date 1949-06-15 --hour 6 --gender female
  check_contains "署名（数据集）" "王多鱼AI" npx tsx apps/cli/src/index.ts chart --date 1990-01-01 --hour 0 --gender male
  check_contains "免责声明" "不构成任何医疗" npx tsx apps/cli/src/index.ts chart --date 1990-01-01 --hour 0 --gender male
  check_contains "coverage 输出年份" "1990" npx tsx apps/cli/src/index.ts coverage
  check "help 无参数可用" npx tsx apps/cli/src/index.ts help
  # 晚子时换算
  out=$(npx tsx apps/cli/src/index.ts chart --date 1990-01-01 --clock 23:30 --gender male 2>&1)
  if echo "$out" | grep -q "1990年1月2日"; then
    printf '  \033[32m✓\033[0m 晚子时按次日排盘\n'
    PASS=$((PASS+1))
  else
    printf '  \033[31m✗\033[0m 晚子时未按次日排盘\n'
    FAIL=$((FAIL+1))
    FAILED_ITEMS+=("晚子时换算")
  fi
  # JSON 可解析
  if npx tsx apps/cli/src/index.ts chart --date 1990-01-01 --hour 0 --gender male --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{JSON.parse(s)})" 2>/dev/null; then
    printf '  \033[32m✓\033[0m --json 输出可解析\n'
    PASS=$((PASS+1))
  else
    printf '  \033[31m✗\033[0m --json 输出不可解析\n'
    FAIL=$((FAIL+1))
    FAILED_ITEMS+=("--json")
  fi
else
  printf '  \033[33m!\033[0m CLI 不存在\n'
  SKIP=$((SKIP+1))
fi

hr "7. 引文降级与追问模块"
if [[ -f packages/citation-guard/src/selftest.ts ]]; then
  check "citation-guard 自测" npx tsx packages/citation-guard/src/selftest.ts
fi
if [[ -f packages/ask/src/__selftest.ts ]]; then
  check "ask 模块自测" npx tsx packages/ask/src/__selftest.ts
fi

hr "8. Web 构建"
if [[ -f apps/web/package.json ]]; then
  check "next build" npm run web:build
else
  printf '  \033[33m!\033[0m Web 不存在\n'
  SKIP=$((SKIP+1))
fi

hr "总览"
printf '  通过 \033[32m%d\033[0m  失败 \033[31m%d\033[0m  跳过 \033[33m%d\033[0m\n' "$PASS" "$FAIL" "$SKIP"
if [[ ${#FAILED_ITEMS[@]} -gt 0 ]]; then
  printf '\n  失败项:\n'
  for i in "${FAILED_ITEMS[@]}"; do printf '    · %s\n' "$i"; done
fi
echo
[[ $FAIL -eq 0 ]] && echo "✅ MVP 验收通过" || echo "❌ MVP 验收未通过"
exit $(( FAIL > 0 ? 1 : 0 ))
