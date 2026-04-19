/**
 * NBA 球队短板分析 + 自由球员/角色球员推荐（纯前端，读取 ../data/*.csv）
 */

const LEAGUE_KEYS = ["ortg", "drtg", "fg3_pct", "reb", "ast", "tov", "stl", "blk"];
const TEAM_LOGO_IDS = {
  ATL: 1610612737,
  BOS: 1610612738,
  BKN: 1610612751,
  CHA: 1610612766,
  CHI: 1610612741,
  CLE: 1610612739,
  DAL: 1610612742,
  DEN: 1610612743,
  DET: 1610612765,
  GSW: 1610612744,
  HOU: 1610612745,
  IND: 1610612754,
  LAC: 1610612746,
  LAL: 1610612747,
  MEM: 1610612763,
  MIA: 1610612748,
  MIL: 1610612749,
  MIN: 1610612750,
  NOP: 1610612740,
  NYK: 1610612752,
  OKC: 1610612760,
  ORL: 1610612753,
  PHI: 1610612755,
  PHX: 1610612756,
  POR: 1610612757,
  SAC: 1610612758,
  SAS: 1610612759,
  TOR: 1610612761,
  UTA: 1610612762,
  WAS: 1610612764,
};

const TEAM_LOGO_ALIASES = {
  BRK: "BKN",
  BKN: "BKN",
  PHO: "PHX",
  PHX: "PHX",
  CHO: "CHA",
  CHA: "CHA",
};

function resolveLogoId(abbr) {
  const norm = TEAM_LOGO_ALIASES[abbr] || abbr;
  return TEAM_LOGO_IDS[norm] || null;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const vals = [];
    let cur = "";
    let q = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') {
        q = !q;
        continue;
      }
      if (!q && c === ",") {
        vals.push(cur.trim());
        cur = "";
        continue;
      }
      cur += c;
    }
    vals.push(cur.trim());
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = vals[idx] ?? "";
    });
    rows.push(obj);
  }
  return rows;
}

const AGGREGATE_TEAM_ABBR = new Set(["TOT", "2TM", "3TM", "4TM"]);

/** 多队/交易：BR 表 tbody 顺序中最后一支真实球队 stint 视为当季当下所在队 */
function isNamedTeamStint(teamAbbr) {
  const t = String(teamAbbr ?? "")
    .trim()
    .toUpperCase();
  if (!t) return false;
  if (AGGREGATE_TEAM_ABBR.has(t)) return false;
  return true;
}

function dedupePlayersCurrentStint(players) {
  const byId = new Map();
  for (const p of players) {
    const id = String(p.player_id ?? "").trim();
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(p);
  }
  const out = [];
  const emitted = new Set();
  for (const p of players) {
    const id = String(p.player_id ?? "").trim();
    if (!id) {
      out.push(p);
      continue;
    }
    if (emitted.has(id)) continue;
    emitted.add(id);
    const group = byId.get(id) ?? [p];
    const stints = group.filter((r) => isNamedTeamStint(r.team_abbr));
    out.push(stints.length === 0 ? group[0] : stints[stints.length - 1]);
  }
  return out;
}

function num(x, fallback = 0) {
  const v = parseFloat(x);
  return Number.isFinite(v) ? v : fallback;
}

/** 展示用：统一两位小数 */
function fmt2(x) {
  return num(x).toFixed(1);
}

function leagueAvg(teams, key) {
  const s = teams.reduce((a, t) => a + num(t[key]), 0);
  return s / teams.length;
}

function analyzeTeam(team, avgs) {
  const weaknesses = [];
  const tags = [];

  if (num(team.ortg) < avgs.ortg - 1.5) {
    weaknesses.push({
      id: "offense",
      label: "进攻效率偏低",
      detail: `百回合得分 ORtg ${fmt2(team.ortg)}，联盟均值 ${fmt2(avgs.ortg)}，低约 ${fmt2(avgs.ortg - num(team.ortg))}。`,
    });
    tags.push({ text: "进攻开发 / 终结", warn: true });
  }

  if (num(team.drtg) > avgs.drtg + 1.5) {
    weaknesses.push({
      id: "defense",
      label: "防守效率偏差",
      detail: `百回合失分 DRtg ${fmt2(team.drtg)}，联盟均值 ${fmt2(avgs.drtg)}，高约 ${fmt2(num(team.drtg) - avgs.drtg)}。`,
    });
    tags.push({ text: "外线/换防 / 护筐", warn: true });
  }

  if (num(team.fg3_pct) < avgs.fg3_pct - 0.015) {
    weaknesses.push({
      id: "shooting",
      label: "三分命中率不足",
      detail: `球队三分命中率 ${fmt2(num(team.fg3_pct) * 100)}%，联盟均值 ${fmt2(avgs.fg3_pct * 100)}%。`,
    });
    tags.push({ text: "空间 & 接球投", warn: false });
  }

  if (num(team.reb) < avgs.reb - 1.5) {
    weaknesses.push({
      id: "glass",
      label: "篮板保护偏弱",
      detail: `场均篮板 ${fmt2(team.reb)}，联盟均值 ${fmt2(avgs.reb)}。`,
    });
    tags.push({ text: "前场板 / 卡位", warn: false });
  }

  if (num(team.tov) > avgs.tov + 1.0) {
    weaknesses.push({
      id: "turnovers",
      label: "失误偏多",
      detail: `场均失误 ${fmt2(team.tov)}，联盟均值 ${fmt2(avgs.tov)}。`,
    });
    tags.push({ text: "副攻 / 稳健处理球", warn: true });
  }

  if (num(team.stl) + num(team.blk) < avgs.stl + avgs.blk - 2) {
    const evT = num(team.stl) + num(team.blk);
    const evA = avgs.stl + avgs.blk;
    weaknesses.push({
      id: "events",
      label: "防守破坏事件不足",
      detail: `抢断+盖帽 ${fmt2(evT)}，联盟均值 ${fmt2(evA)}。`,
    });
    tags.push({ text: "侧翼防守 / 协防", warn: false });
  }

  // 若没有明显短板，不展示“相对均衡/深度&对位”等默认文案
  if (weaknesses.length === 0) return { weaknesses: [], tags: [] };

  return { weaknesses, tags };
}

