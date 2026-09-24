#!/usr/bin/env python3
"""Turn raw admin dump into one row per person. If someone enrolled twice, keep the later row."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
META = json.loads((ROOT / "quiz_meta.json").read_text(encoding="utf-8"))
QUESTIONS = META["questions"]
DIMS = META["dims"]
LL_NAMES = META["loveLanguages"]
OFFICIAL = META["officialMatch"]
ALIAS = META["typeAlias"]
DIM_BY_KEY = {d["key"]: d for d in DIMS}


def parse_time(raw: str | None) -> datetime:
    if not raw:
        return datetime.min
    text = raw.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return datetime.min


def pct(left: float, right: float) -> int:
    total = left + right
    if total <= 0:
        return 50
    return round(100 * left / total)


def compute_scores(answers: dict, rankings: dict, timings: dict | None) -> dict:
    raw: dict[str, float] = {}
    dim_ids: dict[str, list[int]] = {}
    answers_n = {int(k): v for k, v in (answers or {}).items()}
    timings_n = {int(k): v for k, v in (timings or {}).items()} if timings else {}

    for q in QUESTIONS:
        v = answers_n.get(q["id"])
        if not isinstance(v, (int, float)) or v < 1 or v > 7:
            continue
        meta = DIM_BY_KEY[q["dim"]]
        toward_stated = v
        toward_other = 8 - v
        if q["pole"] == meta["left"]:
            raw[meta["left"]] = raw.get(meta["left"], 0) + toward_stated
            raw[meta["right"]] = raw.get(meta["right"], 0) + toward_other
        else:
            raw[meta["right"]] = raw.get(meta["right"], 0) + toward_stated
            raw[meta["left"]] = raw.get(meta["left"], 0) + toward_other
        dim_ids.setdefault(q["dim"], []).append(q["id"])

    ts = [timings_n[q["id"]] for q in QUESTIONS if timings_n.get(q["id"], 0) > 0]
    ts.sort()
    median = ts[len(ts) // 2] if ts else None

    def dim(left_key: str, right_key: str, dim_key: str) -> dict:
        left = raw.get(left_key, 0)
        right = raw.get(right_key, 0)
        if left == right and median is not None:
            dim_ts = [timings_n[i] for i in dim_ids.get(dim_key, []) if timings_n.get(i, 0) > 0]
            if dim_ts:
                avg = sum(dim_ts) / len(dim_ts)
                left = 51 if avg < median else 49
                right = 100 - left
        return {left_key: left, right_key: right}

    ll = {k: 0 for k in LL_NAMES}
    for rid in ("rank1", "rank2", "rank3"):
        order = (rankings or {}).get(rid) or []
        for i, key in enumerate(order):
            if key in ll:
                ll[key] += 5 - i

    scores = {
        "FI": dim("F", "I", "FI"),
        "SG": dim("S", "G", "SG"),
        "RP": dim("R", "P", "RP"),
        "HC": dim("H", "C", "HC"),
        "TM": dim("T", "M", "TM"),
        "LL": ll,
    }
    bars = {}
    for d in DIMS:
        pair = scores[d["key"]]
        left = pct(pair[d["left"]], pair[d["right"]])
        bars[d["key"]] = {
            "leftName": d["leftName"],
            "rightName": d["rightName"],
            "title": d["title"],
            "left": left,
            "right": 100 - left,
        }
    top_lang = max(ll, key=lambda k: ll[k]) if any(ll.values()) else None
    return {
        "raw": scores,
        "bars": bars,
        "loveLanguage": LL_NAMES.get(top_lang, "") if top_lang else "",
        "loveLanguageKey": top_lang,
    }


def location_bucket(city: str) -> str:
    text = city or ""
    if any(x in text for x in ("瑞士", "加拿大", "美国", "新加坡", "滑铁卢", "纳沙泰尔")):
        return "海外长期"
    if "香港" in text and "北京" not in text:
        return "香港"
    if "上海" in text:
        return "上海"
    if "昆明" in text:
        return "昆明"
    # 与 prepare_pool.py 保持一致：「合肥/北京」归北京，纯「合肥」才归合肥
    if "北京" in text or "温哥华" in text:
        return "北京"
    if "合肥" in text:
        return "合肥"
    return text.strip() or "未知"


def normalize_wechat(raw: str) -> str:
    return re.sub(r"\s+", "", (raw or "")).strip().lower()


def person_key(row: dict) -> str:
    wx = normalize_wechat(row.get("wechat") or "")
    name = (row.get("name") or "").strip()
    return wx or f"name:{name}"


def prefer_later(a: dict, b: dict) -> dict:
    """If the same person enrolled twice, keep the later profile."""
    ta, tb = parse_time(a.get("createdAt")), parse_time(b.get("createdAt"))
    if ta != tb:
        return b if tb > ta else a
    ia, ib = a.get("id") or 0, b.get("id") or 0
    if ia != ib:
        return b if ib > ia else a
    na = len(a.get("answers") or {})
    nb = len(b.get("answers") or {})
    return b if nb >= na else a


def to_card(row: dict) -> dict:
    scored = compute_scores(row.get("answers") or {}, row.get("rankings") or {}, row.get("timings") or {})
    code = row.get("typeCode")
    return {
        "id": row.get("id"),
        "sessionId": row.get("sessionId"),
        "name": (row.get("name") or "").strip(),
        "wechat": (row.get("wechat") or "").strip(),
        "gender": row.get("gender"),
        "birthYear": row.get("birthYear"),
        "city": row.get("city"),
        "location": location_bucket(row.get("city") or ""),
        "gradClass": row.get("gradClass"),
        "mbti": row.get("mbti"),
        "height": row.get("height"),
        "job": row.get("job"),
        "prefMinHeight": row.get("prefMinHeight"),
        "prefBirthFrom": row.get("prefBirthFrom"),
        "prefBirthTo": row.get("prefBirthTo"),
        "acceptDistance": row.get("acceptDistance"),
        "intro": (row.get("intro") or "").strip(),
        "expectation": (row.get("expectation") or "").strip(),
        "value": (row.get("value") or "").strip(),
        "typeCode": code,
        "typeAlias": ALIAS.get(code or "", ""),
        "officialMatch": OFFICIAL.get(code or "", ""),
        "createdAt": row.get("createdAt"),
        "quizAnswerCount": len(row.get("answers") or {}),
        **scored,
    }


def merge_name_collisions(by_key: dict[str, dict]) -> tuple[dict[str, dict], list[dict]]:
    """Catch same name with a typo'd wechat id."""
    dropped: list[dict] = []
    by_name: dict[str, list[str]] = defaultdict(list)
    for key, row in by_key.items():
        name = (row.get("name") or "").strip()
        if name:
            by_name[name].append(key)
    for name, keys in by_name.items():
        if len(keys) < 2:
            continue
        keep_key = keys[0]
        keep = by_key[keep_key]
        for key in keys[1:]:
            winner = prefer_later(keep, by_key[key])
            loser = keep if winner is by_key[key] else by_key[key]
            dropped.append(
                {
                    "name": name,
                    "keptWechat": winner.get("wechat"),
                    "droppedWechat": loser.get("wechat"),
                    "keptAt": winner.get("createdAt"),
                    "droppedAt": loser.get("createdAt"),
                    "reason": "same-name-later-profile",
                }
            )
            if winner is by_key[key]:
                del by_key[keep_key]
                keep_key = key
                keep = winner
            else:
                del by_key[key]
    return by_key, dropped


