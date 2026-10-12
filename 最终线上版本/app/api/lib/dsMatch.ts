// DeepSeek 匹配管线（从 deskcupid-ai-matching 移植进主应用，随部署上线）。
// 流程：读库 → 去重 → 硬过滤（异地/同班）→ 代号化脱敏 → DeepSeek 三轮打分 → 局部/全局最优。
import { eq } from "drizzle-orm";
import { profiles, settings } from "../../db/schema";
import { ensureTable, getDb } from "../queries/connection";
import { chat } from "./llm";
import { logCron } from "./botStore";

// ===== 键值配置 =====
export async function getSetting(key: string): Promise<string | null> {
  await ensureTable();
  const [row] = await getDb().select().from(settings).where(eq(settings.key, key));
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await ensureTable();
  await getDb()
    .insert(settings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

export const DS_PROMPT_KEY = "dsMatch:prompt";
export const DS_RESULT_KEY = "dsMatch:lastResult";

export const DEFAULT_DS_PROMPT = `你在做一场校友配对的「谈恋爱打分」。你必须完全代入 {role_label}（代号 {self_id}）。
你不知道任何人的真实姓名，也不许猜测姓名。对方只用代号。

## 你的资料
{self_card}

## 候选对象
下面每个人都已经通过硬规则：同城、不同班。不要再因为城市或同班加减分。
{candidates}

## 你要做的事
对每一位候选人打三次分，每次都是 0 到 100 的整数，并且每一次都必须写一句中文理由（20–60 字）。理由要引用对方或你自己资料里的原话/事实，方便人类微调提示词。

三次分别是：
1. r1 初见：第一眼会不会想认识
2. r2 相处一个月：日常能不能过
3. r3 认真长期：要不要把关系当真

三次分数不要故意打成一样。资料几乎空白时，三次都落在 42–58，并在理由里写「资料不足」。
对方踩了你写明的雷区（身高必须更高、不抽烟不喝酒、不要律师/公务员/文史哲、拒绝冷暴力等），r3 打到 0–29，并在理由里写踩了哪条。
「对对方的硬要求」若写明（最低身高、出生年范围、是否接受异地），候选人不满足时按踩雷区处理，r3 打到 0–29 并写明是哪条。
「恋爱维度」是 51 题测评算出的百分比（如 亲密距离 融合72%/独立28%），可作参考；但不要在理由里提及或猜测恋爱人格四字母代码。不要编造资料里没有的事实。

## 只输出 JSON
{"self":"SELF_ID","scores":[{"them":"对方代号","r1":0,"r1_why":"初见理由","r2":0,"r2_why":"相处一个月理由","r3":0,"r3_why":"认真长期理由"}]}
scores 必须覆盖上面每一位候选人，一个不能少。把 SELF_ID 换成你的代号。`;

// ===== 类型 =====
type ProfileRow = typeof profiles.$inferSelect;

export type MaskedCard = {
  id: string;
  gender: string;
  birthYear: number | null;
  heightCm: number | null;
  mbti: string;
  job: string;
  prefMinHeight: number | null;
  prefBirthFrom: number | null;
  prefBirthTo: number | null;
  acceptDistance: string;
  intro: string;
  expectation: string;
  value: string;
};

export type PoolData = {
  men: MaskedCard[];
  women: MaskedCard[];
  eligible: { man: string; woman: string }[];
  skipped: { man: string; woman: string; reason: string }[];
  droppedDuplicates: { name: string; keptWechat: string; droppedWechat: string }[];
  idMap: Record<string, { name: string; city: string; gradClass: string; location: string; classKey: string | null }>;
};

export type SideScore = { rounds: number[]; reasons: string[] };

export type MatchResult = {
  ranAt: string;
  eligibleCount: number;
  globalSum: number;
  droppedDuplicates: PoolData["droppedDuplicates"];
  skippedCount: { 异地: number; 同班: number };
  globalPairs: { man: string; woman: string; manSat: number; womanSat: number; harmony: number; manReasons: string[]; womanReasons: string[] }[];
  localMen: { person: string; best: string | null; harmony: number; manSat: number; womanSat: number; manReasons: string[]; womanReasons: string[] }[];
  localWomen: { person: string; best: string | null; harmony: number; manSat: number; womanSat: number; manReasons: string[]; womanReasons: string[] }[];
  unmatchedMen: string[];
  unmatchedWomen: string[];
};

// ===== 去重（同 enrich.py） =====
function normWechat(raw: string | null | undefined) {
  return (raw ?? "").replace(/\s+/g, "").trim().toLowerCase();
}

function locationBucket(city: string | null | undefined): string {
  const text = city ?? "";
  if (/(瑞士|加拿大|美国|新加坡|滑铁卢|纳沙泰尔)/.test(text)) return "海外长期";
  if (text.includes("香港") && !text.includes("北京")) return "香港";
  if (text.includes("上海")) return "上海";
  if (text.includes("昆明")) return "昆明";
  if (text.includes("北京") || text.includes("温哥华")) return "北京";
  if (text.includes("合肥")) return "合肥";
  return text.trim() || "未知";
}

function classKeyOf(gradClass: string | null | undefined): string | null {
  const text = (gradClass ?? "").replace(/\s+/g, "");
  if (!text) return null;
  let m = text.match(/(20\d{2})[届年]?(\d{1,2})班/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
  m = text.match(/^(20\d{2})(\d{1,2})$/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
  return null;
}

function redactText(text: string, people: { name: string; code: string }[]) {
  let out = text;
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    if (p.name) out = out.split(p.name).join(p.code);
  }
  return out;
}

export function preparePoolData(rows: ProfileRow[]): PoolData {
  // 1. 按微信号去重（同人取 id 最大），再按姓名合并微信打错的重复
  const byKey = new Map<string, ProfileRow>();
  for (const r of rows) {
    const key = normWechat(r.wechat) || `name:${r.name.trim()}`;
    const prev = byKey.get(key);
    if (!prev || r.id > prev.id) byKey.set(key, r);
  }
  const byName = new Map<string, string[]>();
  for (const [key, r] of byKey) {
    const name = r.name.trim();
    if (!name) continue;
    byName.set(name, [...(byName.get(name) ?? []), key]);
  }
  const droppedDuplicates: PoolData["droppedDuplicates"] = [];
  for (const [name, keys] of byName) {
    if (keys.length < 2) continue;
    const sorted = keys.map((k) => byKey.get(k)!).sort((a, b) => b.id - a.id);
    for (const loser of sorted.slice(1)) {
      const key = normWechat(loser.wechat) || `name:${loser.name.trim()}`;
      byKey.delete(key);
      droppedDuplicates.push({
        name,
        keptWechat: sorted[0].wechat,
        droppedWechat: loser.wechat,
      });
    }
  }

  const unique = [...byKey.values()].sort((a, b) => (a.gender !== "男" ? 1 : 0) - (b.gender !== "男" ? 1 : 0) || a.id - b.id);
  const men = unique.filter((r) => r.gender === "男");
  const women = unique.filter((r) => r.gender === "女");

  const idOf = new Map<number, string>();
  men.forEach((r, i) => idOf.set(r.id, `M${String(i).padStart(2, "0")}`));
  women.forEach((r, i) => idOf.set(r.id, `W${String(i).padStart(2, "0")}`));

  const allPeople = unique.map((r) => ({ name: r.name.trim(), code: idOf.get(r.id)! }));
  const idMap: PoolData["idMap"] = {};
  for (const r of unique) {
    idMap[idOf.get(r.id)!] = {
      name: r.name,
      city: r.city ?? "",
      gradClass: r.gradClass ?? "",
      location: locationBucket(r.city),
      classKey: classKeyOf(r.gradClass),
    };
  }

  const toCard = (r: ProfileRow): MaskedCard => ({
    id: idOf.get(r.id)!,
    gender: r.gender,
    birthYear: r.birthYear,
    heightCm: r.height,
    mbti: r.mbti ?? "",
    job: r.job ?? "",
    prefMinHeight: r.prefMinHeight,
    prefBirthFrom: r.prefBirthFrom,
    prefBirthTo: r.prefBirthTo,
    acceptDistance: r.acceptDistance ?? "",
    intro: redactText(r.intro ?? "", allPeople),
    expectation: redactText(r.expectation ?? "", allPeople),
    value: redactText(r.value ?? "", allPeople),
  });

  const menCards = men.map(toCard);
  const womenCards = women.map(toCard);
  const eligible: PoolData["eligible"] = [];
  const skipped: PoolData["skipped"] = [];
  for (const m of menCards) {
    for (const w of womenCards) {
      const mi = idMap[m.id];
      const wi = idMap[w.id];
      const mn = mi.name, wn = wi.name;
      if (mi.location !== wi.location) {
        skipped.push({ man: mn, woman: wn, reason: "异地" });
        continue;
      }
      if (mi.classKey && wi.classKey && mi.classKey === wi.classKey) {
        skipped.push({ man: mn, woman: wn, reason: "同班" });
        continue;
      }
      eligible.push({ man: m.id, woman: w.id });
    }
  }
  return { men: menCards, women: womenCards, eligible, skipped, droppedDuplicates, idMap };
}

// ===== 打分 =====
function prefText(card: MaskedCard) {
  const parts: string[] = [];
  if (card.prefMinHeight) parts.push(`身高≥${card.prefMinHeight}cm`);
  if (card.prefBirthFrom || card.prefBirthTo) parts.push(`出生年 ${card.prefBirthFrom ?? "不限"}–${card.prefBirthTo ?? "不限"}`);
  if (card.acceptDistance) parts.push(`异地：${card.acceptDistance}`);
  return parts.length ? parts.join("；") : "未填";
}

function cardText(card: MaskedCard) {
  return [
    `代号: ${card.id}`,
    `性别: ${card.gender}`,
    `出生年: ${card.birthYear ?? "未填"}`,
    `身高: ${card.heightCm ? `${card.heightCm}cm` : "未填"}`,
    `MBTI: ${card.mbti || "未填"}`,
    `职业: ${card.job || "未填"}`,
    `对对方的硬要求: ${prefText(card)}`,
    `自我介绍: ${card.intro || "（空）"}`,
    `理想型: ${card.expectation || "（空）"}`,
    `一段关系里最看重: ${card.value || "（空）"}`,
  ].join("\n");
}

function parseJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) throw new SyntaxError("no json object");
  let depth = 0, inStr = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new SyntaxError("unterminated json");
}

type DsScoreResponse = {
  scores?: { them?: string; r1?: number; r2?: number; r3?: number; r1_why?: string; r2_why?: string; r3_why?: string }[];
};

const BATCH = 8;
const CONCURRENCY = 8;

export async function scorePool(
  pool: PoolData,
  promptTemplate: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, Map<string, SideScore>>> {
  const men = new Map(pool.men.map((c) => [c.id, c]));
  const women = new Map(pool.women.map((c) => [c.id, c]));
  const tasks: { role: string; self: MaskedCard; candidates: MaskedCard[] }[] = [];
  const byMan = new Map<string, string[]>(pool.men.map((c) => [c.id, []]));
  const byWoman = new Map<string, string[]>(pool.women.map((c) => [c.id, []]));
  for (const e of pool.eligible) {
    byMan.get(e.man)!.push(e.woman);
    byWoman.get(e.woman)!.push(e.man);
  }
  for (const [mid, wids] of byMan) {
    if (wids.length) tasks.push({ role: "男生", self: men.get(mid)!, candidates: wids.map((w) => women.get(w)!) });
  }
  for (const [wid, mids] of byWoman) {
    if (mids.length) tasks.push({ role: "女生", self: women.get(wid)!, candidates: mids.map((m) => men.get(m)!) });
  }

  const total = tasks.length;
  let done = 0;
  const results = new Map<string, Map<string, SideScore>>();

  async function runTask(task: (typeof tasks)[number]) {
    const out = new Map<string, SideScore>();
    for (let start = 0; start < task.candidates.length; start += BATCH) {
      const batch = task.candidates.slice(start, start + BATCH);
      const prompt = promptTemplate
        .replace("{role_label}", task.role)
        .replace("{self_id}", task.self.id)
        .replace("{self_card}", cardText(task.self))
        .replace("{candidates}", batch.map(cardText).join("\n\n"));
      const expected = batch.map((c) => c.id);
      let batchOut: Map<string, SideScore> | null = null;
      for (let attempt = 0; attempt < 3 && !batchOut; attempt++) {
        try {
          const text = await chat([
            { role: "system", content: "只输出合法 JSON 对象。不要输出姓名。" },
            { role: "user", content: prompt },
          ], { json: true, timeoutMs: 120_000 });
          const parsed = parseJsonObject(text) as DsScoreResponse;
          const map = new Map<string, SideScore>();
          for (const row of parsed.scores ?? []) {
            const them = typeof row.them === "string" ? row.them.trim() : "";
            if (!them) continue;
            map.set(them, {
              rounds: [row.r1 ?? 0, row.r2 ?? 0, row.r3 ?? 0].map((n) => Math.max(0, Math.min(100, Math.round(n)))),
              reasons: [row.r1_why ?? "", row.r2_why ?? "", row.r3_why ?? ""].map(String),
            });
          }
          // 校验：候选一个不少、理由不为空，否则重试
          const complete = expected.every((id) => map.has(id)) && [...map.values()].every((s) => s.reasons.every((r) => r.trim().length > 0));
          if (complete) batchOut = map;
        } catch {
          batchOut = null;
        }
      }
      if (!batchOut) throw new Error(`${task.self.id} 打分连续失败`);
      for (const [k, v] of batchOut) out.set(k, v);
    }
    results.set(task.self.id, out);
    done += 1;
    onProgress?.(done, total);
  }

  // 简单并发池
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
    while (queue.length) {
      const task = queue.shift()!;
      await runTask(task);
    }
  });
  await Promise.all(workers);
  return results;
}

