// 恋爱动物人格测试 · 题库 v5
// 4 主维度 + 性别角色(T/M) 共 34 道选择题(1-7 量表) + 3 道排序题
// dim: FI(亲密距离) SG(真爱来源) RP(价值取向) HC(冲突风格) TM(性别角色)
// spicy: 话题题标记，用于均匀穿插

export type Dim = 'FI' | 'SG' | 'RP' | 'HC' | 'TM'

export interface Question {
  id: number
  dim: Dim
  pole: 'F' | 'I' | 'S' | 'G' | 'R' | 'P' | 'H' | 'C' | 'T' | 'M'
  text: string
  spicy?: boolean
}

export const QUESTIONS: Question[] = [
  // ========== 亲密距离 F/I (9) ==========
  { id: 1, dim: 'FI', pole: 'F', text: '对方随口问"昨晚跟你吃饭的同事是男的还是女的"，这种在意让你觉得挺开心的。', spicy: true },
  { id: 2, dim: 'FI', pole: 'F', text: '情绪崩溃的时候，朋友劝一百句，不如对象到场十分钟。' },
  { id: 3, dim: 'FI', pole: 'F', text: '情侣之间交换手机密码，是信任的基本配置。', spicy: true },
  { id: 4, dim: 'FI', pole: 'F', text: '想到退休后和对象 24 小时待在一起，你感到的是期待，而不是窒息。' },
  { id: 5, dim: 'FI', pole: 'I', text: '每周都需要一段完全属于自己的时间，雷打不动，恋爱也不能征用。' },
  { id: 6, dim: 'FI', pole: 'I', text: '情绪低落时，比起立刻被安慰，更想先自己消化完再开口。' },
  { id: 7, dim: 'FI', pole: 'I', text: '"已读不回"大多数时候不是冷落，只是那一刻不想进入对话状态。', spicy: true },
  { id: 8, dim: 'FI', pole: 'I', text: '安全感这种东西，归根到底只能自己给自己。' },
  { id: 9, dim: 'FI', pole: 'I', text: '如果对象想看你和最好朋友的聊天记录，你会不舒服——哪怕你没有任何秘密。', spicy: true },

  // ========== 真爱来源 S/G (6) ==========
  { id: 10, dim: 'SG', pole: 'S', text: '有些人你就是见第一面就知道"会是这个人"，说不清理由。' },
  { id: 11, dim: 'SG', pole: 'S', text: '激情褪去之后，爱情的感觉最终也会跟着消失。', spicy: true },
  { id: 12, dim: 'SG', pole: 'S', text: '所谓"磨合"，很多时候只是两个不合适的人在互相妥协。' },
  { id: 13, dim: 'SG', pole: 'G', text: '灵魂伴侣不是找来的，是两个人相互影响、慢慢形成的。' },
  { id: 14, dim: 'SG', pole: 'G', text: '能把平淡的日子一起过出滋味，比心动一百次都难得。' },
  { id: 15, dim: 'SG', pole: 'G', text: '比起"我们一见钟情"，"我们是一起熬过来的"更让你觉得骄傲。' },

  // ========== 价值取向 R/P (8) ==========
  { id: 16, dim: 'RP', pole: 'R', text: '同样是两千块预算，一场只存在一晚上的烛光晚餐，比一台能用五年的按摩仪更让你心动。' },
  { id: 17, dim: 'RP', pole: 'R', text: '和爱的人挤在出租屋吃泡面的人生，即使贫穷，也依然很幸福。', spicy: true },
  { id: 18, dim: 'RP', pole: 'R', text: '为爱辞掉工作、奔赴对方的城市，是勇敢，不是冲动。', spicy: true },
  { id: 19, dim: 'RP', pole: 'R', text: '彩礼不该成为结婚的门槛，两个人愿意比什么都重要。', spicy: true },
  { id: 20, dim: 'RP', pole: 'P', text: '长久的感情最后拼的是生活能力：谁做饭、谁修水龙头、谁记得缴电费。' },
  { id: 21, dim: 'RP', pole: 'P', text: '收到昂贵礼物，你的第一反应是算自己该回什么价。', spicy: true },
  { id: 22, dim: 'RP', pole: 'P', text: '结婚是两个家庭的合并报表，不只是两个人的事。', spicy: true },
  { id: 23, dim: 'RP', pole: 'P', text: '情侣间涉及大额资金转账时，有必要标明转账或借款目的。', spicy: true },

  // ========== 冲突风格 H/C (7) ==========
  { id: 24, dim: 'HC', pole: 'H', text: '有了矛盾，你的默认动作是"今晚必须说清楚"，哪怕说到凌晨。' },
  { id: 25, dim: 'HC', pole: 'H', text: '对方说"我想静静"，比直接跟你吵一架更让你难受。', spicy: true },
  { id: 26, dim: 'HC', pole: 'H', text: '从不吵架的情侣，多半是有个人在忍。' },
  { id: 27, dim: 'HC', pole: 'H', text: '吵架时翻旧账，恰恰说明旧账从来没有被真正解决过。' },
  { id: 28, dim: 'HC', pole: 'C', text: '对方情绪上头时，最好的做法是先闭嘴，等风浪过去再谈。' },
  { id: 29, dim: 'HC', pole: 'C', text: '吵完架不需要特意和好，第二天正常说话就等于翻篇。' },
  { id: 30, dim: 'HC', pole: 'C', text: '要求"今晚必须说清楚"，有时不是在解决问题，只是在发泄自己的焦虑。' },

  // ========== 性别角色 T/M (4，嵌入主测试，不进四字母代码) ==========
  { id: 31, dim: 'TM', pole: 'T', text: '男生负责所有的赚钱养家，女生负责所有的照顾家庭——如果真能兑现，生活也会非常开心。', spicy: true },
  { id: 32, dim: 'TM', pole: 'T', text: '约会买单时，男生主动掏钱是风度，女生坚持 AA 反而会让场面有点尴尬。', spicy: true },
  { id: 33, dim: 'TM', pole: 'M', text: '年夜饭在谁家吃、孩子跟谁姓，这些都应该可以商量，没有什么默认答案。', spicy: true },
  { id: 34, dim: 'TM', pole: 'M', text: '传统的性别分工让我窒息，我的亲密关系一定要打破这种分工。', spicy: true },
]

