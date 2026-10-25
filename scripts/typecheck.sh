#!/usr/bin/env bash
# 全仓类型检查。
#
# 遍历所有含 tsconfig.json 的包与应用，逐个 tsc --noEmit。
# 目录不存在则跳过（不报错），但**真实的类型错误一定导致非零退出码**。
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

TARGETS=()
for d in packages/*/ apps/*/ tests/; do
  [[ -f "${d}tsconfig.json" ]] && TARGETS+=("${d%/}")
done

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "没有找到任何 tsconfig.json" >&2
  exit 1
fi

FAILED=()
for t in "${TARGETS[@]}"; do
  printf '  %-28s ' "$t"
  out=$(npx tsc --noEmit -p "${t}/tsconfig.json" 2>&1)
  if [[ $? -eq 0 ]]; then
    printf '\033[32mok\033[0m\n'
  else
    printf '\033[31mFAIL\033[0m\n'
    echo "$out" | head -12 | sed 's/^/      /'
    FAILED+=("$t")
  fi
done

echo
if [[ ${#FAILED[@]} -gt 0 ]]; then
  printf '\033[31m类型检查未通过\033[0m: %s\n' "${FAILED[*]}"
  exit 1
fi
printf '\033[32m类型检查全部通过\033[0m（%d 个包）\n' "${#TARGETS[@]}"
