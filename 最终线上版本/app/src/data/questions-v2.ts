// 恋爱人格测试 · 题库 v2
// 以「题库(1).xlsx」38 题为基底扩展到 100 题
// 分布：FI 24 · SG 22 · RP 24 · HC 20 · TM 10（嵌入，不进代码）
// 数据写入 responses_v2 表，统计归 /stats-v2；v1 旧题统计保留在 /stats

import type { Question, LangKey, Scores } from './questions'
import { RANKINGS } from './questions'

export const QUESTIONS_V2: Question[] = [
  // ========== 亲密距离 F/I (24) ==========
  { id: 1, dim: 'FI', pole: 'F', text: '即使各自有安排，如果地点或同行的人临时发生变化，我也会顺手告诉伴侣。' },
  { id: 2, dim: 'FI', pole: 'F', text: '情绪崩溃的时候，朋友劝一百句，不如对象立即到场的安慰。' },
  { id: 3, dim: 'FI', pole: 'F', text: '情侣之间交换手机密码，是信任的基本配置。', spicy: true },
  { id: 4, dim: 'FI', pole: 'F', text: '空闲时和伴侣连续很多天一直待在一起，我仍然觉得舒服。' },
  { id: 5, dim: 'FI', pole: 'I', text: '每周都需要一段完全属于自己的时间，即使是热恋期也不会变。' },
  { id: 6, dim: 'FI', pole: 'F', text: '和伴侣待在一起时，即使各自做不同的事情，我也愿意待在同一个空间里。' },
  { id: 7, dim: 'FI', pole: 'I', text: '因为各自忙碌而两三天没有好好聊天，我也不会觉得彼此疏远。' },
  { id: 8, dim: 'FI', pole: 'I', text: '安全感这种东西，归根到底只能自己给自己。' },
  { id: 9, dim: 'FI', pole: 'I', text: '如果对象想看你和最好朋友的聊天记录，你会不舒服——哪怕你没有任何秘密。' },
  { id: 10, dim: 'FI', pole: 'F', text: '出差在外，睡前不和伴侣视频一会儿，这一天就像没结束。' },
  { id: 11, dim: 'FI', pole: 'F', text: '看到好笑的段子，第一个想分享的人必须是伴侣，不然快乐像打了对折。' },
  { id: 12, dim: 'FI', pole: 'F', text: '伴侣临时想加入我和朋友的聚会，我真心欢迎，不觉得被打扰。', spicy: true },
  { id: 13, dim: 'FI', pole: 'F', text: '我希望伴侣对我的朋友圈子了如指掌，最好大家都处成共同好友。' },
  { id: 14, dim: 'FI', pole: 'F', text: '搬家、换工作这种大事，如果没和伴侣商量就做了决定，我会觉得哪里不对。' },
  { id: 15, dim: 'FI', pole: 'F', text: '恋爱后的周末默认是两个人的，被工作临时占用我会觉得亏。' },
  { id: 16, dim: 'FI', pole: 'F', text: '伴侣情绪低落却不肯说原因时，我会坐立难安，一定要问出来。' },
  { id: 17, dim: 'FI', pole: 'I', text: '再爱一个人，我也不会把银行卡密码告诉 TA。', spicy: true },
  { id: 18, dim: 'FI', pole: 'I', text: '伴侣没打招呼就来公司楼下接我，我的第一反应是压力，不是惊喜。', spicy: true },
  { id: 19, dim: 'FI', pole: 'I', text: '和伴侣一起旅行时，我需要每天留一小时各自自由活动。' },
  { id: 20, dim: 'FI', pole: 'I', text: '有些心事我只跟最好的朋友讲，不跟伴侣讲，这不是不爱。' },
  { id: 21, dim: 'FI', pole: 'I', text: '如果伴侣要求随时共享定位，我会认真考虑这段关系还要不要继续。', spicy: true },
  { id: 22, dim: 'FI', pole: 'I', text: '我需要一个上锁的抽屉或一个谁都不给看的备忘录，哪怕里面没什么秘密。' },
  { id: 23, dim: 'FI', pole: 'I', text: '独居过很长一段时间的人，很难再适应和别人一起生活。' },
  { id: 24, dim: 'FI', pole: 'I', text: '我不喜欢"报备"这个词，成年人之间不需要互相交代行踪。', spicy: true },
]

