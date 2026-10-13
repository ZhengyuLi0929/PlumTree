// DeepSeek 匹配管线 v2（从 deskcupid-ai-matching 移植并重写打分结构）。
// v2 变化：① 规则匹配先给每人预筛 topK 候选（零成本砍掉大部分对）；
// ② 打分按「对」调用（一次请求评一对的双方视角，JSON 小、几乎不失败、
// token 消耗约为 v1 的 1/10）；③ 单对失败不拖垮全局，结果里列失败清单。
import { eq, and } from "drizzle-orm";
import { profiles, matches, settings } from "../../db/schema";
import { ensureTable, getDb } from "../queries/connection";
import { chat } from "./llm";
import { logCron } from "./botStore";
import { isoWeekKey } from "./enroll";
import { scorePair, type PoolUser } from "./matching";

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

export const DS_PROMPT_KEY = "dsMatch:promptV2";
export const DS_RESULT_KEY = "dsMatch:lastResult";
export const DS_TUNABLES_KEY = "dsMatch:tunables";

export type DsTunables = { topK: number; concurrency: number };
export const DEFAULT_TUNABLES: DsTunables = { topK: 8, concurrency: 5 };

export async function getTunables(): Promise<DsTunables> {
  const raw = await getSetting(DS_TUNABLES_KEY);
  if (!raw) return DEFAULT_TUNABLES;
  try {
    const parsed = JSON.parse(raw) as Partial<DsTunables>;
    return {
      topK: Math.max(1, Math.min(30, parsed.topK ?? DEFAULT_TUNABLES.topK)),
      concurrency: Math.max(1, Math.min(10, parsed.concurrency ?? DEFAULT_TUNABLES.concurrency)),
    };
  } catch {
    return DEFAULT_TUNABLES;
  }
}

export const DEFAULT_DS_PROMPT = `你在做一场校友配对。给这一对分别从男方视角和女方视角打分（0–100 的整数），每一方打三轮：r1 初见（第一眼会不会想认识）、r2 相处一个月（日常能不能过）、r3 认真长期（要不要把关系当真）。每一轮都必须写一句中文理由（20–60 字），引用资料里的原话/事实，不要编造。
资料几乎空白时分数落在 42–58，并在理由里写「资料不足」。
若对方踩了资料里写明的雷区（最低身高、出生年范围、不接受异地等），那一方的 r3 打 0–29 并写明踩了哪条。
不要猜测或提及真实姓名，不要提恋爱人格四字母代码。

## 男方（代号 {man_id}）
{man_card}

## 女方（代号 {woman_id}）
{woman_card}

## 只输出 JSON
{"man":{"r1":0,"r1_why":"","r2":0,"r2_why":"","r3":0,"r3_why":""},"woman":{"r1":0,"r1_why":"","r2":0,"r2_why":"","r3":0,"r3_why":""}}`;

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
  typeCode: string | null;
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
  idMap: Record<string, { profileId: number; name: string; city: string; gradClass: string; location: string; classKey: string | null }>;
};

export type SideScore = { rounds: number[]; reasons: string[] };

export type MatchResult = {
  ranAt: string;
  eligibleCount: number;
  globalSum: number;
  droppedDuplicates: PoolData["droppedDuplicates"];
  skippedCount: { 异地: number; 同班: number };
  scoringFailures: string[];
  globalPairs: { man: string; woman: string; manSat: number; womanSat: number; harmony: number; manReasons: string[]; womanReasons: string[] }[];
  localMen: { person: string; best: string | null; harmony: number; manSat: number; womanSat: number; manReasons: string[]; womanReasons: string[] }[];
  localWomen: { person: string; best: string | null; harmony: number; manSat: number; womanSat: number; manReasons: string[]; womanReasons: string[] }[];
  unmatchedMen: string[];
  unmatchedWomen: string[];
};

// ===== 去重与硬过滤 =====
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

