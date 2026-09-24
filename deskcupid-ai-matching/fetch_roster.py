#!/usr/bin/env python3
"""Pull roster + export from the live DeskCupid admin API. Does not touch the site codebase."""

from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)


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


def call(method: str, path: str, payload: dict | None = None, token: str | None = None):
    base = os.environ.get("DESKCUPID_BASE", "https://www.deskcupid.com").rstrip("/")
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    body = json.dumps({"json": payload or {}}).encode() if method == "POST" else None
    req = urllib.request.Request(base + path, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode())


def main() -> None:
    load_dotenv()
    password = os.environ.get("DESKCUPID_ADMIN_PASSWORD")
    if not password:
        raise SystemExit("Set DESKCUPID_ADMIN_PASSWORD or copy .env.example to .env")

    login = call("POST", "/api/trpc/responses.adminLogin", {"password": password})
    token = login["result"]["data"]["json"]["token"]
    roster = call("GET", "/api/trpc/responses.roster", token=token)["result"]["data"]["json"]
    export = call("GET", "/api/trpc/responses.export", token=token)["result"]["data"]["json"]
    payload = {
        "fetchedAt": datetime.now().isoformat(timespec="seconds"),
        "base": os.environ.get("DESKCUPID_BASE", "https://www.deskcupid.com"),
        "roster": roster,
        "export": export,
    }
    out = DATA / "raw.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    users = roster.get("users") or []
    print(f"saved {out}  users={len(users)}  pairs={len(roster.get('pairs') or [])}  export={len(export)}")


if __name__ == "__main__":
    main()
