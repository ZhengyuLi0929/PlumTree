export function trpcErrorMessage(err: unknown, fallback = "请稍后再试") {
  if (err && typeof err === "object" && "message" in err) {
    const message = String((err as { message: unknown }).message ?? "").trim();
    // zod 校验错误的 message 是 JSON 数组，取第一条的人话
    if (message.startsWith("[")) {
      try {
        const arr = JSON.parse(message) as { message?: unknown }[];
        const first = arr[0]?.message;
        if (typeof first === "string" && first) return first;
      } catch {
        /* 不是 JSON 就按原文走 */
      }
    }
    if (message) return message.replace(/^TRPCClientError:\s*/i, "");
  }
  return fallback;
}
