// MBTI 16 型 · 中文通行昵称 + 爱情指南（30–50 字）
// 昵称采用 16personalities 官方中文译名；形象为官方 3D 角色图（仅内部活动使用）

export interface MbtiType {
  code: string
  name: string   // 中文通行昵称（如「提倡者」）
  love: string   // 爱情指南（30–50 字）
  avatar: string // /mbti/<CODE>.png
}

export const MBTI_TYPES: Record<string, MbtiType> = {
  // 分析家（NT）
  INTJ: { code: 'INTJ', name: '建筑师', love: '动心了就认真规划：约会路线、未来三年、备用方案——爱对你而言，是深思熟虑后的笃定。', avatar: '/mbti/INTJ.png' },
  INTP: { code: 'INTP', name: '逻辑学家', love: '你需要一个能聊到天亮的脑子。爱就是每个深夜，都想把刚想到的问题抛给对方。', avatar: '/mbti/INTP.png' },
  ENTJ: { code: 'ENTJ', name: '指挥官', love: '你看上的人会直接追。爱情也是战场，拿下之后，你想把全世界都交给对方一起管。', avatar: '/mbti/ENTJ.png' },
  ENTP: { code: 'ENTP', name: '辩论家', love: '斗嘴是你的调情方式。能接住你的梗、还敢当场顶嘴的人，你会爱得特别上头。', avatar: '/mbti/ENTP.png' },
  // 外交家（NF）
  INFJ: { code: 'INFJ', name: '提倡者', love: '你爱得很深也很慢，先要灵魂上的确认。一旦认定，就是把对方写进余生的那种认真。', avatar: '/mbti/INFJ.png' },
  INFP: { code: 'INFP', name: '调停者', love: '你心里装着一整部爱情电影。别把对方架上神坛，真实的 TA 比想象里更值得爱。', avatar: '/mbti/INFP.png' },
  ENFJ: { code: 'ENFJ', name: '主人公', love: '你天生就会照顾人，恋人是你的重点关怀对象。只是别忘了，留一份温柔给自己。', avatar: '/mbti/ENFJ.png' },
  ENFP: { code: 'ENFP', name: '竞选者', love: '你的喜欢像烟花，热烈又好看。新鲜感退潮之后还愿意留下来的，那才是爱情。', avatar: '/mbti/ENFP.png' },
  // 守护者（SJ）
  ISTJ: { code: 'ISTJ', name: '物流师', love: '你不怎么说情话，但每个承诺都兑现。爱情在你这里，是一份认真履行的长期合同。', avatar: '/mbti/ISTJ.png' },
  ISFJ: { code: 'ISFJ', name: '守卫者', love: '你把爱都藏在细节里：姜茶、雨伞、准点的晚安。也要学会开口，要一个回应。', avatar: '/mbti/ISFJ.png' },
  ESTJ: { code: 'ESTJ', name: '总经理', love: '你谈感情也讲效率和结果。慢一点——约会不是项目评审，心动不需要打分。', avatar: '/mbti/ESTJ.png' },
  ESFJ: { code: 'ESFJ', name: '执政官', love: '恋爱里你是气氛组组长，谁都照顾得周到。记得常问一句：我自己今天想要什么。', avatar: '/mbti/ESFJ.png' },
  // 探险家（SP）
  ISTP: { code: 'ISTP', name: '鉴赏家', love: '你需要大把的自由，也需要一个不多问的人。爱不爱，别猜，看你的行动就知道。', avatar: '/mbti/ISTP.png' },
  ISFP: { code: 'ISFP', name: '探险家', love: '你爱得安静又敏感，擅长用小事表达心意。偶尔把「喜欢」说出口，效果会翻倍。', avatar: '/mbti/ISFP.png' },
  ESTP: { code: 'ESTP', name: '企业家', love: '你要的爱情是鲜活的：一起玩、一起疯、一起解决问题。只是别跑太快，等等对方。', avatar: '/mbti/ESTP.png' },
  ESFP: { code: 'ESFP', name: '表演者', love: '你是恋爱里的快乐发动机。热闹散场之后，深夜那场真心话，最见感情。', avatar: '/mbti/ESFP.png' },
}

export const MBTI_LIST = Object.values(MBTI_TYPES)
