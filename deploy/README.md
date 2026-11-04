# 紫微助手 —— 单机 Docker 部署（运维手册）

> 面向**部署者**：怎么把「紫微助手」跑在一台机器上。
> 面向**使用者**的产品说明见 [`docs/DEPLOY.md`](../docs/DEPLOY.md)。

---

## 0. 一句话架构

```
[浏览器] → :3000 → [Next.js 16 生产服务] → /app/data/compact/*.bin（压缩形态，优先）
                                       → /app/data/raw/*.jsonl（原始形态，兜底）
                              └→ /app/data/index/*.idx.json
                                    （解读正文在这里，按字节偏移 seek）
```

- **镜像里只有代码**（Next.js 构建产物 + workspace 源码 + node_modules）。
- **解读数据集在镜像外**：全量压缩形态 1.5GB（推荐）/ 原始形态 53GB，落在 volume `/app/data`。
- **镜像里没有任何 API key**，追问 provider 运行时注入。

| 组件 | 版本 | 说明 |
|---|---|---|
| 基础镜像 | `node:22-slim` | Next.js 16 要求 Node ≥ 20.9 |
| Web | Next.js 16.4.3 / React 19 | `apps/web` |
| 数据集 | v4.0-13d（1950–2026） | CC BY 4.0，**须署名**（页脚已带） |

---

## 1. 前置条件

- Docker ≥ 20.10（`docker compose` v2）或 Docker Desktop
- 磁盘：镜像 ~1GB + 数据（压缩形态全量 1.5GB / 原始形态全量 53GB，见第 4.7 节）
- 网络：构建时要能拉 `node:22-slim`；下载数据时要能访问 GitHub Release

---

## 2. 快速开始

```bash
cd /path/to/ziwei

# ① 构建镜像
docker build -f deploy/Dockerfile -t ziwei-assistant:latest .

# ② 准备数据（容器内执行，详见第 4 节）
docker compose -f deploy/docker-compose.yml run --rm ziwei \
  sh -c "scripts/download_data.sh --years 1990,2000,2020 --decompress 1990,2000,2020"
docker compose -f deploy/docker-compose.yml run --rm ziwei \
  sh -c "npm run index:build -- --years 1990,2000,2020"

# ③ 起服务
docker compose -f deploy/docker-compose.yml up -d

# ④ 看一眼
docker compose -f deploy/docker-compose.yml logs -f ziwei
curl -I http://localhost:3000/
```

浏览器打开 <http://localhost:3000>。

---

## 3. 构建镜像

```bash
# 从仓库根构建（context 必须是仓库根，Dockerfile 在 deploy/ 下）
docker build -f deploy/Dockerfile -t ziwei-assistant:latest .
```

几个要点：

- **构建上下文里没有 `data/`**。排除规则写在 `deploy/Dockerfile.dockerignore`
  （Dockerfile 用 `-f` 指定时，Docker 会优先读 Dockerfile 同目录下的
  `<Dockerfile 名>.dockerignore`），所以 53GB 数据永远不会进上下文、更不会进镜像层。
- **三阶段构建**：
  1. `deps` —— 只复制各 workspace 的 `package.json` + `package-lock.json`，跑 `npm ci`；
     源码改动不会让这一层失效。
  2. `build` —— 装上源码，跑 `npm run web:build`（Next.js 生产构建）。
  3. `runtime` —— 只带 `node_modules` + 源码 + `.next`，外加 `zstd`/`curl`。
- **保留 devDependencies**（`tsx` / `typescript`）：容器内要能跑
  `npm run index:build` 和 `npm run chart`，第 4 节的指引直接依赖这两条命令。
- 换架构：Apple Silicon 上构建出的是 `linux/arm64`。部署到 x86_64 服务器时加
  `--platform linux/amd64`。

构建完验证一下镜像里确实没有数据：

```bash
docker run --rm ziwei-assistant:latest ls -la /app     # 看不到 data/
docker images ziwei-assistant
```

---

## 4. 数据准备（重点）

### 4.1 数据放在哪

容器内的路径固定是 `/app/data`（`ZIWEI_DATA_DIR=/app/data`），结构必须是：

```
/app/data/
├── zst/                    压缩包（可选，164MB/全量）
│   └── year-1990.jsonl.zst
├── raw/                    解压后的 JSONL（每份约 740MB）
│   └── year-1990.jsonl
└── index/                  偏移索引（每份约 342KB）
    └── year-1990.idx.json
```