function clamp01(x) {
  return clamp(x, 0, 1);
}

function computeTeamNeeds(team, avgs) {
  // 需求强度（0–1）。不依赖阈值：每支球队都会有一组 needs，从而权重必然不同。
  // 逻辑：比联盟差得越多 → need 越大；用 soft clamp 做平滑。
  const fg3Gap = avgs.fg3_pct - num(team.fg3_pct); // 越大越缺三分
  const rebGap = avgs.reb - num(team.reb); // 越大越缺篮板（用场均篮板作 proxy）
  const defGap = num(team.drtg) - avgs.drtg; // 越大越防守差（DRtg 越低越好）
  const evGap = (avgs.stl + avgs.blk) - (num(team.stl) + num(team.blk)); // 越大越缺破坏
  const astGap = avgs.ast - num(team.ast); // 越大越缺组织（粗略 proxy）
  const tovGap = num(team.tov) - avgs.tov; // 越大越失误偏多

  return {
    shooting: clamp01(fg3Gap / 0.03), // 约 3 个百分点差距打满
    rebounding: clamp01(rebGap / 4.0), // 约 4 个篮板差距打满
    defense: clamp01((defGap / 4.0) * 0.65 + (evGap / 3.0) * 0.35),
    playmaking: clamp01(astGap / 4.0),
    turnover_penalty: clamp01(tovGap / 3.0),
  };
}

function buildNeedWeightsFromNeeds(needs) {
  // needs → 权重（正向项归一化；失误为扣分强度）
  const base = 0.08; // 防止某维为 0 导致完全忽略
  const pos = {
    shooting: base + (needs.shooting ?? 0),
    rebounding: base + (needs.rebounding ?? 0),
    defense: base + (needs.defense ?? 0),
    playmaking: base + (needs.playmaking ?? 0),
  };
  const posSum = pos.shooting + pos.rebounding + pos.defense + pos.playmaking;
  const w = {
    shooting: pos.shooting / posSum,
    rebounding: pos.rebounding / posSum,
    defense: pos.defense / posSum,
    playmaking: pos.playmaking / posSum,
    turnover_penalty: 0.12 + 0.25 * clamp01(needs.turnover_penalty ?? 0),
  };
  return w;
}

function buildPlayerRanges(players) {
  const init = () => ({ min: Infinity, max: -Infinity });
  const ranges = {
    fg3_pct: init(),
    reb: init(),
    ast: init(),
    def_events: init(), // stl + blk
    tov: init(),
  };
  for (const p of players) {
    const tp = num(p.fg3_pct);
    const r = num(p.reb);
    const a = num(p.ast);
    const de = num(p.stl) + num(p.blk);
    const t = num(p.tov);
    for (const [k, v] of [
      ["fg3_pct", tp],
      ["reb", r],
      ["ast", a],
      ["def_events", de],
      ["tov", t],
    ]) {
      if (!Number.isFinite(v)) continue;
      ranges[k].min = Math.min(ranges[k].min, v);
      ranges[k].max = Math.max(ranges[k].max, v);
    }
  }
  return ranges;
}

function normVal(v, { min, max }) {
  if (!Number.isFinite(v) || !Number.isFinite(min) || !Number.isFinite(max)) return 0;
  if (max <= min) return 0.5;
  return clamp01((v - min) / (max - min));
}

function scorePlayer(p, team, weights, ranges) {
  const reasons = [];

  const tp = num(p.fg3_pct);
  const r = num(p.reb);
  const ast = num(p.ast);
  const def = num(p.stl) + num(p.blk);
  const tov = num(p.tov);

  const nTp = normVal(tp, ranges.fg3_pct);
  const nR = normVal(r, ranges.reb);
  const nAst = normVal(ast, ranges.ast);
  const nDef = normVal(def, ranges.def_events);
  const nTov = normVal(tov, ranges.tov);

  const cShoot = weights.shooting * nTp;
  const cReb = weights.rebounding * nR;
  const cDef = weights.defense * nDef;
  const cPlay = weights.playmaking * nAst;
  const cTov = weights.turnover_penalty * nTov;

  // 0–100 方便展示；扣分项直接减
  let score = (cShoot + cReb + cDef + cPlay - cTov) * 100;

  // 场景标签（不再用常数“把分数顶到 1.20”，只做轻微偏置）
  if (p.pool === "free_agent") {
    score += 2.0;
    reasons.push("标记为自由球员池，符合休赛期引援场景。");
  } else if (p.pool === "role") {
    score += 1.0;
    reasons.push("角色球员定位，补强成本与角色弹性更友好。");
  }

  if (p.team_abbr && p.team_abbr === team.team_abbr) {
    score -= 8;
    reasons.push("（已在本队：适配分已做降权，仅供参考）");
  }

  // 最终展示分数做夹取，方便“满分”指示
  score = clamp(score, 0, 100);

  // 可解释的贡献分解（展示原始值 + 贡献）
  const parts = [
    { k: "投射", raw: `${fmt2(tp * 100)}%`, v: cShoot },
    { k: "篮板", raw: fmt2(r), v: cReb },
    { k: "防守事件", raw: `${fmt2(num(p.stl))}+${fmt2(num(p.blk))}`, v: cDef },
    { k: "组织", raw: fmt2(ast), v: cPlay },
    { k: "失误扣分", raw: fmt2(tov), v: -cTov },
  ]
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, 4);

  reasons.push(
    `贡献分解（归一化×权重）：${parts
      .map((x) => `${x.k} ${x.raw} → ${x.v >= 0 ? "+" : ""}${fmt2(x.v * 100)}`)
      .join("；")}`
  );

  // 一条“人话”总结：取贡献最高项
  const top = parts[0];
  if (top) {
    const mapping = {
      投射: `三分命中率 ${fmt2(tp * 100)}%，对空间有帮助。`,
      篮板: `篮板 ${fmt2(r)}，能提升篮板保护与二次进攻。`,
      防守事件: `抢断+盖帽 ${fmt2(def)}，能提升防守破坏。`,
      组织: `助攻 ${fmt2(ast)}，可补强持球与梳理。`,
    };
    if (mapping[top.k]) reasons.push(mapping[top.k]);
    if (top.k !== "失误扣分" && tov > 3.2) reasons.push(`失误 ${fmt2(tov)} 偏高，适配分已扣分。`);
  }

  return { score, reasons };
}

