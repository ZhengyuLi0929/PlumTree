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
import { payments } from "../../db/schema";
import { phaseOf } from "./weekly";

export const NOTE_TEXT = {
  quotaUsed: "今天的小纸条额度用完啦，明天再来",
  closed: "小纸条只在周三、周四、周五可以发送。",
  blocked: "这句话我不好递出去，换一句礼貌点的吧。",
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
  };
}

/** 我本周的进行中的配对（已发送及以后的状态） */
export async function myActiveMatch(profileId: number) {
  await ensureTable();
  const db = getDb();
  const rows = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.weekKey, isoWeekKey()),
        or(eq(matches.manProfileId, profileId), eq(matches.womanProfileId, profileId)),
      ),
    )
    .orderBy(desc(matches.id));
  return rows.find((r) => ["sent", "chatting", "confirmed", "dating"].includes(r.state));
}

export async function noteQuotaLeft(profileId: number): Promise<number> {
  await ensureTable();
  const db = getDb();
  const rows = await db
    .select()
    .from(webMessages)
    .where(and(eq(webMessages.fromProfileId, profileId), eq(webMessages.kind, "note"), eq(webMessages.dayKey, cstDayKey())));
  return Math.max(0, 1 - rows.length);
}

export async function sendNote(profileId: number, text: string) {
  if (!noteDayOpen()) return { ok: false as const, error: NOTE_TEXT.closed };
  if ((await noteQuotaLeft(profileId)) <= 0) return { ok: false as const, error: NOTE_TEXT.quotaUsed };
  const screened = await screenText(text);
  if (!screened.ok) return { ok: false as const, error: NOTE_TEXT.blocked };
  const match = await myActiveMatch(profileId);
  if (!match) return { ok: false as const, error: NOTE_TEXT.noMatch };
  const partnerId = match.manProfileId === profileId ? match.womanProfileId : match.manProfileId;
  await ensureTable();
  const db = getDb();
  await db.insert(webMessages).values({ fromProfileId: profileId, toProfileId: partnerId, kind: "note", content: text.trim(), dayKey: cstDayKey() });
  return { ok: true as const };
}

export async function noteHistory(profileId: number) {
  const match = await myActiveMatch(profileId);
  if (!match) return { match: null, partner: null, notes: [], blessingForMe: null, quotaLeft: await noteQuotaLeft(profileId) };
  await ensureTable();
  const db = getDb();
  const partnerId = match.manProfileId === profileId ? match.womanProfileId : match.manProfileId;
  const [partner] = await db.select().from(profiles).where(eq(profiles.id, partnerId));
  const rows = await db
    .select()
    .from(webMessages)
    .where(
      and(
        eq(webMessages.kind, "note"),
        or(
          and(eq(webMessages.fromProfileId, profileId), eq(webMessages.toProfileId, partnerId)),
          and(eq(webMessages.fromProfileId, partnerId), eq(webMessages.toProfileId, profileId)),
        ),
      ),
    )
    .orderBy(webMessages.id);
  const isMan = match.manProfileId === profileId;
  return {
    match: { id: match.id, weekKey: match.weekKey, state: match.state, reason: match.reason },
    partner: partner ? maskedCard(partner) : null,
    notes: rows.map((r) => ({ id: r.id, fromMe: r.fromProfileId === profileId, content: r.content, createdAt: r.createdAt })),
    blessingForMe: isMan ? match.blessingMan : match.blessingWoman,
    quotaLeft: await noteQuotaLeft(profileId),
  };
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

// ===== 周一周二回访（网页版，逻辑与 botBrain.tryFeedback 一致） =====
export async function webFeedback(profileId: number, fb: { met: number; score: number; willing: string }) {
  if (phaseOf() !== "feedback") return { ok: false as const, error: "回访只在周一、周二开放。" };
  await ensureTable();
  const db = getDb();
  const rows = await db
    .select()
    .from(matches)
    .where(and(eq(matches.state, "dating"), or(eq(matches.manProfileId, profileId), eq(matches.womanProfileId, profileId))))
    .orderBy(desc(matches.id))
    .limit(1);
  const match = rows[0];
  if (!match) return { ok: false as const, error: "没有等待回访的约会。" };
  await setMatchFeedback(match.id, fb);
  if (fb.score <= 2) await setPoolState(profileId, "review");
  if (fb.met === 0) {
    await db.insert(payments).values({ matchId: match.id, amountCents: 0, status: "refund_pending", reason: "no-show" });
  }
  return { ok: true as const };
}