def main() -> None:
    raw_path = DATA / "raw.json"
    raw = json.loads(raw_path.read_text(encoding="utf-8"))
    export_by_session = {row["sessionId"]: row for row in raw["export"]}
    merged = []
    for user in raw["roster"]["users"]:
        extra = export_by_session.get(user["sessionId"], {})
        row = {**user, "id": extra.get("id")}
        merged.append(row)

    by_key: dict[str, dict] = {}
    dropped: list[dict] = []
    for row in merged:
        key = person_key(row)
        if key not in by_key:
            by_key[key] = row
            continue
        winner = prefer_later(by_key[key], row)
        loser = row if winner is by_key[key] else by_key[key]
        dropped.append(
            {
                "name": (winner.get("name") or "").strip(),
                "keptWechat": winner.get("wechat"),
                "droppedWechat": loser.get("wechat"),
                "keptAt": winner.get("createdAt"),
                "droppedAt": loser.get("createdAt"),
                "reason": "same-wechat-later-profile",
            }
        )
        by_key[key] = winner

    by_key, extra_dropped = merge_name_collisions(by_key)
    dropped.extend(extra_dropped)

    cards = [to_card(row) for row in by_key.values()]
    cards.sort(key=lambda c: (c["gender"] != "男", c["name"]))
    payload = {
        "fetchedAt": raw.get("fetchedAt"),
        "source": raw.get("base", "https://www.deskcupid.com"),
        "rawCount": len(merged),
        "uniqueCount": len(cards),
        "droppedDuplicates": dropped,
        "genderCounts": {
            "男": sum(1 for c in cards if c["gender"] == "男"),
            "女": sum(1 for c in cards if c["gender"] == "女"),
        },
        "people": cards,
    }
    out = DATA / "profiles.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"raw={len(merged)} unique={len(cards)} dropped={len(dropped)}")
    for d in dropped:
        print(f"  drop {d['name']} {d['droppedWechat']} @ {d['droppedAt']}  keep {d['keptWechat']} @ {d['keptAt']}")


if __name__ == "__main__":
    main()