function needLabel(key) {
  const m = {
    shooting: "外线投射与空间",
    rebounding: "篮板保护",
    defense: "内外线防守",
    playmaking: "组织串联",
  };
  return m[key] || key;
}

function rankNeedKeys(needs) {
  return ["shooting", "rebounding", "defense", "playmaking"].sort((a, b) => num(needs[b]) - num(needs[a]));
}

function buildPlayerSummary(p, teamNeeds, avgs) {
  const reb = num(p.reb);
  const ast = num(p.ast);
  const fg3 = num(p.fg3_pct);
  const tov = num(p.tov);
  const defEvents = num(p.stl) + num(p.blk);
  const aReb = num(avgs.reb);
  const aAst = num(avgs.ast);
  const aFg3 = num(avgs.fg3_pct);
  const aDefEvents = num(avgs.stl) + num(avgs.blk);
  const aTov = num(avgs.tov);

  const strengths = [];
  if (reb >= aReb + 1.2) strengths.push("篮板");
  if (defEvents >= aDefEvents + 0.8) strengths.push("护框与破坏");
  if (fg3 >= aFg3 + 0.015) strengths.push("外线投射");
  if (ast >= aAst + 1.2) strengths.push("组织串联");
  if (strengths.length === 0) strengths.push("轮换稳定性");

  const topNeed = rankNeedKeys(teamNeeds)[0];
  const needText = needLabel(topNeed);
  const roleText = String(p.pos || "").includes("C") ? "轮换内线" : "轮换侧翼";
  const conclusion = `${strengths[0]}补强：优先改善${needText}，更适合作为${roleText}。`;

  const contributions = [];
  if (reb >= aReb + 0.8) {
    contributions.push(`✔ 篮板优势明显（${fmt2(reb)} RPG）→ 提升二次进攻与防守稳定性`);
  }
  if (defEvents >= aDefEvents + 0.4) {
    contributions.push(`✔ 护框/防守破坏可靠（抢断+盖帽 ${fmt2(defEvents)}）→ 缓解防线压力`);
  }
  if (fg3 >= aFg3 + 0.008) {
    contributions.push(`✔ 外线投射可用（三分 ${fmt2(fg3 * 100)}%）→ 拉开空间并改善进攻站位`);
  }
  if (ast >= aAst + 0.8) {
    contributions.push(`✔ 组织贡献积极（${fmt2(ast)} APG）→ 衔接阵地战与转换进攻`);
  }
  if (tov >= aTov + 0.5) {
    contributions.push(`⚠ 失误略高（${fmt2(tov)}）→ 可能影响进攻流畅性`);
  } else if (tov <= aTov - 0.3) {
    contributions.push(`✔ 处理球稳健（失误 ${fmt2(tov)}）→ 降低回合浪费风险`);
  }
  if (contributions.length === 0) {
    contributions.push("✔ 数据面较均衡 → 可在轮换中提供稳定的功能型支持");
  }

  const fit = [];
  const rankedNeeds = rankNeedKeys(teamNeeds).slice(0, 2);
  for (const needKey of rankedNeeds) {
    if (needKey === "rebounding") {
      fit.push(`该队当前篮板维度需求更高（${needLabel(needKey)}）→ 他可直接补强卡位与保护篮板`);
    } else if (needKey === "defense") {
      fit.push(`该队防守端需要增量（${needLabel(needKey)}）→ 其防守事件贡献有助于改善对抗与协防`);
    } else if (needKey === "shooting") {
      fit.push(`该队空间与投射需求明显（${needLabel(needKey)}）→ 其投射能力可提升进攻拉开度`);
    } else if (needKey === "playmaking") {
      fit.push(`该队组织串联存在缺口（${needLabel(needKey)}）→ 他能分担持球与推进压力`);
    }
  }
  if (!fit.length) {
    fit.push("该队短板相对分散 → 他更适合作为补位型轮换，提升阵容稳定性");
  }

  return { conclusion, contributions: contributions.slice(0, 3), fit: fit.slice(0, 3) };
}

function buildRoleTags(p, avgs) {
  const tags = [];
  const pos = String(p.pos || "").toUpperCase();
  const reb = num(p.reb);
  const ast = num(p.ast);
  const fg3 = num(p.fg3_pct);
  const tov = num(p.tov);
  const stl = num(p.stl);
  const blk = num(p.blk);
  const defEvents = stl + blk;
  const mpg = num(p.mpg);
  const aReb = num(avgs.reb);
  const aAst = num(avgs.ast);
  const aFg3 = num(avgs.fg3_pct);
  const aDefEvents = num(avgs.stl) + num(avgs.blk);

  const isBig = pos.includes("C") || (pos.includes("F") && !pos.includes("G"));
  const isGuard = pos.includes("G");

  if (isBig && (blk >= 1.0 || defEvents >= aDefEvents + 0.6 || reb >= aReb + 1.6)) {
    tags.push("🛡 内线防守核心");
  }
  if (isBig && mpg <= 28) {
    tags.push("🔄 轮换中锋");
  }
  if (isGuard && (ast >= aAst + 1.2 || (ast >= 4.5 && tov <= num(avgs.tov)))) {
    tags.push("🎯 第二持球点");
  }
  if (fg3 >= aFg3 + 0.012) {
    tags.push("🎯 空间型射手");
  }
  if (stl >= 1.2 || defEvents >= aDefEvents + 0.4) {
    tags.push("🧱 防守破坏者");
  }
  if (tov <= num(avgs.tov) - 0.35) {
    tags.push("📉 低球权球员");
  }
  if (reb >= aReb + 1.0 && fg3 >= aFg3 + 0.01) {
    tags.push("🧩 双向拼图");
  }

  if (tags.length === 0) {
    tags.push(isBig ? "🔄 轮换中锋" : "🧩 功能型角色球员");
  }
  return tags.slice(0, 4);
}

