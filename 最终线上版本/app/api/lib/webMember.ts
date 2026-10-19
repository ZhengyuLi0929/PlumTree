// 网页版会员互动：传话小纸条（周三至周五每天一条）、月老网页对话、周一周二回访。
// 与短信/企微通道并存，互不影响。消息存 web_messages（kind: note/user/bot）。
import { and, desc, eq, or } from "drizzle-orm";
import { matches, profiles, webMessages } from "../../db/schema";
import { ensureTable, getDb } from "../queries/connection";
import { isoWeekKey } from "./enroll";
import { cstDayKey, noteDayOpen } from "./smsMatch";
import { screenText } from "./safety";
import { chat } from "./llm";
import { MATCHMAKER_SYSTEM } from "./matchmaker";
import { setMatchFeedback, setPoolState, chatFactsForMatching } from "./botStore";
import { phaseOf } from "./weekly";

export const NOTE_TEXT = {
  quotaUsed: "今天的小纸条额度用完啦，明天再来",
  closed: "小纸条只在周三、周四、周五可以发送。",
  blocked: "这句话我不好递出去，换一句礼貌点的吧。",
  contactBlocked: "联系方式先别急着换哦～见了面有的是机会加！",
  noMatch: "本周还没有匹配对象。",
} as const;

type ProfileRow = typeof profiles.$inferSelect;

export function maskedCard(p: ProfileRow) {
  return {
    birthYear: p.birthYear,
    city: p.city,
    job: p.job,
    height: p.height,
    mbti: p.mbti,
    intro: p.intro,
    expectation: p.expectation,
    value: p.value,
  };
}

/** 我本周的进行中的配对（已发送及以后的状态）。
 *  生产流程里配对先 pending_send，管理员在后台「确认发送」后才可见——模拟器里跳过这步。
 *  模拟器中周二（还没空投）直接当作没配对。 */
export async function myActiveMatch(profile: { id: number; simDate: string | null }) {
  if (simDow(profile) === 2) return undefined; // 模拟周二：配对还没空投
  await ensureTable();
  const db = getDb();
  const rows = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.weekKey, isoWeekKey()),
        or(eq(matches.manProfileId, profile.id), eq(matches.womanProfileId, profile.id)),
      ),
    )
    .orderBy(desc(matches.id));
  const match = rows.find((r) => ["sent", "chatting", "confirmed", "dating", "declined"].includes(r.state));
  // 周五没见结果就进入周末：还没表态的人自动视为不见面
  if (match && ["sent", "chatting"].includes(match.state)) {
    const dow = simDow(profile) ?? new Date(Date.now() + 8 * 3600 * 1000).getUTCDay();
    if ([6, 0].includes(dow) && (!match.manReply || !match.womanReply)) {
      await db.update(matches).set({ state: "declined" }).where(eq(matches.id, match.id));
      match.state = "declined";
    }
  }
  return match;
}

export async function noteQuotaLeft(profile: { id: number; simDate: string | null }): Promise<number> {
  await ensureTable();
  const db = getDb();
  const rows = await db
    .select()
    .from(webMessages)
    .where(and(eq(webMessages.fromProfileId, profile.id), eq(webMessages.kind, "note"), eq(webMessages.dayKey, cstDayKey(effectiveNow(profile)))));
  return Math.max(0, 1 - rows.length);
}

