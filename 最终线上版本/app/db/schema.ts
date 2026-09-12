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
  birthYear: int("birth_year").notNull(),
  city: varchar("city", { length: 64 }).notNull(),
  /** 毕业届别和班级，如 "2016届3班" */
  gradClass: varchar("grad_class", { length: 64 }).notNull(),
  mbti: varchar("mbti", { length: 8 }),
  height: int("height"),
  intro: text("intro"),
  expectation: text("expectation"),
  value: text("value"),
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
