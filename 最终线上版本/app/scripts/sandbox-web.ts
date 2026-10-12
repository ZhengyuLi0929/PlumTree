// 本地微信样式沙箱。走和线上相同的 processIncomingText，不调用企业微信。
// 只监听 127.0.0.1。运行：npm run sandbox:web 然后打开 http://127.0.0.1:4177/
import http from "node:http";
import { and, asc, eq, or } from "drizzle-orm";
import { processIncomingText } from "../api/lib/botBrain";
import { logKfMessage, updateMatchState } from "../api/lib/botStore";
import { isoWeekKey } from "../api/lib/enroll";
import { env } from "../api/lib/env";
import { decryptText } from "../api/lib/fieldCrypto";
import { llmConfigured } from "../api/lib/llm";
import { TPL } from "../api/lib/templates";
import { ensureTable, getDb, hasDatabase } from "../api/queries/connection";
import { botUsers, kfMessages, matches, profiles } from "../db/schema";

const PORT = 4177;
const ME = "sandbox-me";
const PEER = "sandbox-peer";
const PEOPLE = {
  [ME]: { key: "me" as const, sessionId: "sandbox-session-me", name: "沙箱用户", wechat: "sandbox_wx", gender: "男" },
  [PEER]: { key: "peer" as const, sessionId: "sandbox-session-peer", name: "沙箱对象", wechat: "sandbox_peer", gender: "女" },
};
type WhoKey = "me" | "peer";
const ID_OF: Record<WhoKey, string> = { me: ME, peer: PEER };

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
    console.error(`沙箱拒绝连接 ${host}，避免把测试对话写进线上库。`);
    process.exit(1);
  }
}

function whoId(key: string) {
  if (key !== "me" && key !== "peer") throw new Error("who 只能是 me 或 peer");
  return ID_OF[key];
}

async function ensurePeople() {
  const db = getDb();
  for (const [externalUserid, person] of Object.entries(PEOPLE) as [string, (typeof PEOPLE)[typeof ME]][]) {
    const [existingProfile] = await db.select().from(profiles).where(eq(profiles.sessionId, person.sessionId));
    if (!existingProfile) {
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
    const [profile] = await db.select().from(profiles).where(eq(profiles.sessionId, person.sessionId));
    const [bot] = await db.select().from(botUsers).where(eq(botUsers.externalUserid, externalUserid));
    if (!bot) {
      await db.insert(botUsers).values({ externalUserid, profileId: profile.id, name: `U${profile.id}` });
    } else if (bot.profileId !== profile.id) {
      await db.update(botUsers).set({ profileId: profile.id, name: `U${profile.id}` }).where(eq(botUsers.externalUserid, externalUserid));
    }
  }
}

function clock(value: Date | string | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

async function history(who: WhoKey) {
  const id = whoId(who);
  const rows = await getDb()
    .select()
    .from(kfMessages)
    .where(eq(kfMessages.externalUserid, id))
    .orderBy(asc(kfMessages.id));
  return rows.map((row) => ({
    id: row.id,
    kind: row.origin === "user" ? "me" : row.origin === "relay" ? "system" : "bot",
    text: decryptText(row.content) ?? "",
    time: clock(row.createdAt),
  }));
}

async function paired() {
  const weekKey = isoWeekKey();
  const [existing] = await getDb()
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.weekKey, weekKey),
        eq(matches.reason, "沙箱配对"),
        or(eq(matches.state, "sent"), eq(matches.state, "chatting"), eq(matches.state, "confirmed"), eq(matches.state, "dating")),
      ),
    );
  return Boolean(existing);
}

async function state() {
  return {
    phase: process.env.BOT_FORCE_PHASE || "idle",
    paired: await paired(),
    llm: llmConfigured(),
  };
}

async function pair() {
  const db = getDb();
  const [man] = await db.select().from(profiles).where(eq(profiles.sessionId, PEOPLE[ME].sessionId));
  const [woman] = await db.select().from(profiles).where(eq(profiles.sessionId, PEOPLE[PEER].sessionId));
  if (!man || !woman) throw new Error("沙箱报名不存在");
  if (!(await paired())) {
    await db.insert(matches).values({
      weekKey: isoWeekKey(),
      manProfileId: man.id,
      womanProfileId: woman.id,
      state: "sent",
      reason: "沙箱配对",
    });
  }
  process.env.BOT_FORCE_PHASE = "chatting";
  await announce("chatting");
}

