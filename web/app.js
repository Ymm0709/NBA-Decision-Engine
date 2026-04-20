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

function avatarFallbackDataUrl(name) {
  const raw = String(name || "").trim();
  const safe = raw && raw !== "—" ? raw : "Player";
  const words = safe
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);
  const initials =
    words.length >= 2
      ? (words[0][0] || "").toUpperCase() + (words[words.length - 1][0] || "").toUpperCase()
      : (safe[0] || "P").toUpperCase();

  // Simple deterministic hash for color
  let h = 0;
  for (let i = 0; i < safe.length; i++) h = (h * 31 + safe.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const bg1 = `hsl(${hue} 22% 92%)`;
  const bg2 = `hsl(${(hue + 18) % 360} 28% 84%)`;
  const stroke = "rgba(148,163,184,0.78)";
  const text = "rgba(11,14,20,0.72)";

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg1}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <circle cx="48" cy="48" r="46" fill="url(#g)" stroke="${stroke}" stroke-width="2"/>
  <circle cx="48" cy="40" r="18" fill="rgba(255,255,255,0.55)"/>
  <path d="M20 82c6-16 20-22 28-22s22 6 28 22" fill="rgba(255,255,255,0.55)"/>
  <text x="48" y="52" text-anchor="middle" font-family="DM Sans, Segoe UI, system-ui, sans-serif" font-size="22" font-weight="800" fill="${text}">${initials}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function grayPersonAvatarDataUrl() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f3f4f6"/>
      <stop offset="1" stop-color="#d1d5db"/>
    </linearGradient>
  </defs>
  <circle cx="48" cy="48" r="46" fill="url(#g)" stroke="rgba(148,163,184,0.78)" stroke-width="2"/>
  <circle cx="48" cy="36" r="14" fill="rgba(107,114,128,0.72)"/>
  <path d="M22 76c4-13 14-20 26-20s22 7 26 20" fill="rgba(107,114,128,0.72)"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function draftAvatarFromUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  const low = u.toLowerCase();
  // 明显非本人头像：logo、泛图、赛事图、占位图等
  const badHints = [
    "logo",
    "fiba",
    "image-1024x1024",
    "placeholder",
    "default",
    "/ncaa/",
    "tank_",
    "arena",
    "stadium",
    "court",
    "building",
    "interior",
    "cathedral",
  ];
  if (badHints.some((k) => low.includes(k))) return "";

  // 只允许可信的人像来源，避免爬虫抓到“非人物图”
  let host = "";
  try {
    host = new URL(u).hostname.toLowerCase();
  } catch (_) {
    return "";
  }
  const trustedHosts = [
    "a.espncdn.com",
    "img.espncdn.com",
    "cdn.nba.com",
    "www.nbadraft.net",
    "nbadraft.net",
    "upload.wikimedia.org",
    "dxbhsrqyrr690.cloudfront.net", // 部分大学官方球员照
    "assets.fiba.basketball",
    "s.yimg.com",
    "images2.minutemediacdn.com",
  ];
  const isTrusted = trustedHosts.some((h) => host === h || host.endsWith(`.${h}`));
  if (!isTrusted) return "";

  return encodeURI(u);
}

function roleLabelForPlayer(p, avgs) {
  const pos = String(p.pos || "").toUpperCase();
  const reb = num(p.reb);
  const ast = num(p.ast);
  const fg3 = num(p.fg3_pct);
  const tov = num(p.tov);
  const stl = num(p.stl);
  const blk = num(p.blk);
  const defEvents = stl + blk;

  const aReb = num(avgs.reb);
  const aAst = num(avgs.ast);
  const aFg3 = num(avgs.fg3_pct);
  const aTov = num(avgs.tov);
  const aDefEvents = num(avgs.stl) + num(avgs.blk);

  const isBig = pos.includes("C") || pos.includes("PF");
  const isWing = pos.includes("SF") || pos.includes("PF") || pos.includes("SG");
  const isGuard = pos.includes("PG") || pos.includes("SG");

  if (isBig && (blk >= 1.2 || defEvents >= aDefEvents + 0.65)) return "Rim Protector";
  if (isWing && fg3 >= aFg3 + 0.012 && (stl >= 1.0 || defEvents >= aDefEvents + 0.25)) return "3&D Wing";
  if (isGuard && ast >= aAst + 1.2 && tov <= aTov + 0.2) return "Secondary Playmaker";
  if (fg3 >= aFg3 + 0.018 && ast <= aAst - 0.6) return "Floor Spacer";
  if (isBig && fg3 >= aFg3 + 0.012) return "Stretch Big";
  if (isBig && reb >= aReb + 1.6) return "Rebounding Big";
  return isWing ? "Two-way Wing" : "Rotation Piece";
}

function draftTypeMap() {
  return {
    shooting: { type: "得分后卫型", why: ["外线与空间需求更高", "需要提升半场投射威胁", "更容易立刻带来进攻增量"] },
    defense: { type: "防守侧翼型", why: ["防守端需要增量", "侧翼换防与对抗是稀缺资源", "年轻侧翼更适合长期发展"] },
    playmaking: { type: "组织后卫型", why: ["组织与推进存在缺口", "第二持球点能降低失误波动", "更容易提升整体进攻结构"] },
    rebounding: { type: "空间型内线", why: ["篮板/内线对抗需要补强", "能兼顾护框与空间（若成型）", "对阵容搭配更灵活"] },
  };
}