export function preparePoolData(rows: ProfileRow[], typeCodeOf: (sessionId: string) => string | null): PoolData {
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
      droppedDuplicates.push({ name, keptWechat: sorted[0].wechat, droppedWechat: loser.wechat });
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
      profileId: r.id,
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
    typeCode: typeCodeOf(r.sessionId),
    intro: redactText(r.intro ?? "", allPeople).slice(0, 160),
    expectation: redactText(r.expectation ?? "", allPeople).slice(0, 120),
    value: redactText(r.value ?? "", allPeople).slice(0, 80),
  });

  const menCards = men.map(toCard);
  const womenCards = women.map(toCard);
  const eligible: PoolData["eligible"] = [];
  const skipped: PoolData["skipped"] = [];
  for (const m of menCards) {
    for (const w of womenCards) {
      const mi = idMap[m.id];
      const wi = idMap[w.id];
      if (mi.location !== wi.location) {
        skipped.push({ man: mi.name, woman: wi.name, reason: "异地" });
        continue;
      }
      if (mi.classKey && wi.classKey && mi.classKey === wi.classKey) {
        skipped.push({ man: mi.name, woman: wi.name, reason: "同班" });
        continue;
      }
      eligible.push({ man: m.id, woman: w.id });
    }
  }
  return { men: menCards, women: womenCards, eligible, skipped, droppedDuplicates, idMap };
}

// ===== 规则预筛（零成本砍掉大部分对） =====
function ruleUser(card: MaskedCard, idMap: PoolData["idMap"]): PoolUser {
  return {
    profileId: idMap[card.id].profileId,
    name: idMap[card.id].name,
    gender: card.gender,
    birthYear: card.birthYear ?? 1997,
    city: idMap[card.id].location,
    orgTag: "ds",
    priority: 0,
    typeCode: card.typeCode,
    height: card.heightCm,
    job: card.job || null,
    intro: card.intro || null,
    expectation: card.expectation || null,
    value: card.value || null,
    prefMinHeight: card.prefMinHeight,
    prefBirthFrom: card.prefBirthFrom,
    prefBirthTo: card.prefBirthTo,
    acceptDistance: card.acceptDistance || null,
    chatText: null,
  };
}

/** 规则硬雷区过滤 + 每人按规则分预筛 topK。返回新的 eligible 与被规则硬雷区剔除的对。 */
export function prefilterEligible(pool: PoolData, topK: number): { eligible: PoolData["eligible"]; hardDropped: number } {
  const scored: { man: string; woman: string; score: number }[] = [];
  let hardDropped = 0;
  const menById = new Map(pool.men.map((c) => [c.id, c]));
  const womenById = new Map(pool.women.map((c) => [c.id, c]));
  for (const e of pool.eligible) {
    const m = menById.get(e.man)!;
    const w = womenById.get(e.woman)!;
    const s = scorePair(ruleUser(m, pool.idMap), ruleUser(w, pool.idMap));
    if (!s) { hardDropped++; continue; }
    scored.push({ man: e.man, woman: e.woman, score: s.score });
  }
  // 每人保留规则分最高的 topK 个候选（双向取并集）
  const keep = new Set<string>();
  const byMan = new Map<string, typeof scored>();
  const byWoman = new Map<string, typeof scored>();
  for (const s of scored) {
    byMan.set(s.man, [...(byMan.get(s.man) ?? []), s]);
    byWoman.set(s.woman, [...(byWoman.get(s.woman) ?? []), s]);
  }
  for (const list of [...byMan.values(), ...byWoman.values()]) {
    list.sort((a, b) => b.score - a.score);
    for (const s of list.slice(0, topK)) keep.add(`${s.man}|${s.woman}`);
  }
  return { eligible: scored.filter((s) => keep.has(`${s.man}|${s.woman}`)).map((s) => ({ man: s.man, woman: s.woman })), hardDropped };
}

// ===== 卡文本 =====
function prefText(card: MaskedCard) {
  const parts: string[] = [];
  if (card.prefMinHeight) parts.push(`身高≥${card.prefMinHeight}cm`);
  if (card.prefBirthFrom || card.prefBirthTo) parts.push(`出生年 ${card.prefBirthFrom ?? "不限"}–${card.prefBirthTo ?? "不限"}`);
  if (card.acceptDistance) parts.push(`异地：${card.acceptDistance}`);
  return parts.length ? parts.join("；") : "未填";
}

