// 导入真实商户库：business_partners/1019-商户list(1).xlsx → scripts/merchants-seed.json（python 预解析）。
// 清空 merchants 表（包括占位示例数据），写入真实商户。幂等，可重复运行。
// 运行：npm run import:merchants        —— 本地库
// 服务器上：DATABASE_URL 取自 /etc/tongzhuo/env（脚本自动识别），同目录下 npm run import:merchants
import fs from "node:fs";

// 必须先于任何 app 模块加载：env.ts 在 import 时读 process.env（静态 import 会被提升，来不及）
if (fs.existsSync("/etc/tongzhuo/env")) {
  for (const line of fs.readFileSync("/etc/tongzhuo/env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const { ensureTable, getDb } = await import("../api/queries/connection");
const { merchants } = await import("../db/schema");

type Seed = { name: string; address: string; area: string; category: string };

const seeds = JSON.parse(fs.readFileSync(new URL("../scripts/merchants-seed.json", import.meta.url), "utf-8")) as Seed[];

await ensureTable();
const db = getDb();
await db.delete(merchants);
for (const s of seeds) {
  await db.insert(merchants).values({ name: s.name, address: s.address, area: s.area, category: s.category, rebateCents: 0, status: "active" });
}
console.log(`[merchants] 已导入 ${seeds.length} 家真实商户（旧数据已清空）`);
process.exit(0);
