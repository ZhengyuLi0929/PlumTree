// 本地对话沙箱。走和线上相同的 processIncomingText，不调用企业微信。
// 只允许连本机数据库。运行：npm run db:up && 配置 .env 的 DATABASE_URL 后执行 npm run sandbox
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { and, eq, gt, or, sql } from "drizzle-orm";
import { processIncomingText } from "../api/lib/botBrain";
import { isoWeekKey } from "../api/lib/enroll";
import { env } from "../api/lib/env";
import { decryptText } from "../api/lib/fieldCrypto";
import { llmConfigured } from "../api/lib/llm";
import { ensureTable, getDb, hasDatabase } from "../api/queries/connection";
import { botUsers, kfMessages, matches, profiles } from "../db/schema";

const ME = "sandbox-me";
const PEER = "sandbox-peer";
const PEOPLE = {
  [ME]: { sessionId: "sandbox-session-me", name: "沙箱用户", wechat: "sandbox_wx", gender: "男" },
  [PEER]: { sessionId: "sandbox-session-peer", name: "沙箱对象", wechat: "sandbox_peer", gender: "女" },
} as const;

type Who = keyof typeof PEOPLE;

function assertLocalDb() {
  if (!hasDatabase()) {
    console.error("需要本地数据库。在这个目录执行 npm run db:up，再把 .env.example 里的 DATABASE_URL 抄进 .env。");
    process.exit(1);
  }
  let host = "";
  try {
    host = new URL(env.databaseUrl).hostname;
  } catch {
    console.error("DATABASE_URL 无法解析。");
    process.exit(1);
  }
  const local = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!local && process.env.SANDBOX_ALLOW_REMOTE !== "1") {
    console.error(`沙箱拒绝连接 ${host}，避免把测试对话写进线上库。请把 DATABASE_URL 指到 127.0.0.1:3307。`);
    process.exit(1);
  }
}

async function maxMsgId() {
  const [row] = await getDb().select({ id: sql<number | null>`max(${kfMessages.id})` }).from(kfMessages);
  return Number(row?.id ?? 0);
}

async function printNew(afterId: number) {
  const rows = await getDb().select().from(kfMessages).where(gt(kfMessages.id, afterId)).orderBy(kfMessages.id);
  for (const row of rows) {
    if (row.origin === "user") continue;
    const text = decryptText(row.content) ?? "";
    const who = row.externalUserid === ME ? "你" : row.externalUserid === PEER ? "沙箱对象" : row.externalUserid;
    const tag = row.origin === "relay" ? "传话记录" : "月老";
    console.log(`\n${tag} → ${who}\n${text}`);
  }
}

async function say(who: Who, text: string) {
  const before = await maxMsgId();
  await processIncomingText(who, text);
  await new Promise((r) => setTimeout(r, 400));
  await printNew(before);
}

async function ensurePeople() {
  const db = getDb();
  for (const person of Object.values(PEOPLE)) {
    const [existing] = await db.select().from(profiles).where(eq(profiles.sessionId, person.sessionId));
    if (existing) continue;
    await db.insert(profiles).values({
      sessionId: person.sessionId,
      name: person.name,
      wechat: person.wechat,
      phone: "",
      gender: person.gender,
      birthYear: person.gender === "男" ? 1996 : 1998,
      city: "北京",
      gradClass: "沙箱",
      intro: "本地沙箱账号，用来试月老怎么说话。",
      consentAt: new Date(),
    });
  }
}

async function isBound(who: Who) {
  const [row] = await getDb().select().from(botUsers).where(eq(botUsers.externalUserid, who));
  return Boolean(row?.profileId);
}

async function bindBoth() {
  if (!(await isBound(ME))) await say(ME, `${PEOPLE[ME].name} ${PEOPLE[ME].wechat}`);
  if (!(await isBound(PEER))) await say(PEER, `${PEOPLE[PEER].name} ${PEOPLE[PEER].wechat}`);
}

