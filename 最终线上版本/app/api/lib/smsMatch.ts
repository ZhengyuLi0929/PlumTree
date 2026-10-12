// 周三到周五的匹配短信。不经过微信客服。
//
// 上行（用户回复同一个号码）由运营商回调打到：
//   POST /api/sms/inbound
//   JSON: { "from": "13800138000", "text": "今晚有空吗" }
//   非生产环境可加 "dayKey": "2026-09-23"，用来模拟周三/周四/周五。
//
// 下行走 sms.ts 的 sendNotifySms。短信未配置时只打日志，配对状态仍会保存。
import { and, desc, eq, or } from "drizzle-orm";
import { matches, profiles } from "../../db/schema";
import { isoWeekKey, normalizePhone } from "./enroll";
import { ensureTable, getDb } from "../queries/connection";
import { sendNotifySms } from "./sms";
import { env } from "./env";

export const SMS_TEXT = {
  noteOk: "恭喜您！小纸条发送成功！同桌的TA会怎么回复呢，好期待呀。",
  noteUsed: "您每天一次的小纸条机会已经用完啦",
  matchYes: "您的匹配已确认！现在就等同桌的TA回复咯～",
  matchNo: "您已选择不匹配，本周约会不会进行。",
  partnerDeclined: "对方选择了不匹配，本周约会不会进行。",
  noteClosed: "小纸条只在周三、周四、周五可以发送。",
  noMatch: "没有找到这个手机号的本周配对。",
} as const;

export function wednesdayAirdropSms(card: string) {
  return `本周的同桌是：${card}。周三、周四、周五各有一条向对方发送信息的机会。直接回复此号码即可向心动对象发送信息。每天一次机会，请好好利用。`;
}

export function fridayConfirmSms() {
  return "今天请确认是否周末见面。请回复【匹配】或【不匹配】。其他内容会当作今天的小纸条，每天只有一次。";
}

export function bothAcceptedSms(wechat: string) {
  return `恭喜您！同桌的TA同意了你的周末约会邀约。TA的微信号是：${wechat}，快快周末见见吧～`;
}

export function forwardSms(text: string) {
  return `【同桌的TA发来消息】${text}`;
}

export type SmsKind = "yes" | "no" | "note";

/** 匹配确认看正文，不看星期。 */
export function classifySms(text: string): SmsKind {
  const compact = text.trim().replace(/\s+/g, "");
  if (compact === "【匹配】" || compact === "匹配") return "yes";
  if (compact === "【不匹配】" || compact === "不匹配") return "no";
  return "note";
}

export function noteDayOpen(now = new Date()) {
  const cst = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const dow = cst.getUTCDay();
  return dow === 3 || dow === 4 || dow === 5;
}

export function cstDayKey(now = new Date()) {
  const cst = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return cst.toISOString().slice(0, 10);
}

type Reply = "yes" | "no" | null;

export type SmsPair = {
  manReply: Reply;
  womanReply: Reply;
  manNoteDays: string[];
  womanNoteDays: string[];
  manPhone: string;
  womanPhone: string;
  manWechat: string;
  womanWechat: string;
};

export type OutboundSms = { to: string; text: string };

function norm(phone: string) {
  return normalizePhone(phone).replace(/^\+?86/, "");
}

function sideOf(pair: SmsPair, from: string): "man" | "woman" | null {
  const phone = norm(from);
  if (phone && phone === norm(pair.manPhone)) return "man";
  if (phone && phone === norm(pair.womanPhone)) return "woman";
  return null;
}

function clone(pair: SmsPair): SmsPair {
  return {
    ...pair,
    manNoteDays: [...pair.manNoteDays],
    womanNoteDays: [...pair.womanNoteDays],
  };
}

/**
 * 纯函数。noteOpen 为真表示今天可以发小纸条（周三、周四、周五）。
 * 匹配 / 不匹配不消耗当天额度。双方都匹配时才把微信号写进短信。
 */