export async function sendNote(profile: { id: number; simDate: string | null }, text: string) {
  if (!noteDayOpen(effectiveNow(profile))) return { ok: false as const, error: NOTE_TEXT.closed };
  if ((await noteQuotaLeft(profile)) <= 0) return { ok: false as const, error: NOTE_TEXT.quotaUsed };
  const screened = await screenText(text);
  if (!screened.ok) return { ok: false as const, error: screened.reason === "包含联系方式" ? NOTE_TEXT.contactBlocked : NOTE_TEXT.blocked };
  const match = await myActiveMatch(profile);
  if (!match) return { ok: false as const, error: NOTE_TEXT.noMatch };
  const partnerId = match.manProfileId === profile.id ? match.womanProfileId : match.manProfileId;
  await ensureTable();
  const db = getDb();
  await db.insert(webMessages).values({ fromProfileId: profile.id, toProfileId: partnerId, kind: "note", content: text.trim(), dayKey: cstDayKey(effectiveNow(profile)) });
  // 给对方推一条信箱通知（丘比特聊天框可见 + 未读徽标）
  const { notifyUser, NOTIFY_TEXT } = await import("./notify");
  await notifyUser(partnerId, NOTIFY_TEXT.note, undefined, cstDayKey(effectiveNow(profile)));
  return { ok: true as const };
}

export async function noteHistory(profile: ProfileRow) {
  const match = await myActiveMatch(profile);
  const sim = profile.simDate ? { date: profile.simDate, label: simLabel(profile), dow: simDow(profile) } : null;
  if (!match) return { match: null, partner: null, notes: [], blessingForMe: null, quotaLeft: await noteQuotaLeft(profile), sim };
  await ensureTable();
  const db = getDb();
  const partnerId = match.manProfileId === profile.id ? match.womanProfileId : match.manProfileId;
  const [partner] = await db.select().from(profiles).where(eq(profiles.id, partnerId));

  // 模拟器里周三首次亮相：若还没有推荐语就后台异步生成（生产流程是管理员在后台生成）。
  // 绝不阻塞本接口（DeepSeek 慢时会把页面拖超时）。
  const isMan = match.manProfileId === profile.id;
  let blessingForMe = isMan ? match.blessingMan : match.blessingWoman;
  if (sim && !blessingForMe) {
    void import("./blessing")
      .then((m) => m.generateBlessing(match.id))
      .catch((err) => console.error("[sim] blessing:", err));
  }

  const rows = await db
    .select()
    .from(webMessages)
    .where(
      and(
        eq(webMessages.kind, "note"),
        or(
          and(eq(webMessages.fromProfileId, profile.id), eq(webMessages.toProfileId, partnerId)),
          and(eq(webMessages.fromProfileId, partnerId), eq(webMessages.toProfileId, profile.id)),
        ),
      ),
    )
    .orderBy(webMessages.id);
  const { listPhotos } = await import("./photos");
  const partnerPhotos = partner ? await listPhotos(partner.id) : [];
  // 对方的爱情人格四字母：取该 session 最新一次测验结果
  let partnerTypeCode: string | null = null;
  if (partner) {
    const { responsesV3 } = await import("../../db/schema");
    const quizRows = await db.select().from(responsesV3).where(eq(responsesV3.sessionId, partner.sessionId));
    partnerTypeCode = quizRows.sort((a, b) => b.id - a.id)[0]?.typeCode ?? null;
  }
  return {
    match: {
      id: match.id,
      weekKey: match.weekKey,
      state: match.state,
      reason: match.reason,
      myReply: isMan ? match.manReply : match.womanReply,
      partnerReply: isMan ? match.womanReply : match.manReply,
    },
    partner: partner ? { ...maskedCard(partner), gender: partner.gender, typeCode: partnerTypeCode, photos: partnerPhotos } : null,
    notes: rows.map((r) => ({ id: r.id, fromMe: r.fromProfileId === profile.id, content: r.content, createdAt: r.createdAt })),
    blessingForMe,
    quotaLeft: await noteQuotaLeft(profile),
    sim,
  };
}

// ===== 模拟器（灰度内测）：每人一个 sim_date，全流程按模拟日期推进 =====
export function effectiveNow(profile: { simDate: string | null }): Date {
  return profile.simDate ? new Date(`${profile.simDate}T12:00:00+08:00`) : new Date();
}

export function simDow(profile: { simDate: string | null }): number | null {
  return profile.simDate ? effectiveNow(profile).getUTCDay() : null;
}

