function hostOf(raw: string) {
  try {
    return new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function cstDayKey(now = new Date()) {
  const cst = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return cst.toISOString().slice(0, 10);
}

/** 在 YYYY-MM-DD 上加减天数，不经过服务器本地时区。 */
export function shiftDayKey(dayKey: string, delta: number) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const utc = new Date(Date.UTC(year, (month || 1) - 1, (day || 1) + delta));
  return utc.toISOString().slice(0, 10);
}

export function classifyVisitSource(referrer: string, landing: string) {
  try {
    const landingUrl = new URL(landing, "https://www.deskcupid.com");
    const utm = landingUrl.searchParams.get("utm_source")?.trim();
    if (utm) return utm.slice(0, 64);
  } catch {
    /* ignore */
  }

  const host = hostOf(referrer);
  if (!host) return "直接访问";
  if (/weixin|wechat/.test(host)) return "微信";
  if (host.includes("google")) return "Google";
  if (host.includes("baidu")) return "百度";
  if (host.includes("bing")) return "Bing";
  if (/douyin|tiktok/.test(host)) return "抖音";
  if (/xiaohongshu|xhslink/.test(host)) return "小红书";
  if (host.includes("zhihu")) return "知乎";
  if (host.includes("github")) return "GitHub";
  if (/(deskcupid\.com|localhost|127\.0\.0\.1)$/.test(host)) return "站内";
  return host.slice(0, 64);
}
