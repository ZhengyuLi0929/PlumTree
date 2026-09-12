// 恋爱人格测试 · 题库最终版（v3）
// 7 人小样本试测后筛选：保留均值 3–5 或标准差 > 1.8 的题，共 51 题
// 分布：FI 12 · SG 10 · RP 10 · HC 13 · TM 6（嵌入，不进代码）
// 数据写入 responses_v3 表，统计归 /stats-v3；v1/v2 统计保留在 /stats、/stats-v2
// 平局规则：某维度两极打平时，按该维度作答速度裁定（快→左极 51%，慢→49%），不向用户展示

import type { Question, LangKey, Scores } from './questions'
import { DIM_META, RANKINGS } from './questions'

export const FINAL_QUESTIONS: Question[] = [
  // ========== 亲密距离 F/I (12) ==========
  { id: 2, dim: 'FI', pole: 'F', text: '情绪崩溃的时候，朋友劝一百句，不如对象立即到场的安慰。' },  // 试测 均值5.00 标准差2.33
  { id: 5, dim: 'FI', pole: 'I', text: '每周都需要一段完全属于自己的时间，即使是热恋期也不会变。' },  // 试测 均值4.71 标准差1.67
  { id: 9, dim: 'FI', pole: 'I', text: '如果对象想看你和最好朋友的聊天记录，你会不舒服——哪怕你没有任何秘密。' },  // 试测 均值4.43 标准差2.38
  { id: 10, dim: 'FI', pole: 'F', text: '出差在外，睡前不和伴侣视频一会儿，这一天就像没结束。' },  // 试测 均值4.14 标准差2.03
  { id: 11, dim: 'FI', pole: 'F', text: '看到好笑的段子，第一个想分享的人必须是伴侣，不然快乐像打了对折。' },  // 试测 均值4.57 标准差1.68
  { id: 12, dim: 'FI', pole: 'F', text: '伴侣临时想加入我和朋友的聚会，我真心欢迎，不觉得被打扰。', spicy: true },  // 试测 均值4.43 标准差2.19
  { id: 16, dim: 'FI', pole: 'F', text: '伴侣情绪低落却不肯说原因时，我会坐立难安，一定要问出来。' },  // 试测 均值4.29 标准差2.12
  { id: 17, dim: 'FI', pole: 'I', text: '再爱一个人，我也不会把银行卡密码告诉 TA。', spicy: true },  // 试测 均值3.86 标准差2.42
  { id: 18, dim: 'FI', pole: 'I', text: '伴侣没打招呼就来公司楼下接我，我的第一反应是压力，不是惊喜。', spicy: true },  // 试测 均值3.00 标准差2.07
  { id: 21, dim: 'FI', pole: 'I', text: '如果伴侣要求随时共享定位，我会认真考虑这段关系还要不要继续。', spicy: true },  // 试测 均值5.71 标准差2.05
  { id: 22, dim: 'FI', pole: 'I', text: '我需要一个上锁的抽屉或一个谁都不给看的备忘录，哪怕里面没什么秘密。' },  // 试测 均值5.00 标准差2.20
  { id: 24, dim: 'FI', pole: 'I', text: '我非常讨厌「报备」这个词，成年人之间为什么需要互相交代行踪？', spicy: true },  // 试测 均值5.71 标准差2.05
  // ========== 真爱来源 S/G (10) ==========
  { id: 26, dim: 'SG', pole: 'S', text: '第一次见面没有明显心动，即使对方各方面都不错，我通常也不会主动安排第二次见面。', spicy: true },  // 试测 均值3.57 标准差1.92
  { id: 28, dim: 'SG', pole: 'S', text: '所谓「磨合」，很多时候只是两个不合适的人在互相妥协。' },  // 试测 均值3.71 标准差2.60
  { id: 29, dim: 'SG', pole: 'S', text: '我对一个人的喜欢，通常更像突然发生，而不是在不知不觉中慢慢积累。' },  // 试测 均值3.86 标准差2.23
  { id: 30, dim: 'SG', pole: 'G', text: '即使双方好感已经比较明确，我也倾向保持原来的相处频率，观察一段时间再逐步靠近。' },  // 试测 均值5.00 标准差1.77
  { id: 32, dim: 'SG', pole: 'G', text: '前几次约会后仍不能确定是否喜欢对方时，我还愿意继续见面，而不是马上结束接触。' },  // 试测 均值5.14 标准差1.96
  { id: 35, dim: 'SG', pole: 'S', text: '「条件合适但没有心动」和「心动但条件不合适」，我一定选后者。', spicy: true },  // 试测 均值3.43 标准差1.40
  { id: 37, dim: 'SG', pole: 'S', text: '我相信「感觉对了」这件事，理性分析列出再多优点也没用。' },  // 试测 均值4.43 标准差2.19
  { id: 38, dim: 'SG', pole: 'S', text: '「相处久了慢慢就会喜欢上」这句话，在我这里很难兑现。' },  // 试测 均值2.71 标准差1.98
  { id: 41, dim: 'SG', pole: 'G', text: '一个人现在让我多心动不重要，重要的是 TA 五年后会变成什么样。' },  // 试测 均值4.86 标准差2.03
  { id: 45, dim: 'SG', pole: 'G', text: '第一次约会的尴尬沉默，不代表两个人不合适。' },  // 试测 均值4.43 标准差1.40
  // ========== 价值取向 R/P (10) ==========
  { id: 47, dim: 'RP', pole: 'R', text: '当投入同样的时间或预算，一场精心安排的约会惊喜，比帮我解决一个生活中的实际麻烦更打动我。' },  // 试测 均值3.29 标准差2.05
  { id: 48, dim: 'RP', pole: 'R', text: '和爱的人挤在出租屋吃泡面的人生，即使贫穷，也依然很幸福。', spicy: true },  // 试测 均值4.29 标准差2.66
  { id: 49, dim: 'RP', pole: 'R', text: '为爱辞掉工作、奔赴对方的城市，是勇敢，不是冲动。', spicy: true },  // 试测 均值3.71 标准差1.91
  { id: 55, dim: 'RP', pole: 'P', text: '情侣间涉及相对较大资金转账时，有必要标明转账或借款目的。' },  // 试测 均值5.86 标准差1.88
  { id: 57, dim: 'RP', pole: 'R', text: '比起大牌礼物，一封手写的信能让我开心更久。' },  // 试测 均值5.00 标准差2.00
  { id: 59, dim: 'RP', pole: 'R', text: '工资到账那天，我更想先订一家期待已久的餐厅，而不是先存起来。' },  // 试测 均值2.86 标准差2.10
  { id: 60, dim: 'RP', pole: 'R', text: '异地恋里，定期收到用心准备的惊喜快递，比每天的早安晚安更重要。' },  // 试测 均值4.00 标准差2.20
  { id: 62, dim: 'RP', pole: 'R', text: '如果婚礼只能保留一个环节，我选誓词，而不是酒席。' },  // 试测 均值5.43 标准差1.92
  { id: 68, dim: 'RP', pole: 'P', text: '伴侣做饭好吃，比长得好看更能留住我。', spicy: true },  // 试测 均值4.00 标准差1.77
  { id: 69, dim: 'RP', pole: 'P', text: '两个人收入水平差距太大，感情再好也会被生活慢慢磨掉。' },  // 试测 均值4.29 标准差1.91
  // ========== 冲突风格 H/C (13) ==========
  { id: 71, dim: 'HC', pole: 'H', text: '有了矛盾，我认为「今晚必须说清楚」，哪怕说到凌晨。' },  // 试测 均值4.71 标准差2.25
  { id: 73, dim: 'HC', pole: 'H', text: '从不吵架的情侣，多半是有个人在忍。' },  // 试测 均值4.57 标准差1.84
  { id: 76, dim: 'HC', pole: 'C', text: '吵完架不需要特意和好，第二天正常说话就等于翻篇。' },  // 试测 均值3.29 标准差1.83
  { id: 77, dim: 'HC', pole: 'C', text: '情绪明显上来时，我通常会先暂停对话，等平静一些再继续。' },  // 试测 均值4.86 标准差1.88
  { id: 78, dim: 'HC', pole: 'C', text: '要求「今晚必须说清楚」，有时不是在解决问题，只是在发泄自己的焦虑。' },  // 试测 均值5.00 标准差2.00
  { id: 79, dim: 'HC', pole: 'H', text: '冷战超过一天，我就会开始在心里写分手剧本。', spicy: true },  // 试测 均值3.71 标准差1.83
  { id: 80, dim: 'HC', pole: 'H', text: '我宁愿大吵一架把话说绝，也不想听对方说「随便你」。' },  // 试测 均值4.86 标准差2.17
  { id: 82, dim: 'HC', pole: 'H', text: '问题没解决就睡觉，我会失眠到天亮。' },  // 试测 均值3.71 标准差1.83
  { id: 83, dim: 'HC', pole: 'H', text: '道歉不需要多正式，但必须在当天。' },  // 试测 均值3.86 标准差2.17
  { id: 84, dim: 'HC', pole: 'H', text: '「我们先冷静一下」，常常是「我不想面对」的体面说法。' },  // 试测 均值3.43 标准差1.76
  { id: 87, dim: 'HC', pole: 'C', text: '对方追着要我立刻谈清楚时，我血压会升高，更不想谈。' },  // 试测 均值4.43 标准差1.99
  { id: 88, dim: 'HC', pole: 'C', text: '有些情绪说出来的那一刻就变味了，写下来发给对方更好。' },  // 试测 均值3.29 标准差1.39
  { id: 89, dim: 'HC', pole: 'C', text: '深夜不适合谈重要的事，再急也等天亮。' },  // 试测 均值3.57 标准差1.84
  // ========== 性别角色 T/M (6) ==========
  { id: 91, dim: 'TM', pole: 'T', text: '男生负责所有的赚钱养家，女生负责所有的照顾家庭——如果真能兑现，生活也会非常开心。', spicy: true },  // 试测 均值5.57 标准差1.99
  { id: 92, dim: 'TM', pole: 'T', text: '约会买单时，男生主动掏钱是风度，女生坚持 AA 反而会让场面有点尴尬。', spicy: true },  // 试测 均值4.00 标准差2.07
  { id: 93, dim: 'TM', pole: 'M', text: '孩子跟谁姓、年夜饭在谁家，没有什么默认答案。', spicy: true },  // 试测 均值5.14 标准差1.96
  { id: 94, dim: 'TM', pole: 'M', text: '传统的性别分工让我窒息，我的亲密关系一定要打破这种分工。', spicy: true },  // 试测 均值4.29 标准差2.05
  { id: 99, dim: 'TM', pole: 'T', text: '我就是喜欢被照顾的那一方，这没什么不好意思承认的。', spicy: true },  // 试测 均值5.14 标准差1.96
  { id: 100, dim: 'TM', pole: 'M', text: '未来伴侣收入比我高很多，我也不会因为「谁养家」而别扭。', spicy: true },  // 试测 均值5.14 标准差2.10
]

