// 全覆盖回归：认证/报名/测验/照片/约会倾向/后台/统计/纯函数库。
// 直接打 app.fetch（不占端口），数据写本地 docker MySQL，跑完自清理。
// 运行：npm run db:up && npm run test:all
import fs from "node:fs";

// 强制 dev 通道（不碰真实短信与真实 LLM——LLM 走占位回复和 mock 抽取，确定性测试）
for (const key of ["TENCENT_SECRET_ID","TENCENT_SECRET_KEY","TENCENT_SMS_SDK_APP_ID","TENCENT_SMS_SIGN_NAME","TENCENT_SMS_TEMPLATE_ID","ALIYUN_ACCESS_KEY_ID","ALIYUN_ACCESS_KEY_SECRET","SMS_SIGN_NAME","SMS_OTP_TEMPLATE","LLM_API_KEY","LLM_BASE_URL"]) {
  process.env[key] = "";
}

const P = "ZZ测试"; // 所有测试数据统一前缀
const PH = { A: "13897000001", B: "13897000002", C: "13897000003", NOCRED: "13897000004", MOVE1: "13897000005", MOVE2: "13897000006", X: "13897000999" };
const SIDS = ["zzt-alpha-sess", "zzt-b", "zzt-c", "zzt-nocred", "zzt-move", "zzt-dup-1", "zzt-dup-2", "zzt-quiz", "zzt-enroll-ok", "zzt-enroll-bad", "zzt-x"];
const PW_A = "testaa11";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(name: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.error(`  ✗ ${name}${extra ? " —— " + extra : ""}`); }
}

