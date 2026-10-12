import {
  mysqlTable,
  serial,
  varchar,
  text,
  int,
  bigint,
  timestamp,
} from "drizzle-orm/mysql-core";

export const responses = mysqlTable("responses", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  typeCode: varchar("type_code", { length: 8 }).notNull(),
  /** JSON: { [questionId]: 1-7 } */
  answers: text("answers").notNull(),
  /** JSON: { [rankId]: [ordered option keys] } */
  rankings: text("rankings").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** 题库 v2 作答表（38 题基底扩展至 100 题，问卷首题收集性别） */
export const responsesV2 = mysqlTable("responses_v2", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  typeCode: varchar("type_code", { length: 8 }).notNull(),
  gender: varchar("gender", { length: 8 }).notNull(),
  /** JSON: { [questionId]: 1-7 } */
  answers: text("answers").notNull(),
  /** JSON: { [rankId]: [ordered option keys] } */
  rankings: text("rankings").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** 最终版题库（51 题）作答表，含每题作答毫秒数（用于平局裁定与研究） */
export const responsesV3 = mysqlTable("responses_v3", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  typeCode: varchar("type_code", { length: 8 }).notNull(),
  gender: varchar("gender", { length: 8 }).notNull(),
  /** JSON: { [questionId]: 1-7 } */
  answers: text("answers").notNull(),
  /** JSON: { [rankId]: [ordered option keys] } */
  rankings: text("rankings").notNull(),
  /** JSON: { [questionId]: 作答毫秒数 } */
  timings: text("timings").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** 校友约会计划报名表（与 responses 通过 sessionId 关联） */
export const profiles = mysqlTable("profiles", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  wechat: varchar("wechat", { length: 64 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  gender: varchar("gender", { length: 8 }).notNull(),
  /** 快速注册可空，/me 补全 */
  birthYear: int("birth_year"),
  /** 快速注册可空，/me 补全 */
  city: varchar("city", { length: 64 }),
  /** 毕业届别和班级，如 "2016届3班"；快速注册可空，/me 补全 */
  gradClass: varchar("grad_class", { length: 64 }),
  mbti: varchar("mbti", { length: 8 }),
  height: int("height"),
  /** 职业/行业 */
  job: varchar("job", { length: 64 }),
  /** 结构化雷区：期望对方最低身高（cm） */
  prefMinHeight: int("pref_min_height"),
  /** 结构化雷区：期望对方出生年范围 */
  prefBirthFrom: int("pref_birth_from"),
  prefBirthTo: int("pref_birth_to"),
  /** 结构化雷区：是否接受异地（接受 / 不接受 / 看情况） */
  acceptDistance: varchar("accept_distance", { length: 8 }),
  intro: text("intro"),
  expectation: text("expectation"),
  value: text("value"),
  /** 隐私政策勾选时间（报名时记录） */
  consentAt: timestamp("consent_at"),
  /** 月老对话合并进来的择偶需求与关键反馈，不覆盖报名表原字段 */
  chatFacts: text("chat_facts"),
  /** 本周约会倾向 JSON：{ locations, activities, times, customLocation, customActivity } */
  datePrefs: text("date_prefs"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** 短信验证码（按手机号覆盖写入） */
export const otpCodes = mysqlTable("otp_codes", {
  phone: varchar("phone", { length: 20 }).primaryKey(),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  sentAt: bigint("sent_at", { mode: "number" }).notNull(),
  hourStarted: bigint("hour_started", { mode: "number" }).notNull(),
  hourCount: int("hour_count").notNull(),
});

/** 站点访问（按会话记一次，用于后台每日次数与来源） */
export const visits = mysqlTable("visits", {
  id: serial("id").primaryKey(),
  dayKey: varchar("day_key", { length: 10 }).notNull(),
  source: varchar("source", { length: 128 }).notNull(),
  referrer: varchar("referrer", { length: 512 }).notNull(),
  path: varchar("path", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** 运营手动配对 */
export const matchPairs = mysqlTable("match_pairs", {
  id: serial("id").primaryKey(),
  weekKey: varchar("week_key", { length: 16 }).notNull(),
  leftSession: varchar("left_session", { length: 64 }).notNull(),
  rightSession: varchar("right_session", { length: 64 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===== 以下为 T2/T3 新增：微信月老机器人与每周节奏 =====

/** 微信客服原始消息（敏感个人信息，见 T5 加密） */
export const kfMessages = mysqlTable("kf_messages", {
  id: serial("id").primaryKey(),
  externalUserid: varchar("external_userid", { length: 64 }).notNull(),
  msgid: varchar("msgid", { length: 64 }),
  /** user=用户发的 bot=机器人回复 relay=传话转发 */
  origin: varchar("origin", { length: 8 }).notNull(),
  content: text("content"),
  raw: text("raw"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** 机器人用户：微信 external_userid ↔ profiles 报名行 */
export const botUsers = mysqlTable("bot_users", {
  id: serial("id").primaryKey(),
  externalUserid: varchar("external_userid", { length: 64 }).notNull().unique(),
  profileId: bigint("profile_id", { mode: "number" }),
  name: varchar("name", { length: 64 }),
  /** 状态机：idle / matched / chatting / confirming / dating / feedback */
  state: varchar("state", { length: 16 }).notNull().default("idle"),
  /** 择偶需求 JSON（LLM 摘要，zod 校验） */
  requirements: text("requirements"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** 每周周期（一周一行，状态由调度器推进） */
export const weeklyCycles = mysqlTable("weekly_cycles", {
  id: serial("id").primaryKey(),
  weekKey: varchar("week_key", { length: 16 }).notNull().unique(),
  /** idle / matched / chatting / confirming / dating / feedback / closed */
  state: varchar("state", { length: 16 }).notNull().default("idle"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** 每周配对（机器人侧；与运营手动 match_pairs 并存） */
export const matches = mysqlTable("matches", {
  id: serial("id").primaryKey(),
  weekKey: varchar("week_key", { length: 16 }).notNull(),
  manProfileId: bigint("man_profile_id", { mode: "number" }).notNull(),
  womanProfileId: bigint("woman_profile_id", { mode: "number" }).notNull(),
  reason: text("reason"),
  /** pending_send / sent / chatting / confirmed / declined / dating / done / cancelled */
  state: varchar("state", { length: 16 }).notNull().default("pending_send"),
  /** 男方是否见面：yes / no，未回复为空 */
  manReply: varchar("man_reply", { length: 8 }),
  /** 女方是否见面：yes / no，未回复为空 */
  womanReply: varchar("woman_reply", { length: 8 }),
  /** 已用小纸条的日期，JSON 字符串数组 */
  manNoteDays: text("man_note_days"),
  womanNoteDays: text("woman_note_days"),
  /** 周五确认短信是否已发，避免每分钟重发 */
  fridaySmsSent: int("friday_sms_sent").notNull().default(0),
  /** 回访：是否成行 / 评分 1-5 / 是否愿意继续 */
  met: int("met"),
  score: int("score"),
  willing: varchar("willing", { length: 8 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** 匹配池：报名用户进/出池，匹配只在同一 org_tag 内发生 */
export const matchPool = mysqlTable("match_pool", {
  id: serial("id").primaryKey(),
  profileId: bigint("profile_id", { mode: "number" }).notNull().unique(),
  orgTag: varchar("org_tag", { length: 64 }).notNull().default("default"),
  gender: varchar("gender", { length: 8 }).notNull(),
  /** in=在池 / out=出池 / review=差评待人工复核 */
  state: varchar("state", { length: 16 }).notNull().default("in"),
  /** 轮空优先：上周没配上的下周优先 */
  priority: int("priority").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** 调度器动作日志 */
export const cronLogs = mysqlTable("cron_logs", {
  id: serial("id").primaryKey(),
  action: varchar("action", { length: 64 }).notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** 合作商户（到店回扣） */
export const merchants = mysqlTable("merchants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  address: varchar("address", { length: 255 }),
  /** 回扣单价（分） */
  rebateCents: int("rebate_cents").notNull().default(0),
  /** active / paused */
  status: varchar("status", { length: 16 }).notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** 到店核销记录 */
export const redemptions = mysqlTable("redemptions", {
  id: serial("id").primaryKey(),
  matchId: bigint("match_id", { mode: "number" }).notNull(),
  merchantId: bigint("merchant_id", { mode: "number" }).notNull(),
  /** 到店确认时间（未确认为 null） */
  confirmedAt: timestamp("confirmed_at"),
  /** pending / settled */
  settleStatus: varchar("settle_status", { length: 16 }).notNull().default("pending"),
  note: varchar("note", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** 审计日志：后台写操作与对外消息发送 */
export const auditLogs = mysqlTable("audit_logs", {
  id: serial("id").primaryKey(),
  actor: varchar("actor", { length: 64 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  target: varchar("target", { length: 128 }),
  detail: text("detail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** 支付/退款占位（T5/T6：真实支付等 ICP 落地后接入，金额一律以分存储） */
export const payments = mysqlTable("payments", {
  id: serial("id").primaryKey(),
  matchId: bigint("match_id", { mode: "number" }),
  /** 金额（分）；占位阶段为 0 */
  amountCents: int("amount_cents").notNull().default(0),
  currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
  /** pending / paid / refund_pending / refunded */
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  /** 退款原因，如 no-show（对方爽约且回访确认） */
  reason: varchar("reason", { length: 128 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** 用户照片（/me 页上传，最多 9 张；文件存 data/photos/，库里只存文件名） */
export const photos = mysqlTable("photos", {
  id: serial("id").primaryKey(),
  profileId: bigint("profile_id", { mode: "number" }).notNull(),
  file: varchar("file", { length: 128 }).notNull(),
  mime: varchar("mime", { length: 32 }).notNull(),
  size: int("size").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** 会员初始/自改密码（临时登录方式；手机号唯一键）。回滚短信登录时此表停用 */
export const memberCredentials = mysqlTable("member_credentials", {
  phone: varchar("phone", { length: 20 }).primaryKey(),
  passwordHash: varchar("password_hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** 键值配置（DeepSeek 匹配 prompt、最近一次匹配结果等） */
export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