export type LangKey = 'words' | 'time' | 'gifts' | 'acts' | 'touch'

export interface RankingQuestion {
  id: string
  title: string
  hint: string
  options: { key: LangKey; text: string }[]
}

export const RANKINGS: RankingQuestion[] = [
  {
    id: 'rank1',
    title: '以下五个时刻，按"幸福感"从强到弱排序',
    hint: '点击选项即完成排序：先点的排第 1',
    options: [
      { key: 'words', text: '一句具体到细节的用心赞美：不是"你真棒"，而是"你刚才处理那件事的方式，换别人早慌了，只有你能这么稳"' },
      { key: 'time', text: '一次完全符合你审美的精心约会：两个人都不看手机，随着心流过完一整个下午' },
      { key: 'gifts', text: 'TA 送你的礼物，是你半年前随口提过、自己都忘了的东西' },
      { key: 'acts', text: '回到家，碗洗了、垃圾倒了、一顿认真做的晚餐摆在桌上' },
      { key: 'touch', text: '冬天窝在同一条毯子里，TA 从背后环住你，下巴搁在你肩窝，一部剧刷完，暖得谁都不想先动' },
    ],
  },
  {
    id: 'rank2',
    title: '哪个瞬间最让你觉得"就是这个人了"？按打动程度排序',
    hint: '点击选项即完成排序：先点的排第 1',
    options: [
      { key: 'words', text: 'TA 在众人面前认真地说："你是我遇到过最特别的人。"' },
      { key: 'time', text: '你们沿着江边走了三个小时，什么都没干，就是聊不完' },
      { key: 'gifts', text: '你随口提过最喜欢的小玩意，被 TA 悄悄买了下来' },
      { key: 'acts', text: '你发烧时，TA 请假陪你去医院，跑前跑后一整天' },
      { key: 'touch', text: '一个疲惫的下午，你们相拥着躺下，听着彼此的呼吸声，一起沉沉睡去' },
    ],
  },
  {
    id: 'rank3',
    title: '以下哪个瞬间最让你扣分？按"可忍受程度"从最能忍到最不能忍排序',
    hint: '先点的排第 1（最能忍）',
    options: [
      { key: 'words', text: '吵架时 TA 脱口而出："你能不能别这么作？"' },
      { key: 'time', text: '约会时 TA 全程刷手机，嗯嗯啊啊地敷衍你' },
      { key: 'gifts', text: '你生日那天，TA 什么都没准备，只说"回头补给你"' },
      { key: 'acts', text: '家里乱成一团，TA 视而不见，等你回来收拾' },
      { key: 'touch', text: '你想抱一下的时候，TA 下意识地侧身躲开了' },
    ],
  },
]

