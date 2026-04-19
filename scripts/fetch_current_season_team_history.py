#!/usr/bin/env python3
"""
用 NBA 官方 Stats API 只拉取「当前赛季」球队高级+基础表，合并进 data/history/*.csv，
补全 team_seasons / team_style_8d 中的 FG3_PCT、REB_PCT、RPG 等（供 echarts_history.json 与历史八维图）。

需能访问 stats.nba.com；依赖 nba_api、pandas（见 requirements.txt）。

用法：
  python3 scripts/fetch_current_season_team_history.py
  python3 scripts/fetch_current_season_team_history.py --season 2025-26
  python3 scripts/fetch_current_season_team_history.py --proxy http://127.0.0.1:7890

完成后请运行：
  python3 scripts/build_echarts_history_json.py
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    ap = argparse.ArgumentParser(description="合并写入当前赛季球队历史统计（NBA Stats API）")
    ap.add_argument(
        "--season",
        default="2025-26",
        help="赛季标签，与 nba_api 一致，如 2025-26",
    )
    ap.add_argument("--proxy", default=None, help="可选 HTTP/SOCKS 代理")
    ap.add_argument("--sleep", type=float, default=0.7, help="请求间隔秒数")
    ap.add_argument("--timeout", type=int, default=30, help="单次请求超时")
    args = ap.parse_args()

    cmd = [
        sys.executable,
        str(ROOT / "scripts" / "fetch_history_nba_stats.py"),
        "--only-season",
        args.season,
        "--sleep",
        str(args.sleep),
        "--timeout",
        str(args.timeout),
    ]
    if args.proxy:
        cmd.extend(["--proxy", args.proxy])
    return subprocess.call(cmd)


if __name__ == "__main__":
    raise SystemExit(main())
