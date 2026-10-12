// 会员流程集成测试：sendLoginCode（姓名+手机号，dev 返回 devCode）→ verifyLoginCode（名单外写手机号）
// → memberRegister（作答建档 / 幂等复用）→ memberUpdate 扩展字段（name/gender/birthYear）。
// 运行：npm run db:up && cp .env.example .env（填 DATABASE_URL）后执行 npm run test:member

// 清空短信配置，强制走 dev 通道（sendLoginCode 返回 devCode、不发真实短信）。
// 必须早于 ../api/boot 的加载（env.ts 在模块加载时读 process.env），所以下面的依赖全部用动态 import。
for (const key of [
  "TENCENT_SECRET_ID",
  "TENCENT_SECRET_KEY",
  "TENCENT_SMS_SDK_APP_ID",
  "TENCENT_SMS_SIGN_NAME",
  "TENCENT_SMS_TEMPLATE_ID",
  "ALIYUN_ACCESS_KEY_ID",
  "ALIYUN_ACCESS_KEY_SECRET",
  "SMS_SIGN_NAME",
  "SMS_OTP_TEMPLATE",
]) {
  process.env[key] = "";
}

const NAME_A = "会员测试甲"; // 在册，有手机号
const NAME_B = "会员测试乙"; // 在册，无手机号（名单外的人）
const NAME_C = "会员测试丙"; // 不在册，走 memberRegister 新建
const NAME_A2 = "会员测试甲改";
const PHONE_A = "13800001111";
const PHONE_B = "13800002222";
const PHONE_C = "13800003333";
const SID_A = "test-member-sess-a";
const SID_B = "test-member-sess-b";
const SID_C = "test-member-sess-c";
const TEST_SIDS = [SID_A, SID_B, SID_C];
const TEST_PHONES = [PHONE_A, PHONE_B, PHONE_C];

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

type TrpcResult<T> =
  | { ok: true; data: T; headers: Headers }
  | { ok: false; code: string; message: string };