export const QUESTIONS_V2_SG: Question[] = [
  // ========== 真爱来源 S/G (22) ==========
  { id: 25, dim: 'SG', pole: 'S', text: '有些人就是第一次见面，就会让我产生"可能就是TA"的直觉，很难解释原因。', spicy: true },
  { id: 26, dim: 'SG', pole: 'S', text: '第一次见面没有明显心动，即使对方各方面都不错，我通常也不会主动安排第二次见面。', spicy: true },
  { id: 27, dim: 'SG', pole: 'S', text: '当双方持续约会且好感明确时，我通常会希望尽快说清彼此是什么关系。' },
  { id: 28, dim: 'SG', pole: 'S', text: '所谓"磨合"，很多时候只是两个不合适的人在互相妥协。' },
  { id: 29, dim: 'SG', pole: 'S', text: '我对一个人的喜欢，通常更像突然发生，而不是在不知不觉中慢慢积累。' },
  { id: 30, dim: 'SG', pole: 'G', text: '即使双方好感已经比较明确，我也倾向保持原来的相处频率，观察一段时间再逐步靠近。' },
  { id: 31, dim: 'SG', pole: 'G', text: '比起"一见钟情"，我认为"一起熬过来的"感情更骄傲。' },
  { id: 32, dim: 'SG', pole: 'G', text: '前几次约会后仍不能确定是否喜欢对方时，我还愿意继续见面，而不是马上结束接触。' },
  { id: 33, dim: 'SG', pole: 'S', text: '感情里最可惜的不是分手，是和一个"从来没真正心动过"的人结婚。' },
  { id: 34, dim: 'SG', pole: 'S', text: '我能接受伴侣有很多缺点，但不能接受和 TA 拥抱亲吻时毫无感觉。' },
  { id: 35, dim: 'SG', pole: 'S', text: '"条件合适但没有心动"和"心动但条件不合适"，我一定选后者。', spicy: true },
  { id: 36, dim: 'SG', pole: 'S', text: '爱情开始的方式很重要，稀里糊涂在一起的感情很难让我珍惜。' },
  { id: 37, dim: 'SG', pole: 'S', text: '我相信"感觉对了"这件事，理性分析列出再多优点也没用。' },
  { id: 38, dim: 'SG', pole: 'S', text: '"相处久了慢慢就会喜欢上"这句话，在我这里从来没有兑现过。' },
  { id: 39, dim: 'SG', pole: 'G', text: '再心动的开场，三个月后拼的也是两个人怎么处理鸡毛蒜皮。' },
  { id: 40, dim: 'SG', pole: 'G', text: '我不介意相亲——认识方式不影响感情质量，处出来的才是真的。', spicy: true },
  { id: 41, dim: 'SG', pole: 'G', text: '一个人现在让我多心动不重要，重要的是 TA 五年后会变成什么样。' },
  { id: 42, dim: 'SG', pole: 'G', text: '所谓安全感，是同一个问题吵过三次之后，还能好好说话。' },
  { id: 43, dim: 'SG', pole: 'G', text: '比起"我永远不会变心"的承诺，我更信"吵架后修好了关系"的记录。' },
  { id: 44, dim: 'SG', pole: 'G', text: '如果伴侣和我在一起后没有任何成长和改变，我会怀疑这段关系。' },
  { id: 45, dim: 'SG', pole: 'G', text: '第一次约会的尴尬沉默，不代表两个人不合适。' },
  { id: 46, dim: 'SG', pole: 'G', text: '心动是一种状态，爱情是一种能力——前者碰运气，后者靠练习。' },
]

