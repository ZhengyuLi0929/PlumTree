// 空投发送：管理员确认后，用短信把本周对象发给双方。不走微信客服。
import { eq } from "drizzle-orm";
import { matches, profiles } from "../../db/schema";
import { ensureTable, getDb } from "../queries/connection";
import { logCron } from "./botStore";
import { sendNotifySms } from "./sms";
import { wednesdayAirdropSms } from "./smsMatch";

export async function sendAirdrop(matchId: number): Promise<{ sent: number; total: number; details: string[] }> {
  await ensureTable();
  const db = getDb();
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) throw new Error("配对不存在");
  if (match.state !== "pending_send") throw new Error(`当前状态（${match.state}）不可发送`);

  const [man] = await db.select().from(profiles).where(eq(profiles.id, match.manProfileId));
  const [woman] = await db.select().from(profiles).where(eq(profiles.id, match.womanProfileId));
  if (!man || !woman) throw new Error("报名资料缺失");

  const texts = buildAirdropTexts(match, man, woman);
  let sent = 0;
  const details: string[] = [];
  for (const t of texts) {
    if (!t.to) {
      details.push(`${t.name}：没有手机号，发不了`);
      continue;
    }
    const ok = await sendNotifySms(t.to, t.text);
    if (ok) {
      sent++;
      details.push(`${t.name}：已发送`);
    } else {
      details.push(`${t.name}：未发送（短信服务未配置或发送失败）`);
    }
  }

  // 只有真的发出去了才标记 sent，否则会丢失再次发送的机会
  if (sent > 0) {
    await db.update(matches).set({ state: "sent" }).where(eq(matches.id, matchId));
    await logCron("airdrop.sms", { matchId, sent });
  }
  return { sent, total: 2, details };
}

/** 预览将要发送的短信内容（不真正发送），并告知短信服务是否已配置 */
export async function previewAirdrop(matchId: number): Promise<{ smsConfigured: boolean; texts: { name: string; phone: string; text: string }[] }> {
  await ensureTable();
  const db = getDb();
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) throw new Error("配对不存在");
  const [man] = await db.select().from(profiles).where(eq(profiles.id, match.manProfileId));
  const [woman] = await db.select().from(profiles).where(eq(profiles.id, match.womanProfileId));
  if (!man || !woman) throw new Error("报名资料缺失");
  const { smsConfigured } = await import("./env");
  const texts = buildAirdropTexts(match, man, woman).map((t) => ({ name: t.name, phone: t.to || "（没有手机号）", text: t.text }));
  return { smsConfigured: smsConfigured(), texts };
}

function buildAirdropTexts(match: typeof matches.$inferSelect, man: typeof profiles.$inferSelect, woman: typeof profiles.$inferSelect) {
  const card = (p: typeof profiles.$inferSelect) =>
    [
      p.birthYear != null ? `${p.birthYear} 年生` : null,
      p.city,
      p.job || null,
      p.height ? `身高 ${p.height}cm` : null,
      p.mbti ? `MBTI ${p.mbti}` : null,
    ]
      .filter(Boolean)
      .join("，");
  const reason = match.reason ?? "组织者人工精选";
  return [
    { name: man.name, to: man.phone, text: wednesdayAirdropSms(`${card(woman)}。推荐理由：${reason}`) },
    { name: woman.name, to: woman.phone, text: wednesdayAirdropSms(`${card(man)}。推荐理由：${reason}`) },
  ];
}
