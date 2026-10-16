// 手动配对自愈同步：match_pairs 里的每一对都必须落在 matches 表里
//（匹配结果、传话、约会邀请、推荐语全部读 matches）。
// 历史背景：手动配对功能早于 matches 同步逻辑上线，会出现 match_pairs 有记录、
// matches 里没有（或 matches 里还是旧的 AI 配对）的情况，导致匹配结果页少人。
import { and, eq, or } from "drizzle-orm";
import { matchPairs, matches, profiles } from "../../db/schema";
import { ensureTable, getDb } from "../queries/connection";
import { isoWeekKey } from "./enroll";

export async function reconcileManualPairs(weekKey = isoWeekKey()): Promise<{ repaired: number }> {
  await ensureTable();
  const db = getDb();
  const pairRows = await db.select().from(matchPairs).where(eq(matchPairs.weekKey, weekKey));
  if (pairRows.length === 0) return { repaired: 0 };
  const profRows = await db.select().from(profiles);
  const latest = new Map<string, (typeof profRows)[number]>();
  for (const p of profRows) {
    const prev = latest.get(p.sessionId);
    if (!prev || p.id > prev.id) latest.set(p.sessionId, p);
  }
  const personInvolving = (manId: number, womanId: number) =>
    or(
      eq(matches.manProfileId, manId),
      eq(matches.womanProfileId, manId),
      eq(matches.manProfileId, womanId),
      eq(matches.womanProfileId, womanId),
    );
  let repaired = 0;
  for (const pair of pairRows) {
    const left = latest.get(pair.leftSession);
    const right = latest.get(pair.rightSession);
    if (!left || !right) continue;
    const man = left.gender === "男" ? left : right.gender === "男" ? right : null;
    const woman = left.gender === "女" ? left : right.gender === "女" ? right : null;
    if (!man || !woman) continue;
    const involving = await db
      .select()
      .from(matches)
      .where(and(eq(matches.weekKey, weekKey), personInvolving(man.id, woman.id)));
    // 已经是这一对（任意状态）→ 不动
    if (involving.some((m) => m.manProfileId === man.id && m.womanProfileId === woman.id)) continue;
    // 其中任何人有进行中（已发送及以后）的别的配对 → 不动，留给管理员人工处理
    if (involving.some((m) => m.state !== "pending_send" && m.state !== "cancelled")) continue;
    // 清掉这两人待发送的旧配对，插入手动配对
    await db
      .delete(matches)
      .where(and(eq(matches.weekKey, weekKey), eq(matches.state, "pending_send"), personInvolving(man.id, woman.id)));
    await db.insert(matches).values({
      weekKey,
      manProfileId: man.id,
      womanProfileId: woman.id,
      reason: `手动匹配${pair.note ? ` · ${pair.note}` : ""}`,
      state: "pending_send",
    });
    repaired++;
  }
  return { repaired };
}