function recommend(team, players, weaknesses, avgs) {
  const candidates = players.filter((p) => p.pool === "free_agent" || p.pool === "role");
  const ranges = buildPlayerRanges(candidates);
  const needs = computeTeamNeeds(team, avgs);
  const weights = buildNeedWeightsFromNeeds(needs);
  const scored = candidates
    .map((p) => {
      const { score, reasons } = scorePlayer(p, team, weights, ranges);
      const summary = buildPlayerSummary(p, needs, avgs);
      const roleTags = buildRoleTags(p, avgs);
      return { p, score, reasons, summary, roleTags };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  return scored;
}

async function loadData() {
  const base = new URL("../data/current/", window.location.href);
  const loadPlayersText = async () => {
    const enriched = await fetch(new URL("players_with_jersey.csv", base)).catch(() => null);
    if (enriched && enriched.ok) return enriched.text();
    const plain = await fetch(new URL("players.csv", base));
    if (!plain.ok) throw new Error("无法加载 data/current/players.csv");
    return plain.text();
  };
  const [tText, pText, sText] = await Promise.all([
    fetch(new URL("teams.csv", base)).then((r) => {
      if (!r.ok) throw new Error("无法加载 data/current/teams.csv");
      return r.text();
    }),
    loadPlayersText(),
    fetch(new URL("standings.csv", base))
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => ""),
  ]);
  return {
    teams: parseCSV(tText),
    players: dedupePlayersCurrentStint(parseCSV(pText)),
    standings: sText ? parseCSV(sText) : [],
  };
}

function renderTeamOptions(teams, standings, onPick) {
  const picker = document.getElementById("current-team-picker");
  if (picker) picker.innerHTML = "";
  if (!picker) return;

  const byAbbr = new Map(teams.map((t) => [t.team_abbr, t]));
  const hasStandings = Array.isArray(standings) && standings.length >= 20;

  if (hasStandings) {
    picker.classList.add("is-standings");

    const mkConf = (conf, title) => {
      const wrap = document.createElement("div");
      wrap.className = "current-team-conf";
      wrap.innerHTML = `
        <div class="current-team-conf__title">${title}</div>
        <div class="current-team-table" role="table" aria-label="${title}排名">
          <div class="current-team-table__head" role="row">
            <span>#</span>
            <span>球队</span>
            <span>W</span>
            <span>L</span>
            <span>胜率</span>
            <span>GB</span>
          </div>
          <div class="current-team-conf__list"></div>
        </div>`;
      const list = wrap.querySelector(".current-team-conf__list");
      const rows = standings
        .filter((r) => String(r.conf || "").toUpperCase() === conf)
        .sort((a, b) => num(a.rank) - num(b.rank));
      for (const r of rows) {
        const abbr = String(r.team_abbr || "").trim();
        const t = byAbbr.get(abbr);
        if (!t) continue;
        const row = document.createElement("div");
        row.className = "current-team-row";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "current-team-pill";
        btn.dataset.team = t.team_abbr;
        const teamId = resolveLogoId(t.team_abbr);
        const w = String(r.wins || "").trim();
        const l = String(r.losses || "").trim();
        const wp = String(r.win_pct || "").trim();
        const gb = String(r.gb || "").trim();
        const gbText = gb && gb !== "—" ? gb : "-";
        btn.innerHTML = teamId
          ? `<span class="current-team-rank">${r.rank}</span>
             <span class="current-team-name"><img src="https://cdn.nba.com/logos/nba/${teamId}/global/L/logo.svg" alt="${t.team_name} logo" loading="lazy" />${t.team_name}</span>
             <span>${w}</span>
             <span>${l}</span>
             <span class="current-team-winpct">${wp}</span>
             <span>${gbText}</span>`
          : `<span class="current-team-rank">${r.rank}</span>
             <span class="current-team-name">${t.team_name}</span>
             <span>${w}</span>
             <span>${l}</span>
             <span class="current-team-winpct">${wp}</span>
             <span>${gbText}</span>`;
        btn.addEventListener("click", () => onPick(t.team_abbr));
        row.appendChild(btn);
        list.appendChild(row);
      }
      return wrap;
    };

    picker.appendChild(mkConf("E", "东部"));
    picker.appendChild(mkConf("W", "西部"));
    return;
  }

  // fallback：没有 standings 时按名称平铺
  picker.classList.remove("is-standings");
  const sorted = [...teams].sort((a, b) => a.team_name.localeCompare(b.team_name));
  for (const t of sorted) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "current-team-pill";
    btn.dataset.team = t.team_abbr;
    const teamId = resolveLogoId(t.team_abbr);
    btn.innerHTML = teamId
      ? `<img src="https://cdn.nba.com/logos/nba/${teamId}/global/L/logo.svg" alt="${t.team_name} logo" loading="lazy" /><span>${t.team_name}</span>`
      : `<span>${t.team_name}</span>`;
    btn.addEventListener("click", () => onPick(t.team_abbr));
    picker.appendChild(btn);
  }
}

function syncCurrentTeamPicker(activeAbbr) {
  const picker = document.getElementById("current-team-picker");
  if (!picker) return;
  picker.querySelectorAll(".current-team-pill").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.team === activeAbbr);
  });
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

/** 短板雷达：六维相对联盟（50=联盟均值，约 0–100，越高越好；映射已放大以便区分细微差距） */
let radarChart = null;
let chartEff = null;
let chartFour = null;
let chartDelta = null;
let currentChartsResizeBound = false;

function bindCurrentChartsResize() {
  if (currentChartsResizeBound) return;
  currentChartsResizeBound = true;
  window.addEventListener("resize", () => window.resizeCurrentCharts());
}

/** ECharts tooltip 定位：优先在指针右侧，避免贴左栏时溢出到屏幕外 */
function tooltipPositionSafe(point, _params, _dom, _rect, size) {
  const pad = 10;
  const cw = size.contentSize[0];
  const ch = size.contentSize[1];
  const vw = size.viewSize[0];
  const vh = size.viewSize[1];
  const px = point[0];
  const py = point[1];
  let x = px + 16;
  let y = py - ch / 2;
  if (x + cw > vw - pad) x = px - cw - 16;
  if (x < pad) x = pad;
  if (x + cw > vw - pad) x = Math.max(pad, vw - cw - pad);
  if (y < pad) y = pad;
  if (y + ch > vh - pad) y = Math.max(pad, vh - ch - pad);
  return [x, y];
}