export const QUESTIONS_V2_RP: Question[] = [
  // ========== 价值取向 R/P (24) ==========
  { id: 47, dim: 'RP', pole: 'R', text: '当投入同样的时间或预算，一场精心安排的约会惊喜，比帮我解决一个生活中的实际麻烦更打动我。' },
  { id: 48, dim: 'RP', pole: 'R', text: '和爱的人挤在出租屋吃泡面的人生，即使贫穷，也依然很幸福。', spicy: true },
  { id: 49, dim: 'RP', pole: 'R', text: '为爱辞掉工作、奔赴对方的城市，是勇敢，不是冲动。', spicy: true },
  { id: 50, dim: 'RP', pole: 'R', text: '彩礼不该成为结婚的门槛，两个人愿意比什么都重要。' },
  { id: 51, dim: 'RP', pole: 'R', text: '收到一件不算实用、但明显为我专门挑选的礼物时，我通常更在意其中的心意，而不是它是否有用。' },
  { id: 52, dim: 'RP', pole: 'P', text: '长久的感情最后拼的是生活能力：谁做饭、谁修水龙头、谁记得缴电费。' },
  { id: 53, dim: 'RP', pole: 'P', text: '当我忙得顾不过来时，伴侣主动替我处理一件具体的事情，比一句安慰更让我感到被支持。' },
  { id: 54, dim: 'RP', pole: 'P', text: '结婚是两个家庭的合并报表，不只是两个人的事。', spicy: true },
  { id: 55, dim: 'RP', pole: 'P', text: '情侣间涉及大额资金转账时，有必要标明转账或借款目的。' },
  { id: 56, dim: 'RP', pole: 'R', text: '纪念日被遗忘，比房租忘交更让我受伤。' },
  { id: 57, dim: 'RP', pole: 'R', text: '比起大牌礼物，一封手写的信能让我开心更久。' },
  { id: 58, dim: 'RP', pole: 'R', text: '求婚可以不贵，但必须用心到我一辈子都记得。' },
  { id: 59, dim: 'RP', pole: 'R', text: '工资到账那天，我更想先订一家期待已久的餐厅，而不是先存起来。' },
  { id: 60, dim: 'RP', pole: 'R', text: '异地恋里，定期收到用心准备的惊喜快递，比每天的早安晚安更重要。' },
  { id: 61, dim: 'RP', pole: 'R', text: '一年至少要有几次"不必要但浪漫"的花销，不然日子太灰了。' },
  { id: 62, dim: 'RP', pole: 'R', text: '如果婚礼只能保留一个环节，我选誓词，而不是酒席。' },
  { id: 63, dim: 'RP', pole: 'R', text: '普通的周二也值得过成纪念日，浪漫不需要等节日。' },
  { id: 64, dim: 'RP', pole: 'P', text: '情侣之间明算账不丢人，糊涂账才伤感情。', spicy: true },
  { id: 65, dim: 'RP', pole: 'P', text: '看一个人适不适合结婚，一起旅行一次比约会十次更清楚。' },
  { id: 66, dim: 'RP', pole: 'P', text: '浪漫不能当饭吃，房贷和柴米油盐才是日子的本体。' },
  { id: 67, dim: 'RP', pole: 'P', text: '结婚前不谈清楚财产和债务，是对彼此的不负责。' },
  { id: 68, dim: 'RP', pole: 'P', text: '伴侣做饭好吃，比长得好看更能留住我。', spicy: true },
  { id: 69, dim: 'RP', pole: 'P', text: '两个人收入水平差距太大，感情再好也会被生活慢慢磨掉。' },
  { id: 70, dim: 'RP', pole: 'P', text: '"我养你"听起来浪漫，落到现实多半是一地鸡毛。', spicy: true },
]

export const QUESTIONS_V2_HC: Question[] = [
  // ========== 冲突风格 H/C (20) ==========
  { id: 71, dim: 'HC', pole: 'H', text: '有了矛盾，我认为"今晚必须说清楚"，哪怕说到凌晨。' },
  { id: 72, dim: 'HC', pole: 'H', text: '对方说"我想静静"，比直接跟你吵一架更让你难受。', spicy: true },
  { id: 73, dim: 'HC', pole: 'H', text: '从不吵架的情侣，多半是有个人在忍。' },
  { id: 74, dim: 'HC', pole: 'H', text: '吵架时翻旧账，恰恰说明旧账从来没有被真正解决过。' },
  { id: 75, dim: 'HC', pole: 'C', text: '对方情绪上头时，最好的做法是先闭嘴，等风浪过去再谈。' },
  { id: 76, dim: 'HC', pole: 'C', text: '吵完架不需要特意和好，第二天正常说话就等于翻篇。' },
  { id: 77, dim: 'HC', pole: 'C', text: '情绪明显上来时，我通常会先暂停对话，等平静一些再继续。' },
  { id: 78, dim: 'HC', pole: 'C', text: '要求"今晚必须说清楚"，有时不是在解决问题，只是在发泄自己的焦虑。' },
  { id: 79, dim: 'HC', pole: 'H', text: '冷战超过一天，我就会开始在心里写分手剧本。', spicy: true },
  { id: 80, dim: 'HC', pole: 'H', text: '我宁愿大吵一架把话说绝，也不想听对方说"随便你"。' },
  { id: 81, dim: 'HC', pole: 'H', text: '伴侣生气了却不直说、让我猜，是我最忍不了的场景。' },
  { id: 82, dim: 'HC', pole: 'H', text: '问题没解决就睡觉，我会失眠到天亮。' },
  { id: 83, dim: 'HC', pole: 'H', text: '道歉不需要多正式，但必须在当天。' },
  { id: 84, dim: 'HC', pole: 'H', text: '"我们先冷静一下"，常常是"我不想面对"的体面说法。' },
  { id: 85, dim: 'HC', pole: 'C', text: '吵架时我说"我需要冷静一下"是真的需要，不是冷暴力。', spicy: true },
  { id: 86, dim: 'HC', pole: 'C', text: '绝大多数争吵，睡一觉起来再看，根本不算事。' },
  { id: 87, dim: 'HC', pole: 'C', text: '对方追着要我立刻谈清楚时，我血压会升高，更不想谈。' },
  { id: 88, dim: 'HC', pole: 'C', text: '有些情绪说出来的那一刻就变味了，写下来发给对方更好。' },
  { id: 89, dim: 'HC', pole: 'C', text: '深夜不适合谈重要的事，再急也等天亮。' },
  { id: 90, dim: 'HC', pole: 'C', text: '真正伤感情的不是吵架，是把吵架直播给共同朋友。' },
]