async function pair() {
  const db = getDb();
  const [man] = await db.select().from(profiles).where(eq(profiles.sessionId, PEOPLE[ME].sessionId));
  const [woman] = await db.select().from(profiles).where(eq(profiles.sessionId, PEOPLE[PEER].sessionId));
  const weekKey = isoWeekKey();
  const [existing] = await db
    .select()
    .from(matches)
    .where(and(eq(matches.weekKey, weekKey), eq(matches.reason, "沙箱配对"), or(eq(matches.state, "sent"), eq(matches.state, "chatting"), eq(matches.state, "confirmed"), eq(matches.state, "dating"))));
  if (!existing) {
    await db.insert(matches).values({
      weekKey,
      manProfileId: man.id,
      womanProfileId: woman.id,
      state: "sent",
      reason: "沙箱配对",
    });
  }
  process.env.BOT_FORCE_PHASE = "chatting";
  console.log("\n已配成一对，当前时段改为周三传话。你发的下一句会转给沙箱对象。用 /as peer 可以回一句。");
}

async function unpair() {
  await getDb().delete(matches).where(eq(matches.reason, "沙箱配对"));
  process.env.BOT_FORCE_PHASE = "idle";
  console.log("\n沙箱配对已去掉，回到和月老闲聊。");
}

async function reset() {
  const db = getDb();
  await db.delete(kfMessages).where(or(eq(kfMessages.externalUserid, ME), eq(kfMessages.externalUserid, PEER)));
  await db.delete(botUsers).where(or(eq(botUsers.externalUserid, ME), eq(botUsers.externalUserid, PEER)));
  await db.delete(matches).where(eq(matches.reason, "沙箱配对"));
  process.env.BOT_FORCE_PHASE = "idle";
  console.log("\n沙箱对话已清空，重新绑定。");
  await bindBoth();
}

function help() {
  console.log(`
直接打字就是在跟月老说话。
/phase idle|chatting|dating|feedback   切换本周时段，不必等到周三
/pair          把沙箱里的两个人配成一对，并进入传话
/unpair        取消这对，回到闲聊
/as me|peer    换成另一个人发消息
/reset         清空沙箱对话并重新绑定
/help
/quit
`);
}

async function main() {
  process.env.BOT_SANDBOX = "1";
  if (!process.env.BOT_FORCE_PHASE) process.env.BOT_FORCE_PHASE = "idle";
  assertLocalDb();
  await ensureTable();
  await ensurePeople();

  console.log(llmConfigured() ? "大模型：使用 .env 里的 LLM_API_KEY。" : "大模型：未配置 LLM_API_KEY，闲聊只会回占位句。把 key 写进 .env 再开一次，才能听月老真正怎么说。");
  console.log(`时段：${process.env.BOT_FORCE_PHASE}。企业微信不会收到这些消息。`);
  help();
  await bindBoth();

  let who: Who = ME;
  const rl = readline.createInterface({ input, output });
  while (true) {
    let line = "";
    try {
      line = (await rl.question(`\n${who === ME ? "你" : "沙箱对象"} > `)).trim();
    } catch {
      break;
    }
    if (!line) continue;
    if (line === "/quit") break;
    if (line === "/help") {
      help();
      continue;
    }
    if (line === "/pair") {
      await pair();
      continue;
    }
    if (line === "/unpair") {
      await unpair();
      continue;
    }
    if (line === "/reset") {
      await reset();
      who = ME;
      continue;
    }
    if (line.startsWith("/phase ")) {
      const phase = line.slice(7).trim();
      if (phase !== "idle" && phase !== "chatting" && phase !== "dating" && phase !== "feedback") {
        console.log("只能是 idle、chatting、dating、feedback。");
        continue;
      }
      process.env.BOT_FORCE_PHASE = phase;
      console.log(`时段改为 ${phase}。`);
      continue;
    }
    if (line.startsWith("/as ")) {
      const next = line.slice(4).trim();
      if (next !== "me" && next !== "peer") {
        console.log("用 /as me 或 /as peer。");
        continue;
      }
      who = next === "me" ? ME : PEER;
      continue;
    }
    if (line.startsWith("/")) {
      console.log("未知命令。输入 /help 看命令。");
      continue;
    }
    await say(who, line);
  }
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
