#!/usr/bin/env python3
"""
为 data/current/players.csv 补充 jersey_no（球衣号码）字段。

依赖：
  pip install nba_api

用法：
  python3 scripts/enrich_players_with_jersey.py \
    --input data/current/players.csv \
    --output data/current/players_with_jersey.csv
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from typing import Dict, List

from nba_api.stats.endpoints import commonplayerinfo
from nba_api.stats.static import players as static_players


def load_rows(path: str) -> List[Dict[str, str]]:
  with open(path, "r", encoding="utf-8-sig", newline="") as f:
    return list(csv.DictReader(f))


def save_rows(path: str, rows: List[Dict[str, str]]) -> None:
  if not rows:
    raise ValueError("No rows to write.")
  fieldnames = list(rows[0].keys())
  with open(path, "w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)


def fetch_jersey_from_person_id(person_id: int) -> str:
  info = commonplayerinfo.CommonPlayerInfo(player_id=person_id, timeout=8)
  df = info.get_data_frames()[0]
  if df.empty:
    return ""
  val = str(df.iloc[0].get("JERSEY", "")).strip()
  if val in {"", "nan", "None"}:
    return ""
  return val


def main() -> int:
  parser = argparse.ArgumentParser()
  parser.add_argument("--input", required=True, help="输入 players.csv 路径")
  parser.add_argument("--output", required=True, help="输出 CSV 路径")
  parser.add_argument("--sleep", type=float, default=0.45, help="每次请求间隔秒数，默认 0.45")
  args = parser.parse_args()

  rows = load_rows(args.input)
  if not rows:
    print("输入文件为空。", file=sys.stderr)
    return 1

  # 统一补字段：前端读取 jersey_no
  for row in rows:
    row.setdefault("jersey_no", "")

  name_to_person_ids: Dict[str, List[int]] = {}
  for p in static_players.get_active_players():
    name_to_person_ids.setdefault(p["full_name"].lower(), []).append(int(p["id"]))

  cache: Dict[str, str] = {}
  misses = 0
  hits = 0

  for i, row in enumerate(rows, start=1):
    name = str(row.get("player_name", "")).strip()
    if not name:
      row["jersey_no"] = ""
      continue

    if name in cache:
      row["jersey_no"] = cache[name]
      continue

    person_ids = name_to_person_ids.get(name.lower(), [])
    jersey = ""
    for pid in person_ids:
      try:
        jersey = fetch_jersey_from_person_id(pid)
      except Exception:
        jersey = ""
      if jersey:
        break
      time.sleep(args.sleep)

    if jersey:
      hits += 1
    else:
      misses += 1
      jersey = ""

    cache[name] = jersey
    row["jersey_no"] = jersey
    if i % 25 == 0:
      print(f"[{i}/{len(rows)}] processed...")
    time.sleep(args.sleep)

  save_rows(args.output, rows)
  print(f"完成：写入 {args.output}")
  print(f"命中号码: {hits}，未命中: {misses}")
  print("下一步：把输出文件替换为 data/current/players.csv（或在前端切换读取该文件）。")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
