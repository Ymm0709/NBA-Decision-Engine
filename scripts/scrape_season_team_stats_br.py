#!/usr/bin/env python3
"""
用 NBA 官方 Stats API 拉取指定赛季全队数据（含 FG3_PCT、REB_PCT 等），合并进
data/history/team_seasons.csv 与 team_style_8d.csv，供历史 Tab 三分折线、联盟对比使用。

（脚本名保留 br 历史命名；实际数据源为 nba_api，与 fetch_history_nba_stats 同源。）

用法：
  python3 scripts/scrape_season_team_stats_br.py
  python3 scripts/scrape_season_team_stats_br.py --season 2025-26
  python3 scripts/scrape_season_team_stats_br.py --proxy http://127.0.0.1:7890

完成后：
  python3 scripts/build_echarts_history_json.py
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
HIST = ROOT / "data" / "history"
TEAM_SEASONS = HIST / "team_seasons.csv"
STYLE_8D = HIST / "team_style_8d.csv"


def _load_fetch_team_season():
    p = ROOT / "scripts" / "fetch_history_nba_stats.py"
    spec = importlib.util.spec_from_file_location("nba_hist", p)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载 {p}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.fetch_team_season


def team_style_8d_from_ts(ts: pd.DataFrame) -> pd.DataFrame:
    team_8d = ts.copy()
    team_8d = team_8d.rename(
        columns={
            "SEASON": "season",
            "TEAM_ID": "team_id",
            "TEAM_NAME": "team_name",
            "TEAM_ABBREVIATION": "team_abbr",
            "OFF_RATING": "off_rating",
            "DEF_RATING": "def_rating",
            "PACE": "pace",
            "FG3_PCT": "fg3_pct",
            "FG3A": "fg3a",
            "REB_PCT": "reb_pct",
            "REB": "rpg",
            "TOV_PCT": "tov_pct",
            "STL": "stl",
            "BLK": "blk",
            "W_PCT": "win_pct",
        }
    )
    team_8d["stl_blk"] = team_8d.get("stl", 0).fillna(0) + team_8d.get("blk", 0).fillna(0)
    out_cols = [
        "season",
        "team_id",
        "team_name",
        "team_abbr",
        "W",
        "L",
        "win_pct",
        "off_rating",
        "def_rating",
        "pace",
        "fg3_pct",
        "fg3a",
        "reb_pct",
        "rpg",
        "tov_pct",
        "stl",
        "blk",
        "stl_blk",
    ]
    out_cols = [c for c in out_cols if c in team_8d.columns]
    return team_8d[out_cols]


def main() -> int:
    ap = argparse.ArgumentParser(description="NBA Stats → 合并 team_seasons / team_style_8d（含三分命中率）")
    ap.add_argument("--season", default="2025-26", help="赛季，如 2025-26")
    ap.add_argument("--proxy", default=None, help="可选代理，同 fetch_history_nba_stats")
    ap.add_argument("--timeout", type=int, default=45, help="单次 API 超时秒数")
    args = ap.parse_args()

    proxy = (args.proxy or "").strip() or None
    fetch_team_season = _load_fetch_team_season()

    print(f"请求 NBA Stats 球队汇总：{args.season} …", flush=True)
    df = fetch_team_season(args.season, proxy=proxy, timeout=args.timeout)
    if df is None or len(df) < 25:
        print(
            "拉取失败或数据过少。请检查本机能否访问 stats.nba.com，必要时加 --proxy。",
            file=sys.stderr,
        )
        return 1

    if "TEAM_ABBREVIATION" not in df.columns and TEAM_SEASONS.exists():
        prev = pd.read_csv(TEAM_SEASONS)
        prev = prev[prev["SEASON"].astype(str) != args.season]
        if not prev.empty and "TEAM_ABBREVIATION" in prev.columns:
            m = prev.drop_duplicates("TEAM_ID").set_index("TEAM_ID")["TEAM_ABBREVIATION"]
            df = df.copy()
            df["TEAM_ABBREVIATION"] = df["TEAM_ID"].map(m)

    HIST.mkdir(parents=True, exist_ok=True)
    if TEAM_SEASONS.exists():
        old = pd.read_csv(TEAM_SEASONS)
        old = old[old["SEASON"].astype(str) != args.season]
        out_ts = pd.concat([old, df], ignore_index=True)
    else:
        out_ts = df
    out_ts = out_ts.sort_values(["SEASON", "TEAM_ID"]).reset_index(drop=True)
    out_ts.to_csv(TEAM_SEASONS, index=False)
    print(f"已写入 {TEAM_SEASONS}（共 {len(out_ts)} 行），当季 FG3_PCT 已包含。")

    s8_new = team_style_8d_from_ts(df)
    if STYLE_8D.exists():
        old8 = pd.read_csv(STYLE_8D)
        old8 = old8[old8["season"].astype(str) != args.season]
        s8_out = pd.concat([old8, s8_new], ignore_index=True)
    else:
        s8_out = s8_new
    sort_cols = [c for c in ("team_abbr", "team_name", "team_id", "season") if c in s8_out.columns]
    if sort_cols:
        s8_out = s8_out.sort_values(sort_cols)
    s8_out.to_csv(STYLE_8D, index=False)
    print(f"已写入 {STYLE_8D}（{len(s8_out)} 行）")

    print("下一步: python3 scripts/build_echarts_history_json.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
