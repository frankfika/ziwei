# 部署指南（紫微助手）

> 想在自己的一台机器上跑「紫微助手」？看这一篇。
> 运维细节（镜像构建、卷管理、升级、排错）见 [`deploy/README.md`](../deploy/README.md)。

---

## 1. 紫微助手是什么

输入生辰 → **确定性排盘** → 12 宫命盘 + 13 维解读（正文来自开源数据集检索）→（可选）基于命盘追问。

- 排盘由程序算，不由模型算。
- 解读正文从「紫微斗数开源解读数据集 v4.0-13d」按需检索，不凭空生成。
- 追问可接可不接；不接也不影响排盘和解读。

---

## 2. 两种部署方式

| | 本机跑（开发） | 单机 Docker（部署） |
|---|---|---|
| 命令 | `npm run web:dev` | `docker compose -f deploy/docker-compose.yml up -d` |
| 数据 | 仓库根的 `data/` | volume `ziwei-data` → `/app/data` |
| 适合 | 改代码 | 交付给别人用、长期挂着 |

开发方式见 [`README.md`](../README.md) 快速开始。本文只讲 Docker。

---

## 3. 你需要准备什么

- Docker ≥ 20.10（带 `docker compose` v2）或 Docker Desktop
- 磁盘：
  - 镜像约 1.1GB
  - 数据：只铺 3 年约 **2.1GB**；全量 77 年（1950–2026）约 **53GB**
- 网络：构建时拉 `node:22-slim`；准备数据时访问 GitHub Release

---

## 4. 三步部署

### 第 1 步：构建镜像

```bash
git clone <仓库地址> ziwei && cd ziwei
docker build -f deploy/Dockerfile -t ziwei-assistant:latest .
```

> 构建上下文里**不含**数据集（`deploy/Dockerfile.dockerignore` 已经排除了 `data/`），
> 所以这一步很快，也不会产生几十 GB 的镜像。

### 第 2 步：准备数据

解读正文来自开源数据集（CC BY 4.0），**不在镜像里**，要单独灌进数据卷。

**只要几年**（推荐先这样，2.1GB）：

```bash
docker compose -f deploy/docker-compose.yml run --rm ziwei \
  sh -c "scripts/download_data.sh --years 1990,2000,2020 --decompress 1990,2000,2020"

docker compose -f deploy/docker-compose.yml run --rm ziwei \
  sh -c "npm run index:build -- --years 1990,2000,2020"
```

**要全量**（53GB）：

```bash
for y in $(seq 1950 2026); do
  docker compose -f deploy/docker-compose.yml run --rm ziwei \
    sh -c "scripts/download_data.sh --years $y --decompress $y"
done
docker compose -f deploy/docker-compose.yml run --rm ziwei \
  sh -c "npm run index:build"
```

> 解压必须带 `--long=27`（上游用了长窗口压缩），`download_data.sh` 已经带上了。

**已经在宿主机有 `data/` 了？** 改用绑定挂载，省一次下载：

```yaml
# deploy/docker-compose.yml
    volumes:
      - /宿主机/路径/ziwei/data:/app/data     # 代替 - ziwei-data:/app/data
```

### 第 3 步：起服务

```bash
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml logs -f ziwei
```

浏览器打开 <http://localhost:3000>。

---

## 5. 追问功能（可选）

追问 = 基于已经排好的盘继续提问。**不配也完全能用** —— 排盘和 13 维解读都走数据集检索，跟模型无关。
不配置时，追问面板会明确显示「未配置 provider」，不会有任何出网请求。

配置（密钥只写在 `deploy/.env`，不进镜像、不进 git）：

```bash
cp deploy/.env.example deploy/.env
```

```bash
# deploy/.env
ZIWEI_ASK_PROVIDER=openai
ZIWEI_ASK_BASE_URL=https://api.deepseek.com
ZIWEI_ASK_API_KEY=sk-你的真 key
ZIWEI_ASK_MODEL=deepseek-chat
```

然后重启：

```bash
docker compose -f deploy/docker-compose.yml up -d
```

支持的 provider：`openai`（OpenAI 兼容协议：DeepSeek / 智谱 / vLLM / Ollama 等）、`anthropic`、`echo`（不联网的本地桩，用于自测）。

