#
# 紫微助手（ziwei-assistant）—— 单机 Docker 部署镜像
#
# ─────────────────────────────────────────────────────────────────
# 关键设计
# ─────────────────────────────────────────────────────────────────
# 1. **解读数据集不进镜像**。数据是文件系统驱动的（packages/reading-index
#    用 fs.readSync 按字节偏移 seek 读 data/raw/year-YYYY.jsonl），
#    解压后 53GB。镜像里只放代码，数据一律 volume 挂载到 /app/data。
# 2. **必须显式设 ZIWEI_DATA_DIR**。Next.js 打包后 import.meta.url 指向构建
#    产物，容器里靠模块自身路径找仓库根会失败 —— resolveDataDir() 的第一优先级
#    就是环境变量，所以镜像里 ENV ZIWEI_DATA_DIR=/app/data。
# 3. **镜像里不放任何 API key**。追问 provider 全部走运行时环境变量注入。
#
# 构建：
#   docker build -f deploy/Dockerfile -t ziwei-assistant:latest .
#
# 基础镜像走 daocloud 国内镜像：生产服务器到 registry-1.docker.io 的 DNS 被污染、
# 直连必然超时（2026-11-06 实测解析到 Facebook IP），改用国内镜像源才能构建。
# 运行：
#   docker run --rm -p 3000:3000 -v <宿主机数据目录>:/app/data ziwei-assistant:latest

# ═══════════════════════════════════════════════════════════════════
# 阶段 1：依赖（只复制清单文件，让 pnpm install 命中层缓存）
# ═══════════════════════════════════════════════════════════════════
FROM docker.m.daocloud.io/library/node:22-slim AS deps

WORKDIR /app
ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# pnpm workspace：依赖声明用 workspace:* 协议（npm 不认），权威 lockfile 是
# pnpm-lock.yaml。每个 importer 的 package.json 都要复制，缺一个 --frozen-lockfile 就报不同步。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/cli/package.json                   apps/cli/package.json
COPY apps/web/package.json                   apps/web/package.json
COPY packages/ask/package.json               packages/ask/package.json
COPY packages/chart-engine/package.json      packages/chart-engine/package.json
COPY packages/citation-guard/package.json    packages/citation-guard/package.json
COPY packages/core/package.json              packages/core/package.json
COPY packages/reading-index/package.json     packages/reading-index/package.json

# 保留 devDependencies（tsx / typescript）：容器内要能跑
# `npm run index:build`（建索引）与 `npm run chart`（CLI 排盘）
# registry 走国内镜像，官方源在国内服务器构建常超时。
# node-linker=hoisted：扁平化布局（next/tsx 全在根 node_modules/.bin），
# 否则 build 阶段 COPY apps 源码会覆盖掉子包自己的 node_modules。
RUN echo 'node-linker=hoisted' > /app/.npmrc \
 && npm i -g pnpm@10 --registry=https://registry.npmmirror.com \
 && pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com

# ═══════════════════════════════════════════════════════════════════
# 阶段 2：构建 Next.js 生产产物
# ═══════════════════════════════════════════════════════════════════
FROM docker.m.daocloud.io/library/node:22-slim AS build

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

COPY --from=deps /app/node_modules /app/node_modules
COPY package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY vendor ./vendor
COPY scripts ./scripts

# 所有页面都是 force-dynamic，构建期不需要数据集（data/ 也不在上下文里）
RUN npm run web:build

# ═══════════════════════════════════════════════════════════════════
# 阶段 3：运行时
# ═══════════════════════════════════════════════════════════════════
FROM docker.m.daocloud.io/library/node:22-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    ZIWEI_DATA_DIR=/app/data \
    ZIWEI_STATE_DIR=/app/state

# zstd：解压数据集（上游用了长窗口压缩，必须 --long=27，见 docs/DATA.md）
# curl：下载数据集（scripts/download_data.sh）+ 容器健康检查
#
# DEBIAN_MIRROR：可选的 Debian 源镜像。国内服务器直连 deb.debian.org
# 常常在 apt-get update 阶段长时间挂起（实测卡死 5 分钟无进展），
# 换阿里云源只要 0.2s：
#   docker build -f deploy/Dockerfile \
#     --build-arg DEBIAN_MIRROR=mirrors.aliyun.com \
#     -t ziwei-assistant:latest .
ARG DEBIAN_MIRROR=""
RUN set -eux; \
    if [ -n "${DEBIAN_MIRROR}" ]; then \
      for f in /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list; do \
        [ -f "$f" ] || continue; \
        sed -i "s|deb.debian.org|${DEBIAN_MIRROR}|g; s|security.debian.org|${DEBIAN_MIRROR}|g" "$f"; \
      done; \
    fi; \
    apt-get update; \
    apt-get install -y --no-install-recommends zstd curl ca-certificates; \
    rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules /app/node_modules

# 源码：workspace 包是 TS 源码（main 指向 src/index.ts），
# transpilePackages 编译、tsx 运行都需要它们在场
COPY package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY vendor ./vendor
COPY scripts ./scripts

# Next.js 生产构建产物（放在源码之后，避免被覆盖）
COPY --from=build /app/apps/web/.next /app/apps/web/.next

# 只复制两个可执行脚本（不整目录复制，避免 .env / 文档混进镜像）
COPY deploy/entrypoint.sh deploy/make-test-dataset.sh ./deploy/
RUN chmod +x ./deploy/entrypoint.sh ./deploy/make-test-dataset.sh ./scripts/*.sh \
 && rm -rf apps/web/.next/cache

# 注意：这里**不**声明 VOLUME，也**不**创建 /app/data。
#   · 不声明 VOLUME → 镜像里确实没有 data/ 目录（可用 docker run --rm <image> ls /app 验证）
#   · 不创建 /app/data → 忘了挂载数据时 entrypoint 会明确报错退出，而不是静默空盘
# 数据一律由 compose 的 volume（或 docker run -v）挂载到 /app/data。

EXPOSE 3000

ENTRYPOINT ["/app/deploy/entrypoint.sh"]