const DOW_NAME = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
export function simLabel(profile: { simDate: string | null }): string | null {
  const d = simDow(profile);
  return d === null ? null : DOW_NAME[d];
}

// ===== 月老网页对话 =====
export async function botHistoryWeb(profileId: number) {
  await ensureTable();
  const rows = await getDb()
    .select()
    .from(webMessages)
    .where(and(eq(webMessages.fromProfileId, profileId), or(eq(webMessages.kind, "user"), eq(webMessages.kind, "bot"))))
    .orderBy(desc(webMessages.id))
    .limit(40);
  return rows.reverse().map((r) => ({ id: r.id, fromMe: r.kind === "user", content: r.content ?? "", createdAt: r.createdAt }));
}

async function logWeb(profileId: number, kind: "user" | "bot", content: string) {
  await getDb().insert(webMessages).values({ fromProfileId: profileId, toProfileId: null, kind, content });
}

export async function botChatWeb(profileId: number, text: string) {
  await ensureTable();
  const db = getDb();
  await logWeb(profileId, "user", text);
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId));
  const facts = profile?.chatFacts ? chatFactsForMatching(profile.chatFacts) : null;
  const history = (await botHistoryWeb(profileId)).slice(-12);
  const messages = [
    {
      role: "system" as const,
      content:
        MATCHMAKER_SYSTEM +
        (facts?.text ? `\n已知TA的择偶需求与反馈：${facts.text}` : "") +
        "\n这是网页版对话，不是微信。",
    },
    ...history.map((m) => ({ role: (m.fromMe ? "user" : "assistant") as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: text },
  ];
  let reply: string | null = null;
  try {
    reply = await chat(messages);
  } catch (err) {
    console.error("[webchat] llm failed:", err);
    reply = "（月老这会儿有点忙，等下再聊～）";
  }
  await logWeb(profileId, "bot", reply);

  // 异步抽取择偶需求，沉淀到 profiles.chat_facts（与企微通道共用一处）
  void (async () => {
    const { extractRequirements } = await import("./requirements");
    const reqs = await extractRequirements(history.map((m) => ({ role: m.fromMe ? "user" : "assistant", content: m.content })));
    if (reqs && Object.keys(reqs).length > 0 && profile) {
      const existing = profile.chatFacts ? (JSON.parse(profile.chatFacts) as Record<string, unknown>) : {};
      existing.preferences = { ...((existing.preferences as Record<string, unknown>) ?? {}), ...reqs };
      existing.updatedAt = new Date().toISOString();
      await getDb().update(profiles).set({ chatFacts: JSON.stringify(existing) }).where(eq(profiles.id, profileId));
    }
  })().catch((err) => console.error("[webchat] extract:", err));

  return { reply };
}

// ===== 周一周二回访（网页版：星级 + 改进意见） =====
export async function webFeedback(profile: { id: number; simDate: string | null }, fb: { score: number; suggestion?: string }) {
  if (phaseOf(effectiveNow(profile)) !== "feedback") return { ok: false as const, error: "回访只在周一、周二开放。" };
  await ensureTable();
  const db = getDb();
  const rows = await db
    .select()
    .from(matches)
    .where(and(
      profile.simDate ? or(eq(matches.state, "dating"), eq(matches.state, "confirmed")) : eq(matches.state, "dating"),
      or(eq(matches.manProfileId, profile.id), eq(matches.womanProfileId, profile.id)),
    ))
    .orderBy(desc(matches.id))
    .limit(1);
  const match = rows[0];
  if (!match) return { ok: false as const, error: "没有等待回访的约会。" };
  await setMatchFeedback(match.id, { score: fb.score, feedbackNote: fb.suggestion?.trim() || undefined });
  await db.update(matches).set({ feedbackBy: profile.id }).where(eq(matches.id, match.id));
  if (fb.score <= 2) await setPoolState(profile.id, "review");
  return { ok: true as const };
}
