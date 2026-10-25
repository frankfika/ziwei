/**
 * 服务端唯一入口 —— 排盘与解读都必须经过 @ziwei/core。
 *
 * ⚠️ 本文件**只能**在 Server Component / Server Action / Route Handler 中引用：
 * 解读数据集是文件系统驱动的（ReadingIndex 直接读 data/raw/*.jsonl），
 * 绝不能进入客户端 bundle。
 *
 * 用模块级单例复用 ReadingIndex 的年份索引缓存，避免每次请求都重新解析索引文件。
 */
import { ZiweiService } from '@ziwei/core';

let instance: ZiweiService | null = null;

export function getService(): ZiweiService {
  if (!instance) instance = new ZiweiService();
  return instance;
}
