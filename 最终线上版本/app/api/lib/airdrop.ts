// 空投发送：管理员确认后，用短信把本周对象发给双方。不走微信客服。
import { eq } from "drizzle-orm";
import { matches, profiles, responsesV3 } from "../../db/schema";
import { ensureTable, getDb } from "../queries/connection";
import { logCron, nameMasks } from "./botStore";
import { redactNames } from "./maskName";
import { sendNotifySms } from "./sms";
import { wednesdayAirdropSms } from "./smsMatch";

function cardOf(p: typeof profiles.$inferSelect, typeCode: string | null) {
  return [
    p.birthYear != null ? `${p.birthYear} 年生` : null,
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
    if (!self.phone) continue;
    const masks = await nameMasks();
    const reason = redactNames(match.reason ?? "组织者人工精选", masks);
    const text = wednesdayAirdropSms(`${cardOf(partner, typeOf(partner.sessionId))}。推荐理由：${reason}`);
    await sendNotifySms(self.phone, text);
    sent++;
  }

  await db.update(matches).set({ state: "sent" }).where(eq(matches.id, matchId));
  await logCron("airdrop.sms", { matchId, sent });
  return { sent, total: 2 };
}