const CURRENT_TOOLTIP_BASE = {
  confine: true,
  appendToBody: false,
  position: tooltipPositionSafe,
  // 让 tooltip 跟随主题色（浅色/深色都用 CSS 变量），避免出现“白底黑字”突兀弹窗
  extraCssText:
    "max-width:min(96vw,420px);" +
    "white-space:normal;word-break:break-word;line-height:1.45;" +
    "padding:12px 12px 10px;" +
    "border-radius:12px;" +
    "background:var(--surface);" +
    "color:var(--text);" +
    "border:1px solid var(--border);" +
    "box-shadow:var(--shadow-md);" +
    "backdrop-filter:saturate(1.1) blur(8px);",
};

function radarTooltipFormatter(team, avgs) {
  const o = num(team.ortg);
  const d = num(team.drtg);
  const f = num(team.fg3_pct);
  const r = num(team.reb);
  const tov = num(team.tov);
  const ev = num(team.stl) + num(team.blk);
  const ao = avgs.ortg;
  const ad = avgs.drtg;
  const af = avgs.fg3_pct;
  const ar = avgs.reb;
  const at = avgs.tov;
  const aev = avgs.stl + avgs.blk;

  return function fmt(p) {
    const payload = Array.isArray(p) ? p[0] : p;
    if (!payload) return "";
    const vals = Array.isArray(payload.value) ? payload.value : [];
    if (payload.name === "联盟平均") {
      return [
        `<div style="font-weight:600;margin-bottom:6px">联盟平均 · 雷达基准</div>`,
        `<div style="font-size:12px;color:var(--muted);line-height:1.45;margin-bottom:4px">虚线六边形各维均为相对分 <b>50</b>。以下为联盟原始均值：</div>`,
        `ORtg ${fmt2(ao)} · DRtg ${fmt2(ad)} · 三分% ${fmt2(af * 100)}`,
        `篮板 ${fmt2(ar)} · 失误 ${fmt2(at)} · 抢断+盖帽 ${fmt2(aev)}`,
      ].join("<br/>");
    }
    const v = vals.length ? vals : [0, 0, 0, 0, 0, 0];
    return [
      `<div style="font-weight:600;margin-bottom:6px">${payload.name || team.team_name || team.team_abbr} · 悬停明细</div>`,
      `<div style="font-size:11px;color:var(--muted);margin-bottom:6px">雷达值为<strong>相对表现</strong>（50=联盟平均）；柱状图区为同量纲原始值对比。</div>`,
      `<b>进攻 ORtg</b><br/>相对 ${fmt2(v[0])} · 本队 ${fmt2(o)} · 联盟 ${fmt2(ao)} · Δ ${fmt2(o - ao)}（越高越好）`,
      `<b>防守 DRtg</b><br/>相对 ${fmt2(v[1])} · 本队 ${fmt2(d)} · 联盟 ${fmt2(ad)} · Δ ${fmt2(d - ad)}（越低越好）`,
      `<b>三分</b><br/>相对 ${fmt2(v[2])} · 本队 ${fmt2(f * 100)}% · 联盟 ${fmt2(af * 100)}% · Δ ${fmt2((f - af) * 100)} 百分点`,
      `<b>篮板</b><br/>相对 ${fmt2(v[3])} · 本队 ${fmt2(r)} · 联盟 ${fmt2(ar)} · Δ ${fmt2(r - ar)}`,
      `<b>失误</b><br/>相对 ${fmt2(v[4])} · 本队 ${fmt2(tov)} · 联盟 ${fmt2(at)} · Δ ${fmt2(tov - at)}（越低越好）`,
      `<b>抢断+盖帽</b><br/>相对 ${fmt2(v[5])} · 本队 ${fmt2(ev)} · 联盟 ${fmt2(aev)} · Δ ${fmt2(ev - aev)}`,
    ].join("<br/><br/>");
  };
}

