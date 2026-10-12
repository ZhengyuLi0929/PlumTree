// 临时登录方式：姓名+手机号+初始密码（组织者手动发放），登录后可自改密码。
// 短信 OTP 登录代码保留未动；回滚时此文件停用即可。
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { memberCredentials } from "../../db/schema";
import { ensureTable, getDb } from "../queries/connection";
import { env } from "./env";

export function hashPassword(password: string) {
  // 不加手机号盐：用户改手机号时凭证直接随迁（手机号做盐会导致迁移后哈希失配）
  return createHash("sha256").update(`${env.appSecret || "dev-enroll-secret"}:${password}`).digest("hex");
}

/** 8 位初始密码：小写字母+数字，至少一字母一数字 */
export function generatePassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyz"; // 去掉易混淆 i l o
  const digits = "23456789"; // 去掉 0 1
  const alphabet = letters + digits;
  let pw = "";
  do {
    pw = Array.from({ length: 8 }, () => alphabet[randomInt(0, alphabet.length)]).join("");
  } while (!/[a-z]/.test(pw) || !/\d/.test(pw));
  return pw;
}

export async function setPassword(phone: string, password: string) {
  await ensureTable();
  await getDb()
    .insert(memberCredentials)
    .values({ phone, passwordHash: hashPassword(password) })
    .onDuplicateKeyUpdate({ set: { passwordHash: hashPassword(password) } });
}

/** 返回 true=密码正确；null=还没发过初始密码 */
export async function verifyPassword(phone: string, password: string): Promise<boolean | null> {
  await ensureTable();
  const [row] = await getDb().select().from(memberCredentials).where(eq(memberCredentials.phone, phone));
  if (!row) return null;
  const a = Buffer.from(hashPassword(password));
  const b = Buffer.from(row.passwordHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 用户改手机号时把凭证迁到新号码 */
export async function moveCredential(fromPhone: string, toPhone: string) {
  await ensureTable();
  const db = getDb();
  const [row] = await db.select().from(memberCredentials).where(eq(memberCredentials.phone, fromPhone));
  if (!row) return;
  await db.delete(memberCredentials).where(eq(memberCredentials.phone, fromPhone));
  await db.insert(memberCredentials).values({ phone: toPhone, passwordHash: row.passwordHash });
}
