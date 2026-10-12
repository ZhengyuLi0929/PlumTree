// 为所有填过信息的用户生成 8 位初始密码（不重复），写入 member_credentials，导出 CSV。
// 运行：npm run gen:passwords           —— 本地库
// 服务器上：DATABASE_URL/APP_SECRET 取自 /etc/tongzhuo/env（脚本自动识别）
import fs from "node:fs";
import path from "node:path";

// 必须先于任何 app 模块加载：env.ts 在 import 时读 process.env（静态 import 会被提升，来不及）
if (fs.existsSync("/etc/tongzhuo/env")) {
  for (const line of fs.readFileSync("/etc/tongzhuo/env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const { ensureTable, getDb, hasDatabase } = await import("../api/queries/connection");
const { profiles } = await import("../db/schema");
const { generatePassword, setPassword } = await import("../api/lib/credentials");
const { normalizePhone, PHONE_RE } = await import("../api/lib/enroll");

async function main() {
  if (!hasDatabase()) {
    console.error("需要 DATABASE_URL");
    process.exit(1);
  }
  await ensureTable();
  const db = getDb();
  const rows = await db.select().from(profiles);

  // 一人一行：以手机号为主键，重复报名取 id 最大（第二次为准）
  const byPhone = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const phone = normalizePhone(r.phone ?? "");
    if (!PHONE_RE.test(phone)) continue;
    const prev = byPhone.get(phone);
    if (!prev || r.id > prev.id) byPhone.set(phone, r);
  }

  const used = new Set<string>();
  const out: { name: string; phone: string; password: string }[] = [];
  for (const r of [...byPhone.values()].sort((a, b) => a.id - b.id)) {
    const phone = normalizePhone(r.phone);
    let pw = generatePassword();
    while (used.has(pw)) pw = generatePassword();
    used.add(pw);
    await setPassword(phone, pw);
    out.push({ name: r.name, phone, password: pw });
  }

  const noPhone = rows.filter((r) => !PHONE_RE.test(normalizePhone(r.phone ?? "")) && !r.name.includes("沙箱") && r.sessionId !== "preview-session");
  const noPhoneNames = [...new Set(noPhone.map((r) => r.name))];

  const csv = "姓名,手机号,初始密码\n" + out.map((r) => `${r.name},${r.phone},${r.password}`).join("\n") + "\n";
  const file = path.resolve(`种子用户初始密码_${new Date().toISOString().slice(0, 10)}.csv`);
  fs.writeFileSync(file, "﻿" + csv, "utf8");
  console.log(`已为 ${out.length} 人生成并写入初始密码（互不重复）`);
  console.log(`CSV: ${file}`);
  if (noPhoneNames.length) console.log(`以下 ${noPhoneNames.length} 人没有手机号记录，未生成：${noPhoneNames.join("、")}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
