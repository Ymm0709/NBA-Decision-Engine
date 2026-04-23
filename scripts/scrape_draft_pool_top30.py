#!/usr/bin/env python3
"""
抓取 ESPN Draft Big Board（Top 100）新秀池，生成 data/current/draft_pool.csv

目标：
- 重点保证场均：PTS / REB / AST（用于前端 Draft 适配度分析）
- 其他字段可以缺省，但仍写入 CSV（供算法使用，不强制前端展示）

数据源策略（可扩展）：
- Big Board 排名：ESPN Draft Big Board story（Top 100 prospects）
- 头像：ESPN 球员页 meta(og:image) 优先
- 场均数据：优先从球员页的“PPG/RPG/APG”模块解析；再回退到全文正则抽取

用法：
  python3 -m pip install -r requirements.txt
  python3 scripts/scrape_draft_pool_top30.py --top 100
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "data" / "current" / "draft_pool.csv"
ESPN_BIG_BOARD_URL = (
    "https://www.espn.com/nba/story/_/id/46886245/"
    "2026-nba-draft-big-board-rankings-top-100-prospects-players"
)


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _safe_float(x: str, default: float = 0.0) -> float:
    try:
        return float(str(x).strip())
    except Exception:
        return default


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        }
    )
    return s


def _unique_keep_order(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in items:
        if not x:
            continue
        if x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out


def fetch_big_board(session: requests.Session, top: int) -> list[dict]:
    """
    从 ESPN Draft Big Board story 页提取 prospect 列表。

    主要信号：
    - 球员链接：/mens-college-basketball/player/_/id/<id>/...
    - 同行文案通常包含："<Name>, <POS>, <SCHOOL>"
    """
    resp = session.get(ESPN_BIG_BOARD_URL, timeout=25)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")

    out: list[dict] = []

    # 1) 先定位正文容器，避免抓到侧栏/推荐区链接
    container = soup.select_one(".article-body") or soup

    # 2) 抓取正文内所有 “player/_/id/” 链接（按出现顺序）
    links = container.select("a[href*='/player/_/id/']")
    seen_urls: set[str] = set()

    # 3) 对每个 <a>（按出现顺序），尽量用其周边文本解析 “Name, POS, SCHOOL”
    #    注：该 ESPN story 页在 HTML 中不稳定地携带 “POS, SCHOOL”，所以这里更多依赖球员页补全。
    rank = 0
    for a in links:
        if rank >= top:
            break
        href = urljoin("https://www.espn.com", (a.get("href", "") or "").strip())
        if not href or href in seen_urls:
            continue

        # 过滤明显的非“排名条目”链接：用近邻文本是否包含“上一期排名/赛季场均”来判断
        parent = a.parent
        near = _clean(parent.get_text(" ", strip=True)) if parent else ""
        if parent and parent.parent and len(near) < 40:
            near = _clean(parent.parent.get_text(" ", strip=True))
        is_rank_entry = bool(
            re.search(r"\bPrevious ranking\b", near, flags=re.IGNORECASE)
            or re.search(r"\bpoints,\s*\d", near, flags=re.IGNORECASE)
            or re.search(r"\brebounds,\s*\d", near, flags=re.IGNORECASE)
            or re.search(r"\bassists?\b", near, flags=re.IGNORECASE)
        )
        if not is_rank_entry and "/mens-college-basketball/player/_/id/" not in href:
            # 非 college 球员页链接，如果看起来不像排名条目，直接丢弃（避免抓到 NBA 正文引用/推荐）
            continue

        seen_urls.add(href)

        name = _clean(a.get_text(" ", strip=True))
        # 上下文：优先父节点；不够再取祖父节点，尽量拿到同一行的 “, SF, BYU”
        ctx = _clean(parent.get_text(" ", strip=True)) if parent else name
        if name and ("," not in ctx or len(ctx) < len(name) + 6) and parent and parent.parent:
            ctx = _clean(parent.parent.get_text(" ", strip=True))

        pos = "--"
        school = ""
        if name:
            # position 允许：G/F、F/C 等
            mm = re.search(
                rf"{re.escape(name)}\s*,\s*([A-Z]{{1,2}}(?:/[A-Z]{{1,2}})?)\s*,\s*([^|•]+)",
                ctx,
                flags=re.IGNORECASE,
            )
            if mm:
                pos = _clean(mm.group(1)).upper()
                school = _clean(mm.group(2))

        if not name:
            slug = href.rstrip("/").split("/")[-1]
            name = _clean(slug.replace("-", " ").title())

        rank += 1
        out.append(
            {
                "rank": rank,
                "name": name,
                "position": pos or "--",
                "school": school,
                "source_url": href,
            }
        )

    return out


def _pick_stat_from_text(blob: str, label: str) -> float:
    # Example: "25.5 PPG" / "6.8 RPG" / "3.7 APG"
    mm = re.search(rf"(\d+(?:\.\d+)?)\s*{re.escape(label)}\b", blob, flags=re.IGNORECASE)
    return _safe_float(mm.group(1), 0.0) if mm else 0.0


def _pick_stat_any_order(blob: str, label: str) -> float:
    """
    ESPN 常见两种格式：
    - "12.3 PPG"
    - "PPG 12.3"
    """
    v = _pick_stat_from_text(blob, label)
    if v:
        return v
    mm = re.search(
        rf"\b{re.escape(label)}\b\s*(\d+(?:\.\d+)?)",
        blob,
        flags=re.IGNORECASE,
    )
    return _safe_float(mm.group(1), 0.0) if mm else 0.0


def _parse_espn_player_stats(soup: BeautifulSoup) -> dict[str, float]:
    """
    ESPN 球员页存在多种结构，这里按“结构化优先、全文兜底”解析 PPG/RPG/APG。
    """
    # 1) ESPN 球员页常见：顶部 “season stats” 模块直接给 PTS/REB/AST 的 Per Game
    def _stat_value_by_aria(aria_label: str) -> float:
        lab = soup.find(attrs={"aria-label": re.compile(rf"^{re.escape(aria_label)}$", re.I)})
        if not lab:
            return 0.0
        # 结构通常：Label div -> 同级/父级内有 Value div
        container = lab.parent
        if container:
            val = container.find(class_=re.compile(r"StatBlockInner__Value"))
            if val:
                return _safe_float(_clean(val.get_text(" ", strip=True)), 0.0)
        # 兜底：从附近文本抓数字
        near = _clean((container.get_text(" ", strip=True) if container else lab.get_text(" ", strip=True)))
        mm = re.search(r"(\d+(?:\.\d+)?)", near)
        return _safe_float(mm.group(1), 0.0) if mm else 0.0

    pts = _stat_value_by_aria("Points Per Game")
    reb = _stat_value_by_aria("Rebounds Per Game")
    ast = _stat_value_by_aria("Assists Per Game")

    # 2) 回退：如果没有 StatBlock，用 PPG/RPG/APG 文案抽取
    if pts == 0.0 and reb == 0.0 and ast == 0.0:
        candidates = soup.find_all(
            string=re.compile(r"\bPPG\b|\bRPG\b|\bAPG\b|\bPTS\b|\bREB\b|\bAST\b", flags=re.IGNORECASE)
        )
        joined = _clean(" ".join(_clean(c) for c in candidates[:80]))
        pts = _pick_stat_any_order(joined, "PPG") or _pick_stat_any_order(joined, "PTS")
        reb = _pick_stat_any_order(joined, "RPG") or _pick_stat_any_order(joined, "REB")
        ast = _pick_stat_any_order(joined, "APG") or _pick_stat_any_order(joined, "AST")

    # 3) 再兜底到全页文本
    if pts == 0.0 and reb == 0.0 and ast == 0.0:
        text = _clean(soup.get_text(" ", strip=True))
        pts = _pick_stat_any_order(text, "PPG") or _pick_stat_any_order(text, "PTS")
        reb = _pick_stat_any_order(text, "RPG") or _pick_stat_any_order(text, "REB")
        ast = _pick_stat_any_order(text, "APG") or _pick_stat_any_order(text, "AST")

    return {"pts": pts, "reb": reb, "ast": ast}


def fetch_profile(session: requests.Session, player_url: str) -> dict:
    resp = session.get(player_url, timeout=25)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")

    stats = _parse_espn_player_stats(soup)

    avatar = ""
    og = soup.select_one("meta[property='og:image']")
    if og and og.get("content"):
        avatar = og.get("content", "").strip()
    if avatar:
        avatar = urljoin(player_url, avatar)

    # position / school：优先从 meta title 中解析（常见："{Name} - {School} {Mascot} {Position} - ESPN"）
    meta_title = ""
    mt = soup.select_one("meta[name='twitter:title']")
    if mt and mt.get("content"):
        meta_title = str(mt.get("content") or "").strip()
    school = ""
    position = ""
    if meta_title:
        # e.g. "Cameron Boozer - Duke Blue Devils Forward - ESPN"
        mm = re.search(r"^.+?\s*-\s*(.+?)\s*-\s*ESPN\s*$", meta_title)
        if mm:
            mid = _clean(mm.group(1))
            # 尾部词通常是位置（Forward/Guard/Center），其余视作 school/team
            parts = mid.split(" ")
            if len(parts) >= 2:
                pos_word = parts[-1]
                team = _clean(" ".join(parts[:-1]))
                if pos_word.lower() in ("forward", "guard", "center"):
                    school = team
                    position = pos_word.title()

    # 兜底：部分页面将头像放在 JSON-LD 里
    if not avatar:
        for tag in soup.select("script[type='application/ld+json']"):
            try:
                data = json.loads(tag.get_text(strip=True) or "{}")
            except Exception:
                continue
            if isinstance(data, dict) and data.get("image"):
                avatar = str(data.get("image") or "").strip()
                break

    return {"avatar_url": avatar, "school": school, "position": position, **stats}


def write_csv(path: Path, rows: Iterable[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "id",
        "rank",
        "name",
        "position",
        "school",
        "pts",
        "reb",
        "ast",
        "imputed",
        # 预留字段（不强制前端展示，但用于适配度/扩展）
        "potential",
        "risk",
        "notes",
        "avatar_url",
        "source_url",
    ]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def to_id(name: str, rank: int) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return slug or f"prospect-{rank}"


def potential_and_risk(rank: int, pts: float, ast: float, reb: float) -> tuple[float, str]:
    # 简化：只基于 rank + 三项产量做一个稳定的潜力刻画（供 fit 分数放大/缩小）
    base = 1.22 - (rank - 1) * 0.0024
    production_boost = min(0.06, (pts / 45.0) + (ast / 32.0) + (reb / 34.0))
    potential = max(1.02, min(1.28, base + production_boost))
    if rank <= 12:
        risk = "High Ceiling"
    elif rank <= 30:
        risk = "Medium Risk"
    else:
        risk = "NBA Ready"
    return round(potential, 2), risk


def pos_group(position: str) -> str:
    p = (position or "").upper()
    if p in ("FORWARD", "F"):
        p = "F"
    if p in ("GUARD", "G"):
        p = "G"
    if p in ("CENTER", "C"):
        p = "C"
    if "C" in p:
        return "center"
    if "PF" in p or "SF" in p or ("F" in p and "G" not in p):
        return "forward"
    return "guard"


def _pos_abbr(position: str) -> str:
    p = _clean(position).upper()
    if not p:
        return "--"
    if p in ("FORWARD", "F"):
        return "F"
    if p in ("GUARD", "G"):
        return "G"
    if p in ("CENTER", "C"):
        return "C"
    return p


def impute_box(position: str) -> tuple[float, float, float]:
    """
    当数据源没有提供任何场均三项时，给适配度模型一个“非零的保守默认值”。
    这些值不是展示用，只是避免算法被 0 值污染。
    """
    g = pos_group(position)
    if g == "guard":
        return 14.0, 3.2, 4.8
    if g == "center":
        return 13.0, 8.6, 1.8
    return 15.0, 6.2, 2.8


def main() -> int:
    ap = argparse.ArgumentParser(description="抓取 ESPN Draft Big Board（Top N）到 data/current/draft_pool.csv")
    ap.add_argument("--top", type=int, default=100, help="抓取前 N 名（默认 100）")
    ap.add_argument("--sleep", type=float, default=0.35, help="每次请求间隔秒数（默认 0.35）")
    ap.add_argument("--output", type=Path, default=DEFAULT_OUT, help="输出 CSV 路径")
    args = ap.parse_args()

    sess = _session()
    board = fetch_big_board(sess, args.top)
    if not board:
        print("未抓到 Big Board 数据，可能是页面结构变化。", file=sys.stderr)
        return 1

    rows = []
    for i, p in enumerate(board, start=1):
        try:
            prof = fetch_profile(sess, p["source_url"])
        except Exception as e:
            print(f"[warn] profile failed: {p['name']} -> {e}", file=sys.stderr)
            prof = {"avatar_url": "", "pts": 0.0, "reb": 0.0, "ast": 0.0, "school": "", "position": ""}

        pts = float(prof.get("pts", 0.0) or 0.0)
        reb = float(prof.get("reb", 0.0) or 0.0)
        ast = float(prof.get("ast", 0.0) or 0.0)
        imputed = 0
        if pts == 0.0 and reb == 0.0 and ast == 0.0:
            pts, reb, ast = impute_box(p.get("position", ""))
            imputed = 1
        potential, risk = potential_and_risk(p["rank"], pts, ast, reb)

        p_school = (p.get("school", "") or "").strip()
        p_pos = (p.get("position", "") or "").strip()
        if p_pos == "--":
            p_pos = ""
        if p_school == "--":
            p_school = ""
        school = p_school or (prof.get("school", "") or "").strip()
        position = p_pos or (prof.get("position", "") or "").strip()
        position = _pos_abbr(position)

        notes = _clean(
            f"{p.get('school','')} · 由 ESPN Big Board + 球员页解析"
            + ("（三项缺失已按位置估算）" if imputed else "")
        )
        rows.append(
            {
                "id": to_id(p["name"], p["rank"]),
                "rank": p["rank"],
                "name": p["name"],
                "position": position,
                "school": school,
                "pts": f"{pts:.2f}",
                "reb": f"{reb:.2f}",
                "ast": f"{ast:.2f}",
                "imputed": str(imputed),
                "potential": f"{potential:.2f}",
                "risk": risk,
                "notes": notes,
                "avatar_url": prof.get("avatar_url", ""),
                "source_url": p["source_url"],
            }
        )
        if i % 10 == 0 or i == len(board):
            print(f"[{i}/{len(board)}] {p['name']}")
        time.sleep(max(0.0, args.sleep))

    write_csv(args.output, rows)
    print(f"done: {args.output} ({len(rows)} rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

