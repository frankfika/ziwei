import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * 从当前工作目录向上寻找仓库根的 `data/`（含 `index/` 即视为数据集目录）。
 * Next.js 的 dev / build 都以 apps/web 为 cwd，两级向上即可命中仓库根。
 */
function findDataDir(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'data');
    if (fs.existsSync(path.join(candidate, 'index'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const dataDir = findDataDir();
// 显式指定的环境变量优先于探测结果 ——
// 容器部署的契约是「把数据挂载到 ZIWEI_DATA_DIR」，不能让探测逻辑覆盖它。
if (dataDir && !process.env.ZIWEI_DATA_DIR) {
  // 解读数据集是文件系统驱动的，必须在服务端把路径钉死。
  process.env.ZIWEI_DATA_DIR = dataDir;
}

const nextConfig: NextConfig = {
  // 三个 workspace 包都是 TS 源码，必须交给 Next 一起转译
  transpilePackages: ['@ziwei/core', '@ziwei/chart-engine', '@ziwei/reading-index'],
  // monorepo：把产物追踪根指向仓库根，避免 .next 找不到 workspace 依赖
  outputFileTracingRoot: path.resolve(process.cwd(), '..', '..'),
  // Playwright / curl 常用 127.0.0.1，避免 Next 16 默认拦跨域 HMR/开发资源
  // 同时放行 Tailscale MagicDNS 域名, 供外网通过 Tailscale Serve 访问
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    '111macbook-pro.tailef4435.ts.net',
    '.ts.net',
    '.tailscale.com',
  ],
};

export default nextConfig;
