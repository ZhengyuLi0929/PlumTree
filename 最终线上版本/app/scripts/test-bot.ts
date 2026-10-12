// 本地 mock 全链路测试：绑定 → 闲聊（mock LLM）→ 需求抽取写库 → 传话限额 → LLM 断网静默降级。
// 运行：npm run db:up && cp .env.example .env（填 DATABASE_URL）后执行 npm run test:bot
process.env.BOT_SANDBOX = "1"; // 永远不触网企业微信
import { eq, like, or } from "drizzle-orm";
import { processIncomingText } from "../api/lib/botBrain";
import { isoWeekKey } from "../api/lib/enroll";
import { env } from "../api/lib/env";
import { botUsers, kfMessages, matches, profiles } from "../db/schema";
import { ensureTable, getDb, hasDatabase } from "../api/queries/connection";

process.env.BOT_FORCE_PHASE = "chatting"; // 强制传话期，保证限额路径可测

const WEEK = isoWeekKey();
const UA = "TEST_U_A"; // 男
const UB = "TEST_U_B"; // 女
let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

async function lastBotMsg(externalUserid: string) {
  const rows = await getDb()
    .select()
    .from(kfMessages)
    .where(eq(kfMessages.externalUserid, externalUserid))
    .orderBy(kfMessages.id);
  const bots = rows.filter((r) => r.origin === "bot");
  return bots[bots.length - 1]?.content ?? "";
}

async function main() {
  if (!hasDatabase()) {
    console.error("需要 DATABASE_URL（先 npm run db:up 并配置 .env）");
    process.exit(1);
  }
  console.log(`llm 模式: ${env.llmApiKey ? "真实 API" : "mock"}`);
  await ensureTable();
  const db = getDb();

  // 准备两个报名档案 + 本周配对
  await db.insert(profiles).values([
    { sessionId: "test-session-a", name: "测试甲", wechat: "wx_test_a", phone: "", gender: "男", birthYear: 1997, city: "北京", gradClass: "2016届1班", intro: "测试用介绍，三十个字三十个字三十个字三十个字。", consentAt: new Date() },
    { sessionId: "test-session-b", name: "测试乙", wechat: "wx_test_b", phone: "", gender: "女", birthYear: 1998, city: "北京", gradClass: "2016届2班", intro: "测试用介绍，三十个字三十个字三十个字三十个字。", consentAt: new Date() },
  ]);
  const [pa] = await db.select().from(profiles).where(eq(profiles.sessionId, "test-session-a"));
  const [pb] = await db.select().from(profiles).where(eq(profiles.sessionId, "test-session-b"));
  await db.insert(matches).values({ weekKey: WEEK, manProfileId: pa.id, womanProfileId: pb.id, state: "sent", reason: "测试配对" });

  console.log("1) 未绑定 → 引导语");
  await processIncomingText(UA, "你好");
  assert("返回绑定引导", (await lastBotMsg(UA)).includes("请发送"));

  console.log("2) 姓名+微信号绑定");
  await processIncomingText(UA, "测试甲 wx_test_a");
  await processIncomingText(UB, "测试乙 wx_test_b");
  const [ua] = await db.select().from(botUsers).where(eq(botUsers.externalUserid, UA));
  assert("A 已绑定 profile", ua.profileId === pa.id);
  assert("绑定成功回复", (await lastBotMsg(UA)).includes("绑定成功"));

  console.log("3) 传话 + 限额（每人每天一条）");
  await processIncomingText(UA, "你好，听说你也喜欢爬山");
  assert("传话送达确认", (await lastBotMsg(UA)).includes("递过去"));
  const bMsgs = (await getDb().select().from(kfMessages).where(eq(kfMessages.externalUserid, UB))).filter((r) => r.origin === "bot" && (r.content ?? "").includes("同桌的TA发来消息"));
  assert("B 收到转发", bMsgs.length === 1);
  await processIncomingText(UA, "第二条今天应该被拒");
  assert("第二条触发限额", (await lastBotMsg(UA)).includes("额度用完"));

  console.log("4) 需求抽取写库（真实 LLM 时轮询最多 30s，每 6s 补发一条触发重试）");
  let reqs: string | null = null;
  for (let i = 0; i < 60 && !reqs; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (i > 0 && i % 12 === 0) await processIncomingText(UA, "补充一点：希望对方在北京");
    const [row] = await db.select().from(botUsers).where(eq(botUsers.externalUserid, UA));
    reqs = row?.requirements ?? null;
  }
  assert("requirements 已写入", Boolean(reqs));

  console.log("5) LLM 断网 → 闲聊静默降级（不抛错、无回复）");
  // 用一个无配对的绑定用户走闲聊路径（有配对且在传话期的消息会走传话）
  await db.insert(profiles).values({ sessionId: "test-session-c", name: "测试丙", wechat: "wx_test_c", phone: "", gender: "女", birthYear: 1998, city: "北京", gradClass: "2016届2班", intro: "测试用介绍，三十个字三十个字三十个字三十个字。", consentAt: new Date() });
  await processIncomingText("TEST_U_C", "测试丙 wx_test_c");
  process.env.LLM_API_KEY = "fake-key";
  process.env.LLM_BASE_URL = "http://127.0.0.1:1";
  const before = (await getDb().select().from(kfMessages).where(eq(kfMessages.externalUserid, "TEST_U_C"))).length;
  await processIncomingText("TEST_U_C", "随便聊聊天气");
  const after = (await getDb().select().from(kfMessages).where(eq(kfMessages.externalUserid, "TEST_U_C"))).length;
  assert("只记了用户消息，没有 bot 回复", after - before === 1);

  // 清理测试数据
  await db.delete(kfMessages).where(or(like(kfMessages.externalUserid, "TEST_U_%")));
  await db.delete(botUsers).where(or(like(botUsers.externalUserid, "TEST_U_%")));
  await db.delete(matches).where(eq(matches.reason, "测试配对"));
  await db.delete(profiles).where(or(eq(profiles.sessionId, "test-session-a"), eq(profiles.sessionId, "test-session-b"), eq(profiles.sessionId, "test-session-c")));

  console.log(`\n${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
