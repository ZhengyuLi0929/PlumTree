// 月老推荐语生成：针对一对配对，分别生成「给男方」和「给女方」的推荐消息。
// 语气要求：元气满满、像认识你们的共同朋友、没有 AI 味（不用「亲爱的用户」、不拽术语、不排比）。
import { eq } from "drizzle-orm";
import { matches, profiles } from "../../db/schema";
import { ensureTable, getDb } from "../queries/connection";
import { chat } from "./llm";

const BLESSING_SYSTEM = `你是人大附中校友里最热心肠的那位老同学，正撮合两个朋友认识。给双方各写一段推荐语。
要求：
1. 元气满满、口语化，像一个真心为他们高兴的朋友，绝对不许有 AI 腔（不许「亲爱的」「很高兴为您」「综上所述」）。
2. 透露对方的一点真实信息（出生年/城市/职业/爱好里的两三样），真心夸一夸对方。
3. 说清楚为什么这两个人适合彼此（引用双方资料里的具体点）。
4. 每段 60–110 字，活泼但不油腻。不要表情符号堆砌，最多一两个。
5. 不许提四字母人格代码，不许编造资料里没有的事。
只输出 JSON：{"forMan":"……","forWoman":"……"}`;

function cardText(p: typeof profiles.$inferSelect) {
  return [
    `出生年: ${p.birthYear ?? "未填"}`,
    `城市: ${p.city ?? "未填"}`,
    `职业: ${p.job ?? "未填"}`,
    `身高: ${p.height ? `${p.height}cm` : "未填"}`,
    `MBTI: ${p.mbti ?? "未填"}`,
    `自我介绍: ${p.intro ?? "（空）"}`,
    `理想型: ${p.expectation ?? "（空）"}`,
    `最看重: ${p.value ?? "（空）"}`,
  ].join("\n");
}

function parseJson(text: string): { forMan: string; forWoman: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const parsed = JSON.parse(text.slice(start, end + 1)) as { forMan?: string; forWoman?: string };
  if (!parsed.forMan || !parsed.forWoman) throw new Error("推荐语缺字段");
  return { forMan: parsed.forMan, forWoman: parsed.forWoman };
}

export async function generateBlessing(matchId: number, regenerate = false): Promise<{ forMan: string; forWoman: string }> {
  await ensureTable();
  const db = getDb();
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) throw new Error("配对不存在");
  if (match.blessingMan && match.blessingWoman && !regenerate) {
    return { forMan: match.blessingMan, forWoman: match.blessingWoman };
  }
  const [man] = await db.select().from(profiles).where(eq(profiles.id, match.manProfileId));
  const [woman] = await db.select().from(profiles).where(eq(profiles.id, match.womanProfileId));
  if (!man || !woman) throw new Error("报名资料缺失");

  const prompt = `${BLESSING_SYSTEM}\n\n## 男方资料\n${cardText(man)}\n\n## 女方资料\n${cardText(woman)}\n\n配对理由（可选参考）：${match.reason ?? "无"}`;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = await chat([
        { role: "system", content: "只输出合法 JSON 对象。" },
        { role: "user", content: prompt },
      ], { json: true, timeoutMs: 60_000 });
      const parsed = parseJson(out);
      await db.update(matches).set({ blessingMan: parsed.forMan, blessingWoman: parsed.forWoman }).where(eq(matches.id, matchId));
      return parsed;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("生成失败");
}
