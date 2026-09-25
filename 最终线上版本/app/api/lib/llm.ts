// OpenAI 兼容的 LLM 客户端（Moonshot/Kimi 等）。未配置 LLM_API_KEY 时为 mock 模式：
// 返回可预测的占位回复，保证本地测试与降级路径可跑通。
import { env } from "./env";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function llmConfigured() {
  return Boolean(process.env.LLM_API_KEY || env.llmApiKey);
}

async function realChat(messages: ChatMessage[], opts?: { json?: boolean; timeoutMs?: number }): Promise<string> {
  const baseUrl = (process.env.LLM_BASE_URL || env.llmBaseUrl).replace(/\/$/, "");
  const model = process.env.LLM_MODEL || env.llmModel;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 20_000);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LLM_API_KEY || env.llmApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.6,
        ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM 返回为空");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

export async function chat(messages: ChatMessage[], opts?: { json?: boolean; timeoutMs?: number }): Promise<string> {
  if (!llmConfigured()) {
    const last = messages[messages.length - 1]?.content ?? "";
    return opts?.json ? '{"notes":"mock-extract"}' : `（月老 placeholder 回复）收到：${last.slice(0, 50)}`;
  }
  return realChat(messages, opts);
}