function pickDraftTypeFromNeeds(needs) {
  const top = rankNeedKeys(needs)[0] || "defense";
  const map = draftTypeMap();
  return map[top] || map.defense;
}

function listDraftTypes() {
  const map = draftTypeMap();
  return ["shooting", "defense", "playmaking", "rebounding"].map((k) => ({
    key: k,
    type: map[k].type,
  }));
}

function normalizeDraftProspects(poolRaw) {
  return (Array.isArray(poolRaw) ? poolRaw : [])
    .map((r, idx) => {
      const name = String(r.name || "").trim();
      const pos = String(r.position || "").trim() || "--";
      const id = String(r.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `prospect-${idx}`);
      const draftRank = Number.isFinite(Number(r.rank)) ? Number(r.rank) : idx + 1;
      return {
        id,
        draft_rank: draftRank,
        player_name: name,
        pos,
        avatar_url: String(r.avatar_url || "").trim(),
        fg3_pct: num(r.fg3_pct),
        reb: num(r.reb),
        ast: num(r.ast),
        stl: num(r.stl),
        blk: num(r.blk),
        tov: num(r.tov),
        archetype: String(r.archetype || "").trim() || "Prospect",
        potential: num(r.potential, 1),
        risk: String(r.risk || "").trim() || "Medium Risk",
        notes: String(r.notes || "").trim(),
        mpg: 24,
      };
    })
    .filter((p) => p.player_name);
}

function computeDraftImpact(team, avgs, prospect) {
  const before = {
    fg3_pct: num(team.fg3_pct),
    ortg: num(team.ortg),
    drtg: num(team.drtg),
    reb: num(team.reb),
    ast: num(team.ast),
    tov: num(team.tov),
    def_events: num(team.stl) + num(team.blk),
  };

  const pot = num(prospect.potential, 1);
  const potBoost = (pot - 1) * 2.4;
  const shootDeltaRaw = num(prospect.fg3_pct) - num(avgs.fg3_pct);
  const rebDeltaRaw = num(prospect.reb) - num(avgs.reb);
  const astDeltaRaw = num(prospect.ast) - num(avgs.ast);
  const defDeltaRaw = num(prospect.stl) + num(prospect.blk) - (num(avgs.stl) + num(avgs.blk));
  const tovDeltaRaw = num(prospect.tov) - num(avgs.tov);

  const after = {
    fg3_pct: clamp(before.fg3_pct + shootDeltaRaw * 0.18 + potBoost * 0.0009, 0.24, 0.45),
    reb: clamp(before.reb + rebDeltaRaw * 0.24 + potBoost * 0.08, 36, 52),
    ast: clamp(before.ast + astDeltaRaw * 0.22 + potBoost * 0.05, 18, 34),
    tov: clamp(before.tov + tovDeltaRaw * 0.17 - potBoost * 0.03, 9.5, 17.5),
    def_events: clamp(before.def_events + defDeltaRaw * 0.25 + potBoost * 0.04, 8.5, 21),
    ortg: 0,
    drtg: 0,
  };

  after.drtg = clamp(before.drtg - (after.def_events - before.def_events) * 0.88 - (after.reb - before.reb) * 0.1, 103, 123);
  after.ortg = clamp(
    before.ortg +
      (after.fg3_pct - before.fg3_pct) * 128 +
      (after.ast - before.ast) * 0.35 -
      (after.tov - before.tov) * 0.62 +
      potBoost * 0.3,
    103,
    126
  );

  const delta = {
    fg3_pp: (after.fg3_pct - before.fg3_pct) * 100,
    ortg: after.ortg - before.ortg,
    drtg: after.drtg - before.drtg,
    reb: after.reb - before.reb,
    ast: after.ast - before.ast,
    tov: after.tov - before.tov,
  };
  return { before, after, delta };
}

function buildDraftImpactExplanation(impact) {
  const items = [
    { id: "shoot", label: "外线投射", value: impact.delta.fg3_pp, fmt: (v) => `${v >= 0 ? "+" : ""}${fmt2(v)}pp`, goodIfPositive: true },
    { id: "play", label: "组织串联", value: impact.delta.ast, fmt: (v) => `${v >= 0 ? "+" : ""}${fmt2(v)}`, goodIfPositive: true },
    { id: "glass", label: "篮板控制", value: impact.delta.reb, fmt: (v) => `${v >= 0 ? "+" : ""}${fmt2(v)}`, goodIfPositive: true },
    { id: "def", label: "防守效率", value: -impact.delta.drtg, fmt: (v) => `${v >= 0 ? "+" : ""}${fmt2(v)}`, goodIfPositive: true },
    { id: "care", label: "失误控制", value: -impact.delta.tov, fmt: (v) => `${v >= 0 ? "+" : ""}${fmt2(v)}`, goodIfPositive: true },
  ];
  const sorted = [...items].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const top = sorted[0];
  const second = sorted[1];
  const downside = sorted.find((x) => x.value < -0.02);
  const out = [];
  if (top && Math.abs(top.value) >= 0.02) out.push(`主要提升：${top.label}（${top.fmt(top.value)}）`);
  if (second && Math.abs(second.value) >= 0.02) out.push(`次级变化：${second.label}（${second.fmt(second.value)}）`);
  if (downside) out.push(`潜在代价：${downside.label}可能下滑（${downside.fmt(downside.value)}）`);
  if (!out.length) out.push("整体影响偏温和，适合作为长期培养型补强。");
  return out.slice(0, 3);
}

