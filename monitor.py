from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from scraper import Product, discover, inspect, make_session

def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

def load(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default

def price(n: int | None) -> str:
    return "—" if n is None else "$" + f"{n:,}".replace(",", ".")

def label(status: str | None) -> str:
    return {
        "available": "🟢 disponible / preventa",
        "unavailable": "🔴 agotado / sin stock",
        "page_missing": "⚪ página retirada / 404",
        "unknown": "🟡 estado no concluyente",
        "error": "⚠️ error temporal",
    }.get(status or "", status or "—")

def important_change(old: dict[str, Any], new: Product) -> bool:
    if old.get("status") != new.status:
        return True
    if old.get("http") != new.http:
        return True
    old_price = old.get("price_clp")
    if new.price_clp is not None and old_price != new.price_clp:
        return True
    return False

def describe(name: str, old: dict[str, Any] | None, new: Product, *, new_listing: bool = False) -> str:
    if new_listing:
        head = f"### 🆕 Nueva publicación chilena: {name}"
    elif old and old.get("status") != "available" and new.status == "available":
        head = f"### 🚨 STOCK / PREVENTA DISPONIBLE: {name}"
    elif old and old.get("price_clp") and new.price_clp and old.get("price_clp") != new.price_clp:
        head = f"### 💰 Cambio de precio: {name}"
    else:
        head = f"### 🔔 Cambio detectado: {name}"

    return (
        f"{head}\n\n"
        f"- Estado: {label(old.get('status') if old else None)} → **{label(new.status)}**\n"
        f"- Precio: {price(old.get('price_clp') if old else None)} → **{price(new.price_clp)}**\n"
        f"- HTTP: {new.http if new.http is not None else '—'}\n"
        f"- Enlace: {new.url}\n"
    )

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stores", default="stores.json")
    ap.add_argument("--state", default="state/state.json")
    ap.add_argument("--report", default="report.md")
    ap.add_argument("--discover", action="store_true")
    args = ap.parse_args()

    known = load(Path(args.stores), [])
    state_path = Path(args.state)
    state = load(state_path, {
        "version": 2,
        "initialized": False,
        "stores": {},
        "discovered": {},
    })
    state.setdefault("stores", {})
    state.setdefault("discovered", {})
    initialized = bool(state.get("initialized"))
    session = make_session()
    alerts: list[str] = []

    targets = {item["url"]: item["name"] for item in known}
    for url, item in state["discovered"].items():
        targets.setdefault(url, item.get("name") or url)

    for url, name in targets.items():
        current = inspect(session, name, url)
        # Estados no concluyentes o desafíos anti-bot no deben reemplazar
        # el último estado fiable ni generar alertas falsas.
        if current.status in ("error", "unknown"):
            continue

        previous_entry = state["stores"].get(url)
        previous = previous_entry.get("snapshot") if previous_entry else None

        if initialized and previous and important_change(previous, current):
            alerts.append(describe(name, previous, current))

        changed = not previous or important_change(previous, current)
        if changed:
            state["stores"][url] = {
                "name": name,
                "snapshot": current.snapshot(),
                "last_changed_at": now(),
            }

    if args.discover:
        known_urls = set(targets)
        for current in discover(session, known_urls):
            if current.url in known_urls:
                continue
            known_urls.add(current.url)
            state["discovered"][current.url] = {
                "name": current.name,
                "url": current.url,
                "found_at": now(),
            }
            state["stores"][current.url] = {
                "name": current.name,
                "snapshot": current.snapshot(),
                "last_seen_at": now(),
                "last_changed_at": now(),
            }
            if initialized:
                alerts.append(describe(current.name, None, current, new_listing=True))

    state["initialized"] = True
    state["version"] = 2
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(
        json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    report_path = Path(args.report)
    if alerts:
        report = (
            "# Switch 2 Zelda 40th — novedades detectadas\n\n"
            + "\n".join(alerts)
            + "\n---\n"
            + f"Revisión UTC: {now()}. Confirma la disponibilidad directamente antes de comprar.\n"
        )
    else:
        report = "Sin cambios relevantes.\n"
    report_path.write_text(report, encoding="utf-8")

    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as f:
            f.write(f"changes={'true' if alerts else 'false'}\n")
            f.write(f"count={len(alerts)}\n")

    print(f"Monitor completado. Alertas: {len(alerts)}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