export function applyInboundSms(pair: SmsPair, from: string, text: string, dayKey: string, noteOpen: boolean): {
  pair: SmsPair;
  outbound: OutboundSms[];
} {
  const next = clone(pair);
  const side = sideOf(next, from);
  if (!side) return { pair: next, outbound: [{ to: from, text: SMS_TEXT.noMatch }] };
  const mine = side === "man";
  const myPhone = mine ? next.manPhone : next.womanPhone;
  const theirPhone = mine ? next.womanPhone : next.manPhone;
  const theirWechat = mine ? next.womanWechat : next.manWechat;
  const myWechat = mine ? next.manWechat : next.womanWechat;
  const kind = classifySms(text);

  if (kind !== "note") {
    const already = mine ? next.manReply : next.womanReply;
    const other = mine ? next.womanReply : next.manReply;
    if (kind === "no") {
      if (mine) next.manReply = "no";
      else next.womanReply = "no";
      const outbound: OutboundSms[] = [{ to: myPhone, text: SMS_TEXT.matchNo }];
      if (other !== "no") outbound.push({ to: theirPhone, text: SMS_TEXT.partnerDeclined });
      return { pair: next, outbound };
    }
    if (kind === "yes" && already === "no") {
      return { pair: next, outbound: [{ to: myPhone, text: SMS_TEXT.matchNo }] };
    }
    if (other === "no") {
      return { pair: next, outbound: [{ to: myPhone, text: SMS_TEXT.partnerDeclined }] };
    }
    if (mine) next.manReply = "yes";
    else next.womanReply = "yes";
    const outbound: OutboundSms[] = [{ to: myPhone, text: SMS_TEXT.matchYes }];
    const bothNow = next.manReply === "yes" && next.womanReply === "yes";
    const bothBefore = already === "yes" && other === "yes";
    if (bothNow && !bothBefore) {
      outbound.push({ to: myPhone, text: bothAcceptedSms(theirWechat) });
      outbound.push({ to: theirPhone, text: bothAcceptedSms(myWechat) });
    }
    return { pair: next, outbound };
  }

  if (!noteOpen) return { pair: next, outbound: [{ to: myPhone, text: SMS_TEXT.noteClosed }] };
  const days = mine ? next.manNoteDays : next.womanNoteDays;
  if (days.includes(dayKey)) return { pair: next, outbound: [{ to: myPhone, text: SMS_TEXT.noteUsed }] };
  days.push(dayKey);
  return {
    pair: next,
    outbound: [
      { to: myPhone, text: SMS_TEXT.noteOk },
      { to: theirPhone, text: forwardSms(text.trim()) },
    ],
  };
}

export function matchStateOf(pair: SmsPair): "confirmed" | "declined" | "chatting" {
  if (pair.manReply === "no" || pair.womanReply === "no") return "declined";
  if (pair.manReply === "yes" && pair.womanReply === "yes") return "confirmed";
  return "chatting";
}

function parseDays(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (Array.isArray(value)) return value.map(String);
  } catch {
    /* comma fallback */
  }
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function replyOf(value: string | null | undefined): Reply {
  return value === "yes" || value === "no" ? value : null;
}

async function deliver(outbound: OutboundSms[]) {
  for (const item of outbound) {
    if (!item.to) continue;
    await sendNotifySms(item.to, item.text);
  }
}

/** 运营商上行短信进入这里。 */
export async function receiveInboundSms(input: { from: string; text: string; dayKey?: string; now?: Date }) {
  await ensureTable();
  const now = input.now ?? new Date();
  const overrideDay = Boolean(input.dayKey && !env.isProduction);
  const dayKey = overrideDay ? input.dayKey! : cstDayKey(now);
  const phone = norm(input.from);
  const db = getDb();
  const weekKey = isoWeekKey(now);
  const people = await db.select().from(profiles);
  const me = people.find((row) => norm(row.phone) === phone);
  if (!me) return { ok: false, error: SMS_TEXT.noMatch };
  const rows = await db
    .select()
    .from(matches)
    .where(and(eq(matches.weekKey, weekKey), or(eq(matches.manProfileId, me.id), eq(matches.womanProfileId, me.id))))
    .orderBy(desc(matches.id));
  const match = rows.find((row) => ["sent", "chatting", "confirmed", "declined"].includes(row.state));
  if (!match) return { ok: false, error: SMS_TEXT.noMatch };
  const [man] = people.filter((row) => row.id === match.manProfileId);
  const [woman] = people.filter((row) => row.id === match.womanProfileId);
  if (!man || !woman) return { ok: false, error: SMS_TEXT.noMatch };
  const current: SmsPair = {
    manReply: replyOf(match.manReply),
    womanReply: replyOf(match.womanReply),
    manNoteDays: parseDays(match.manNoteDays),
    womanNoteDays: parseDays(match.womanNoteDays),
    manPhone: man.phone,
    womanPhone: woman.phone,
    manWechat: man.wechat,
    womanWechat: woman.wechat,
  };
  const result = applyInboundSms(current, input.from, input.text, dayKey, overrideDay || noteDayOpen(now));
  const decided = matchStateOf(result.pair);
  const state = decided === "chatting" ? (match.state === "pending_send" ? match.state : match.state === "sent" ? "chatting" : match.state) : decided;
  await db.update(matches).set({
    manReply: result.pair.manReply,
    womanReply: result.pair.womanReply,
    manNoteDays: JSON.stringify(result.pair.manNoteDays),
    womanNoteDays: JSON.stringify(result.pair.womanNoteDays),
    state,
  }).where(eq(matches.id, match.id));
  await deliver(result.outbound);
  return { ok: true, outbound: result.outbound.map((item) => ({ to: norm(item.to), text: item.text })) };
}

export async function sendFridayConfirmSms(weekKey: string) {
  await ensureTable();
  const db = getDb();
  const rows = await db.select().from(matches).where(eq(matches.weekKey, weekKey));
  const people = await db.select().from(profiles);
  let sent = 0;
  for (const match of rows) {
    if (!["sent", "chatting"].includes(match.state) || match.fridaySmsSent) continue;
    const text = fridayConfirmSms();
    for (const id of [match.manProfileId, match.womanProfileId]) {
      const person = people.find((row) => row.id === id);
      if (person?.phone) await sendNotifySms(person.phone, text);
    }
    await db.update(matches).set({ fridaySmsSent: 1 }).where(eq(matches.id, match.id));
    sent++;
  }
  return sent;
}
