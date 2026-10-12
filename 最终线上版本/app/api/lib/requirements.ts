// 择偶需求结构化：每轮对话后异步把对话摘要成 JSON，zod 校验后写回 bot_users.requirements。
import { z } from "zod";
import { chat } from "./llm";

export const requirementsSchema = z.object({
  ageMin: z.number().int().optional(),
  ageMax: z.number().int().optional(),
  heightMin: z.number().int().optional(),
  regions: z.array(z.string()).optional(),
  personality: z.array(z.string()).optional(),
  dealbreakers: z.array(z.string()).optional(),
  longTermGoal: z.string().optional(),
  notes: z.string().optional(),
});

export type Requirements = z.infer<typeof requirementsSchema>;

const EXTRACT_PROMPT = `你是信息抽取器。根据「月老」机器人与用户的最近对话，把用户的择偶需求摘要成 JSON。
只输出 JSON 对象，字段全部可选，没有提到的不要编：
{"ageMin":number,"ageMax":number,"heightMin":number,"regions":string[],"personality":string[],"dealbreakers":string[],"longTermGoal":string,"notes":string}`;

function parseJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) throw new SyntaxError("no json object");
  let depth = 0;
  let inStr = false;
  let escaped = false;
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

export async function extractRequirements(history: { role: string; content: string }[]): Promise<Requirements | null> {
  if (history.length === 0) return null;
  const text = history.map((h) => `${h.role === "user" ? "用户" : "月老"}：${h.content}`).join("\n");
  try {
    const out = await chat(
      [
        { role: "system", content: EXTRACT_PROMPT },
        { role: "user", content: text.slice(-4000) },
      ],
      { json: true, timeoutMs: 20_000 },
    );
    const parsed = requirementsSchema.safeParse(parseJsonObject(out));
    return parsed.success ? parsed.data : null;
  } catch (err) {
    console.error("[requirements]", err);
    return null;
  }
}