/** 题目顺序：话题题均匀穿插 */
export function buildQuizOrderFinal(): Question[] {
  const spicy = shuffle(FINAL_QUESTIONS.filter(q => q.spicy))
  const regular = shuffle(FINAL_QUESTIONS.filter(q => !q.spicy))
  const order: Question[] = []
  const interval = Math.floor(regular.length / (spicy.length + 1))
  let ri = 0
  for (const s of spicy) {
    order.push(...regular.slice(ri, ri + interval), s)
    ri += interval
  }
  order.push(...regular.slice(ri))
  return order
}

/**
 * 计分（含隐藏平局规则）
 * timings: 每题作答毫秒数。某维度两极分平（50/50）时：
 * 该维度平均作答快于本人整体中位时长 → 左极按 51% 计；慢于 → 左极按 49% 计。
 * 规则不展示给用户。
 */
export function computeScoresFinal(
  answers: Record<number, number>,
  rankings: Record<string, LangKey[]>,
  timings?: Record<number, number>,
): Scores {
  const raw: Record<string, number> = {}
  const dimIds: Record<string, number[]> = {}
  for (const q of FINAL_QUESTIONS) {
    const v = answers[q.id]
    if (typeof v !== 'number' || v < 1 || v > 7) continue
    const meta = DIM_META.find(d => d.key === q.dim)
    if (!meta) continue
    // 1–7 双极计分：选 1 = 本题极 1 / 对极 7；选 4 = 两极各 4；选 7 = 本题极 7 / 对极 1
    const towardStated = v
    const towardOther = 8 - v
    if (q.pole === meta.left) {
      raw[meta.left] = (raw[meta.left] ?? 0) + towardStated
      raw[meta.right] = (raw[meta.right] ?? 0) + towardOther
    } else {
      raw[meta.right] = (raw[meta.right] ?? 0) + towardStated
      raw[meta.left] = (raw[meta.left] ?? 0) + towardOther
    }
    ;(dimIds[q.dim] ??= []).push(q.id)
  }

  // 本人作答时长中位数（仅选择题）
  let median = Infinity
  if (timings) {
    const ts = FINAL_QUESTIONS.map(q => timings[q.id]).filter((t): t is number => typeof t === 'number' && t > 0)
    ts.sort((a, b) => a - b)
    if (ts.length) median = ts[Math.floor(ts.length / 2)]
  }

  const dim = (leftKey: string, rightKey: string, dimKey: string) => {
    let left = raw[leftKey] ?? 0
    let right = raw[rightKey] ?? 0
    if (left === right && timings && median !== Infinity) {
      const ts = (dimIds[dimKey] ?? []).map(id => timings[id]).filter((t): t is number => typeof t === 'number' && t > 0)
      if (ts.length) {
        const avg = ts.reduce((a, b) => a + b, 0) / ts.length
        // 直接落成 51/49，避免偶数总分四舍五入后又变回 50/50
        left = avg < median ? 51 : 49
        right = 100 - left
      }
    }
    return { [leftKey]: left, [rightKey]: right } as Record<string, number>
  }

  const ll: Record<LangKey, number> = { words: 0, time: 0, gifts: 0, acts: 0, touch: 0 }
  for (const r of RANKINGS) {
    const order = rankings[r.id]
    if (!order) continue
    order.forEach((key, i) => { ll[key] += 5 - i })
  }

  return {
    FI: dim('F', 'I', 'FI') as Scores['FI'],
    SG: dim('S', 'G', 'SG') as Scores['SG'],
    RP: dim('R', 'P', 'RP') as Scores['RP'],
    HC: dim('H', 'C', 'HC') as Scores['HC'],
    TM: dim('T', 'M', 'TM') as Scores['TM'],
    LL: ll,
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

