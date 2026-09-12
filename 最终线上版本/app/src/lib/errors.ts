export function trpcErrorMessage(err: unknown, fallback = "请稍后再试") {
  if (err && typeof err === "object" && "message" in err) {
    const message = String((err as { message: unknown }).message ?? "").trim();
    if (message) return message.replace(/^TRPCClientError:\s*/i, "");
  }
  return fallback;
}
