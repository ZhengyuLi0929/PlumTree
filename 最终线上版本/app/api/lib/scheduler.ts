// 调度器：每周节奏的推进器。
// 周三 20:00 生成配对进待确认队列（matched）；周五 00:00 未确认轮空（dating）；
// 周一 10:00 回访（feedback）。所有动作落 cron_logs。tick(now) 注入时间，便于压缩时间测试。
import { computeMatches, type PoolUser } from "./matching";
import { chatFactsForMatching, participatesThisWeek } from "./botStore";
import {
  bumpPoolPriority,
  getCycle,
  logCron,
  matchesOfWeek,
  poolUsersIn,
  previousPairKeys,
  resetPoolPriority,
  setCycleState,
  updateMatchState,
  botUserByProfileId,
} from "./botStore";
import { isoWeekKey } from "./enroll";
import { getDb, ensureTable } from "../queries/connection";
import { matches } from "../../db/schema";
import { sendWecomText } from "./wecom";
import { TPL } from "./templates";
import { sendFridayConfirmSms } from "./smsMatch";

function cstParts(now: Date) {
  const cst = new Date(now.getTime() + 8 * 3600 * 1000);
  return { dow: cst.getUTCDay(), hour: cst.getUTCHours(), minute: cst.getUTCMinutes() };
}

/** 生成本周配对（待确认队列，发送由管理后台人工确认） */
export async function runWeeklyMatching(weekKey: string) {
  const poolWithProfiles = await poolUsersIn("in");

  // 补充人格类型：responses_v3 每个 sessionId 最新一条的 typeCode
  await ensureTable();
  const db = getDb();
  const { responsesV3 } = await import("../../db/schema");
  const quizRows = await db.select().from(responsesV3);
  const bySession = new Map<string, string>();
  for (const r of quizRows) bySession.set(r.sessionId, r.typeCode);

  // 资料未补全（快速注册先留空 birthYear/city）的用户不参与匹配；
  // 未在 /me 打开「参加本周约会」开关的用户也不参与（开关按周生效）
  const complete = poolWithProfiles.filter(
    ({ profile }) =>
      profile.birthYear != null && profile.city && participatesThisWeek(profile.datePrefs, weekKey),
  );
  const users: PoolUser[] = complete.map(({ pool, profile }) => ({
    profileId: profile.id,
    name: profile.name,
    gender: profile.gender,
    birthYear: profile.birthYear!,
    city: profile.city!,
    orgTag: pool.orgTag,
    priority: pool.priority,
    typeCode: bySession.get(profile.sessionId) ?? null,
    height: profile.height,
    job: profile.job,
    intro: profile.intro,
    expectation: profile.expectation,
    value: profile.value,
    prefMinHeight: profile.prefMinHeight ?? chatFactsForMatching(profile.chatFacts).heightMin,
    prefBirthFrom: profile.prefBirthFrom,
    prefBirthTo: profile.prefBirthTo,
    acceptDistance: profile.acceptDistance,
    chatText: chatFactsForMatching(profile.chatFacts).text || null,
  }));

  const excludePairs = await previousPairKeys(weekKey);
  const maxAgeGap = parseInt(process.env.MATCH_AGE_GAP || "5", 10);

  const byTag = new Map<string, PoolUser[]>();
  for (const u of users) {
    const list = byTag.get(u.orgTag) ?? [];
    list.push(u);
    byTag.set(u.orgTag, list);
  }

  let totalPairs = 0;
  const unmatchedAll: PoolUser[] = [];
  for (const [tag, group] of byTag) {
    const { pairs, unmatched } = computeMatches(group, { maxAgeGap, excludePairs });
    for (const p of pairs) {
      await db.insert(matches).values({
        weekKey,
        manProfileId: p.man.profileId,
        womanProfileId: p.woman.profileId,
        reason: p.reason,
        state: "pending_send",
      });
      await resetPoolPriority(p.man.profileId);
      await resetPoolPriority(p.woman.profileId);
    }
    for (const u of unmatched) {
      await bumpPoolPriority(u.profileId, 1); // 轮空用户下周优先
    }
    totalPairs += pairs.length;
    unmatchedAll.push(...unmatched);
    await logCron("match.generate", { weekKey, orgTag: tag, pairs: pairs.length, unmatched: unmatched.length });
  }
  return { pairs: totalPairs, unmatched: unmatchedAll.length };
}