> 成本约束：单次调用预期花费 > ≈¥7 / USD $1 时，请先与负责人确认再开启。

---

## 6. 常用操作

```bash
docker compose -f deploy/docker-compose.yml ps          # 看状态（含 healthy）
docker compose -f deploy/docker-compose.yml logs -f ziwei
docker compose -f deploy/docker-compose.yml restart ziwei
docker compose -f deploy/docker-compose.yml down
docker compose -f deploy/docker-compose.yml down -v      # 连数据卷一起删（数据没了）
```

**升级**（数据在卷里，不受影响）：

```bash
git pull
docker build -f deploy/Dockerfile -t ziwei-assistant:latest .
docker compose -f deploy/docker-compose.yml up -d
```

**补年份**（不用重建镜像）：

```bash
docker compose -f deploy/docker-compose.yml run --rm ziwei \
  sh -c "scripts/download_data.sh --years 2025 --decompress 2025"
docker compose -f deploy/docker-compose.yml run --rm ziwei \
  sh -c "npm run index:build -- --years 2025"
```

---

## 7. 遇到问题

| 现象 | 说明 | 怎么办 |
|---|---|---|
| 容器起来就退出，日志有中文指引 | 数据没就位 | 按日志里的三条命令准备数据（第 4 步） |
| 页面写「样本库未覆盖」 | 该年份没建索引 | `npm run index:build -- --years <年份>` |
| 端口被占 | 3000 有别的服务 | 在 `deploy/.env` 里改 `ZIWEI_PORT` |
| 磁盘满了 | 全量数据 53GB | 只铺需要的年份；`docker system df` 清理 |
| 想要更小的镜像 | 目前 ~1.1GB | 见下面「已知边界」 |

更多排错见 [`deploy/README.md` 第 7 节](../deploy/README.md)。

---

## 8. 实战部署记录（2026-10-31 · 腾讯云 Lighthouse）

这台机器上真跑过一遍，踩到的坑比上面写的都具体。按顺序记：

### 8.1 架构不匹配：`exec format error`

本机是 Apple Silicon（arm64），服务器是 x86_64。本地 build 出来的镜像传过去直接
`exec format error` —— 镜像本身没坏，是 CPU 指令集不对。

三种解法，按推荐顺序：

| 做法 | 命令 | 何时用 |
|---|---|---|
| **服务器原生 build**（推荐） | 传源码过去 `docker build` | 服务器能拉到基础镜像时。最快，无模拟损耗 |
| 本地交叉编译 | `docker buildx build --platform linux/amd64` | 服务器不能 build 且你有耐心等 QEMU 模拟 |
| 只传基础镜像，服务器 build | 见下 | 服务器拉不到 Docker Hub 时 |

第三种的具体做法（本次实战用的）：

```bash
# 本机：拉 amd64 版基础镜像并传过去
docker pull --platform linux/amd64 node:22-slim
docker save node:22-slim | gzip -6 > node22-amd64.tar.gz
scp node22-amd64.tar.gz user@server:/opt/app/
# 服务器：载入后 Dockerfile 里的 FROM node:22-slim 会命中本地镜像，不再联网拉
gunzip -c node22-amd64.tar.gz | docker load
docker build -f deploy/Dockerfile -t ziwei-assistant:latest .
```

### 8.2 服务器连不上 GitHub / Docker Hub

国内服务器常见。实测：`github.com` 超时、`registry-1.docker.io` 超时，
但 `registry.npmjs.org` 通（1.4s）、`mirrors.aliyun.com` 通（0.17s）。

所以**数据集和基础镜像都要从本机传**，不能指望服务器自己下。
好消息是 zst 压缩包只有 2MB/年 —— 5 年数据打包才 9.6MB，传输几乎不花时间：

```bash
# 本机
tar -czf data.tar.gz -C data/zst year-1990.jsonl.zst year-2000.jsonl.zst
scp data.tar.gz user@server:/opt/app/
# 服务器：用镜像里的 zstd 解压（--long=27 必须带）
docker run --rm -v ziwei-data:/app/data -v /opt/app/zst:/zst:ro \
  ziwei-assistant:latest sh -c 'zstd -d --long=27 -o /app/data/raw/year-1990.jsonl /zst/year-1990.jsonl.zst'
```

