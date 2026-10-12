// DeepSeek 匹配管线验证：preparePoolData 纯函数 + scorePool（2男2女真实调 DeepSeek）+ aggregateResults。
// 运行：npm run test:dsmatch
import "dotenv/config";

let passed = 0, failed = 0;
function assert(name: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? " —— " + extra : ""}`); }
}

const { preparePoolData, scorePool, aggregateResults, DEFAULT_DS_PROMPT } = await import("../api/lib/dsMatch");

// 1) preparePoolData：去重 + 异地/同班过滤
const fakeRows: any[] = [
  { id: 1, sessionId: "s1", name: "张三", wechat: "zs_1", phone: "", gender: "男", birthYear: 1997, city: "北京", gradClass: "2016届1班", mbti: "INTJ", height: 178, job: "互联网", intro: "喜欢爬山", expectation: "温和", value: "真诚" },
  { id: 2, sessionId: "s2", name: "张三", wechat: "zs_2", phone: "", gender: "男", birthYear: 1997, city: "北京", gradClass: "2016届1班", mbti: "", height: null, job: null, intro: "", expectation: "", value: "" },
  { id: 3, sessionId: "s3", name: "李四", wechat: "lisi", phone: "", gender: "女", birthYear: 1998, city: "北京", gradClass: "2016届1班", mbti: "", height: 165, job: null, intro: "读书", expectation: "", value: "" },
  { id: 4, sessionId: "s4", name: "王五", wechat: "wangwu", phone: "", gender: "女", birthYear: 1998, city: "北京", gradClass: "2016届2班", mbti: "", height: 168, job: null, intro: "摄影", expectation: "", value: "" },
  { id: 5, sessionId: "s5", name: "赵六", wechat: "zhaoliu", phone: "", gender: "女", birthYear: 1998, city: "上海", gradClass: "2016届3班", mbti: "", height: 160, job: null, intro: "", expectation: "", value: "" },
];
const pool = preparePoolData(fakeRows);
assert("同名去重留最新（张三留 id=2）", pool.men.length === 1 && pool.droppedDuplicates.length === 1);
assert("李四同班过滤", pool.skipped.some((s) => s.man === "张三" && s.woman === "李四" && s.reason === "同班"));
assert("赵六异地过滤", pool.skipped.some((s) => s.woman === "赵六" && s.reason === "异地"));
assert("只剩 张三×王五 一个有效对", pool.eligible.length === 1 && pool.eligible[0].man === "M00" && pool.eligible[0].woman === "W01");

// 2) scorePool：2 男 2 女全部有效，真实调 DeepSeek（约 4 次调用）
const men2: any[] = [
  { id: 6, sessionId: "s6", name: "甲一", wechat: "m1", phone: "", gender: "男", birthYear: 1997, city: "北京", gradClass: "2016届1班", mbti: "INTJ", height: 180, job: "产品经理", intro: "周末爬山、做饭、看纪录片", expectation: "聊得来、温和", value: "真诚沟通" },
  { id: 7, sessionId: "s7", name: "乙二", wechat: "m2", phone: "", gender: "男", birthYear: 1998, city: "北京", gradClass: "2016届2班", mbti: "ENFP", height: 175, job: "医生", intro: "跑步、乐队、撸猫", expectation: "有趣、爱笑", value: "情绪稳定" },
];
const women2: any[] = [
  { id: 8, sessionId: "s8", name: "丙三", wechat: "w1", phone: "", gender: "女", birthYear: 1998, city: "北京", gradClass: "2016届3班", mbti: "INFJ", height: 166, job: "教师", intro: "读书、瑜伽、citywalk", expectation: "有责任心", value: "互相尊重" },
  { id: 9, sessionId: "s9", name: "丁四", wechat: "w2", phone: "", gender: "女", birthYear: 1997, city: "北京", gradClass: "2016届4班", mbti: "ESTJ", height: 170, job: "律师", intro: "羽毛球、烘焙、看展", expectation: "直球一点", value: "说到做到" },
];
const pool2 = preparePoolData([...men2, ...women2]);
assert("2x2 全有效（不同班同城）", pool2.eligible.length === 4);

console.log("  （调 DeepSeek 打分中，约 30 秒…）");
const scores = await scorePool(pool2, DEFAULT_DS_PROMPT, (d, t) => console.log(`  进度 ${d}/${t}`));
assert("4 个人都有评分", scores.size === 4);
assert("每人 2 个候选", [...scores.values()].every((m) => m.size === 2));
assert("三轮分数都在 0-100", [...scores.values()].every((m) => [...m.values()].every((s) => s.rounds.every((r) => r >= 0 && r <= 100))));
assert("每轮都带中文理由", [...scores.values()].every((m) => [...m.values()].every((s) => s.reasons.every((r) => r.length > 0))));

// 3) aggregateResults：形状与约束
const result = aggregateResults(pool2, scores);
assert("eligibleCount=4", result.eligibleCount === 4);
assert("全局 2 对且人不重复", result.globalPairs.length === 2 && new Set(result.globalPairs.flatMap((p) => [p.man, p.woman])).size === 4);
assert("每人都有局部最优", result.localMen.length === 2 && result.localWomen.length === 2 && [...result.localMen, ...result.localWomen].every((l) => l.best !== null));
assert("和谐分=双方均分的平均", Math.abs(result.globalPairs[0].harmony - (result.globalPairs[0].manSat + result.globalPairs[0].womanSat) / 2) < 0.01);
console.log("  全局配对示例:", result.globalPairs.map((p) => `${p.man}×${p.woman}(${p.harmony})`).join("  "));

console.log(`\n${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
