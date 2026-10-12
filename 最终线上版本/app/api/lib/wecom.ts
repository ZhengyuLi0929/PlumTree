// 企业微信客服 API：gettoken / sync_msg / send_msg。
// 未配置 WECOM_* 时所有网络动作降级为日志输出（本地开发/测试不触网）。
import { env, wecomConfigured } from "./env";

const BASE = "https://qyapi.weixin.qq.com";

let tokenCache: { token: string; expiresAt: number } | null = null;
let cursor: string | null = null;

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const url = `${BASE}/cgi-bin/gettoken?corpid=${encodeURIComponent(env.wecomCorpid)}&corpsecret=${encodeURIComponent(env.wecomKfSecret)}`;
  const res = await fetch(url);
  const data = (await res.json()) as { errcode?: number; access_token?: string; expires_in?: number; errmsg?: string };
  if (!data.access_token) throw new Error(`gettoken 失败: ${data.errmsg ?? data.errcode}`);
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000 };
  return tokenCache.token;
}

export type KfMsg = {
  msgid?: string;
  external_userid?: string;
  origin?: number; // 3=客户发的 4=系统 5=客服发的
  msgtype?: string;
  text?: { content?: string };
};

function sandboxMode() {
  return process.env.BOT_SANDBOX === "1";
}

/** 拉取一批新消息（返回纯文本用户消息） */
export async function syncWecomMessages(): Promise<KfMsg[]> {
  if (sandboxMode() || !wecomConfigured()) return [];
  const token = await accessToken();
  const res = await fetch(`${BASE}/cgi-bin/kf/sync_msg?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cursor: cursor ?? undefined, limit: 200, open_kfid: env.wecomKfOpenid }),
  });
  const data = (await res.json()) as {
    errcode?: number;
    errmsg?: string;
    next_cursor?: string;
    msg_list?: KfMsg[];
  };
  if (data.errcode !== 0) throw new Error(`sync_msg 失败: ${data.errmsg ?? data.errcode}`);
  cursor = data.next_cursor ?? cursor;
  return (data.msg_list ?? []).filter((m) => m.origin === 3 && m.msgtype === "text" && m.external_userid && m.text?.content);
}

/** 发送文本消息。沙箱或未配置时不触网。 */
export async function sendWecomText(externalUserid: string, content: string): Promise<boolean> {
  if (sandboxMode()) return false;
  if (!wecomConfigured()) {
    console.log(`[wecom mock] -> ${externalUserid}: ${content.slice(0, 120)}`);
    return false;
  }
  const token = await accessToken();
  const res = await fetch(`${BASE}/cgi-bin/kf/send_msg?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      touser: externalUserid,
      open_kfid: env.wecomKfOpenid,
      msgtype: "text",
      text: { content },
    }),
  });
  const data = (await res.json()) as { errcode?: number; errmsg?: string };
  if (data.errcode !== 0) throw new Error(`send_msg 失败: ${data.errmsg ?? data.errcode}`);
  return true;
}
