// 机器人存储层：bot_users / kf_messages / matches / weekly_cycles。
// 一律先 ensureTable()；调用方需自行保证 hasDatabase()（无库时流程不应走到这里）。
import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import { botUsers, kfMessages, matches, matchPool, cronLogs, profiles, weeklyCycles } from "../../db/schema";
import { ensureTable, getDb } from "../queries/connection";
import { isoWeekKey } from "./enroll";
import { decryptText, encryptText } from "./fieldCrypto";

export type BotUser = typeof botUsers.$inferSelect;
export type Match = typeof matches.$inferSelect;

export async function upsertBotUser(externalUserid: string): Promise<BotUser> {
  await ensureTable();
  const db = getDb();
  const [row] = await db.select().from(botUsers).where(eq(botUsers.externalUserid, externalUserid));
  if (row) return { ...row, requirements: decryptText(row.requirements) };
  await db.insert(botUsers).values({ externalUserid });
  const [created] = await db.select().from(botUsers).where(eq(botUsers.externalUserid, externalUserid));
  return { ...created, requirements: decryptText(created.requirements) };
}

export async function bindBotUser(externalUserid: string, profileId: number, name: string) {
  await ensureTable();
  await getDb()
    .update(botUsers)
    .set({ profileId, name })
    .where(eq(botUsers.externalUserid, externalUserid));
}

export async function setBotState(externalUserid: string, state: string) {
  await ensureTable();
  await getDb().update(botUsers).set({ state }).where(eq(botUsers.externalUserid, externalUserid));
}

export async function saveRequirements(externalUserid: string, requirements: unknown) {
  await ensureTable();
  await getDb()
    .update(botUsers)
    .set({ requirements: encryptText(JSON.stringify(requirements)) })
    .where(eq(botUsers.externalUserid, externalUserid));
}

export async function logKfMessage(row: {
  externalUserid: string;
  msgid?: string;
  origin: "user" | "bot" | "relay";
  content: string;
  raw?: unknown;
}) {
  await ensureTable();
  await getDb()
    .insert(kfMessages)
    .values({
      externalUserid: row.externalUserid,
      msgid: row.msgid ?? null,
      origin: row.origin,
      content: encryptText(row.content),
      raw: encryptText(row.raw ? JSON.stringify(row.raw) : null),
    });
}

export async function recentMessages(externalUserid: string, limit = 20) {
  await ensureTable();
  const rows = await getDb()
    .select()
    .from(kfMessages)
    .where(eq(kfMessages.externalUserid, externalUserid))
    .orderBy(desc(kfMessages.id))
    .limit(limit);
  return rows.reverse().map((r) => ({ ...r, content: decryptText(r.content) }));
}

function cstTodayStartUtc(): Date {
  const now = new Date();
  const cst = new Date(now.getTime() + 8 * 3600 * 1000);
  cst.setUTCHours(0, 0, 0, 0);
  return new Date(cst.getTime() - 8 * 3600 * 1000);
}

/** 今日已用传话条数（origin='relay'） */
export async function relayCountToday(externalUserid: string): Promise<number> {
  await ensureTable();
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(kfMessages)
    .where(
      and(
        eq(kfMessages.externalUserid, externalUserid),
        eq(kfMessages.origin, "relay"),
        gte(kfMessages.createdAt, cstTodayStartUtc()),
      ),
    );
  return Number(row?.n ?? 0);
}

/** 按姓名+微信号找最新报名行 */
export async function findProfileByNameWechat(name: string, wechat: string) {
  await ensureTable();
  const db = getDb();
  const rows = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.name, name), eq(profiles.wechat, wechat)))
    .orderBy(desc(profiles.id))
    .limit(1);
  return rows[0];
}

export async function getProfileById(id: number) {
  await ensureTable();
  const [row] = await getDb().select().from(profiles).where(eq(profiles.id, id));
  return row;
}

/** 本周内该用户的进行中配对（已发送/传话中/已确认） */
export async function activeMatchForProfile(profileId: number, weekKey = isoWeekKey()): Promise<Match | undefined> {
  await ensureTable();
  const db = getDb();
  const rows = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.weekKey, weekKey),
        or(eq(matches.manProfileId, profileId), eq(matches.womanProfileId, profileId)),
        or(eq(matches.state, "sent"), eq(matches.state, "chatting"), eq(matches.state, "confirmed")),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function partnerProfileId(match: Match, profileId: number): Promise<number> {
  return match.manProfileId === profileId ? match.womanProfileId : match.manProfileId;
}

