/**
 * 帮助文本。
 *
 * 面向「非技术同事 1 分钟上手」：先给四行最常用命令，再给完整参数表。
 */

export function helpText(): string {
  return `紫微助手 CLI —— 排盘 + 13 维解读 + 命盘追问

最常用的三条：
  ziwei chart --date 1990-01-01 --hour 0 --gender male     只看命盘（12 宫）
  ziwei read  --date 1990-01-01 --hour 0 --gender male     命盘 + 13 维解读摘要
  ziwei coverage                                           看样本库覆盖了哪些年份

子命令：
  chart       排盘并打印 12 宫摘要
  read        排盘 + 13 维解读
  ask         基于命盘追问（需要先配置模型 provider，见下）
  coverage    样本库覆盖情况
  help        显示本帮助

参数：
  --date <YYYY-MM-DD>   公历出生日期（必填）
  --hour <0-11 | 子丑…>  时辰序号或中文地支（必填，与 --clock 二选一）
  --clock <HH:MM>       用钟点代替时辰序号；晚子时（23:00–23:59）按次日排盘
  --gender <male|female> 性别（必填，也可写 男/女、m/f）
  --name <姓名>          展示用称呼
  --dim <维度>           只看某一维，如 love / 感情（仅 read）
  --question <问题>      要问的问题（仅 ask，必填）
  --full                 read 打印 13 维全文（默认只显示每维前 200 字）
  --json                 输出机器可读 JSON
  --no-color             关闭颜色
  -h, --help             显示帮助

追问（ask）需要先配置模型 provider（默认不联网）：
  export ZIWEI_ASK_PROVIDER=openai
  export ZIWEI_ASK_BASE_URL=https://api.minimaxi.com/v1
  export ZIWEI_ASK_API_KEY=sk-...
  export ZIWEI_ASK_MODEL=MiniMax-M1
  # 可选：export ZIWEI_ASK_MAX_TOKENS=8000
  # ⚠️ 别用思维链模型（M3 / R1 / QwQ…）：思考 token 与正文共用 max_tokens 预算，
  #    思考一长就撞上 180s 超时（实测 M3 同一问题 281s，M1 只要 12s）。

示例：
  ziwei read --date 1990-01-01 --hour 子 --gender male
  ziwei chart --date 1990-01-01 --clock 23:30 --gender male
  ziwei read --date 1990-01-01 --hour 0 --gender male --dim love
  ziwei ask  --date 1990-01-01 --hour 0 --gender male --question "这份命盘适合做什么工作？"
  ziwei coverage --json`;
}
