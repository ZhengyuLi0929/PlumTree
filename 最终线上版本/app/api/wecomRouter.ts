// 企业微信客服回调：GET 验证 URL（解密 echostr 原样返回），POST 接收事件。
// 客服消息事件（kf_msg_or_event）不直接带内容，收到后触发 sync_msg 拉取处理。
import { Hono } from "hono";
import { syncAndProcess } from "./lib/botBrain";
import { env, wecomConfigured } from "./lib/env";
import { wecomDecrypt, wecomSignature } from "./lib/wecomCrypto";

export const wecomRouter = new Hono();

function verifySig(c: { msg_signature?: string; timestamp?: string; nonce?: string }, encryptMsg: string) {
  const { msg_signature, timestamp, nonce } = c;
  if (!msg_signature || !timestamp || !nonce) return false;
  return wecomSignature(env.wecomToken, timestamp, nonce, encryptMsg) === msg_signature;
}

wecomRouter.get("/callback", (c) => {
  if (!wecomConfigured()) return c.json({ error: "wecom not configured" }, 503);
  const q = c.req.query();
  const echostr = q.echostr ?? "";
  try {
    if (!verifySig(q, echostr)) return c.text("signature mismatch", 403);
    const plain = wecomDecrypt(echostr, env.wecomAesKey, env.wecomCorpid);
    return c.text(plain);
  } catch (err) {
    console.error("[wecom] callback verify:", err);
    return c.text("decrypt failed", 400);
  }
});

wecomRouter.post("/callback", async (c) => {
  if (!wecomConfigured()) return c.json({ error: "wecom not configured" }, 503);
  const q = c.req.query();
  const body = (await c.req.json().catch(() => ({}))) as { encrypt?: string };
  if (!body.encrypt || !verifySig(q, body.encrypt)) return c.text("signature mismatch", 403);
  try {
    const plain = wecomDecrypt(body.encrypt, env.wecomAesKey, env.wecomCorpid);
    const event = JSON.parse(plain) as { event?: string };
    if (event.event === "kf_msg_or_event") {
      // 异步拉取并处理，不阻塞回调响应
      void syncAndProcess().catch((err) => console.error("[wecom] sync after event:", err));
    }
    return c.text("success");
  } catch (err) {
    console.error("[wecom] callback decrypt:", err);
    return c.text("decrypt failed", 400);
  }
});
