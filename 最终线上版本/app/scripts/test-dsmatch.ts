// DeepSeek 匹配管线 v2 验证：去重/硬过滤/规则预筛 topK/按对打分（真实调 DeepSeek）/失败容忍/聚合。
// 运行：npm run test:dsmatch
import "dotenv/config";

let passed = 0, failed = 0;
function assert(name: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? " —— " + extra : ""}`); }
}

const { preparePoolData, prefilterEligible, scorePairs, aggregateResults, DEFAULT_DS_PROMPT } = await import("../api/lib/dsMatch");

const fakeRows: any[] = [
  { id: 1, sessionId: "s1", name: "张三", wechat: "zs_1", phone: "", gender: "男", birthYear: 1997, city: "北京", gradClass: "2016届1班", mbti: "INTJ", height: 178, job: "互联网", intro: "喜欢爬山", expectation: "温和", value: "真诚" },
  { id: 2, sessionId: "s2", name: "张三", wechat: "zs_2", phone: "", gender: "男", birthYear: 1997, city: "北京", gradClass: "2016届1班", mbti: "", height: null, job: null, intro: "", expectation: "", value: "" },
  { id: 3, sessionId: "s3", name: "李四", wechat: "lisi", phone: "", gender: "女", birthYear: 1998, city: "北京", gradClass: "2016届1班", mbti: "", height: 165, job: null, intro: "读书", expectation: "", value: "" },
  { id: 4, sessionId: "s4", name: "王五", wechat: "wangwu", phone: "", gender: "女", birthYear: 1998, city: "北京", gradClass: "2016届2班", mbti: "", height: 168, job: null, intro: "摄影", expectation: "", value: "" },
  { id: 5, sessionId: "s5", name: "赵六", wechat: "zhaoliu", phone: "", gender: "女", birthYear: 1998, city: "上海", gradClass: "2016届3班", mbti: "", height: 160, job: null, intro: "", expectation: "", value: "" },
];
const noCode = () => null;
const pool = preparePoolData(fakeRows, noCode);
assert("同名去重留最新（张三留 id=2）", pool.men.length === 1 && pool.droppedDuplicates.length === 1);
assert("李四同班过滤", pool.skipped.some((s) => s.man === "张三" && s.woman === "李四" && s.reason === "同班"));
assert("赵六异地过滤", pool.skipped.some((s) => s.woman === "赵六" && s.reason === "异地"));
assert("只剩 张三×王五 一个有效对", pool.eligible.length === 1);

// 规则预筛 topK：2 男 2 女全有效时 topK=1 → 每人最多 1 个候选（双向并集 ≤ 4 对，且每人 ≤1）
const men2: any[] = [
  { id: 6, sessionId: "s6", name: "甲一", wechat: "m1", phone: "", gender: "男", birthYear: 1997, city: "北京", gradClass: "2016届1班", mbti: "INTJ", height: 180, job: "产品经理", intro: "周末爬山、做饭、看纪录片", expectation: "聊得来、温和", value: "真诚沟通" },
  { id: 7, sessionId: "s7", name: "乙二", wechat: "m2", phone: "", gender: "男", birthYear: 1998, city: "北京", gradClass: "2016届2班", mbti: "ENFP", height: 175, job: "医生", intro: "跑步、乐队、撸猫", expectation: "有趣、爱笑", value: "情绪稳定" },
];
const women2: any[] = [
  { id: 8, sessionId: "s8", name: "丙三", wechat: "w1", phone: "", gender: "女", birthYear: 1998, city: "北京", gradClass: "2016届3班", mbti: "INFJ", height: 166, job: "教师", intro: "读书、瑜伽、citywalk", expectation: "有责任心", value: "互相尊重" },
  { id: 9, sessionId: "s9", name: "丁四", wechat: "w2", phone: "", gender: "女", birthYear: 1997, city: "北京", gradClass: "2016届4班", mbti: "ESTJ", height: 170, job: "律师", intro: "羽毛球、烘焙、看展", expectation: "直球一点", value: "说到做到" },
];
const pool2 = preparePoolData([...men2, ...women2], noCode);
assert("2x2 硬过滤后 4 对全有效", pool2.eligible.length === 4);
const pf1 = prefilterEligible(pool2, 1);
const countOf = (id: string) => pf1.eligible.filter((e) => e.man === id || e.woman === id).length;
assert("topK=1 并集后每人最多 2 个候选、总对数 ≤4", pf1.eligible.length >= 2 && pf1.eligible.length <= 4 && [...pool2.men, ...pool2.women].every((c) => countOf(c.id) <= 2), `eligible=${pf1.eligible.length}`);
const pfAll = prefilterEligible(pool2, 8);
assert("topK=8 不裁剪（4 对保留）", pfAll.eligible.length === 4);
const pfHard = prefilterEligible(preparePoolData([
  { id: 10, sessionId: "h1", name: "甲男", wechat: "hm", phone: "", gender: "男", birthYear: 1997, city: "北京", gradClass: "2016届1班", mbti: "", height: 170, job: null, intro: "", expectation: "", value: "" },
  { id: 11, sessionId: "h2", name: "乙女", wechat: "hw", phone: "", gender: "女", birthYear: 1998, city: "北京", gradClass: "2016届2班", mbti: "", height: 165, job: null, intro: "", expectation: "", value: "", prefMinHeight: 180 },
], noCode), 8);
assert("身高雷区被规则预筛剔除", pfHard.eligible.length === 0 && pfHard.hardDropped === 1);

// 按对打分（真实 DeepSeek，4 对 4 次调用）
console.log("  （调 DeepSeek 按对打分中，约 30 秒…）");
const failures: string[] = [];
const scores = await scorePairs(pool2, pfAll.eligible, DEFAULT_DS_PROMPT, 5, (d, t) => console.log(`  进度 ${d}/${t}`), (label, err) => failures.push(`${label}: ${err}`));
assert("4 对都有评分", scores.size === 4, `失败=${failures.join("|")}`);
assert("双方三轮分数都在 0-100", [...scores.values()].every((p) => [...p.man.rounds, ...p.woman.rounds].every((r) => r >= 0 && r <= 100)));
assert("双方都带中文理由", [...scores.values()].every((p) => [...p.man.reasons, ...p.woman.reasons].every((r) => r.trim().length > 0)));
assert("无失败记录", failures.length === 0, failures.join("|"));

// 聚合：正常 + 失败容忍（删掉一对评分，应被跳过并进失败清单）
const result = aggregateResults(pool2, pfAll.eligible, scores, []);
assert("eligibleCount=4", result.eligibleCount === 4);
assert("全局 2 对且人不重复", result.globalPairs.length === 2 && new Set(result.globalPairs.flatMap((p) => [p.man, p.woman])).size === 4);
assert("和谐分=双方均分的平均", Math.abs(result.globalPairs[0].harmony - (result.globalPairs[0].manSat + result.globalPairs[0].womanSat) / 2) < 0.01);
const partial = new Map(scores);
const droppedKey = [...partial.keys()][0];
partial.delete(droppedKey);
const result2 = aggregateResults(pool2, pfAll.eligible, partial, [`${droppedKey} 模拟失败`]);
assert("缺一对评分时全局仍可用（3 对计分）", result2.eligibleCount === 3 && result2.scoringFailures.length === 1);
console.log("  全局配对示例:", result.globalPairs.map((p) => `${p.man}×${p.woman}(${p.harmony})`).join("  "));

console.log(`\n${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
