#!/usr/bin/env python3
"""
抓取本赛季东西部排名（Basketball-Reference standings），写入 data/current/standings.csv。

输出字段：
  conf,rank,team_abbr,team_name,wins,losses,win_pct,gb

用法：
  python3 scripts/scrape_current_standings.py
  python3 scripts/scrape_current_standings.py --br-year 2026 --season 2025-26

依赖 scrape_nba.fetch_html（已用 curl-cffi 绕过 Cloudflare）。
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scrape_nba import BASE, DATA, fetch_html, write_csv  # noqa: E402


def _uncomment(html: str) -> str:
    for _ in range(40):
        s = html.find("<!--")
        if s == -1:
            break
        e = html.find("-->", s)
        if e == -1:
            break
        inner = html[s + 4 : e]
        if "sortable stats_table" in inner or "confs_standings" in inner:
            html = html[:s] + inner + html[e + 3 :]
        else:
            html = html[:s] + html[e + 3 :]
    return html


def _parse_conf(soup: BeautifulSoup, table_id: str, conf: str, season: str) -> list[dict]:
    t = soup.find("table", id=table_id)
    if not t or not t.find("tbody"):
        return []
    out: list[dict] = []
    rank = 0
    for tr in t.find("tbody").find_all("tr"):
        cls = tr.get("class") or []
        if "thead" in cls:
            continue
        a = tr.find("a", href=re.compile(r"/teams/"))
        if not a:
            continue
        m = re.search(r"/teams/([A-Z]{3})/", a.get("href") or "")
        if not m:
            continue
        team_abbr = m.group(1)
        rank += 1
        def cell(stat: str) -> str:
            td = tr.find(attrs={"data-stat": stat})
            return td.get_text(strip=True) if td else ""

        team_name = a.get_text(strip=True).replace("*", "")
        w = cell("wins")
        l = cell("losses")
        wp = cell("win_loss_pct")
        gb = cell("gb")
        out.append(
            {
                "season": season,
                "conf": conf,
                "rank": rank,
                "team_abbr": team_abbr,
                "team_name": team_name,
                "wins": w,
                "losses": l,
                "win_pct": wp,
                "gb": gb,
            }
        )
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="BR standings → data/current/standings.csv")
    ap.add_argument("--br-year", type=int, default=2026, help="BR 目录年，如 2026 对应 2025-26")
    ap.add_argument("--season", default="2025-26", help="写入 standings.csv 的 season")
    ap.add_argument("--output", type=Path, default=None, help="输出路径，默认 data/current/standings.csv")
    args = ap.parse_args()

    url = f"{BASE}/leagues/NBA_{args.br_year}_standings.html"
    print(f"请求 {url} …", flush=True)
    html = fetch_html(url)
    if not html:
        print("抓取失败。请确认已安装 requirements.txt（含 curl-cffi）。", file=sys.stderr)
        return 1
    html = _uncomment(html)
    soup = BeautifulSoup(html, "lxml")

    east = _parse_conf(soup, "confs_standings_E", "E", args.season)
    west = _parse_conf(soup, "confs_standings_W", "W", args.season)
    rows = east + west
    if len(rows) < 20:
        print(f"解析行过少（{len(rows)}），页面结构可能变更。", file=sys.stderr)
        return 1

    out_path = args.output or (DATA / "current" / "standings.csv")
    fields = ["season", "conf", "rank", "team_abbr", "team_name", "wins", "losses", "win_pct", "gb"]
    write_csv(out_path, fields, rows)
    print(f"已写入 {out_path}（{len(rows)} 行）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