/** 找到某个 profile 对应的已绑定 bot_user（用于传话寻址） */
export async function botUserByProfileId(profileId: number): Promise<BotUser | undefined> {
  await ensureTable();
  const rows = await getDb().select().from(botUsers).where(eq(botUsers.profileId, profileId)).limit(1);
  return rows[0];
}

/** 回访对象：该用户最近一条处于 dating 状态的配对 */
export async function matchAwaitingFeedback(profileId: number): Promise<Match | undefined> {
  await ensureTable();
  const rows = await getDb()
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.state, "dating"),
        or(eq(matches.manProfileId, profileId), eq(matches.womanProfileId, profileId)),
      ),
    )
    .orderBy(desc(matches.id))
    .limit(1);
  return rows[0];
}

export async function getCycle(weekKey = isoWeekKey()) {
  await ensureTable();
  const db = getDb();
  const [row] = await db.select().from(weeklyCycles).where(eq(weeklyCycles.weekKey, weekKey));
  if (row) return row;
  await db.insert(weeklyCycles).values({ weekKey }).onDuplicateKeyUpdate({ set: { weekKey } });
  const [created] = await db.select().from(weeklyCycles).where(eq(weeklyCycles.weekKey, weekKey));
  return created;
}

export async function setCycleState(weekKey: string, state: string) {
  await ensureTable();
  await getDb().update(weeklyCycles).set({ state }).where(eq(weeklyCycles.weekKey, weekKey));
}

// ===== T3：匹配池 / 配对状态 / 调度日志 =====

export async function insertPoolEntry(profileId: number, gender: string, orgTag = "default") {
  await ensureTable();
  await getDb()
    .insert(matchPool)
    .values({ profileId, gender, orgTag })
    .onDuplicateKeyUpdate({ set: { gender } });
}

export type PoolRow = typeof matchPool.$inferSelect;

export async function poolUsersIn(state = "in") {
  await ensureTable();
  const db = getDb();
  const poolRows = await db.select().from(matchPool).where(eq(matchPool.state, state));
  const out: { pool: PoolRow; profile: typeof profiles.$inferSelect }[] = [];
  for (const p of poolRows) {
    const [prof] = await db.select().from(profiles).where(eq(profiles.id, p.profileId));
    if (prof) out.push({ pool: p, profile: prof });
  }
  return out;
}

export async function setPoolState(profileId: number, state: string) {
  await ensureTable();
  await getDb().update(matchPool).set({ state }).where(eq(matchPool.profileId, profileId));
}

export async function bumpPoolPriority(profileId: number, delta: number) {
  await ensureTable();
  await getDb()
    .update(matchPool)
    .set({ priority: sql`${matchPool.priority} + ${delta}` })
    .where(eq(matchPool.profileId, profileId));
}

export async function resetPoolPriority(profileId: number) {
  await ensureTable();
  await getDb().update(matchPool).set({ priority: 0 }).where(eq(matchPool.profileId, profileId));
}

export async function updateMatchState(id: number, state: string) {
  await ensureTable();
  await getDb().update(matches).set({ state }).where(eq(matches.id, id));
}

export async function setMatchFeedback(id: number, fb: { met?: number; score?: number; willing?: string }) {
  await ensureTable();
  await getDb().update(matches).set({ ...fb, state: "done" }).where(eq(matches.id, id));
}

export async function matchesOfWeek(weekKey: string, states?: string[]): Promise<Match[]> {
  await ensureTable();
  const rows = await getDb().select().from(matches).where(eq(matches.weekKey, weekKey));
  return states ? rows.filter((r) => states.includes(r.state)) : rows;
}

/** 历史已配组合（用于本周排除），key 形如 "男profileId:女profileId" */
export async function previousPairKeys(weekKey: string): Promise<Set<string>> {
  await ensureTable();
  const rows = await getDb().select().from(matches);
  const set = new Set<string>();
  for (const r of rows) {
    if (r.weekKey !== weekKey && r.state !== "cancelled") {
      set.add(`${r.manProfileId}:${r.womanProfileId}`);
    }
  }
  return set;
}

export async function logCron(action: string, detail?: unknown) {
  await ensureTable();
  await getDb()
    .insert(cronLogs)
    .values({ action, detail: detail === undefined ? null : typeof detail === "string" ? detail : JSON.stringify(detail) });
}