function cardText(card: MaskedCard) {
  return [
    `出生年: ${card.birthYear ?? "未填"}`,
    `身高: ${card.heightCm ? `${card.heightCm}cm` : "未填"}`,
    `MBTI: ${card.mbti || "未填"}`,
    `职业: ${card.job || "未填"}`,
    `对对方的硬要求: ${prefText(card)}`,
    `自我介绍: ${card.intro || "（空）"}`,
    `理想型: ${card.expectation || "（空）"}`,
    `最看重: ${card.value || "（空）"}`,
  ].join("\n");
}

// ===== 按对打分 =====
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

type PairScoreResponse = {
  man?: { r1?: number; r2?: number; r3?: number; r1_why?: string; r2_why?: string; r3_why?: string };
  woman?: { r1?: number; r2?: number; r3?: number; r1_why?: string; r2_why?: string; r3_why?: string };
};

function validSide(side: PairScoreResponse["man"]): boolean {
  if (!side) return false;
  const rounds = [side.r1, side.r2, side.r3];
  const reasons = [side.r1_why, side.r2_why, side.r3_why];
  return rounds.every((r) => typeof r === "number") && reasons.every((t) => typeof t === "string" && t.trim().length > 0);
}

function toSideScore(side: NonNullable<PairScoreResponse["man"]>): SideScore {
  return {
    rounds: [side.r1!, side.r2!, side.r3!].map((n) => Math.max(0, Math.min(100, Math.round(n)))),
    reasons: [side.r1_why!, side.r2_why!, side.r3_why!].map(String),
  };
}

const RETRY_BACKOFF = [2000, 5000, 10000];

export type PairScore = { man: SideScore; woman: SideScore };

export async function scorePairs(
  pool: PoolData,
  eligible: PoolData["eligible"],
  promptTemplate: string,
  concurrency: number,
  onProgress?: (done: number, total: number) => void,
  onError?: (label: string, err: unknown) => void,
): Promise<Map<string, PairScore>> {
  const menById = new Map(pool.men.map((c) => [c.id, c]));
  const womenById = new Map(pool.women.map((c) => [c.id, c]));
  const out = new Map<string, PairScore>();
  const total = eligible.length;
  let done = 0;
  const queue = [...eligible];

  async function runPair(e: PoolData["eligible"][number]) {
    const m = menById.get(e.man)!;
    const w = womenById.get(e.woman)!;
    const label = `${pool.idMap[m.id].name}×${pool.idMap[w.id].name}`;
    const prompt = promptTemplate
      .replace("{man_id}", m.id)
      .replace("{man_card}", cardText(m))
      .replace("{woman_id}", w.id)
      .replace("{woman_card}", cardText(w));
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(RETRY_BACKOFF[attempt - 1] ?? 8000);
      try {
        const text = await chat([
          { role: "system", content: "只输出合法 JSON 对象。不要输出姓名。" },
          { role: "user", content: prompt },
        ], { json: true, timeoutMs: 90_000 });
        const parsed = parseJsonObject(text) as PairScoreResponse;
        if (validSide(parsed.man) && validSide(parsed.woman)) {
          out.set(`${e.man}|${e.woman}`, { man: toSideScore(parsed.man!), woman: toSideScore(parsed.woman!) });
          break;
        }
        lastErr = new Error("JSON 缺字段或理由为空");
      } catch (err) {
        lastErr = err;
      }
    }
    if (!out.has(`${e.man}|${e.woman}`)) onError?.(label, lastErr);
    done += 1;
    onProgress?.(done, total);
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) await runPair(queue.shift()!);
  });
  await Promise.all(workers);
  return out;
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

