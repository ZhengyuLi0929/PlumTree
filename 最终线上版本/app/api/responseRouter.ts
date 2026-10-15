import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware";
import { ensureTable, getDb, hasDatabase } from "./queries/connection";
import { responses, responsesV2, responsesV3, profiles, matchPairs, visits, matches, matchPool, merchants, redemptions, botUsers } from "../db/schema";
import { logAudit } from "./lib/audit";
import { setPoolState } from "./lib/botStore";
import { addPhoto, listPhotos, removePhoto } from "./lib/photos";
import { moveCredential, setPassword, verifyPassword } from "./lib/credentials";
import { participatesThisWeek } from "./lib/botStore";
import {
  isoWeekKey,
  isValidInvite,
  normalizePhone,
  normalizeWechat,
  PHONE_RE,
  hashOtp,
  randomOtp,
  readEnroll,
  signEnroll,
} from "./lib/enroll";
import { clearOtp, getOtp, putOtp } from "./lib/otp";
import { sendOtpSms } from "./lib/sms";
import { smsConfigured, env } from "./lib/env";
import { timingSafeEqual } from "node:crypto";
import {
  clearMemberCookieHeader,
  memberCookieHeader,
  memberTokenFromRequest,
  readMemberToken,
  signMember,
} from "./lib/member";
import {
  adminCookieHeader,
  adminPasswordConfigured,
  adminPasswordMatches,
  clearAdminCookieHeader,
  readAdminToken,
  signAdmin,
  tokenFromRequest,
} from "./lib/admin";
import { classifyVisitSource, cstDayKey, shiftDayKey } from "./lib/visit";
import { insertPoolEntry } from "./lib/botStore";
import { FINAL_QUESTIONS } from "../src/data/questions-final";

function fail(code: TRPCError["code"], message: string): never {
  throw new TRPCError({ code, message });
}

const PREVIEW_SESSION = "preview-session";

/** 预览用户：假资料打底；本地库里 preview-session 行的修改会覆盖进来（预览也能真保存） */
async function previewMember() {
  const answers: Record<string, number> = {};
  const timings: Record<string, number> = {};
  for (const question of FINAL_QUESTIONS) {
    answers[String(question.id)] = question.pole === "F" || question.pole === "S" || question.pole === "R" || question.pole === "H" ? 6 : 2;
    timings[String(question.id)] = 1200;
  }
  const order = ["words", "time", "gifts", "acts", "touch"];
  const base = {
    profile: {
      name: "预览用户",
      wechat: "preview_wx",
      phone: "13800000000",
      gender: "女",
      birthYear: 1998,
      city: "北京",
      gradClass: "2016届7班",
      mbti: "INFJ",
      height: 165,
      job: "产品经理",
      prefMinHeight: 175,
      prefBirthFrom: 1994,
      prefBirthTo: 2000,
      acceptDistance: "不接受",
      intro: "这是本地预览用的假资料，用来看登录后的页面，不会写入数据库。",
      expectation: "温和、有自己的事做、愿意沟通。",
      value: "互相尊重，不冷暴力。",
      datePrefs: null as string | null,
      participate: false as boolean,
    },
    quiz: {
      typeCode: "FSRH",
      gender: "女",
      answers,
      rankings: { rank1: order, rank2: order, rank3: order },
      timings,
    },
    chatFacts: {
      preferences: {
        regions: ["北京"],
        heightMin: 175,
        personality: ["温和", "爱聊天"],
        dealbreakers: ["抽烟"],
        notes: "对话里补充过：希望对方在北京。",
      },
      feedback: ["见面确认：男方见面，女方不见，这次不成", "回访：成了，评分 4，继续 想"],
    },
    photos: [],
    matches: [
      { weekKey: "2026-W41", state: "declined", mine: "见面", theirs: "不见", met: null, score: null, willing: null },
      { weekKey: "2026-W40", state: "done", mine: "见面", theirs: "见面", met: 1, score: 4, willing: "想" },
    ],
  };
  // 本地预览档案（preview-session）里改过的字段覆盖假数据
  try {
    if (hasDatabase()) {
      await ensureTable();
      const [saved] = await getDb().select().from(profiles).where(eq(profiles.sessionId, PREVIEW_SESSION));
      if (saved) {
        base.profile = {
          ...base.profile,
          name: saved.name,
          wechat: saved.wechat,
          gender: saved.gender,
          birthYear: saved.birthYear,
          city: saved.city,
          gradClass: saved.gradClass,
          mbti: saved.mbti,
          height: saved.height,
          job: saved.job,
          prefMinHeight: saved.prefMinHeight,
          prefBirthFrom: saved.prefBirthFrom,
          prefBirthTo: saved.prefBirthTo,
          acceptDistance: saved.acceptDistance,
          intro: saved.intro,
          expectation: saved.expectation,
          value: saved.value,
          datePrefs: saved.datePrefs,
        } as typeof base.profile; // 可空列落到预览档案，前端已判空
        (base.profile as { participate?: boolean }).participate = participatesThisWeek(saved.datePrefs);
      }
    }
  } catch {
    /* 预览覆盖失败就用假数据 */
  }
  return base;
}

function dbUnavailable(err: unknown): never {
  console.error("[db]", err);
  fail("INTERNAL_SERVER_ERROR", "数据库连不上。请检查 DATABASE_URL，以及 MySQL 是否已启动。");
}

/** 会员鉴权：从 cookie 里的 member token 拿手机号，取最新一条报名档案 */
async function requireMemberProfile(req: Request) {
  const token = memberTokenFromRequest(req);
  if (!token) fail("UNAUTHORIZED", "请先用手机号登录");
  let phone = "";
  try {
    phone = await readMemberToken(token);
  } catch {
    fail("UNAUTHORIZED", "登录已过期，请重新获取验证码");
  }
  await ensureTable();
  const db = getDb();
  const people = await db.select().from(profiles).where(eq(profiles.phone, phone));
  const profile = people.sort((a, b) => b.id - a.id)[0];
  if (!profile) fail("NOT_FOUND", "没有找到这个手机号的报名资料");
  return profile;
}

async function requireAdmin(req: Request) {
  const token = tokenFromRequest(req);
  if (!token) fail("UNAUTHORIZED", "请先输入管理员密码");
  try {
    await readAdminToken(token);
  } catch {
    fail("UNAUTHORIZED", "登录已过期，请重新输入管理员密码");
  }
}

/** 校验短信验证码：过期/错码 fail，成功则作废 */
async function verifyOtpCode(phone: string, code: string) {
  const row = await getOtp(phone);
  const now = Date.now();
  if (!row || row.expiresAt < now) fail("BAD_REQUEST", "验证码已过期，请重新获取");
  const actual = Buffer.from(hashOtp(phone, code));
  const expected = Buffer.from(row.codeHash);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    fail("UNAUTHORIZED", "验证码不对");
  }
  await clearOtp(phone);
}

const likertAnswers = z.record(z.string(), z.number().int().min(1).max(7));
const rankingAnswers = z.record(z.string(), z.array(z.string()).length(5));

const currentYear = new Date().getFullYear();

