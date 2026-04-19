#!/usr/bin/env python3
"""
读取 data/history/team_seasons.csv、player_league_style.csv、team_style_8d.csv，
生成 ECharts 用 JSON：data/history/echarts_history.json（含 teams / teams8d / league 等）。

前端 index.html 历史 Tab fetch 该文件；无需再跑爬虫。
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from pathlib import Path


def scrub_json(obj):
    """JSON 标准不允许 NaN；转成 null。所有有限浮点数保留两位小数。"""
    if isinstance(obj, dict):
        return {k: scrub_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [scrub_json(v) for v in obj]
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return round(obj, 2)
    return obj

ROOT = Path(__file__).resolve().parents[1]
HIST = ROOT / "data" / "history"


def load_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        import pandas as pd

        return pd.read_csv(path).to_dict("records")
    except ImportError:
        import csv

        with path.open(newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))


def _float_or_none(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(x) or math.isinf(x):
        return None
    return x


def main() -> int:
    teams = load_csv(HIST / "team_seasons.csv")
    styles = load_csv(HIST / "player_league_style.csv")

    if not teams:
        print("缺少", HIST / "team_seasons.csv", "请先运行 scripts/fetch_history_nba_stats.py", file=sys.stderr)
        return 1

    seasons_sorted = sorted({r["SEASON"] for r in teams})

    # 联盟场均：按赛季对所有球队求平均
    league_by_s: dict[str, dict[str, float]] = {}
    for s in seasons_sorted:
        rows = [r for r in teams if r["SEASON"] == s]
        if not rows:
            continue

        def avg(key: str) -> float:
            vals = [float(r[key]) for r in rows if r.get(key) not in (None, "", "nan")]
            return sum(vals) / len(vals) if vals else 0.0

        league_by_s[s] = {
            "off_rating": avg("OFF_RATING"),
            "def_rating": avg("DEF_RATING"),
            "net_rating": avg("NET_RATING"),
            "pace": avg("PACE"),
            "fg3_pct": avg("FG3_PCT"),
            "fg3a": avg("FG3A"),
            "ts_pct": avg("TS_PCT"),
            "pts": avg("PTS"),
            "oreb": avg("OREB"),
            "dreb": avg("DREB"),
            "blk": avg("BLK"),
            "reb_pct": avg("REB_PCT"),
            "reb": avg("REB"),
            "stl": avg("STL"),
            "tov": avg("TOV"),
        }

    # 每队按赛季序列（前端八张单维卡片 + 联盟对比）；优先 TEAM_ABBREVIATION
    by_key: dict[str, dict[str, list]] = defaultdict(
        lambda: {
            "seasons": [],
            "off_rating": [],
            "def_rating": [],
            "pace": [],
            "fg3_pct": [],
            "reb_pct": [],
            "rpg": [],
            "stl": [],
            "blk": [],
            "tov": [],
            "label": "",
        }
    )
    for r in teams:
        label = r.get("TEAM_ABBREVIATION") or r.get("TEAM_NAME") or str(r.get("TEAM_ID"))
        key = str(r.get("TEAM_ABBREVIATION") or r.get("TEAM_ID"))
        by_key[key]["label"] = label if isinstance(label, str) else key
        by_key[key]["seasons"].append(r["SEASON"])
        for fld, k in [
            ("OFF_RATING", "off_rating"),
            ("DEF_RATING", "def_rating"),
            ("PACE", "pace"),
            ("FG3_PCT", "fg3_pct"),
            ("REB_PCT", "reb_pct"),
            ("REB", "rpg"),
            ("STL", "stl"),
            ("BLK", "blk"),
            ("TOV", "tov"),
        ]:
            try:
                by_key[key][k].append(float(r[fld]))
            except (KeyError, TypeError, ValueError):
                by_key[key][k].append(None)

    team_series = {}
    for key, d in by_key.items():
        order = sorted(
            zip(
                d["seasons"],
                d["off_rating"],
                d["def_rating"],
                d["pace"],
                d["fg3_pct"],
                d["reb_pct"],
                d["rpg"],
                d["stl"],
                d["blk"],
                d["tov"],
            ),
            key=lambda x: x[0],
        )
        if not order:
            continue
        team_series[key] = {
            "label": d.get("label") or key,
            "seasons": [o[0] for o in order],
            "off_rating": [o[1] for o in order],
            "def_rating": [o[2] for o in order],
            "pace": [o[3] for o in order],
            "fg3_pct": [o[4] for o in order],
            "reb_pct": [o[5] for o in order],
            "rpg": [o[6] for o in order],
            "stl": [o[7] for o in order],
            "blk": [o[8] for o in order],
            "tov": [o[9] for o in order],
        }

    # 与 team_series 相同的 key：从 team_style_8d + team_seasons 补全缩写
    def norm_tid(v) -> str:
        try:
            return str(int(float(v)))
        except (TypeError, ValueError):
            return str(v or "")

    season_tid_to_key: dict[tuple[str, str], str] = {}
    for r in teams:
        tid = norm_tid(r.get("TEAM_ID"))
        se = r.get("SEASON")
        if not tid or not se:
            continue
        abbr = (r.get("TEAM_ABBREVIATION") or "").strip()
        season_tid_to_key[(se, tid)] = abbr if abbr else tid

    teams_8d: dict[str, list[dict]] = defaultdict(list)
    style8_path = HIST / "team_style_8d.csv"
    if style8_path.exists():
        for r in load_csv(style8_path):
            se = r.get("season")
            tid = norm_tid(r.get("team_id"))
            if not se or not tid:
                continue
            key = season_tid_to_key.get((se, tid), tid)
            row = {
                "season": se,
                "team_id": tid,
                "team_name": r.get("team_name") or "",
                "win_pct": _float_or_none(r.get("win_pct")),
                "off_rating": _float_or_none(r.get("off_rating")),
                "def_rating": _float_or_none(r.get("def_rating")),
                "pace": _float_or_none(r.get("pace")),
                "fg3_pct": _float_or_none(r.get("fg3_pct")),
                "fg3a": _float_or_none(r.get("fg3a")),
                "reb_pct": _float_or_none(r.get("reb_pct")),
                "rpg": _float_or_none(r.get("rpg")),
                "stl": _float_or_none(r.get("stl")),
                "blk": _float_or_none(r.get("blk")),
                "stl_blk": _float_or_none(r.get("stl_blk")),
            }
            teams_8d[key].append(row)

    for k in teams_8d:
        teams_8d[k].sort(key=lambda x: x["season"])

    out = {
        "meta": {
            "seasons": seasons_sorted,
            "description": "NBA 历史数据聚合，供 ECharts 使用；核心补强仍用 data/current/",
        },
        "league": {s: league_by_s[s] for s in seasons_sorted if s in league_by_s},
        "player_style_timeline": styles,
        "teams": team_series,
        "teams8d": {k: teams_8d[k] for k in sorted(teams_8d.keys())},
    }

    outp = HIST / "echarts_history.json"
    outp.parent.mkdir(parents=True, exist_ok=True)
    with outp.open("w", encoding="utf-8") as f:
        json.dump(scrub_json(out), f, ensure_ascii=False, indent=2, allow_nan=False)
    print("已写入", outp)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
