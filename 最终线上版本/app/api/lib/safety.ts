// 内容安全钩子：关键词兜底 + LLM 审查层 + 第三方内容安全 API 接口位（CONTENT_SAFETY_URL）。
// 传话消息必经此层；命中骚扰/辱骂/色情内容则拦截，机器人替换为礼貌拒绝。
import { chat, llmConfigured } from "./llm";
import { env } from "./env";

const BLOCKED = [/约炮/, /约p/i, /裸聊/, /性骚扰/, /傻逼/, /操你妈/];

export type ScreenResult = { ok: boolean; reason?: string };

const SAFETY_PROMPT = `你是内容安全审查员。判断这条准备转发给约会对象的消息是否包含骚扰、辱骂、色情、约炮或其他不当内容。
只输出 JSON：{"ok":true} 或 {"ok":false,"reason":"一句话原因"}。拿不准时放行。`;

export async function screenText(text: string): Promise<ScreenResult> {
  // 1. 关键词兜底（永远生效）
  for (const re of BLOCKED) {
    if (re.test(text)) return { ok: false, reason: `命中敏感词：${re.source}` };
  }
  // 2. 第三方内容安全 API（接口位预留，响应需为 {"ok":bool,"reason"?}）
  if (env.contentSafetyUrl) {
    try {
      const res = await fetch(env.contentSafetyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as { ok?: boolean; reason?: string };
      if (data.ok === false) return { ok: false, reason: data.reason ?? "第三方安全拦截" };
      return { ok: true };
    } catch (err) {
      console.error("[safety] third-party failed, fallback:", err);
    }
  }
  // 3. LLM 审查层（配置了 LLM 才启用；故障时放行已由关键词兜底的部分）
  if (llmConfigured()) {
    try {
      const out = await chat(
        [
          { role: "system", content: SAFETY_PROMPT },
          { role: "user", content: text.slice(0, 500) },
        ],
        { json: true, timeoutMs: 8_000 },
      );
      const data = JSON.parse(out) as { ok?: boolean; reason?: string };
      if (data.ok === false) return { ok: false, reason: data.reason ?? "LLM 安全拦截" };
    } catch (err) {
      console.error("[safety] llm review failed, keyword-only:", err);
    }
  }
  return { ok: true };
}