async function main() {
  const { default: app } = await import("../api/boot");
  const { ensureTable, getDb, hasDatabase } = await import("../api/queries/connection");
  const schema = await import("../db/schema");
  const enrollLib = await import("../api/lib/enroll");
  const credLib = await import("../api/lib/credentials");
  const { eq, or, like, inArray } = await import("drizzle-orm");

  if (!hasDatabase()) { console.error("需要 DATABASE_URL"); process.exit(1); }

  type Res = { ok: boolean; code: string; message: string; data: any; headers?: Headers };
  const QUERIES = new Set(["memberMe", "roster", "adminMe", "visitStats", "stats", "statsV2", "statsV3", "poolList", "airdropQueue", "merchantsList", "redemptionsList", "export", "exportOps", "ping", "memberMatchInfo", "memberBotHistory", "dsGetPrompt", "dsGetTunables", "dsMatchStatus", "dsMatchResult", "airdropPreview", "userDetail", "memberDateOptions", "memberInvites"]);
  async function call(proc: string, input?: unknown, cookie?: string, auth?: string): Promise<Res> {
    const isQuery = QUERIES.has(proc);
    const url = `http://test.local/api/trpc/responses.${proc}${isQuery && input !== undefined ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : ""}`;
    const res = await app.fetch(new Request(url, {
      method: isQuery ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(auth ? { authorization: auth } : {}) },
      body: isQuery ? undefined : JSON.stringify({ json: input ?? {} }),
    }));
    const body = (await res.json()) as any;
    if (body.error) return { ok: false, code: body.error.json?.data?.code ?? "", message: body.error.json?.message ?? "", data: null };
    return { ok: true, code: "", message: "", data: body.result?.data?.json, headers: res.headers };
  }
  async function getCookie(proc: string, input: unknown): Promise<string> {
    const r = await call(proc, input);
    const setCookie = r.headers?.get("set-cookie") ?? "";
    return setCookie.split(";")[0];
  }

  await ensureTable();
  const db = getDb();

  async function cleanup() {
    await db.delete(schema.photos).where(like(schema.photos.file, "zzt%"));
    const profs = await db.select().from(schema.profiles).where(like(schema.profiles.name, `${P}%`));
    for (const pr of profs) {
      await db.delete(schema.matchPool).where(eq(schema.matchPool.profileId, pr.id));
      await db.delete(schema.photos).where(eq(schema.photos.profileId, pr.id));
      await db.delete(schema.webMessages).where(eq(schema.webMessages.fromProfileId, pr.id));
      await db.delete(schema.webMessages).where(eq(schema.webMessages.toProfileId, pr.id));
      await db.delete(schema.matches).where(or(eq(schema.matches.manProfileId, pr.id), eq(schema.matches.womanProfileId, pr.id)));
    }
    await db.delete(schema.profiles).where(or(like(schema.profiles.name, `${P}%`), inArray(schema.profiles.sessionId, SIDS)));
    await db.delete(schema.responsesV3).where(inArray(schema.responsesV3.sessionId, SIDS));
    await db.delete(schema.memberCredentials).where(like(schema.memberCredentials.phone, "13897000%"));
    await db.delete(schema.otpCodes).where(like(schema.otpCodes.phone, "13897000%"));
    await db.delete(schema.matchPairs).where(like(schema.matchPairs.note, `${P}%`));
    await db.delete(schema.merchants).where(like(schema.merchants.name, `${P}%`));
  }
  await cleanup();

  try {
    // ============ A. 密码登录与会员 ============
    console.log("A. 密码登录与会员");
    await db.insert(schema.profiles).values([
      { sessionId: "zzt-alpha-sess", name: `${P}甲`, wechat: "zzt_wx_a", phone: PH.A, gender: "男", birthYear: 1997, city: "北京", gradClass: "2016届1班", intro: "会员测试用自我介绍，三十个字三十个字三十个字三十个字。", consentAt: new Date() },
      { sessionId: "zzt-nocred", name: `${P}无密码`, wechat: "zzt_wx_nc", phone: PH.NOCRED, gender: "女", birthYear: 1998, city: "北京", gradClass: "2016届2班", intro: "会员测试用自我介绍，三十个字三十个字三十个字三十个字。", consentAt: new Date() },
    ]);
    await credLib.setPassword(PH.A, PW_A);

    assert("A1 手机号格式错 → BAD_REQUEST", !(await call("memberLoginPassword", { name: `${P}甲`, phone: "123", password: PW_A })).ok);
    assert("A2 手机号未报名 → NOT_FOUND", (await call("memberLoginPassword", { name: `${P}甲`, phone: PH.X, password: PW_A })).code === "NOT_FOUND");
    assert("A3 姓名对不上 → NOT_FOUND", (await call("memberLoginPassword", { name: "不是甲", phone: PH.A, password: PW_A })).code === "NOT_FOUND");
    const noCred = await call("memberLoginPassword", { name: `${P}无密码`, phone: PH.NOCRED, password: PW_A });
    assert("A4 未发初始密码 → PRECONDITION_FAILED", noCred.code === "PRECONDITION_FAILED", noCred.message);
    assert("A5 密码错误 → UNAUTHORIZED", (await call("memberLoginPassword", { name: `${P}甲`, phone: PH.A, password: "wrongp88" })).code === "UNAUTHORIZED");
    const loginA = await call("memberLoginPassword", { name: `${P}甲`, phone: PH.A, password: PW_A });
    assert("A6 正确登录 → ok", loginA.ok && loginA.data.ok === true);
    const cookieA = loginA.headers?.get("set-cookie")?.split(";")[0] ?? "";
    assert("A7 签发 member_session cookie", cookieA.startsWith("member_session="));
    assert("A8 无 cookie 访问 memberMe → UNAUTHORIZED", (await call("memberMe", undefined, undefined, "POST")).code === "UNAUTHORIZED");
    const meA = await call("memberMe", undefined, cookieA, "POST");
    assert("A9 带 cookie memberMe → 返回档案", meA.ok && meA.data.profile.name === `${P}甲`);

    assert("A10 旧密码错误 → 拒改密", !(await call("memberChangePassword", { oldPassword: "wrongp88", newPassword: "newpass99" }, cookieA)).ok);
    assert("A11 弱密码（纯数字）→ 拒", (await call("memberChangePassword", { oldPassword: PW_A, newPassword: "12345678" }, cookieA)).code === "BAD_REQUEST");
    assert("A12 正常改密 → ok", (await call("memberChangePassword", { oldPassword: PW_A, newPassword: "newpass99" }, cookieA)).ok);
    assert("A13 改密后新密码可登录", (await call("memberLoginPassword", { name: `${P}甲`, phone: PH.A, password: "newpass99" })).ok);

    // 改手机号 → 凭证随迁
    await db.insert(schema.profiles).values({ sessionId: "zzt-move", name: `${P}迁移`, wechat: "zzt_wx_mv", phone: PH.MOVE1, gender: "女", birthYear: 1998, city: "北京", gradClass: "2016届2班", intro: "会员测试用自我介绍，三十个字三十个字三十个字三十个字。", consentAt: new Date() });
    await credLib.setPassword(PH.MOVE1, PW_A);
    const cookieMv = await getCookie("memberLoginPassword", { name: `${P}迁移`, phone: PH.MOVE1, password: PW_A });
    const updPhone = await call("memberUpdate", { phone: PH.MOVE2 }, cookieMv);
    assert("A14 memberUpdate 改手机号 → ok", updPhone.ok);
    assert("A15 新手机号可登录（凭证随迁）", (await call("memberLoginPassword", { name: `${P}迁移`, phone: PH.MOVE2, password: PW_A })).ok);
    assert("A16 旧手机号不再有凭证", (await credLib.verifyPassword(PH.MOVE1, PW_A)) === null);

    assert("A17 未登录 memberUpdate → UNAUTHORIZED", (await call("memberUpdate", { city: "上海" })).code === "UNAUTHORIZED");
    assert("A18 出生年范围颠倒 → BAD_REQUEST", !(await call("memberUpdate", { prefBirthFrom: 2000, prefBirthTo: 1994 }, cookieA)).ok);
    assert("A19 改城市生效", (await call("memberUpdate", { city: "上海" }, cookieA)).ok);

    // ============ B. 报名（邀请码流程） ============
    console.log("B. 报名流程");
    const badInvite = await call("startEnroll", { sessionId: "zzt-enroll-bad", wechat: "zzt_wx", inviteCode: "WRONG" });
    assert("B1 错邀请码 → BAD_REQUEST", !badInvite.ok && badInvite.code === "BAD_REQUEST");
    const goodInvite = await call("startEnroll", { sessionId: "zzt-enroll-ok", wechat: "zzt_wx", inviteCode: process.env.INVITE_CODE || "RDFZNB" });
    assert("B2 对邀请码 → 发 token", goodInvite.ok && typeof goodInvite.data.token === "string");
    assert("B3 无 token 报名 → 拒", !(await call("register", { token: "bad-token-that-is-long", sessionId: "zzt-x", name: "x", gender: "男", birthYear: 1997, city: "北京", gradClass: "2016届1班", intro: "x".repeat(35), consent: true })).ok);
    const enrollTok = goodInvite.ok ? goodInvite.data.token : "";
    const underage = await call("register", { token: enrollTok, sessionId: "zzt-enroll-ok", name: `${P}未成年`, gender: "男", birthYear: new Date().getFullYear() - 20, city: "北京", gradClass: "2016届1班", intro: "x".repeat(35), consent: true });
    assert("B4 男未满22 → 拒", !underage.ok && underage.message.includes("婚龄"));
    assert("B5 未勾选隐私 → 拒", !(await call("register", { token: enrollTok, sessionId: "zzt-enroll-ok", name: `${P}无同意`, gender: "男", birthYear: 1997, city: "北京", gradClass: "2016届1班", intro: "x".repeat(35) })).ok);
    assert("B6 介绍不足30字 → 拒", !(await call("register", { token: enrollTok, sessionId: "zzt-enroll-ok", name: `${P}短介绍`, gender: "男", birthYear: 1997, city: "北京", gradClass: "2016届1班", intro: "太短", consent: true })).ok);
    const regOk = await call("register", { token: enrollTok, sessionId: "zzt-enroll-ok", name: `${P}正常`, gender: "男", birthYear: 1997, city: "北京", gradClass: "2016届1班", intro: "这是正常报名的自我介绍，用来测试报名流程，字数一定要超过三十个字才可以提交。", consent: true });
    assert("B7 正常报名 → ok", regOk.ok);
    const poolRow = await db.select().from(schema.matchPool).where(like(schema.matchPool.orgTag, "default"));
    assert("B8 报名自动入匹配池", poolRow.length > 0);

    // 重复报名取最新
    await db.insert(schema.profiles).values([
      { sessionId: "zzt-dup-1", name: `${P}重复`, wechat: "zzt_wx_dup", phone: PH.B, gender: "女", birthYear: 1998, city: "北京", gradClass: "2016届2班", intro: "第一次报名，三十个字三十个字三十个字三十个字三十个。", consentAt: new Date() },
      { sessionId: "zzt-dup-2", name: `${P}重复`, wechat: "zzt_wx_dup", phone: PH.B, gender: "女", birthYear: 1998, city: "上海", gradClass: "2016届2班", intro: "第二次报名，三十个字三十个字三十个字三十个字三十个。", consentAt: new Date() },
    ]);
    await credLib.setPassword(PH.B, PW_A);
    const cookieDup = await getCookie("memberLoginPassword", { name: `${P}重复`, phone: PH.B, password: PW_A });
    const meDup = await call("memberMe", undefined, cookieDup, "POST");
    assert("B9 重复报名以最新一条为准", meDup.ok && meDup.data.profile.city === "上海");

    // ============ C. 测验提交 ============
    console.log("C. 测验提交");
    const badSubmit = await call("submitV3", { sessionId: "zzt-quiz", typeCode: "FSRH", gender: "女", answers: { "2": 99 }, rankings: {}, timings: {} });
    assert("C1 超量程答案 → 拒", !badSubmit.ok);
    const goodSubmit = await call("submitV3", { sessionId: "zzt-quiz", typeCode: "FSRH", gender: "女", answers: { "2": 5 }, rankings: { rank1: ["words", "time", "gifts", "acts", "touch"] }, timings: { "2": 3000 } });
    assert("C2 正常提交 → stored", goodSubmit.ok && goodSubmit.data.stored === true);

    // ============ D. 照片 ============
    console.log("D. 照片");
    const png1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const up1 = await call("memberUploadPhoto", { mime: "image/png", dataBase64: png1x1 }, cookieA);
    assert("D1 传 png → ok", up1.ok && up1.data.photo.url.startsWith("/api/photos/"));
    assert("D2 非法 mime → 拒", !(await call("memberUploadPhoto", { mime: "text/html", dataBase64: png1x1 }, cookieA)).ok);
    const photoUrl = up1.ok ? up1.data.photo.url : "";
    const read = await app.fetch(new Request(`http://test.local${photoUrl}`));
    assert("D3 读取照片 → 200 image/png", read.status === 200 && read.headers.get("content-type") === "image/png");
    const traversal = await app.fetch(new Request("http://test.local/api/photos/..%2F..%2Fboot.js"));
    assert("D4 路径穿越 → 404", traversal.status === 404);
    assert("D5 删别人的照片 → NOT_FOUND", (await call("memberDeletePhoto", { id: up1.data.photo.id }, cookieDup)).code === "NOT_FOUND");
    assert("D6 删自己的 → ok", (await call("memberDeletePhoto", { id: up1.data.photo.id }, cookieA)).ok);
    assert("D7 删后读取 → 404", (await app.fetch(new Request(`http://test.local${photoUrl}`))).status === 404);
    // 9 张上限
    for (let i = 0; i < 9; i++) await call("memberUploadPhoto", { mime: "image/png", dataBase64: png1x1 }, cookieA);
    const tenth = await call("memberUploadPhoto", { mime: "image/png", dataBase64: png1x1 }, cookieA);
    assert("D8 第 10 张被拒（上限 9）", !tenth.ok && tenth.message.includes("9"));
    const myPhotos = await call("memberMe", undefined, cookieA, "POST");
    for (const ph of myPhotos.data.photos) await call("memberDeletePhoto", { id: ph.id }, cookieA);

    // ============ E. 约会倾向 ============
    console.log("E. 约会倾向");
    const dp = await call("memberSaveDatePrefs", { participate: true, locations: ["五棵松"], activities: ["一起吃顿饭"], times: ["周六晚上"] }, cookieA);
    assert("E1 保存倾向 → ok", dp.ok);
    const meDp = await call("memberMe", undefined, cookieA, "POST");
    assert("E2 memberMe 回读 participate=true", meDp.data.profile.participate === true);
    assert("E3 倾向带本周周键", (JSON.parse(meDp.data.profile.datePrefs).weekKey ?? "").match(/^20\d\d-W\d\d$/) !== null);
    assert("E4 地点超 17 项 → 拒", !(await call("memberSaveDatePrefs", { participate: true, locations: Array(18).fill("x"), activities: [], times: [] }, cookieA)).ok);
    const dpOff = await call("memberSaveDatePrefs", { participate: false, locations: [], activities: [], times: [] }, cookieA);
    const meOff = await call("memberMe", undefined, cookieA, "POST");
    assert("E5 关掉开关 → participate=false", dpOff.ok && meOff.data.profile.participate === false);

    // ============ F. 管理后台 ============
    console.log("F. 管理后台");
    assert("F1 无 token roster → UNAUTHORIZED", (await call("roster", undefined, undefined, "POST")).code === "UNAUTHORIZED");
    assert("F2 错密码 → UNAUTHORIZED", !(await call("adminLogin", { password: "wrong-password" })).ok);
    const adminTokRes = await call("adminLogin", { password: process.env.ADMIN_PASSWORD || "" });
    assert("F3 对密码 → token", adminTokRes.ok && !!adminTokRes.data.token);
    const adminAuth = `Bearer ${adminTokRes.data?.token ?? ""}`;
    const roster = await app.fetch(new Request("http://test.local/api/trpc/responses.roster", { headers: { authorization: adminAuth } }));
    const rosterJson = (await roster.json()) as any;
    assert("F4 roster 返回 users 数组", Array.isArray(rosterJson.result?.data?.json?.users));
    const profRows = await db.select().from(schema.profiles).where(like(schema.profiles.name, `${P}%`));
    const [pA, pB] = profRows;
    const samePair = await app.fetch(new Request("http://test.local/api/trpc/responses.savePair", { method: "POST", headers: { "content-type": "application/json", authorization: adminAuth }, body: JSON.stringify({ json: { leftSession: pA.sessionId, rightSession: pA.sessionId, note: `${P}note` } }) }));
    const samePairJson = (await samePair.json()) as any;
    assert("F5 自己配自己 → 拒", !!samePairJson.error);
    const goodPair = await app.fetch(new Request("http://test.local/api/trpc/responses.savePair", { method: "POST", headers: { "content-type": "application/json", authorization: adminAuth }, body: JSON.stringify({ json: { leftSession: pA.sessionId, rightSession: pB.sessionId, note: `${P}note` } }) }));
    const goodPairJson = (await goodPair.json()) as any;
    assert("F6 正常配对 → ok", goodPairJson.result?.data?.json?.ok === true);
    const merch = await call("merchantSave", { name: `${P}咖啡馆`, address: "五棵松", rebateCents: 1000, status: "active" }, undefined, adminAuth);
    assert("F7 商户创建 → ok", merch.ok, merch.message);
    assert("F8 无 token exportOps → UNAUTHORIZED", (await call("exportOps", undefined, undefined, "POST")).code === "UNAUTHORIZED");

    // ============ G. 统计与访问 ============
    console.log("G. 统计与访问");
    const stats = await app.fetch(new Request("http://test.local/api/trpc/responses.statsV3"));
    const statsJson = (await stats.json()) as any;
    assert("G1 statsV3 公开可读且结构正确", typeof statsJson.result?.data?.json?.total === "number");
    const v1 = await call("trackVisit", { path: "/" });
    const v2 = await call("trackVisit", { path: "/admin" });
    assert("G2 首页访问记录 stored:true", v1.ok && v1.data.stored === true);
    assert("G3 /admin 不计访问", v2.ok && v2.data.stored === false);
    const vs = await app.fetch(new Request("http://test.local/api/trpc/responses.visitStats", { headers: { authorization: adminAuth } }));
    const vsJson = (await vs.json()) as any;
    assert("G4 visitStats 返回 30 天数组", vsJson.result?.data?.json?.days?.length === 30);

    // ============ H. 纯函数与库 ============
    console.log("H. 纯函数与库");
    const { computeScoresFinal, FINAL_QUESTIONS } = await import("../src/data/questions-final");
    const { getTypeCode, DIM_META } = await import("../src/data/questions");
    const allMid: Record<number, number> = {};
    for (const q of FINAL_QUESTIONS) allMid[q.id] = 4;
    const tieScores = computeScoresFinal(allMid, {}, Object.fromEntries(FINAL_QUESTIONS.map((q) => [q.id, 1000])));
    assert("H1 全选中间项+等时 → 每维 49/51", Object.values(tieScores.FI).sort((a, b) => a - b).join(",") === "49,51");
    const fAll: Record<number, number> = {};
    for (const q of FINAL_QUESTIONS) fAll[q.id] = (q.dim === "FI" && q.pole === "F") ? 7 : (q.dim === "FI" ? 1 : 4);
    const sg: Record<number, number> = {};
    for (const q of FINAL_QUESTIONS) sg[q.id] = q.dim === "SG" ? (q.pole === "S" ? 7 : 1) : 4;
    const rp: Record<number, number> = {};
    for (const q of FINAL_QUESTIONS) rp[q.id] = q.dim === "RP" ? (q.pole === "R" ? 7 : 1) : 4;
    const hc: Record<number, number> = {};
    for (const q of FINAL_QUESTIONS) hc[q.id] = q.dim === "HC" ? (q.pole === "H" ? 7 : 1) : 4;
    const tm: Record<number, number> = {};
    for (const q of FINAL_QUESTIONS) tm[q.id] = 4;
    const merged: Record<number, number> = {};
    for (const q of FINAL_QUESTIONS) merged[q.id] = q.dim === "FI" ? fAll[q.id] : q.dim === "SG" ? sg[q.id] : q.dim === "RP" ? rp[q.id] : q.dim === "HC" ? hc[q.id] : 4;
    assert("H2 全左极答案 → FSRH", getTypeCode(computeScoresFinal(merged, {})) === "FSRH");
    assert("H3 DIM_META 五维齐", DIM_META.length === 5);

    const { parseFeedback } = await import("../api/lib/feedback");
    assert("H4 回访解析「成了 4分 想继续」", JSON.stringify(parseFeedback("成了，4分，想继续")) === JSON.stringify({ met: 1, score: 4, willing: "想" }));
    assert("H5 回访解析「没见 2分」", parseFeedback("没见到人，2分")?.met === 0);
    assert("H6 垃圾文本 → null", parseFeedback("今天天气不错") === null);

    const { classifySms, applyInboundSms } = await import("../api/lib/smsMatch");
    assert("H7 短信分类【匹配】", classifySms("【匹配】") === "yes" && classifySms(" 匹配 ") === "yes" && classifySms("晚上吃火锅") === "note");
    const basePair = { manReply: null, womanReply: null, manNoteDays: [], womanNoteDays: [], manPhone: PH.A, womanPhone: PH.B, manWechat: "wxm", womanWechat: "wxw" } as any;
    const note1 = applyInboundSms(basePair, PH.A, "你好呀", "2026-10-14", true);
    assert("H8 小纸条转发给对方", note1.outbound.some((o: any) => o.to === PH.B && o.text.includes("你好呀")));
    const note2 = applyInboundSms(note1.pair, PH.A, "第二条", "2026-10-14", true);
    assert("H9 同日第二条 → 额度用完", note2.outbound.length === 1 && note2.outbound[0].text.includes("用完"));
    const yes1 = applyInboundSms(basePair, PH.A, "匹配", "2026-10-16", true);
    const yes2 = applyInboundSms(yes1.pair, PH.B, "匹配", "2026-10-16", true);
    assert("H10 双方匹配 → 交换微信号", yes2.outbound.some((o: any) => o.text.includes("wxw")) && yes2.outbound.some((o: any) => o.text.includes("wxm")));
    const no1 = applyInboundSms(yes1.pair, PH.B, "不匹配", "2026-10-16", true);
    assert("H11 一方拒绝 → 双方都被通知", no1.outbound.length === 2);

    const { wecomEncrypt, wecomDecrypt, wecomSignature } = await import("../api/lib/wecomCrypto");
    const aesK = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
    const enc = wecomEncrypt("{\"a\":1}", aesK, "ww1234567890");
    assert("H12 企微加解密往返", wecomDecrypt(enc, aesK, "ww1234567890") === "{\"a\":1}");
    assert("H13 企微 corpid 不匹配 → 抛错", (() => { try { wecomDecrypt(enc, aesK, "wwwrong"); return false; } catch { return true; } })());
    assert("H14 企微签名 40 位 hex", /^[0-9a-f]{40}$/.test(wecomSignature("t", "1", "n", "e")));

    const { encryptText, decryptText } = await import("../api/lib/fieldCrypto");
    process.env.FIELD_ENCRYPTION_KEY = "zzt-field-key";
    const encT = encryptText("敏感内容123")!;
    assert("H15 字段加密往返 + 密文不含明文", decryptText(encT) === "敏感内容123" && !encT.includes("敏感"));
    delete process.env.FIELD_ENCRYPTION_KEY;
    assert("H16 无密钥时明文直通且向后兼容", encryptText("明文") === "明文" && decryptText("明文") === "明文");

    const { screenText } = await import("../api/lib/safety");
    assert("H17 内容安全拦截「约炮吗」", (await screenText("约炮吗")).ok === false);
    assert("H18 正常内容放行", (await screenText("周末一起去爬山吧")).ok === true);

    const { MockPaymentProvider } = await import("../api/lib/payments");
    const pay = new MockPaymentProvider();
    const order = await pay.createOrder({ orderId: "zzt", amountCents: 399, description: "t" });
    await pay.handleCallback({ orderId: "zzt", paid: true });
    const rf = await pay.refund("zzt", 399, "no-show");
    assert("H19 Mock 支付 下单→回调→退款 闭环", order.status === "pending" && rf.refundId === "refund_zzt" && (await pay.queryOrder("zzt")).status === "refunded");

    const { isoWeekKey } = enrollLib;
    const { cstDayKey, shiftDayKey } = await import("../api/lib/visit");
    assert("H20 isoWeekKey 周三归属本周", isoWeekKey(new Date("2026-10-14T12:00:00Z")) === isoWeekKey(new Date("2026-10-12T12:00:00Z")));
    assert("H21 shiftDayKey 加一天", shiftDayKey("2026-10-12", 1) === "2026-10-13");
    assert("H22 cstDayKey 输出 YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(cstDayKey()));

    const { computeMatches, scorePair } = await import("../api/lib/matching");
    const mu = (id: number, gender: "男" | "女", extra: any = {}) => ({
      profileId: id, name: `t${id}`, gender, birthYear: 1997, city: "北京", orgTag: "t", priority: 0,
      typeCode: null, height: gender === "男" ? 178 : 165, job: null, intro: null, expectation: null, value: null,
      prefMinHeight: null, prefBirthFrom: null, prefBirthTo: null, acceptDistance: null, chatText: null, ...extra,
    });
    assert("H23 身高雷区：女要求185，男178 → 不可配", scorePair(mu(1, "男"), mu(2, "女", { prefMinHeight: 185 })) === null);
    assert("H24 身高达标 → 可配", scorePair(mu(1, "男"), mu(2, "女", { prefMinHeight: 175 })) !== null);
    assert("H25 年龄差>5 → 不可配", scorePair(mu(1, "男", { birthYear: 1988 }), mu(2, "女", { birthYear: 1997 })) === null);
    assert("H26 异地+不接受 → 不可配", scorePair(mu(1, "男", { city: "上海" }), mu(2, "女", { acceptDistance: "不接受" })) === null);
    const cp = scorePair(mu(3, "男", { typeCode: "FSRH" }), mu(4, "女", { typeCode: "FSPH" }))!;
    const noCp = scorePair(mu(3, "男", { typeCode: "FSRH" }), mu(4, "女", { typeCode: "IGPC" }))!;
    assert("H27 官配 CP 加分", cp.score > noCp.score);
    const cap = computeMatches([mu(1, "男"), mu(2, "男"), mu(3, "女")]);
    assert("H28 性别比决定容量（2男1女→1对，1男轮空）", cap.pairs.length === 1 && cap.unmatched.length === 1);
    const prio = computeMatches([mu(1, "男"), mu(2, "男"), mu(3, "女", { priority: 0 }), mu(4, "男", { priority: 3 })].filter(Boolean) as any);
    assert("H29 轮空优先进配对", prio.pairs[0]?.man.profileId === 4);
    const { TYPES } = await import("../src/data/types");
    assert("H30 16 型官配表引用的类型都存在", Object.values(TYPES).every((t) => TYPES[t.matchCode]));

    // ============ I. 网页互动（/me 月老 tab）与配对调整 ============
    console.log("I. 网页互动与配对调整");
    const week = enrollLib.isoWeekKey();
    const [pM] = await db.select().from(schema.profiles).where(eq(schema.profiles.sessionId, "zzt-alpha-sess"));
    const [pW] = await db.select().from(schema.profiles).where(eq(schema.profiles.sessionId, "zzt-dup-2"));
    const [pX] = await db.select().from(schema.profiles).where(eq(schema.profiles.sessionId, "zzt-move"));
    const [pY] = await db.select().from(schema.profiles).where(eq(schema.profiles.sessionId, "zzt-enroll-ok"));
    // 两对本周待发送配对
    const m1 = await db.insert(schema.matches).values({ weekKey: week, manProfileId: pM.id, womanProfileId: pW.id, state: "sent", reason: "测试配对1" });
    const m2 = await db.insert(schema.matches).values({ weekKey: week, manProfileId: pX.id, womanProfileId: pY.id, state: "pending_send", reason: "测试配对2" });
    const m1id = Number(m1[0].insertId), m2id = Number(m2[0].insertId);

    // 推荐语：mock LLM 下应优雅报错（不崩溃）
    const bless = await call("pairBlessing", { matchId: m2id }, undefined, adminAuth);
    assert("I5 推荐语生成（LLM 在线）或优雅报错", (bless.ok && bless.data.forMan.length > 10) || (!bless.ok && bless.message.length > 0), bless.ok ? "" : bless.message);

    // 小纸条（强制周三传话期）
    process.env.BOT_FORCE_PHASE = "chatting";
    const info0 = await call("memberMatchInfo", undefined, cookieA);
    assert("I6 memberMatchInfo 返回配对与额度", info0.ok && info0.data.match?.id === m1id && info0.data.quotaLeft === 1, info0.ok ? JSON.stringify({ match: info0.data.match?.id, quota: info0.data.quotaLeft }) : `${info0.code} ${info0.message}`);
    const n1 = await call("memberSendNote", { text: "你好呀，周末见？" }, cookieA);
    assert("I7 第一张纸条 → ok", n1.ok && n1.data.ok === true);
    const n2 = await call("memberSendNote", { text: "第二条" }, cookieA);
    assert("I8 当天第二张 → 额度提示", n2.ok && n2.data.ok === false && n2.data.error.includes("额度"));
    const n3 = await call("memberSendNote", { text: "约炮吗" }, cookieA);
    assert("I9 敏感纸条 → 拦截", n3.ok && n3.data.ok === false);
    const infoDup = await call("memberMatchInfo", undefined, cookieDup);
    assert("I10 对方（乙）能看到纸条", infoDup.ok && infoDup.data.notes.some((n: any) => n.content.includes("你好呀")), infoDup.ok ? JSON.stringify(infoDup.data.notes) : infoDup.message);

    // 月老网页对话（无 LLM key → 占位回复但仍落库）
    const chatRes = await call("memberBotChat", { text: "我想找个爱爬山的人" }, cookieA);
    assert("I11 网页对话有回复", chatRes.ok && typeof chatRes.data.reply === "string" && chatRes.data.reply.length > 0);
    const hist = await call("memberBotHistory", undefined, cookieA);
    assert("I12 对话历史已落库", hist.ok && hist.data.length >= 2, hist.ok ? `len=${hist.data.length}` : hist.message);
    await new Promise((r) => setTimeout(r, 1200));
    const [profA] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, pM.id));
    assert("I13 对话沉淀到 chat_facts", Boolean(profA.chatFacts && profA.chatFacts.includes("mock-extract")), profA.chatFacts ?? "空");

    // 回访（强制周一周二）
    process.env.BOT_FORCE_PHASE = "feedback";
    await db.update(schema.matches).set({ state: "dating" }).where(eq(schema.matches.id, m1id));
    const fb = await call("memberWebFeedback", { met: 1, score: 4, suggestion: "希望下次推荐更近的地方" }, cookieA);
    assert("I14 回访提交 → ok", fb.ok && fb.data.ok === true);
    const [m1Fb] = await db.select().from(schema.matches).where(eq(schema.matches.id, m1id));
    assert("I15 回访写入 matches（score=4, done, 改进意见落库）", m1Fb.score === 4 && m1Fb.state === "done" && m1Fb.feedbackNote === "希望下次推荐更近的地方");
    const fbBad = await call("memberWebFeedback", { met: 0, score: 2 }, cookieDup);
    assert("I16 差评回访 → 也收（出池由调度侧查）", fbBad.ok);
    delete process.env.BOT_FORCE_PHASE;

    // ============ J. 约会邀请与偏好强制 ============
    console.log("J. 约会邀请与偏好强制");
    // J1 开开关但三类偏好全空 → 拒
    const dpBad = await call("memberSaveDatePrefs", { participate: true, locations: [], activities: [], times: [] }, cookieA);
    assert("J1 参加开关但偏好空 → 拒", !dpBad.ok && dpBad.message.includes("填齐"));
    const dpGood = await call("memberSaveDatePrefs", { participate: true, locations: ["五棵松"], activities: ["一起吃顿饭"], times: ["周六晚上"] }, cookieA);
    assert("J2 偏好填齐 → ok", dpGood.ok);

    // 邀请流程（新造一对 confirmed）
    const [pI1] = await db.select().from(schema.profiles).where(eq(schema.profiles.sessionId, "zzt-alpha-sess"));
    const [pI2] = await db.select().from(schema.profiles).where(eq(schema.profiles.sessionId, "zzt-dup-2"));
    const mi = await db.insert(schema.matches).values({ weekKey: week, manProfileId: pI1.id, womanProfileId: pI2.id, state: "confirmed", reason: "邀请测试" });
    const miid = Number(mi[0].insertId);
    const optsR = await call("memberDateOptions", undefined, cookieA);
    assert("J3 约会选项返回商家与时间槽", optsR.ok && optsR.data.ok === true && optsR.data.merchants.length > 0 && optsR.data.time.slots.length > 0);
    const merchTop = optsR.data.merchants[0];
    const slot = optsR.data.time.slots[0];
    const inv = await call("memberSendInvite", { merchantId: merchTop.id, timeSlot: slot }, cookieA);
    assert("J4 发出邀请 → ok", inv.ok && inv.ok === undefined ? true : inv.ok && inv.data.ok === true);
    const invBad = await call("memberAnswerInvite", { inviteId: 1, accept: true }, cookieA);
    // 自己发的邀请不能自己接：先拿邀请 id
    const invList = await call("memberInvites", undefined, cookieDup);
    const incoming = invList.data.invites.find((i: any) => !i.fromMe && i.status === "pending");
    assert("J5 对方看到 pending 邀请", !!incoming);
    const selfAns = await call("memberAnswerInvite", { inviteId: incoming.id, accept: true }, cookieA);
    assert("J6 自己接自己的邀请 → 拒", selfAns.ok && selfAns.data.ok === false);
    const ans = await call("memberAnswerInvite", { inviteId: incoming.id, accept: true }, cookieDup);
    assert("J7 对方接受 → 锁定", ans.ok && ans.data.accepted === true);
    const after = await call("memberDateOptions", undefined, cookieA);
    assert("J8 定案写入 matches（merchant+timeSlot）", after.data.locked?.merchantId === merchTop.id && after.data.locked?.timeSlot === slot);
    const again = await call("memberSendInvite", { merchantId: merchTop.id, timeSlot: slot }, cookieA);
    assert("J9 定案后不能再发邀请", again.ok && again.data.ok === false);
    // ============ 收尾 ============
    console.log("\n============================");
    console.log(`${passed} 通过, ${failed} 失败`);
    if (failures.length) console.log("失败项:", failures.join(" | "));
  } finally {
    await cleanup();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