export const responseRouter = createRouter({
  submit: publicQuery
    .input(
      z.object({
        sessionId: z.string().min(8).max(64),
        typeCode: z.string().length(4),
        answers: likertAnswers,
        rankings: rankingAnswers,
      })
    )
    .mutation(async ({ input }) => {
      await ensureTable();
      const db = getDb();
      await db.insert(responses).values({
        sessionId: input.sessionId,
        typeCode: input.typeCode,
        answers: JSON.stringify(input.answers),
        rankings: JSON.stringify(input.rankings),
      });
      return { ok: true };
    }),

  // 题库 v2 作答提交（首题已收集性别）
  submitV2: publicQuery
    .input(
      z.object({
        sessionId: z.string().min(8).max(64),
        typeCode: z.string().length(4),
        gender: z.enum(["男", "女"]),
        answers: likertAnswers,
        rankings: rankingAnswers,
      })
    )
    .mutation(async ({ input }) => {
      await ensureTable();
      const db = getDb();
      await db.insert(responsesV2).values({
        sessionId: input.sessionId,
        typeCode: input.typeCode,
        gender: input.gender,
        answers: JSON.stringify(input.answers),
        rankings: JSON.stringify(input.rankings),
      });
      return { ok: true };
    }),

  // 最终版题库（51 题）提交，含每题作答毫秒数
  submitV3: publicQuery
    .input(
      z.object({
        sessionId: z.string().min(8).max(64),
        typeCode: z.string().length(4),
        gender: z.enum(["男", "女"]),
        answers: likertAnswers,
        rankings: rankingAnswers,
        timings: z.record(z.string(), z.number().int().min(0).max(600_000)),
      })
    )
    .mutation(async ({ input }) => {
      if (!hasDatabase()) {
        return { ok: true, stored: false };
      }
      try {
        await ensureTable();
      } catch (err) {
        dbUnavailable(err);
      }
      const db = getDb();
      await db.insert(responsesV3).values({
        sessionId: input.sessionId,
        typeCode: input.typeCode,
        gender: input.gender,
        answers: JSON.stringify(input.answers),
        rankings: JSON.stringify(input.rankings),
        timings: JSON.stringify(input.timings),
      });
      return { ok: true, stored: true };
    }),

  startEnroll: publicQuery
    .input(
      z.object({
        sessionId: z.string().min(8).max(64),
        wechat: z.string(),
        inviteCode: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      if (!isValidInvite(input.inviteCode)) fail("BAD_REQUEST", "邀请码不正确，暂时不能参加匹配");
      const wechat = normalizeWechat(input.wechat);
      if (wechat.length < 2 || wechat.length > 64) fail("BAD_REQUEST", "请填写微信号");
      const token = await signEnroll({ phone: "", wechat, sessionId: input.sessionId });
      return { ok: true, token, wechat };
    }),

  // 校友约会计划报名（须先完成邀请码 + 微信号）
  register: publicQuery
    .input(
      z.object({
        token: z.string().min(16),
        sessionId: z.string().min(8).max(64),
        name: z.string().trim().min(1).max(64),
        gender: z.enum(["男", "女"]),
        birthYear: z.number().int().min(currentYear - 80).max(currentYear - 16),
        city: z.string().trim().min(1).max(64),
        gradClass: z.string().trim().min(1).max(64),
        mbti: z.string().trim().max(8).optional(),
        height: z.number().int().min(130).max(230).optional(),
        job: z.string().trim().max(64).optional(),
        prefMinHeight: z.number().int().min(140).max(210).optional(),
        prefBirthFrom: z.number().int().min(currentYear - 80).max(currentYear - 16).optional(),
        prefBirthTo: z.number().int().min(currentYear - 80).max(currentYear - 16).optional(),
        acceptDistance: z.enum(["接受", "不接受", "看情况"]).optional(),
        intro: z.string().trim().min(30, "自我介绍至少写 30 字，匹配要靠它了解你").max(300),
        expectation: z.string().trim().max(300).optional(),
        value: z.string().trim().max(300).optional(),
        consent: z.literal(true, { error: "请先阅读并勾选《隐私政策》" }),
      })
        .refine(
          (v) =>
            v.prefBirthFrom === undefined ||
            v.prefBirthTo === undefined ||
            v.prefBirthFrom <= v.prefBirthTo,
          { message: "期望出生年范围下限不能大于上限" },
        )
        .refine(
          // 法定婚龄校验（按当年计算）：男 22 / 女 20
          (v) => (v.gender === "男" ? v.birthYear <= currentYear - 22 : v.birthYear <= currentYear - 20),
          { message: "还没到法定婚龄（男 22 / 女 20），先好好长大，过两年再来～" },
        ),
    )
    .mutation(async ({ input }) => {
      let claims;
      try {
        claims = await readEnroll(input.token);
      } catch {
        fail("UNAUTHORIZED", "请先填写邀请码和微信号");
      }
      if (claims.sessionId !== input.sessionId) fail("UNAUTHORIZED", "报名凭证与本次测试不匹配，请重新验证");
      if (!hasDatabase()) fail("PRECONDITION_FAILED", "本机尚未配置数据库，资料无法写入。请先按 .env.example 启动 MySQL。");

      try {
        await ensureTable();
      } catch (err) {
        dbUnavailable(err);
      }
      const db = getDb();
      const inserted = await db.insert(profiles).values({
        sessionId: input.sessionId,
        name: input.name,
        wechat: claims.wechat,
        phone: "",
        gender: input.gender,
        birthYear: input.birthYear,
        city: input.city,
        gradClass: input.gradClass,
        mbti: input.mbti || null,
        height: input.height ?? null,
        job: input.job || null,
        prefMinHeight: input.prefMinHeight ?? null,
        prefBirthFrom: input.prefBirthFrom ?? null,
        prefBirthTo: input.prefBirthTo ?? null,
        acceptDistance: input.acceptDistance || null,
        intro: input.intro || null,
        expectation: input.expectation || null,
        value: input.value || null,
        consentAt: new Date(),
      });
      // 报名即入匹配池（org_tag 默认 default，后台可调整）
      await insertPoolEntry(Number(inserted[0].insertId), input.gender);
      return { ok: true };
    }),

  adminLogin: publicQuery
    .input(z.object({ password: z.string().min(1).max(128) }))
    .mutation(async ({ input, ctx }) => {
      if (!adminPasswordConfigured()) fail("PRECONDITION_FAILED", "服务器尚未配置 ADMIN_PASSWORD");
      if (!adminPasswordMatches(input.password)) fail("UNAUTHORIZED", "管理员密码不正确");
      const token = await signAdmin();
      ctx.resHeaders.append("Set-Cookie", adminCookieHeader(token));
      return { ok: true, token };
    }),

  adminLogout: publicQuery.mutation(async ({ ctx }) => {
    ctx.resHeaders.append("Set-Cookie", clearAdminCookieHeader());
    return { ok: true };
  }),

  sendLoginCode: publicQuery
    .input(z.object({ name: z.string().trim().min(1).max(64), phone: z.string().min(11).max(20) }))
    .mutation(async ({ input }) => {
      const phone = normalizePhone(input.phone);
      if (!PHONE_RE.test(phone)) fail("BAD_REQUEST", "请填写有效的大陆手机号");
      if (!smsConfigured() && env.isProduction) fail("PRECONDITION_FAILED", "短信服务还没配好，暂时不能发验证码");
      await ensureTable();
      const db = getDb();
      const people = await db.select().from(profiles).where(eq(profiles.phone, phone));
      if (people.length > 0) {
        // 手机号有档案：姓名必须对得上其中一条
        if (!people.some((p) => p.name.trim() === input.name)) {
          fail("NOT_FOUND", "这个手机号和姓名对不上。请使用校友活动登记的手机号");
        }
      } else {
        // 手机号没档案：只放行"姓名有报名记录、且还没绑定手机号"的情况
        const sameName = await db.select().from(profiles).where(eq(profiles.name, input.name));
        if (!sameName.some((p) => !p.phone)) {
          fail("NOT_FOUND", "没有找到这个名字的报名记录，请确认和测试时填的一致");
        }
      }
      const now = Date.now();
      const existing = await getOtp(phone);
      if (existing && now - existing.sentAt < 60_000) fail("TOO_MANY_REQUESTS", "验证码刚发过，请 60 秒后再试");
      let hourStarted = existing?.hourStarted ?? now;
      let hourCount = existing?.hourCount ?? 0;
      if (now - hourStarted > 3_600_000) {
        hourStarted = now;
        hourCount = 0;
      }
      if (hourCount >= 5) fail("TOO_MANY_REQUESTS", "这个小时的验证码次数用完了");
      const code = randomOtp();
      // 本地开发没配短信时不发信，直接把验证码带回给前端（仅开发用）
      const devOnly = !smsConfigured();
      if (!devOnly) await sendOtpSms(phone, code);
      await putOtp({
        phone,
        codeHash: hashOtp(phone, code),
        expiresAt: now + 10 * 60_000,
        sentAt: now,
        hourStarted,
        hourCount: hourCount + 1,
      });
      return devOnly ? { ok: true, devCode: code } : { ok: true };
    }),

  verifyLoginCode: publicQuery
    .input(
      z.object({
        phone: z.string().min(11).max(20),
        code: z.string().regex(/^\d{6}$/),
        name: z.string().trim().min(1).max(64).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const phone = normalizePhone(input.phone);
      if (!PHONE_RE.test(phone)) fail("BAD_REQUEST", "请填写有效的大陆手机号");
      await verifyOtpCode(phone, input.code);
      // 报名留了姓名但还没绑定手机号的档案，这次登录顺手补上手机号
      if (input.name) {
        await ensureTable();
        await getDb()
          .update(profiles)
          .set({ phone })
          .where(and(eq(profiles.name, input.name), eq(profiles.phone, "")));
      }
      ctx.resHeaders.append("Set-Cookie", memberCookieHeader(await signMember(phone)));
      return { ok: true };
    }),

  // 姓名+手机号登录（不发短信验证码，直接对报名记录）
  memberLoginByName: publicQuery
    .input(z.object({ name: z.string().trim().min(1).max(64), phone: z.string().min(11).max(20) }))
    .mutation(async ({ input, ctx }) => {
      const phone = normalizePhone(input.phone);
      if (!PHONE_RE.test(phone)) fail("BAD_REQUEST", "请填写有效的大陆手机号");
      await ensureTable();
      const db = getDb();
      const people = await db.select().from(profiles).where(eq(profiles.phone, phone));
      const named = people.filter((p) => p.name.trim() === input.name);
      const profile = named.sort((a, b) => b.id - a.id)[0];
      if (!profile) fail("NOT_FOUND", "姓名和手机号对不上报名记录");
      ctx.resHeaders.append("Set-Cookie", memberCookieHeader(await signMember(phone)));
      return { ok: true, name: profile.name };
    }),

  // 测试完成后的快速注册：验证码 + 姓名 + 手机号 + 同意隐私政策
  memberRegister: publicQuery
    .input(
      z.object({
        sessionId: z.string().min(8).max(64),
        name: z.string().trim().min(1).max(64),
        phone: z.string().min(11).max(20),
        code: z.string().regex(/^\d{6}$/),
        consent: z.literal(true, { error: "请先阅读并勾选《隐私政策》" }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const phone = normalizePhone(input.phone);
      if (!PHONE_RE.test(phone)) fail("BAD_REQUEST", "请填写有效的大陆手机号");
      await verifyOtpCode(phone, input.code);
      await ensureTable();
      const db = getDb();
      // 手机号已有档案：视为老会员登录，直接签 cookie
      const people = await db.select().from(profiles).where(eq(profiles.phone, phone));
      if (people.length > 0) {
        ctx.resHeaders.append("Set-Cookie", memberCookieHeader(await signMember(phone)));
        return { ok: true, created: false };
      }
      // 性别取该 sessionId 最新一次测试作答；没做过测试不让注册
      const quizzes = await db.select().from(responsesV3).where(eq(responsesV3.sessionId, input.sessionId));
      const quiz = quizzes.sort((a, b) => b.id - a.id)[0];
      if (!quiz) fail("BAD_REQUEST", "请先完成恋爱人格测试");
      await db.insert(profiles).values({
        sessionId: input.sessionId,
        name: input.name,
        wechat: "",
        phone,
        gender: quiz.gender,
        birthYear: null,
        city: null,
        gradClass: null,
        consentAt: new Date(),
      });
      ctx.resHeaders.append("Set-Cookie", memberCookieHeader(await signMember(phone)));
      return { ok: true, created: true };
    }),

  memberLogout: publicQuery.mutation(async ({ ctx }) => {
    ctx.resHeaders.append("Set-Cookie", clearMemberCookieHeader());
    return { ok: true };
  }),

  /** 临时登录方式：姓名 + 手机号 + 初始密码（密码由组织者手动发放） */
  memberLoginPassword: publicQuery
    .input(
      z.object({
        name: z.string().trim().min(1).max(64),
        phone: z.string().min(11).max(20),
        password: z.string().min(6).max(64),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const phone = normalizePhone(input.phone);
      if (!PHONE_RE.test(phone)) fail("BAD_REQUEST", "请填写有效的大陆手机号");
      await ensureTable();
      const db = getDb();
      const people = await db.select().from(profiles).where(eq(profiles.phone, phone));
      const named = people.filter((p) => p.name.trim() === input.name.trim());
      const profile = named.sort((a, b) => b.id - a.id)[0]; // 重复报名以最新一条为准
      if (!profile) {
        // 名单外的人（报了名但没手机号记录）：第一次登录，填什么手机号就用什么，
        // 输入的密码直接成为 TA 的密码（冷启动，熟人场不验证）
        const byName = await db
          .select()
          .from(profiles)
          .where(and(eq(profiles.name, input.name.trim()), eq(profiles.phone, "")));
        const first = byName.sort((a, b) => b.id - a.id)[0];
        if (!first) fail("NOT_FOUND", "姓名和手机号对不上报名记录");
        if (input.password.length < 8) fail("BAD_REQUEST", "第一次登录请设置至少 8 位密码（以后就用它登录）");
        await db.update(profiles).set({ phone }).where(eq(profiles.id, first.id));
        await setPassword(phone, input.password);
        ctx.resHeaders.append("Set-Cookie", memberCookieHeader(await signMember(phone)));
        return { ok: true, name: first.name, created: true };
      }
      const ok = await verifyPassword(phone, input.password);
      if (ok === null) fail("PRECONDITION_FAILED", "还没有给你发初始密码，请联系组织者获取");
      if (!ok) fail("UNAUTHORIZED", "密码不对，再试一次");
      ctx.resHeaders.append("Set-Cookie", memberCookieHeader(await signMember(phone)));
      return { ok: true, name: profile.name };
    }),

  /** 登录后改密码：校验旧密码，新密码 8-32 位且字母+数字 */
  memberChangePassword: publicQuery
    .input(
      z.object({
        oldPassword: z.string().min(1).max(64),
        newPassword: z
          .string()
          .min(8, "新密码至少 8 位")
          .max(32, "新密码最多 32 位")
          .regex(/^(?=.*[a-zA-Z])(?=.*\d)[\x21-\x7e]+$/, "新密码要同时包含字母和数字"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const profile = await requireMemberProfile(ctx.req);
      const phone = profile.phone;
      if (!phone) fail("PRECONDITION_FAILED", "你的档案还没有手机号，请先补全");
      const ok = await verifyPassword(phone, input.oldPassword);
      if (ok === null) fail("PRECONDITION_FAILED", "还没有初始密码记录，请联系组织者");
      if (!ok) fail("UNAUTHORIZED", "原密码不对");
      await setPassword(phone, input.newPassword);
      return { ok: true };
    }),

  memberMe: publicQuery
    .input(z.object({ preview: z.boolean().optional() }).optional())
    .query(async ({ input, ctx }) => {
    if (input?.preview) {
      // 预览对所有人开放（纯假数据 + 本地 preview 档案），但 previewUpdate 写库仍只在开发环境
      return await previewMember();
    }
    const token = memberTokenFromRequest(ctx.req);
    if (!token) fail("UNAUTHORIZED", "请先用手机号登录");
    let phone = "";
    try {
      phone = await readMemberToken(token);
    } catch {
      fail("UNAUTHORIZED", "登录已过期，请重新获取验证码");
    }
    await ensureTable();
    const db = getDb();
    const people = await db.select().from(profiles).where(eq(profiles.phone, phone));
    const profile = people.sort((a, b) => b.id - a.id)[0];
    if (!profile) fail("NOT_FOUND", "没有找到这个手机号的报名资料");
    const quizzes = await db.select().from(responsesV3).where(eq(responsesV3.sessionId, profile.sessionId));
    const quiz = quizzes.sort((a, b) => b.id - a.id)[0];
    const pairRows = await db
      .select()
      .from(matches)
      .where(or(eq(matches.manProfileId, profile.id), eq(matches.womanProfileId, profile.id)));
    const recent = pairRows.sort((a, b) => b.id - a.id).slice(0, 5);
    let chatFacts: { preferences?: Record<string, unknown>; feedback?: string[] } = {};
    if (profile.chatFacts) {
      try {
        chatFacts = JSON.parse(profile.chatFacts) as typeof chatFacts;
      } catch {
        chatFacts = {};
      }
    }
    const word = (value: string | null) => (value === "yes" ? "见面" : value === "no" ? "不见" : "未回复");
    return {
      profile: {
        name: profile.name,
        wechat: profile.wechat,
        phone: profile.phone,
        gender: profile.gender,
        birthYear: profile.birthYear,
        city: profile.city,
        gradClass: profile.gradClass,
        mbti: profile.mbti,
        height: profile.height,
        job: profile.job,
        prefMinHeight: profile.prefMinHeight,
        prefBirthFrom: profile.prefBirthFrom,
        prefBirthTo: profile.prefBirthTo,
        acceptDistance: profile.acceptDistance,
        intro: profile.intro,
        expectation: profile.expectation,
        value: profile.value,
        datePrefs: profile.datePrefs,
        participate: participatesThisWeek(profile.datePrefs),
      },
      photos: await listPhotos(profile.id),
      quiz: quiz
        ? {
            typeCode: quiz.typeCode,
            gender: quiz.gender,
            answers: JSON.parse(quiz.answers) as Record<string, number>,
            rankings: JSON.parse(quiz.rankings) as Record<string, string[]>,
            timings: JSON.parse(quiz.timings) as Record<string, number>,
          }
        : null,
      chatFacts,
      matches: recent.map((row) => {
        const mine = row.manProfileId === profile.id ? row.manReply : row.womanReply;
        const theirs = row.manProfileId === profile.id ? row.womanReply : row.manReply;
        return {
          weekKey: row.weekKey,
          state: row.state,
          mine: word(mine),
          theirs: word(theirs),
          met: row.met,
          score: row.score,
          willing: row.willing,
        };
      }),
    };
  }),

  /** 会员修改自己的资料（白名单字段；改手机号会同时换登录态） */
  memberUpdate: publicQuery
    .input(
      z.object({
        name: z.string().trim().min(1).max(64).optional(),
        gender: z.enum(["男", "女"]).optional(),
        birthYear: z.number().int().min(1946).max(2010).nullable().optional(),
        phone: z.string().min(11).max(20).nullable().optional(),
        wechat: z.string().trim().min(2).max(64).optional(),
        city: z.string().trim().min(1).max(64).optional(),
        gradClass: z.string().trim().min(1).max(64).optional(),
        mbti: z.string().trim().max(8).optional(),
        height: z.number().int().min(130).max(230).nullable().optional(),
        job: z.string().trim().max(64).optional(),
        prefMinHeight: z.number().int().min(140).max(210).nullable().optional(),
        prefBirthFrom: z.number().int().min(currentYear - 80).max(currentYear - 16).nullable().optional(),
        prefBirthTo: z.number().int().min(currentYear - 80).max(currentYear - 16).nullable().optional(),
        acceptDistance: z.enum(["接受", "不接受", "看情况"]).nullable().optional(),
        intro: z.string().trim().min(30).max(300).optional(),
        expectation: z.string().trim().max(300).optional(),
        value: z.string().trim().max(300).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const profile = await requireMemberProfile(ctx.req);
      const patch: Record<string, unknown> = {};
      const { phone: rawPhone, ...rest } = input;
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) patch[k] = v === "" ? null : v;
      }
      if (rawPhone !== undefined) {
        if (rawPhone === null) {
          patch.phone = null;
        } else {
          const phone = normalizePhone(rawPhone);
          if (!PHONE_RE.test(phone)) fail("BAD_REQUEST", "请填写有效的大陆手机号");
          patch.phone = phone;
        }
      }
      if (Object.keys(patch).length === 0) fail("BAD_REQUEST", "没有要修改的字段");
      if (
        patch.prefBirthFrom != null &&
        patch.prefBirthTo != null &&
        (patch.prefBirthFrom as number) > (patch.prefBirthTo as number)
      ) {
        fail("BAD_REQUEST", "期望出生年范围下限不能大于上限");
      }
      await getDb().update(profiles).set(patch).where(eq(profiles.id, profile.id));
      // 手机号换了：登录态和密码凭证都跟着新手机号走
      if (typeof patch.phone === "string" && patch.phone) {
        if (profile.phone && profile.phone !== patch.phone) {
          await moveCredential(profile.phone, patch.phone);
        }
        ctx.resHeaders.append("Set-Cookie", memberCookieHeader(await signMember(patch.phone)));
      }
      return { ok: true };
    }),

  /** 保存本周约会倾向（地点/活动/时间多选 + 自定义文本 + 是否参加本周） */
  memberSaveDatePrefs: publicQuery
    .input(
      z.object({
        participate: z.boolean(),
        locations: z.array(z.string().max(32)).max(17),
        activities: z.array(z.string().max(32)).max(5),
        times: z.array(z.string().max(16)).max(6),
        customLocation: z.string().trim().max(100).optional(),
        customActivity: z.string().trim().max(100).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const profile = await requireMemberProfile(ctx.req);
      // 打开参加开关就必须填齐地点/活动/时间
      if (input.participate) {
        if (!input.locations.length || !input.activities.length || !input.times.length) {
          fail("BAD_REQUEST", "参加本周匹配需要填齐：倾向地点、倾向活动、可约会时间");
        }
      }
      // 倾向按周生效：存当前周键，下周自动失效回到「不参加」
      await getDb()
        .update(profiles)
        .set({ datePrefs: JSON.stringify({ ...input, weekKey: isoWeekKey() }) })
        .where(eq(profiles.id, profile.id));
      return { ok: true };
    }),

  /** 预览模式专用：把修改写进 preview-session 档案（仅本地开发可用） */
  previewUpdate: publicQuery
    .input(
      z.object({
        profile: z
          .object({
            name: z.string().trim().min(1).max(64).optional(),
            gender: z.enum(["男", "女"]).optional(),
            birthYear: z.number().int().min(1946).max(2010).nullable().optional(),
            wechat: z.string().trim().max(64).optional(),
            city: z.string().trim().max(64).nullable().optional(),
            gradClass: z.string().trim().max(64).nullable().optional(),
            mbti: z.string().trim().max(8).nullable().optional(),
            height: z.number().int().min(130).max(230).nullable().optional(),
            job: z.string().trim().max(64).nullable().optional(),
            prefMinHeight: z.number().int().min(140).max(210).nullable().optional(),
            prefBirthFrom: z.number().int().nullable().optional(),
            prefBirthTo: z.number().int().nullable().optional(),
            acceptDistance: z.enum(["接受", "不接受", "看情况"]).nullable().optional(),
            intro: z.string().trim().max(300).optional(),
            expectation: z.string().trim().max(300).optional(),
            value: z.string().trim().max(300).optional(),
          })
          .optional(),
        datePrefs: z
          .object({
            participate: z.boolean().optional(),
            locations: z.array(z.string().max(32)).max(17),
            activities: z.array(z.string().max(32)).max(5),
            times: z.array(z.string().max(16)).max(6),
            customLocation: z.string().trim().max(100).optional(),
            customActivity: z.string().trim().max(100).optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      if (env.isProduction) fail("FORBIDDEN", "预览只在本地开发打开");
      await ensureTable();
      const db = getDb();
      const [existing] = await db.select().from(profiles).where(eq(profiles.sessionId, PREVIEW_SESSION));
      const patch: Record<string, unknown> = { ...(input.profile ?? {}) };
      if (input.datePrefs) patch.datePrefs = JSON.stringify({ ...input.datePrefs, weekKey: isoWeekKey() });
      if (existing) {
        if (Object.keys(patch).length) await db.update(profiles).set(patch).where(eq(profiles.id, existing.id));
      } else {
        await db.insert(profiles).values({
          sessionId: PREVIEW_SESSION,
          name: "预览用户",
          wechat: "preview_wx",
          phone: "13800000000",
          gender: "女",
          birthYear: 1998,
          city: "北京",
          gradClass: "2016届7班",
          ...patch,
        });
      }
      return { ok: true };
    }),

  /** 上传照片（base64，最多 9 张） */
  memberUploadPhoto: publicQuery
    .input(z.object({ mime: z.string().max(32), dataBase64: z.string().max(12_000_000, "图片太大，请换一张小一点的（手机照片直接传一般都没问题）") }))
    .mutation(async ({ input, ctx }) => {
      const profile = await requireMemberProfile(ctx.req);
      try {
        const photo = await addPhoto(profile.id, input.mime, input.dataBase64);
        return { ok: true as const, photo };
      } catch (err) {
        fail("BAD_REQUEST", err instanceof Error ? err.message : "上传失败");
      }
    }),

  memberDeletePhoto: publicQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const profile = await requireMemberProfile(ctx.req);
      const ok = await removePhoto(profile.id, input.id);
      if (!ok) fail("NOT_FOUND", "照片不存在");
      return { ok: true };
    }),

  adminMe: publicQuery.query(async ({ ctx }) => {
    await requireAdmin(ctx.req);
    return { ok: true };
  }),

  trackVisit: publicQuery
    .input(
      z.object({
        path: z.string().max(255).optional(),
        referrer: z.string().max(512).optional(),
        landing: z.string().max(1024).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const path = (input.path || "/").slice(0, 255);
      if (path.startsWith("/admin") || path.startsWith("/stats")) return { ok: true, stored: false };
      if (!hasDatabase()) return { ok: true, stored: false };
      try {
        await ensureTable();
      } catch (err) {
        dbUnavailable(err);
      }
      const referrer = (input.referrer || "").slice(0, 512);
      await getDb().insert(visits).values({
        dayKey: cstDayKey(),
        source: classifyVisitSource(referrer, input.landing || path),
        referrer,
        path,
      });
      return { ok: true, stored: true };
    }),

  visitStats: publicQuery.query(async ({ ctx }) => {
    await requireAdmin(ctx.req);
    await ensureTable();
    const rows = await getDb().select().from(visits);
    const today = cstDayKey();
    const cutoff = shiftDayKey(today, -29);

    const byDay = new Map<string, number>();
    const bySource = new Map<string, number>();
    let total = 0;
    let todayCount = 0;
    for (const row of rows) {
      const dayKey = String(row.dayKey).slice(0, 10);
      total += 1;
      if (dayKey === today) todayCount += 1;
      if (dayKey >= cutoff && dayKey <= today) byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);
      bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
    }

    const days: { day: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const key = shiftDayKey(today, -i);
      days.push({ day: key, count: byDay.get(key) ?? 0 });
    }

    return {
      today: todayCount,
      total,
      days,
      sources: [...bySource.entries()]
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
    };
  }),

  // 运营指标看板（T3）：每周配对数、确认率、成行率、回访均分、池内性别比
  opsStats: publicQuery.query(async ({ ctx }) => {
    await requireAdmin(ctx.req);
    await ensureTable();
    const db = getDb();
    const weekKey = isoWeekKey();
    const weekMatches = await db.select().from(matches).where(eq(matches.weekKey, weekKey));
    const poolRows = await db.select().from(matchPool).where(eq(matchPool.state, "in"));

    const sentOrLater = weekMatches.filter((m) => m.state !== "pending_send" && m.state !== "cancelled");
    const confirmed = weekMatches.filter((m) => ["confirmed", "dating", "done"].includes(m.state));
    const feedbackGiven = weekMatches.filter((m) => m.met !== null || m.score !== null);
    const metYes = weekMatches.filter((m) => m.met === 1);
    const scores = weekMatches.map((m) => m.score).filter((s): s is number => s !== null);

    return {
      weekKey,
      weeklyPairs: weekMatches.length,
      pendingSend: weekMatches.filter((m) => m.state === "pending_send").length,
      cancelled: weekMatches.filter((m) => m.state === "cancelled").length,
      confirmRate: sentOrLater.length ? Math.round((confirmed.length / sentOrLater.length) * 100) : null,
      meetRate: feedbackGiven.length ? Math.round((metYes.length / feedbackGiven.length) * 100) : null,
      avgScore: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
      poolMen: poolRows.filter((p) => p.gender === "男").length,
      poolWomen: poolRows.filter((p) => p.gender === "女").length,
      poolReview: (await db.select().from(matchPool).where(eq(matchPool.state, "review"))).length,
    };
  }),

  roster: publicQuery.query(async ({ ctx }) => {
    await requireAdmin(ctx.req);
    await ensureTable();
    const db = getDb();
    const weekKey = isoWeekKey();
    const profRows = await db.select().from(profiles);
    const resp3Rows = await db.select().from(responsesV3);
    const pairRows = await db.select().from(matchPairs).where(eq(matchPairs.weekKey, weekKey));

    const latestProfile = new Map<string, (typeof profRows)[number]>();
    for (const p of profRows) {
      const prev = latestProfile.get(p.sessionId);
      if (!prev || p.id > prev.id) latestProfile.set(p.sessionId, p);
    }
    const latestQuiz = new Map<string, (typeof resp3Rows)[number]>();
    for (const r of resp3Rows) {
      const prev = latestQuiz.get(r.sessionId);
      if (!prev || r.id > prev.id) latestQuiz.set(r.sessionId, r);
    }

    const users = [...latestProfile.values()].map((p) => {
      const quiz = latestQuiz.get(p.sessionId);
      return {
        sessionId: p.sessionId,
        name: p.name,
        wechat: p.wechat,
        phone: p.phone,
        gender: quiz?.gender ?? p.gender,
        birthYear: p.birthYear,
        city: p.city,
        gradClass: p.gradClass,
        mbti: p.mbti,
        height: p.height,
        job: p.job,
        prefMinHeight: p.prefMinHeight,
        prefBirthFrom: p.prefBirthFrom,
        prefBirthTo: p.prefBirthTo,
        acceptDistance: p.acceptDistance,
        intro: p.intro,
        expectation: p.expectation,
        value: p.value,
        typeCode: quiz?.typeCode ?? null,
        participate: participatesThisWeek(p.datePrefs),
        answers: quiz ? (JSON.parse(quiz.answers) as Record<string, number>) : {},
        rankings: quiz ? (JSON.parse(quiz.rankings) as Record<string, string[]>) : {},
        timings: quiz ? (JSON.parse(quiz.timings) as Record<string, number>) : {},
        createdAt: p.createdAt,
      };
    });

    return {
      weekKey,
      users,
      pairs: pairRows.map((row) => ({
        id: row.id,
        weekKey: row.weekKey,
        leftSession: row.leftSession,
        rightSession: row.rightSession,
        note: row.note,
      })),
    };
  }),

  savePair: publicQuery
    .input(
      z.object({
        leftSession: z.string().min(8).max(64),
        rightSession: z.string().min(8).max(64),
        note: z.string().trim().max(200).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.req);
      if (input.leftSession === input.rightSession) fail("BAD_REQUEST", "不能把同一个人配成一对");
      await ensureTable();
      const db = getDb();
      const weekKey = isoWeekKey();
      await db.delete(matchPairs).where(
        and(
          eq(matchPairs.weekKey, weekKey),
          or(
            eq(matchPairs.leftSession, input.leftSession),
            eq(matchPairs.rightSession, input.leftSession),
            eq(matchPairs.leftSession, input.rightSession),
            eq(matchPairs.rightSession, input.rightSession),
          ),
        ),
      );
      await db.insert(matchPairs).values({
        weekKey,
        leftSession: input.leftSession,
        rightSession: input.rightSession,
        note: input.note || null,
      });
      // 同步进 matches 表（/me 本周同桌的TA tab、传话、约会邀请都读 matches）：
      // 先删掉这两人本周在 matches 里的 pending 记录，再插手动配对
      const profRows = await db.select().from(profiles);
      const bySession = new Map(profRows.map((p) => [p.sessionId, p]));
      const left = bySession.get(input.leftSession);
      const right = bySession.get(input.rightSession);
      if (left && right) {
        const man = left.gender === "男" ? left : right.gender === "男" ? right : null;
        const woman = left.gender === "女" ? left : right.gender === "女" ? right : null;
        if (man && woman) {
          await db.delete(matches).where(
            and(
              eq(matches.weekKey, weekKey),
              eq(matches.state, "pending_send"),
              or(
                eq(matches.manProfileId, man.id), eq(matches.womanProfileId, man.id),
                eq(matches.manProfileId, woman.id), eq(matches.womanProfileId, woman.id),
              ),
            ),
          );
          await db.insert(matches).values({
            weekKey,
            manProfileId: man.id,
            womanProfileId: woman.id,
            reason: `手动匹配${input.note ? ` · ${input.note}` : ""}`,
            state: "pending_send",
          });
        }
      }
      return { ok: true, weekKey };
    }),

  removePair: publicQuery
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.req);
      await ensureTable();
      const db = getDb();
      await db.delete(matchPairs).where(eq(matchPairs.id, input.id));
      return { ok: true };
    }),

  // ===== T4：空投队列 / 匹配池 / 商户 / 核销 =====

  airdropQueue: publicQuery.query(async ({ ctx }) => {
    await requireAdmin(ctx.req);
    await ensureTable();
    const db = getDb();
    const weekKey = isoWeekKey();
    const rows = await db.select().from(matches).where(eq(matches.weekKey, weekKey));
    const profRows = await db.select().from(profiles);
    const botRows = await db.select().from(botUsers);
    const nameOf = new Map(profRows.map((p) => [p.id, p.name]));
    const bound = new Set(botRows.map((b) => b.profileId));
    return {
      weekKey,
      items: rows.map((m) => ({
        id: m.id,
        state: m.state,
        reason: m.reason,
        man: nameOf.get(m.manProfileId) ?? `#${m.manProfileId}`,
        woman: nameOf.get(m.womanProfileId) ?? `#${m.womanProfileId}`,
        manBound: bound.has(m.manProfileId),
        womanBound: bound.has(m.womanProfileId),
        createdAt: m.createdAt,
      })),
    };
  }),

  confirmAirdrop: publicQuery
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.req);
      const { sendAirdrop } = await import("./lib/airdrop");
      const r = await sendAirdrop(input.id);
      await logAudit("admin", "airdrop.confirm", `match:${input.id}`, r);
      return { ok: true, ...r };
    }),

  /** 预览将要发送的短信内容（不发送），并告知短信服务是否已配置 */
  airdropPreview: publicQuery
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await requireAdmin(ctx.req);
      const { previewAirdrop } = await import("./lib/airdrop");
      return previewAirdrop(input.id);
    }),

  /** 单个用户全量资料（手动匹配弹窗用：档案 + 测验 + 照片 + 约会倾向） */
  userDetail: publicQuery
    .input(z.object({ sessionId: z.string().min(8).max(64) }))
    .query(async ({ input, ctx }) => {
      await requireAdmin(ctx.req);
      await ensureTable();
      const db = getDb();
      const people = await db.select().from(profiles).where(eq(profiles.sessionId, input.sessionId));
      const profile = people.sort((a, b) => b.id - a.id)[0];
      if (!profile) fail("NOT_FOUND", "没有找到这个人的报名资料");
      const { listPhotos } = await import("./lib/photos");
      const { participatesThisWeek } = await import("./lib/botStore");
      let datePrefs: Record<string, unknown> | null = null;
      try {
        datePrefs = profile.datePrefs ? (JSON.parse(profile.datePrefs) as Record<string, unknown>) : null;
      } catch {
        datePrefs = null;
      }
      return {
        profile: {
          name: profile.name,
          wechat: profile.wechat,
          phone: profile.phone,
          gender: profile.gender,
          birthYear: profile.birthYear,
          city: profile.city,
          gradClass: profile.gradClass,
          mbti: profile.mbti,
          height: profile.height,
          job: profile.job,
          prefMinHeight: profile.prefMinHeight,
          prefBirthFrom: profile.prefBirthFrom,
          prefBirthTo: profile.prefBirthTo,
          acceptDistance: profile.acceptDistance,
          intro: profile.intro,
          expectation: profile.expectation,
          value: profile.value,
          consentAt: profile.consentAt,
          createdAt: profile.createdAt,
        },
        photos: await listPhotos(profile.id),
        datePrefs,
        participate: participatesThisWeek(profile.datePrefs),
      };
    }),

  confirmAllAirdrops: publicQuery.mutation(async ({ ctx }) => {
    await requireAdmin(ctx.req);
    await ensureTable();
    const db = getDb();
    const weekKey = isoWeekKey();
    const pending = await db.select().from(matches).where(and(eq(matches.weekKey, weekKey), eq(matches.state, "pending_send")));
    const { sendAirdrop } = await import("./lib/airdrop");
    let done = 0;
    const errors: string[] = [];
    for (const m of pending) {
      try {
        await sendAirdrop(m.id);
        done++;
      } catch (err) {
        errors.push(`#${m.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await logAudit("admin", "airdrop.confirmAll", weekKey, { total: pending.length, done, errors });
    return { ok: true, total: pending.length, done, errors };
  }),

  poolList: publicQuery.query(async ({ ctx }) => {
    await requireAdmin(ctx.req);
    await ensureTable();
    const db = getDb();
    const poolRows = await db.select().from(matchPool);
    const profRows = await db.select().from(profiles);
    const profOf = new Map(profRows.map((p) => [p.id, p]));
    return poolRows.map((p) => ({
      profileId: p.profileId,
      name: profOf.get(p.profileId)?.name ?? `#${p.profileId}`,
      city: profOf.get(p.profileId)?.city ?? "",
      gender: p.gender,
      orgTag: p.orgTag,
      state: p.state,
      priority: p.priority,
      participate: participatesThisWeek(profOf.get(p.profileId)?.datePrefs ?? null),
    }));
  }),

  poolSetState: publicQuery
    .input(z.object({ profileId: z.number().int().positive(), state: z.enum(["in", "out", "review"]) }))
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.req);
      await setPoolState(input.profileId, input.state);
      await logAudit("admin", "pool.setState", `profile:${input.profileId}`, input.state);
      return { ok: true };
    }),

  poolSetOrgTag: publicQuery
    .input(z.object({ profileId: z.number().int().positive(), orgTag: z.string().trim().min(1).max(64) }))
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.req);
      await ensureTable();
      await getDb().update(matchPool).set({ orgTag: input.orgTag }).where(eq(matchPool.profileId, input.profileId));
      await logAudit("admin", "pool.setOrgTag", `profile:${input.profileId}`, input.orgTag);
      return { ok: true };
    }),

  merchantsList: publicQuery.query(async ({ ctx }) => {
    await requireAdmin(ctx.req);
    await ensureTable();
    return getDb().select().from(merchants);
  }),

  merchantSave: publicQuery
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        name: z.string().trim().min(1).max(64),
        address: z.string().trim().max(255).optional(),
        rebateCents: z.number().int().min(0),
        status: z.enum(["active", "paused"]).default("active"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.req);
      await ensureTable();
      const db = getDb();
      if (input.id) {
        await db
          .update(merchants)
          .set({ name: input.name, address: input.address || null, rebateCents: input.rebateCents, status: input.status })
          .where(eq(merchants.id, input.id));
      } else {
        await db.insert(merchants).values({ name: input.name, address: input.address || null, rebateCents: input.rebateCents, status: input.status });
      }
      await logAudit("admin", "merchant.save", input.name, { id: input.id ?? "new" });
      return { ok: true };
    }),

  merchantRemove: publicQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.req);
      await ensureTable();
      await getDb().delete(merchants).where(eq(merchants.id, input.id));
      await logAudit("admin", "merchant.remove", `merchant:${input.id}`);
      return { ok: true };
    }),

  redemptionsList: publicQuery.query(async ({ ctx }) => {
    await requireAdmin(ctx.req);
    await ensureTable();
    const db = getDb();
    const rows = await db.select().from(redemptions);
    const merchRows = await db.select().from(merchants);
    const nameOf = new Map(merchRows.map((m) => [m.id, m.name]));
    return rows.map((r) => ({
      ...r,
      merchantName: nameOf.get(r.merchantId) ?? `#${r.merchantId}`,
    }));
  }),

  redemptionCreate: publicQuery
    .input(z.object({ matchId: z.number().int().positive(), merchantId: z.number().int().positive(), note: z.string().trim().max(255).optional() }))
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.req);
      await ensureTable();
      await getDb().insert(redemptions).values({ matchId: input.matchId, merchantId: input.merchantId, note: input.note || null });
      await logAudit("admin", "redemption.create", `match:${input.matchId}`, input);
      return { ok: true };
    }),

  redemptionConfirm: publicQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.req);
      await ensureTable();
      await getDb().update(redemptions).set({ confirmedAt: new Date() }).where(eq(redemptions.id, input.id));
      await logAudit("admin", "redemption.confirm", `redemption:${input.id}`);
      return { ok: true };
    }),

  redemptionSettle: publicQuery
    .input(z.object({ id: z.number().int().positive(), status: z.enum(["pending", "settled"]) }))
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.req);
      await ensureTable();
      await getDb().update(redemptions).set({ settleStatus: input.status }).where(eq(redemptions.id, input.id));
      await logAudit("admin", "redemption.settle", `redemption:${input.id}`, input.status);
      return { ok: true };
    }),

  // ===== DeepSeek 匹配后台 =====

  dsGetPrompt: publicQuery.query(async ({ ctx }) => {
    await requireAdmin(ctx.req);
    const { getSetting, DEFAULT_DS_PROMPT, DS_PROMPT_KEY } = await import("./lib/dsMatch");
    const saved = await getSetting(DS_PROMPT_KEY);
    return { prompt: saved ?? DEFAULT_DS_PROMPT, isDefault: !saved };
  }),

  dsSetPrompt: publicQuery
    .input(z.object({ prompt: z.string().min(100).max(8000) }))
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.req);
      const { setSetting, DS_PROMPT_KEY } = await import("./lib/dsMatch");
      await setSetting(DS_PROMPT_KEY, input.prompt);
      await logAudit("admin", "dsMatch.setPrompt", undefined, `长度 ${input.prompt.length}`);
      return { ok: true };
    }),

  dsGetTunables: publicQuery.query(async ({ ctx }) => {
    await requireAdmin(ctx.req);
    const { getTunables } = await import("./lib/dsMatch");
    return getTunables();
  }),

  dsSetTunables: publicQuery
    .input(z.object({ topK: z.number().int().min(1).max(30), concurrency: z.number().int().min(1).max(10) }))
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.req);
      const { setSetting, DS_TUNABLES_KEY } = await import("./lib/dsMatch");
      await setSetting(DS_TUNABLES_KEY, JSON.stringify(input));
      await logAudit("admin", "dsMatch.setTunables", undefined, input);
      return { ok: true };
    }),

  dsRunMatch: publicQuery.mutation(async ({ ctx }) => {
    await requireAdmin(ctx.req);
    const { runDeepseekMatch, matchJobStatus } = await import("./lib/dsMatch");
    if (matchJobStatus().state === "running") fail("CONFLICT", "匹配任务正在运行中");
    void runDeepseekMatch(); // 后台跑，状态走 dsMatchStatus 轮询
    await logAudit("admin", "dsMatch.run");
    return { ok: true };
  }),

  dsMatchStatus: publicQuery.query(async ({ ctx }) => {
    await requireAdmin(ctx.req);
    const { matchJobStatus } = await import("./lib/dsMatch");
    return matchJobStatus();
  }),

  dsMatchResult: publicQuery.query(async ({ ctx }) => {
    await requireAdmin(ctx.req);
    const { getSetting, DS_RESULT_KEY } = await import("./lib/dsMatch");
    const raw = await getSetting(DS_RESULT_KEY);
    return raw ? JSON.parse(raw) : null;
  }),

  /** AI 配对拖拽调整：交换两条配对记录中指定侧的人（仅待发送状态可调） */
  swapPairMembers: publicQuery
    .input(
      z.object({
        idA: z.number().int().positive(),
        sideA: z.enum(["man", "woman"]),
        idB: z.number().int().positive(),
        sideB: z.enum(["man", "woman"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.req);
      if (input.idA === input.idB) fail("BAD_REQUEST", "同一对不用换");
      await ensureTable();
      const db = getDb();
      const [a] = await db.select().from(matches).where(eq(matches.id, input.idA));
      const [b] = await db.select().from(matches).where(eq(matches.id, input.idB));
      if (!a || !b) fail("NOT_FOUND", "配对不存在");
      if (a.state !== "pending_send" || b.state !== "pending_send") fail("PRECONDITION_FAILED", "只有待发送的配对可以调整");
      const sideAKey = input.sideA === "man" ? "manProfileId" : "womanProfileId";
      const sideBKey = input.sideB === "man" ? "manProfileId" : "womanProfileId";
      const tmp = a[sideAKey];
      await db.update(matches).set({ [sideAKey]: b[sideBKey] }).where(eq(matches.id, a.id));
      await db.update(matches).set({ [sideBKey]: tmp }).where(eq(matches.id, b.id));

      // 同步 AI匹配页展示用的存储结果（按 matchId 换名字）
      const { getSetting, setSetting, DS_RESULT_KEY } = await import("./lib/dsMatch");
      const raw = await getSetting(DS_RESULT_KEY);
      if (raw) {
        try {
          const result = JSON.parse(raw) as { globalPairs?: { man: string; woman: string; matchId?: number }[] };
          const pa = result.globalPairs?.find((p) => p.matchId === a.id);
          const pb = result.globalPairs?.find((p) => p.matchId === b.id);
          if (pa && pb) {
            const nameA = input.sideA === "man" ? pa.man : pa.woman;
            const nameB = input.sideB === "man" ? pb.man : pb.woman;
            if (input.sideA === "man") pa.man = nameB; else pa.woman = nameB;
            if (input.sideB === "man") pb.man = nameA; else pb.woman = nameA;
            await setSetting(DS_RESULT_KEY, JSON.stringify(result));
          }
        } catch {
          /* 结果同步失败不影响 matches 表已完成的交换 */
        }
      }
      await logAudit("admin", "match.swap", `${input.idA}.${input.sideA} <-> ${input.idB}.${input.sideB}`);
      return { ok: true };
    }),

  /** 生成/查看丘比特推荐语（AI 生成，落库缓存；regenerate=true 重新生成） */
  pairBlessing: publicQuery
    .input(z.object({ matchId: z.number().int().positive(), regenerate: z.boolean().optional() }))
    .mutation(async ({ input, ctx }) => {
      await requireAdmin(ctx.req);
      const { generateBlessing } = await import("./lib/blessing");
      try {
        const r = await generateBlessing(input.matchId, input.regenerate === true);
        await logAudit("admin", "match.blessing", `match:${input.matchId}`);
        return { ok: true as const, ...r };
      } catch (err) {
        fail("INTERNAL_SERVER_ERROR", err instanceof Error ? err.message : "生成失败");
      }
    }),

  // ===== 会员网页互动（/me 本周同桌的TA tab） =====

  /** 我本周的配对 + 对方卡片 + 小纸条记录 + 今日剩余额度 + 给我的推荐语 */
  memberMatchInfo: publicQuery.query(async ({ ctx }) => {
    const profile = await requireMemberProfile(ctx.req);
    const { noteHistory } = await import("./lib/webMember");
    return noteHistory(profile);
  }),

  /** 给对方递小纸条（周三至周五，每天一条，内容安全过滤） */
  memberSendNote: publicQuery
    .input(z.object({ text: z.string().trim().min(1).max(300) }))
    .mutation(async ({ input, ctx }) => {
      const profile = await requireMemberProfile(ctx.req);
      const { sendNote } = await import("./lib/webMember");
      return sendNote(profile, input.text);
    }),

  memberBotHistory: publicQuery.query(async ({ ctx }) => {
    const profile = await requireMemberProfile(ctx.req);
    const { botHistoryWeb } = await import("./lib/webMember");
    return botHistoryWeb(profile.id);
  }),

  /** 和丘比特网页对话（历史与需求沉淀进 profiles.chat_facts，与企微通道共用） */
  memberBotChat: publicQuery
    .input(z.object({ text: z.string().trim().min(1).max(500) }))
    .mutation(async ({ input, ctx }) => {
      const profile = await requireMemberProfile(ctx.req);
      const { botChatWeb } = await import("./lib/webMember");
      return botChatWeb(profile.id, input.text);
    }),

  /** 周一二回访（网页版） */
  memberWebFeedback: publicQuery
    .input(
      z.object({
        met: z.number().int().min(0).max(1),
        score: z.number().int().min(1).max(5),
        willing: z.string().trim().min(1).max(8),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const profile = await requireMemberProfile(ctx.req);
      const { webFeedback } = await import("./lib/webMember");
      return webFeedback(profile, input);
    }),

  /** 周五见面确认（网页版）：双方都想见 → confirmed；一方不想见 → declined */
  memberConfirmDate: publicQuery
    .input(z.object({ want: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const profile = await requireMemberProfile(ctx.req);
      await ensureTable();
      const db = getDb();
      const { myActiveMatch } = await import("./lib/webMember");
      const match = await myActiveMatch(profile);
      if (!match) fail("NOT_FOUND", "本周还没有匹配对象");
      if (!["sent", "chatting", "confirmed", "declined"].includes(match.state)) fail("PRECONDITION_FAILED", "当前状态不能确认");
      const isMan = match.manProfileId === profile.id;
      const manReply = isMan ? (input.want ? "yes" : "no") : match.manReply;
      const womanReply = isMan ? match.womanReply : input.want ? "yes" : "no";
      const state = manReply === "yes" && womanReply === "yes" ? "confirmed" : manReply === "no" || womanReply === "no" ? "declined" : match.state;
      await db.update(matches).set({ manReply, womanReply, state }).where(eq(matches.id, match.id));
      return { ok: true, state };
    }),

  /** 约会安排：商家推荐（按双方偏好适配度）+ 时间交集 */
  memberDateOptions: publicQuery.query(async ({ ctx }) => {
    const profile = await requireMemberProfile(ctx.req);
    const { dateOptions } = await import("./lib/invites");
    return dateOptions(profile);
  }),

  /** 发送约会邀请（商户+时间，双方都确认见面后） */
  memberSendInvite: publicQuery
    .input(z.object({ merchantId: z.number().int().positive(), timeSlot: z.string().trim().min(1).max(32) }))
    .mutation(async ({ input, ctx }) => {
      const profile = await requireMemberProfile(ctx.req);
      const { sendInvite } = await import("./lib/invites");
      return sendInvite(profile, input.merchantId, input.timeSlot);
    }),

  memberInvites: publicQuery.query(async ({ ctx }) => {
    const profile = await requireMemberProfile(ctx.req);
    const { listInvites } = await import("./lib/invites");
    return listInvites(profile);
  }),

  /** 应答邀请：接受=锁定本周约会（其余 pending 作废）；拒绝=对方可重提 */
  memberAnswerInvite: publicQuery
    .input(z.object({ inviteId: z.number().int().positive(), accept: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const profile = await requireMemberProfile(ctx.req);
      const { answerInvite } = await import("./lib/invites");
      return answerInvite(profile.id, input.inviteId, input.accept);
    }),

  /** 模拟器（灰度内测）：进入下一天 */
  memberSimNextDay: publicQuery.mutation(async ({ ctx }) => {
    const profile = await requireMemberProfile(ctx.req);
    const today = profile.simDate ?? cstDayKey();
    const next = shiftDayKey(today, 1);
    await getDb().update(profiles).set({ simDate: next }).where(eq(profiles.id, profile.id));
    return { ok: true, simDate: next };
  }),

  /** 模拟器重置：回到本周二，清空我这对的纸条/邀请/定案 */
  memberSimReset: publicQuery.mutation(async ({ ctx }) => {
    const profile = await requireMemberProfile(ctx.req);
    await ensureTable();
    const db = getDb();
    const { webMessages, dateInvites } = await import("../db/schema");
    const match = await db.select().from(matches).where(
      and(eq(matches.weekKey, isoWeekKey()), or(eq(matches.manProfileId, profile.id), eq(matches.womanProfileId, profile.id))),
    );
    const m = match.sort((a, b) => b.id - a.id)[0];
    if (m) {
      const partnerId = m.manProfileId === profile.id ? m.womanProfileId : m.manProfileId;
      await db.delete(webMessages).where(
        or(
          and(eq(webMessages.fromProfileId, profile.id)),
          and(eq(webMessages.fromProfileId, partnerId)),
        ),
      );
      await db.delete(dateInvites).where(eq(dateInvites.matchId, m.id));
      // 回到「已空投」的初始态：见面确认、约会定案、回访全部清零（推荐语保留，重新生成很贵）
      await db.update(matches).set({ state: "sent", manReply: null, womanReply: null, dateMerchantId: null, dateTimeSlot: null, met: null, score: null, willing: null }).where(eq(matches.id, m.id));
    }
    // 回到本周二（CST 日历日直接当 UTC 取星期几）
    const todayCst = cstDayKey();
    const dow = new Date(`${todayCst}T00:00:00Z`).getUTCDay();
    const tue = shiftDayKey(todayCst, -((dow + 6) % 7) + 1);
    await db.update(profiles).set({ simDate: tue }).where(eq(profiles.id, profile.id));
    return { ok: true, simDate: tue };
  }),

  exportOps: publicQuery.query(async ({ ctx }) => {
    await requireAdmin(ctx.req);
    await ensureTable();
    const db = getDb();
    const matchRows = await db.select().from(matches);
    const redemptionRows = await db.select().from(redemptions);
    return { matches: matchRows, redemptions: redemptionRows };
  }),

  // 导出全部明细（供数据分析/题库迭代/人工匹配）
  export: publicQuery.query(async ({ ctx }) => {
    await requireAdmin(ctx.req);
    await ensureTable();
    const db = getDb();
    const respRows = await db.select().from(responses);
    const resp2Rows = await db.select().from(responsesV2);
    const resp3Rows = await db.select().from(responsesV3);
    const profRows = await db.select().from(profiles);

    // 每个 sessionId 只保留最新一条报名（防止重复提交）
    const latestProfile = new Map<string, (typeof profRows)[number]>();
    for (const p of profRows) {
      const prev = latestProfile.get(p.sessionId);
      if (!prev || p.id > prev.id) latestProfile.set(p.sessionId, p);
    }

    // 以报名表为主表，关联测试作答（v1/v2/v3，同一 sessionId 优先取最新版）
    const latestResp = new Map<string, { row: (typeof respRows)[number] | (typeof resp2Rows)[number] | (typeof resp3Rows)[number]; version: "v1" | "v2" | "v3"; gender: string | null; timings: Record<string, number> | null }>();
    for (const r of respRows) {
      const prev = latestResp.get(r.sessionId);
      if (!prev || prev.version === "v1") latestResp.set(r.sessionId, { row: r, version: "v1", gender: null, timings: null });
    }
    for (const r of resp2Rows) {
      latestResp.set(r.sessionId, { row: r, version: "v2", gender: r.gender, timings: null });
    }
    for (const r of resp3Rows) {
      latestResp.set(r.sessionId, { row: r, version: "v3", gender: r.gender, timings: JSON.parse(r.timings) as Record<string, number> });
    }

    return [...latestProfile.values()].map((p) => {
      const r = latestResp.get(p.sessionId);
      return {
        id: p.id,
        sessionId: p.sessionId,
        name: p.name,
        wechat: p.wechat,
        phone: p.phone,
        gender: r?.gender ?? p.gender,
        birthYear: p.birthYear,
        city: p.city,
        gradClass: p.gradClass,
        mbti: p.mbti,
        height: p.height,
        job: p.job,
        prefMinHeight: p.prefMinHeight,
        prefBirthFrom: p.prefBirthFrom,
        prefBirthTo: p.prefBirthTo,
        acceptDistance: p.acceptDistance,
        intro: p.intro,
        expectation: p.expectation,
        value: p.value,
        quizVersion: r?.version ?? null,
        typeCode: r?.row.typeCode ?? null,
        answers: r ? (JSON.parse(r.row.answers) as Record<string, number>) : {},
        rankings: r ? (JSON.parse(r.row.rankings) as Record<string, string[]>) : {},
        timings: r?.timings ?? {},
        createdAt: p.createdAt,
      };
    });
  }),

  stats: publicQuery.query(async () => {
    await ensureTable();
    const db = getDb();
    const rows = await db.select().from(responses);
    const profRows = await db.select().from(profiles);

    // 每道选择题：count / mean / stdDev / 分布
    const perQuestion: Record<
      string,
      { count: number; mean: number; stdDev: number; dist: number[] }
    > = {};
    for (const row of rows) {
      const answers = JSON.parse(row.answers) as Record<string, number>;
      for (const [qid, v] of Object.entries(answers)) {
        if (typeof v !== "number" || v < 1 || v > 7) continue;
        perQuestion[qid] ??= { count: 0, mean: 0, stdDev: 0, dist: [0, 0, 0, 0, 0, 0, 0] };
        const s = perQuestion[qid];
        s.count += 1;
        s.mean += v;
        s.stdDev += v * v;
        s.dist[v - 1] += 1;
      }
    }
    for (const s of Object.values(perQuestion)) {
      const mean = s.mean / s.count;
      s.stdDev = Math.sqrt(Math.max(0, s.stdDev / s.count - mean * mean));
      s.mean = Math.round(mean * 100) / 100;
      s.stdDev = Math.round(s.stdDev * 100) / 100;
    }

    // 类型分布
    const typeDist: Record<string, number> = {};
    for (const row of rows) {
      typeDist[row.typeCode] = (typeDist[row.typeCode] ?? 0) + 1;
    }

    return { total: rows.length, registered: profRows.length, perQuestion, typeDist };
  }),

  // 题库 v2 统计（/stats-v2）
  statsV2: publicQuery.query(async () => {
    await ensureTable();
    const db = getDb();
    const rows = await db.select().from(responsesV2);
    const profRows = await db.select().from(profiles);

    const perQuestion: Record<
      string,
      { count: number; mean: number; stdDev: number; dist: number[] }
    > = {};
    for (const row of rows) {
      const answers = JSON.parse(row.answers) as Record<string, number>;
      for (const [qid, v] of Object.entries(answers)) {
        if (typeof v !== "number" || v < 1 || v > 7) continue;
        perQuestion[qid] ??= { count: 0, mean: 0, stdDev: 0, dist: [0, 0, 0, 0, 0, 0, 0] };
        const s = perQuestion[qid];
        s.count += 1;
        s.mean += v;
        s.stdDev += v * v;
        s.dist[v - 1] += 1;
      }
    }
    for (const s of Object.values(perQuestion)) {
      const mean = s.mean / s.count;
      s.stdDev = Math.sqrt(Math.max(0, s.stdDev / s.count - mean * mean));
      s.mean = Math.round(mean * 100) / 100;
      s.stdDev = Math.round(s.stdDev * 100) / 100;
    }

    const typeDist: Record<string, number> = {};
    const genderDist: Record<string, number> = {};
    // 彩蛋题（排序题）：每个 rankId 下每个选项在 1–5 位的计数
    const rankingStats: Record<string, Record<string, number[]>> = {};
    for (const row of rows) {
      typeDist[row.typeCode] = (typeDist[row.typeCode] ?? 0) + 1;
      genderDist[row.gender] = (genderDist[row.gender] ?? 0) + 1;
      const rankings = JSON.parse(row.rankings) as Record<string, string[]>;
      for (const [rid, order] of Object.entries(rankings)) {
        if (!Array.isArray(order)) continue;
        rankingStats[rid] ??= {};
        order.slice(0, 5).forEach((key, pos) => {
          rankingStats[rid][key] ??= [0, 0, 0, 0, 0];
          rankingStats[rid][key][pos] += 1;
        });
      }
    }

    return { total: rows.length, registered: profRows.length, perQuestion, typeDist, genderDist, rankingStats };
  }),

  // 最终版题库统计（/stats-v3），含每题平均作答毫秒数
  statsV3: publicQuery.query(async () => {
    await ensureTable();
    const db = getDb();
    const rows = await db.select().from(responsesV3);
    const profRows = await db.select().from(profiles);

    const perQuestion: Record<
      string,
      { count: number; mean: number; stdDev: number; dist: number[]; meanTime: number }
    > = {};
    for (const row of rows) {
      const answers = JSON.parse(row.answers) as Record<string, number>;
      const timings = JSON.parse(row.timings) as Record<string, number>;
      for (const [qid, v] of Object.entries(answers)) {
        if (typeof v !== "number" || v < 1 || v > 7) continue;
        perQuestion[qid] ??= { count: 0, mean: 0, stdDev: 0, dist: [0, 0, 0, 0, 0, 0, 0], meanTime: 0 };
        const s = perQuestion[qid];
        s.count += 1;
        s.mean += v;
        s.stdDev += v * v;
        s.dist[v - 1] += 1;
        const t = timings[qid];
        if (typeof t === "number" && t > 0 && t < 600_000) s.meanTime += t;
      }
    }
    for (const s of Object.values(perQuestion)) {
      const mean = s.mean / s.count;
      s.stdDev = Math.sqrt(Math.max(0, s.stdDev / s.count - mean * mean));
      s.mean = Math.round(mean * 100) / 100;
      s.stdDev = Math.round(s.stdDev * 100) / 100;
      s.meanTime = Math.round(s.meanTime / s.count);
    }

    const typeDist: Record<string, number> = {};
    const genderDist: Record<string, number> = {};
    const rankingStats: Record<string, Record<string, number[]>> = {};
    for (const row of rows) {
      typeDist[row.typeCode] = (typeDist[row.typeCode] ?? 0) + 1;
      genderDist[row.gender] = (genderDist[row.gender] ?? 0) + 1;
      const rankings = JSON.parse(row.rankings) as Record<string, string[]>;
      for (const [rid, order] of Object.entries(rankings)) {
        if (!Array.isArray(order)) continue;
        rankingStats[rid] ??= {};
        order.slice(0, 5).forEach((key, pos) => {
          rankingStats[rid][key] ??= [0, 0, 0, 0, 0];
          rankingStats[rid][key][pos] += 1;
        });
      }
    }

    return { total: rows.length, registered: profRows.length, perQuestion, typeDist, genderDist, rankingStats };
  }),
});
