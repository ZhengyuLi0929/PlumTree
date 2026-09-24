#!/usr/bin/env python3
"""Export pair_scores.json to a standalone HTML file others can open in a browser."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"


def rounds(scores, reasons):
    labels = ["初见", "一个月", "长期"]
    return [{"label": a, "score": int(b), "why": c} for a, b, c in zip(labels, scores, reasons)]


def fmt(n) -> str:
    return f"{n:.2f}".rstrip("0").rstrip(".")


def pack_pair(p: dict) -> dict:
    return {
        "man": p["man"],
        "woman": p["woman"],
        "manWechat": p.get("manWechat") or "",
        "womanWechat": p.get("womanWechat") or "",
        "manSat": fmt(p["manSat"]),
        "womanSat": fmt(p["womanSat"]),
        "harmony": fmt(p["harmony"]),
        "manRounds": rounds(p["manSatRounds"], p["manReasons"]),
        "womanRounds": rounds(p["womanSatRounds"], p["womanReasons"]),
    }


def pack_local(rows: list) -> list:
    out = []
    for r in rows:
        if not r.get("best"):
            out.append({"person": r["person"], "best": None, "reason": r.get("reason") or ""})
            continue
        out.append(
            {
                "person": r["person"],
                "best": r["best"],
                "manSat": fmt(r["manSat"]),
                "womanSat": fmt(r["womanSat"]),
                "harmony": fmt(r["harmony"]),
                "manRounds": rounds(r["manSatRounds"], r["manReasons"]),
                "womanRounds": rounds(r["womanSatRounds"], r["womanReasons"]),
            }
        )
    return out


def main() -> None:
    res = json.loads((DATA / "pair_scores.json").read_text(encoding="utf-8"))
    payload = {
        "eligible": res["eligibleCount"],
        "globalN": len(res["globalPairs"]),
        "globalSum": res["globalSum"],
        "skippedLd": sum(1 for x in res["skipped"] if x["reason"] == "异地"),
        "skippedCl": sum(1 for x in res["skipped"] if x["reason"] == "同班"),
        "unmatchedMen": res["unmatchedMen"],
        "unmatchedWomen": res["unmatchedWomen"],
        "global": [pack_pair(p) for p in res["globalPairs"]],
        "localMen": pack_local(res["localMen"]),
        "localWomen": pack_local(res["localWomen"]),
    }
    html = TEMPLATE.replace("__DATA__", json.dumps(payload, ensure_ascii=False))
    out = ROOT / "DeskCupid-matches.html"
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out}")


TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>DeskCupid DeepSeek 约会打分</title>
<style>
  :root { --bg:#f6f5f2; --ink:#1c1b18; --muted:#6b675f; --line:#ddd8ce; --card:#fff; --ok:#1f6b3a; }
  * { box-sizing: border-box; }
  body { margin:0; font: 15px/1.55 -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif; background:var(--bg); color:var(--ink); }
  .wrap { max-width: 980px; margin: 0 auto; padding: 32px 20px 80px; }
  h1 { font-size: 26px; font-weight: 650; margin: 0 0 8px; }
  .sub { color: var(--muted); margin: 0 0 24px; }
  .stats { display:grid; grid-template-columns: repeat(4,1fr); gap:12px; margin-bottom: 20px; }
  .stat { background: var(--card); border: 1px solid var(--line); padding: 14px 16px; }
  .stat b { display:block; font-size: 22px; }
  .stat span { color: var(--muted); font-size: 12px; }
  .tabs { display:flex; gap:8px; margin: 8px 0 20px; }
  button.tab { border:1px solid var(--line); background:transparent; padding:8px 14px; cursor:pointer; font: inherit; }
  button.tab.on { background: var(--ink); color:#fff; border-color: var(--ink); }
  table { width:100%; border-collapse: collapse; background: var(--card); font-size: 14px; }
  th, td { text-align:left; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  th { font-weight: 600; color: var(--muted); font-size: 12px; }
  td.num, th.num { text-align:right; font-variant-numeric: tabular-nums; }
  tr.hi td:last-child { color: var(--ok); font-weight: 600; }
  details { background: var(--card); border: 1px solid var(--line); border-top: none; }
  details:first-of-type { border-top: 1px solid var(--line); }
  summary { cursor:pointer; padding: 10px 12px; list-style: none; display:flex; justify-content: space-between; gap:12px; }
  summary::-webkit-details-marker { display:none; }
  .why { padding: 0 14px 14px; color: var(--ink); }
  .why h3 { font-size: 13px; margin: 12px 0 6px; color: var(--muted); font-weight: 650; }
  .why p { margin: 4px 0; }
  .wx { color: var(--muted); font-size: 13px; }
  .note { background: var(--card); border: 1px solid var(--line); padding: 12px 14px; margin: 16px 0; color: var(--muted); }
  .cols { display:grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .empty { padding: 10px 12px; color: var(--muted); }
  @media (max-width: 720px) {
    .stats, .cols { grid-template-columns: 1fr 1fr; }
    .cols { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>DeskCupid DeepSeek 约会打分</h1>
  <p class="sub">第一次报名已删。模型只看到代号。同班与异地未调用 API。每一轮都有中文理由。</p>
  <div class="stats" id="stats"></div>
  <div class="tabs">
    <button class="tab on" data-tab="global">全局最优</button>
    <button class="tab" data-tab="local">局部最优</button>
  </div>
  <div id="global"></div>
  <div id="local" hidden></div>
</div>
<script>
const DATA = __DATA__;

function roundsHtml(title, rounds) {
  return `<h3>${title}</h3>` + rounds.map(r => `<p>${r.label} ${r.score}：${esc(r.why)}</p>`).join("");
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function pairDetails(p, i) {
  const wx = (p.manWechat || p.womanWechat)
    ? `<p class="wx">微信 ${esc(p.manWechat)} / ${esc(p.womanWechat)}</p>` : "";
  return `<details ${i===0?"open":""}><summary><span>${esc(p.man)} × ${esc(p.woman)}</span><span>${p.harmony}</span></summary>
    <div class="why"><p>男 ${p.manSat} / 女 ${p.womanSat}</p>${wx}
    ${roundsHtml("男方", p.manRounds)}${roundsHtml("女方", p.womanRounds)}</div></details>`;
}
function localDetails(row, womanFirst) {
  if (!row.best) return `<div class="empty">${esc(row.person)}：${esc(row.reason)}</div>`;
  const a = womanFirst ? roundsHtml("女方", row.womanRounds) + roundsHtml("男方", row.manRounds)
                       : roundsHtml("男方", row.manRounds) + roundsHtml("女方", row.womanRounds);
  const scores = womanFirst ? `女 ${row.womanSat} / 男 ${row.manSat}` : `男 ${row.manSat} / 女 ${row.womanSat}`;
  return `<details><summary><span>${esc(row.person)} → ${esc(row.best)}</span><span>${row.harmony}</span></summary>
    <div class="why"><p>${scores}</p>${a}</div></details>`;
}

document.getElementById("stats").innerHTML = [
  ["评分对数", DATA.eligible],
  ["全局配对", DATA.globalN],
  ["和谐分之和", DATA.globalSum],
  ["硬过滤对数", DATA.skippedLd + DATA.skippedCl],
].map(([k,v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join("");

document.getElementById("global").innerHTML =
  `<p class="sub">一对一，和谐分之和最大。点开看男方三次理由、女方三次理由。</p>
   <table><thead><tr><th>男生</th><th>女生</th><th class="num">男分</th><th class="num">女分</th><th class="num">和谐</th></tr></thead>
   <tbody>${DATA.global.map(p => `<tr class="${Number(p.harmony)>=75?"hi":""}"><td>${esc(p.man)}</td><td>${esc(p.woman)}</td><td class="num">${p.manSat}</td><td class="num">${p.womanSat}</td><td class="num">${p.harmony}</td></tr>`).join("")}</tbody></table>
   <div style="margin-top:16px">${DATA.global.map(pairDetails).join("")}</div>
   <div class="note">未配男生：${DATA.unmatchedMen.map(esc).join("、") || "无"}。<br/>未配女生：${DATA.unmatchedWomen.map(esc).join("、")}。海外或没有同城不同班候选人的人不会进全局。硬过滤：异地 ${DATA.skippedLd} 对，同班 ${DATA.skippedCl} 对。</div>`;

document.getElementById("local").innerHTML =
  `<p class="sub">每个人自己最想配的人。允许多人看上同一个人。</p>
   <div class="cols"><div><h3>男生局部</h3>${DATA.localMen.map(r => localDetails(r, false)).join("")}</div>
   <div><h3>女生局部</h3>${DATA.localWomen.map(r => localDetails(r, true)).join("")}</div></div>`;

document.querySelectorAll("button.tab").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("button.tab").forEach(b => b.classList.toggle("on", b === btn));
    document.getElementById("global").hidden = btn.dataset.tab !== "global";
    document.getElementById("local").hidden = btn.dataset.tab !== "local";
  };
});
</script>
</body>
</html>
"""


if __name__ == "__main__":
    main()