function renderCurrentDetailCharts(team, avgs) {
  const effEl = document.getElementById("chart-current-eff");
  const fourEl = document.getElementById("chart-current-four");
  const deltaEl = document.getElementById("chart-current-delta");
  if (!effEl || !fourEl || !deltaEl || typeof echarts === "undefined") return;

  bindCurrentChartsResize();

  const o = num(team.ortg);
  const d = num(team.drtg);
  const n = num(team.nrtg);
  const paceT = num(team.pace);
  const f = num(team.fg3_pct);
  const r = num(team.reb);
  const tov = num(team.tov);
  const ev = num(team.stl) + num(team.blk);

  const ao = avgs.ortg;
  const ad = avgs.drtg;
  const an = avgs.nrtg;
  const paceA = avgs.pace;
  const af = avgs.fg3_pct;
  const ar = avgs.reb;
  const at = avgs.tov;
  const aev = avgs.stl + avgs.blk;

  const css = getComputedStyle(document.documentElement);
  const TEXT = css.getPropertyValue("--text").trim() || "#e5e7eb";
  const MUTED = css.getPropertyValue("--muted").trim() || "rgba(148, 163, 184, 0.86)";
  const pairTheme = {
    textStyle: { color: TEXT },
    color: ["#2563eb", "#94a3b8"],
  };

  if (!chartEff) chartEff = echarts.init(effEl, null, { renderer: "canvas" });
  chartEff.setOption({
    ...pairTheme,
    title: {
      text: "效率、净胜与节奏",
      left: 0,
      top: 2,
      textStyle: { fontSize: 13, fontWeight: 600 },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...CURRENT_TOOLTIP_BASE,
      valueFormatter: (v) => fmt2(v),
    },
    legend: { data: ["本队", "联盟均值"], bottom: 0, textStyle: { fontSize: 12, color: MUTED } },
    grid: { left: 46, right: 14, top: 34, bottom: 34 },
    xAxis: {
      type: "category",
      data: ["ORtg", "DRtg", "百回合净胜", "Pace"],
      axisLabel: { fontSize: 11, color: MUTED },
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: (x) => fmt2(x), fontSize: 11, color: MUTED },
      splitLine: { lineStyle: { opacity: 0.35 } },
    },
    series: [
      { name: "本队", type: "bar", barMaxWidth: 28, data: [o, d, n, paceT] },
      { name: "联盟均值", type: "bar", barMaxWidth: 28, data: [ao, ad, an, paceA] },
    ],
  });

  if (!chartFour) chartFour = echarts.init(fourEl, null, { renderer: "canvas" });
  chartFour.setOption({
    ...pairTheme,
    title: {
      text: "三分、篮板、失误、抢断+盖帽",
      left: 0,
      top: 2,
      textStyle: { fontSize: 13, fontWeight: 600 },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...CURRENT_TOOLTIP_BASE,
      formatter(params) {
        const ax = params[0].axisValue ?? params[0].name ?? "";
        let html = `${ax}<br/>`;
        for (const q of params) {
          const isPct = String(ax).includes("三分");
          const val = isPct ? `${fmt2(q.data)}%` : fmt2(q.data);
          html += `${q.marker}${q.seriesName}：${val}<br/>`;
        }
        return html;
      },
      valueFormatter: (v) => fmt2(v),
    },
    legend: { data: ["本队", "联盟均值"], bottom: 0, textStyle: { fontSize: 12, color: MUTED } },
    grid: { left: 44, right: 12, top: 34, bottom: 34 },
    xAxis: {
      type: "category",
      data: ["三分命中率(%)", "篮板", "失误", "抢断+盖帽"],
      axisLabel: { fontSize: 11, color: MUTED },
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: (x) => fmt2(x), fontSize: 11, color: MUTED },
      splitLine: { lineStyle: { opacity: 0.35 } },
    },
    series: [
      { name: "本队", type: "bar", barMaxWidth: 26, data: [f * 100, r, tov, ev] },
      { name: "联盟均值", type: "bar", barMaxWidth: 26, data: [af * 100, ar, at, aev] },
    ],
  });

  const dOrt = o - ao;
  const dDef = ad - d;
  const dN = n - an;
  const dFg = (f - af) * 100;
  const dReb = r - ar;
  const dTov = at - tov;
  const dEv = ev - aev;
  const deltaLabels = ["ORtg", "DRtg\n(正=防更好)", "净胜", "三分·百分点", "篮板", "失误\n(正=更少)", "断+帽"];
  const deltaVals = [dOrt, dDef, dN, dFg, dReb, dTov, dEv];
  const deltaNotes = [
    "越高越好",
    "联盟 DRtg − 本队，正值表示百回合少失分",
    "越高越好",
    "命中率百分点，越高越好",
    "越高越好",
    "联盟失误 − 本队，正值表示失误更少",
    "越高越好",
  ];

  if (!chartDelta) chartDelta = echarts.init(deltaEl, null, { renderer: "canvas" });
  chartDelta.setOption({
    textStyle: { color: TEXT },
    title: {
      text: "相对联盟差值（绿优 / 红劣）",
      left: 0,
      top: 2,
      textStyle: { fontSize: 13, fontWeight: 600, color: TEXT },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...CURRENT_TOOLTIP_BASE,
      formatter(params) {
        const q = params[0];
        const i = q.dataIndex;
        const v = deltaVals[i];
        return `${q.name.replace(/\n/g, " ")}<br/>差值 ${fmt2(v)}<br/><span style="font-size:11px;color:${MUTED}">${deltaNotes[i]}</span>`;
      },
    },
    grid: { left: 102, right: 20, top: 34, bottom: 22 },
    xAxis: {
      type: "value",
      axisLabel: { formatter: (x) => fmt2(x), fontSize: 11, color: MUTED },
      splitLine: { lineStyle: { opacity: 0.35 } },
    },
    yAxis: {
      type: "category",
      data: deltaLabels,
      axisLabel: { fontSize: 11, color: MUTED, width: 92, overflow: "truncate" },
    },
    series: [
      {
        name: "相对联盟",
        type: "bar",
        data: deltaVals.map((val) => ({
          value: val,
          itemStyle: { color: val >= 0 ? "#059669" : "#dc2626" },
        })),
      },
    ],
  });
}

