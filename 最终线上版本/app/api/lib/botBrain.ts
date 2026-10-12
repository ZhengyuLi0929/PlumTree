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
  nameMasks,
  partnerProfileId,
  recentMessages,
  relayCountToday,
  saveRequirements,
  setMatchDecision,
  setMatchFeedback,
  setPoolState,
  updateMatchState,
  upsertBotUser,
  weekMatchForProfile,
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
import { redactNames } from "./maskName";
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
      await bindBotUser(externalUserid, profile.id, "");
      await reply(externalUserid, TPL.bindOk());
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
  const masks = await nameMasks();
  const hidden = redactNames(content, masks, user.profileId);
  // 限额只记发送方；接收方记为 bot 投递，不消耗对方额度
  await logKfMessage({ externalUserid: user.externalUserid, origin: "relay", content: hidden });
  const delivered = `（同桌的TA发来消息）${hidden}`;
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
  const match = await weekMatchForProfile(user.profileId);
  if (!match || !["sent", "chatting", "confirmed", "declined"].includes(match.state)) return false;
  const sandboxFriday = process.env.BOT_SANDBOX === "1" && phaseOf() === "dating";
  if (!confirmOpen() && !sandboxFriday) {
    await reply(user.externalUserid, TPL.relayClosed);
    return true;
  }
  const isMan = match.manProfileId === user.profileId;
  const mine = yes ? "yes" : "no";
  const theirs = isMan ? match.womanReply : match.manReply;
  const manReply = isMan ? mine : match.manReply;
  const womanReply = isMan ? match.womanReply : mine;
  const state = manReply === "yes" && womanReply === "yes" ? "confirmed" : mine === "no" || theirs === "no" ? "declined" : match.state === "sent" ? "chatting" : match.state;
  await setMatchDecision(match.id, { manReply, womanReply, state });

  const partnerPid = await partnerProfileId(match, user.profileId);
  const partnerBot = await botUserByProfileId(partnerPid);
  const tellPartner = async (text: string) => {
    if (partnerBot) await reply(partnerBot.externalUserid, text);
  };

  if (mine === "yes" && !theirs) {
    await reply(user.externalUserid, TPL.confirmWaiting);
    await tellPartner(TPL.confirmPartnerAsked);
  } else if (mine === "no" && !theirs) {
    await reply(user.externalUserid, TPL.declined);
    await tellPartner(TPL.confirmPartnerNo);
  } else if (mine === "yes" && theirs === "yes") {
    await reply(user.externalUserid, TPL.dateConfirmed);
    await tellPartner(TPL.dateConfirmed);
  } else if (mine === "no" && theirs === "yes") {
    await reply(user.externalUserid, TPL.declined);
    await tellPartner(TPL.confirmPartnerNo);
  } else if (mine === "yes" && theirs === "no") {
    await reply(user.externalUserid, TPL.confirmYouYesButPartnerNo);
    await tellPartner(TPL.confirmLateYes);
  } else {
    await reply(user.externalUserid, TPL.declined);
  }
  return true;
}

function decisionFact(match: { manProfileId: number; manReply: string | null; womanReply: string | null }, profileId: number) {
  const mine = match.manProfileId === profileId ? match.manReply : match.womanReply;
  const theirs = match.manProfileId === profileId ? match.womanReply : match.manReply;
  const word = (value: string | null) => (value === "yes" ? "见面" : value === "no" ? "不见" : "还没回复");
  let outcome = "还在等双方回复";
  if (mine === "yes" && theirs === "yes") outcome = "双方都同意见面";
  else if (mine === "no" || theirs === "no") outcome = "有一方拒绝，这次见面不成立";
  else if (mine === "yes") outcome = "你已同意，还在等对方";
  else if (theirs === "yes") outcome = "对方已同意，还在等你";
  return `\n本周见面确认（这是事实，不要忽略，也不要改成双方都同意）：你的回复是${word(mine)}，对方的回复是${word(theirs)}。结论：${outcome}。`;
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

function chatFeedbackLine(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { feedback?: unknown };
    if (!Array.isArray(parsed.feedback)) return "";
    return parsed.feedback.map(String).slice(-3).join("；");
  } catch {
    return "";
  }
}

async function chatWithMatchmaker(user: { externalUserid: string; profileId: number | null; requirements: string | null }, content: string) {
  const history = await recentMessages(user.externalUserid, 12);
  const profile = user.profileId ? await getProfileById(user.profileId) : undefined;
  const match = user.profileId ? await weekMatchForProfile(user.profileId) : undefined;
  const feedback = profile?.chatFacts ? chatFeedbackLine(profile.chatFacts) : "";
  const fact = match && (match.manReply || match.womanReply) ? decisionFact(match, user.profileId!) : "";
  const masks = await nameMasks();
  const hide = (text: string) => redactNames(text, masks, user.profileId ?? undefined);
  const messages = [
    {
      role: "system" as const,
      content: hide(
        MATCHMAKER_SYSTEM +
          (user.requirements ? `\n已知TA的择偶需求：${user.requirements}` : "") +
          (feedback ? `\n已存档的关键反馈：${feedback}` : "") +
          fact,
      ),
    },
    ...history.map((m) => ({
      role: (m.origin === "user" ? "user" : "assistant") as "user" | "assistant",
      content: hide(m.content ?? ""),
    })),
    { role: "user" as const, content: hide(content) },
  ];
  try {
    const out = hide(await chat(messages));
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
    const masks = await nameMasks();
    const reqs = await extractRequirements(
      history.map((m) => ({
        role: m.origin === "user" ? "user" : "assistant",
        content: redactNames(m.content ?? "", masks, user.profileId ?? undefined),
      })),
    );
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
