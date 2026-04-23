#!/usr/bin/env python3
"""
抓取“当前时间口径”的各队阵容（交易后归属）+ 场均数据 + 头像 + 球衣号，写入：
  - data/current/players.csv
  - data/current/players_with_jersey.csv

数据源：nba_api（官方 stats.nba.com）

输出字段与前端兼容：
  player_id,player_name,team_abbr,pos,age,gp,mpg,pts,fg3_pct,reb,ast,stl,blk,tov,pool,archetype,season,avatar_url,jersey_no
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

from nba_api.stats.endpoints import commonteamroster, leaguedashplayerstats
from nba_api.stats.static import teams as static_teams


ROOT = Path(__file__).resolve().parents[1]
DATA_CURRENT = ROOT / "data" / "current"


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  with path.open("w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    w.writerows(rows)


def season_label_from_br_year(br_year: int) -> str:
  y0 = br_year - 1
  return f"{y0}-{str(br_year)[-2:]}"


def headshot_url(person_id: int) -> str:
  # NBA CDN：更稳定的人像源
  return f"https://cdn.nba.com/headshots/nba/latest/1040x760/{person_id}.png"


def fetch_league_per_game(season: str, *, sleep: float) -> dict[int, dict]:
  # PerGame stats
  resp = leaguedashplayerstats.LeagueDashPlayerStats(
    season=season,
    season_type_all_star="Regular Season",
    per_mode_detailed="PerGame",
    timeout=20,
  )
  time.sleep(sleep)
  df = resp.get_data_frames()[0]
  out: dict[int, dict] = {}
  for _, r in df.iterrows():
    pid = int(r.get("PLAYER_ID"))
    out[pid] = {
      "team_abbr": str(r.get("TEAM_ABBREVIATION") or "").strip(),
      "gp": int(r.get("GP") or 0),
      "mpg": float(r.get("MIN") or 0),
      "pts": float(r.get("PTS") or 0),
      "fg3_pct": float(r.get("FG3_PCT") or 0),
      "reb": float(r.get("REB") or 0),
      "ast": float(r.get("AST") or 0),
      "stl": float(r.get("STL") or 0),
      "blk": float(r.get("BLK") or 0),
      "tov": float(r.get("TOV") or 0),
    }
  return out


def fetch_team_rosters(season: str, *, sleep: float) -> dict[int, dict]:
  # 返回 {PLAYER_ID: {player_name, team_abbr, pos, age, jersey_no}}
  out: dict[int, dict] = {}
  for t in static_teams.get_teams():
    team_id = int(t["id"])
    abbr = str(t["abbreviation"]).strip()
    try:
      resp = commonteamroster.CommonTeamRoster(team_id=team_id, season=season, timeout=20)
      df = resp.get_data_frames()[0]
    except Exception:
      df = None
    time.sleep(sleep)
    if df is None or getattr(df, "empty", True):
      continue
    for _, r in df.iterrows():
      pid = int(r.get("PLAYER_ID"))
      out[pid] = {
        "player_name": str(r.get("PLAYER") or "").strip(),
        "team_abbr": abbr,
        "pos": str(r.get("POSITION") or "").strip(),
        "age": int(float(r.get("AGE") or 0)) if str(r.get("AGE") or "").strip() else "",
        "jersey_no": str(r.get("NUM") or "").strip(),
      }
  return out


def main() -> int:
  ap = argparse.ArgumentParser(description="nba_api 当前阵容 + 场均 + 头像 → data/current/players*.csv")
  ap.add_argument("--season", default="2025-26", help="赛季字符串，如 2025-26（默认 2025-26）")
  ap.add_argument("--sleep", type=float, default=0.55, help="请求间隔秒数（默认 0.55）")
  ap.add_argument("--output", type=Path, default=None, help="输出 players.csv（默认 data/current/players.csv）")
  args = ap.parse_args()

  season = str(args.season).strip()
  sleep = float(args.sleep)
  out_players = args.output or (DATA_CURRENT / "players.csv")
  out_players_jersey = out_players.with_name("players_with_jersey.csv")

  print(f"抓取 nba_api：season={season} ...", flush=True)
  per_game = fetch_league_per_game(season, sleep=sleep)
  rosters = fetch_team_rosters(season, sleep=sleep)

  # 合并：以 roster 为主（保证“当前归属”），stats 缺失则置 0
  rows: list[dict] = []
  for pid, meta in rosters.items():
    stat = per_game.get(pid, {})
    team_abbr = meta.get("team_abbr") or stat.get("team_abbr") or ""
    row = {
      "player_id": str(pid),
      "player_name": meta.get("player_name") or "",
      "avatar_url": headshot_url(pid),
      "team_abbr": team_abbr,
      "pos": meta.get("pos") or "",
      "age": meta.get("age") if meta.get("age") != 0 else "",
      "gp": stat.get("gp", 0),
      "mpg": round(float(stat.get("mpg", 0) or 0), 2),
      "pts": round(float(stat.get("pts", 0) or 0), 2),
      "fg3_pct": round(float(stat.get("fg3_pct", 0) or 0), 4),
      "reb": round(float(stat.get("reb", 0) or 0), 2),
      "ast": round(float(stat.get("ast", 0) or 0), 2),
      "stl": round(float(stat.get("stl", 0) or 0), 2),
      "blk": round(float(stat.get("blk", 0) or 0), 2),
      "tov": round(float(stat.get("tov", 0) or 0), 2),
      # 这些字段给前端推荐用；后续仍可由你现有逻辑再加工
      "pool": "rotation",
      "archetype": "rotation",
      "season": season,
      "jersey_no": meta.get("jersey_no") or "",
    }
    rows.append(row)

  # 排序：按球队 + mpg
  def key(r: dict) -> tuple:
    return (str(r.get("team_abbr") or ""), -float(r.get("mpg") or 0), str(r.get("player_name") or ""))

  rows.sort(key=key)

  fields = [
    "player_id",
    "player_name",
    "team_abbr",
    "pos",
    "age",
    "gp",
    "mpg",
    "pts",
    "fg3_pct",
    "reb",
    "ast",
    "stl",
    "blk",
    "tov",
    "pool",
    "archetype",
    "season",
  ]
  # players.csv：前端主数据（不含 jersey_no 也可，但我们保留 avatar_url）
  fields_players = ["player_id", "player_name", "avatar_url"] + fields[2:]
  write_csv(out_players, fields_players, [{k: r.get(k, "") for k in fields_players} for r in rows])

  # players_with_jersey.csv：补球衣号
  fields_jersey = fields_players + ["jersey_no"]
  write_csv(out_players_jersey, fields_jersey, [{k: r.get(k, "") for k in fields_jersey} for r in rows])

  print(f"完成：写入 {out_players}（{len(rows)} 行）")
  print(f"完成：写入 {out_players_jersey}（{len(rows)} 行）")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())

