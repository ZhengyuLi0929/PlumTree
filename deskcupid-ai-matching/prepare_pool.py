#!/usr/bin/env python3
"""Build the scoring pool: drop first-time duplicate signups, mask names, skip 同班 and 异地."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"


def class_key(grad_class: str) -> str | None:
    text = re.sub(r"\s+", "", grad_class or "")
    if not text:
        return None
    matched = re.search(r"(20\d{2})[届年]?(\d{1,2})班", text)
    if matched:
        return f"{matched.group(1)}-{int(matched.group(2)):02d}"
    matched = re.fullmatch(r"(20\d{2})(\d{1,2})", text)
    if matched:
        return f"{matched.group(1)}-{int(matched.group(2)):02d}"
    return None


def location_bucket(city: str) -> str:
    text = city or ""
    if "瑞士" in text:
        return "瑞士"
    if "加拿大" in text or "滑铁卢" in text:
        return "加拿大"
    if "美国" in text:
        return "美国"
    if "新加坡" in text:
        return "新加坡"
    if "昆明" in text:
        return "昆明"
    if "未来回北京" in text or "将回北京" in text:
        return "北京"
    if "香港" in text and "上海" not in text and "北京" not in text:
        return "香港"
    if "上海" in text:
        return "上海"
    if "北京" in text:
        return "北京"
    if "合肥" in text:
        return "合肥"
    return f"其他:{text.strip() or '未知'}"


def redact_text(text: str, people: list[dict]) -> str:
    out = text or ""
    for person in sorted(people, key=lambda p: -len(p["name"] or "")):
        if person.get("name"):
            out = out.replace(person["name"], person["id"])
        wechat = (person.get("wechat") or "").strip()
        if wechat:
            out = out.replace(wechat, "（已隐去）")
    return out


def masked_card(person: dict, people: list[dict]) -> dict:
    return {
        "id": person["id"],
        "gender": person["gender"],
        "birthYear": person.get("birthYear"),
        "heightCm": person.get("height"),
        "mbti": person.get("mbti") or "",
        "job": person.get("job") or "",
        "prefMinHeight": person.get("prefMinHeight"),
        "prefBirthFrom": person.get("prefBirthFrom"),
        "prefBirthTo": person.get("prefBirthTo"),
        "acceptDistance": person.get("acceptDistance") or "",
        "loveLanguage": person.get("loveLanguage") or "",
        # 51 题测评的五维百分比（不含四字母代码，避免模型刻板印象）
        "loveDims": {
            key: {"title": bar["title"], "leftName": bar["leftName"], "left": bar["left"], "rightName": bar["rightName"], "right": bar["right"]}
            for key, bar in (person.get("bars") or {}).items()
        },
        "intro": redact_text(person.get("intro") or "", people),
        "expectation": redact_text(person.get("expectation") or "", people),
        "value": redact_text(person.get("value") or "", people),
    }


def skip_reason(a: dict, b: dict) -> str | None:
    if a["location"] != b["location"]:
        return "异地"
    ka, kb = a.get("classKey"), b.get("classKey")
    if ka and kb and ka == kb:
        return "同班"
    return None


def main() -> None:
    profiles = json.loads((DATA / "profiles.json").read_text(encoding="utf-8"))
    people = []
    men_i = women_i = 0
    for raw in profiles["people"]:
        gender = raw["gender"]
        if gender == "男":
            code = f"M{men_i:02d}"
            men_i += 1
        else:
            code = f"W{women_i:02d}"
            women_i += 1
        people.append(
            {
                "id": code,
                "name": raw["name"],
                "wechat": raw["wechat"],
                "gender": gender,
                "birthYear": raw.get("birthYear"),
                "height": raw.get("height"),
                "mbti": raw.get("mbti") or "",
                "job": raw.get("job") or "",
                "prefMinHeight": raw.get("prefMinHeight"),
                "prefBirthFrom": raw.get("prefBirthFrom"),
                "prefBirthTo": raw.get("prefBirthTo"),
                "acceptDistance": raw.get("acceptDistance") or "",
                "loveLanguage": raw.get("loveLanguage") or "",
                "bars": raw.get("bars") or {},
                "intro": raw.get("intro") or "",
                "expectation": raw.get("expectation") or "",
                "value": raw.get("value") or "",
                "city": raw.get("city") or "",
                "gradClass": raw.get("gradClass") or "",
                "location": location_bucket(raw.get("city") or ""),
                "classKey": class_key(raw.get("gradClass") or ""),
            }
        )

    men = [p for p in people if p["gender"] == "男"]
    women = [p for p in people if p["gender"] == "女"]
    eligible = []
    skipped = []
    for man in men:
        for woman in women:
            reason = skip_reason(man, woman)
            if reason:
                skipped.append({"man": man["id"], "woman": woman["id"], "manName": man["name"], "womanName": woman["name"], "reason": reason})
                continue
            eligible.append({"man": man["id"], "woman": woman["id"]})

    pool = {
        "droppedDuplicates": profiles.get("droppedDuplicates") or [],
        "note": "First signups were dropped in enrich.py. This file never contains those rows. Names stay in idMap only and are not sent to the model.",
        "men": [masked_card(p, people) for p in men],
        "women": [masked_card(p, people) for p in women],
        "eligible": eligible,
        "skipped": skipped,
        "idMap": {
            p["id"]: {
                "name": p["name"],
                "wechat": p["wechat"],
                "gender": p["gender"],
                "city": p["city"],
                "gradClass": p["gradClass"],
                "location": p["location"],
                "classKey": p["classKey"],
            }
            for p in people
        },
    }
    out = DATA / "pool.json"
    out.write_text(json.dumps(pool, ensure_ascii=False, indent=2), encoding="utf-8")
    from collections import Counter
    print(f"kept={len(people)} eligible_pairs={len(eligible)} skipped={len(skipped)}")
    print("skip", dict(Counter(x["reason"] for x in skipped)))
    print("locations", dict(Counter(p["location"] for p in people)))
    print("same-class skips sample:")
    for row in skipped:
        if row["reason"] == "同班":
            print(" ", row["manName"], row["womanName"], pool["idMap"][row["man"]]["classKey"])


if __name__ == "__main__":
    main()
