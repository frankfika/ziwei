#!/usr/bin/env bash
# 生产构建冒烟 —— 用真实产物起服务，逐路由探测。
#
#   scripts/prod-smoke.sh [端口]
#
# 与 scripts/acceptance.sh 的分工：那个跑「构建」，这个跑「构建出来的东西」。
# 先 npm run web:build，再跑本脚本：
#   npm run web:build && bash scripts/prod-smoke.sh
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

PORT="${1:-3111}"
WEB_DIR="apps/web"

if [[ ! -d "$WEB_DIR/.next" ]]; then
  echo "没有构建产物：先跑 npm run web:build" >&2
  exit 1
fi

PASS=0
FAIL=0
FAILED=()

check_route() {
  local path="$1" expect="$2" label="$3"
  local code
  code=$(curl -s -H "Cookie: ziwei_lang=zh" -o /tmp/ziwei_smoke_body -w '%{http_code}' "http://127.0.0.1:${PORT}${path}" || echo 000)
  if [[ "$code" == "200" ]]; then
    if grep -qF -- "$expect" /tmp/ziwei_smoke_body; then
      printf '  \033[32m✓\033[0m %-12s %s\n' "$label" "${path}"
      PASS=$((PASS + 1))
      return
    fi
    printf '  \033[31m✗\033[0m %-12s %s — 200 但没有找到标记「%s」\n' "$label" "${path}" "$expect"
    FAIL=$((FAIL + 1))
    FAILED+=("${label} ${path}")
    return
  fi
  printf '  \033[31m✗\033[0m %-12s %s — HTTP %s\n' "$label" "${path}" "$code"
  FAIL=$((FAIL + 1))
  FAILED+=("${label} ${path}")
}

echo "── 起服务（端口 ${PORT}）──"
( cd "$WEB_DIR" && PORT="$PORT" npx next start -p "$PORT" >/tmp/ziwei_smoke.log 2>&1 ) &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null
}
trap cleanup EXIT

READY=0
for _ in $(seq 1 40); do
  if curl -s -o /dev/null "http://127.0.0.1:${PORT}/"; then
    READY=1
    break
  fi
  sleep 0.5
done
if [[ "$READY" -ne 1 ]]; then
  echo "服务没起来，日志尾部：" >&2
  tail -20 /tmp/ziwei_smoke.log >&2
  exit 1
fi

echo "── 路由探测 ──"
check_route "/" "紫微助手" "首页"
check_route "/new" "出生" "排盘"
check_route "/about" "紫微" "关于"
check_route "/chart?y=1990&m=6&d=15&h=10&g=male" "命" "命盘"
check_route "/report" "报" "报告"
check_route "/synastry" "合盘" "合盘"
check_route "/api/quota" "" "额度接口"

echo
echo "  通过 ${PASS} / 失败 ${FAIL}"
if [[ ${#FAILED[@]} -gt 0 ]]; then
  for f in "${FAILED[@]}"; do printf '    · %s\n' "$f"; done
  exit 1
fi
echo "✅ 生产冒烟通过"
