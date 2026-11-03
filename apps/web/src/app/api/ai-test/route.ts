/**
 * AI 配置连通性测试 —— 用户在「AI 设置」里填完 Key，点「测试连接」打这里。
 *
 * 用用户带来的配置发一个**最小**补全（max_tokens=8，就说一个字），几乎不花钱，
 * 能验证：端点对不对、key 有没有效、模型名存不存在。配置不落盘、不进日志。
 */

import { createAnthropicProvider, createEchoProvider, createOpenAICompatibleProvider } from '@ziwei/ask';

export const dynamic = 'force-dynamic';

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const kind = str(formData, 'kind').trim();
  const apiKey = str(formData, 'key').trim();
  const model = str(formData, 'model').trim();
  const baseUrl = str(formData, 'baseUrl').trim();

  if (kind !== 'openai' && kind !== 'anthropic' && kind !== 'echo') {
    return Response.json({ ok: false, error: `不认识的协议类型：${kind || '（空）'}` });
  }
  if (kind === 'openai' && !baseUrl) {
    return Response.json({ ok: false, error: 'OpenAI 兼容端点需要填 API 根地址' });
  }
  if (kind !== 'echo' && !apiKey) {
    return Response.json({ ok: false, error: 'API Key 还没填' });
  }
  if (!model) {
    return Response.json({ ok: false, error: '模型名还没填' });
  }

  try {
    const provider =
      kind === 'echo'
        ? createEchoProvider()
        : kind === 'anthropic'
          ? createAnthropicProvider({
              apiKey,
              model,
              defaultMaxTokens: 8,
            })
          : createOpenAICompatibleProvider({
              baseUrl,
              apiKey,
              model,
              defaultMaxTokens: 8,
            });

    const r = await provider.complete({
      system: '你是连通性测试。只回复两个字：正常',
      user: 'ping',
      // ponytail: 固定 8 token 上限 —— 测试的目的只是「通没通」，不关心内容
      maxTokens: 8,
    });

    return Response.json({
      ok: true,
      model: r.model ?? model,
      answer: r.text.slice(0, 40),
    });
  } catch (err) {
    return Response.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