function clampSelectToMax(selectEl, max) {
  if (!selectEl) return;
  const selected = Array.from(selectEl.selectedOptions || []);
  if (selected.length <= max) return;
  // 保留最新选择：让超出的从前往后取消
  for (let i = 0; i < selected.length - max; i++) {
    selected[i].selected = false;
  }
}

function buildImpactLines(outAgg, inAgg) {
  const lines = [];
  const d = (k) => num(inAgg[k]) - num(outAgg[k]);
  const push = (label, delta, fmt, posBetter = true) => {
    const v = delta;
    if (Math.abs(v) < 0.01) return;
    const good = posBetter ? v > 0 : v < 0;
    lines.push(`${good ? "🟢" : "🟠"} ${label}${fmt(v)}`);
  };
  push("得分", d("pts"), (v) => ` ${v >= 0 ? "+" : ""}${fmt2(v)}`);
  push("篮板", d("reb"), (v) => ` ${v >= 0 ? "+" : ""}${fmt2(v)}`);
  push("助攻", d("ast"), (v) => ` ${v >= 0 ? "+" : ""}${fmt2(v)}`);
  push("防守破坏(断+帽)", d("def_events"), (v) => ` ${v >= 0 ? "+" : ""}${fmt2(v)}`);
  push("三分命中率", d("fg3_pct") * 100, (v) => ` ${v >= 0 ? "+" : ""}${fmt2(v)}pp`);
  push("失误", d("tov"), (v) => ` ${v >= 0 ? "+" : ""}${fmt2(v)}`, false);
  if (!lines.length) lines.push("🟡 影响较小：整体变化不明显（或样本分钟数较小）");
  return lines.slice(0, 4);
}