async function push(externalUserid: string, text: string) {
  await logKfMessage({ externalUserid, origin: "bot", content: text });
}

async function announce(phase: string) {
  if (phase === "idle") {
    await push(ME, "这会儿先不排人。周三晚上我会主动来找你。");
    await push(PEER, "这会儿先不排人。周三晚上我会主动来找你。");
    return;
  }
  if (phase === "chatting") {
    if (!(await paired())) {
      const text = "周三了。这周还没排到人，所以没有介绍。";
      await push(ME, text);
      await push(PEER, text);
      return;
    }
    const db = getDb();
    const [me] = await db.select().from(profiles).where(eq(profiles.sessionId, PEOPLE[ME].sessionId));
    const [peer] = await db.select().from(profiles).where(eq(profiles.sessionId, PEOPLE[PEER].sessionId));
    await push(ME, TPL.airdrop(`${peer.birthYear} 年生，${peer.city}。推荐理由：沙箱配对，用来试周三的主动介绍。`));
    await push(PEER, TPL.airdrop(`${me.birthYear} 年生，${me.city}。推荐理由：沙箱配对，用来试周三的主动介绍。`));
    return;
  }
  if (phase === "dating") {
    await push(ME, TPL.confirmDeadline);
    await push(PEER, TPL.confirmDeadline);
    return;
  }
  const weekKey = isoWeekKey();
  const [match] = await getDb()
    .select()
    .from(matches)
    .where(and(eq(matches.weekKey, weekKey), eq(matches.reason, "沙箱配对")));
  if (!match || match.state === "cancelled" || match.state === "declined") {
    const text = "这周没有要回访的约会。";
    await push(ME, text);
    await push(PEER, text);
    return;
  }
  if (match.state !== "dating") await updateMatchState(match.id, "dating");
  await push(ME, TPL.feedbackAsk);
  await push(PEER, TPL.feedbackAsk);
}

async function unpair() {
  await getDb().delete(matches).where(eq(matches.reason, "沙箱配对"));
  process.env.BOT_FORCE_PHASE = "idle";
}

async function reset() {
  const db = getDb();
  await db.delete(kfMessages).where(or(eq(kfMessages.externalUserid, ME), eq(kfMessages.externalUserid, PEER)));
  await db.delete(botUsers).where(or(eq(botUsers.externalUserid, ME), eq(botUsers.externalUserid, PEER)));
  await db.delete(matches).where(eq(matches.reason, "沙箱配对"));
  process.env.BOT_FORCE_PHASE = "idle";
  await ensurePeople();
}

async function readBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100_000) throw new Error("请求太大");
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const raw = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(raw) });
  res.end(raw);
}

async function main() {
  process.env.BOT_SANDBOX = "1";
  if (!process.env.BOT_FORCE_PHASE) process.env.BOT_FORCE_PHASE = "idle";
  assertLocalDb();
  await ensureTable();
  await reset();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(PAGE);
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/state") {
        const who = (url.searchParams.get("who") || "me") as WhoKey;
        sendJson(res, 200, { ...(await state()), messages: await history(who) });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/send") {
        const body = await readBody(req);
        const who = String(body.who || "me") as WhoKey;
        const text = String(body.text || "").trim();
        if (!text) {
          sendJson(res, 400, { error: "先写点什么" });
          return;
        }
        await processIncomingText(whoId(who), text);
        sendJson(res, 200, { ...(await state()), messages: await history(who) });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/phase") {
        const body = await readBody(req);
        const phase = String(body.phase || "");
        if (phase !== "idle" && phase !== "chatting" && phase !== "dating" && phase !== "feedback") {
          sendJson(res, 400, { error: "时段不对" });
          return;
        }
        process.env.BOT_FORCE_PHASE = phase;
        await announce(phase);
        const who = (String(body.who || "me")) as WhoKey;
        sendJson(res, 200, { ...(await state()), messages: await history(who === "peer" ? "peer" : "me") });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/pair") {
        await pair();
        sendJson(res, 200, await state());
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/unpair") {
        await unpair();
        sendJson(res, 200, await state());
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/reset") {
        await reset();
        sendJson(res, 200, { ...(await state()), messages: await history("me") });
        return;
      }
      sendJson(res, 404, { error: "没有这个地址" });
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: err instanceof Error ? err.message : "沙箱出错" });
    }
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`月老沙箱 http://127.0.0.1:${PORT}/`);
    console.log(llmConfigured() ? "大模型：使用 .env 里的密钥。" : "大模型：未配置，闲聊只会回占位句。");
    console.log("企业微信不会收到这些消息。");
  });
}

const PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>月老沙箱</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: #d5d5d5; color: #111; font: 16px/1.45 -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif; }
  .desk { min-height: 100vh; display: flex; justify-content: center; gap: 28px; padding: 28px 20px; align-items: flex-start; }
  .phone { width: 390px; height: min(820px, calc(100vh - 56px)); background: #ededed; border: 1px solid #c8c8c8; border-radius: 24px; display: flex; flex-direction: column; overflow: hidden; }
  .nav { height: 58px; display: flex; align-items: center; justify-content: center; position: relative; background: #ededed; border-bottom: 1px solid #d6d6d6; flex: none; }
  .nav b { font-size: 17px; font-weight: 600; }
  .nav small { display: block; text-align: center; color: #888; font-size: 11px; font-weight: 400; }
  .thread { flex: 1; overflow-y: auto; padding: 12px 0 8px; }
  .time { text-align: center; color: #b2b2b2; font-size: 12px; margin: 8px 0; }
  .row { display: flex; gap: 8px; margin: 8px 12px; align-items: flex-start; }
  .row.me { flex-direction: row-reverse; }
  .ava { width: 40px; height: 40px; border-radius: 4px; background: #f2f2f2; display: grid; place-items: center; font-size: 14px; flex: none; border: 1px solid #e4e4e4; }
  .row.me .ava { background: #95ec69; border-color: #86d85c; }
  .bubble { max-width: 230px; padding: 9px 12px; border-radius: 4px; background: #fff; white-space: pre-wrap; word-break: break-word; }
  .row.me .bubble { background: #95ec69; }
  .sys { text-align: center; color: #888; font-size: 12px; margin: 10px 40px; }
  .typing { color: #888; font-size: 13px; margin: 4px 64px 10px; }
  .composer { background: #f7f7f7; border-top: 1px solid #dcdcdc; flex: none; }
  .bar { display: flex; gap: 8px; align-items: flex-end; padding: 8px; }
  .bar button.face, .bar button.send { border: 0; background: transparent; height: 36px; }
  .bar button.face { font-size: 22px; width: 36px; cursor: pointer; }
  textarea { flex: 1; border: 0; border-radius: 6px; resize: none; min-height: 36px; max-height: 96px; padding: 8px 10px; font: 16px/1.4 inherit; outline: none; }
  .bar button.send { background: #07c160; color: #fff; border-radius: 6px; padding: 0 14px; font-size: 15px; cursor: pointer; }
  .bar button.send:disabled { background: #c8c8c8; cursor: default; }
  .faces { display: none; grid-template-columns: repeat(8, 1fr); gap: 2px; padding: 8px; border-top: 1px solid #e5e5e5; background: #f7f7f7; max-height: 180px; overflow: auto; }
  .faces.open { display: grid; }
  .faces button { border: 0; background: transparent; font-size: 22px; height: 36px; cursor: pointer; border-radius: 6px; }
  .faces button:hover { background: #ececec; }
  .side { width: 300px; padding-top: 8px; }
  .side h1 { font-size: 20px; margin: 0 0 8px; }
  .side p { margin: 0 0 14px; color: #444; font-size: 14px; }
  .card { background: #fff; border: 1px solid #ddd; border-radius: 12px; padding: 14px; margin-bottom: 12px; }
  .card h2 { font-size: 13px; margin: 0 0 8px; color: #666; font-weight: 600; }
  .seg { display: flex; gap: 6px; }
  .seg button, .acts button { border: 1px solid #ddd; background: #fff; border-radius: 8px; padding: 8px 10px; cursor: pointer; font: inherit; }
  .seg button.on { background: #111; color: #fff; border-color: #111; }
  select { width: 100%; font: inherit; padding: 8px; border-radius: 8px; border: 1px solid #ddd; background: #fff; }
  .acts { display: flex; flex-direction: column; gap: 8px; }
  .acts button.danger { color: #9a3412; }
  @media (max-width: 800px) {
    .desk { flex-direction: column; align-items: center; }
    .phone { height: calc(100vh - 24px); }
    .side { width: 390px; }
  }
</style>
</head>
<body>
<div class="desk">
  <section class="phone">
    <header class="nav"><div><b id="title">月老</b><small id="subtitle">沙箱 · 不会发到企业微信</small></div></header>
    <div class="thread" id="thread"></div>
    <div class="composer">
      <div class="faces" id="faces"></div>
      <div class="bar">
        <button class="face" id="faceBtn" type="button" title="表情">☺</button>
        <textarea id="box" rows="1" placeholder="发消息"></textarea>
        <button class="send" id="send" type="button" disabled>发送</button>
      </div>
    </div>
  </section>
  <aside class="side">
    <h1>月老沙箱</h1>
    <p>这是本机页面，样子按微信聊天来。右边是你，左边是月老。改右边的时段后，月老会先发一条，不用你先开口。表情会原样发给代码里的月老。</p>
    <div class="card">
      <h2>当前微信</h2>
      <div class="seg">
        <button type="button" id="asMe" class="on">我</button>
        <button type="button" id="asPeer">对方</button>
      </div>
    </div>
    <div class="card">
      <h2>本周时段</h2>
      <select id="phase">
        <option value="idle">闲聊（默认）</option>
        <option value="chatting">周三周四 · 传话</option>
        <option value="dating">周五到周日 · 确认见面</option>
        <option value="feedback">周一周二 · 回访</option>
      </select>
    </div>
    <div class="card">
      <h2>配对</h2>
      <div class="acts">
        <button type="button" id="pairBtn">把这两个人配成一对</button>
        <button type="button" id="unpairBtn">取消配对，回到闲聊</button>
        <button type="button" id="resetBtn" class="danger">清空这段对话</button>
      </div>
      <p id="pairNote" style="margin-top:10px"></p>
    </div>
  </aside>
</div>
<script>
const FACES = ["😀","😁","😂","🤣","😊","😍","😘","😜","🤗","🤔","😅","😭","😡","😱","😴","🙄","😏","🥳","👍","👎","👏","🙏","❤️","💔","🌹","🌙","☕","🍺","🎁","🎉","👋","🤝","💪","🔥","✨","🙈"];
const WX = [["[微笑]","🙂"],["[撇嘴]","😒"],["[色]","😍"],["[发呆]","😳"],["[得意]","😎"],["[流泪]","😢"],["[害羞]","☺️"],["[闭嘴]","🤐"],["[睡]","😴"],["[大哭]","😭"],["[尴尬]","😅"],["[发怒]","😡"],["[调皮]","😜"],["[呲牙]","😁"],["[惊讶]","😮"],["[难过]","😞"],["[偷笑]","🤭"],["[疑问]","❓"],["[鼓掌]","👏"],["[坏笑]","😈"],["[委屈]","🥺"],["[亲亲]","😘"],["[玫瑰]","🌹"],["[爱心]","❤️"],["[强]","👍"],["[OK]","👌"],["[拥抱]","🤗"],["[握手]","🤝"]];
const thread = document.getElementById("thread");
const box = document.getElementById("box");
const send = document.getElementById("send");
const faces = document.getElementById("faces");
let who = "me";
let busy = false;

function renderFaces() {
  const all = [...WX.map(([code, face]) => ({ insert: code, show: face, title: code })), ...FACES.map((face) => ({ insert: face, show: face, title: face }))];
  faces.innerHTML = all.map((item) => '<button type="button" data-insert="' + item.insert.replaceAll('"', "&quot;") + '" title="' + item.title + '">' + item.show + "</button>").join("");
}
renderFaces();

function showFace(text) {
  let out = text;
  for (const [code, face] of WX) out = out.split(code).join(face);
  return out;
}

function paint(messages) {
  thread.innerHTML = "";
  let lastTime = "";
  for (const msg of messages) {
    if (msg.time && msg.time !== lastTime) {
      const t = document.createElement("div");
      t.className = "time";
      t.textContent = msg.time;
      thread.appendChild(t);
      lastTime = msg.time;
    }
    if (msg.kind === "system") {
      const s = document.createElement("div");
      s.className = "sys";
      s.textContent = showFace(msg.text);
      thread.appendChild(s);
      continue;
    }
    const row = document.createElement("div");
    row.className = "row " + (msg.kind === "me" ? "me" : "bot");
    const ava = document.createElement("div");
    ava.className = "ava";
    ava.textContent = msg.kind === "me" ? (who === "me" ? "我" : "对") : "月";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = showFace(msg.text);
    row.append(ava, bubble);
    thread.appendChild(row);
  }
  thread.scrollTop = thread.scrollHeight;
}

function setTyping(on) {
  document.getElementById("typing")?.remove();
  if (!on) return;
  const tip = document.createElement("div");
  tip.id = "typing";
  tip.className = "typing";
  tip.textContent = "对方正在输入…";
  thread.appendChild(tip);
  thread.scrollTop = thread.scrollHeight;
}

async function api(path, body) {
  const isRead = path.startsWith("/api/state");
  const res = await fetch(path, isRead ? undefined : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

function applyState(data) {
  document.getElementById("phase").value = data.phase;
  document.getElementById("pairNote").textContent = data.paired ? "这两个人本周已经配成一对。传话时段里，发出去的话会转给另一个人。" : "还没有配对。先闲聊，或点上面配成一对再测传话。";
  document.getElementById("subtitle").textContent = (data.llm ? "月老在线" : "未接大模型，只会回占位句") + " · 不会发到企业微信";
  if (data.messages) paint(data.messages);
}

async function load() {
  applyState(await api("/api/state?who=" + who));
}

document.getElementById("asMe").onclick = () => switchWho("me");
document.getElementById("asPeer").onclick = () => switchWho("peer");
function switchWho(next) {
  who = next;
  document.getElementById("asMe").classList.toggle("on", who === "me");
  document.getElementById("asPeer").classList.toggle("on", who === "peer");
  document.getElementById("title").textContent = who === "me" ? "月老" : "月老";
  load();
}
document.getElementById("phase").onchange = async (e) => {
  applyState(await api("/api/phase", { phase: e.target.value, who }));
};
document.getElementById("pairBtn").onclick = async () => { await api("/api/pair"); await load(); };
document.getElementById("unpairBtn").onclick = async () => { await api("/api/unpair"); await load(); };
document.getElementById("resetBtn").onclick = async () => {
  who = "me";
  document.getElementById("asMe").classList.add("on");
  document.getElementById("asPeer").classList.remove("on");
  try {
    applyState(await api("/api/reset"));
  } catch (err) {
    alert(err.message || "清空失败");
  }
};

function syncSend() { send.disabled = busy || !box.value.trim(); }
box.addEventListener("input", () => {
  box.style.height = "auto";
  box.style.height = Math.min(box.scrollHeight, 96) + "px";
  syncSend();
});
document.getElementById("faceBtn").onclick = () => faces.classList.toggle("open");
faces.onclick = (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const insert = btn.getAttribute("data-insert") || "";
  const start = box.selectionStart ?? box.value.length;
  const end = box.selectionEnd ?? box.value.length;
  box.value = box.value.slice(0, start) + insert + box.value.slice(end);
  box.focus();
  const pos = start + insert.length;
  box.setSelectionRange(pos, pos);
  syncSend();
};
async function submit() {
  const text = box.value.trim();
  if (!text || busy) return;
  busy = true;
  syncSend();
  box.value = "";
  box.style.height = "auto";
  faces.classList.remove("open");
  setTyping(true);
  try {
    applyState(await api("/api/send", { who, text }));
  } catch (err) {
    alert(err.message || "发送失败");
    await load();
  } finally {
    busy = false;
    setTyping(false);
    syncSend();
    box.focus();
  }
}
send.onclick = submit;
box.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
});
load();
</script>
</body>
</html>`;

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