export const QUESTIONS_V2_TM: Question[] = [
  // ========== 性别角色 T/M (10，嵌入主测试，不进四字母代码) ==========
  { id: 91, dim: 'TM', pole: 'T', text: '男生负责所有的赚钱养家，女生负责所有的照顾家庭——如果真能兑现，生活也会非常开心。', spicy: true },
  { id: 92, dim: 'TM', pole: 'T', text: '约会买单时，男生主动掏钱是风度，女生坚持 AA 反而会让场面有点尴尬。', spicy: true },
  { id: 93, dim: 'TM', pole: 'M', text: '年夜饭在谁家吃、孩子跟谁姓，这些都应该可以商量，没有什么默认答案。', spicy: true },
  { id: 94, dim: 'TM', pole: 'M', text: '传统的性别分工让我窒息，我的亲密关系一定要打破这种分工。', spicy: true },
  { id: 95, dim: 'TM', pole: 'T', text: '女生把重心放在家庭上，不代表她不够独立。', spicy: true },
  { id: 96, dim: 'TM', pole: 'M', text: '孩子出生后谁暂时放下工作带娃，应该由收入和意愿决定，而不是性别。', spicy: true },
  { id: 97, dim: 'TM', pole: 'T', text: '重大场合让男生拿主意，我会觉得安心，而不是被冒犯。', spicy: true },
  { id: 98, dim: 'TM', pole: 'M', text: '家里谁做饭谁洗碗，只看谁有空谁擅长，和性别无关。', spicy: true },
  { id: 99, dim: 'TM', pole: 'T', text: '我就是喜欢被照顾的那一方，这没什么不好意思承认的。', spicy: true },
  { id: 100, dim: 'TM', pole: 'M', text: '未来伴侣收入比我高很多，我也不会因为"谁养家"而别扭。', spicy: true },
]

export const ALL_QUESTIONS_V2: Question[] = [
  ...QUESTIONS_V2, ...QUESTIONS_V2_SG, ...QUESTIONS_V2_RP, ...QUESTIONS_V2_HC, ...QUESTIONS_V2_TM,
]

/** 题目顺序：话题题均匀穿插 */
export function buildQuizOrderV2(): Question[] {
  const spicy = shuffle(ALL_QUESTIONS_V2.filter(q => q.spicy))
  const regular = shuffle(ALL_QUESTIONS_V2.filter(q => !q.spicy))
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

export function computeScoresV2(answers: Record<number, number>, rankings: Record<string, LangKey[]>): Scores {
  const raw: Record<string, number> = {}
  for (const q of ALL_QUESTIONS_V2) {
    const v = answers[q.id]
    if (!v) continue
    raw[q.pole] = (raw[q.pole] ?? 0) + v
  }
  const ll: Record<LangKey, number> = { words: 0, time: 0, gifts: 0, acts: 0, touch: 0 }
  for (const r of RANKINGS) {
    const order = rankings[r.id]
    if (!order) continue
    order.forEach((key, i) => { ll[key] += 5 - i })
  }
  return {
    FI: { F: raw['F'] ?? 0, I: raw['I'] ?? 0 },
    SG: { S: raw['S'] ?? 0, G: raw['G'] ?? 0 },
    RP: { R: raw['R'] ?? 0, P: raw['P'] ?? 0 },
    HC: { H: raw['H'] ?? 0, C: raw['C'] ?? 0 },
    TM: { T: raw['T'] ?? 0, M: raw['M'] ?? 0 },
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