/** 周五零点：未确认的配对轮空（双方进下周优先队列） */
export async function closeConfirmations(weekKey: string) {
  const open = await matchesOfWeek(weekKey, ["pending_send", "sent", "chatting"]);
  for (const m of open) {
    await updateMatchState(m.id, "cancelled");
    await bumpPoolPriority(m.manProfileId, 1);
    await bumpPoolPriority(m.womanProfileId, 1);
  }
  const confirmed = await matchesOfWeek(weekKey, ["confirmed"]);
  for (const m of confirmed) await updateMatchState(m.id, "dating");
  await logCron("match.close", { weekKey, cancelled: open.length, dating: confirmed.length });
  return { cancelled: open.length, dating: confirmed.length };
}

/** 周一回访：向已约会的双方发回访问卷 */
export async function startFeedback(weekKey: string) {
  const dating = await matchesOfWeek(weekKey, ["dating"]);
  let sent = 0;
  for (const m of dating) {
    for (const pid of [m.manProfileId, m.womanProfileId]) {
      const bot = await botUserByProfileId(pid);
      if (bot) {
        await sendWecomText(bot.externalUserid, TPL.feedbackAsk);
        sent++;
      }
    }
  }
  await logCron("feedback.start", { weekKey, matches: dating.length, sent });
  return { matches: dating.length, sent };
}

/** 单步推进。返回本步动作名（无动作返回 null）。 */
export async function tick(now = new Date()): Promise<string | null> {
  const { dow, hour } = cstParts(now);
  const weekKey = isoWeekKey(now);
  const prevWeekKey = isoWeekKey(new Date(now.getTime() - 7 * 86400_000));

  // 周三 20:00 后（或周四补跑）：生成本周配对
  if (dow === 3 || dow === 4) {
    const cycle = await getCycle(weekKey);
    if (cycle.state === "idle" && (dow === 4 || hour >= 20)) {
      const r = await runWeeklyMatching(weekKey);
      await setCycleState(weekKey, "matched");
      await logCron("cycle.matched", { weekKey, ...r });
      return "matched";
    }
    return null;
  }
  // 周五：发确认短信。小纸条和【匹配】仍可在当天回复，所以不在周五零点取消配对。
  if (dow === 5) {
    const sent = await sendFridayConfirmSms(weekKey);
    await logCron("sms.friday", { weekKey, sent });
    return "friday-sms";
  }
  // 周六起：未确认的配对轮空
  if (dow === 6 || dow === 0) {
    const cycle = await getCycle(weekKey);
    if (cycle.state === "matched") {
      const r = await closeConfirmations(weekKey);
      await setCycleState(weekKey, "dating");
      await logCron("cycle.dating", { weekKey, ...r });
      return "dating";
    }
    return null;
  }
  // 周一 10:00 后：回访的是「上一周」的配对（ISO 周已翻篇）
  if (dow === 1 && hour >= 10) {
    const prev = await getCycle(prevWeekKey);
    if (prev.state === "dating") {
      const r = await startFeedback(prevWeekKey);
      await setCycleState(prevWeekKey, "feedback");
      await logCron("cycle.feedback", { weekKey: prevWeekKey, ...r });
      return "feedback";
    }
  }
  return null;
}

export function startScheduler() {
  setInterval(() => {
    void tick().catch((err) => console.error("[cron] tick:", err));
  }, 60_000);
}
