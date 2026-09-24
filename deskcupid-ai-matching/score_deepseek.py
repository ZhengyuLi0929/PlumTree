#!/usr/bin/env python3
"""Score eligible masked pairs via DeepSeek. 10 worker threads. Each round includes a reason."""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
RAW_DIR = DATA / "deepseek_raw"
PROMPT_PATH = ROOT / "DEEPSEEK_PROMPT.md"
WORKERS = 10
CANDIDATE_BATCH = 8


def load_dotenv() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def card_text(card: dict) -> str:
    height = card.get("heightCm")
    height_s = f"{height}cm" if height else "未填"
    return (
        f"代号: {card['id']}\n"
        f"性别: {card['gender']}\n"
        f"出生年: {card.get('birthYear') or '未填'}\n"
        f"身高: {height_s}\n"
        f"MBTI: {card.get('mbti') or '未填'}\n"
        f"自我介绍: {card.get('intro') or '（空）'}\n"
        f"理想型: {card.get('expectation') or '（空）'}\n"
        f"一段关系里最看重: {card.get('value') or '（空）'}"
    )


def render_prompt(template: str, *, role_label: str, self_card: dict, candidates: list[dict]) -> str:
    blocks = "\n\n".join(card_text(c) for c in candidates)
    return (
        template.replace("{role_label}", role_label)
        .replace("{self_id}", self_card["id"])
        .replace("{self_card}", card_text(self_card))
        .replace("{candidates}", blocks)
    )


def parse_json(text: str) -> dict:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if fenced:
        text = fenced.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


def chat(prompt: str) -> dict:
    api_key = os.environ.get("DEEPSEEK_API_KEY") or ""
    if not api_key:
        raise SystemExit("Set DEEPSEEK_API_KEY in .env")
    base = os.environ.get("DEEPSEEK_BASE", "https://api.deepseek.com").rstrip("/")
    model = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
    body = json.dumps(
        {
            "model": model,
            "temperature": 0.4,
            "max_tokens": 8192,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": "只输出合法 JSON 对象。不要输出姓名。"},
                {"role": "user", "content": prompt},
            ],
        },
        ensure_ascii=False,
    ).encode("utf-8")
    last_err: object = None
    for attempt in range(5):
        req = urllib.request.Request(
            base + "/chat/completions",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                payload = json.loads(resp.read().decode())
            choice = payload["choices"][0]
            if choice.get("finish_reason") == "length":
                raise RuntimeError("truncated json")
            return parse_json(choice["message"]["content"])
        except urllib.error.HTTPError as err:
            detail = err.read().decode("utf-8", "replace")[:400]
            last_err = f"HTTP {err.code} {detail}"
            time.sleep(8 if err.code == 429 else 2 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, RuntimeError) as err:
            last_err = err
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"DeepSeek failed: {last_err}")


def score_chunk(task: dict, template: str, candidates: list[dict]) -> list[dict]:
    prompt = render_prompt(
        template,
        role_label=task["role_label"],
        self_card=task["self"],
        candidates=candidates,
    )
    result = chat(prompt)
    for row in result.get("scores") or []:
        if isinstance(row.get("them"), str):
            row["them"] = row["them"].strip()
    expected = [c["id"] for c in candidates]
    validate(result, expected)
    by_id = {row.get("them"): row for row in result.get("scores") or [] if row.get("them")}
    return [by_id[i] for i in expected]


def job(task: dict, template: str) -> dict:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    expected = [c["id"] for c in task["candidates"]]
    cache = RAW_DIR / f"{task['self']['id']}.json"
    if cache.exists():
        cached = json.loads(cache.read_text(encoding="utf-8"))
        try:
            validate(cached, expected)
            return cached
        except RuntimeError:
            cache.unlink()

    scores: list[dict] = []
    candidates = task["candidates"]
    for start in range(0, len(candidates), CANDIDATE_BATCH):
        scores.extend(score_chunk(task, template, candidates[start : start + CANDIDATE_BATCH]))
    result = {
        "self": task["self"]["id"],
        "scores": scores,
        "_meta": {"self": task["self"]["id"], "expected": expected},
    }
    validate(result, expected)
    cache.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def validate(result: dict, expected_ids: list[str]) -> None:
    got = {row.get("them") for row in result.get("scores") or []}
    missing = [i for i in expected_ids if i not in got]
    if missing:
        raise RuntimeError(f"{result.get('self')} missing {missing[:8]}")


def main() -> None:
    load_dotenv()
    pool = json.loads((DATA / "pool.json").read_text(encoding="utf-8"))
    template = PROMPT_PATH.read_text(encoding="utf-8")
    men = {p["id"]: p for p in pool["men"]}
    women = {p["id"]: p for p in pool["women"]}
    by_man: dict[str, list[str]] = {i: [] for i in men}
    by_woman: dict[str, list[str]] = {i: [] for i in women}
    for edge in pool["eligible"]:
        by_man[edge["man"]].append(edge["woman"])
        by_woman[edge["woman"]].append(edge["man"])

    tasks = []
    for mid, wids in by_man.items():
        if not wids:
            continue
        tasks.append(
            {
                "role_label": "男生",
                "self": men[mid],
                "candidates": [women[w] for w in wids],
            }
        )
    for wid, mids in by_woman.items():
        if not mids:
            continue
        tasks.append(
            {
                "role_label": "女生",
                "self": women[wid],
                "candidates": [men[m] for m in mids],
            }
        )

    print(f"tasks={len(tasks)} workers={WORKERS}")
    errors = []
    with ThreadPoolExecutor(max_workers=WORKERS) as pool_ex:
        futs = {pool_ex.submit(job, task, template): task["self"]["id"] for task in tasks}
        done = 0
        for fut in as_completed(futs):
            sid = futs[fut]
            done += 1
            try:
                result = fut.result()
                expected = next(t["candidates"] for t in tasks if t["self"]["id"] == sid)
                validate(result, [c["id"] for c in expected])
                print(f"ok {done}/{len(tasks)} {sid} n={len(result.get('scores') or [])}")
            except Exception as err:
                errors.append(f"{sid}: {err}")
                print(f"fail {done}/{len(tasks)} {sid}: {err}")
    if errors:
        raise SystemExit("some tasks failed:\n" + "\n".join(errors))
    print("all scoring tasks finished")


if __name__ == "__main__":
    main()
