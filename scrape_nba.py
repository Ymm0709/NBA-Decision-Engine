#!/usr/bin/env python3
"""
NBA 数据抓取：优先 Requests + BeautifulSoup 解析 Basketball-Reference；
若遇 Cloudflare/网络失败，则解析仓库内 data/sources/ 下的 Markdown 导出作为快照。

输出（仅当前赛季 · 补强核心）：data/current/teams.csv, data/current/players.csv

历史赛季（2000～至今）请用 scripts/fetch_history_nba_stats.py（nba_api），勿与本文件混用。
当季球员在线爬取（BR 联盟 Per Game 页）：scripts/fetch_br_league_players.py → 写 players.csv。
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
DATA_CURRENT = DATA / "current"  # 仅最新赛季：补强诊断 + 推荐
SOURCES = DATA / "sources"

BR_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

SEASON_SUFFIX = "2026"  # BR: 2025-26 season folder
BASE = "https://www.basketball-reference.com"


def _html_looks_like_cf_challenge(text: str) -> bool:
    """Cloudflare 拦截页或空壳响应。"""
    if len(text) < 5000:
        return True
    low = text.lower()
    if "just a moment" in low and "cloudflare" in low:
        return True
    if "cf-browser-verification" in low or "challenge-platform" in low:
        return True
    return False


def fetch_html(url: str, timeout: int = 35) -> str | None:
    """抓取 HTML。Basketball-Reference 对裸 requests 常拦 Cloudflare，优先用 curl_cffi 模拟浏览器 TLS。"""
    if "basketball-reference.com" in url:
        try:
            from curl_cffi import requests as curl_requests
        except ImportError:
            curl_requests = None
        if curl_requests is not None:
            try:
                r = curl_requests.get(
                    url,
                    impersonate="chrome",
                    headers=BR_HEADERS,
                    timeout=timeout,
                )
                if r.status_code == 200 and not _html_looks_like_cf_challenge(r.text):
                    return r.text
            except Exception:
                pass

    try:
        r = requests.get(url, headers=BR_HEADERS, timeout=timeout)
        if r.status_code != 200 or len(r.text) < 5000:
            return None
        if _html_looks_like_cf_challenge(r.text):
            return None
        return r.text
    except requests.RequestException:
        return None


def br_abbr_from_team_cell(cell: str) -> tuple[str, str] | None:
    m = re.search(r"\[([^\]]+)\]\(https://www\.basketball-reference\.com/teams/([A-Z]{3})/", cell)
    if not m:
        return None
    return m.group(2), m.group(1).replace("*", "").strip()


def parse_teams_from_soup(soup: BeautifulSoup, *, season_label: str = "2025-26") -> list[dict]:
    """Parse BR league page: advanced team table + per-game team + opponent."""
    tables = soup.find_all("table", class_=re.compile(r"stats_table"))
    out_adv: dict[str, dict] = {}
    out_pg: dict[str, dict] = {}
    out_opp: dict[str, dict] = {}

    for table in tables:
        tid = (table.get("id") or "") + " " + " ".join(table.get("class") or [])
        rows = table.find_all("tr")
        if not rows:
            continue
        # Heuristic: advanced stats has ORtg in header
        header_text = " ".join(rows[0].get_text(" ", strip=True))
        if "ORtg" in header_text and "DRtg" in header_text and "Pace" in header_text:
            for tr in rows[1:]:
                if tr.get("class") == ["thead"]:
                    continue
                tds = tr.find_all(["th", "td"])
                if len(tds) < 12:
                    continue
                name_cell = tds[1].get_text(" ", strip=True)
                abbr_m = re.search(r"\(([A-Z]{3})\)", name_cell) or re.search(
                    r"/teams/([A-Z]{3})/", str(tds[1])
                )
                if not abbr_m:
                    continue
                abbr = abbr_m.group(1)
                try:
                    w = int(tds[3].get_text(strip=True))
                    l = int(tds[4].get_text(strip=True))
                    ortg = float(tds[10].get_text(strip=True))
                    drtg = float(tds[11].get_text(strip=True))
                    nrtg_s = tds[12].get_text(strip=True).replace("+", "")
                    nrtg = float(nrtg_s)
                    pace = float(tds[13].get_text(strip=True))
                    ts_pct = float(tds[17].get_text(strip=True).replace(".", ".", 1))
                    if ts_pct < 1.0:
                        pass
                    tov_pct_o = float(tds[20].get_text(strip=True))
                    orb_pct = float(tds[21].get_text(strip=True))
                except (ValueError, IndexError):
                    continue
                out_adv[abbr] = {
                    "team_abbr": abbr,
                    "team_name": re.sub(r"\s*\([A-Z]{3}\)\s*", "", name_cell).strip(),
                    "wins": w,
                    "losses": l,
                    "ortg": round(ortg, 2),
                    "drtg": round(drtg, 2),
                    "nrtg": round(nrtg, 2),
                    "pace": round(pace, 2),
                    "ts_pct": round(ts_pct, 2),
                    "tov_pct_off": round(tov_pct_o, 2),
                    "orb_pct": round(orb_pct, 2),
                }
        # Per game team offense: header has MP FG FGA and ends with PTS
        if "Team" in header_text and "PTS" in header_text and "Opponent" not in tid:
            if "ORtg" in header_text:
                continue
            # First stats table on page is often team per-game
            for tr in rows[2:]:
                tds = tr.find_all(["th", "td"])
                if len(tds) < 25:
                    continue
                link = tds[1].find("a")
                if not link or not link.get("href"):
                    continue
                hm = re.search(r"/teams/([A-Z]{3})/", link["href"])
                if not hm:
                    continue
                abbr = hm.group(1)
                try:
                    fg3_pct_s = tds[9].get_text(strip=True).replace(".", "0.", 1) if tds[9].get_text(strip=True).startswith(".") else tds[9].get_text(strip=True)
                    fg3_pct = float(fg3_pct_s)
                    trb = float(tds[22].get_text(strip=True))
                    ast = float(tds[23].get_text(strip=True))
                    stl = float(tds[24].get_text(strip=True))
                    blk = float(tds[25].get_text(strip=True))
                    tov = float(tds[26].get_text(strip=True))
                    pts = float(tds[28].get_text(strip=True))
                except (ValueError, IndexError):
                    continue
                out_pg[abbr] = {
                    "fg3_pct": round(fg3_pct, 2),
                    "reb": round(trb, 2),
                    "ast": round(ast, 2),
                    "stl": round(stl, 2),
                    "blk": round(blk, 2),
                    "tov": round(tov, 2),
                    "pts_for": round(pts, 2),
                }

    # Opponent per-game (second occurrence): PTS column = points allowed
    opp_found = 0
    for table in tables:
        caption = table.find_previous(
            lambda tag: tag.name == "span" and "Opponent" in tag.get_text()
        )
        rows = table.find_all("tr")
        if not rows or len(rows) < 3:
            continue
        h = rows[0].get_text(" ", strip=True)
        if "PTS" not in h:
            continue
        for tr in rows[2:]:
            tds = tr.find_all(["th", "td"])
            if len(tds) < 25:
                continue
            link = tds[1].find("a")
            if not link:
                continue
            hm = re.search(r"/teams/([A-Z]{3})/", link["href"])
            if not hm:
                continue
            abbr = hm.group(1)
            try:
                pa = float(tds[28].get_text(strip=True))
            except (ValueError, IndexError):
                continue
            out_opp[abbr] = {"pts_against": round(pa, 2)}
        opp_found += 1
        if opp_found >= 1:
            break

    all_abbr = set(out_adv) | set(out_pg) | set(out_opp)
    merged: list[dict] = []
    for abbr in sorted(all_abbr):
        row = {"team_abbr": abbr, "season": season_label}
        if abbr in out_adv:
            row.update(out_adv[abbr])
        if abbr in out_pg:
            row.update(out_pg[abbr])
        if abbr in out_opp:
            row.update(out_opp[abbr])
        merged.append(row)
    return merged


def _split_md_row(line: str) -> list[str]:
    parts = [p.strip() for p in line.split("|")]
    return [c for c in parts[1:-1] if c != ""]


def parse_teams_from_markdown(league_md: str) -> list[dict]:
    """Parse exported markdown from BR league page: advanced + team per-game + opponent per-game."""
    lines = league_md.splitlines()
    adv_rows: dict[str, dict] = {}
    pg_rows: dict[str, dict] = {}
    opp_rows: dict[str, dict] = {}

    for line in lines:
        if not line.startswith("|") or "---|" in line or "League Average" in line:
            continue
        if "/teams/" not in line:
            continue
        cells = _split_md_row(line)
        if len(cells) < 15:
            continue
        abbr_m = re.search(r"/teams/([A-Z]{3})/", line)
        if not abbr_m:
            continue
        abbr = abbr_m.group(1)

        # Advanced: Age is cell[2] like 25.2; W/L in [3],[4]
        try:
            age_test = float(cells[2])
        except ValueError:
            age_test = None
        if age_test is not None and age_test < 40 and cells[3].isdigit() and int(cells[3]) <= 82:
            if len(cells) < 22:
                continue
            try:
                w, l = int(cells[3]), int(cells[4])
                ortg, drtg = float(cells[10]), float(cells[11])
                nrtg = float(cells[12].replace("+", ""))
                pace = float(cells[13])
                ts_pct = float(cells[17])
                tov_pct_o = float(cells[20])
                orb_pct = float(cells[21])
                name_m = re.search(r"\[([^\]]+)\]", cells[1])
                name = name_m.group(1).replace("*", "").strip() if name_m else abbr
            except (ValueError, IndexError):
                continue
            adv_rows[abbr] = {
                "team_abbr": abbr,
                "team_name": name,
                "wins": w,
                "losses": l,
                "ortg": round(ortg, 2),
                "drtg": round(drtg, 2),
                "nrtg": round(nrtg, 2),
                "pace": round(pace, 2),
                "ts_pct": round(ts_pct, 2),
                "tov_pct_off": round(tov_pct_o, 2),
                "orb_pct": round(orb_pct, 2),
            }
            continue

        # Per-game team / opponent: G == 82, team minutes ~240 (exclude Totals / Per-100 tables)
        if cells[2] != "82" or len(cells) < 25:
            continue
        try:
            team_mp = float(cells[3])
        except ValueError:
            continue
        if not (235.0 <= team_mp <= 245.0):
            continue
        try:
            fg3_s = cells[9]
            fg3_pct = float("0" + fg3_s) if fg3_s.startswith(".") else float(fg3_s)
            trb = float(cells[18])
            ast = float(cells[19])
            stl = float(cells[20])
            blk = float(cells[21])
            tov = float(cells[22])
            pts = float(cells[24])
        except (ValueError, IndexError):
            continue

        if abbr not in pg_rows:
            pg_rows[abbr] = {
                "fg3_pct": round(fg3_pct, 2),
                "reb": round(trb, 2),
                "ast": round(ast, 2),
                "stl": round(stl, 2),
                "blk": round(blk, 2),
                "tov": round(tov, 2),
                "pts_for": round(pts, 2),
            }
        else:
            opp_rows[abbr] = {"pts_against": round(pts, 2)}

    all_abbr = set(adv_rows) | set(pg_rows) | set(opp_rows)
    merged: list[dict] = []
    for abbr in sorted(all_abbr):
        row: dict = {"team_abbr": abbr, "season": "2025-26"}
        if abbr in adv_rows:
            row.update(adv_rows[abbr])
        if abbr in pg_rows:
            row.update(pg_rows[abbr])
        if abbr in opp_rows:
            row.update(opp_rows[abbr])
        merged.append(row)
    return merged


def player_name_from_cell(s: str) -> str:
    m = re.match(r"\[([^\]]+)\]", s.strip())
    return m.group(1) if m else s.strip()


def team_abbr_from_cell(s: str) -> str | None:
    m = re.search(r"\[([A-Z0-9]{2,4})\]\([^)]*teams/", s)
    return m.group(1) if m else None


def classify_pool_archetype(
    pname: str,
    fa_names: set[str],
    mp: float,
    g: int,
    fg3_pct: float,
    three_pa: float,
    trb: float,
    ast: float,
    blk: float,
    stl: float,
    *,
    include_roster: bool = False,
) -> tuple[str, str]:
    """与联盟 Per Game 行解析共用：自由球员池 + 位置风格标签。

    include_roster 为 True 时，低出场/低分钟行仍保留，pool 记为 roster（前端推荐仍只取 free_agent/role）。
    """
    if fg3_pct >= 0.38 and three_pa >= 4.5:
        arch = "shooter"
    elif ast >= 6.0:
        arch = "playmaker"
    elif trb >= 9.0 or blk >= 1.3:
        arch = "big"
    elif stl >= 1.2:
        arch = "perimeter_defense"
    else:
        arch = "two_way"

    if mp < 12 or g < 15:
        if include_roster:
            return "roster", arch
        return "", ""

    if pname in fa_names:
        pool = "free_agent"
    elif mp < 22:
        pool = "role"
    else:
        pool = "rotation"
    return pool, arch


_AGG_TEAM_MARKERS = frozenset({"TOT", "2TM", "3TM", "4TM"})


def _is_named_team_stint(team_abbr: str) -> bool:
    t = (team_abbr or "").strip().upper()
    if not t:
        return False
    if t in _AGG_TEAM_MARKERS:
        return False
    return True


def dedupe_players_current_stint(players: list[dict]) -> list[dict]:
    """同一 player_id 多行（交易）：只保留 BR 表 tbody 顺序中最后一支真实球队 stint。

    联盟 Per Game 表通常为「汇总行 + 各队 stint 按时间顺序」，最后一行 stint 视为当季当下所在队。
    """
    by_id: dict[str, list[dict]] = {}
    for p in players:
        pid = (p.get("player_id") or "").strip()
        if not pid:
            continue
        by_id.setdefault(pid, []).append(p)

    out: list[dict] = []
    emitted: set[str] = set()
    for p in players:
        pid = (p.get("player_id") or "").strip()
        if not pid:
            out.append(p)
            continue
        if pid in emitted:
            continue
        emitted.add(pid)
        group = by_id.get(pid, [p])
        stints = [r for r in group if _is_named_team_stint(str(r.get("team_abbr", "")))]
        if not stints:
            out.append(group[0])
        else:
            out.append(stints[-1])
    return out


def parse_players_md(path: Path, fa_names: set[str], *, include_roster: bool = False) -> list[dict]:
    text = path.read_text(encoding="utf-8", errors="replace")
    rows: list[dict] = []
    for line in text.splitlines():
        if not line.startswith("| ") or "Per Game Table" in line or "---|" in line:
            continue
        parts = line.split("|")
        cells = _split_md_row(line)
        if len(cells) < 30:
            continue
        if not cells[0].isdigit() and cells[0] != "Rk":
            continue
        if cells[0] == "Rk" or cells[1] == "Player":
            continue
        try:
            rk = int(cells[0])
        except ValueError:
            continue
        pname = player_name_from_cell(cells[1])
        if not pname or pname == "Player":
            continue
        try:
            age = int(float(cells[2]))
        except ValueError:
            age = 0
        tabbr = team_abbr_from_cell(cells[3]) or ""
        pos = cells[4]
        g = int(float(cells[5]))
        mp = float(cells[7])
        fg3_pct_s = cells[13]
        fg3_pct = float("0" + fg3_pct_s) if fg3_pct_s.startswith(".") else float(fg3_pct_s)
        three_pa = float(cells[12])
        trb = float(cells[23])
        tail = cells[24:]
        nums: list[float] = []
        for x in tail:
            if "http" in x or (x.startswith("[") and "](" in x):
                break
            try:
                nums.append(float(x))
            except ValueError:
                continue
        if len(nums) < 6:
            continue
        ast, stl, blk, tov, pf, pts = nums[-6:]
        pid_m = re.search(r"/players/[a-z]/([^/.]+)\.html", cells[1])
        player_id = pid_m.group(1) if pid_m else f"p{rk}"

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

        rows.append(
            {
                "player_id": player_id,
                "player_name": pname,
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
                "season": "2025-26",
            }
        )
    return rows


def load_fa_names(path: Path) -> set[str]:
    if not path.exists():
        return set()
    out = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        out.add(line)
    return out


def parse_spotrac_names(path: Path) -> set[str]:
    if not path.exists():
        return set()
    names = set()
    text = path.read_text(encoding="utf-8", errors="replace")
    for m in re.finditer(r"\[([^\]]+)\]\(https://www\.spotrac\.com/nba/player/", text):
        names.add(m.group(1))
    return names


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def main() -> int:
    ap = argparse.ArgumentParser(description="Scrape NBA team/player CSVs")
    ap.add_argument("--no-network", action="store_true", help="Only use local sources/")
    ap.add_argument(
        "--all-players",
        action="store_true",
        help="从本地 br_per_game_markdown 解析时包含低出场球员（pool=roster）",
    )
    args = ap.parse_args()

    fa_path = DATA / "fa_candidates.txt"
    fa_names = load_fa_names(fa_path)
    spotrac = SOURCES / "spotrac_free_agents.md"
    fa_names |= parse_spotrac_names(spotrac)

    teams: list[dict] = []
    league_url = f"{BASE}/leagues/NBA_{SEASON_SUFFIX}.html"

    if not args.no_network:
        print(f"Fetching {league_url} …")
        html = fetch_html(league_url)
        if html:
            soup = BeautifulSoup(html, "lxml")
            teams = parse_teams_from_soup(soup)
            print(f"Parsed {len(teams)} teams from live HTML.")
        time.sleep(0.6)

    if len(teams) < 25:
        print("Using fallback: data/sources/br_league_summary.md")
        md_path = SOURCES / "br_league_summary.md"
        if not md_path.exists():
            print("Missing fallback file:", md_path, file=sys.stderr)
            return 1
        teams = parse_teams_from_markdown(md_path.read_text(encoding="utf-8"))
        print(f"Parsed {len(teams)} teams from markdown snapshot.")

    team_fields = [
        "team_abbr",
        "team_name",
        "season",
        "wins",
        "losses",
        "ortg",
        "drtg",
        "nrtg",
        "pace",
        "pts_for",
        "pts_against",
        "fg3_pct",
        "reb",
        "ast",
        "stl",
        "blk",
        "tov",
        "ts_pct",
        "tov_pct_off",
        "orb_pct",
    ]
    write_csv(DATA_CURRENT / "teams.csv", team_fields, teams)

    ppath = SOURCES / "br_per_game_markdown.txt"
    if not ppath.exists():
        print("Missing", ppath, file=sys.stderr)
        return 1
    players = parse_players_md(ppath, fa_names, include_roster=args.all_players)
    players = dedupe_players_current_stint(players)
    print(f"Parsed {len(players)} player rows.")

    player_fields = [
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
    write_csv(DATA_CURRENT / "players.csv", player_fields, players)

    print("Wrote", DATA_CURRENT / "teams.csv")
    print("Wrote", DATA_CURRENT / "players.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