> ⚠️ **索引不是可选的**。检索靠「字节偏移索引」定位正文：
> 索引里存 `key → [offset, length]`，查询时 `fs.readSync` 直接 seek 到那一行。
> 只有 `raw/` 没有 `index/`，界面会诚实提示「样本库未覆盖」。

### 4.2 compose 默认：具名卷

`deploy/docker-compose.yml` 默认把具名卷 `ziwei-data` 挂到 `/app/data`。
数据在容器里，用下面两条命令灌进去：

```bash
# 下载 + 解压（约 2MB 下载 + 740MB 落盘 per year）
docker compose -f deploy/docker-compose.yml run --rm ziwei \
  sh -c "scripts/download_data.sh --years 1990 --decompress 1990"

# 建索引（约 3.3 秒/年）
docker compose -f deploy/docker-compose.yml run --rm ziwei \
  sh -c "npm run index:build -- --years 1990"
```

全量 77 年：

```bash
for y in $(seq 1950 2026); do
  docker compose -f deploy/docker-compose.yml run --rm ziwei \
    sh -c "scripts/download_data.sh --years $y --decompress $y"
done
docker compose -f deploy/docker-compose.yml run --rm ziwei \
  sh -c "npm run index:build"
```

### 4.3 已经在宿主机上有数据：绑定挂载

如果 `data/` 已经在宿主机（这是本机开发时最常见的情况），把它挂进去更省事。
把 compose 里的 volume 改成：

```yaml
    volumes:
      - /宿主机/路径/ziwei/data:/app/data
```

或者不动 compose，用一个 override 文件：

```yaml
# deploy/docker-compose.hostdata.yml
services:
  ziwei:
    volumes:
      - /宿主机/路径/ziwei/data:/app/data
```

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.hostdata.yml up -d
```

> 挂载点必须是 `/app/data`，且 `ZIWEI_DATA_DIR` 必须与之一致。
> compose 已经把 `ZIWEI_DATA_DIR` 钉在 `/app/data`，别改。

### 4.4 解压必须带 `--long=27`

上游用了长窗口压缩，不带这个参数会解码失败。`scripts/download_data.sh` 已经带上了：

```bash
zstd -d --long=27 year-1990.jsonl.zst
```

### 4.5 不想下 53GB？先用迷你假数据集冒烟

`deploy/make-test-dataset.sh` 造 1 个年份、4 条**合法**记录（字段照 `docs/DATA.md` 第 6 节），
再用**真正的** `index:build` 生成偏移索引 —— 与生产完全同一条代码路径。几秒钟就能验证整套部署：

```bash
# 宿主机造数据 + 建索引
deploy/make-test-dataset.sh /tmp/ziwei-test-data 1990

# 起容器 + 验证
docker run --rm -d --name ziwei -p 3000:3000 -v /tmp/ziwei-test-data:/app/data ziwei-assistant:latest
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/
curl -s 'http://localhost:3000/chart?y=1990&m=1&d=1&h=0&g=male' | grep -o '天府' | head -1
```

镜像里也带了这个脚本，容器内一条命令搞定：

```bash
docker run --rm -v /tmp/ziwei-test-data:/app/data ziwei-assistant:latest \
  sh -c "deploy/make-test-dataset.sh /app/data 1990 --no-index && npm run index:build -- --years 1990"
