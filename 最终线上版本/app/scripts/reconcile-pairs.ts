// 修复历史遗留：match_pairs 里有、matches 里缺失（或还是旧 AI 配对）的手动配对，同步进 matches。
// 运行：npm run reconcile:pairs        —— 本地库
// 服务器上：DATABASE_URL 取自 /etc/tongzhuo/env（脚本自动识别），同目录下 npm run reconcile:pairs
import fs from "node:fs";

// 必须先于任何 app 模块加载：env.ts 在 import 时读 process.env（静态 import 会被提升，来不及）
if (fs.existsSync("/etc/tongzhuo/env")) {
  for (const line of fs.readFileSync("/etc/tongzhuo/env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const { reconcileManualPairs } = await import("../api/lib/reconcile");
const { isoWeekKey } = await import("../api/lib/enroll");

const weekKey = isoWeekKey();
const r = await reconcileManualPairs(weekKey);
console.log(`[reconcile] ${weekKey} 修复了 ${r.repaired} 对手动配对`);
process.exit(0);