function renderRadar(team, avgs) {
  const el = document.getElementById("radar-chart");
  if (!el || typeof echarts === "undefined") return;

  const o = num(team.ortg);
  const d = num(team.drtg);
  const f = num(team.fg3_pct);
  const r = num(team.reb);
  const tov = num(team.tov);
  const ev = num(team.stl) + num(team.blk);

  const ao = avgs.ortg;
  const ad = avgs.drtg;
  const af = avgs.fg3_pct;
  const ar = avgs.reb;
  const at = avgs.tov;
  const aev = avgs.stl + avgs.blk;

  const K_OR = 8;
  const K_FG3 = 420;
  const K_REB = 11;
  const K_TOV = 11;
  const K_EV = 14;

  const attack = clamp(50 + K_OR * (o - ao), 0, 100);
  const defend = clamp(50 - K_OR * (d - ad), 0, 100);
  const shoot = clamp(50 + K_FG3 * (f - af), 0, 100);
  const glass = clamp(50 + K_REB * (r - ar), 0, 100);
  const care = clamp(50 - K_TOV * (tov - at), 0, 100);
  const disrupt = clamp(50 + K_EV * (ev - aev), 0, 100);

  if (!radarChart) {
    radarChart = echarts.init(el, null, { renderer: "canvas" });
  }
  bindCurrentChartsResize();

  const teamLabel = team.team_name || team.team_abbr;
  const teamLogoId = resolveLogoId(team.team_abbr);
  const teamLogoUrl = teamLogoId ? `https://cdn.nba.com/logos/nba/${teamLogoId}/global/L/logo.svg` : "";
  const leagueBaseline = [50, 50, 50, 50, 50, 50];

  radarChart.setOption({
    color: ["#2563eb", "#94a3b8"],
    textStyle: { color: "#334155" },
    tooltip: {
      trigger: "item",
      triggerOn: "mousemove|click",
      ...CURRENT_TOOLTIP_BASE,
      formatter: radarTooltipFormatter(team, avgs),
    },
    legend: {
      data: [teamLabel, "联盟平均"],
      bottom: 4,
      left: "center",
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { fontSize: 12, color: "#64748b" },
    },
    radar: {
      indicator: [
        { name: "进攻 ORtg", max: 100 },
        { name: "防守 DRtg", max: 100 },
        { name: "三分命中", max: 100 },
        { name: "篮板", max: 100 },
        { name: "控制失误", max: 100 },
        { name: "抢断+盖帽", max: 100 },
      ],
      radius: "68%",
      center: ["58%", "46%"],
      splitNumber: 5,
      splitArea: { areaStyle: { color: ["rgba(37,99,235,0.05)", "rgba(255,255,255,0.4)"] } },
      axisName: { color: "#64748b", fontSize: 13 },
    },
    graphic: teamLogoUrl
      ? [
          {
            type: "group",
            left: 18,
            top: "middle",
            children: [
              {
                type: "circle",
                shape: { cx: 44, cy: 0, r: 34 },
                style: {
                  fill: "rgba(15, 23, 42, 0.16)",
                  stroke: "rgba(148, 163, 184, 0.45)",
                  lineWidth: 1.2,
                },
              },
              {
                type: "image",
                style: {
                  image: teamLogoUrl,
                  x: 14,
                  y: -30,
                  width: 60,
                  height: 60,
                },
              },
              {
                type: "text",
                style: {
                  x: 44,
                  y: 46,
                  text: team.team_abbr || "",
                  textAlign: "center",
                  fill: "#94a3b8",
                  font: "600 12px DM Sans, Segoe UI, sans-serif",
                },
              },
            ],
          },
        ]
      : [],
    series: [
      {
        type: "radar",
        data: [
          {
            value: [attack, defend, shoot, glass, care, disrupt],
            name: teamLabel,
            areaStyle: { color: "rgba(37, 99, 235, 0.28)" },
            lineStyle: { width: 2.2 },
            symbol: "circle",
            symbolSize: 7,
            emphasis: {
              lineStyle: { width: 2.8 },
              areaStyle: { color: "rgba(37, 99, 235, 0.34)" },
            },
          },
          {
            value: leagueBaseline,
            name: "联盟平均",
            lineStyle: { type: "dashed", width: 1.5, color: "#94a3b8" },
            areaStyle: { opacity: 0 },
            symbol: "circle",
            symbolSize: 3,
            itemStyle: { color: "#94a3b8" },
            emphasis: { lineStyle: { width: 2 } },
          },
        ],
      },
    ],
  });
}

window.resizeCurrentCharts = function () {
  if (radarChart) radarChart.resize();
  if (chartEff) chartEff.resize();
  if (chartFour) chartFour.resize();
  if (chartDelta) chartDelta.resize();
};

function renderWeaknesses(block, tagsEl, data) {
  block.innerHTML = "";
  for (const w of data.weaknesses) {
    const p = document.createElement("p");
    p.innerHTML = `<strong>${w.label}</strong> — ${w.detail}`;
    block.appendChild(p);
  }
  tagsEl.innerHTML = "";
  for (const t of data.tags) {
    const s = document.createElement("span");
    s.className = "tag" + (t.warn ? " warn" : "");
    s.textContent = t.text;
    tagsEl.appendChild(s);
  }
}

function renderRecs(listEl, items) {
  listEl.innerHTML = "";
  for (const { p, score, reasons, summary, roleTags } of items) {
    const li = document.createElement("li");
    li.className = "rec";
    const poolZh = p.pool === "free_agent" ? "自由球员候选" : "角色球员";
    const maxScore = 100;
    const headshot = p.player_id
      ? `https://www.basketball-reference.com/req/202106291/images/headshots/${encodeURIComponent(
          p.player_id
        )}.jpg`
      : "";
    li.innerHTML = `
      <header>
        <div class="rec-title">
          <img class="rec-headshot" src="${headshot}" alt="${p.player_name} headshot" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'" />
          <h3>${p.player_name}</h3>
        </div>
        <div class="rec-score">
          <span class="score">适配分 ${score.toFixed(1)} / ${maxScore}</span>
          <div class="scorebar" role="progressbar" aria-label="适配分进度" aria-valuenow="${score.toFixed(
            1
          )}" aria-valuemin="0" aria-valuemax="${maxScore}">
            <div class="scorebar__fill" style="width:${clamp(score, 0, 100).toFixed(1)}%"></div>
          </div>
        </div>
      </header>
      <div class="meta">${p.pos} · ${p.team_abbr || "—"} · ${poolZh} · ${fmt2(p.mpg)} MPG</div>
      <div class="role-tags">
        ${(roleTags || []).map((x) => `<span class="role-tag">${x}</span>`).join("")}
      </div>
      <p class="rec-conclusion">${summary?.conclusion || "功能型补强：提升轮换稳定性与对位弹性。"}</p>
      <div class="rec-section-title">关键贡献</div>
      <ul class="rec-bullets">
        ${(summary?.contributions || []).map((x) => `<li>${x}</li>`).join("")}
      </ul>
      <div class="rec-section-title">适配逻辑</div>
      <ul class="rec-bullets">
        ${(summary?.fit || []).map((x) => `<li>${x}</li>`).join("")}
      </ul>
      <div class="rec-section-title">数据支撑</div>
      <ul class="reasons">
        ${reasons.map((r) => `<li>${r}</li>`).join("")}
      </ul>
    `;
    listEl.appendChild(li);
  }
}