function aggPlayers(players, avgs) {
  const list = (players || []).filter((p) => p && p.player_name && p.player_name !== "—");
  const wSum = list.reduce((a, p) => a + Math.max(1, num(p.mpg, 0)), 0) || 1;
  const wAvg = (k) => list.reduce((a, p) => a + Math.max(1, num(p.mpg, 0)) * num(p[k], 0), 0) / wSum;
  const fg3 = list.reduce((a, p) => a + Math.max(1, num(p.mpg, 0)) * num(p.fg3_pct, 0), 0) / wSum;
  return {
    pts: wAvg("pts"),
    reb: wAvg("reb"),
    ast: wAvg("ast"),
    tov: wAvg("tov"),
    fg3_pct: fg3,
    def_events: list.reduce((a, p) => a + Math.max(1, num(p.mpg, 0)) * (num(p.stl, 0) + num(p.blk, 0)), 0) / wSum,
    role: list.length ? roleLabelForPlayer(list[0], avgs) : "Rotation Piece",
  };
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

function buildTeamVector(team, avgs) {
  const needs = computeTeamNeeds(team, avgs);
  return {
    shooting: needs.shooting,
    rebounding: needs.rebounding,
    defense: needs.defense,
    playmaking: needs.playmaking,
  };
}

function weightedTeamAge(players, teamAbbr) {
  const roster = (players || []).filter(
    (p) => String(p.team_abbr || "").toUpperCase() === String(teamAbbr || "").toUpperCase() && Number.isFinite(num(p.age))
  );
  if (!roster.length) return 27;
  const wSum = roster.reduce((a, p) => a + Math.max(1, num(p.mpg, 0)), 0) || 1;
  return roster.reduce((a, p) => a + Math.max(1, num(p.mpg, 0)) * num(p.age, 27), 0) / wSum;
}

function resolveTeamPhase(team, standings, players) {
  const row = (standings || []).find((s) => String(s.team_abbr || "").toUpperCase() === String(team.team_abbr || "").toUpperCase());
  const winPct = num(row && row.win_pct, NaN);
  const age = weightedTeamAge(players, team.team_abbr);
  const nrtg = num(team.nrtg);

  if ((Number.isFinite(winPct) && winPct >= 0.6) || nrtg >= 4.0 || age >= 28.2) {
    return {
      key: "contend",
      label: "争冠窗口",
      styleBias: { playmaking: 0.16, defense: 0.1, shooting: 0.08, rebounding: 0.06, turnoverTolerance: -0.06, experience: 0.14 },
    };
  }
  if ((Number.isFinite(winPct) && winPct <= 0.38) || nrtg <= -3.2) {
    return {
      key: "rebuild",
      label: "重建期",
      styleBias: { playmaking: 0.06, defense: 0.14, shooting: 0.1, rebounding: 0.08, turnoverTolerance: 0.08, experience: -0.1 },
    };
  }
  return {
    key: "youth",
    label: "年轻化发展",
    styleBias: { playmaking: 0.1, defense: 0.12, shooting: 0.12, rebounding: 0.06, turnoverTolerance: 0.04, experience: -0.04 },
  };
}

function buildPlayerVector(p, avgs) {
  // 球员能力向量：与联盟均值相比的“正向能力”强度（0-1）
  const shooting = clamp01((num(p.fg3_pct) - num(avgs.fg3_pct)) / 0.03 + 0.45);
  const rebounding = clamp01((num(p.reb) - num(avgs.reb)) / 4.0 + 0.45);
  const defense = clamp01(
    ((num(p.stl) + num(p.blk) - (num(avgs.stl) + num(avgs.blk))) / 2.8) * 0.65 +
      ((num(p.reb) - num(avgs.reb)) / 5.5) * 0.2 +
      0.45
  );
  const playmaking = clamp01((num(p.ast) - num(avgs.ast)) / 4.0 + 0.45);
  const ballSecurity = clamp01(((num(avgs.tov) - num(p.tov)) / 3.0) * 0.8 + 0.5);
  return { shooting, rebounding, defense, playmaking, ballSecurity };
}

function scorePlayerFitByVectors(p, team, avgs, phase) {
  const teamVec = buildTeamVector(team, avgs);
  const playerVec = buildPlayerVector(p, avgs);
  const turnoverNeed = clamp01(computeTeamNeeds(team, avgs).turnover_penalty);
  const phaseBias = (phase && phase.styleBias) || {};
  const age = num(p.age, 27);
  const mpg = num(p.mpg, 0);
  const experienceScore = clamp01((age - 23) / 10) * 0.6 + clamp01((mpg - 12) / 24) * 0.4;
  const youthScore = 1 - clamp01((age - 21) / 9);

  const contributions = {
    shooting: (teamVec.shooting + (phaseBias.shooting || 0)) * playerVec.shooting,
    rebounding: (teamVec.rebounding + (phaseBias.rebounding || 0)) * playerVec.rebounding,
    defense: (teamVec.defense + (phaseBias.defense || 0)) * playerVec.defense,
    playmaking: (teamVec.playmaking + (phaseBias.playmaking || 0)) * playerVec.playmaking,
    ballSecurity: clamp01(turnoverNeed - (phaseBias.turnoverTolerance || 0)) * playerVec.ballSecurity,
    phaseFit: (phaseBias.experience || 0) >= 0 ? experienceScore * phaseBias.experience : youthScore * Math.abs(phaseBias.experience || 0),
  };

  const baseScore =
    contributions.shooting +
    contributions.rebounding +
    contributions.defense +
    contributions.playmaking +
    contributions.ballSecurity * 0.65 +
    contributions.phaseFit;

  let score = baseScore * 100;
  const reasons = [];

  if (p.pool === "free_agent") {
    score += 1.8;
    reasons.push("自由球员池：现实可操作性更高。");
  } else if (p.pool === "role") {
    score += 1.0;
    reasons.push("角色球员定位：适合做功能补强。");
  }

  if (p.team_abbr && p.team_abbr === team.team_abbr) {
    score -= 8;
    reasons.push("已在本队：分数已降权，仅供对位参考。");
  }

  score = clamp(score, 0, 100);

  const topDims = [
    { key: "shooting", label: "投射匹配", val: contributions.shooting, pv: playerVec.shooting, tv: teamVec.shooting },
    { key: "rebounding", label: "篮板匹配", val: contributions.rebounding, pv: playerVec.rebounding, tv: teamVec.rebounding },
    { key: "defense", label: "防守匹配", val: contributions.defense, pv: playerVec.defense, tv: teamVec.defense },
    { key: "playmaking", label: "组织匹配", val: contributions.playmaking, pv: playerVec.playmaking, tv: teamVec.playmaking },
    { key: "ballSecurity", label: "控失误匹配", val: contributions.ballSecurity * 0.65, pv: playerVec.ballSecurity, tv: turnoverNeed },
    { key: "phaseFit", label: "阶段因子匹配", val: contributions.phaseFit, pv: (phaseBias.experience || 0) >= 0 ? experienceScore : youthScore, tv: Math.abs(phaseBias.experience || 0) },
  ]
    .sort((a, b) => b.val - a.val)
    .slice(0, 3);

  reasons.push(
    `向量匹配贡献：${topDims
      .map((d) => `${d.label}(${fmt2(d.tv)}×${fmt2(d.pv)}=${fmt2(d.val)})`)
      .join("；")}`
  );

  return { score, reasons, teamVec, playerVec, contributions };
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

function recommend(team, players, weaknesses, avgs, phase) {
  const candidates = players.filter((p) => p.pool === "free_agent" || p.pool === "role");
  const needs = computeTeamNeeds(team, avgs);
  const scored = candidates
    .map((p) => {
      const { score, reasons } = scorePlayerFitByVectors(p, team, avgs, phase);
      const summary = buildPlayerSummary(p, needs, avgs);
      const roleTags = buildRoleTags(p, avgs);
      return { p, score, reasons, summary, roleTags };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  return scored;
}

function topNeedBars(needs, topN = 2) {
  const ranked = rankNeedKeys(needs).slice(0, topN);
  return ranked.map((k) => ({ key: k, label: needLabel(k), value: clamp01(needs[k] || 0) }));
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
  const [tText, pText, sText, dText] = await Promise.all([
    fetch(new URL("teams.csv", base)).then((r) => {
      if (!r.ok) throw new Error("无法加载 data/current/teams.csv");
      return r.text();
    }),
    loadPlayersText(),
    fetch(new URL("standings.csv", base))
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => ""),
    fetch(new URL("draft_pool.csv", base))
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => ""),
  ]);
  return {
    teams: parseCSV(tText),
    players: dedupePlayersCurrentStint(parseCSV(pText)),
    standings: sText ? parseCSV(sText) : [],
    draftPool: dText ? parseCSV(dText) : [],
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
    // 图例放底部会与 x 轴标签挤压，改为顶部以避免遮挡
    legend: { data: ["本队", "联盟均值"], top: 26, right: 8, textStyle: { fontSize: 12, color: MUTED } },
    grid: { left: 46, right: 14, top: 56, bottom: 26 },
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
    // 图例放底部会与类目轴标签重叠（尤其移动端），改为顶部
    legend: { data: ["本队", "联盟均值"], top: 26, right: 8, textStyle: { fontSize: 12, color: MUTED } },
    grid: { left: 44, right: 12, top: 56, bottom: 26 },
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
      axisName: { color: "#64748b", fontSize: 13, lineHeight: 19, letterSpacing: 1.2 },
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

function renderRecs(listEl, items, ctx = {}) {
  listEl.innerHTML = "";
  const phaseLabel = ctx.phaseLabel || "";
  const needBars = Array.isArray(ctx.needBars) ? ctx.needBars : [];
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
    const fallback = avatarFallbackDataUrl(p.player_name);
    const roleLabel = roleLabelForPlayer(p, window.__CURRENT_AVGS || {});
    const barsHtml = needBars
      .map(
        (b) => `<div class="needbar-item">
          <span class="needbar-item__label">${b.label}</span>
          <span class="needbar-item__value">${Math.round(b.value * 100)}</span>
          <div class="needbar-item__track"><div class="needbar-item__fill" style="width:${(b.value * 100).toFixed(0)}%"></div></div>
        </div>`
      )
      .join("");
    li.innerHTML = `
      <header>
        <div class="rec-title">
          <img class="rec-headshot" src="${headshot || fallback}" alt="${p.player_name} headshot" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='${fallback.replace(
            /'/g,
            "%27"
          )}';this.classList.add('is-empty')" />
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
      <div class="rec-team-profile"><span class="rec-team-profile__phase">球队画像：${phaseLabel || "当前阵容阶段"}</span></div>
      <div class="rec-needbars">
        <div class="rec-section-title">本队 Top2 需求维度</div>
        <div class="needbar-list">${barsHtml}</div>
      </div>
      <div class="meta">${p.pos} · ${p.team_abbr || "—"} · ${poolZh} · ${fmt2(p.mpg)} MPG · <span class="role-label">角色定位</span> <span class="role-badge">${roleLabel}</span></div>
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
      const fallback = avatarFallbackDataUrl(name);
      return `<div class="current-roster-item">
        <img class="current-roster-item__avatar" src="${headshot || fallback}" alt="${name} avatar" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='${fallback.replace(
          /'/g,
          "%27"
        )}';this.classList.add('is-empty')" />
        <div class="current-roster-item__meta">
          <div class="current-roster-item__name">${name}</div>
          <div class="current-roster-item__sub">#${jersey} · ${pos}</div>
        </div>
        <div class="current-roster-item__hover">
          <div class="current-roster-item__hover-head">
            <img class="current-roster-item__hover-avatar" src="${headshot || fallback}" alt="${name} avatar" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='${fallback.replace(
              /'/g,
              "%27"
            )}';this.classList.add('is-empty')" />
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
  const draftPanel = document.getElementById("current-draft-panel");
  const draftResults = document.getElementById("draft-results");
  const workspaceNav = document.getElementById("current-workspace-nav");
  const currentContent = document.getElementById("current-content");
  const currentRecsPanel = document.getElementById("current-recs-panel");
  const emptyHint = document.getElementById("current-empty-hint");
  const picker = document.getElementById("current-team-picker");
  const pickerPanel = document.getElementById("current-team-picker-panel");
  const currentPanel = document.getElementById("panel-current");
  const pickedTeam = document.getElementById("current-picked-team");
  const pickerToggle = document.getElementById("current-team-picker-toggle");

  let teams, players, standings, draftPool;

  try {
    ({ teams, players, standings, draftPool } = await loadData());
  } catch (e) {
    err.textContent =
      "加载 CSV 失败。请在本目录运行：python3 -m http.server 8080，然后打开 http://localhost:8080/web/ 。直接双击打开 HTML 时浏览器会阻止 file:// 读取数据。";
    err.classList.add("err");
    return;
  }

  // 供“交易模拟”面板复用（避免重复加载 CSV）
  window.__CURRENT_TEAMS = teams;
  window.__CURRENT_PLAYERS = players;
  window.__CURRENT_STANDINGS = standings;
  window.__CURRENT_DRAFT_POOL = Array.isArray(draftPool) ? draftPool : [];

  const avgs = {};
  for (const k of LEAGUE_KEYS) {
    avgs[k] = leagueAvg(teams, k);
  }
  avgs.nrtg = leagueAvg(teams, "nrtg");
  avgs.pace = leagueAvg(teams, "pace");
  // 让推荐卡可用 avgs（避免函数签名大改）
  window.__CURRENT_AVGS = avgs;

  let selectedAbbr = "";
  let pickerCollapsed = false;
  let activeModule = "free";
  let recVisibleCount = 5;
  const draftState = { selectedId: "", compareIds: [], filter: "all" };

  function setActiveModule(name) {
    activeModule = name || "free";
    const buttons = workspaceNav ? Array.from(workspaceNav.querySelectorAll(".current-workspace-nav__btn")) : [];
    const panels = Array.from(document.querySelectorAll(".current-module-panel"));
    buttons.forEach((btn) => {
      const on = btn.dataset.module === activeModule;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    panels.forEach((panel) => {
      const on = panel.dataset.modulePanel === activeModule;
      panel.classList.toggle("is-active", on);
      panel.setAttribute("aria-hidden", on ? "false" : "true");
    });
  }

  function setEmptyState(on) {
    if (currentContent) currentContent.classList.toggle("is-hidden", on);
    if (workspaceNav) workspaceNav.classList.toggle("is-hidden", on);
    if (currentRecsPanel) currentRecsPanel.classList.toggle("is-hidden", on);
    if (draftPanel) draftPanel.classList.toggle("is-hidden", on);
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
  setActiveModule("free");

  if (workspaceNav) {
    workspaceNav.addEventListener("click", (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest(".current-workspace-nav__btn") : null;
      if (!btn) return;
      const next = btn.dataset.module || "free";
      setActiveModule(next);
    });
  }

  if (draftResults) {
    draftResults.addEventListener("change", (ev) => {
      const sel = ev.target && ev.target.closest ? ev.target.closest("#draft-archetype-filter") : null;
      if (!sel) return;
      draftState.filter = sel.value || "all";
      update();
    });
    draftResults.addEventListener("click", (ev) => {
      const compareBtn = ev.target && ev.target.closest ? ev.target.closest(".draft-compare-btn") : null;
      if (compareBtn) {
        const id = compareBtn.dataset.id;
        if (!id) return;
        const has = draftState.compareIds.includes(id);
        if (has) draftState.compareIds = draftState.compareIds.filter((x) => x !== id);
        else if (draftState.compareIds.length < 2) draftState.compareIds.push(id);
        else draftState.compareIds = [draftState.compareIds[1], id];
        update();
        return;
      }
      const card = ev.target && ev.target.closest ? ev.target.closest(".draft-pool-card") : null;
      if (!card) return;
      const id = card.dataset.id;
      if (!id) return;
      draftState.selectedId = id;
      update();
    });
  }

  function renderRecLoadMore(totalCount) {
    const panel = document.getElementById("current-recs-panel");
    if (!panel) return;
    let wrap = document.getElementById("recs-loadmore-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "recs-loadmore-wrap";
      wrap.className = "recs-loadmore-wrap";
      panel.appendChild(wrap);
    }
    if (totalCount <= recVisibleCount) {
      wrap.innerHTML = "";
      return;
    }
    wrap.innerHTML = `<button type="button" class="draft-compare-btn is-on" id="recs-loadmore-btn">Load more</button>`;
    const btn = document.getElementById("recs-loadmore-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        recVisibleCount += 5;
        update();
      });
    }
  }

  renderTeamOptions(teams, standings, (abbr) => {
    selectedAbbr = abbr;
    recVisibleCount = 5;
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
      if (draftResults) draftResults.innerHTML = "";
      renderRecLoadMore(0);
      setPickerCollapsed(false);
      return;
    }
    const team = teams.find((t) => t.team_abbr === selectedAbbr);
    if (!team) {
      setEmptyState(true);
      if (currentPanel) currentPanel.classList.remove("is-team-selected");
      if (pickedTeam) pickedTeam.textContent = "";
      if (rosterEl) rosterEl.innerHTML = "";
      if (draftResults) draftResults.innerHTML = "";
      renderRecLoadMore(0);
      setPickerCollapsed(false);
      return;
    }
    setEmptyState(false);
    setActiveModule(activeModule);
    if (currentPanel) currentPanel.classList.add("is-team-selected");
    if (pickedTeam) pickedTeam.textContent = `已选：${team.team_name}`;
    syncCurrentTeamPicker(selectedAbbr);
    const data = analyzeTeam(team, avgs);
    renderRadar(team, avgs);
    renderCurrentDetailCharts(team, avgs);
    renderCurrentRoster(rosterEl, selectedAbbr, players);
    renderWeaknesses(weaknessBlock, tagsEl, data);
    const phase = resolveTeamPhase(team, standings, players);
    const needs = computeTeamNeeds(team, avgs);
    const needBars = topNeedBars(needs, 2);
    const recs = recommend(team, players, data.weaknesses, avgs, phase);
    renderRecs(recList, recs.slice(0, recVisibleCount), { phaseLabel: phase.label, needBars });
    renderRecLoadMore(recs.length);

    // Draft：头像池选择 + 影响模拟 + A/B 对比
    if (draftResults) {
      const needs = computeTeamNeeds(team, avgs);
      const pick = pickDraftTypeFromNeeds(needs);
      const topNeed = rankNeedKeys(needs)[0];
      const allTypes = listDraftTypes();
      const prospects = normalizeDraftProspects(window.__CURRENT_DRAFT_POOL || []);
      const weights = buildNeedWeightsFromNeeds(needs);
      const ranges = buildPlayerRanges(prospects);
      const scoredAll = prospects
        .map((p) => {
          const fit = scorePlayer(p, team, weights, ranges).score;
          const draftScore = clamp(fit * num(p.potential, 1), 0, 120);
          return { p, fit, draftScore };
        })
        .sort((a, b) => b.draftScore - a.draftScore);

      const archetypes = [...new Set(scoredAll.map((x) => x.p.archetype).filter(Boolean))].sort();
      const visible = scoredAll
        .filter((x) => draftState.filter === "all" || x.p.archetype === draftState.filter)
        .sort((a, b) => num(a.p.draft_rank, 999) - num(b.p.draft_rank, 999));

      if (!draftState.selectedId && visible.length) draftState.selectedId = visible[0].p.id;
      if (draftState.selectedId && !scoredAll.some((x) => x.p.id === draftState.selectedId)) draftState.selectedId = visible[0]?.p.id || "";
      draftState.compareIds = draftState.compareIds.filter((id) => scoredAll.some((x) => x.p.id === id));

      const selected = scoredAll.find((x) => x.p.id === draftState.selectedId) || visible[0] || null;
      const selectedImpact = selected ? computeDraftImpact(team, avgs, selected.p) : null;
      const selectedExplain = selectedImpact ? buildDraftImpactExplanation(selectedImpact) : [];
      const compare = draftState.compareIds
        .map((id) => scoredAll.find((x) => x.p.id === id))
        .filter(Boolean)
        .slice(0, 2);

      const renderImpactRows = (impact) => {
        if (!impact) return "";
        const rows = [
          { label: "3PT%", before: `${fmt2(impact.before.fg3_pct * 100)}%`, after: `${fmt2(impact.after.fg3_pct * 100)}%`, delta: `${impact.delta.fg3_pp >= 0 ? "+" : ""}${fmt2(impact.delta.fg3_pp)}pp`, good: impact.delta.fg3_pp >= 0 },
          { label: "ORtg", before: fmt2(impact.before.ortg), after: fmt2(impact.after.ortg), delta: `${impact.delta.ortg >= 0 ? "+" : ""}${fmt2(impact.delta.ortg)}`, good: impact.delta.ortg >= 0 },
          { label: "DRtg", before: fmt2(impact.before.drtg), after: fmt2(impact.after.drtg), delta: `${impact.delta.drtg >= 0 ? "+" : ""}${fmt2(impact.delta.drtg)}`, good: impact.delta.drtg <= 0 },
          { label: "REB", before: fmt2(impact.before.reb), after: fmt2(impact.after.reb), delta: `${impact.delta.reb >= 0 ? "+" : ""}${fmt2(impact.delta.reb)}`, good: impact.delta.reb >= 0 },
          { label: "AST", before: fmt2(impact.before.ast), after: fmt2(impact.after.ast), delta: `${impact.delta.ast >= 0 ? "+" : ""}${fmt2(impact.delta.ast)}`, good: impact.delta.ast >= 0 },
          { label: "TOV", before: fmt2(impact.before.tov), after: fmt2(impact.after.tov), delta: `${impact.delta.tov >= 0 ? "+" : ""}${fmt2(impact.delta.tov)}`, good: impact.delta.tov <= 0 },
        ];
        return rows
          .map(
            (r) => `<tr>
              <td>${r.label}</td>
              <td>${r.before}</td>
              <td>${r.after}</td>
              <td class="${r.good ? "is-up" : "is-down"}">${r.delta}</td>
            </tr>`
          )
          .join("");
      };

      draftResults.innerHTML = `
        <div class="draft-card draft-card--sim">
          <div class="draft-title">最佳适配类型：<span class="draft-type">${pick.type}</span></div>
          <div class="draft-type-list" aria-label="选秀类型列表">
            ${allTypes
              .map(
                (item) =>
                  `<span class="draft-type-pill ${item.key === topNeed ? "is-active" : ""}">${item.type}</span>`
              )
              .join("")}
          </div>
          <div class="draft-need-strip">
            <span class="draft-need-label">短板优先级</span>
            <span class="draft-need-value">${needLabel(topNeed)}</span>
          </div>
          <div class="draft-need-chips">
            ${(pick.why || []).map((x) => `<span class="draft-need-chip">${x}</span>`).join("")}
          </div>

          <div class="draft-sim-layout">
            <section class="draft-pool">
              <div class="draft-reason-title">🏀 Draft Pool</div>
              <div class="draft-pool-toolbar">
                <label for="draft-archetype-filter">类型筛选</label>
                <select id="draft-archetype-filter">
                  <option value="all" ${draftState.filter === "all" ? "selected" : ""}>全部类型</option>
                  ${archetypes.map((a) => `<option value="${a}" ${draftState.filter === a ? "selected" : ""}>${a}</option>`).join("")}
                </select>
              </div>
              <div class="draft-pool-grid">
                ${visible
                  .slice(0, 60)
                  .map(({ p, draftScore }) => {
                    const fallback = grayPersonAvatarDataUrl();
                    const avatar = draftAvatarFromUrl(p.avatar_url) || fallback;
                    const selectedCls = draftState.selectedId === p.id ? "is-selected" : "";
                    const compared = draftState.compareIds.includes(p.id);
                    return `<article class="draft-pool-card ${selectedCls}" data-id="${p.id}">
                      <img src="${avatar}" alt="${p.player_name}" class="draft-pool-card__avatar" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='${fallback.replace(
                        /'/g,
                        "%27"
                      )}'" />
                      <div class="draft-pool-card__meta">
                        <div class="draft-pool-card__name">${p.player_name}</div>
                        <div class="draft-pool-card__sub">#${num(p.draft_rank, 0)} · ${p.pos} · ${p.archetype}</div>
                        <div class="draft-pool-card__tags">
                          <span class="role-badge">${p.risk}</span>
                          <span class="draft-score-chip">Score ${draftScore.toFixed(1)}</span>
                        </div>
                      </div>
                      <button type="button" class="draft-compare-btn ${compared ? "is-on" : ""}" data-action="compare" data-id="${p.id}">
                        ${compared ? "已对比" : "加入对比"}
                      </button>
                    </article>`;
                  })
                  .join("")}
              </div>
            </section>

            <section class="draft-impact">
              <div class="draft-reason-title">📊 Draft Impact（Before vs After）</div>
              ${
                selected
                  ? `<div class="draft-impact__pick">当前选择：<strong>${selected.p.player_name}</strong> · ${selected.p.pos} · <span class="role-badge">${selected.p.archetype}</span></div>
                     <table class="draft-impact-table">
                       <thead><tr><th>指标</th><th>Before</th><th>After</th><th>变化</th></tr></thead>
                       <tbody>${renderImpactRows(selectedImpact)}</tbody>
                     </table>
                     <div class="draft-reason-title">🧠 Impact Explanation</div>
                     <ul class="draft-bullets">${selectedExplain.map((x) => `<li>${x}</li>`).join("")}</ul>`
                  : `<p class="draft-empty">请先从 Draft Pool 选择一名新秀。</p>`
              }

              <div class="draft-reason-title">🆚 Prospect Compare</div>
              ${
                compare.length >= 2
                  ? (() => {
                      const a = compare[0];
                      const b = compare[1];
                      const ia = computeDraftImpact(team, avgs, a.p);
                      const ib = computeDraftImpact(team, avgs, b.p);
                      const row = (label, va, vb, goodHigher = true) => {
                        const aa = num(va);
                        const bb = num(vb);
                        const aCls = goodHigher ? (aa >= bb ? "is-up" : "is-down") : aa <= bb ? "is-up" : "is-down";
                        const bCls = goodHigher ? (bb >= aa ? "is-up" : "is-down") : bb <= aa ? "is-up" : "is-down";
                        return `<tr><td>${label}</td><td class="${aCls}">${fmt2(aa)}</td><td class="${bCls}">${fmt2(bb)}</td></tr>`;
                      };
                      return `<table class="draft-impact-table">
                        <thead><tr><th>指标</th><th>${a.p.player_name}</th><th>${b.p.player_name}</th></tr></thead>
                        <tbody>
                          ${row("Shooting Impact (pp)", ia.delta.fg3_pp, ib.delta.fg3_pp, true)}
                          ${row("Defense Impact", -ia.delta.drtg, -ib.delta.drtg, true)}
                          ${row("Playmaking Impact", ia.delta.ast, ib.delta.ast, true)}
                          ${row("Rebound Impact", ia.delta.reb, ib.delta.reb, true)}
                        </tbody>
                      </table>`;
                    })()
                  : `<p class="draft-empty">可在卡池中点“加入对比”，最多选择 2 名进行 A/B 比较。</p>`
              }
            </section>
          </div>
        </div>
      `;
    }

  }

  window.refreshCurrentSeason = update;

  // 与历史 Tab 一致：进入时不自动选队，不自动渲染内容
}

function initHeroScroll() {
  const hero = document.querySelector(".hero-landing");
  if (!hero) return;
  let ticking = false;
  function update() {
    const h = hero.offsetHeight || 1;
    const p = Math.min(1, Math.max(0, window.scrollY / (h * 0.52)));
    document.documentElement.style.setProperty("--hero-progress", String(p));
    ticking = false;
  }
  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", update, { passive: true });
  update();
}

document.addEventListener("DOMContentLoaded", initHeroScroll);
document.addEventListener("DOMContentLoaded", main);

