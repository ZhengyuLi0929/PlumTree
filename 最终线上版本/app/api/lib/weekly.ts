// 每周节奏相位：按 CST（UTC+8）自然周推进。
// 周三周四=传话期（chatting），周五到周日=约会期（dating），周一周二=回访（feedback）。
// 周三 20:00 空投、周五 00:00 确认截止由调度器（T3）驱动；这里只回答「现在是什么相位」。
export type Phase = "idle" | "chatting" | "dating" | "feedback";

export function phaseOf(now = new Date()): Phase {
  // 测试钩子：BOT_FORCE_PHASE=chatting/dating/feedback/idle 可强制相位（调度器压缩时间测试用）
  const forced = process.env.BOT_FORCE_PHASE;
  if (forced === "idle" || forced === "chatting" || forced === "dating" || forced === "feedback") return forced;
  const cst = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const dow = cst.getUTCDay(); // 0=周日 … 6=周六
  if (dow === 3 || dow === 4) return "chatting";
  if (dow === 5 || dow === 6 || dow === 0) return "dating";
  return "feedback"; // 周一、周二
}

/** 传话/确认是否只在周三周四开放 */
export function relayOpen(now = new Date()) {
  return phaseOf(now) === "chatting";
}

/** 周五零点（=周四 24:00）确认截止：dating 相位开始后不再接受确认 */
export function confirmOpen(now = new Date()) {
  return phaseOf(now) === "chatting";
}