async function main() {
  const { default: app } = await import("../api/boot");
  const { ensureTable, getDb, hasDatabase } = await import("../api/queries/connection");
  const { profiles, responsesV3, otpCodes, matchPool } = await import("../db/schema");
  const { hashOtp } = await import("../api/lib/enroll");
  const { putOtp } = await import("../api/lib/otp");
  const { eq, or, like, inArray } = await import("drizzle-orm");

  if (!hasDatabase()) {
    console.error("需要 DATABASE_URL（先 npm run db:up 并配置 .env）");
    process.exit(1);
  }

  // tRPC over fetch：直接打 app.fetch，不起监听端口
  async function callTrpc<T>(proc: string, input: unknown, cookie?: string): Promise<TrpcResult<T>> {
    const res = await app.fetch(
      new Request(`http://test.local/api/trpc/responses.${proc}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ json: input }),
      }),
    );
    const body = (await res.json()) as {
      result?: { data?: { json?: T } };
      error?: { json?: { message?: string; data?: { code?: string } } };
    };
    if (body.error) {
      return { ok: false, code: body.error.json?.data?.code ?? "", message: body.error.json?.message ?? "" };
    }
    return { ok: true, data: body.result?.data?.json as T, headers: res.headers };
  }

  await ensureTable();
  const db = getDb();

  async function cleanup() {
    await db.delete(otpCodes).where(inArray(otpCodes.phone, TEST_PHONES));
    const rows = await db.select().from(profiles).where(like(profiles.name, "会员测试%"));
    for (const row of rows) {
      await db.delete(matchPool).where(eq(matchPool.profileId, row.id));
    }
    await db.delete(profiles).where(or(like(profiles.name, "会员测试%"), inArray(profiles.sessionId, TEST_SIDS)));
    await db.delete(responsesV3).where(inArray(responsesV3.sessionId, TEST_SIDS));
  }

  await cleanup(); // 先清掉上次可能残留的数据

  try {
    console.log("0) 准备测试档案（甲：在册有手机号；乙：在册无手机号）");
    await db.insert(profiles).values([
      { sessionId: SID_A, name: NAME_A, wechat: "wx_member_test_a", phone: PHONE_A, gender: "男", birthYear: 1997, city: "北京", gradClass: "2016届1班", intro: "会员流程集成测试用介绍，三十个字三十个字三十个字。", consentAt: new Date() },
      { sessionId: SID_B, name: NAME_B, wechat: "wx_member_test_b", phone: "", gender: "女", birthYear: 1998, city: "北京", gradClass: "2016届2班", intro: "会员流程集成测试用介绍，三十个字三十个字三十个字。", consentAt: new Date() },
    ]);
    const seeded = await db.select().from(profiles).where(inArray(profiles.sessionId, [SID_A, SID_B]));
    assert("甲、乙档案已插入", seeded.length === 2);

    console.log("1) sendLoginCode：姓名 + 手机号校验");
    const sendA = await callTrpc<{ ok: boolean; devCode?: string }>("sendLoginCode", { name: NAME_A, phone: PHONE_A });
    assert("正确姓名+手机号 → ok", sendA.ok && sendA.data.ok === true);
    const devCodeA = sendA.ok ? (sendA.data.devCode ?? "") : "";
    assert("dev 模式返回 6 位 devCode", /^\d{6}$/.test(devCodeA));
    const wrongName = await callTrpc("sendLoginCode", { name: "根本不叫这个", phone: PHONE_A });
    assert(`手机号在但姓名不对 → 报错（${wrongName.ok ? "竟然通过了" : wrongName.message}）`, !wrongName.ok);
    const noName = await callTrpc("sendLoginCode", { name: "名单没有的人", phone: "13899990000" });
    assert(`姓名不在册 → 报错（${noName.ok ? "竟然通过了" : noName.message}）`, !noName.ok);

    console.log("2) verifyLoginCode：devCode 登录；名单外的乙验证后写入手机号");
    const badCode = devCodeA === "000000" ? "000001" : "000000";
    const wrongCode = await callTrpc("verifyLoginCode", { phone: PHONE_A, code: badCode });
    assert("错误验证码 → 报错", !wrongCode.ok);
    const verifyA = await callTrpc<{ ok: boolean }>("verifyLoginCode", { phone: PHONE_A, code: devCodeA });
    assert("甲 devCode 验证通过", verifyA.ok && verifyA.data.ok === true);
    const setCookie = verifyA.ok ? (verifyA.headers.get("set-cookie") ?? "") : "";
    const cookieMatch = setCookie.match(/member_session=([^;]+)/);
    assert("验证后种下会员 cookie", Boolean(cookieMatch));
    const cookieA = cookieMatch ? `member_session=${cookieMatch[1]}` : "";

    const sendB = await callTrpc<{ ok: boolean; devCode?: string }>("sendLoginCode", { name: NAME_B, phone: PHONE_B });
    const devCodeB = sendB.ok ? (sendB.data.devCode ?? "") : "";
    assert("乙（在册无手机号）→ 任意手机号可发码", sendB.ok && /^\d{6}$/.test(devCodeB));
    const verifyB = await callTrpc<{ ok: boolean }>("verifyLoginCode", { phone: PHONE_B, code: devCodeB, name: NAME_B });
    assert("乙 devCode 验证通过", verifyB.ok && verifyB.data.ok === true);
    const [pb] = await db.select().from(profiles).where(eq(profiles.sessionId, SID_B));
    assert("乙 验证后手机号已写入档案", pb?.phone === PHONE_B);

    console.log("3) memberRegister：responsesV3 作答 → 新建档 created:true → 再调 created:false");
    await db.insert(responsesV3).values({ sessionId: SID_C, typeCode: "ISRH", gender: "女", answers: "{}", rankings: "{}", timings: "{}" });
    const codeC = "246810";
    const seedOtpC = () =>
      putOtp({ phone: PHONE_C, codeHash: hashOtp(PHONE_C, codeC), expiresAt: Date.now() + 600_000, sentAt: Date.now(), hourStarted: Date.now(), hourCount: 1 });
    await seedOtpC();
    const reg1 = await callTrpc<{ ok: boolean; created?: boolean }>("memberRegister", { sessionId: SID_C, name: NAME_C, phone: PHONE_C, code: codeC, consent: true });
    assert("首次 memberRegister created:true", reg1.ok && reg1.data.created === true);
    await seedOtpC(); // 首次成功可能已清掉验证码，补一颗再测幂等
    const reg2 = await callTrpc<{ ok: boolean; created?: boolean }>("memberRegister", { sessionId: SID_C, name: NAME_C, phone: PHONE_C, code: codeC, consent: true });
    assert("再次 memberRegister created:false", reg2.ok && reg2.data.created === false);
    const [pc] = await db.select().from(profiles).where(eq(profiles.sessionId, SID_C));
    assert("丙 档案已创建且写入手机号", pc?.name === NAME_C && pc?.phone === PHONE_C);

    console.log("4) memberUpdate：扩展字段 name / gender / birthYear");
    const upd = await callTrpc<{ ok: boolean }>("memberUpdate", { name: NAME_A2, gender: "女", birthYear: 1999 }, cookieA);
    assert("memberUpdate 返回 ok", upd.ok && upd.data.ok === true);
    const [pa2] = await db.select().from(profiles).where(eq(profiles.sessionId, SID_A));
    assert("name 已改", pa2?.name === NAME_A2);
    assert("gender 已改", pa2?.gender === "女");
    assert("birthYear 已改", pa2?.birthYear === 1999);
  } finally {
    await cleanup();
  }

  console.log(`\n${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
