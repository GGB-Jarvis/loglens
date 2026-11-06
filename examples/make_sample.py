"""Generate a small, deterministic demo log collection.

The story: an order API runs for four days. On day 2 the inventory dependency
starts timing out for about an hour, producing an error burst and a visible KPI
drop. On day 3 a deploy is followed by an authorization problem.
"""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta
from pathlib import Path

random.seed(20261004)
ROOT = Path(__file__).resolve().parent
DAYS = [datetime(2026, 10, 1), datetime(2026, 10, 2), datetime(2026, 10, 3), datetime(2026, 10, 4)]
PATHS = ["/api/orders", "/api/orders/1042", "/api/cart", "/api/payments", "/health", "/api/catalog"]
USERS = ["u-1042", "u-2087", "u-3311", "u-4402", "u-5520"]
PIDS = [4127, 4128]


def ts(day: datetime, hour: int, minute: int, second: int, ms: int = 0) -> str:
    return (day + timedelta(hours=hour, minutes=minute, seconds=second, milliseconds=ms)).strftime(
        "%Y-%m-%d %H:%M:%S.%f"
    )[:-3]


def line(stamp: str, level: str, module: str, message: str, pid: int | None = None) -> str:
    return f"[{stamp}] [{pid or random.choice(PIDS)}] [{level}] [{module}]  {message}"


def build_day(day: datetime, index: int) -> list[str]:
    rows: list[str] = []
    rows.append(line(ts(day, 8, 59, 58), "info", "Bootstrap", "Starting order-api version=2.14.0"))
    rows.append(line(ts(day, 9, 0, 1), "info", "HttpServer", "Server listening on 0.0.0.0:8080"))

    # One request every ~75 seconds between 09:00 and 17:00.
    current = day + timedelta(hours=9, minutes=2)
    end = day + timedelta(hours=17)
    request_no = 0
    while current < end:
        request_no += 1
        path = random.choice(PATHS)
        method = "GET" if path == "/health" else random.choice(["GET", "GET", "POST", "POST", "PUT"])
        elapsed = random.randint(4, 60)
        status = 200 if method == "GET" else random.choice([200, 201, 204])
        if random.random() < 0.012:
            status = 404
        stamp = current.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        rows.append(
            line(
                stamp,
                "info",
                "HttpServer",
                f'{method} {path} -> {status} ({elapsed}ms) user={random.choice(USERS)} request_id={request_no}',
            )
        )

        # Day 2: inventory dependency timeout window 12:55 - 14:10.
        in_incident = index == 1 and (
            (current.hour == 12 and current.minute >= 55)
            or current.hour == 13
            or (current.hour == 14 and current.minute < 10)
        )
        if in_incident:
            for attempt in (1, 2):
                rows.append(
                    line(
                        (current + timedelta(milliseconds=30 * attempt)).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
                        "error",
                        "InventoryClient",
                        f"Inventory reservation failed: connection timeout after 3000ms order="
                        f"{random.randint(100000, 999999)} attempt={attempt}",
                    )
                )
            if random.random() < 0.45:
                rows.append(
                    line(
                        (current + timedelta(milliseconds=90)).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
                        "warn",
                        "OrderService",
                        "Retrying inventory reservation after timeout",
                    )
                )

        # Day 3: deploy + authorization failures.
        if index == 2 and current.hour == 10 and current.minute < 25:
            if current.minute == 0:
                rows.append(
                    line(
                        current.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
                        "info",
                        "Deploy",
                        "Rolling deploy started release=2.15.0",
                    )
                )
            rows.append(
                line(
                    current.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
                    "error",
                    "AuthFilter",
                    f"Permission denied for user={random.choice(USERS)} scopes=[orders:write] "
                    f"trace={random.randint(10**11, 10**12)}",
                )
            )

        # Background worker noise.
        if random.random() < 0.12:
            rows.append(
                line(
                    (current + timedelta(seconds=7)).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
                    "warn",
                    "Worker",
                    f"Queue depth high depth={random.randint(40, 80)} shard={random.randint(0, 3)}",
                )
            )
        if random.random() < 0.02:
            rows.append(
                line(
                    (current + timedelta(seconds=11)).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
                    "error",
                    "PaymentClient",
                    "Upstream returned 502 Bad Gateway provider=pay-a",
                )
            )
        current += timedelta(seconds=random.randint(55, 95))

    rows.append(line(ts(day, 17, 0, 3), "info", "Bootstrap", "Shutting down order-api gracefully"))
    return rows


def write_jsonl_sample() -> None:
    target = ROOT / "jsonl" / "app.jsonl"
    target.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    base = datetime(2026, 10, 5, 9, 0, 0)
    for i in range(220):
        moment = base + timedelta(seconds=i * 53)
        level = "error" if 80 <= i < 100 else "info"
        message = (
            "database query timeout after 2000ms"
            if level == "error"
            else f"handled request path=/items/{i} status=200"
        )
        rows.append(
            json.dumps(
                {
                    "timestamp": moment.isoformat() + "Z",
                    "level": level,
                    "logger": "catalog.Service",
                    "message": message,
                }
            )
        )
    target.write_text("\n".join(rows) + "\n", encoding="utf-8")


def main() -> None:
    demo = ROOT / "demo"
    demo.mkdir(parents=True, exist_ok=True)
    all_rows: list[str] = []
    for index, day in enumerate(DAYS):
        rows = build_day(day, index)
        all_rows.extend(rows)
        (demo / f"app-{day.date()}.log").write_text("\n".join(rows) + "\n", encoding="utf-8")
    (ROOT / "sample.log").write_text("\n".join(build_day(DAYS[1], 1)) + "\n", encoding="utf-8")
    write_jsonl_sample()
    print(f"wrote {len(all_rows)} lines to {demo}")


if __name__ == "__main__":
    main()