export function aggregateResults(pool: PoolData, eligible: PoolData["eligible"], pairScores: Map<string, PairScore>, failures: string[]): MatchResult {
  const idMap = pool.idMap;
  const pairs = new Map<string, { manSat: number; womanSat: number; harmony: number; manReasons: string[]; womanReasons: string[] }>();
  for (const e of eligible) {
    const ps = pairScores.get(`${e.man}|${e.woman}`);
    if (!ps) continue; // 失败的对跳过，进 scoringFailures
    const manSat = mean(ps.man.rounds);
    const womanSat = mean(ps.woman.rounds);
    pairs.set(`${e.man}|${e.woman}`, {
      manSat, womanSat,
      harmony: Math.round(((manSat + womanSat) / 2) * 100) / 100,
      manReasons: ps.man.reasons,
      womanReasons: ps.woman.reasons,
    });
  }

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
    const cands = eligible
      .filter((e) => (selfIsMan ? e.man === selfId : e.woman === selfId))
      .map((e) => ({ other: selfIsMan ? e.woman : e.man, p: pairs.get(`${e.man}|${e.woman}`) }))
      .filter((x): x is { other: string; p: NonNullable<typeof x.p> } => Boolean(x.p))
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
    scoringFailures: failures,
    globalPairs,
    localMen,
    localWomen,
    unmatchedMen: menIds.filter((id) => !usedM.has(idMap[id].name)).map((id) => idMap[id].name),
    unmatchedWomen: womenIds.filter((id) => !usedW.has(idMap[id].name)).map((id) => idMap[id].name),
  };
}

// ===== 任务执行（后台 job） =====
type Job = { state: "idle" | "running" | "done" | "error"; done: number; total: number; startedAt: number; error?: string; errors: string[] };
const job: Job = { state: "idle", done: 0, total: 0, startedAt: 0, errors: [] };

export function matchJobStatus() {
  return { ...job, errors: [...job.errors] };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runDeepseekMatch(): Promise<void> {
  if (job.state === "running") throw new Error("匹配任务正在运行中");
  job.state = "running";
  job.done = 0;
  job.total = 0;
  job.startedAt = Date.now();
  job.error = undefined;
  job.errors = [];
  try {
    const prompt = (await getSetting(DS_PROMPT_KEY)) ?? DEFAULT_DS_PROMPT;
    const tunables = await getTunables();
    await ensureTable();
    const db = getDb();
    const rows = await db.select().from(profiles);
    const { responsesV3 } = await import("../../db/schema");
    const quizRows = await db.select().from(responsesV3);
    const bySession = new Map<string, string>();
    for (const r of quizRows) bySession.set(r.sessionId, r.typeCode);

    const pool = preparePoolData(rows, (sid) => bySession.get(sid) ?? null);
    const { eligible, hardDropped } = prefilterEligible(pool, tunables.topK);
    if (hardDropped > 0) job.errors.push(`规则硬雷区预筛掉 ${hardDropped} 对（不满足身高/年龄/异地要求）`);
    await logCron("dsMatch.prefilter", { before: pool.eligible.length, after: eligible.length, topK: tunables.topK });

    const pairScores = await scorePairs(
      pool,
      eligible,
      prompt,
      tunables.concurrency,
      (done, total) => {
        job.done = done;
        job.total = total;
      },
      (label, err) => {
        const msg = `${label}：${err instanceof Error ? err.message : String(err)}`;
        if (job.errors.length < 30) job.errors.push(msg);
      },
    );
    const result = aggregateResults(pool, eligible, pairScores, job.errors.slice(hardDropped > 0 ? 1 : 0));

    // AI 配对写回 matches 表（pending_send），接上空投/短信流程
    const weekKey = isoWeekKey();
    await db.delete(matches).where(and(eq(matches.weekKey, weekKey), eq(matches.state, "pending_send")));
    for (const p of result.globalPairs) {
      const man = Object.values(pool.idMap).find((x) => x.name === p.man);
      const woman = Object.values(pool.idMap).find((x) => x.name === p.woman);
      if (!man || !woman) continue;
      await db.insert(matches).values({
        weekKey,
        manProfileId: man.profileId,
        womanProfileId: woman.profileId,
        reason: `AI匹配 · 和谐 ${p.harmony}（男 ${p.manSat} / 女 ${p.womanSat}）`,
        state: "pending_send",
      });
    }

    await setSetting(DS_RESULT_KEY, JSON.stringify(result));
    await logCron("dsMatch.done", { eligible: result.eligibleCount, pairs: result.globalPairs.length, sum: result.globalSum, failures: result.scoringFailures.length });
    job.state = "done";
  } catch (err) {
    job.state = "error";
    job.error = err instanceof Error ? err.message : String(err);
    await logCron("dsMatch.error", { error: job.error, errors: job.errors });
  }
}