function renderCurrentRoster(container, teamAbbr, players) {
  if (!container) return;
  const roster = players
    .filter((p) => String(p.team_abbr || "").toUpperCase() === String(teamAbbr || "").toUpperCase() && p.player_name)
    .sort((a, b) => num(b.mpg) - num(a.mpg))
    .slice(0, 15);

  const unique = [];
  const seen = new Set();
  for (const p of roster) {
    const key = String(p.player_name).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
    if (unique.length >= 15) break;
  }

  while (unique.length < 15) {
    unique.push({
      player_name: "—",
      pos: "--",
      jersey_no: "--",
      player_id: "",
    });
  }

  container.innerHTML = unique
    .map((p) => {
      const name = String(p.player_name || "—");
      const pos = String(p.pos || "--");
      const jersey = String(p.jersey_no || "--");
      const age = p.age != null && p.age !== "" ? String(p.age) : "--";
      const gp = p.gp != null && p.gp !== "" ? String(p.gp) : "--";
      const pts = p.pts != null && p.pts !== "" ? fmt2(p.pts) : "--";
      const reb = p.reb != null && p.reb !== "" ? fmt2(p.reb) : "--";
      const ast = p.ast != null && p.ast !== "" ? fmt2(p.ast) : "--";
      const headshot = p.player_id
        ? `https://www.basketball-reference.com/req/202106291/images/headshots/${encodeURIComponent(p.player_id)}.jpg`
        : "";
      return `<div class="current-roster-item">
        <img class="current-roster-item__avatar" src="${headshot}" alt="${name} avatar" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='';this.classList.add('is-empty')" />
        <div class="current-roster-item__meta">
          <div class="current-roster-item__name">${name}</div>
          <div class="current-roster-item__sub">#${jersey} · ${pos}</div>
        </div>
        <div class="current-roster-item__hover">
          <div class="current-roster-item__hover-head">
            <img class="current-roster-item__hover-avatar" src="${headshot}" alt="${name} avatar" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='';this.classList.add('is-empty')" />
            <div class="current-roster-item__hover-title">
              <div class="current-roster-item__hover-name">${name}</div>
              <div class="current-roster-item__hover-sub">#${jersey} · ${pos} · 年龄 ${age} · 出场 ${gp}</div>
            </div>
          </div>
          <div class="current-roster-item__hover-stats">
            <div><span>得分</span><strong>${pts}</strong></div>
            <div><span>篮板</span><strong>${reb}</strong></div>
            <div><span>助攻</span><strong>${ast}</strong></div>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

async function main() {
  const err = document.getElementById("error");
  const weaknessBlock = document.getElementById("weakness-text");
  const tagsEl = document.getElementById("weakness-tags");
  const recList = document.getElementById("recs");
  const rosterEl = document.getElementById("current-roster");
  const currentContent = document.getElementById("current-content");
  const currentRecsPanel = document.getElementById("current-recs-panel");
  const emptyHint = document.getElementById("current-empty-hint");
  const picker = document.getElementById("current-team-picker");
  const pickerPanel = document.getElementById("current-team-picker-panel");
  const currentPanel = document.getElementById("panel-current");
  const pickedTeam = document.getElementById("current-picked-team");
  const pickerToggle = document.getElementById("current-team-picker-toggle");

  let teams, players, standings;

  try {
    ({ teams, players, standings } = await loadData());
  } catch (e) {
    err.textContent =
      "加载 CSV 失败。请在本目录运行：python3 -m http.server 8080，然后打开 http://localhost:8080/web/ 。直接双击打开 HTML 时浏览器会阻止 file:// 读取数据。";
    err.classList.add("err");
    return;
  }

  const avgs = {};
  for (const k of LEAGUE_KEYS) {
    avgs[k] = leagueAvg(teams, k);
  }
  avgs.nrtg = leagueAvg(teams, "nrtg");
  avgs.pace = leagueAvg(teams, "pace");

  let selectedAbbr = "";
  let pickerCollapsed = false;

  function setEmptyState(on) {
    if (currentContent) currentContent.classList.toggle("is-hidden", on);
    if (currentRecsPanel) currentRecsPanel.classList.toggle("is-hidden", on);
    if (emptyHint) emptyHint.style.display = on ? "" : "none";
  }

  function setPickerCollapsed(on) {
    pickerCollapsed = !!on;
    if (pickerPanel) pickerPanel.classList.toggle("is-collapsed", pickerCollapsed);
    if (pickerToggle) {
      pickerToggle.textContent = pickerCollapsed ? "更换球队" : "收起";
      pickerToggle.setAttribute("aria-expanded", pickerCollapsed ? "false" : "true");
    }
  }

  // 初始：和历史 Tab 一样，未选队不展示任何内容
  setEmptyState(true);
  setPickerCollapsed(false);

  renderTeamOptions(teams, standings, (abbr) => {
    selectedAbbr = abbr;
    // 选择球队后自动收起（与历史板块体验一致）
    setPickerCollapsed(true);
    update();
  });

  if (pickerToggle) {
    pickerToggle.addEventListener("click", () => {
      setPickerCollapsed(!pickerCollapsed);
    });
  }

  function update() {
    if (!selectedAbbr) {
      setEmptyState(true);
      if (currentPanel) currentPanel.classList.remove("is-team-selected");
      if (pickedTeam) pickedTeam.textContent = "";
      if (rosterEl) rosterEl.innerHTML = "";
      setPickerCollapsed(false);
      return;
    }
    const team = teams.find((t) => t.team_abbr === selectedAbbr);
    if (!team) {
      setEmptyState(true);
      if (currentPanel) currentPanel.classList.remove("is-team-selected");
      if (pickedTeam) pickedTeam.textContent = "";
      if (rosterEl) rosterEl.innerHTML = "";
      setPickerCollapsed(false);
      return;
    }
    setEmptyState(false);
    if (currentPanel) currentPanel.classList.add("is-team-selected");
    if (pickedTeam) pickedTeam.textContent = `已选：${team.team_name}`;
    syncCurrentTeamPicker(selectedAbbr);
    const data = analyzeTeam(team, avgs);
    renderRadar(team, avgs);
    renderCurrentDetailCharts(team, avgs);
    renderCurrentRoster(rosterEl, selectedAbbr, players);
    renderWeaknesses(weaknessBlock, tagsEl, data);
    const recs = recommend(team, players, data.weaknesses, avgs);
    renderRecs(recList, recs);
  }

  window.refreshCurrentSeason = update;

  // 与历史 Tab 一致：进入时不自动选队，不自动渲染内容
}

document.addEventListener("DOMContentLoaded", main);
