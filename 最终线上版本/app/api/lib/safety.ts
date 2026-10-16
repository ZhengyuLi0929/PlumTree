// 内容安全钩子：关键词兜底 + LLM 审查层 + 第三方内容安全 API 接口位（CONTENT_SAFETY_URL）。
// 传话消息必经此层；命中骚扰/辱骂/色情内容则拦截，机器人替换为礼貌拒绝。
// 约会小纸条 additionally 拦截「索要/留下联系方式」——联系方式由平台流程控制交换。
import { chat, llmConfigured } from "./llm";
import { env } from "./env";

const BLOCKED = [/约炮/, /约p/i, /裸聊/, /性骚扰/, /傻逼/, /操你妈/];

// 联系方式正则兜底（LLM 不可用时也能挡住最明显的交换行为）
const CONTACT_PATTERNS = [
  /1[3-9]\d{9}/, // 手机号
  /微信|加微|vx|wx|wechat/i, // 微信相关（含 v/x 变体）
  /qq[:：号]?\s*\d{5,}/i, // QQ 号
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // 邮箱
];

export type ScreenResult = { ok: boolean; reason?: string };

const SAFETY_PROMPT = `你是约会平台的内容审查员。平台规则：用户在见面前不能交换联系方式（微信、手机号、QQ、邮箱等），也不能发送骚扰、辱骂、色情、约炮等内容。
判断下面这条准备发给约会对象的小纸条：
1. 包含本人联系方式（微信号/手机号/QQ/邮箱/二维码提示等），或表达「加微信/留个联系方式/电话我」等想要添加对方联系方式的意图 → 拦截
2. 包含骚扰、辱骂、色情、约炮或其他不当内容 → 拦截
3. 其余正常聊天内容 → 放行
只输出 JSON：{"ok":true} 或 {"ok":false,"reason":"一句话原因"}。拿不准时放行。`;

export async function screenText(text: string): Promise<ScreenResult> {
  // 1. 关键词兜底（永远生效）
  for (const re of BLOCKED) {
    if (re.test(text)) return { ok: false, reason: `命中敏感词：${re.source}` };
  }
  // 2. 联系方式正则（永远生效，LLM 挂了也拦得住）
  for (const re of CONTACT_PATTERNS) {
    if (re.test(text)) return { ok: false, reason: "包含联系方式" };
  }
  // 3. 第三方内容安全 API（接口位预留，响应需为 {"ok":bool,"reason"?}）
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
  // 4. LLM 审查层（一次调用同时查内容安全 + 联系方式意图；超时/失败时前两层已兜底）
  if (llmConfigured()) {
    try {
      const out = await chat(
        [
          { role: "system", content: SAFETY_PROMPT },
          { role: "user", content: text.slice(0, 500) },
        ],
        { json: true, timeoutMs: 5_000 },
      );
      const data = JSON.parse(out) as { ok?: boolean; reason?: string };
      if (data.ok === false) return { ok: false, reason: data.reason ?? "LLM 安全拦截" };
    } catch (err) {
      console.error("[safety] llm review failed, keyword-only:", err);
    }
  }
  return { ok: true };
}