```

> 假数据只适合验证部署链路（挂载、索引、检索、渲染），
> 解读正文是占位文本，**不是**真实解读内容。

### 4.6 数据没就位时容器会怎样

`deploy/entrypoint.sh` 在启动 Next.js 之前检查 `raw/` 与 `index/`：

| 情况 | 行为 | 退出码 |
|---|---|---|
| `raw/` `index/` 都没有 | 打印中文指引（下载 / 解压 / 建索引三条命令） | 1 |
| 有 `raw/`、没 `index/` | 打印中文指引（`npm run index:build`） | 1 |
| 有 `index/`、没 `raw/` | 打印中文指引（重新下载解压） | 1 |
| 都就位 | 启动 Next.js | 0 |

不会静默空盘跑起来，也**不会**打印堆栈。

> compose 里 `restart: unless-stopped`，所以数据没就位时容器会**反复重启**（日志里每次都会打
> 上面那段中文指引）。这不是故障循环 —— 数据一灌好它就自动起来了。
> 不想看它刷屏就把 `restart` 改成 `"no"`，或直接用 `docker compose run` 灌完数据再 `up -d`。

### 4.7 压缩数据形态（compact/，推荐）

正文数据有两种形态，**有其一即可**，两者都在时查询优先 compact、raw 兜底：

| 形态 | 位置 | 全量体积 | 说明 |
|---|---|---|---|
| 原始 | `raw/year-YYYY.jsonl` | 53GB | 下载解压产物，偏移索引按字节 seek |
| 压缩 | `compact/year-YYYY.bin` | **1.5GB** | 每条记录独立 zstd 帧 + 共享字典 `compact/dict`，索引带压缩后偏移 |

压缩形态由 `npm run data:compact -- --all` 从 raw 生成（真·子进程并行，幂等跳过已完成年份，
`--force` 重做）。压缩比实测约 **35x**，抽验一致性用
`npx tsx packages/reading-index/src/verify-compact.ts --year 2021`。

磁盘紧张的小服务器（VPS ≤ 20G 盘）建议：volume 里只放 `compact/` + `index/`，
raw 留在本地当源数据，`entrypoint.sh` 的数据检查两种形态都认。

---

## 5. 运行

### 5.1 compose（推荐）

```bash
cp deploy/.env.example deploy/.env     # 可选：配端口 / 追问 provider
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml ps
docker compose -f deploy/docker-compose.yml logs -f ziwei
docker compose -f deploy/docker-compose.yml down
```

`deploy/.env` 里可配：

| 变量 | 默认 | 说明 |
|---|---|---|
| `ZIWEI_PORT` | `3000` | 宿主机映射端口（容器内固定 3000） |
| `ZIWEI_ASK_PROVIDER` | 空 | `openai` / `anthropic` / `echo` |
| `ZIWEI_ASK_BASE_URL` | 空 | OpenAI 兼容端点根地址 |
| `ZIWEI_ASK_API_KEY` | 空 | **真 key 只写这里，不进镜像、不进 git** |
| `ZIWEI_ASK_MODEL` | 空 | 模型名 |
| `ZIWEI_ASK_MAX_TOKENS` | `8000` | 单次输出上限 |
| `ZIWEI_STATE_DIR` | `/app/state` | 运行状态目录（账户 / 会话 / 订单 / 每日额度计数）—— 必须挂 volume，否则重建容器丢账户与流量包余额 |
| `ZIWEI_RESEND_API_KEY` | 空 | 验证码发信通道（Resend）。**空 = 不发信**：开发环境回 debugCode，生产环境报「邮件服务未配置」 |
| `ZIWEI_RESEND_FROM` | `紫微助手 <onboarding@resend.dev>` | 发信人地址（Resend 需已验证域名） |
| `ZIWEI_OTP_DEBUG` | 空 | `1` = 强制调试模式（回 debugCode，不发信）—— 生产别开 |
| `ZIWEI_ASK_DAILY_LIMIT` | `3` | 每日免费追问次数（按账户 / 按 IP） |

> 追问 provider 留空 = 不接任何模型 API。排盘与 13 维解读（数据集检索）
> **完全不受影响**，追问面板会明确提示「未配置 provider」，不会有出网请求。

### 5.2 docker run

```bash
docker run -d --name ziwei \
  -p 3000:3000 \
  -v ziwei-data:/app/data \
  -v ziwei-state:/app/state \
  -e ZIWEI_ASK_PROVIDER=openai \
  -e ZIWEI_ASK_BASE_URL=https://api.deepseek.com \
  -e ZIWEI_ASK_API_KEY=sk-... \
  -e ZIWEI_ASK_MODEL=deepseek-chat \
  --restart unless-stopped \
  ziwei-assistant:latest
```

### 5.3 进容器排查

```bash
docker exec -it ziwei bash
# 容器里可以直接用 CLI 排盘
npm run chart -- --date 1990-01-01 --hour 0 --gender male
# 看覆盖情况
npx tsx apps/cli/src/index.ts coverage
```

---

## 6. 升级

```bash
git pull
docker build -f deploy/Dockerfile -t ziwei-assistant:latest .
docker compose -f deploy/docker-compose.yml up -d      # 重建容器
```

**数据不用动** —— 数据在 volume 里，重建容器不影响。卷名固定为 `ziwei-data`。

数据侧需要补年份时（不用重建镜像）：

```bash
docker compose -f deploy/docker-compose.yml run --rm ziwei \
  sh -c "scripts/download_data.sh --years 2025 --decompress 2025"
docker compose -f deploy/docker-compose.yml run --rm ziwei \
  sh -c "npm run index:build -- --years 2025"
