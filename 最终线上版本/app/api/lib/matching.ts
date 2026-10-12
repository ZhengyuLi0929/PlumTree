// 匹配算法 v1：人工辅助的规则匹配（不做重算法）。
// 硬规则：异性、同一 org_tag、结构化雷区（身高下限/出生年范围/异地）、年龄差上限、上周已配排除。
// 加分：人格官配 CP、兴趣关键词互中、轮空优先。
import { TYPES } from "../../src/data/types";

export type PoolUser = {
  profileId: number;
  name: string;
  gender: string;
  birthYear: number;
  city: string;
  orgTag: string;
  priority: number;
  typeCode: string | null;
  height: number | null;
  job: string | null;
  intro: string | null;
  expectation: string | null;
  value: string | null;
  prefMinHeight: number | null;
  prefBirthFrom: number | null;
  prefBirthTo: number | null;
  acceptDistance: string | null;
  chatText: string | null;
};

export type ScoredPair = {
  man: PoolUser;
  woman: PoolUser;
  score: number;
  reason: string;
};

const INTEREST_TAGS = [
  "爬山", "徒步", "读书", "旅行", "健身", "做饭", "电影", "音乐", "游戏", "摄影",
  "跑步", "咖啡", "猫", "狗", "看展", "live", "球", "滑雪", "骑行", "桌游",
];

function textOf(u: PoolUser) {
  return [u.intro, u.expectation, u.value, u.job, u.chatText].filter(Boolean).join(" ");
}

function birthInRange(who: number, from: number | null, to: number | null) {
  if (from != null && who < from) return false;
  if (to != null && who > to) return false;
  return true;
}

/** 返回 null = 硬规则不可配 */
export function scorePair(man: PoolUser, woman: PoolUser, opts?: { maxAgeGap?: number }): ScoredPair | null {
  // 结构化雷区（双向）
  const womanMin = woman.prefMinHeight;
  const manMin = man.prefMinHeight;
  if (womanMin != null && (man.height == null || man.height < womanMin)) return null;
  if (manMin != null && (woman.height == null || woman.height < manMin)) return null;
  if (!birthInRange(man.birthYear, woman.prefBirthFrom, woman.prefBirthTo)) return null;
  if (!birthInRange(woman.birthYear, man.prefBirthFrom, man.prefBirthTo)) return null;
  const sameCity = man.city.trim() === woman.city.trim();
  if (!sameCity && (man.acceptDistance === "不接受" || woman.acceptDistance === "不接受")) return null;

  const maxAgeGap = opts?.maxAgeGap ?? 5;
  const ageGap = Math.abs(man.birthYear - woman.birthYear);
  if (ageGap > maxAgeGap) return null;

  let score = 50;
  const why: string[] = [];

  // 人格官配 CP 加分
  const manType = man.typeCode ? TYPES[man.typeCode] : null;
  const womanType = woman.typeCode ? TYPES[woman.typeCode] : null;
  if (manType && womanType && manType.matchCode === woman.typeCode) {
    score += 25;
    why.push(`官配 CP（${manType.alias}×${womanType.alias}）`);
  }

  // 兴趣关键词互中
  const manText = textOf(man);
  const womanText = textOf(woman);
  const hits = INTEREST_TAGS.filter((t) => manText.includes(t) && womanText.includes(t));
  if (hits.length) {
    score += Math.min(12, hits.length * 3);
    why.push(`共同兴趣：${hits.slice(0, 4).join("、")}`);
  }

  // 轮空优先
  const prio = man.priority + woman.priority;
  if (prio > 0) score += prio * 8;

  if (sameCity) why.push("同城");
  why.push(`年龄相差 ${ageGap} 岁`);

  return { man, woman, score, reason: why.join("；") };
}

/** 贪心全局分配：分数从高到低，一人只进一对；容量 = min(男, 女) */
export function computeMatches(
  users: PoolUser[],
  opts?: { maxAgeGap?: number; excludePairs?: Set<string> },
): { pairs: ScoredPair[]; unmatched: PoolUser[] } {
  const men = users.filter((u) => u.gender === "男");
  const women = users.filter((u) => u.gender === "女");
  const capacity = Math.min(men.length, women.length);
  const exclude = opts?.excludePairs ?? new Set<string>();

  const candidates: ScoredPair[] = [];
  for (const man of men) {
    for (const woman of women) {
      if (exclude.has(`${man.profileId}:${woman.profileId}`)) continue;
      const scored = scorePair(man, woman, opts);
      if (scored) candidates.push(scored);
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const usedM = new Set<number>();
  const usedW = new Set<number>();
  const pairs: ScoredPair[] = [];
  for (const c of candidates) {
    if (pairs.length >= capacity) break;
    if (usedM.has(c.man.profileId) || usedW.has(c.woman.profileId)) continue;
    usedM.add(c.man.profileId);
    usedW.add(c.woman.profileId);
    pairs.push(c);
  }
  const unmatched = users.filter((u) => !usedM.has(u.profileId) && !usedW.has(u.profileId));
  return { pairs, unmatched };
}
