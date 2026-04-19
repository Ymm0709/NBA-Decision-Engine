#!/usr/bin/env python3
"""
历史数据拉取（1979-80 赛季 ～ 默认含 2025-26）：仅通过 NBA 官方 Stats API（nba_api）。

产出（写入 data/history/）：
  - team_seasons.csv       每队每赛季一行（高级 + 基础效率，含 FG3_PCT、REB_PCT、REB 等）
  - player_league_style.csv 每赛季「联盟轮换球员」平均风格指标
  - team_style_8d.csv       每队每赛季风格维度（供雷达/走势图；文件名沿用 8d）

用法：
  pip install -r requirements.txt
  python3 scripts/fetch_history_nba_stats.py
  python3 scripts/fetch_history_nba_stats.py --only-season 2025-26
  python3 scripts/fetch_current_season_team_history.py
  python3 scripts/fetch_history_nba_stats.py --team-abbr LAL

代理（与 shell 里 export 等价，且对 nba_api 显式生效）：
  python3 scripts/fetch_history_nba_stats.py --proxy http://127.0.0.1:7890
  python3 scripts/fetch_history_nba_stats.py --proxy socks5h://127.0.0.1:7891
  python3 scripts/fetch_history_nba_stats.py --proxy http://127.0.0.1:7890 --test

说明：需能访问 stats.nba.com；SOCKS 需已安装 requests[socks]（见 requirements.txt）。
若某赛季失败会跳过并继续。跑完全量约 26×(球队+球员) 次请求，请耐心等待。
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "history"

try:
    import pandas as pd
    from nba_api.stats.endpoints import leaguedashplayerstats, leaguedashteamstats
except ImportError as e:
    print("请先安装: pip install nba_api pandas", file=sys.stderr)
    raise SystemExit(1) from e


def round_numeric_csv_columns(df: pd.DataFrame, *, exclude: frozenset[str] | None = None) -> pd.DataFrame:
    """写入 CSV 前：数值列统一保留两位小数（整型 ID 列除外）。"""
    ex = exclude or frozenset()
    out = df.copy()
    for c in out.columns:
        if c in ex:
            continue
        if pd.api.types.is_numeric_dtype(out[c]):
            out[c] = pd.to_numeric(out[c], errors="coerce").round(2)
    return out


def season_labels(start: int, end: int) -> list[str]:
    """start/end 为日历年起始年，如 start=2000, end=2025 → 2000-01 … 2025-26"""
    out: list[str] = []
    for y in range(start, end + 1):
        out.append(f"{y}-{str(y + 1)[-2:]}")
    return out


def fetch_team_season(season: str, *, proxy: str | None, timeout: int) -> pd.DataFrame | None:
    try:
        adv = leaguedashteamstats.LeagueDashTeamStats(
            league_id_nullable="00",
            season=season,
            season_type_all_star="Regular Season",
            per_mode_detailed="PerGame",
            measure_type_detailed_defense="Advanced",
            proxy=proxy,
            timeout=timeout,
        ).get_data_frames()[0]
        base = leaguedashteamstats.LeagueDashTeamStats(
            league_id_nullable="00",
            season=season,
            season_type_all_star="Regular Season",
            per_mode_detailed="PerGame",
            measure_type_detailed_defense="Base",
            proxy=proxy,
            timeout=timeout,
        ).get_data_frames()[0]
    except Exception as e:
        print(f"  [team] {season} 跳过: {e}")
        return None

    keep_adv = [
        c
        for c in adv.columns
        if c
        in (
            "TEAM_ID",
            "TEAM_NAME",
            "GP",
            "W",
            "L",
            "W_PCT",
            "OFF_RATING",
            "DEF_RATING",
            "NET_RATING",
            "PACE",
            "TS_PCT",
            "EFG_PCT",
            "AST_PCT",
            "TOV_PCT",
            "OREB_PCT",
            "DREB_PCT",
            "REB_PCT",
        )
    ]
    keep_base = [
        c
        for c in base.columns
        if c
        in (
            "TEAM_ID",
            "TEAM_ABBREVIATION",
            "FGM",
            "FGA",
            "FG_PCT",
            "FG3M",
            "FG3A",
            "FG3_PCT",
            "FTM",
            "FTA",
            "OREB",
            "DREB",
            "REB",
            "AST",
            "STL",
            "BLK",
            "TOV",
            "PTS",
            "PLUS_MINUS",
        )
    ]
    a = adv[keep_adv].copy()
    b = base[keep_base].copy()
    overlap = (set(a.columns) & set(b.columns)) - {"TEAM_ID"}
    b = b.drop(columns=[c for c in overlap if c in b.columns])
    m = a.merge(b, on="TEAM_ID", how="inner")
    m.insert(0, "SEASON", season)
    return m


def fetch_player_league_style(season: str, *, proxy: str | None, timeout: int) -> dict | None:
    """轮换球员（GP≥20, MIN≥15）场均指标的平均，刻画「时代打法」近似。"""
    try:
        df = leaguedashplayerstats.LeagueDashPlayerStats(
            league_id_nullable="00",
            season=season,
            season_type_all_star="Regular Season",
            per_mode_detailed="PerGame",
            measure_type_detailed_defense="Base",
            proxy=proxy,
            timeout=timeout,
        ).get_data_frames()[0]
    except Exception as e:
        print(f"  [player] {season} 跳过: {e}")
        return None

    need = {"MIN", "GP", "FG3A", "FG3M", "FG3_PCT", "AST", "PTS", "REB", "FGA"}
    if not need.issubset(df.columns):
        print(f"  [player] {season} 列不齐，跳过")
        return None

    sub = df[(df["GP"] >= 20) & (df["MIN"] >= 15.0)].copy()
    if sub.empty:
        return None

    return {
        "SEASON": season,
        "N_PLAYERS": len(sub),
        "AVG_FG3A": round(sub["FG3A"].mean(), 2),
        "AVG_FG3_PCT": round(sub["FG3_PCT"].mean(), 2),
        "AVG_AST": round(sub["AST"].mean(), 2),
        "AVG_PTS": round(sub["PTS"].mean(), 2),
        "AVG_REB": round(sub["REB"].mean(), 2),
        "AVG_FGA": round(sub["FGA"].mean(), 2),
    }


def run_proxy_test(proxy: str | None, timeout: int) -> int:
    """拉取一个赛季的高级球队表，用于验证代理/网络。"""
    try:
        adv = leaguedashteamstats.LeagueDashTeamStats(
            league_id_nullable="00",
            season="2024-25",
            season_type_all_star="Regular Season",
            per_mode_detailed="PerGame",
            measure_type_detailed_defense="Advanced",
            proxy=proxy,
            timeout=timeout,
        ).get_data_frames()[0]
    except Exception as e:
        print(f"[test] 失败: {e}", file=sys.stderr)
        return 1
    print(f"[test] 成功: {len(adv)} 行, 列数 {len(adv.columns)}")
    if "TEAM_NAME" in adv.columns:
        print(f"[test] 示例队名: {adv['TEAM_NAME'].iloc[0]}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start-year", type=int, default=1979, help="起始日历年份，默认 1979 → 1979-80 赛季")
    ap.add_argument(
        "--end-year",
        type=int,
        default=2025,
        help="结束日历年份，默认 2025 → 包含 2025-26 赛季",
    )
    ap.add_argument(
        "--only-season",
        type=str,
        default=None,
        metavar="SEASON",
        help="只拉取该赛季并合并进已有 CSV（如 2025-26），先删除旧文件中同赛季行；适合补最新季",
    )
    ap.add_argument("--sleep", type=float, default=0.7, help="每次 API 请求间隔秒数")
    ap.add_argument(
        "--proxy",
        type=str,
        default=None,
        metavar="URL",
        help="显式代理，如 http://127.0.0.1:7890 或 socks5h://127.0.0.1:7891（覆盖环境变量对 nba_api 的行为）",
    )
    ap.add_argument(
        "--timeout",
        type=int,
        default=30,
        help="单次 API 超时秒数（默认 30）",
    )
    ap.add_argument(
        "--test",
        action="store_true",
        help="只请求 2024-25 一季球队高级表后退出，用于测代理",
    )
    ap.add_argument(
        "--team-abbr",
        type=str,
        default=None,
        help="可选：只导出指定球队缩写（如 BOS/LAL/GSW）的 8 维数据",
    )
    args = ap.parse_args()

    proxy = (args.proxy or "").strip() or None

    if args.test:
        return run_proxy_test(proxy, args.timeout)

    only = (args.only_season or "").strip()
    if only:
        seasons = [only]
        print(f"仅单赛季模式: {only}")
    else:
        seasons = season_labels(args.start_year, args.end_year)
    OUT.mkdir(parents=True, exist_ok=True)

    team_frames: list[pd.DataFrame] = []
    style_rows: list[dict] = []

    print(f"共 {len(seasons)} 个赛季: {seasons[0]} … {seasons[-1]}")

    for season in seasons:
        print(f"→ {season}")
        tf = fetch_team_season(season, proxy=proxy, timeout=args.timeout)
        if tf is not None:
            team_frames.append(tf)
        time.sleep(args.sleep)

        pr = fetch_player_league_style(season, proxy=proxy, timeout=args.timeout)
        if pr:
            style_rows.append(pr)
        time.sleep(args.sleep)

    if team_frames:
        all_teams = round_numeric_csv_columns(
            pd.concat(team_frames, ignore_index=True),
            exclude=frozenset({"TEAM_ID"}),
        )
        p = OUT / "team_seasons.csv"
        if only and p.exists():
            old_ts = pd.read_csv(p)
            old_ts = old_ts[old_ts["SEASON"].astype(str) != only]
            all_teams = pd.concat([old_ts, all_teams], ignore_index=True)
        all_teams = all_teams.sort_values(["SEASON", "TEAM_ID"]).reset_index(drop=True)
        all_teams.to_csv(p, index=False)
        print(f"已写入 {p} （{len(all_teams)} 行）")

        # 8 维球队风格数据：按你的指标定义直接抽取
        cols_needed = {
            "SEASON",
            "TEAM_ID",
            "TEAM_NAME",
            "TEAM_ABBREVIATION",
            "W",
            "L",
            "W_PCT",
            "OFF_RATING",
            "DEF_RATING",
            "PACE",
            "FG3_PCT",
            "FG3A",
            "REB_PCT",
            "REB",
            "TOV_PCT",
            "STL",
            "BLK",
        }
        missing = cols_needed - set(all_teams.columns)
        if missing:
            print(f"[warn] team_style_8d 缺少列: {sorted(missing)}")

        team_8d = all_teams.copy()
        if args.team_abbr:
            abbr = args.team_abbr.strip().upper()
            if "TEAM_ABBREVIATION" in team_8d.columns:
                team_8d = team_8d[team_8d["TEAM_ABBREVIATION"].astype(str).str.upper() == abbr].copy()
                print(f"team_style_8d 仅导出球队: {abbr}（{len(team_8d)} 行）")
            else:
                print("[warn] TEAM_ABBREVIATION 缺失，无法按 --team-abbr 过滤；继续导出全量。")

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
        p8 = OUT / "team_style_8d.csv"
        sort_cols = [c for c in ("team_abbr", "team_name", "team_id", "season") if c in team_8d.columns]
        out_df = round_numeric_csv_columns(team_8d[out_cols].copy(), exclude=frozenset({"team_id", "W", "L"}))
        if sort_cols:
            out_df = out_df.sort_values(sort_cols)
        if only and p8.exists():
            old8 = pd.read_csv(p8)
            old8 = old8[old8["season"].astype(str) != only]
            out_df = pd.concat([old8, out_df], ignore_index=True)
            if sort_cols:
                out_df = out_df.sort_values(sort_cols)
        out_df.to_csv(p8, index=False)
        print(f"已写入 {p8} （{len(out_df)} 行）")
    else:
        print("未得到任何球队数据", file=sys.stderr)
        return 1

    if style_rows:
        pl_path = OUT / "player_league_style.csv"
        df_style = round_numeric_csv_columns(
            pd.DataFrame(style_rows), exclude=frozenset({"N_PLAYERS"})
        )
        if only and pl_path.exists():
            old_pl = pd.read_csv(pl_path)
            seasons_in_new = set(df_style["SEASON"].astype(str).unique())
            old_pl = old_pl[~old_pl["SEASON"].astype(str).isin(seasons_in_new)]
            df_style = pd.concat([old_pl, df_style], ignore_index=True).sort_values("SEASON")
        df_style.to_csv(pl_path, index=False)
        print(f"已写入 {pl_path}")

    print("下一步: python3 scripts/build_echarts_history_json.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