// ===== 聚合 =====
function mean(xs: number[]) {
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : 0;
}

function hungarianMaximize(weights: number[][]): [number, number][] {
  const nRow = weights.length;
  const nCol = weights[0]?.length ?? 0;
  const n = Math.max(nRow, nCol);
  const maxW = Math.max(0, ...weights.flat());
  const cost = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => maxW - (i < nRow && j < nCol ? weights[i][j] : 0)));
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const pairs: [number, number][] = [];
  for (let j = 1; j <= n; j++) {
    const i = p[j];
    if (i >= 1 && i <= nRow && j >= 1 && j <= nCol) pairs.push([i - 1, j - 1]);
  }
  return pairs;
}

export function aggregateResults(pool: PoolData, scores: Map<string, Map<string, SideScore>>): MatchResult {
  const idMap = pool.idMap;
  const eligible = new Set(pool.eligible.map((e) => `${e.man}|${e.woman}`));
  const pairs = new Map<string, { manSat: number; womanSat: number; harmony: number; manReasons: string[]; womanReasons: string[] }>();
  const missing: string[] = [];
  for (const key of eligible) {
    const [mid, wid] = key.split("|");
    const m = scores.get(mid)?.get(wid);
    const w = scores.get(wid)?.get(mid);
    if (!m || !w) { missing.push(key); continue; }
    const manSat = mean(m.rounds);
    const womanSat = mean(w.rounds);
    pairs.set(key, {
      manSat, womanSat,
      harmony: Math.round(((manSat + womanSat) / 2) * 100) / 100,
      manReasons: m.reasons,
      womanReasons: w.reasons,
    });
  }
  if (missing.length) throw new Error(`缺 ${missing.length} 对评分，如 ${missing.slice(0, 3).join("、")}`);

  const BAN = -10000;
  const menIds = pool.men.map((c) => c.id);
  const womenIds = pool.women.map((c) => c.id);
  const weight = menIds.map((mid) => womenIds.map((wid) => pairs.get(`${mid}|${wid}`)?.harmony ?? BAN));
  const assignment = hungarianMaximize(weight);
  const usedM = new Set<string>(), usedW = new Set<string>();
  const globalPairs: MatchResult["globalPairs"] = [];
  let globalSum = 0;
  for (const [i, j] of assignment) {
    if (weight[i][j] <= BAN / 2) continue;
    const mid = menIds[i], wid = womenIds[j];
    const p = pairs.get(`${mid}|${wid}`)!;
    globalPairs.push({ man: idMap[mid].name, woman: idMap[wid].name, ...p });
    usedM.add(idMap[mid].name);
    usedW.add(idMap[wid].name);
    globalSum += p.harmony;
  }
  globalPairs.sort((a, b) => b.harmony - a.harmony);

  const localOf = (selfId: string, selfIsMan: boolean) => {
    const cands = pool.eligible
      .filter((e) => (selfIsMan ? e.man === selfId : e.woman === selfId))
      .map((e) => {
        const key = selfIsMan ? `${e.man}|${e.woman}` : `${e.man}|${e.woman}`;
        return { key, other: selfIsMan ? e.woman : e.man, p: pairs.get(key)! };
      })
      .filter((x) => x.p)
      .sort((a, b) => (selfIsMan ? b.p.manSat - a.p.manSat : b.p.womanSat - a.p.womanSat) || b.p.harmony - a.p.harmony);
    const top = cands[0];
    if (!top) return null;
    return { best: idMap[top.other].name, ...top.p };
  };

  const localMen = menIds.map((mid) => {
    const top = localOf(mid, true);
    return { person: idMap[mid].name, best: top?.best ?? null, harmony: top?.harmony ?? 0, manSat: top?.manSat ?? 0, womanSat: top?.womanSat ?? 0, manReasons: top?.manReasons ?? [], womanReasons: top?.womanReasons ?? [] };
  });
  const localWomen = womenIds.map((wid) => {
    const top = localOf(wid, false);
    return { person: idMap[wid].name, best: top?.best ?? null, harmony: top?.harmony ?? 0, manSat: top?.manSat ?? 0, womanSat: top?.womanSat ?? 0, manReasons: top?.manReasons ?? [], womanReasons: top?.womanReasons ?? [] };
  });

  return {
    ranAt: new Date().toISOString(),
    eligibleCount: pairs.size,
    globalSum: Math.round(globalSum * 100) / 100,
    droppedDuplicates: pool.droppedDuplicates,
    skippedCount: {
      异地: pool.skipped.filter((s) => s.reason === "异地").length,
      同班: pool.skipped.filter((s) => s.reason === "同班").length,
    },
    globalPairs,
    localMen,
    localWomen,
    unmatchedMen: menIds.filter((id) => !usedM.has(idMap[id].name)).map((id) => idMap[id].name),
    unmatchedWomen: womenIds.filter((id) => !usedW.has(idMap[id].name)).map((id) => idMap[id].name),
  };
}

