#!/usr/bin/env python3
"""
从 Basketball-Reference 联盟「Per Game」页抓取当季全联盟球员行，写入 data/current/players.csv。

与 scrape_nba.py 使用相同的 CSV 列、自由球员池规则（fa_candidates.txt + spotrac md）及 archetype 逻辑。

用法：
  python3 scripts/scrape_current_season_players.py          # 推荐：本赛季全联盟球员（含低出场）
  python3 scripts/fetch_br_league_players.py --all-players  # 同上
  python3 scripts/fetch_br_league_players.py                # 仅保留原筛选（≥12 分钟且 ≥15 场），用于补强推荐精简池
  python3 scripts/fetch_br_league_players.py --br-season-year 2025   # 2024-25 赛季
  python3 scripts/fetch_br_league_players.py --local-html ~/Downloads/NBA_2026_per_game.html

说明：若遇 Cloudflare，用浏览器打开 BR 联盟 Per Game 页「另存为」HTML，再用 --local-html。
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

from scrape_nba import (  # noqa: E402
    DATA,
    SOURCES,
    classify_pool_archetype,
    dedupe_players_current_stint,
    fetch_html,
    load_fa_names,
    parse_spotrac_names,
    write_csv,
)

BR_BASE = "https://www.basketball-reference.com"

PLAYER_FIELDS = [
    "player_id",
    "player_name",
    "avatar_url",
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


def build_avatar_url(player_id: str) -> str:
    pid = (player_id or "").strip()
    if not pid:
        return ""
    return f"https://www.basketball-reference.com/req/202106291/images/headshots/{pid}.jpg"


def br_uncomment_stats_tables(html: str) -> str:
    """BR 常把 stats 表放在 HTML 注释里，展开后 BeautifulSoup 才能解析。"""
    for _ in range(40):
        start = html.find("<!--")
        if start == -1:
            break
        end = html.find("-->", start)
        if end == -1:
            break
        inner = html[start + 4 : end]
        if "sortable stats_table" in inner or 'id="stats"' in inner or "per_game_stats" in inner:
            html = html[:start] + inner + html[end + 3 :]
        else:
            html = html[:start] + html[end + 3 :]
    return html


def _pick(d: dict[str, str], *keys: str) -> str:
    for k in keys:
        v = d.get(k)
        if v is not None and str(v).strip() not in ("", "-", "None"):
            return str(v).strip()
    return ""


def _to_float(s: str) -> float:
    s = (s or "").strip()
    if not s or s == "-":
        return 0.0
    if s.startswith("."):
        s = "0" + s
    try:
        return float(s)
    except ValueError:
        return 0.0


def _to_int(s: str) -> int:
    s = (s or "").strip()
    if not s or s == "-":
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def tr_to_stat_dict(tr) -> dict[str, str]:
    out: dict[str, str] = {}
    for cell in tr.find_all(["th", "td"]):
        ds = cell.get("data-stat")
        if ds:
            out[ds] = cell.get_text(strip=True)
    return out


def find_per_game_table(soup: BeautifulSoup):
    for tid in ("stats", "per_game_stats"):
        t = soup.find("table", id=tid)
        if t:
            return t
    for t in soup.find_all("table", class_=re.compile(r"sortable stats_table")):
        if t.get("id") and "game" in (t.get("id") or "").lower():
            continue
        if t.find(attrs={"data-stat": "player"}) or t.find(attrs={"data-stat": "name_display"}):
            return t
    return None


def parse_player_rows_from_soup(
    soup: BeautifulSoup,
    fa_names: set[str],
    season_label: str,
    *,
    include_roster: bool = False,
) -> list[dict]:
    table = find_per_game_table(soup)
    if not table:
        return []

    tbody = table.find("tbody")
    if not tbody:
        return []

    rows_out: list[dict] = []
    for tr in tbody.find_all("tr"):
        cls = tr.get("class") or []
        if "thead" in cls:
            continue
        if "partial_table" in " ".join(cls):
            continue

        d = tr_to_stat_dict(tr)
        player_cell = tr.find(["th", "td"], attrs={"data-stat": "player"})
        if not player_cell:
            player_cell = tr.find(["th", "td"], attrs={"data-stat": "name_display"})
        if not player_cell:
            continue

        a = player_cell.find("a", href=re.compile(r"/players/"))
        href = (a.get("href") or "") if a else ""
        m = re.search(r"/players/[a-z]/([^/.]+)\.html", href)
        player_id = m.group(1) if m else ""
        pname = a.get_text(strip=True) if a else player_cell.get_text(strip=True)
        if not pname or pname in ("Player",):
            continue

        low = pname.lower()
        if "league average" in low or "player" == low:
            continue

        g = _to_int(_pick(d, "games", "g"))
        mp = _to_float(_pick(d, "mp_per_g", "mp", "mins_per_g"))
        fg3_pct = _to_float(_pick(d, "fg3_pct"))
        three_pa = _to_float(_pick(d, "fg3a_per_g", "fg3a"))
        trb = _to_float(_pick(d, "trb_per_g", "trb"))
        ast = _to_float(_pick(d, "ast_per_g", "ast"))
        stl = _to_float(_pick(d, "stl_per_g", "stl"))
        blk = _to_float(_pick(d, "blk_per_g", "blk"))
        tov = _to_float(_pick(d, "tov_per_g", "tov"))
        pts = _to_float(_pick(d, "pts_per_g", "pts"))
        age = _to_int(_pick(d, "age"))
        pos = _pick(d, "pos") or ""
        tabbr = _pick(d, "team_name_abbr", "team") or ""

        pool, arch = classify_pool_archetype(
            pname,
            fa_names,
            mp,
            g,
            fg3_pct,
            three_pa,
            trb,
            ast,
            blk,
            stl,
            include_roster=include_roster,
        )
        if not pool:
            continue

        if not player_id:
            player_id = re.sub(r"[^a-z0-9]+", "", pname.lower())[:18] or "unknown"

        rows_out.append(
            {
                "player_id": player_id,
                "player_name": pname,
                "avatar_url": build_avatar_url(player_id),
                "team_abbr": tabbr,
                "pos": pos,
                "age": age,
                "gp": g,
                "mpg": round(mp, 2),
                "pts": round(pts, 2),
                "fg3_pct": round(fg3_pct, 2),
                "reb": round(trb, 2),
                "ast": round(ast, 2),
                "stl": round(stl, 2),
                "blk": round(blk, 2),
                "tov": round(tov, 2),
                "pool": pool,
                "archetype": arch,
                "season": season_label,
            }
        )

    return rows_out


def season_label_from_br_year(br_year: int) -> str:
    """BR 目录年 2026 → 赛季字符串 2025-26。"""
    y0 = br_year - 1
    return f"{y0}-{str(br_year)[-2:]}"


def run_fetch(
    *,
    br_season_year: int = 2026,
    season_label: str | None = None,
    output: Path | None = None,
    local_html: Path | None = None,
    all_players: bool = False,
) -> int:
    """从 BR 联盟 Per Game 抓取并写入 players.csv。all_players 为 True 时包含低出场行（pool=roster）。"""
    label = season_label or season_label_from_br_year(br_season_year)
    out_path = output or (DATA / "current" / "players.csv")

    fa_path = DATA / "fa_candidates.txt"
    fa_names = load_fa_names(fa_path)
    spotrac = SOURCES / "spotrac_free_agents.md"
    fa_names |= parse_spotrac_names(spotrac)

    url = f"{BR_BASE}/leagues/NBA_{br_season_year}_per_game.html"

    if local_html:
        if not local_html.is_file():
            print("找不到文件:", local_html, file=sys.stderr)
            return 1
        html = local_html.read_text(encoding="utf-8", errors="replace")
        print(f"读取本地 HTML: {local_html}")
    else:
        print(f"请求 {url} …", flush=True)
        html = fetch_html(url)
        if not html:
            print(
                "在线抓取失败。请确认已安装依赖：python3 -m pip install -r requirements.txt（含 curl-cffi）。\n"
                "若仍被拦截，请用浏览器打开上述 URL 另存为 HTML，再执行：\n"
                f"  python3 scripts/fetch_br_league_players.py --local-html 你保存的文件.html",
                file=sys.stderr,
            )
            return 1

    html = br_uncomment_stats_tables(html)
    soup = BeautifulSoup(html, "lxml")
    rows = parse_player_rows_from_soup(
        soup, fa_names, label, include_roster=all_players
    )
    rows = dedupe_players_current_stint(rows)

    min_ok = 200 if all_players else 50
    if len(rows) < min_ok:
        print(
            f"解析到的球员行过少（{len(rows)}），可能页面结构变更或 HTML 不完整。",
            file=sys.stderr,
        )
        return 1

    write_csv(out_path, PLAYER_FIELDS, rows)
    print(f"已写入 {out_path}（{len(rows)} 行），season={label}，all_players={all_players}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="BR 联盟 Per Game 页 → data/current/players.csv")
    ap.add_argument(
        "--br-season-year",
        type=int,
        default=2026,
        help="BR URL 中的赛季年，如 2026 对应 leagues/NBA_2026_per_game.html（默认 2026）",
    )
    ap.add_argument(
        "--season-label",
        default=None,
        help="写入 CSV 的 season 列，默认由 --br-season-year 推导（如 2025-26）",
    )
    ap.add_argument(
        "--output",
        type=Path,
        default=None,
        help="输出 CSV 路径，默认 data/current/players.csv",
    )
    ap.add_argument(
        "--local-html",
        type=Path,
        default=None,
        help="使用本机已保存的 BR HTML（绕过在线请求）",
    )
    ap.add_argument(
        "--all-players",
        action="store_true",
        help="包含全表球员（低分钟/低场次记为 pool=roster）；默认关闭以保持原推荐数据量",
    )
    args = ap.parse_args()

    return run_fetch(
        br_season_year=args.br_season_year,
        season_label=args.season_label,
        output=args.output,
        local_html=args.local_html,
        all_players=args.all_players,
    )


if __name__ == "__main__":
    raise SystemExit(main())