```

---

## 7. 排错

| 症状 | 原因 | 处理 |
|---|---|---|
| 容器起来又退出，日志有中文指引 | 数据没就位 | 按日志里的三条命令准备数据（第 4 节） |
| 页面显示「样本库未覆盖」 | 该年份没建索引 | `npm run index:build -- --years <年>` |
| 页面显示「样本库未覆盖（key 不存在）」 | 该日期/时辰/性别不在数据集覆盖内 | 换生辰；数据集是真实日期全覆盖，理论上不会发生 |
| 首页 500，日志有 `数据源不存在` | 索引在、`raw/` 与 `compact/` 都不在 | 正文数据两种形态有其一即可（第 4.7 节） |
| 镜像构建卡在 apt-get update | 国内直连 `deb.debian.org` 挂起 | 加 `--build-arg DEBIAN_MIRROR=mirrors.aliyun.com` |
| `curl` 首页超时 | 端口被占 | 改 `ZIWEI_PORT`；容器内端口恒为 3000 |
| 磁盘写满 | 全量数据 53GB | 只铺需要的年份；`docker system df` 清理 |
| 镜像构建卡在 `transferring context` | `.dockerignore` 没生效 | 确认用的是 `deploy/Dockerfile.dockerignore`（`-f deploy/Dockerfile` 时才生效） |
| 追问面板报「provider 未配置」 | 没设 `ZIWEI_ASK_*` | 在 `deploy/.env` 里补；不配也**不影响**排盘与解读 |

看日志：

```bash
docker compose -f deploy/docker-compose.yml logs --tail=100 ziwei
docker logs --tail=100 ziwei
```

---

## 8. 已知边界

- **镜像里没有数据集**：53GB 绝不打进镜像层。数据必须在 `/app/data`。
- **`ZIWEI_DATA_DIR` 必须显式设置**：Next.js 打包后 `import.meta.url` 指向构建产物，
  容器里靠模块自身路径找仓库根会失败。镜像里已经 `ENV ZIWEI_DATA_DIR=/app/data`。
- **镜像体积**：见 `docker images`（约 1GB 量级，主要来自 node_modules）。
  项目用了 npm workspaces + `transpilePackages`，Next.js 的 standalone 输出
  在这种布局下不保证可用，所以**没有**用 standalone —— 保证能跑优先。
- **不做真太阳时 / 夏令时**：数据集本身没做，校正会让检索键错位。
- **数据许可 CC BY 4.0**：页脚与 `/about` 页已带署名，容器化不改变这一点。
- **倪师《天纪》引文**：数据集中密度很高，商业化前须按 `docs/LEGAL_NOTES.md` 处理。

---

## 9. 生产环境（secondplanet）标准发布流程

> **生产**：https://ziwei.secondplanet.cc —— 腾讯云上海 CVM `49.234.25.35`（用户 `ubuntu`），
> 与 SecondPlanet Enterprise 的其它服务共机。2026-11-02 起按本节流程发布，**后续都这样**。

### 9.1 环境一览

| 项 | 值 |
|---|---|
| SSH | `ssh -i ~/.ssh/sp-deploy-rsa ubuntu@49.234.25.35`（sshd 只认 RSA） |
| 代码目录 | `/opt/ziwei/`（rsync 同步，非 git checkout） |
| 数据 volume | 具名卷 `ziwei-data` → `/app/data`（`compact/` + `index/`，共 1.6GB，raw 不上服务器） |
| 状态 volume | 具名卷 `ziwei-state` → `/app/state`（账户 / 会话 / 订单 / 每日额度计数） |
| 容器 | `ziwei-assistant`，`--restart unless-stopped`，端口 `3000:3000` |
| 镜像 | `ziwei-assistant:compact`（当前生产 tag） |
| 反代 | 宿主机 Nginx `/etc/nginx/sites-enabled/ziwei` → `127.0.0.1:3000` |
| TLS | Let's Encrypt（`certbot certonly --webroot -w /var/www/html -d ziwei.secondplanet.cc`），证书自动续期走系统 certbot timer |
| DNS | DNSPod `secondplanet.cc` 的 A 记录 `ziwei → 49.234.25.35`（API Token 见用户，不在仓库） |

### 9.2 发布步骤（代码有更新时）

```bash
# ① 同步代码（排除数据/依赖/构建产物）
rsync -az --rsync-path='sudo rsync' \
  --exclude=data --exclude=node_modules --exclude=.next --exclude=.git \
  --exclude=shots --exclude='.DS_Store' --exclude='*.log' \
  -e "ssh -i ~/.ssh/sp-deploy-rsa" \
  /Users/fangchen/Baidu/GitHub/ziwei/ ubuntu@49.234.25.35:/opt/ziwei/