// ===== 任务执行（后台 job） =====
type Job = { state: "idle" | "running" | "done" | "error"; done: number; total: number; startedAt: number; error?: string };
const job: Job = { state: "idle", done: 0, total: 0, startedAt: 0 };

export function matchJobStatus() {
  return { ...job };
}

export async function runDeepseekMatch(): Promise<void> {
  if (job.state === "running") throw new Error("匹配任务正在运行中");
  job.state = "running";
  job.done = 0;
  job.total = 0;
  job.startedAt = Date.now();
  job.error = undefined;
  try {
    const prompt = (await getSetting(DS_PROMPT_KEY)) ?? DEFAULT_DS_PROMPT;
    await ensureTable();
    const db = getDb();
    const rows = await db.select().from(profiles);
    const pool = preparePoolData(rows);
    const scores = await scorePool(pool, prompt, (done, total) => {
      job.done = done;
      job.total = total;
    });
    const result = aggregateResults(pool, scores);
    await setSetting(DS_RESULT_KEY, JSON.stringify(result));
    await logCron("dsMatch.done", { eligible: result.eligibleCount, pairs: result.globalPairs.length, sum: result.globalSum });
    job.state = "done";
  } catch (err) {
    job.state = "error";
    job.error = err instanceof Error ? err.message : String(err);
    await logCron("dsMatch.error", job.error);
  }
}
