// 月老机器人主流程：绑定 → 传话（限额+安全）→ 闲聊（LLM，失败静默降级）。
// 每轮结束后异步抽取择偶需求写回 bot_users.requirements。
import {
  activeMatchForProfile,
  bindBotUser,
  botUserByProfileId,
  findProfileByNameWechat,
  getProfileById,
  logCron,
  logKfMessage,
  matchAwaitingFeedback,
  partnerProfileId,
  recentMessages,
  relayCountToday,
  saveRequirements,
  setMatchFeedback,
  setPoolState,
  updateMatchState,
  upsertBotUser,
} from "./botStore";
import { parseFeedback } from "./feedback";
import { payments } from "../../db/schema";
import { ensureTable, getDb } from "../queries/connection";
import { chat } from "./llm";
import { MATCHMAKER_SYSTEM } from "./matchmaker";
import { extractRequirements } from "./requirements";
import { screenText } from "./safety";
import { TPL } from "./templates";
import { confirmOpen, phaseOf, relayOpen } from "./weekly";
import { sendWecomText, syncWecomMessages } from "./wecom";

async function reply(externalUserid: string, content: string) {
  await logKfMessage({ externalUserid, origin: "bot", content });
  await sendWecomText(externalUserid, content);
}

/** 绑定：消息形如「张三 wxid_123」（空格/逗号分隔），与报名表的姓名+微信号对上才绑 */
async function tryBind(externalUserid: string, content: string): Promise<boolean> {
  const parts = content.split(/[\s,，]+/).filter(Boolean);
  if (parts.length === 2) {
    const [name, wechat] = parts;
    const profile = await findProfileByNameWechat(name, wechat);
    if (profile) {
      await bindBotUser(externalUserid, profile.id, profile.name);
      await reply(externalUserid, TPL.bindOk(profile.name));
      return true;
    }
  }
  await reply(externalUserid, parts.length === 2 ? TPL.bindFail : TPL.bindGuide);
  return false;
}

/** 传话：周三周四、有进行中配对、每天一条 */
async function tryRelay(user: { externalUserid: string; profileId: number | null }, content: string): Promise<boolean> {
  if (!user.profileId) return false;
  const match = await activeMatchForProfile(user.profileId);
  if (!match) return false;
  if (!relayOpen()) {
    await reply(user.externalUserid, TPL.relayClosed);
    return true;
  }
  if ((await relayCountToday(user.externalUserid)) >= 1) {
    await reply(user.externalUserid, TPL.quotaUsed);
    return true;
  }
  const screened = await screenText(content);
  if (!screened.ok) {
    await reply(user.externalUserid, TPL.relayBlocked);
    return true;
  }
  const partnerPid = await partnerProfileId(match, user.profileId);
  const partnerBot = await botUserByProfileId(partnerPid);
  if (!partnerBot) {
    await reply(user.externalUserid, TPL.relayPartnerMissing);
    return true;
  }
  const me = await getProfileById(user.profileId);
  // 限额只记发送方；接收方记为 bot 投递，不消耗对方额度
  await logKfMessage({ externalUserid: user.externalUserid, origin: "relay", content });
  const delivered = `（月老转达 ${me?.name ?? "对方"}）：${content}`;
  await logKfMessage({ externalUserid: partnerBot.externalUserid, origin: "bot", content: delivered });
  await sendWecomText(partnerBot.externalUserid, delivered);
  if (match.state === "sent") await updateMatchState(match.id, "chatting");
  await reply(user.externalUserid, TPL.relaySent);
  return true;
}

/** 周五零点前确认是否见面：回复「见面」/「不了」（短消息才算，长消息按传话处理） */
async function tryConfirm(user: { externalUserid: string; profileId: number | null }, content: string): Promise<boolean> {
  if (!user.profileId) return false;
  const t = content.trim();
  if (t.length > 6) return false;
  const yes = /^(见面|要见|见|见一面|好|好啊|可以)$/i.test(t);
  const no = /^(不了|不见|算了|放弃|不见面)$/i.test(t);
  if (!yes && !no) return false;
  const match = await activeMatchForProfile(user.profileId);
  if (!match) return false;
  if (!confirmOpen()) {
    await reply(user.externalUserid, TPL.relayClosed);
    return true;
  }
  await updateMatchState(match.id, yes ? "confirmed" : "declined");
  await reply(user.externalUserid, yes ? TPL.dateConfirmed : TPL.declined);
  return true;
}

/** 回访：dating 状态的配对在周一二收集 成行/评分/是否继续 */
async function tryFeedback(user: { externalUserid: string; profileId: number | null }, content: string): Promise<boolean> {
  if (!user.profileId || phaseOf() !== "feedback") return false;
  const match = await matchAwaitingFeedback(user.profileId);
  if (!match) return false;
  const fb = parseFeedback(content);
  if (!fb) return false;
  await setMatchFeedback(match.id, fb);
  if (fb.score !== undefined && fb.score <= 2) {
    await setPoolState(user.profileId, "review"); // 差评自动出池待人工复核
  }
  if (fb.met === 0) {
    // 约会未成行：登记退款流程记录（真实退款等支付接入后执行）
    await ensureTable();
    await getDb().insert(payments).values({ matchId: match.id, amountCents: 0, status: "refund_pending", reason: "no-show" });
    await logCron("payment.refund_pending", { matchId: match.id });
  }
  await reply(user.externalUserid, "收到，谢谢你认真反馈。下周三见。");
  return true;
}

async function chatWithMatchmaker(user: { externalUserid: string; requirements: string | null }, content: string) {
  const history = await recentMessages(user.externalUserid, 12);
  const messages = [
    { role: "system" as const, content: MATCHMAKER_SYSTEM + (user.requirements ? `\n已知TA的择偶需求：${user.requirements}` : "") },
    ...history.map((m) => ({
      role: (m.origin === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.content ?? "",
    })),
    { role: "user" as const, content },
  ];
  try {
    const out = await chat(messages);
    await reply(user.externalUserid, out);
  } catch (err) {
    // 闲聊静默降级：业务流程消息走模板兜底，闲聊在 LLM 故障时不回复
    console.error("[bot] llm failed, silent degrade:", err);
  }
}

/** 单条用户消息入口（回调与 sync 共用） */
export async function processIncomingText(externalUserid: string, content: string, msgid?: string) {
  const user = await upsertBotUser(externalUserid);
  await logKfMessage({ externalUserid, msgid, origin: "user", content });

  if (!user.profileId) {
    await tryBind(externalUserid, content);
  } else {
    const handled =
      (await tryConfirm(user, content)) ||
      (await tryFeedback(user, content)) ||
      (await tryRelay(user, content));
    if (!handled) await chatWithMatchmaker(user, content);
  }

  // 异步抽取择偶需求，不阻塞回复
  void (async () => {
    const history = await recentMessages(externalUserid, 12);
    const reqs = await extractRequirements(history.map((m) => ({ role: m.origin === "user" ? "user" : "assistant", content: m.content ?? "" })));
    if (reqs && Object.keys(reqs).length > 0) await saveRequirements(externalUserid, reqs);
  })().catch((err) => console.error("[bot] extract requirements:", err));
}

/** 拉取并处理一批新消息（sync_msg 轮询入口） */
export async function syncAndProcess(): Promise<number> {
  const msgs = await syncWecomMessages();
  for (const m of msgs) {
    try {
      await processIncomingText(m.external_userid!, m.text!.content!, m.msgid);
    } catch (err) {
      console.error(`[bot] process ${m.msgid}:`, err);
    }
  }
  return msgs.length;
}