# ② 服务器上构建（DEBIAN_MIRROR 必带，否则 apt 卡死）
#   ⚠️ 必须看 BUILD_EXIT：构建失败时旧镜像还在，冒烟与切换会「全部正常」，
#      但线上跑的是上一版代码（2026-11-03 踩过）。
ssh -i ~/.ssh/sp-deploy-rsa ubuntu@49.234.25.35 '
  sudo docker build -f /opt/ziwei/deploy/Dockerfile \
    --build-arg DEBIAN_MIRROR=mirrors.aliyun.com \
    -t ziwei-assistant:compact /opt/ziwei 2>&1 | tail -3
  echo "BUILD_EXIT=${PIPESTATUS[0]}"'

# ③ 冒烟测试（临时容器，3001 若被占换 3002）
ssh -i ~/.ssh/sp-deploy-rsa ubuntu@49.234.25.35 '
  docker run -d --name ziwei-test --rm -p 127.0.0.1:3002:3000 \
    -v ziwei-data:/app/data -v ziwei-state:/app/state ziwei-assistant:compact && sleep 8 \
    && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3002/ \
    && docker rm -f ziwei-test'

# ④ 切换生产容器
#   ⚠️ --env-file 必带：镜像出于安全不含 .env.local，追问的 MiniMax 配置靠运行时注入。
#   漏了的话容器里 0 个 ZIWEI_ASK_* 变量，界面会退回「AI 还没配置」。
ssh -i ~/.ssh/sp-deploy-rsa ubuntu@49.234.25.35 '
  docker stop ziwei-assistant && docker rm ziwei-assistant
  docker run -d --name ziwei-assistant --restart unless-stopped -p 3000:3000 \
    --env-file /opt/ziwei/apps/web/.env.local \
    -v ziwei-data:/app/data -v ziwei-state:/app/state ziwei-assistant:compact
  docker image prune -f'

# ⑤ 公网验证
curl -s -o /dev/null -w "%{http_code}\n" https://ziwei.secondplanet.cc/
curl -s "https://ziwei.secondplanet.cc/chart?y=2021&m=6&d=15&h=4&g=male" | grep -c 【命格总览】
```

### 9.3 数据更新（补年份 / 重压缩）

数据在**本地**生成，只推压缩形态：

```bash
# 本地：压缩新年份（幂等，跳过已完成的）
npm run data:compact -- --all
# 本地：抽验一致
npx tsx packages/reading-index/src/verify-compact.ts --year <新年份>

# 推送到服务器 volume（sudo rsync，因为 volume 属 root）
rsync -az --rsync-path='sudo rsync' -e "ssh -i ~/.ssh/sp-deploy-rsa" \
  data/compact/ ubuntu@49.234.25.35:/var/lib/docker/volumes/ziwei-data/_data/compact/
rsync -az --rsync-path='sudo rsync' -e "ssh -i ~/.ssh/sp-deploy-rsa" \
  data/index/ ubuntu@49.234.25.35:/var/lib/docker/volumes/ziwei-data/_data/index/

# 重启容器加载新索引
ssh -i ~/.ssh/sp-deploy-rsa ubuntu@49.234.25.35 'docker restart ziwei-assistant'
```

### 9.4 排障要点

- **追问转圈很久甚至报「请求 … 失败：The operation was aborted due to timeout」** —— 多半是模型选成了思维链模型。
  2026-11-03 实测（同一提示词，直连 MiniMax）：`MiniMax-M3` 思考 token 吃满 `max_tokens`（11967/12496），
  **总耗时 281s**，超过 provider 的 180s 超时 → 用户看到的是三分钟转圈后报错；
  `MiniMax-M1` 同样提示词 **12s**（思考仅 397 token）。生产用 **`MiniMax-M1`**，`max_tokens=8000`。
  换模型记得 `docker restart` **不生效**（env 是创建容器时注入的），要重建容器。
  另：`MiniMax-M2` 已下线（404），`MiniMax-Text-01` 虽快但会把大限答错，别用。
- 容器起不来先看 `docker logs ziwei-assistant`——entrypoint 会打中文指引。
- 服务器磁盘 40G 已用 87%，构建镜像前先 `df -h` 确认余量 ≥ 3G，切完 `docker image prune -f`。
- 3000 端口属 ziwei；8088 属 enterprise API；3001 被别的进程占用，冒烟测试用 3002。
- HTTPS 证书续期失败时手动跑：`sudo certbot renew --dry-run` 排查（webroot 模式，Nginx 必须在线）。
