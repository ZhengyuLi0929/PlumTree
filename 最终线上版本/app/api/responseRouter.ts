import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware";
import { ensureTable, getDb, hasDatabase } from "./queries/connection";
import { responses, responsesV2, responsesV3, profiles, matchPairs, visits, matches, matchPool, merchants, redemptions, botUsers } from "../db/schema";
import { logAudit } from "./lib/audit";
import { setPoolState } from "./lib/botStore";
import {
  isoWeekKey,
  isValidInvite,
  normalizeWechat,
  readEnroll,
  signEnroll,
} from "./lib/enroll";
import {
  adminCookieHeader,
  adminPasswordConfigured,
  adminPasswordMatches,
  clearAdminCookieHeader,
  readAdminToken,
  signAdmin,
  tokenFromRequest,
} from "./lib/admin";
import { classifyVisitSource, cstDayKey } from "./lib/visit";
import { insertPoolEntry } from "./lib/botStore";

function fail(code: TRPCError["code"], message: string): never {
  throw new TRPCError({ code, message });
}

function dbUnavailable(err: unknown): never {
  console.error("[db]", err);
  fail("INTERNAL_SERVER_ERROR", "数据库连不上。请检查 DATABASE_URL，以及 MySQL 是否已启动。");
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
    const cutoff = (() => {
      const d = new Date(`${today}T00:00:00+08:00`);
      d.setDate(d.getDate() - 29);
      return cstDayKey(d);
    })();

    const byDay = new Map<string, number>();
    const bySource = new Map<string, number>();
    let total = 0;
    let todayCount = 0;
    for (const row of rows) {
      total += 1;
      if (row.dayKey === today) todayCount += 1;
      if (row.dayKey >= cutoff) byDay.set(row.dayKey, (byDay.get(row.dayKey) ?? 0) + 1);
      bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
    }

    const days: { day: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(`${today}T00:00:00+08:00`);
      d.setDate(d.getDate() - i);
      const key = cstDayKey(d);
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

  // 运营数据导出（matches / redemptions，延续 export 的模式）
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
