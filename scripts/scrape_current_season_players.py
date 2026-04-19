#!/usr/bin/env python3
"""
本赛季全联盟球员数据（Basketball-Reference 联盟 Per Game 表）→ data/current/players.csv

· 默认写入「表中所有球员」；低分钟/低场次记为 pool=roster（网页补强推荐仍只用 free_agent / role）。
· 交易球员在写入前会去重，只保留当季最后一支真实球队的 stint（与 fetch 脚本一致）。

用法：
  cd /path/to/NBA && python3 -m pip install -r requirements.txt
  python3 scripts/scrape_current_season_players.py

遇 Cloudflare 时，用浏览器打开
  https://www.basketball-reference.com/leagues/NBA_2026_per_game.html
另存为 HTML 后：
  python3 scripts/scrape_current_season_players.py --local-html ~/Downloads/NBA_2026_per_game.html

上一赛季示例：
  python3 scripts/scrape_current_season_players.py --br-season-year 2025
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load_fetch_module():
    path = ROOT / "scripts" / "fetch_br_league_players.py"
    spec = importlib.util.spec_from_file_location("fetch_br_league_players", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载 {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    ap = argparse.ArgumentParser(
        description="抓取本赛季 NBA 全联盟球员 Per Game 数据 → data/current/players.csv"
    )
    ap.add_argument(
        "--br-season-year",
        type=int,
        default=2026,
        help="BR URL 中的赛季年：2026 对应 2025-26（leagues/NBA_2026_per_game.html）",
    )
    ap.add_argument(
        "--season-label",
        default=None,
        help="CSV 的 season 列；默认由 --br-season-year 推导（如 2025-26）",
    )
    ap.add_argument(
        "--output",
        type=Path,
        default=None,
        help="输出 CSV，默认 data/current/players.csv",
    )
    ap.add_argument(
        "--local-html",
        type=Path,
        default=None,
        help="使用本机保存的 BR 联盟 Per Game 页 HTML（绕过在线请求）",
    )
    ap.add_argument(
        "--recommend-only",
        action="store_true",
        help="仅保留 ≥12 分钟且 ≥15 场球员（缩小 CSV，与 fetch 不加 --all-players 时一致）",
    )
    args = ap.parse_args()

    mod = _load_fetch_module()
    return mod.run_fetch(
        br_season_year=args.br_season_year,
        season_label=args.season_label,
        output=args.output,
        local_html=args.local_html,
        all_players=not args.recommend_only,
    )


if __name__ == "__main__":
    raise SystemExit(main())
