// MBTI 16 型 · 中文通行昵称 + 一句话爱情指南
// 昵称采用 16personalities 官方中文译名；头像为程序化生成的字母形象图

export interface MbtiType {
  code: string
  name: string   // 中文通行昵称（如「提倡者」）
  love: string   // 爱情指南一句话（≤30 字）
  avatar: string // /mbti/<CODE>.svg
}

export const MBTI_TYPES: Record<string, MbtiType> = {
  // 分析家（NT）
  INTJ: { code: 'INTJ', name: '建筑师', love: '喜欢就直说，别把告白也做成风险评估表。', avatar: '/mbti/INTJ.svg' },
  INTP: { code: 'INTP', name: '逻辑学家', love: '爱不是证明题，偶尔放下分析，先牵对方的手。', avatar: '/mbti/INTP.svg' },
  ENTJ: { code: 'ENTJ', name: '指挥官', love: '约会别像开会，今晚让对方做决定，你负责鼓掌。', avatar: '/mbti/ENTJ.svg' },
  ENTP: { code: 'ENTP', name: '辩论家', love: '拌嘴是情趣不是输赢，争到一半记得先吻对方。', avatar: '/mbti/ENTP.svg' },
  // 外交家（NF）
  INFJ: { code: 'INFJ', name: '提倡者', love: '慢热不是冷淡，认定后会很久，请直接敲门别试探。', avatar: '/mbti/INFJ.svg' },
  INFP: { code: 'INFP', name: '调停者', love: '少在心里排练一百种结局，把喜欢当面说给他听。', avatar: '/mbti/INFP.svg' },
  ENFJ: { code: 'ENFJ', name: '主人公', love: '照顾全世界之前，先问自己今晚想被怎样爱着。', avatar: '/mbti/ENFJ.svg' },
  ENFP: { code: 'ENFP', name: '竞选者', love: '新鲜感会褪色，把第一百次约会过得像第一次。', avatar: '/mbti/ENFP.svg' },
  // 守护者（SJ）
  ISTJ: { code: 'ISTJ', name: '物流师', love: '浪漫不必昂贵，记得纪念日并把答应的小事做到。', avatar: '/mbti/ISTJ.svg' },
  ISFJ: { code: 'ISFJ', name: '守卫者', love: '付出要说出口，委屈也一样，别让沉默替你恋爱。', avatar: '/mbti/ISFJ.svg' },
  ESTJ: { code: 'ESTJ', name: '总经理', love: '爱里没有KPI，放下打分表，多夸夸今天的对方。', avatar: '/mbti/ESTJ.svg' },
  ESFJ: { code: 'ESFJ', name: '执政官', love: '别只顾张罗所有人开心，留一道菜的时间给自己。', avatar: '/mbti/ESFJ.svg' },
  // 探险家（SP）
  ISTP: { code: 'ISTP', name: '鉴赏家', love: '行动派也要开口，修好东西之余，说句我在乎你。', avatar: '/mbti/ISTP.svg' },
  ISFP: { code: 'ISFP', name: '探险家', love: '别用沉默代替回答，你的温柔值得被直接听见。', avatar: '/mbti/ISFP.svg' },
  ESTP: { code: 'ESTP', name: '企业家', love: '追的时候全力以赴，追到手后也请保持同款热情。', avatar: '/mbti/ESTP.svg' },
  ESFP: { code: 'ESFP', name: '表演者', love: '热闹散场后，记得问对方今天过得累不累。', avatar: '/mbti/ESFP.svg' },
}

export const MBTI_LIST = Object.values(MBTI_TYPES)
