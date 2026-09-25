// 空投发送：管理员在后台确认后，把配对结果通过月老机器人发给双方。
import { eq } from "drizzle-orm";
import { matches, profiles, botUsers, responsesV3 } from "../../db/schema";
import { ensureTable, getDb } from "../queries/connection";
import { TPL } from "./templates";
import { sendWecomText } from "./wecom";
import { logCron } from "./botStore";

function cardOf(p: typeof profiles.$inferSelect, typeCode: string | null) {
  return [
    `${p.name}，${p.birthYear} 年生`,
    p.city,
    p.job || null,
    p.height ? `身高 ${p.height}cm` : null,
    typeCode ? `恋爱人格 ${typeCode}` : null,
  ]
    .filter(Boolean)
    .join("，");
}

export async function sendAirdrop(matchId: number): Promise<{ sent: number; total: number }> {
  await ensureTable();
  const db = getDb();
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) throw new Error("配对不存在");
  if (match.state !== "pending_send") throw new Error(`当前状态（${match.state}）不可发送`);

  const [man] = await db.select().from(profiles).where(eq(profiles.id, match.manProfileId));
  const [woman] = await db.select().from(profiles).where(eq(profiles.id, match.womanProfileId));
  if (!man || !woman) throw new Error("报名资料缺失");

  const quizRows = await db.select().from(responsesV3);
  const typeOf = (sessionId: string) => {
    let code: string | null = null;
    for (const r of quizRows) if (r.sessionId === sessionId) code = r.typeCode;
    return code;
  };

  let sent = 0;
  for (const [self, partner] of [
    [man, woman],
    [woman, man],
  ] as const) {
    const [bot] = await db.select().from(botUsers).where(eq(botUsers.profileId, self.id));
    if (!bot) continue; // 未绑定月老的用户跳过，后台会标注
    const text = TPL.airdrop(`${cardOf(partner, typeOf(partner.sessionId))}。推荐理由：${match.reason ?? "组织者人工精选"}`);
    await sendWecomText(bot.externalUserid, text);
    sent++;
  }

  await db.update(matches).set({ state: "sent" }).where(eq(matches.id, matchId));
  await logCron("airdrop.sent", { matchId, sent });
  return { sent, total: 2 };
}
