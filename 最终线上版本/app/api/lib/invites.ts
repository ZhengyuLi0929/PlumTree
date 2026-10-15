// 约会邀请：周五确认后，双方基于偏好推荐商家 + 时间交集，可互发邀请/反邀请，
// 首个被接受的邀请锁定（其余 pending 自动作废）。
import { and, desc, eq } from "drizzle-orm";
import { dateInvites, matches, merchants, profiles } from "../../db/schema";
import { ensureTable, getDb } from "../queries/connection";
import { myActiveMatch, simDow } from "./webMember";

type ProfileRow = typeof profiles.$inferSelect;

export type Prefs = {
  participate?: boolean;
  locations?: string[];
  activities?: string[];
  times?: string[];
  customLocation?: string;
  customActivity?: string;
};

export function parsePrefs(raw: string | null): Prefs {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Prefs;
  } catch {
    return {};
  }
}

const ALL_TIMES = ["周六上午", "周六下午", "周六晚上", "周日上午", "周日下午", "周日晚上"];

/** 双方都没填时间 → 全开；交集为空 → 全开并提示 */
export function timeSlotsFor(mine: Prefs, theirs: Prefs) {
  const m = mine.times ?? [];
  const t = theirs.times ?? [];
  if (m.length === 0 || t.length === 0) return { slots: ALL_TIMES, noOverlap: false };
  const inter = m.filter((x) => t.includes(x));
  return inter.length ? { slots: inter, noOverlap: false } : { slots: ALL_TIMES, noOverlap: true };
}

/** 商家推荐：双方都选的商圈/类别排前，单方选中次之 */
export function recommendMerchants(mine: Prefs, theirs: Prefs, rows: (typeof merchants.$inferSelect)[]) {
  const myLoc = new Set(mine.locations ?? []);
  const myAct = new Set(mine.activities ?? []);
  const thLoc = new Set(theirs.locations ?? []);
  const thAct = new Set(theirs.activities ?? []);
  return rows
    .filter((r) => r.status === "active" && r.area && r.category)
    .map((r) => {
      let score = 0;
      if (myLoc.has(r.area!) && thLoc.has(r.area!)) score += 3;
      else if (myLoc.has(r.area!) || thLoc.has(r.area!)) score += 1;
      if (myAct.has(r.category!) && thAct.has(r.category!)) score += 3;
      else if (myAct.has(r.category!) || thAct.has(r.category!)) score += 1;
      return { ...r, fit: score };
    })
    .sort((a, b) => b.fit - a.fit);
}

export async function dateOptions(profile: ProfileRow) {
  // 模拟器里周五及以后（dow 5/6/0）才开放约会安排
  if (profile.simDate && ![5, 6, 0].includes(simDow(profile)!)) {
    return { ok: false as const, error: "周五确认见面之后，就可以来约时间地点啦" };
  }
  const match = await myActiveMatch(profile);
  if (!match || !["confirmed", "dating"].includes(match.state)) {
    return { ok: false as const, error: "双方都确认见面之后，就可以来约时间地点啦" };
  }
  await ensureTable();
  const db = getDb();
  const partnerId = match.manProfileId === profile.id ? match.womanProfileId : match.manProfileId;
  const [me] = await db.select().from(profiles).where(eq(profiles.id, profile.id));
  const [them] = await db.select().from(profiles).where(eq(profiles.id, partnerId));
  const mine = parsePrefs(me?.datePrefs ?? null);
  const theirs = parsePrefs(them?.datePrefs ?? null);
  const allMerchants = await db.select().from(merchants);
  return {
    ok: true as const,
    matchId: match.id,
    locked: match.dateMerchantId != null ? { merchantId: match.dateMerchantId, timeSlot: match.dateTimeSlot } : null,
    merchants: recommendMerchants(mine, theirs, allMerchants),
    time: timeSlotsFor(mine, theirs),
  };
}

export async function sendInvite(profile: ProfileRow, merchantId: number, timeSlot: string) {
  if (profile.simDate && ![5, 6, 0].includes(simDow(profile)!)) {
    return { ok: false as const, error: "周五确认见面之后才能发邀请" };
  }
  const match = await myActiveMatch(profile);
  if (!match || !["confirmed", "dating"].includes(match.state)) {
    return { ok: false as const, error: "双方都确认见面之后才能发邀请" };
  }
  if (match.dateMerchantId != null) return { ok: false as const, error: "这周的约会已经定下来了" };
  await ensureTable();
  const db = getDb();
  const [merch] = await db.select().from(merchants).where(eq(merchants.id, merchantId));
  if (!merch) return { ok: false as const, error: "商家不存在" };
  await db.insert(dateInvites).values({ matchId: match.id, fromProfileId: profile.id, merchantId, timeSlot });
  return { ok: true as const };
}

export async function listInvites(profile: ProfileRow) {
  const match = await myActiveMatch(profile);
  if (!match) return { matchId: null, invites: [] };
  await ensureTable();
  const db = getDb();
  const rows = await db.select().from(dateInvites).where(eq(dateInvites.matchId, match.id)).orderBy(desc(dateInvites.id));
  const merchRows = await db.select().from(merchants);
  const nameOf = new Map(merchRows.map((m) => [m.id, m.name]));
  return {
    matchId: match.id,
    invites: rows.map((r) => ({
      id: r.id,
      fromMe: r.fromProfileId === profile.id,
      merchant: nameOf.get(r.merchantId) ?? `#${r.merchantId}`,
      timeSlot: r.timeSlot,
      status: r.status,
    })),
  };
}

/** 应答邀请：接受→锁定（其余 pending 作废）；拒绝→对方可重提 */
export async function answerInvite(profileId: number, inviteId: number, accept: boolean) {
  await ensureTable();
  const db = getDb();
  const [invite] = await db.select().from(dateInvites).where(eq(dateInvites.id, inviteId));
  if (!invite) return { ok: false as const, error: "邀请不存在" };
  if (invite.fromProfileId === profileId) return { ok: false as const, error: "不能应答自己发的邀请" };
  if (invite.status !== "pending") return { ok: false as const, error: "这个邀请已经处理过了" };
  const [match] = await db.select().from(matches).where(eq(matches.id, invite.matchId));
  if (!match || (match.manProfileId !== profileId && match.womanProfileId !== profileId)) {
    return { ok: false as const, error: "这个邀请不是你的" };
  }
  if (!accept) {
    await db.update(dateInvites).set({ status: "rejected" }).where(eq(dateInvites.id, inviteId));
    return { ok: true as const, accepted: false };
  }
  await db.update(dateInvites).set({ status: "accepted" }).where(eq(dateInvites.id, inviteId));
  await db.update(matches).set({ dateMerchantId: invite.merchantId, dateTimeSlot: invite.timeSlot, state: "dating" }).where(eq(matches.id, invite.matchId));
  await db.update(dateInvites).set({ status: "superseded" }).where(and(eq(dateInvites.matchId, invite.matchId), eq(dateInvites.status, "pending")));
  return { ok: true as const, accepted: true };
}