/** 题目顺序：话题题均匀穿插，性别角色题嵌入主测试 */
export function buildQuizOrder(): Question[] {
  const spicy = shuffle(QUESTIONS.filter(q => q.spicy))
  const regular = shuffle(QUESTIONS.filter(q => !q.spicy))
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

export function shuffledRankings(): RankingQuestion[] {
  return shuffle(RANKINGS).map(r => ({ ...r, options: shuffle(r.options) }))
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface Scores {
  FI: { F: number; I: number }
  SG: { S: number; G: number }
  RP: { R: number; P: number }
  HC: { H: number; C: number }
  TM: { T: number; M: number }
  LL: Record<LangKey, number>
}

/** answers: {questionId: 1-7}；rankings: {rankId: [按顺序的 option key]} */
export function computeScores(answers: Record<number, number>, rankings: Record<string, LangKey[]>): Scores {
  const raw: Record<string, number> = {}
  for (const q of QUESTIONS) {
    const v = answers[q.id]
    if (!v) continue
    raw[q.pole] = (raw[q.pole] ?? 0) + v
  }
  const ll: Record<LangKey, number> = { words: 0, time: 0, gifts: 0, acts: 0, touch: 0 }
  for (const r of RANKINGS) {
    const order = rankings[r.id]
    if (!order) continue
    order.forEach((key, i) => { ll[key] += 5 - i }) // 第1名5分 … 第5名1分
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

export function getTypeCode(s: Scores): string {
  return [
    s.FI.F >= s.FI.I ? 'F' : 'I',
    s.SG.S >= s.SG.G ? 'S' : 'G',
    s.RP.R >= s.RP.P ? 'R' : 'P',
    s.HC.H >= s.HC.C ? 'H' : 'C',
  ].join('')
}

export const DIM_META = [
  { key: 'FI' as const, left: 'F', right: 'I', leftName: '融合', rightName: '独立', leftEn: 'Fusion', rightEn: 'Independence', title: '亲密距离' },
  { key: 'SG' as const, left: 'S', right: 'G', leftName: '火花', rightName: '养成', leftEn: 'Spark', rightEn: 'Growth', title: '真爱来源' },
  { key: 'RP' as const, left: 'R', right: 'P', leftName: '浪漫', rightName: '务实', leftEn: 'Romance', rightEn: 'Pragmatism', title: '价值取向' },
  { key: 'HC' as const, left: 'H', right: 'C', leftName: '热处理', rightName: '冷处理', leftEn: 'Hot', rightEn: 'Cold', title: '冲突风格' },
  { key: 'TM' as const, left: 'T', right: 'M', leftName: '保守', rightName: '自由', leftEn: 'Conservative', rightEn: 'Liberal', title: '性别角色' },
]

export const LOVE_LANGUAGES: Record<LangKey, { name: string; desc: string }> = {
  words: { name: '肯定的言辞', desc: '具体的夸奖和真诚的表达，是你的第一充电方式' },
  time: { name: '精心的时刻', desc: '全神贯注的陪伴，比任何礼物都让你感到被爱' },
  gifts: { name: '接收礼物', desc: '礼物是"被惦记着"的实体证据，大小不重要' },
  acts: { name: '服务的行动', desc: '洗好的碗、倒掉的垃圾，行动永远比话术动听' },
  touch: { name: '身体的接触', desc: '拥抱和贴贴是你的充电桩，挨着就踏实' },
}
