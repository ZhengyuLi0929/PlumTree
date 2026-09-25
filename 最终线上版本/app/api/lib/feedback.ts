// 回访消息解析：「成了 4分 想继续」→ { met: 1, score: 4, willing: '想' }
// 三个要素一个都没识别出来则返回 null（不当作回访，走闲聊）。
export type Feedback = { met?: number; score?: number; willing?: string };

export function parseFeedback(text: string): Feedback | null {
  const t = text.trim();
  const out: Feedback = {};

  if (/没成|没见|没见面|爽约|黄了/.test(t)) out.met = 0;
  else if (/成了|见了|见了一面|见面了|赴约/.test(t)) out.met = 1;

  const score = t.match(/([1-5])\s*分/);
  if (score) out.score = parseInt(score[1], 10);

  if (/不想|不了|算了|不再/.test(t)) out.willing = "不了";
  else if (/想继续|愿意|想再|想约/.test(t)) out.willing = "想";

  return out.met !== undefined || out.score !== undefined || out.willing !== undefined ? out : null;
}
