// 密码哈希方案迁移：从「手机号盐」改为「纯密钥盐」（改手机号后凭证才能随迁）。
// 只更新仍持有初始密码的行（hash 与 CSV 明文对得上）；用户自改过的密码不动。
// 用法：node rehash-passwords.mjs <CSV路径>
import fs from "node:fs";
import { createHash } from "node:crypto";

// /etc/tongzhuo/env 兜底（服务器上无 .env）
if (fs.existsSync("/etc/tongzhuo/env")) {
  for (const line of fs.readFileSync("/etc/tongzhuo/env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("用法: node rehash-passwords.mjs <CSV路径>");
  process.exit(1);
}

const { ensureTable, getDb, hasDatabase } = await import("../api/queries/connection");
const { memberCredentials } = await import("../db/schema");
const { eq } = await import("drizzle-orm");

const secret = process.env.APP_SECRET || "dev-enroll-secret";
const oldHash = (phone: string, pw: string) => createHash("sha256").update(`${secret}:${phone}:${pw}`).digest("hex");
const newHash = (pw: string) => createHash("sha256").update(`${secret}:${pw}`).digest("hex");

async function main() {
  if (!hasDatabase()) { console.error("需要 DATABASE_URL"); process.exit(1); }
  await ensureTable();
  const db = getDb();
  const lines = fs.readFileSync(csvPath, "utf8").replace(/^﻿/, "").split("\n").slice(1);
  let migrated = 0, skipped = 0, missing = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const [name, phone, pw] = line.split(",");
    if (!phone || !pw) continue;
    const [row] = await db.select().from(memberCredentials).where(eq(memberCredentials.phone, phone));
    if (!row) { missing++; continue; }
    if (row.passwordHash !== oldHash(phone, pw)) { skipped++; continue; } // 用户已自改
    await db.update(memberCredentials).set({ passwordHash: newHash(pw) }).where(eq(memberCredentials.phone, phone));
    migrated++;
  }
  console.log(`迁移 ${migrated}，用户已自改跳过 ${skipped}，库里不存在 ${missing}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
