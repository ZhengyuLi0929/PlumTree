#!/usr/bin/env python3
"""Merge DeepSeek scores (with per-round reasons), then local + global matching on eligible pairs only."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
RAW_DIR = DATA / "deepseek_raw"


def mean(xs: list[float]) -> float:
    return round(sum(xs) / len(xs), 2) if xs else 0.0


def clip(n) -> int:
    return max(0, min(100, int(n)))


def hungarian_maximize(weights: list[list[float]]) -> list[tuple[int, int]]:
    n_row = len(weights)
    n_col = len(weights[0]) if weights else 0
    n = max(n_row, n_col)
    max_w = max((max(row) for row in weights), default=0)
    cost = [[max_w - (weights[i][j] if i < n_row and j < n_col else 0) for j in range(n)] for i in range(n)]
    u = [0.0] * (n + 1)
    v = [0.0] * (n + 1)
    p = [0] * (n + 1)
    way = [0] * (n + 1)
    for i in range(1, n + 1):
        p[0] = i
        j0 = 0
        minv = [float("inf")] * (n + 1)
        used = [False] * (n + 1)
        while True:
            used[j0] = True
            i0 = p[j0]
            delta = float("inf")
            j1 = 0
            for j in range(1, n + 1):
                if used[j]:
                    continue
                cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
                if cur < minv[j]:
                    minv[j] = cur
                    way[j] = j0
                if minv[j] < delta:
                    delta = minv[j]
                    j1 = j
            for j in range(n + 1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0:
                break
    pairs = []
    for j in range(1, n + 1):
        i = p[j]
        if 1 <= i <= n_row and 1 <= j <= n_col:
            pairs.append((i - 1, j - 1))
    return pairs


def load_side(path: Path) -> dict[str, dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    self_id = payload.get("self") or (payload.get("_meta") or {}).get("self") or path.stem
    out = {}
    for row in payload.get("scores") or []:
        them = row.get("them")
        if not them:
            continue
        out[them] = {
            "rounds": [clip(row.get("r1", 0)), clip(row.get("r2", 0)), clip(row.get("r3", 0))],
            "reasons": [
                str(row.get("r1_why") or "").strip(),
                str(row.get("r2_why") or "").strip(),
                str(row.get("r3_why") or "").strip(),
            ],
        }
    return self_id, out


def main() -> None:
    pool = json.loads((DATA / "pool.json").read_text(encoding="utf-8"))
    id_map = pool["idMap"]
    men_ids = [p["id"] for p in pool["men"]]
    women_ids = [p["id"] for p in pool["women"]]
    eligible = {(e["man"], e["woman"]) for e in pool["eligible"]}

    man_view: dict[str, dict[str, dict]] = {i: {} for i in men_ids}
    woman_view: dict[str, dict[str, dict]] = {i: {} for i in women_ids}
    for path in sorted(RAW_DIR.glob("*.json")):
        self_id, scores = load_side(path)
        if self_id.startswith("M"):
            man_view[self_id] = scores
        elif self_id.startswith("W"):
            woman_view[self_id] = scores

    pairs = []
    missing = []
    for man_id, woman_id in sorted(eligible):
        m = man_view.get(man_id, {}).get(woman_id)
        w = woman_view.get(woman_id, {}).get(man_id)
        if not m or not w:
            missing.append((man_id, woman_id))
            continue
        man_sat = mean(m["rounds"])
        woman_sat = mean(w["rounds"])
        pairs.append(
            {
                "manId": man_id,
                "womanId": woman_id,
                "man": id_map[man_id]["name"],
                "woman": id_map[woman_id]["name"],
                "manWechat": id_map[man_id]["wechat"],
                "womanWechat": id_map[woman_id]["wechat"],
                "manSatRounds": m["rounds"],
                "womanSatRounds": w["rounds"],
                "manReasons": m["reasons"],
                "womanReasons": w["reasons"],
                "manSat": man_sat,
                "womanSat": woman_sat,
                "harmony": round((man_sat + woman_sat) / 2, 2),
            }
        )
    if missing:
        raise SystemExit(f"missing DeepSeek scores for {len(missing)} eligible pairs e.g. {missing[:8]}")

    by_man: dict[str, list] = {i: [] for i in men_ids}
    by_woman: dict[str, list] = {i: [] for i in women_ids}
    index = {}
    for p in pairs:
        by_man[p["manId"]].append(p)
        by_woman[p["womanId"]].append(p)
        index[(p["manId"], p["womanId"])] = p
    for lst in by_man.values():
        lst.sort(key=lambda x: (-x["manSat"], -x["harmony"], x["woman"]))
    for lst in by_woman.values():
        lst.sort(key=lambda x: (-x["womanSat"], -x["harmony"], x["man"]))

    local_men = []
    for mid in men_ids:
        if not by_man[mid]:
            local_men.append({"person": id_map[mid]["name"], "best": None, "reason": "没有同城且不同班的候选人"})
            continue
        top = by_man[mid][0]
        local_men.append(
            {
                "person": top["man"],
                "best": top["woman"],
                "manSat": top["manSat"],
                "womanSat": top["womanSat"],
                "harmony": top["harmony"],
                "manSatRounds": top["manSatRounds"],
                "womanSatRounds": top["womanSatRounds"],
                "manReasons": top["manReasons"],
                "womanReasons": top["womanReasons"],
            }
        )
    local_women = []
    for wid in women_ids:
        if not by_woman[wid]:
            local_women.append({"person": id_map[wid]["name"], "best": None, "reason": "没有同城且不同班的候选人"})
            continue
        top = by_woman[wid][0]
        local_women.append(
            {
                "person": top["woman"],
                "best": top["man"],
                "manSat": top["manSat"],
                "womanSat": top["womanSat"],
                "harmony": top["harmony"],
                "manSatRounds": top["manSatRounds"],
                "womanSatRounds": top["womanSatRounds"],
                "manReasons": top["manReasons"],
                "womanReasons": top["womanReasons"],
            }
        )

    # Sparse Hungarian: ineligible cells get a large negative weight.
    BAN = -10_000.0
    weight = []
    for mid in men_ids:
        row = []
        for wid in women_ids:
            p = index.get((mid, wid))
            row.append(p["harmony"] if p else BAN)
        weight.append(row)
    assignment = hungarian_maximize(weight)
    global_pairs = []
    used_m, used_w = set(), set()
    total = 0.0
    for i, j in assignment:
        if weight[i][j] <= BAN / 2:
            continue
        p = index[(men_ids[i], women_ids[j])]
        global_pairs.append(p)
        used_m.add(p["man"])
        used_w.add(p["woman"])
        total += p["harmony"]
    global_pairs.sort(key=lambda x: -x["harmony"])

    result = {
        "eligibleCount": len(pairs),
        "skipped": pool.get("skipped") or [],
        "droppedDuplicates": pool.get("droppedDuplicates") or [],
        "localMen": local_men,
        "localWomen": local_women,
        "globalPairs": global_pairs,
        "globalSum": round(total, 2),
        "unmatchedMen": [id_map[i]["name"] for i in men_ids if id_map[i]["name"] not in used_m],
        "unmatchedWomen": [id_map[i]["name"] for i in women_ids if id_map[i]["name"] not in used_w],
        "allPairs": pairs,
    }
    (DATA / "pair_scores.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    write_markdown(result)
    print(f"eligible={len(pairs)} global_n={len(global_pairs)} global_sum={result['globalSum']}")


def write_markdown(result: dict) -> None:
    lines = [
        "# DeepSeek 约会打分",
        "",
        "第一次报名已删除。模型只看到代号，看不到姓名。同班、异地未送进 API。",
        "每对有男方三次理由、女方三次理由。和谐分是两边均分的平均。",
        "",
        f"评分对数 **{result['eligibleCount']}**。全局和谐分之和 **{result['globalSum']}**（{len(result['globalPairs'])} 对）。",
        "",
        "## 局部最优",
        "",
        "### 男生",
        "",
    ]
    for row in result["localMen"]:
        if not row.get("best"):
            lines += [f"**{row['person']}**：{row.get('reason')}", ""]
            continue
        lines.append(f"#### {row['person']} → {row['best']}　男 {row['manSat']} / 女 {row['womanSat']} / 和谐 {row['harmony']}")
        lines.append("")
        lines.append("男方理由：")
        for label, score, why in zip(["初见", "一个月", "长期"], row["manSatRounds"], row["manReasons"]):
            lines.append(f"- {label} {score}：{why}")
        lines.append("女方理由：")
        for label, score, why in zip(["初见", "一个月", "长期"], row["womanSatRounds"], row["womanReasons"]):
            lines.append(f"- {label} {score}：{why}")
        lines.append("")
    lines += ["### 女生", ""]
    for row in result["localWomen"]:
        if not row.get("best"):
            lines += [f"**{row['person']}**：{row.get('reason')}", ""]
            continue
        lines.append(f"#### {row['person']} → {row['best']}　女 {row['womanSat']} / 男 {row['manSat']} / 和谐 {row['harmony']}")
        lines.append("")
        lines.append("女方理由：")
        for label, score, why in zip(["初见", "一个月", "长期"], row["womanSatRounds"], row["womanReasons"]):
            lines.append(f"- {label} {score}：{why}")
        lines.append("男方理由：")
        for label, score, why in zip(["初见", "一个月", "长期"], row["manSatRounds"], row["manReasons"]):
            lines.append(f"- {label} {score}：{why}")
        lines.append("")
    lines += ["## 全局最优", ""]
    for i, p in enumerate(result["globalPairs"], 1):
        lines.append(f"### {i}. {p['man']} × {p['woman']}　和谐 {p['harmony']}")
        lines.append("")
        lines.append(f"微信 `{p['manWechat']}` / `{p['womanWechat']}`　男 {p['manSat']}　女 {p['womanSat']}")
        lines.append("")
        lines.append("男方理由：")
        for label, score, why in zip(["初见", "一个月", "长期"], p["manSatRounds"], p["manReasons"]):
            lines.append(f"- {label} {score}：{why}")
        lines.append("女方理由：")
        for label, score, why in zip(["初见", "一个月", "长期"], p["womanSatRounds"], p["womanReasons"]):
            lines.append(f"- {label} {score}：{why}")
        lines.append("")
    if result["unmatchedMen"]:
        lines += ["未配男生：" + "、".join(result["unmatchedMen"]), ""]
    if result["unmatchedWomen"]:
        lines += ["未配女生：" + "、".join(result["unmatchedWomen"]), ""]
    skipped_ld = sum(1 for x in result["skipped"] if x["reason"] == "异地")
    skipped_cl = sum(1 for x in result["skipped"] if x["reason"] == "同班")
    lines += [f"硬过滤：异地 {skipped_ld} 对，同班 {skipped_cl} 对。", ""]
    (ROOT / "LOCAL_AND_GLOBAL.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("wrote LOCAL_AND_GLOBAL.md")


if __name__ == "__main__":
    main()