### 8.3 `apt-get update` 长时间挂起

容器里 `apt-get install zstd curl` 会在 `apt-get update` 卡住（实测 5 分钟无进展，
`load average` 掉到 0.06 —— 不是在干活，是卡死）。

`Dockerfile` 已加可换源参数：

```bash
docker build -f deploy/Dockerfile \
  --build-arg DEBIAN_MIRROR=mirrors.aliyun.com \
  -t ziwei-assistant:latest .
```

### 8.4 腾讯云境内服务器：未备案域名会被强制拦截

用 `nip.io` 这类泛解析域名反代过去，访问会 302 到
`https://dnspod.qcloud.com/static/webblock.html?d=...` —— 这是腾讯云对
**未备案域名**解析到境内 IP 的强制拦截，跟 nginx 配没配无关。

**IP 直连不受影响**（备案只针对域名）。所以：

- ✅ 直接用 `http://<服务器IP>:<已放行端口>`
- ❌ 想用域名 → 域名必须已备案，且安全组放行对应端口

### 8.5 查安全组规则（Lighthouse API）

实例 ID 是 `lhins-` 开头（不是 CVM 的 `ins-`）。规则接口返回字段是
`FirewallRuleSet`，不是 `FirewallRules`；网段字段是 `CidrBlock`。

腾讯云 TC3 签名的派生链是 **`HMAC("TC3"+secretKey, date)`**，不是 AWS 风格的
`sha256(date/service)`；credential scope 是 **三段** `{date}/{service}/tc3_request`
（不含 region）。这两处写错会分别得到 `SignatureFailure` 和
`Credential scope size not valid`。

### 8.6 磁盘：build 缓存会吃满盘

服务器 40GB 盘上已有其它业务，build 缓存一度把可用空间吃到 **96MB（100% 满）**，
会连带 MySQL / PostgreSQL 写入失败。**build 完必须清**：

```bash
docker builder prune -af      # 回收 build 缓存（不影响运行中的容器/镜像/卷）
df -h /                       # 确认可用空间
```

### 8.7 本次落地配置

| 项 | 值 |
|---|---|
| 服务器 | 49.234.25.35（腾讯云 Lighthouse，ap-shanghai，x86_64） |
| 对外地址 | `http://49.234.25.35:3000`（安全组 TCP 3000 已放行） |
| 容器 | `ziwei-assistant`，`restart: unless-stopped` |
| 镜像 | 服务器原生 build，1.13GB |
| 数据 | 1990 / 1995 / 2000 / 2010 / 2020 五年，共 43,848 条（卷 `ziwei-data`） |
| 内存占用 | 74MB |
| 磁盘占用 | 镜像 1.13GB + 数据 3.5GB + 索引 ≈ 4.7GB |
| 追问 provider | 未配置（面板会提示未配置，不联网） |

未铺的年份访问时会明确显示「样本库未覆盖该生辰」—— 不静默、不假装有数据。

---

## 9. 已知边界

- **数据不在镜像里**。53GB 数据必须挂到 `/app/data`；不挂时容器会明确报错退出，
  不会静默给你一个空的样本库。
- **镜像体积 ~1.1GB**（node_modules 为主）。Next.js 的 standalone 输出在本项目的
  npm workspaces + `transpilePackages` 布局下不保证可用，所以没用 standalone ——
  **能跑优先**。
- **不做真太阳时 / 夏令时校正**。数据集本身没做，校正会让检索键错位。
- **数据许可 CC BY 4.0，须署名**。署名已内置在页脚与 `/about` 页，容器化不改变这一点。
- **倪师《天纪》引文**在数据集中密度很高（79% 的维度文本含受限引文片段）。
  商业化前须按 [`docs/LEGAL_NOTES.md`](LEGAL_NOTES.md) 处理。
- **本工具仅供文化兴趣与学习之用，不构成任何医疗、法律、投资或人生决策建议。**

---

## 10. 署名

```
本项目使用了「紫微斗数开源解读数据集 v4.0」（674,976 张命盘 × 13 维）
以及开源排盘引擎。
来源：https://github.com/Renhuai123/ziwei-doushu
作者：王多鱼AI
数据集许可：CC BY 4.0；引擎代码：MIT。
```
