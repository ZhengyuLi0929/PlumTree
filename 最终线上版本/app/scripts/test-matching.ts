// T3 验收：匹配算法（20 假用户 + 性别倾斜 + 雷区 + 上周排除）+ 调度器完整周期（注入时间）。
// 运行：npm run db:up && npm run test:matching
import { eq, like, or } from "drizzle-orm";
import { computeMatches, type PoolUser } from "../api/lib/matching";
import { tick } from "../api/lib/scheduler";
import { isoWeekKey } from "../api/lib/enroll";
import { botUsers, kfMessages, matches, matchPool, cronLogs, profiles, weeklyCycles } from "../db/schema";
import { ensureTable, getDb, hasDatabase } from "../api/queries/connection";

let passed = 0;
let failed = 0;
function assert(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

function fakeUser(id: number, gender: "男" | "女", extra?: Partial<PoolUser>): PoolUser {
  return {
    profileId: id, name: `假人${id}`, gender, birthYear: 1996 + (id % 6), city: "北京",
    orgTag: "test", priority: 0, typeCode: ["FSRH", "FSPH", "IGRH", "IGPH"][id % 4],
    height: gender === "男" ? 172 + (id % 12) : 158 + (id % 12),
    job: "互联网", intro: `喜欢爬山和读书 ${id}`, expectation: `希望对方也喜欢爬山 ${id}`,
    value: "真诚", prefMinHeight: null, prefBirthFrom: null, prefBirthTo: null, acceptDistance: null,
    ...extra,
  };
}

function pureTests() {
  console.log("1) 男女各 10 人 → 10 对，无重复使用");
  const users = Array.from({ length: 20 }, (_, i) => fakeUser(i + 1, i % 2 === 0 ? "男" : "女"));
  const { pairs, unmatched } = computeMatches(users);
  const ids = new Set<number>();
  for (const p of pairs) { ids.add(p.man.profileId); ids.add(p.woman.profileId); }
  assert("10 对", pairs.length === 10);
  assert("无人重复配对", ids.size === 20);
  assert("每对有理由", pairs.every((p) => p.reason.length > 0));
  assert("无轮空", unmatched.length === 0);
  console.log("  示例理由:", pairs[0].reason);

  console.log("2) 性别倾斜 8 男 12 女 → 8 对，4 女轮空");
  const skew = [
    ...Array.from({ length: 8 }, (_, i) => fakeUser(i + 1, "男")),
    ...Array.from({ length: 12 }, (_, i) => fakeUser(101 + i, "女")),
  ];
  const r2 = computeMatches(skew);
  assert("8 对", r2.pairs.length === 8);
  assert("4 女轮空", r2.unmatched.length === 4 && r2.unmatched.every((u) => u.gender === "女"));

  console.log("3) 硬规则：女方身高下限 190 → 只有 190+ 男生可配");
  const picky = fakeUser(201, "女", { prefMinHeight: 190 });
  const men = [fakeUser(202, "男", { height: 175 }), fakeUser(203, "男", { height: 192 })];
  const r3 = computeMatches([picky, ...men]);
  assert("只配到 192", r3.pairs.length === 1 && r3.pairs[0].man.profileId === 203);

  console.log("4) 上周已配组合被排除");
  const four = [fakeUser(301, "男"), fakeUser(302, "男"), fakeUser(303, "女"), fakeUser(304, "女")];
  const first = computeMatches(four);
  const exclude = new Set(first.pairs.map((p) => `${p.man.profileId}:${p.woman.profileId}`));
  const second = computeMatches(four, { excludePairs: exclude });
  assert("第二周不再出现同样组合", second.pairs.every((p) => !exclude.has(`${p.man.profileId}:${p.woman.profileId}`)));

  console.log("5) 轮空优先：priority 高的人先进配对");
  const u5 = [fakeUser(401, "男"), fakeUser(402, "男"), fakeUser(403, "女")];
  u5[1].priority = 2; // 402 上周轮空
  const r5 = computeMatches(u5);
  assert("capacity=1 且 402 优先", r5.pairs.length === 1 && r5.pairs[0].man.profileId === 402);
}

async function schedulerTest() {
  if (!hasDatabase()) {
    console.log("（跳过调度器 DB 测试：未配置 DATABASE_URL）");
    return;
  }
  console.log("6) 调度器完整周期（注入时间：周三→周五→周一）");
  await ensureTable();
  const db = getDb();

  // 6 个测试用户入池（3 男 3 女，同 org_tag）
  const profs = [];
  for (let i = 0; i < 6; i++) {
    const gender = i % 2 === 0 ? "男" : "女";
    const res = await db.insert(profiles).values({
      sessionId: `sched-test-${i}`, name: `调度测试${i}`, wechat: `wx_sched_${i}`, phone: "",
      gender, birthYear: 1997, city: "北京", gradClass: "2016届1班",
      intro: "测试介绍三十个字测试介绍三十个字测试介绍三十个字", consentAt: new Date(),
    });
    profs.push({ id: Number(res[0].insertId), gender });
  }
  for (const p of profs) await db.insert(matchPool).values({ profileId: p.id, gender: p.gender, orgTag: "sched-test" });

  // 周三 20:30 CST = 12:30 UTC
  const wed = new Date("2026-09-23T12:30:00Z");
  const week = isoWeekKey(wed);
  assert("周三晚生成配对", (await tick(wed)) === "matched");
  const weekMatches = await db.select().from(matches).where(eq(matches.weekKey, week));
  assert("3 对待确认", weekMatches.length === 3 && weekMatches.every((m) => m.state === "pending_send"));
  assert("cron 日志已落", (await db.select().from(cronLogs)).length > 0);

  // 周五 00:30 CST = 周四 16:30 UTC（全部未确认 → 轮空）
  assert("周五确认截止", (await tick(new Date("2026-09-24T16:30:00Z"))) === "dating");
  const after = await db.select().from(matches).where(eq(matches.weekKey, week));
  assert("未确认全部轮空", after.every((m) => m.state === "cancelled"));
  const poolAfter = await db.select().from(matchPool).where(like(matchPool.orgTag, "sched-test"));
  assert("轮空用户 priority+1", poolAfter.every((p) => p.priority >= 1));

  // 周一 10:30 CST = 02:30 UTC
  assert("周一进入回访", (await tick(new Date("2026-09-28T02:30:00Z"))) === "feedback");

  // 清理
  await db.delete(matches).where(eq(matches.weekKey, week));
  await db.delete(matchPool).where(like(matchPool.orgTag, "sched-test"));
  await db.delete(weeklyCycles).where(eq(weeklyCycles.weekKey, week));
  await db.delete(cronLogs);
  await db.delete(profiles).where(like(profiles.sessionId, "sched-test-%"));
  await db.delete(kfMessages).where(like(kfMessages.externalUserid, "TEST_%"));
  await db.delete(botUsers).where(like(botUsers.externalUserid, "TEST_%"));
}

async function main() {
  pureTests();
  await schedulerTest();
  console.log(`\n${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
