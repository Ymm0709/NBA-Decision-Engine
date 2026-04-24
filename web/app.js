/**
 * NBA 球队短板分析 + 自由球员/角色球员推荐（纯前端，读取 ../data/*.csv）
 */

const LEAGUE_KEYS = ["ortg", "drtg", "fg3_pct", "reb", "ast", "tov", "stl", "blk"];
const PLAYER_BASELINE_KEYS = ["fg3_pct", "reb", "ast", "tov", "stl", "blk"];
const TEAM_PHASE_PROFILES = {
  contend: {
    label: "争冠窗口",
    needMul: { shooting: 1.18, rebounding: 1.05, defense: 1.25, playmaking: 1.06, turnover_penalty: 1.2 },
    poolBias: { free_agent: 1.5, role: 0.7 },
    styleTarget: "慢半场执行 + 防守稳定性 + 关键回合终结",
    styleExample: "风格参考：偏向尼克斯/凯尔特人式的高执行阵地战与错位惩罚。",
  },
  rebuild: {
    label: "重建期",
    needMul: { shooting: 1.0, rebounding: 1.08, defense: 1.1, playmaking: 1.28, turnover_penalty: 0.88 },
    poolBias: { free_agent: 0.3, role: 1.6 },
    styleTarget: "提高节奏 + 放大学习样本 + 培养持球开发",
    styleExample: "风格参考：偏向马刺/活塞近年试错式开发，让年轻核心在高回合中成长。",
  },
  youth: {
    label: "年轻化过渡",
    needMul: { shooting: 1.22, rebounding: 0.98, defense: 1.12, playmaking: 1.14, turnover_penalty: 0.95 },
    poolBias: { free_agent: 0.4, role: 1.35 },
    styleTarget: "外线空间 + 换防机动 + 转换提速",
    styleExample: "风格参考：偏向雷霆/魔术的年轻化机动轮换，优先两端活力。",
  },
};

const TEAM_FIXED_PHASE_BY_ABBR = {
  BOS: "contend",
  DEN: "contend",
  NYK: "contend",
  PHI: "contend",
  MIL: "contend",
  LAL: "contend",
  LAC: "contend",
  MIN: "contend",
  CLE: "contend",
  MIA: "contend",
  DAL: "contend",
  PHX: "contend",
  SAC: "contend",
  NOP: "contend",
  GSW: "contend",
  MEM: "contend",
  IND: "contend",

  OKC: "youth",
  ORL: "youth",
  HOU: "youth",
  SAS: "youth",
  CHA: "youth",
  POR: "youth",
  ATL: "youth",
  TOR: "youth",
  CHI: "youth",

  DET: "rebuild",
  WAS: "rebuild",
  UTA: "rebuild",
  BKN: "rebuild",
};

const TEAM_IDENTITY_BY_ABBR = {
  SAS: { family: "system_offense", label: "进攻体系型", note: "潜力培养 / 组织体系重建" },
  DEN: { family: "system_offense", label: "进攻体系型", note: "体系稳定 + 传导进攻" },
  IND: { family: "system_offense", label: "进攻体系型", note: "高节奏进攻 / 快速推进" },
  SAC: { family: "system_offense", label: "进攻体系型", note: "进攻优先 / 空间+节奏" },

  LAL: { family: "star_driven", label: "球星驱动型", note: "老将+持球核心依赖" },
  DAL: { family: "star_driven", label: "球星驱动型", note: "单核持球（Doncic体系）" },
  MIL: { family: "star_driven", label: "球星驱动型", note: "内外双核驱动" },
  LAC: { family: "star_driven", label: "球星驱动型", note: "多持球点轮换体系" },

  MIA: { family: "defense_first", label: "防守优先型", note: "防守纪律 + 体系拼图" },
  BOS: { family: "defense_first", label: "防守优先型", note: "双向均衡 + 换防体系" },
  CLE: { family: "defense_first", label: "防守优先型", note: "内线防守优先" },
  ORL: { family: "defense_first", label: "防守优先型", note: "年轻防守成长型" },

  GSW: { family: "spacing_modern", label: "外线空间型", note: "三分体系 + 无球跑动" },
  HOU: { family: "spacing_modern", label: "外线空间型", note: "年轻空间重建" },
  OKC: { family: "spacing_modern", label: "外线空间型", note: "外线+防守均衡成长" },
  MIN: { family: "spacing_modern", label: "外线空间型", note: "防守+空间混合" },

  CHA: { family: "rebuild_dev", label: "重建/发展型", note: "年轻球员培养" },
  DET: { family: "rebuild_dev", label: "重建/发展型", note: "重建 + 潜力优先" },
  UTA: { family: "rebuild_dev", label: "重建/发展型", note: "资产重建 + 多方向发展" },
  WAS: { family: "rebuild_dev", label: "重建/发展型", note: "无明确体系（实验型）" },

  TOR: { family: "structure_piece", label: "结构拼图型", note: "位置灵活 + 拼图系统" },
  CHI: { family: "structure_piece", label: "结构拼图型", note: "中规中矩体系补强" },
  BKN: { family: "structure_piece", label: "结构拼图型", note: "不稳定结构重组" },
  PHI: { family: "structure_piece", label: "结构拼图型", note: "围绕核心补强体系" },

  NYK: { family: "slow_defense", label: "防守+慢节奏型", note: "半场防守 + 低节奏" },
  MEM: { family: "slow_defense", label: "防守+慢节奏型", note: "防守+身体对抗" },
  NOP: { family: "slow_defense", label: "防守+慢节奏型", note: "天赋+波动体系" },
};

const IDENTITY_STYLE_WEIGHTS = {
  onball_primary_core: { system_offense: 1.05, star_driven: 1.4, defense_first: 0.75, spacing_modern: 1.05, rebuild_dev: 1.15, structure_piece: 0.85, slow_defense: 0.95 },
  system_connector: { system_offense: 1.3, star_driven: 0.8, defense_first: 0.9, spacing_modern: 1.0, rebuild_dev: 1.0, structure_piece: 1.2, slow_defense: 0.9 },
  onball_creator: { system_offense: 1.1, star_driven: 1.3, defense_first: 0.8, spacing_modern: 1.0, rebuild_dev: 1.1, structure_piece: 0.9, slow_defense: 0.9 },
  spacer_runner: { system_offense: 1.2, star_driven: 1.1, defense_first: 0.9, spacing_modern: 1.35, rebuild_dev: 1.0, structure_piece: 1.1, slow_defense: 0.9 },
  defense_anchor_big: { system_offense: 0.95, star_driven: 1.0, defense_first: 1.35, spacing_modern: 0.95, rebuild_dev: 1.0, structure_piece: 1.1, slow_defense: 1.25 },
  two_way_wing: { system_offense: 1.1, star_driven: 1.15, defense_first: 1.3, spacing_modern: 1.2, rebuild_dev: 1.0, structure_piece: 1.25, slow_defense: 1.2 },
  energy_developer: { system_offense: 0.9, star_driven: 0.8, defense_first: 0.9, spacing_modern: 1.0, rebuild_dev: 1.35, structure_piece: 0.9, slow_defense: 0.95 },
  utility_piece: { system_offense: 1.0, star_driven: 1.0, defense_first: 1.0, spacing_modern: 1.0, rebuild_dev: 1.0, structure_piece: 1.05, slow_defense: 1.0 },
};
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

function normalizeTeamAbbr(abbr) {
  const t = String(abbr || "")
    .trim()
    .toUpperCase();
  return TEAM_LOGO_ALIASES[t] || t;
}

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

function playerAvatarUrl(p) {
  const direct = String(p?.avatar_url || "").trim();
  if (direct) return encodeURI(direct);
  const id = String(p?.player_id || "").trim();
  if (!id) return "";
  // nba_api 口径：player_id 为纯数字
  if (/^\d+$/.test(id)) return `https://cdn.nba.com/headshots/nba/latest/1040x760/${id}.png`;
  // BR 口径：player_id 为形如 doncilu01
  return `https://www.basketball-reference.com/req/202106291/images/headshots/${encodeURIComponent(id)}.jpg`;
}

function buildAvatarLookup(players) {
  const byId = new Map();
  const byName = new Map();
  for (const p of players || []) {
    const id = String(p?.player_id || "").trim();
    const name = String(p?.player_name || "")
      .trim()
      .toLowerCase();
    const avatar = String(playerAvatarUrl(p) || "").trim();
    if (!avatar) continue;
    if (id && !byId.has(id)) byId.set(id, avatar);
    if (name && !byName.has(name)) byName.set(name, avatar);
  }
  return { byId, byName };
}

function withSharedAvatar(player, avatarLookup) {
  const p = player || {};
  const direct = String(p.avatar_url || "").trim();
  const byId = avatarLookup?.byId;
  const byName = avatarLookup?.byName;
  const id = String(p.player_id || "").trim();
  const name = String(p.player_name || "")
    .trim()
    .toLowerCase();
  const shared = (id && byId?.get(id)) || (name && byName?.get(name)) || "";
  if (!shared && direct) return p;
  if (!shared) return p;
  // 共享头像优先：即便原数据有 BR 头像，也优先复用队内头像源，减少失效概率。
  return { ...p, avatar_url: shared };
}

function reliableFg3Pct(p) {
  const v = num(p?.fg3_pct, -1);
  if (v < 0 || v > 1) return null;
  if (v >= 0.8) return null;
  return v;
}

function posSpacingVolumeThreshold(pos) {
  const p = String(pos || "").toUpperCase();
  if (p.includes("PG") || p.includes("SG")) return 4;
  if (p.includes("SF") || p.includes("PF")) return 3;
  return 2;
}

function posSeason3paThreshold(pos) {
  const p = String(pos || "").toUpperCase();
  if (p.includes("PG") || p.includes("SG")) return 180;
  if (p.includes("SF") || p.includes("PF")) return 120;
  return 70;
}

function hasSpacingRoleSupport(p) {
  const roleText = `${String(p?.archetype || "")} ${String(p?.role || "")}`.toLowerCase();
  return (
    roleText.includes("stretch") ||
    roleText.includes("floor spacer") ||
    roleText.includes("spacer") ||
    roleText.includes("shooter") ||
    roleText.includes("空间")
  );
}

/**
 * 当前源数据无 3PA 字段，使用保守估算并叠加门槛，避免小样本高命中率“作弊”。
 */
function estimateFg3VolumePerGame(p) {
  const pos = String(p?.pos || "").toUpperCase();
  const pts = num(p?.pts);
  const mpg = num(p?.mpg);
  const ast = num(p?.ast);
  const reb = num(p?.reb);
  let est = 0.25 + pts * 0.11 + mpg * 0.03 + ast * 0.04 - reb * 0.03;
  if (pos.includes("PG") || pos.includes("SG")) est += 0.9;
  else if (pos.includes("SF") || pos.includes("PF")) est += 0.45;
  if (hasSpacingRoleSupport(p)) est += 0.85;
  return clamp(est, 0, 9);
}

function spacingGuardrail(p, avgs) {
  const fg3 = reliableFg3Pct(p);
  if (fg3 == null) {
    return { effectiveFg3: null, reliability: 0, reason: "三分命中率样本不足/异常，空间分降权" };
  }
  const threshold = posSpacingVolumeThreshold(p?.pos);
  const estimated3pa = estimateFg3VolumePerGame(p);
  const season3paThreshold = posSeason3paThreshold(p?.pos);
  const season3paEstimate = estimated3pa * Math.max(0, num(p?.gp));
  const meetsVolume = estimated3pa >= threshold;
  const meetsSeasonVolume = season3paEstimate >= season3paThreshold;
  const meetsEfficiency = fg3 >= num(avgs?.fg3_pct) - 0.015;
  const roleSupported = hasSpacingRoleSupport(p);
  const gp = num(p?.gp);
  const mpg = num(p?.mpg);
  const sampleOk = gp >= 20 && mpg >= 14;

  let reliability = 1;
  if (!sampleOk) reliability *= 0.62;
  if (!meetsVolume) reliability *= 0.38;
  if (!meetsSeasonVolume) reliability *= 0.34;
  if (!meetsEfficiency) reliability *= 0.48;
  if (!roleSupported) reliability *= 0.72;
  reliability = clamp(reliability, 0.1, 1);

  const leagueFg3 = num(avgs?.fg3_pct);
  const effectiveFg3 = leagueFg3 + (fg3 - leagueFg3) * reliability;
  const reason = `3PA门槛 ${threshold.toFixed(0)}，估算 ${fmt2(estimated3pa)}；赛季3PA门槛 ${season3paThreshold}，估算 ${fmt2(
    season3paEstimate
  )}；命中率 ${
    meetsEfficiency ? "达标" : "偏低"
  }；角色标签${roleSupported ? "匹配" : "不足"}。`;
  return { effectiveFg3, reliability, reason };
}

function roleLabelForPlayer(p, avgs) {
  const pos = String(p.pos || "").toUpperCase();
  const pts = num(p.pts);
  const reb = num(p.reb);
  const ast = num(p.ast);
  const fg3 = reliableFg3Pct(p);
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

  if (isBig && (blk >= 1.2 || defEvents >= aDefEvents + 0.65)) return "护框内线";
  if (isGuard && pts >= 18 && ast >= aAst + 2.2) return "持球大核";
  if (isWing && fg3 != null && fg3 >= aFg3 + 0.012 && (stl >= 1.0 || defEvents >= aDefEvents + 0.25)) return "3D 侧翼";
  if (isGuard && ast >= aAst + 1.2 && tov <= aTov + 0.2) return "副持球组织点";
  if (fg3 != null && fg3 >= aFg3 + 0.018 && ast <= aAst - 0.6) return "空间射手";
  if (isBig && fg3 != null && fg3 >= aFg3 + 0.012) return "空间型内线";
  if (isBig && reb >= aReb + 1.6) return "篮板型内线";
  return isWing ? "双向侧翼" : "轮换拼图";
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

function imputeProspectSkills(raw) {
  const pos = String(raw.pos || "").trim() || "--";
  const group = draftPosGroup(pos);
  const pts = num(raw.pts, 0);
  const reb = num(raw.reb, 0);
  const ast = num(raw.ast, 0);
  const pot = num(raw.potential, 1);
  const potBoost = clamp((pot - 1) / 0.28, 0, 1); // normalize 1.00~1.28 → 0~1

  // If these stats are already present (non-zero), keep them.
  let fg3 = num(raw.fg3_pct, 0);
  let stl = num(raw.stl, 0);
  let blk = num(raw.blk, 0);
  let tov = num(raw.tov, 0);

  const missingFg3 = !(fg3 > 0 && fg3 < 1);
  const missingDef = stl <= 0 && blk <= 0;
  const missingTov = tov <= 0;

  // Heuristics: create distinct “skill fingerprints” from P/R/A + position.
  // These are not meant to be scouting-accurate; they are to avoid uniform cards when source lacks full box-score stats.
  if (missingFg3) {
    if (group === "guard") fg3 = clamp(0.31 + (pts - 14) * 0.002 + ast * 0.004 + potBoost * 0.03, 0.26, 0.43);
    else if (group === "forward") fg3 = clamp(0.29 + (pts - 15) * 0.0018 + ast * 0.002 + potBoost * 0.02, 0.24, 0.41);
    else fg3 = clamp(0.22 + (pts - 14) * 0.0012 + potBoost * 0.015, 0.12, 0.36);
  }

  if (missingDef) {
    if (group === "guard") {
      stl = clamp(0.65 + ast * 0.06 + potBoost * 0.22, 0.4, 1.8);
      blk = clamp(0.10 + reb * 0.02 + potBoost * 0.06, 0.05, 0.8);
    } else if (group === "forward") {
      stl = clamp(0.55 + ast * 0.04 + potBoost * 0.18, 0.35, 1.6);
      blk = clamp(0.35 + reb * 0.05 + potBoost * 0.18, 0.15, 2.1);
    } else {
      stl = clamp(0.35 + ast * 0.03 + potBoost * 0.12, 0.2, 1.2);
      blk = clamp(0.85 + reb * 0.07 + potBoost * 0.35, 0.4, 3.2);
    }
  }

  if (missingTov) {
    if (group === "guard") tov = clamp(1.2 + ast * 0.35 + pts * 0.03 - potBoost * 0.15, 0.8, 3.8);
    else if (group === "forward") tov = clamp(1.05 + ast * 0.26 + pts * 0.025 - potBoost * 0.12, 0.7, 3.2);
    else tov = clamp(0.95 + ast * 0.18 + pts * 0.02 - potBoost * 0.10, 0.6, 2.8);
  }

  // Give rookies a slightly different “minutes weight” by role/usage.
  const mpg = clamp(
    18 + pts * 0.35 + ast * (group === "guard" ? 0.6 : 0.35) + reb * (group === "center" ? 0.35 : 0.18),
    14,
    30
  );

  return { fg3_pct: fg3, stl, blk, tov, mpg };
}

function normalizeDraftProspects(poolRaw) {
  return (Array.isArray(poolRaw) ? poolRaw : [])
    .map((r, idx) => {
      const name = String(r.name || "").trim();
      const pos = String(r.position || "").trim() || "--";
      const school = String(r.school || "").trim();
      const id = String(r.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `prospect-${idx}`);
      const draftRank = Number.isFinite(Number(r.rank)) ? Number(r.rank) : idx + 1;
      const base = {
        id,
        draft_rank: draftRank,
        player_name: name,
        pos,
        school,
        pts: num(r.pts, num(r.ppg)),
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
      };
      const imputed = imputeProspectSkills(base);
      return { ...base, ...imputed };
    })
    .filter((p) => p.player_name);
}

function draftPosGroup(pos) {
  const p = String(pos || "").toUpperCase();
  if (p.includes("C")) return "center";
  if (p.includes("PF") || p.includes("SF") || (p.includes("F") && !p.includes("G"))) return "forward";
  return "guard";
}

function inferProspectType(prospect) {
  const group = draftPosGroup(prospect?.pos);
  const fg3 = num(prospect?.fg3_pct);
  const reb = num(prospect?.reb);
  const ast = num(prospect?.ast);
  const stl = num(prospect?.stl);
  const blk = num(prospect?.blk);
  const defEvents = stl + blk;

  // Impact biases: allow both positive/negative by archetype.
  const mk = (name, bias) => ({ name, bias });

  if (group === "guard") {
    if (fg3 >= 0.375 && ast >= 4.2) return mk("Combo Creator Shooter", { shoot: 0.16, ast: 0.14, tov: -0.05, reb: -0.03, def: -0.02 });
    if (ast >= 5.2) return mk("Primary Creator Guard", { shoot: -0.04, ast: 0.2, tov: -0.09, reb: -0.04, def: -0.02 });
    if (fg3 >= 0.39 && ast < 3.2) return mk("Off-ball Shooter Guard", { shoot: 0.2, ast: -0.03, tov: 0.03, reb: -0.04, def: -0.02 });
    if (defEvents >= 2.2) return mk("POA Defender Guard", { shoot: -0.05, ast: 0.02, tov: 0.01, reb: 0.01, def: 0.16 });
    return mk("Scoring Guard", { shoot: 0.06, ast: 0.04, tov: -0.04, reb: -0.03, def: -0.03 });
  }

  if (group === "forward") {
    if (fg3 >= 0.365 && defEvents >= 1.9) return mk("3-and-D Wing", { shoot: 0.16, ast: -0.01, tov: 0.02, reb: 0.02, def: 0.14 });
    if (fg3 >= 0.355 && reb >= 7.2) return mk("Stretch Four Rebounder", { shoot: 0.14, ast: -0.01, tov: 0.01, reb: 0.13, def: 0.02 });
    if (ast >= 4.2) return mk("Point Forward", { shoot: -0.02, ast: 0.17, tov: -0.06, reb: 0.03, def: 0.02 });
    if (reb >= 8.6 && fg3 < 0.31) return mk("Interior Finisher Forward", { shoot: -0.16, ast: -0.03, tov: 0.01, reb: 0.16, def: 0.05 });
    return mk("Two-way Forward", { shoot: 0.03, ast: 0.03, tov: 0.01, reb: 0.06, def: 0.08 });
  }

  // center
  if (fg3 < 0.285 && reb >= 9.0 && blk >= 1.3) return mk("Rim Protector Roller", { shoot: -0.2, ast: -0.04, tov: -0.03, reb: 0.2, def: 0.18 });
  if (fg3 >= 0.34) return mk("Stretch Five", { shoot: 0.18, ast: 0.03, tov: 0.01, reb: -0.04, def: -0.03 });
  if (ast >= 3.4) return mk("Hub Center", { shoot: -0.05, ast: 0.16, tov: -0.05, reb: 0.03, def: 0.03 });
  if (reb < 7.0 && fg3 < 0.29) return mk("Project Big", { shoot: -0.14, ast: -0.05, tov: -0.05, reb: -0.08, def: -0.04 });
  return mk("Mobile Big", { shoot: -0.06, ast: 0.02, tov: 0.0, reb: 0.08, def: 0.1 });
}

function applyPotentialToDelta(raw, weight, potNorm) {
  // High potential amplifies strengths and slightly softens weaknesses (but does NOT remove negatives).
  if (raw >= 0) return raw * weight * (1 + potNorm * 0.26);
  return raw * weight * (1 - potNorm * 0.12);
}

function rookieBaselineByPos(group) {
  // Position-level rookie baselines (not league-average veterans).
  // Using these as reference avoids "everyone is negative" on AST/DEF.
  if (group === "guard") {
    return { fg3_pct: 0.335, reb: 3.6, ast: 3.8, def_events: 1.7, tov: 2.1 };
  }
  if (group === "forward") {
    return { fg3_pct: 0.325, reb: 5.6, ast: 2.5, def_events: 1.9, tov: 1.8 };
  }
  return { fg3_pct: 0.295, reb: 8.2, ast: 1.9, def_events: 2.2, tov: 1.7 }; // center
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
  const potNorm = clamp((pot - 1) / 0.28, 0, 1);
  const group = draftPosGroup(prospect.pos);
  const pType = inferProspectType(prospect);
  const rookieBase = rookieBaselineByPos(group);

  // Marginal value relative to same-position rookie baseline
  const shootDeltaRaw = num(prospect.fg3_pct) - rookieBase.fg3_pct;
  const rebDeltaRaw = num(prospect.reb) - rookieBase.reb;
  const astDeltaRaw = num(prospect.ast) - rookieBase.ast;
  const defDeltaRaw = num(prospect.stl) + num(prospect.blk) - rookieBase.def_events;
  const tovDeltaRaw = num(prospect.tov) - rookieBase.tov;

  // Team-need scaling: if a team is weak in one area, rookie impact in that area is slightly larger.
  const needShoot = clamp((num(avgs.fg3_pct) - before.fg3_pct) / 0.08, -0.45, 0.65);
  const needReb = clamp((num(avgs.reb) - before.reb) / 7, -0.45, 0.65);
  const needAst = clamp((num(avgs.ast) - before.ast) / 7, -0.45, 0.65);
  const needDef = clamp(((before.drtg - num(avgs.drtg)) + (num(avgs.stl) + num(avgs.blk) - before.def_events)) / 8, -0.45, 0.65);
  const needCare = clamp((before.tov - num(avgs.tov)) / 6, -0.45, 0.65);

  const byPos = {
    guard: { shoot: 0.22, reb: 0.14, ast: 0.26, def: 0.2, tov: 0.2 },
    forward: { shoot: 0.2, reb: 0.23, ast: 0.2, def: 0.22, tov: 0.17 },
    center: { shoot: 0.14, reb: 0.29, ast: 0.14, def: 0.28, tov: 0.14 },
  }[group];

  // Rookie role share in team impact (typically limited usage/minutes).
  const roleShare = clamp(num(prospect.mpg, 22) / 34, 0.45, 0.9);

  const shootDelta =
    (applyPotentialToDelta(shootDeltaRaw, byPos.shoot, potNorm) * (1 + needShoot * 0.25) + (pType.bias.shoot || 0) * 0.06) *
    roleShare;
  const rebDelta =
    (applyPotentialToDelta(rebDeltaRaw, byPos.reb, potNorm) * (1 + needReb * 0.25) + (pType.bias.reb || 0) * 0.45) *
    roleShare;
  const astDelta =
    (applyPotentialToDelta(astDeltaRaw, byPos.ast, potNorm) * (1 + needAst * 0.25) + (pType.bias.ast || 0) * 0.3) *
    roleShare;
  const defEventDelta =
    (applyPotentialToDelta(defDeltaRaw, byPos.def, potNorm) * (1 + needDef * 0.25) + (pType.bias.def || 0) * 0.35) *
    roleShare;
  const tovDelta =
    (applyPotentialToDelta(tovDeltaRaw, byPos.tov, potNorm) * (1 + needCare * 0.2) + (pType.bias.tov || 0) * 0.2) *
    roleShare;

  const after = {
    fg3_pct: clamp(before.fg3_pct + shootDelta, 0.24, 0.45),
    reb: clamp(before.reb + rebDelta, 36, 52),
    ast: clamp(before.ast + astDelta, 18, 34),
    tov: clamp(before.tov + tovDelta, 9.5, 17.5),
    def_events: clamp(before.def_events + defEventDelta, 8.5, 21),
    ortg: 0,
    drtg: 0,
  };

  // Non-linear interaction: non-shooting centers can improve glass/defense but hurt spacing.
  const nonSpacingBigPenalty = group === "center" && num(prospect.fg3_pct) < 0.29 ? 0.5 : 0;
  const lowRebBigPenalty = group === "center" && num(prospect.reb) < num(avgs.reb) ? (num(avgs.reb) - num(prospect.reb)) * 0.06 : 0;

  after.drtg = clamp(
    before.drtg - (after.def_events - before.def_events) * 0.92 - (after.reb - before.reb) * 0.12,
    103,
    123
  );
  after.ortg = clamp(
    before.ortg +
      (after.fg3_pct - before.fg3_pct) * 128 +
      (after.ast - before.ast) * 0.35 -
      (after.tov - before.tov) * 0.62 +
      (potNorm * 0.22 + (pType.bias.ast || 0) * 0.2) -
      nonSpacingBigPenalty -
      lowRebBigPenalty,
    103,
    126
  );

  // UX guardrail: avoid "all core dimensions down" in draft preview.
  // If shooting/defense/playmaking are all negative, force the player's best trait
  // to show at least a modest positive impact.
  const coreShoot = after.fg3_pct - before.fg3_pct;
  const coreDef = -(after.drtg - before.drtg); // positive means defensive improvement
  const corePlay = after.ast - before.ast;
  if (coreShoot < 0 && coreDef < 0 && corePlay < 0) {
    const shootTrait = num(prospect.fg3_pct) - num(avgs.fg3_pct);
    const defTrait = num(prospect.stl) + num(prospect.blk) - (num(avgs.stl) + num(avgs.blk));
    const playTrait = num(prospect.ast) - num(avgs.ast);
    const best = [
      { k: "shoot", v: shootTrait },
      { k: "def", v: defTrait },
      { k: "play", v: playTrait },
    ].sort((a, b) => b.v - a.v)[0];

    if (best.k === "shoot") {
      after.fg3_pct = Math.max(after.fg3_pct, before.fg3_pct + 0.003); // +0.3pp floor
    } else if (best.k === "def") {
      after.drtg = Math.min(after.drtg, before.drtg - 0.35);
    } else {
      after.ast = Math.max(after.ast, before.ast + 0.18);
    }
  }

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

function buildDraftGmInsight(impact) {
  // UI 口径：只描述提升点，避免“选了反而更菜”的感受
  const ups = [];
  if (impact.delta.fg3_pp >= 0.45) ups.push("improves spacing");
  if (-impact.delta.drtg >= 0.45) ups.push("adds defensive stability");
  if (impact.delta.ast >= 0.35) ups.push("adds secondary playmaking");
  if (!ups.length) return "This pick looks neutral on paper and is best viewed as a long-term development bet.";
  if (ups.length === 1) return `This pick ${ups[0]}.`;
  return `This pick ${ups[0]} and ${ups.slice(1).join(" and ")}.`;
}

function buildDraftUpsideDownsideRisk(impact, prospect) {
  const capDisplay = (v, cap) => clamp(num(v, 0), -cap, cap);
  const items = [
    { key: "外线投射", value: capDisplay(impact.delta.fg3_pp, 4), unit: "pp" },
    { key: "防守效率", value: capDisplay(-impact.delta.drtg, 3), unit: "" }, // drtg 越低越好，所以取反
    { key: "组织能力", value: capDisplay(impact.delta.ast, 3), unit: "" },
    { key: "篮板控制", value: capDisplay(impact.delta.reb, 3), unit: "" },
    { key: "失误控制", value: capDisplay(-impact.delta.tov, 2), unit: "" }, // tov 越低越好，所以取反
    { key: "进攻等级", value: capDisplay(impact.delta.ortg, 3), unit: "" },
  ];

  const ups = items
    .filter((x) => x.value > 0.03)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((x) => `${x.key}（+${fmt2(x.value)}${x.unit}）`);
  const downs = items
    .filter((x) => x.value < -0.03)
    .sort((a, b) => a.value - b.value)
    .slice(0, 3)
    .map((x) => `${x.key}（${fmt2(x.value)}${x.unit}）`);

  const riskTag = String(prospect?.risk || "").trim() || "Medium Risk";
  const posGroup = draftPosGroup(prospect?.pos);
  const riskReasons = [];
  if (impact.delta.fg3_pp < -0.35) riskReasons.push("外线空间适配");
  if (impact.delta.ast < -0.35) riskReasons.push("持球组织稳定性");
  if (impact.delta.reb < -0.4) riskReasons.push("篮板对抗");
  if (-impact.delta.drtg < -0.35) riskReasons.push("防守端即战力");
  if (-impact.delta.tov < -0.25) riskReasons.push("失误控制");

  // 位置侧重点：同为 High Ceiling，也给不同的风险落点
  if (posGroup === "guard" && !riskReasons.includes("失误控制") && num(prospect?.ast) < 3.2) {
    riskReasons.push("决策成熟度");
  }
  if (posGroup === "forward" && !riskReasons.includes("外线空间适配") && num(prospect?.fg3_pct) < 0.33) {
    riskReasons.push("投射稳定性");
  }
  if (posGroup === "center" && !riskReasons.includes("防守端即战力") && num(prospect?.blk) < 1.0) {
    riskReasons.push("护框强度");
  }

  const reasonText = riskReasons.length
    ? `主要不确定性在${riskReasons.slice(0, 2).join("、")}。`
    : "当前模型下无明显结构性短板。";

  let riskText = `成长曲线和即战力较均衡，属于常规风险档。${reasonText}`;
  if (/high/i.test(riskTag)) {
    riskText = `波动较大：上限高，但短期适配受阵容与使用方式影响。${reasonText}`;
  } else if (/medium/i.test(riskTag)) {
    riskText = `中等风险：需要时间打磨细节，轮换价值通常先于核心价值兑现。${reasonText}`;
  } else if (/nba ready|ready/i.test(riskTag)) {
    riskText = `即战力风险较低：短期更容易进入轮换，但长期上限取决于开发深度。${reasonText}`;
  }

  return {
    ups: ups.length ? ups : ["整体提升有限（模型显示多数维度接近持平）"],
    downs: downs.length ? downs : ["暂无明显下降项（模型阈值内）"],
    risk: `${riskTag} · ${riskText}`,
  };
}

function impactToPercent(value, scale, cap = 18) {
  // Smooth mapping to avoid many values collapsing to exactly +/-cap.
  // x in [-inf, +inf] -> [-cap, +cap], with gradual saturation.
  const x = num(value, 0) / Math.max(1e-6, scale);
  return cap * Math.tanh(x);
}

function emphasizePercent(v, minVisible = 0.8) {
  const x = num(v, 0);
  if (Math.abs(x) < 1e-6) return 0;
  if (Math.abs(x) < minVisible) return x > 0 ? minVisible : -minVisible;
  return x;
}

function computeDraftFitScore(impact, potential) {
  const scoreRaw =
    72 +
    impact.delta.fg3_pp * 2.2 +
    impact.delta.ortg * 2.4 +
    (-impact.delta.drtg) * 2.3 +
    impact.delta.ast * 2 +
    impact.delta.reb * 1.3 +
    (-impact.delta.tov) * 1.2 +
    (num(potential, 1) - 1) * 12;
  return Math.round(clamp(scoreRaw, 55, 99));
}

function draftGradeFromScore(score) {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "B-";
  if (score >= 65) return "C+";
  return "C";
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

function buildPlayerTeamHistoryMap(players) {
  const map = new Map();
  for (const p of players || []) {
    const id = String(p.player_id || "").trim();
    if (!id) continue;
    const team = String(p.team_abbr || "")
      .trim()
      .toUpperCase();
    if (!isNamedTeamStint(team)) continue;
    if (!map.has(id)) map.set(id, []);
    const seq = map.get(id);
    if (!seq.length || seq[seq.length - 1] !== team) seq.push(team);
  }
  return map;
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

function computePlayerAverages(players) {
  const latestRows = dedupePlayersCurrentStint(players || []);
  const qualified = latestRows.filter((p) => num(p.gp) >= 15 && num(p.mpg) >= 10);
  const source = qualified.length >= 80 ? qualified : latestRows;
  const avgs = {};
  for (const key of PLAYER_BASELINE_KEYS) {
    let sum = 0;
    let count = 0;
    for (const p of source) {
      const v = Number.parseFloat(p?.[key]);
      if (!Number.isFinite(v)) continue;
      sum += v;
      count += 1;
    }
    avgs[key] = count ? sum / count : 0;
  }
  return avgs;
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
  const fg3Gap = avgs.fg3_pct - num(team.fg3_pct);
  const rebGap = avgs.reb - num(team.reb);
  const defGap = num(team.drtg) - avgs.drtg;
  const evGap = (avgs.stl + avgs.blk) - (num(team.stl) + num(team.blk));
  const astGap = avgs.ast - num(team.ast);
  const ortgGap = avgs.ortg - num(team.ortg);
  const paceDelta = num(team.pace) - avgs.pace;

  const offense_need = clamp01(ortgGap / 4.5);
  const defense_need = clamp01((defGap / 4.0) * 0.68 + (evGap / 3.0) * 0.32);
  const spacing_need = clamp01(fg3Gap / 0.03);
  const playmaking_need = clamp01(astGap / 4.0);
  const rebounding_need = clamp01(rebGap / 4.0);
  const pace_identity = paceDelta >= 1.0 ? "fast" : paceDelta <= -1.0 ? "slow" : "balanced";

  // 兼容旧展示字段
  return {
    offense_need,
    defense_need,
    spacing_need,
    playmaking_need,
    rebounding_need,
    pace_identity,
    system_type: "structure_piece",
    shooting: spacing_need,
    defense: defense_need,
    playmaking: playmaking_need,
    rebounding: rebounding_need,
    turnover_penalty: clamp01((num(team.tov) - avgs.tov) / 3.0),
  };
}

function buildNeedWeightsFromNeeds(needs) {
  const base = 0.08;
  const spacing = num(needs.spacing_need, needs.shooting);
  const rebounding = num(needs.rebounding_need, needs.rebounding);
  const defense = num(needs.defense_need, needs.defense);
  const playmaking = num(needs.playmaking_need, needs.playmaking);
  const pos = {
    shooting: base + spacing,
    rebounding: base + rebounding,
    defense: base + defense,
    playmaking: base + playmaking,
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

function getTeamPhaseProfile(phase) {
  return TEAM_PHASE_PROFILES[phase] || TEAM_PHASE_PROFILES.contend;
}

function getFixedTeamPhase(teamAbbr) {
  const abbr = String(teamAbbr || "").toUpperCase();
  return TEAM_FIXED_PHASE_BY_ABBR[abbr] || "youth";
}

function applyTeamPhaseToNeeds(needs, phaseProfile) {
  const mul = (phaseProfile && phaseProfile.needMul) || {};
  const spacing_need = clamp01(num(needs.spacing_need, needs.shooting) * num(mul.shooting, 1));
  const rebounding_need = clamp01(num(needs.rebounding_need, needs.rebounding) * num(mul.rebounding, 1));
  const defense_need = clamp01(num(needs.defense_need, needs.defense) * num(mul.defense, 1));
  const playmaking_need = clamp01(num(needs.playmaking_need, needs.playmaking) * num(mul.playmaking, 1));
  const offense_need = clamp01((num(needs.offense_need) + spacing_need * 0.5 + playmaking_need * 0.5) / 2);
  return {
    offense_need,
    defense_need,
    spacing_need,
    playmaking_need,
    rebounding_need,
    pace_identity: needs.pace_identity || "balanced",
    system_type: needs.system_type || "structure_piece",
    shooting: spacing_need,
    rebounding: rebounding_need,
    defense: defense_need,
    playmaking: playmaking_need,
    turnover_penalty: clamp01(num(needs.turnover_penalty) * num(mul.turnover_penalty, 1)),
  };
}

function buildDynamicStyleTarget(team, avgs, needs, teamIdentity, phaseProfile) {
  const paceDelta = num(team.pace) - num(avgs.pace);
  const fg3Delta = num(team.fg3_pct) - num(avgs.fg3_pct);
  const defDelta = num(team.drtg) - num(avgs.drtg);
  const topNeed = rankNeedKeys(needs)[0] || "defense";
  const secondNeed = rankNeedKeys(needs)[1] || "shooting";

  const paceGoal =
    paceDelta <= -1.2
      ? "中速提档 + 半场执行并重"
      : paceDelta >= 1.2
      ? "控节奏降失误 + 提升半场成功率"
      : "节奏稳定 + 关键回合质量优先";
  const spacingGoal = fg3Delta <= -0.01 ? "外线产量与命中同步补强" : "保持空间牵制并提高回合效率";
  const defenseGoal = defDelta >= 0.8 ? "强化换防协同与护框兜底" : "维持防守强度并优化错位惩罚";

  const needToGoal = {
    shooting: "优先补射手与弱侧终结点",
    rebounding: "优先补篮板保护与二次进攻",
    defense: "优先补侧翼防守与护框深度",
    playmaking: "优先补第二持球与组织衔接",
  };

  const identityGoalMap = {
    system_offense: "体系传导 + 多点发起",
    star_driven: "核心减负 + 终结点分层",
    defense_first: "防守地基 + 反击效率",
    spacing_modern: "五外牵制 + 转换提速",
    rebuild_dev: "高回合试错 + 年轻球权成长",
    structure_piece: "位置兼容 + 轮换弹性",
    slow_defense: "半场防守 + 控失误执行",
  };

  const identityGoal = identityGoalMap[teamIdentity.family] || "结构平衡 + 针对性补强";
  const targetStyle = `${identityGoal} · ${paceGoal} · ${needToGoal[topNeed]}`;
  const detailStyle = `${defenseGoal}；${spacingGoal}；次级优先 ${needToGoal[secondNeed]}。`;
  const styleExample = `${team.team_abbr}：${identityGoal}（${phaseProfile.label}）`;
  const secondaryFocus = needToGoal[secondNeed];

  return { targetStyle, detailStyle, styleExample, secondaryFocus };
}

function buildStyleShift(team, avgs, phaseProfile, needs, teamIdentity) {
  const paceDelta = num(team.pace) - num(avgs.pace);
  const fg3Delta = num(team.fg3_pct) - num(avgs.fg3_pct);
  const defDelta = num(team.drtg) - num(avgs.drtg);
  const beforeStyle = [
    paceDelta >= 0.7 ? "偏快节奏" : paceDelta <= -0.7 ? "偏慢半场" : "中速均衡",
    fg3Delta >= 0.01 ? "外线占比高" : fg3Delta <= -0.01 ? "外线威胁偏弱" : "外线常规",
    defDelta <= -0.8 ? "防守质量在线" : defDelta >= 0.8 ? "防守波动偏大" : "防守中位",
  ].join(" / ");
  const topNeed = rankNeedKeys(needs)[0];
  const needShiftMap = {
    shooting: "将更多回合分配到外线发起与弱侧终结，拉开半场空间。",
    rebounding: "增加前场板冲抢和弱侧卡位，换取更多二次进攻。",
    defense: "提高换防覆盖与护框协同，减少对手轻松出手。",
    playmaking: "抬高副持球参与度，降低主攻点单回合负担。",
  };
  const dynamicStyle = buildDynamicStyleTarget(team, avgs, needs, teamIdentity, phaseProfile);
  return {
    title: `风格迁移（${phaseProfile.label}）`,
    identity: `${teamIdentity.label} · ${teamIdentity.note}`,
    beforeStyle,
    targetStyle: dynamicStyle.targetStyle,
    keyShift: needShiftMap[topNeed] || "围绕主要短板做结构性修正。",
    example: `${dynamicStyle.styleExample} · ${dynamicStyle.secondaryFocus}`,
  };
}

function getTeamIdentity(team) {
  const abbr = String(team?.team_abbr || "").toUpperCase();
  const mapped = TEAM_IDENTITY_BY_ABBR[abbr];
  if (mapped) return mapped;
  return { family: "structure_piece", label: "结构拼图型", note: "围绕当前主轴做兼容性补强" };
}

function classifyPlayerArchetype(p, avgs) {
  const pos = String(p.pos || "").toUpperCase();
  const fg3 = reliableFg3Pct(p);
  const pts = num(p.pts);
  const ast = num(p.ast);
  const tov = num(p.tov);
  const reb = num(p.reb);
  const defEvents = num(p.stl) + num(p.blk);
  const isBig = pos.includes("C") || pos.includes("PF");
  const risk = String(p.risk || "").toLowerCase();

  if (isBig && (num(p.blk) >= 1.1 || defEvents >= num(avgs.stl) + num(avgs.blk) + 0.8)) {
    return { key: "defense_anchor_big", label: "护框防守内线" };
  }
  if ((pos.includes("PG") || pos.includes("SG")) && pts >= 18 && ast >= num(avgs.ast) + 2.2) {
    return { key: "onball_primary_core", label: "持球大核" };
  }
  if (ast >= num(avgs.ast) + 1.3 && tov <= num(avgs.tov) + 0.25) {
    return { key: "system_connector", label: "体系连接器" };
  }
  if (ast >= num(avgs.ast) + 1.2 && tov > num(avgs.tov) + 0.2) {
    return { key: "onball_creator", label: "持球发起点" };
  }
  if (fg3 != null && fg3 >= num(avgs.fg3_pct) + 0.015 && ast <= num(avgs.ast) + 0.2) {
    return { key: "spacer_runner", label: "外线空间终结点" };
  }
  if (fg3 != null && fg3 >= num(avgs.fg3_pct) + 0.008 && defEvents >= num(avgs.stl) + num(avgs.blk) + 0.2) {
    return { key: "two_way_wing", label: "双向侧翼拼图" };
  }
  if (risk.includes("high ceiling") || (num(p.potential, 1) >= 1.18 && reb + ast + defEvents >= 11)) {
    return { key: "energy_developer", label: "潜力开发型" };
  }
  return { key: "utility_piece", label: "功能型轮换" };
}

function buildPlayerFunctionProfile(p, avgs) {
  const arch = classifyPlayerArchetype(p, avgs);
  const spacingSafe = spacingGuardrail(p, avgs);
  const offense_value = clamp01(num(p.pts) / 22 + num(p.ast) / 14);
  const defense_value = clamp01((num(p.stl) + num(p.blk)) / 3.4);
  const spacing_value = clamp01(((spacingSafe.effectiveFg3 ?? num(avgs.fg3_pct) - 0.03) - 0.28) / 0.12);
  const playmaking_value = clamp01(num(p.ast) / 8.0);
  const rebounding_value = clamp01(num(p.reb) / 12.0);
  let usage_type = "off-ball";
  if (playmaking_value >= 0.58 || offense_value >= 0.78) usage_type = "high";
  else if (playmaking_value >= 0.35) usage_type = "low";
  return {
    role: arch.label,
    archetypeKey: arch.key,
    offense_value,
    defense_value,
    spacing_value,
    playmaking_value,
    rebounding_value,
    spacing_reliability: spacingSafe.reliability,
    spacing_guardrail_note: spacingSafe.reason,
    usage_type,
    system_fit_tags: [arch.label, usage_type],
  };
}

function computeSystemCompatibility(teamNeed, teamIdentity, profile) {
  const family = String(teamIdentity?.family || "structure_piece");
  const weight = num(IDENTITY_STYLE_WEIGHTS[profile.archetypeKey]?.[family], 1);
  const usagePref = family === "star_driven" ? "off-ball" : family === "system_offense" ? "low" : family === "rebuild_dev" ? "high" : "off-ball";
  const usageBoost = profile.usage_type === usagePref ? 0.16 : usagePref === "off-ball" && profile.usage_type === "low" ? 0.08 : -0.12;
  const paceBoost =
    teamNeed.pace_identity === "fast"
      ? profile.offense_value * 0.08 + profile.spacing_value * 0.06
      : teamNeed.pace_identity === "slow"
      ? profile.defense_value * 0.08 + profile.playmaking_value * 0.05
      : 0.06 * (profile.offense_value + profile.defense_value) * 0.5;
  const score = clamp01((weight - 0.75) / 0.7 + usageBoost + paceBoost);
  return score;
}

function computeRoleMatch(teamNeed, profile) {
  const signals = [
    { need: teamNeed.defense_need, role: profile.role.includes("护框") || profile.role.includes("双向"), val: profile.defense_value },
    { need: teamNeed.spacing_need, role: profile.role.includes("空间"), val: profile.spacing_value },
    { need: teamNeed.playmaking_need, role: profile.role.includes("连接") || profile.role.includes("发起"), val: profile.playmaking_value },
    { need: teamNeed.rebounding_need, role: profile.role.includes("内线"), val: profile.rebounding_value },
  ];
  let raw = 0;
  for (const s of signals) {
    const roleBonus = s.role ? 0.28 : -0.12;
    raw += s.need * clamp01(s.val + roleBonus);
  }
  const denom = signals.reduce((a, b) => a + b.need, 0) || 1;
  return clamp01(raw / denom);
}

function computeNeedCoverage(teamNeed, profile) {
  const coverage =
    teamNeed.offense_need * profile.offense_value +
    teamNeed.defense_need * profile.defense_value +
    teamNeed.spacing_need * profile.spacing_value +
    teamNeed.playmaking_need * profile.playmaking_value +
    teamNeed.rebounding_need * profile.rebounding_value;
  const denom =
    teamNeed.offense_need +
    teamNeed.defense_need +
    teamNeed.spacing_need +
    teamNeed.playmaking_need +
    teamNeed.rebounding_need ||
    1;
  return clamp01(coverage / denom);
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

function identifyLockedCore(team, teamPlayers, playerAvgs) {
  const target = normalizeTeamAbbr(team?.team_abbr);
  const roster = (teamPlayers || [])
    .filter((p) => normalizeTeamAbbr(p.team_abbr) === target && p.player_name)
    .map((p) => {
      const defEvents = num(p.stl) + num(p.blk);
      const coreScore = num(p.mpg) * 0.38 + num(p.pts) * 0.3 + num(p.ast) * 0.17 + num(p.reb) * 0.1 + defEvents * 0.2;
      return { raw: p, profile: buildPlayerFunctionProfile(p, playerAvgs), coreScore };
    })
    .sort((a, b) => b.coreScore - a.coreScore);
  return roster.slice(0, 3);
}

function computeSystemValueByCore(playerProfile, lockedCore) {
  if (!lockedCore || !lockedCore.length) return 0.5;
  let sum = 0;
  for (const c of lockedCore) {
    const cp = c.profile || {};
    const coreUsage = String(cp.usage_type || "off-ball");
    const corePlay = num(cp.playmaking_value);
    const coreDef = num(cp.defense_value);
    let v = 0;
    if (coreUsage === "high" || corePlay >= 0.62) {
      // 围绕核心持球点：更看重无球空间与防守兜底
      v =
        playerProfile.spacing_value * 0.38 +
        playerProfile.defense_value * 0.28 +
        playerProfile.rebounding_value * 0.16 +
        clamp01(1 - playerProfile.playmaking_value * 0.65) * 0.18;
    } else if (coreDef >= 0.62) {
      // 围绕防守地基：补组织与半场创造
      v =
        playerProfile.playmaking_value * 0.34 +
        playerProfile.spacing_value * 0.3 +
        playerProfile.offense_value * 0.2 +
        playerProfile.defense_value * 0.16;
    } else {
      // 均衡核心：看双向通用性
      v =
        playerProfile.offense_value * 0.22 +
        playerProfile.defense_value * 0.22 +
        playerProfile.spacing_value * 0.2 +
        playerProfile.playmaking_value * 0.2 +
        playerProfile.rebounding_value * 0.16;
    }
    sum += clamp01(v);
  }
  return clamp01(sum / lockedCore.length);
}

function scorePlayer(p, team, teamNeed, phaseProfile, teamIdentity, playerProfile, lockedCore) {
  const reasons = [];
  const roleMatch = computeRoleMatch(teamNeed, playerProfile);
  const needCoverage = computeNeedCoverage(teamNeed, playerProfile);
  const systemCompatibility = computeSystemCompatibility(teamNeed, teamIdentity, playerProfile);
  // Layer 1：风格适配（未来打法）
  const styleFitScore = roleMatch * 0.4 + needCoverage * 0.4 + systemCompatibility * 0.2;
  // Layer 2：体系价值（核心地基兼容）
  const systemValueScore = computeSystemValueByCore(playerProfile, lockedCore);
  // 双层加权总分
  let score = (styleFitScore * 0.62 + systemValueScore * 0.38) * 100;

  if (p.pool === "free_agent") {
    score += 2.0;
  } else if (p.pool === "role") {
    score += 1.0;
  }
  if (phaseProfile && phaseProfile.poolBias && p.pool) {
    score += num(phaseProfile.poolBias[p.pool], 0);
  }

  if (p.team_abbr && normalizeTeamAbbr(p.team_abbr) === normalizeTeamAbbr(team.team_abbr)) {
    score -= 8;
    reasons.push("（已在本队：适配分已做降权，仅供参考）");
  }

  score = clamp(score, 0, 100);
  reasons.push(`Layer 1 风格适配：${fmt2(styleFitScore * 100)}（打法匹配）`);
  reasons.push(`Layer 2 体系价值：${fmt2(systemValueScore * 100)}（核心地基兼容）`);
  reasons.push(`角色匹配 Role Match：${fmt2(roleMatch * 100)}（Layer 1 子项）`);
  reasons.push(`需求覆盖 Need Coverage：${fmt2(needCoverage * 100)}（Layer 1 子项）`);
  reasons.push(`体系兼容 System Compatibility：${fmt2(systemCompatibility * 100)}（Layer 1 子项）`);
  reasons.push(`球员功能模块：${playerProfile.role} / ${playerProfile.usage_type} usage`);
  reasons.push(`三分防作弊校验：${playerProfile.spacing_guardrail_note}`);
  if (lockedCore && lockedCore.length) {
    reasons.push(`体系地基（不可动核心）：${lockedCore.map((x) => x.raw.player_name).join(" / ")}`);
  }
  return {
    score,
    reasons,
    styleFit: {
      trend: systemCompatibility >= 0.62 ? "高匹配" : systemCompatibility <= 0.38 ? "低匹配" : "中性匹配",
    },
    breakdown: { roleMatch, needCoverage, systemCompatibility, styleFitScore, systemValueScore },
  };
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
  const fg3 = reliableFg3Pct(p);
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
  if (fg3 != null && fg3 >= aFg3 + 0.015) strengths.push("外线投射");
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
  if (fg3 != null && fg3 >= aFg3 + 0.008) {
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
  const fg3 = reliableFg3Pct(p);
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
  if (fg3 != null && fg3 >= aFg3 + 0.012) {
    tags.push("🎯 空间型射手");
  }
  if (stl >= 1.2 || defEvents >= aDefEvents + 0.4) {
    tags.push("🧱 防守破坏者");
  }
  if (tov <= num(avgs.tov) - 0.35) {
    tags.push("📉 低球权球员");
  }
  if (fg3 != null && reb >= aReb + 1.0 && fg3 >= aFg3 + 0.01) {
    tags.push("🧩 双向拼图");
  }

  if (tags.length === 0) {
    tags.push(isBig ? "🔄 轮换中锋" : "🧩 功能型角色球员");
  }
  return tags.slice(0, 4);
}

function recommend(team, players, weaknesses, avgs, playerAvgs, phase, teamPlayers) {
  const candidates = players.filter((p) => p.pool === "free_agent" || p.pool === "role");
  const baseNeeds = computeTeamNeeds(team, avgs);
  const phaseProfile = getTeamPhaseProfile(phase);
  const teamIdentity = getTeamIdentity(team);
  const needs = applyTeamPhaseToNeeds(baseNeeds, phaseProfile);
  needs.system_type = teamIdentity.family;
  const baseline = playerAvgs || avgs;
  const lockedCore = identifyLockedCore(team, teamPlayers, baseline);
  const scored = candidates
    .map((p) => {
      const playerProfile = buildPlayerFunctionProfile(p, baseline);
      const { score, reasons, styleFit } = scorePlayer(p, team, needs, phaseProfile, teamIdentity, playerProfile, lockedCore);
      const summary = buildPlayerSummary(p, needs, baseline);
      const roleTags = buildRoleTags(p, baseline);
      return { p, score, reasons, summary, roleTags, playerArchetype: { label: playerProfile.role }, teamIdentity, styleFit };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  return scored;
}

async function loadData() {
  const base = new URL("../data/current/", window.location.href);
  const loadPlayersSources = async () => {
    const plainResp = await fetch(new URL("players.csv", base));
    if (!plainResp.ok) throw new Error("无法加载 data/current/players.csv");
    const plainText = await plainResp.text();
    const enrichedResp = await fetch(new URL("players_with_jersey.csv", base)).catch(() => null);
    const enrichedText = enrichedResp && enrichedResp.ok ? await enrichedResp.text() : "";
    return { plainText, enrichedText };
  };
  const [tText, playersSources, marketText, sText, dText] = await Promise.all([
    fetch(new URL("teams.csv", base)).then((r) => {
      if (!r.ok) throw new Error("无法加载 data/current/teams.csv");
      return r.text();
    }),
    loadPlayersSources(),
    fetch(new URL("players_market_with_jersey.csv", base))
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => "")
      .then((txt) => {
        if (txt) return txt;
        return fetch(new URL("players_market.csv", base))
          .then((r) => (r.ok ? r.text() : ""))
          .catch(() => "");
      }),
    fetch(new URL("standings.csv", base))
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => ""),
    fetch(new URL("draft_pool.csv", base))
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => ""),
  ]);
  const profileText = await fetch(new URL("team_profiles.json", base))
    .then((r) => (r.ok ? r.text() : ""))
    .catch(() => "");
  let teamProfiles = {};
  try {
    teamProfiles = profileText ? JSON.parse(profileText) : {};
  } catch (_) {
    teamProfiles = {};
  }
  const rawPlayers = parseCSV(playersSources.plainText);
  const jerseyRows = playersSources.enrichedText ? parseCSV(playersSources.enrichedText) : [];
  const jerseyById = new Map(
    jerseyRows.map((r) => [String(r.player_id || "").trim(), String(r.jersey_no || "").trim()])
  );
  const mergedPlayers = rawPlayers.map((p) => {
    const id = String(p.player_id || "").trim();
    const jerseyNo = jerseyById.get(id);
    if (!jerseyNo) return p;
    return { ...p, jersey_no: jerseyNo };
  });
  const rawMarketPlayers = marketText ? parseCSV(marketText) : [];
  if (!rawMarketPlayers.length) {
    throw new Error("无法加载 data/current/players_market.csv（或 players_market_with_jersey.csv）");
  }
  const avatarLookup = buildAvatarLookup(mergedPlayers);
  const marketPlayers = rawMarketPlayers.map((p) => withSharedAvatar(p, avatarLookup));
  return {
    teams: parseCSV(tText),
    players: dedupePlayersCurrentStint(mergedPlayers),
    marketPlayers,
    playerTeamHistoryMap: buildPlayerTeamHistoryMap(rawMarketPlayers.length ? rawMarketPlayers : rawPlayers),
    teamProfiles,
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

function buildTeamPowerMap(teams, standings) {
  const fixedPowerByAbbr = new Map([
    ["OKC", 98],
    ["DET", 97],
    ["SAS", 96],
    ["BOS", 94],
    ["DEN", 93],
    ["NYK", 89],
    ["LAL", 88],
    ["HOU", 87],
    ["CLE", 86],
    ["MIN", 84],
    ["ATL", 79],
    ["TOR", 78],
    ["PHI", 77],
    ["ORL", 76],
    ["CHA", 75],
    ["PHX", 74],
    ["POR", 73],
    ["LAC", 72],
    ["GSW", 70],
    ["MIA", 69],
    ["MIL", 59],
    ["CHI", 58],
    ["MEM", 56],
    ["NOP", 55],
    ["DAL", 54],
    ["SAC", 49],
    ["UTA", 48],
    ["BKN", 46],
    ["IND", 45],
    ["WAS", 43],
  ]);
  const map = new Map();
  const standingsRows = Array.isArray(standings) ? standings : [];
  const winPctByAbbr = new Map();
  for (const row of standingsRows) {
    const abbr = normalizeTeamAbbr(row.team_abbr);
    if (!abbr) continue;
    const w = num(row.wins, NaN);
    const l = num(row.losses, NaN);
    const wpRaw = num(row.win_pct, NaN);
    let wp = Number.isFinite(wpRaw) ? wpRaw : NaN;
    if (wp > 1) wp /= 100;
    if (!Number.isFinite(wp)) {
      const games = w + l;
      wp = games > 0 ? w / games : 0.5;
    }
    winPctByAbbr.set(abbr, clamp(wp, 0, 1));
  }
  const nrtgVals = (Array.isArray(teams) ? teams : [])
    .map((t) => num(t.nrtg, NaN))
    .filter((v) => Number.isFinite(v));
  const minNrtg = nrtgVals.length ? Math.min(...nrtgVals) : -12;
  const maxNrtg = nrtgVals.length ? Math.max(...nrtgVals) : 12;
  const rangeNrtg = Math.max(1, maxNrtg - minNrtg);
  for (const t of Array.isArray(teams) ? teams : []) {
    const abbr = normalizeTeamAbbr(t.team_abbr);
    if (!abbr) continue;
    const fixedPower = fixedPowerByAbbr.get(abbr);
    if (Number.isFinite(fixedPower)) {
      map.set(abbr, fixedPower);
      continue;
    }
    const winPct = winPctByAbbr.get(abbr);
    const nrtg = num(t.nrtg, 0);
    const nrtgNorm = clamp((nrtg - minNrtg) / rangeNrtg, 0, 1);
    const blended = 0.7 * (Number.isFinite(winPct) ? winPct : 0.5) + 0.3 * nrtgNorm;
    map.set(abbr, clamp(Math.round(blended * 100), 1, 100));
  }
  return map;
}

function conferenceByTeamMap(standings) {
  const map = new Map();
  for (const row of Array.isArray(standings) ? standings : []) {
    const abbr = normalizeTeamAbbr(row.team_abbr);
    const conf = String(row.conf || "").trim().toUpperCase();
    if (!abbr) continue;
    map.set(abbr, conf === "W" ? "W" : "E");
  }
  return map;
}

function buildSeasonSimulationRows(teams, standings, selectedTeamAbbr, fitScore, simStyle = "standard") {
  const powerByTeam = buildTeamPowerMap(teams, standings);
  const confByTeam = conferenceByTeamMap(standings);
  const selectedNorm = normalizeTeamAbbr(selectedTeamAbbr);
  const styleCfg = (() => {
    if (simStyle === "conservative") {
      return {
        fitCenter: 74,
        fitScale: 30,
        rookieBoostMul: 0.62,
        rookieVolMul: 0.62,
        teamNoiseMul: 0.68,
        seasonPathVolMul: 0.68,
        trendProfile: "low",
      };
    }
    if (simStyle === "aggressive") {
      return {
        fitCenter: 67,
        fitScale: 21,
        rookieBoostMul: 1.6,
        rookieVolMul: 1.52,
        teamNoiseMul: 1.34,
        seasonPathVolMul: 1.46,
        trendProfile: "high",
      };
    }
    return {
      fitCenter: 70,
      fitScale: 25,
      rookieBoostMul: 1.0,
      rookieVolMul: 1.0,
      teamNoiseMul: 1.0,
      seasonPathVolMul: 1.0,
      trendProfile: "mid",
    };
  })();
  const rookieImpactRaw = clamp((num(fitScore, styleCfg.fitCenter) - styleCfg.fitCenter) / styleCfg.fitScale, -0.8, 1.2);
  const randomNormal = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const makeSeasonPath = (projectedWins, isSelected) => {
    // Create checkpoint wins with realistic volatility, then lock final point.
    const steps = 24;
    const out = [];
    let cur = 0;
    for (let i = 1; i <= steps; i++) {
      const p = i / steps;
      const target = projectedWins * p;
      const vol = (isSelected ? 1.25 : 1.0) * (1.35 - Math.min(1, p) * 0.75) * styleCfg.seasonPathVolMul;
      const shock = randomNormal() * vol;
      // mean reversion towards checkpoint target + random nightly variance
      cur = cur + (target - cur) * 0.38 + shock;
      const maxWinsAtStep = Math.round(82 * p);
      out.push(clamp(Math.round(cur), 0, maxWinsAtStep));
    }
    out[steps - 1] = clamp(Math.round(projectedWins), 0, 82);
    return out;
  };
  const tierByPower = (power) => {
    if (power >= 85) return "elite";
    if (power >= 72) return "strong";
    if (power >= 60) return "mid";
    return "weak";
  };

  const rookieWinBoostByTier = (tier, raw) => {
    const x = clamp(raw, -1, 1.2);
    const tierMul = tier === "elite" ? 3 : tier === "strong" ? 5 : tier === "mid" ? 7 : 10;
    return clamp(x * tierMul * styleCfg.rookieBoostMul, -8.0, 16.0);
  };

  const teamNoiseStdByTier = (tier) => {
    if (tier === "elite") return 3;
    if (tier === "strong") return 4;
    if (tier === "mid") return 6;
    return 7;
  };

  const trendShiftWins = () => {
    const r = Math.random();
    if (styleCfg.trendProfile === "low") {
      // Conservative: very few black swans, mostly stable standings.
      if (r < 0.07) return 4 + Math.floor(Math.random() * 3); // +4..+6
      if (r < 0.14) return -(4 + Math.floor(Math.random() * 3)); // -4..-6
      if (r < 0.16) return Math.random() < 0.5 ? 8 : -8; // rare extreme event
      return 0;
    }
    if (styleCfg.trendProfile === "high") {
      // Aggressive: frequent surprises and collapses.
      if (r < 0.23) return 7 + Math.floor(Math.random() * 5); // +7..+11
      if (r < 0.46) return -(7 + Math.floor(Math.random() * 5)); // -7..-11
      if (r < 0.62) return Math.random() < 0.5 ? 12 : -12; // many extreme swings
      return 0;
    }
    // Standard: balanced realism + entertainment.
    if (r < 0.15) return 6 + Math.floor(Math.random() * 5); // +6..+10
    if (r < 0.3) return -(6 + Math.floor(Math.random() * 5)); // -6..-10
    if (r < 0.4) return Math.random() < 0.5 ? 12 : -12; // extreme swing
    return 0;
  };

  const rows = (Array.isArray(teams) ? teams : [])
    .map((t) => {
      const abbr = normalizeTeamAbbr(t.team_abbr);
      const powerRaw = num(powerByTeam.get(abbr), 50);
      const tier = tierByPower(powerRaw);
      let baseWinPct = clamp(0.18 + Math.pow(clamp(powerRaw / 100, 0, 1), 2.2) * 0.62, 0.18, 0.8);
      const rookieWinsBase = abbr === selectedNorm ? rookieWinBoostByTier(tier, rookieImpactRaw) : 0;
      if (abbr === selectedNorm && rookieImpactRaw > 0.5) {
        const boostPct = 0.03 + Math.random() * 0.03;
        baseWinPct = clamp(baseWinPct + boostPct, 0.18, 0.86);
      }
      const baseWins = Math.round(baseWinPct * 82);
      // 随机化新秀兑现：同一思路下每次模拟结果不同（有超预期也有低于预期）
      const rookieVol = (tier === "weak" ? 2.0 : tier === "mid" ? 1.7 : tier === "strong" ? 1.4 : 1.2) * styleCfg.rookieVolMul;
      const rookieWins = abbr === selectedNorm
        ? clamp(rookieWinsBase + randomNormal() * rookieVol, -2.0, 10.0)
        : 0;
      const randomNoiseWins = randomNormal() * teamNoiseStdByTier(tier) * styleCfg.teamNoiseMul;
      const trendShift = trendShiftWins();
      const projectedWins = clamp(Math.round(baseWins + rookieWins + randomNoiseWins + trendShift), 18, 65);
      const simulatedWinPct = projectedWins / 82;
      const adjustedPower = clamp(
        Math.round(powerRaw + (abbr === selectedNorm ? rookieWins * 1.5 : 0) + randomNoiseWins * 0.7 + trendShift * 0.5),
        1,
        100
      );
      return {
        team_abbr: abbr,
        team_name: t.team_name || abbr,
        conf: confByTeam.get(abbr) || "E",
        power: Math.round(adjustedPower),
        projectedWins,
        rookieImpact: rookieWins,
        randomNoise: randomNoiseWins,
        trendShift,
        simulatedWinPct,
        tier,
        pathWins: [],
      };
    })
    .filter((r) => r.team_abbr);

  for (const r of rows) {
    r.pathWins = makeSeasonPath(r.projectedWins, r.team_abbr === selectedNorm);
  }

  return rows;
}

function renderSeasonSimBoard(container, state) {
  const sim = state.simulation;
  if (!container || !sim) return;
  const styleMetaText =
    sim.style === "conservative"
      ? "保守模式：更接近现实，强队更稳定，黑马较少"
      : sim.style === "aggressive"
        ? "激进模式：游戏化波动，黑马与崩盘更常见，新秀更易改局"
        : "标准模式：平衡现实与娱乐，默认推荐";
  const progress = clamp(num(sim.progress), 0, 1);
  const pathStep = (() => {
    const first = sim.rows && sim.rows[0];
    const n = Array.isArray(first?.pathWins) ? first.pathWins.length : 0;
    if (!n) return -1;
    return clamp(Math.floor(progress * (n - 1)), 0, n - 1);
  })();
  const rows = sim.rows
    .map((r) => {
      const wins = pathStep >= 0 && Array.isArray(r.pathWins)
        ? clamp(num(r.pathWins[pathStep], 0), 0, 82)
        : Math.min(r.projectedWins, Math.round(r.projectedWins * progress));
      const losses = Math.min(82 - wins, Math.round((82 - r.projectedWins) * progress));
      return { ...r, wins, losses };
    })
    .sort((a, b) => b.wins - a.wins || b.power - a.power || a.team_name.localeCompare(b.team_name));

  const east = rows.filter((r) => r.conf !== "W");
  const west = rows.filter((r) => r.conf === "W");
  const ms = Math.round(progress * sim.durationMs);
  const left = Math.max(0, sim.durationMs - ms);

  const renderRows = (list) =>
    list
      .map(
        (r, idx) => `<tr data-team="${r.team_abbr}" class="${r.team_abbr === sim.selectedTeamAbbr ? "is-user-team" : ""}">
          <td>${idx + 1}</td>
          <td>${r.team_name}</td>
          <td>${r.wins}-${r.losses}</td>
        </tr>`
      )
      .join("");

  container.innerHTML = `
    <div class="season-sim-page">
      <header class="season-sim-head">
        <p class="season-sim-head__kicker">Next Season Simulator</p>
        <h2 class="season-sim-head__title">2026-27 全联盟战绩模拟</h2>
        <p class="season-sim-head__meta">已选球队：<strong>${sim.selectedTeamName}</strong> · ${styleMetaText}</p>
        <div class="season-sim-style-switch" role="group" aria-label="模拟风格">
          <button type="button" class="season-style-btn ${sim.style === "conservative" ? "is-active" : ""}" data-sim-style="conservative">保守</button>
          <button type="button" class="season-style-btn ${sim.style === "standard" ? "is-active" : ""}" data-sim-style="standard">标准</button>
          <button type="button" class="season-style-btn ${sim.style === "aggressive" ? "is-active" : ""}" data-sim-style="aggressive">激进</button>
        </div>
        <div class="season-sim-progress">
          <div class="season-sim-progress__bar"><span style="width:${(progress * 100).toFixed(1)}%"></span></div>
          <div class="season-sim-progress__text">${progress >= 1 ? "模拟完成" : `模拟中 · 剩余 ${(left / 1000).toFixed(1)}s`}</div>
        </div>
      </header>
      <div class="season-sim-grid">
        <section class="season-sim-conf">
          <h3>东部</h3>
          <table>
            <thead><tr><th>#</th><th>球队</th><th>战绩</th></tr></thead>
            <tbody>${renderRows(east)}</tbody>
          </table>
        </section>
        <section class="season-sim-conf">
          <h3>西部</h3>
          <table>
            <thead><tr><th>#</th><th>球队</th><th>战绩</th></tr></thead>
            <tbody>${renderRows(west)}</tbody>
          </table>
        </section>
      </div>
      <div class="season-sim-actions">
        <button type="button" class="draft-lock-btn" id="season-sim-replay-btn">重新模拟</button>
        <button type="button" class="draft-lock-btn" id="season-sim-back-btn">返回 Draft 选择</button>
      </div>
    </div>
  `;

  // FLIP-like row transition: smooth up/down movement when ranking changes.
  const animateRankShift = (tbodySelector, list, prevMapKey) => {
    const tbody = container.querySelector(tbodySelector);
    if (!tbody) return;
    const prevMap = sim[prevMapKey] || {};
    const rowsNow = Array.from(tbody.querySelectorAll("tr[data-team]"));
    const rowH = rowsNow[0] ? rowsNow[0].getBoundingClientRect().height || 28 : 28;
    for (let i = 0; i < rowsNow.length; i++) {
      const tr = rowsNow[i];
      const abbr = tr.getAttribute("data-team") || "";
      const prevIdx = Number.isFinite(prevMap[abbr]) ? prevMap[abbr] : i;
      const dy = (prevIdx - i) * rowH;
      tr.style.transition = "none";
      tr.style.transform = `translateY(${dy}px)`;
      tr.style.willChange = "transform";
    }
    requestAnimationFrame(() => {
      for (const tr of rowsNow) {
        tr.style.transition = "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)";
        tr.style.transform = "translateY(0)";
      }
    });
    const nextMap = {};
    list.forEach((r, idx) => {
      nextMap[r.team_abbr] = idx;
    });
    sim[prevMapKey] = nextMap;
  };

  animateRankShift(".season-sim-grid .season-sim-conf:first-child tbody", east, "prevRankE");
  animateRankShift(".season-sim-grid .season-sim-conf:last-child tbody", west, "prevRankW");
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
    tooltip: { show: false },
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
      // 避免右侧轴名贴边被裁切：整体向中间收并略缩半径
      radius: "62%",
      center: ["52%", "48%"],
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

function buildSummaryModel(team, avgs, analyzed) {
  const ortgDelta = num(team.ortg) - num(avgs.ortg);
  const drtgDelta = num(avgs.drtg) - num(team.drtg);
  const fg3Delta = num(team.fg3_pct) - num(avgs.fg3_pct);
  const rebDelta = num(team.reb) - num(avgs.reb);
  const defEventsDelta = num(team.stl) + num(team.blk) - (num(avgs.stl) + num(avgs.blk));

  const strengths = [];
  if (drtgDelta >= 1.0) strengths.push("防守效率高");
  if (defEventsDelta >= 0.8) strengths.push("抢断+盖帽突出");
  if (ortgDelta >= 1.5) strengths.push("进攻效率在线");
  if (fg3Delta >= 0.01) strengths.push("外线效率占优");
  if (rebDelta >= 1.2) strengths.push("篮板保护稳定");
  if (!strengths.length) strengths.push("整体结构较均衡");

  const weaknesses = analyzed.weaknesses.map((w) => w.label);
  if (!weaknesses.length) weaknesses.push("暂无明显短板");

  const conclusion =
    drtgDelta >= 1.0 && ortgDelta < 0
      ? "防守驱动型球队"
      : fg3Delta <= -0.01
      ? "外线效率有待提升"
      : rebDelta <= -1.0
      ? "篮板保护偏弱"
      : "整体竞争力较均衡";

  return {
    conclusion,
    tags: [],
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 4),
  };
}

function renderWeaknesses(conclusionEl, tagsEl, splitEl, model) {
  if (conclusionEl) {
    conclusionEl.innerHTML = `<span class="summary-conclusion__lead">一句话结论</span><strong>${model.conclusion}</strong>`;
  }
  if (tagsEl) {
    tagsEl.innerHTML = "";
    tagsEl.style.display = "none";
  }
  if (splitEl) {
    splitEl.innerHTML = `
      <section class="summary-col is-strength">
        <h3>✅ Strengths</h3>
        <ul>${model.strengths.map((x) => `<li>${x}</li>`).join("")}</ul>
      </section>
      <section class="summary-col is-weakness">
        <h3>❌ Weaknesses</h3>
        <ul>${model.weaknesses.map((x) => `<li>${x}</li>`).join("")}</ul>
      </section>
    `;
  }
}

function renderStyleShift(container, shift) {
  if (!container) return;
  if (!shift) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    <div class="team-style-shift__title">Action Insight</div>
    <div class="team-style-shift__line">👉 建议优先围绕<strong>${shift.keyShift}</strong>推进补强。</div>
    <div class="team-style-shift__line">👉 当前战术身份：${shift.identity}，可延续并做局部强化。</div>
    <div class="team-style-shift__line">👉 目标风格：${shift.targetStyle}</div>
    <div class="team-style-shift__line team-style-shift__example">${shift.example}</div>
  `;
}

function buildFallbackTeamProfile(team) {
  const win = num(team.wins);
  const loss = num(team.losses);
  const games = Math.max(1, win + loss);
  const winPct = (win / games) * 100;
  return {
    city: "—",
    state: "—",
    country: "USA",
    arena: "—",
    conference: "—",
    division: "—",
    founded: "—",
    head_coach: "—",
    ownership: "—",
    record: `${win}-${loss}（胜率 ${fmt2(winPct)}%）`,
  };
}

function renderTeamProfile(container, team, profile) {
  if (!container) return;
  const grid = container.querySelector("#current-team-profile-grid");
  if (!grid) return;
  const data = profile || buildFallbackTeamProfile(team);
  const cityLine = [data.city, data.state, data.country].filter(Boolean).join(", ");
  const win = num(team.wins);
  const loss = num(team.losses);
  const games = Math.max(1, win + loss);
  const winPct = (win / games) * 100;
  const recordText = data.record || `${win}-${loss}（胜率 ${fmt2(winPct)}%）`;
  const rows = [
    ["球队", team.team_name || team.team_abbr || "—"],
    ["所在地区", cityLine || "—"],
    ["主场球馆", data.arena || "—"],
    ["分区", [data.conference, data.division].filter(Boolean).join(" · ") || "—"],
    ["成立年份", data.founded || "—"],
    ["主教练", data.head_coach || "—"],
    ["老板/集团", data.ownership || "—"],
    ["本赛季战绩", recordText],
  ];
  grid.innerHTML = rows
    .map(
      ([label, value]) => `<div class="current-team-profile-item">
      <div class="current-team-profile-item__label">${label}</div>
      <div class="current-team-profile-item__value">${value || "—"}</div>
    </div>`
    )
    .join("");
}

function renderRecs(listEl, items, limit) {
  listEl.innerHTML = "";
  const view = (items || []).slice(0, Math.max(0, num(limit, 5)));
  for (const { p, score, reasons, summary, roleTags, playerArchetype, teamIdentity, styleFit } of view) {
    const li = document.createElement("li");
    li.className = "rec";
    const maxScore = 100;
    const headshot = playerAvatarUrl(p);
    const fallback = avatarFallbackDataUrl(p.player_name);
    const roleLabel = roleLabelForPlayer(p, window.__CURRENT_PLAYER_AVGS || window.__CURRENT_AVGS || {});
    const teamAbbr = String(p.team_abbr || "").toUpperCase();
    const teamSeq = (window.__CURRENT_PLAYER_TEAM_HISTORY_MAP && window.__CURRENT_PLAYER_TEAM_HISTORY_MAP.get(String(p.player_id || "").trim())) || [];
    const lastTeam = teamSeq.length ? teamSeq[teamSeq.length - 1] : "";
    const teamText =
      lastTeam ||
      (!teamAbbr || teamAbbr === "2TM" || teamAbbr === "3TM" || teamAbbr === "4TM" ? "—" : teamAbbr);
    const seasonPts = fmt2(p.pts);
    const seasonReb = fmt2(p.reb);
    const seasonAst = fmt2(p.ast);
    const seasonFg3 = reliableFg3Pct(p);
    const seasonFg3Text = seasonFg3 == null ? "样本不足" : `${fmt2(seasonFg3 * 100)}%`;
    const seasonGp = p.gp != null && p.gp !== "" ? String(p.gp) : "--";
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
      <div class="meta">${p.pos} · 本赛季球队 ${teamText} · 本赛季 ${seasonGp} 场 ${seasonPts} 分 ${seasonReb} 板 ${seasonAst} 助 · 三分 ${seasonFg3Text} · <span class="role-label">角色定位</span> <span class="role-badge">${roleLabel}</span> · <span class="role-label">风格标签</span> <span class="role-badge">${playerArchetype?.label || "功能型轮换"}</span></div>
      <div class="role-tags">
        ${(roleTags || []).map((x) => `<span class="role-tag">${x}</span>`).join("")}
        <span class="role-tag">🧠 ${teamIdentity?.label || "结构拼图型"} · ${styleFit?.trend || "中性匹配"}</span>
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
      <details class="rec-details">
        <summary class="rec-details__summary">数据支撑（点击展开）</summary>
        <ul class="reasons">
          ${reasons.map((r) => `<li>${r}</li>`).join("")}
        </ul>
      </details>
    `;
    listEl.appendChild(li);
  }
}

function renderCurrentRoster(container, teamAbbr, players) {
  if (!container) return;
  const target = normalizeTeamAbbr(teamAbbr);
  const roster = players
    .filter((p) => normalizeTeamAbbr(p.team_abbr) === target && p.player_name)
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
      const headshot = playerAvatarUrl(p);
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
  const summaryConclusionEl = document.getElementById("summary-conclusion");
  const tagsEl = document.getElementById("weakness-tags");
  const summarySplitEl = document.getElementById("summary-strength-weakness");
  const recList = document.getElementById("recs");
  const rosterEl = document.getElementById("current-roster");
  const summaryPanel = document.getElementById("current-summary-panel");
  const rosterPanel = document.getElementById("current-roster-panel");
  const teamProfilePanel = document.getElementById("current-team-profile-panel");
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
  const styleShiftEl = document.getElementById("team-style-shift");
  const recsLoadMoreBtn = document.getElementById("recs-load-more");

  let teams, players, marketPlayers, playerTeamHistoryMap, teamProfiles, standings, draftPool;

  try {
    ({ teams, players, marketPlayers, playerTeamHistoryMap, teamProfiles, standings, draftPool } = await loadData());
  } catch (e) {
    err.textContent =
      "加载 CSV 失败。请在本目录运行：python3 -m http.server 8080，然后打开 http://localhost:8080/web/ 。直接双击打开 HTML 时浏览器会阻止 file:// 读取数据。";
    err.classList.add("err");
    return;
  }

  // 供“交易模拟”面板复用（避免重复加载 CSV）
  window.__CURRENT_TEAMS = teams;
  window.__CURRENT_PLAYERS = players;
  window.__CURRENT_MARKET_PLAYERS = Array.isArray(marketPlayers) ? marketPlayers : [];
  window.__CURRENT_PLAYER_TEAM_HISTORY_MAP = playerTeamHistoryMap || new Map();
  window.__CURRENT_TEAM_PROFILES = teamProfiles || {};
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
  window.__CURRENT_PLAYER_AVGS = computePlayerAverages(players);

  let selectedAbbr = "";
  let pickerCollapsed = false;
  let activeModule = "free";
  let recDisplayCount = 5;
  let currentRecs = [];
  const draftState = {
    selectedId: "",
    compareIds: [],
    positionFilter: "all",
    page: 0,
    lockedId: "",
    mode: "board",
    simulation: null,
    simStyle: "standard",
  };

  function clearSeasonSimulationTimer() {
    if (draftState.simulation && draftState.simulation.timer) {
      clearInterval(draftState.simulation.timer);
    }
    if (draftState.simulation) draftState.simulation.timer = null;
  }

  function startSeasonSimulation(selectedTeam, fitScore) {
    clearSeasonSimulationTimer();
    const rows = buildSeasonSimulationRows(teams, standings, selectedTeam.team_abbr, fitScore, draftState.simStyle || "standard");
    draftState.mode = "sim";
    draftState.simulation = {
      rows,
      selectedTeamAbbr: normalizeTeamAbbr(selectedTeam.team_abbr),
      selectedTeamName: selectedTeam.team_name || selectedTeam.team_abbr,
      style: draftState.simStyle || "standard",
      durationMs: 10000,
      elapsedMs: 0,
      progress: 0,
      prevRankE: {},
      prevRankW: {},
      timer: null,
    };
    if (draftResults) renderSeasonSimBoard(draftResults, draftState);
    const startedAt = Date.now();
    draftState.simulation.timer = setInterval(() => {
      const sim = draftState.simulation;
      if (!sim || draftState.mode !== "sim") return;
      sim.elapsedMs = Date.now() - startedAt;
      sim.progress = clamp(sim.elapsedMs / sim.durationMs, 0, 1);
      if (draftResults) renderSeasonSimBoard(draftResults, draftState);
      if (sim.progress >= 1) {
        clearSeasonSimulationTimer();
      }
    }, 120);
  }

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
    if (summaryPanel) summaryPanel.classList.toggle("is-hidden", on);
    if (rosterPanel) rosterPanel.classList.toggle("is-hidden", on);
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
    draftResults.addEventListener("click", (ev) => {
      const posTag = ev.target && ev.target.closest ? ev.target.closest(".draft-pos-tag") : null;
      if (posTag) {
        const key = String(posTag.dataset.pos || "");
        if (!key) return;
        draftState.positionFilter = key;
        draftState.page = 0;
        update();
        return;
      }
      const prevPageBtn = ev.target && ev.target.closest ? ev.target.closest("#draft-page-prev") : null;
      if (prevPageBtn) {
        draftState.page = Math.max(0, num(draftState.page) - 1);
        update();
        return;
      }
      const nextPageBtn = ev.target && ev.target.closest ? ev.target.closest("#draft-page-next") : null;
      if (nextPageBtn) {
        draftState.page = num(draftState.page) + 1;
        update();
        return;
      }

      const draftBtn = ev.target && ev.target.closest ? ev.target.closest("#draft-lock-btn") : null;
      if (draftBtn) {
        if (!draftState.selectedId) return;
        draftState.lockedId = draftState.selectedId;
        const selectedTeam = teams.find((t) => t.team_abbr === selectedAbbr);
        if (!selectedTeam) return;
        const selectedNorm = normalizeDraftProspects(window.__CURRENT_DRAFT_POOL || []).find((x) => x.id === draftState.lockedId) || null;
        const impact = selectedNorm ? computeDraftImpact(selectedTeam, avgs, selectedNorm) : null;
        const fitScore = impact ? computeDraftFitScore(impact, selectedNorm.potential) : 78;
        startSeasonSimulation(selectedTeam, fitScore);
        update();
        return;
      }
      const replayBtn = ev.target && ev.target.closest ? ev.target.closest("#season-sim-replay-btn") : null;
      if (replayBtn) {
        const selectedTeam = teams.find((t) => t.team_abbr === selectedAbbr);
        if (!selectedTeam) return;
        const selected = normalizeDraftProspects(window.__CURRENT_DRAFT_POOL || []).find((x) => x.id === draftState.lockedId) || null;
        const impact = selected ? computeDraftImpact(selectedTeam, avgs, selected) : null;
        const fitScore = impact ? computeDraftFitScore(impact, selected.potential) : 78;
        startSeasonSimulation(selectedTeam, fitScore);
        return;
      }
      const styleBtn = ev.target && ev.target.closest ? ev.target.closest(".season-style-btn") : null;
      if (styleBtn) {
        const style = String(styleBtn.getAttribute("data-sim-style") || "").trim();
        if (!style || !["conservative", "standard", "aggressive"].includes(style)) return;
        draftState.simStyle = style;
        if (draftState.mode === "sim") {
          const selectedTeam = teams.find((t) => t.team_abbr === selectedAbbr);
          if (!selectedTeam) return;
          const selected = normalizeDraftProspects(window.__CURRENT_DRAFT_POOL || []).find((x) => x.id === draftState.lockedId) || null;
          const impact = selected ? computeDraftImpact(selectedTeam, avgs, selected) : null;
          const fitScore = impact ? computeDraftFitScore(impact, selected.potential) : 78;
          startSeasonSimulation(selectedTeam, fitScore);
        }
        return;
      }
      const backBtn = ev.target && ev.target.closest ? ev.target.closest("#season-sim-back-btn") : null;
      if (backBtn) {
        clearSeasonSimulationTimer();
        draftState.mode = "board";
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

  renderTeamOptions(teams, standings, (abbr) => {
    clearSeasonSimulationTimer();
    selectedAbbr = abbr;
    draftState.selectedId = "";
    draftState.lockedId = "";
    draftState.positionFilter = "all";
    draftState.page = 0;
    draftState.mode = "board";
    draftState.simulation = null;
    recDisplayCount = 5;
    // 选择球队后自动收起（与历史板块体验一致）
    setPickerCollapsed(true);
    update();
  });

  if (pickerToggle) {
    pickerToggle.addEventListener("click", () => {
      setPickerCollapsed(!pickerCollapsed);
    });
  }
  if (recsLoadMoreBtn) {
    recsLoadMoreBtn.addEventListener("click", () => {
      recDisplayCount += 5;
      renderRecs(recList, currentRecs, recDisplayCount);
      recsLoadMoreBtn.style.display = recDisplayCount < currentRecs.length ? "" : "none";
    });
  }

  function update() {
    if (!selectedAbbr) {
      clearSeasonSimulationTimer();
      setEmptyState(true);
      if (currentPanel) currentPanel.classList.remove("is-team-selected");
      if (pickedTeam) pickedTeam.textContent = "";
      if (pickerPanel) {
        pickerPanel.classList.remove("has-team-bg");
        pickerPanel.style.removeProperty("--team-logo-bg");
      }
      if (rosterEl) rosterEl.innerHTML = "";
      if (recList) recList.innerHTML = "";
      if (draftResults) draftResults.innerHTML = "";
      draftState.lockedId = "";
      draftState.selectedId = "";
      draftState.positionFilter = "all";
      draftState.page = 0;
      draftState.mode = "board";
      draftState.simulation = null;
      if (recsLoadMoreBtn) recsLoadMoreBtn.style.display = "none";
      setPickerCollapsed(false);
      return;
    }
    const team = teams.find((t) => t.team_abbr === selectedAbbr);
    if (!team) {
      clearSeasonSimulationTimer();
      setEmptyState(true);
      if (currentPanel) currentPanel.classList.remove("is-team-selected");
      if (pickedTeam) pickedTeam.textContent = "";
      if (pickerPanel) {
        pickerPanel.classList.remove("has-team-bg");
        pickerPanel.style.removeProperty("--team-logo-bg");
      }
      if (rosterEl) rosterEl.innerHTML = "";
      if (recList) recList.innerHTML = "";
      if (draftResults) draftResults.innerHTML = "";
      if (recsLoadMoreBtn) recsLoadMoreBtn.style.display = "none";
      setPickerCollapsed(false);
      return;
    }
    setEmptyState(false);
    setActiveModule(activeModule);
    if (currentPanel) currentPanel.classList.add("is-team-selected");
    if (pickedTeam) pickedTeam.textContent = "";
    if (pickerPanel) {
      const teamLogoId = resolveLogoId(team.team_abbr);
      if (teamLogoId) {
        pickerPanel.style.setProperty("--team-logo-bg", `url("https://cdn.nba.com/logos/nba/${teamLogoId}/global/L/logo.svg")`);
        pickerPanel.classList.add("has-team-bg");
      } else {
        pickerPanel.classList.remove("has-team-bg");
        pickerPanel.style.removeProperty("--team-logo-bg");
      }
    }
    syncCurrentTeamPicker(selectedAbbr);
    const data = analyzeTeam(team, avgs);
    const baseNeeds = computeTeamNeeds(team, avgs);
    const fixedPhase = getFixedTeamPhase(team.team_abbr);
    const phaseProfile = getTeamPhaseProfile(fixedPhase);
    const teamIdentity = getTeamIdentity(team);
    const phaseNeeds = applyTeamPhaseToNeeds(baseNeeds, phaseProfile);
    const styleShift = buildStyleShift(team, avgs, phaseProfile, phaseNeeds, teamIdentity);
    renderRadar(team, avgs);
    renderCurrentDetailCharts(team, avgs);
    renderCurrentRoster(rosterEl, selectedAbbr, players);
    const summaryModel = buildSummaryModel(team, avgs, data);
    renderWeaknesses(summaryConclusionEl, tagsEl, summarySplitEl, summaryModel);
    renderStyleShift(styleShiftEl, styleShift);
    const profileKey = normalizeTeamAbbr(selectedAbbr);
    const profile = (window.__CURRENT_TEAM_PROFILES && window.__CURRENT_TEAM_PROFILES[profileKey]) || null;
    renderTeamProfile(teamProfilePanel, team, profile);
    const recs = recommend(team, marketPlayers, data.weaknesses, avgs, window.__CURRENT_PLAYER_AVGS, fixedPhase, players);
    currentRecs = recs;
    renderRecs(recList, currentRecs, recDisplayCount);
    if (recsLoadMoreBtn) recsLoadMoreBtn.style.display = recDisplayCount < currentRecs.length ? "" : "none";

    if (draftResults) {
      if (draftState.mode === "sim" && draftState.simulation) {
        renderSeasonSimBoard(draftResults, draftState);
        return;
      }
      const needs = applyTeamPhaseToNeeds(computeTeamNeeds(team, avgs), phaseProfile);
      const prospects = normalizeDraftProspects(window.__CURRENT_DRAFT_POOL || []);
      const scoredAll = prospects
        .map((p) => {
          const pProfile = buildPlayerFunctionProfile(p, window.__CURRENT_PLAYER_AVGS || avgs);
          const fit = scorePlayer(p, team, needs, phaseProfile, teamIdentity, pProfile).score;
          const fitScore = clamp(fit, 0, 120);
          const draftScore = clamp(fit * num(p.potential, 1), 0, 120);
          return { p, fitScore, draftScore };
        })
        .sort((a, b) => b.fitScore - a.fitScore);
      const selectedGroup = draftState.positionFilter || "all";
      const visible = scoredAll
        .filter((x) => selectedGroup === "all" || draftPosGroup(x.p.pos) === selectedGroup)
        .sort((a, b) => num(a.p.draft_rank, 999) - num(b.p.draft_rank, 999));
      const totalPages = Math.max(1, Math.ceil(visible.length / 9));
      draftState.page = clamp(num(draftState.page, 0), 0, totalPages - 1);
      if (draftState.selectedId && !scoredAll.some((x) => x.p.id === draftState.selectedId)) {
        draftState.selectedId = "";
      }
      if (draftState.selectedId && !visible.some((x) => x.p.id === draftState.selectedId) && visible[0]) {
        draftState.selectedId = "";
      }
      const pageStart = draftState.page * 9;
      const pageItems = visible.slice(pageStart, pageStart + 9);
      const selected = visible.find((x) => x.p.id === draftState.selectedId) || scoredAll.find((x) => x.p.id === draftState.selectedId) || null;
      if (draftState.lockedId && !scoredAll.some((x) => x.p.id === draftState.lockedId)) draftState.lockedId = "";
      const selectedImpact = selected ? computeDraftImpact(team, avgs, selected.p) : null;
      const fitScore = selectedImpact && selected ? computeDraftFitScore(selectedImpact, selected.p.potential) : 0;
      const grade = draftGradeFromScore(fitScore);
      const gmInsight = selectedImpact ? buildDraftGmInsight(selectedImpact) : "";
      const udr = selectedImpact && selected ? buildDraftUpsideDownsideRisk(selectedImpact, selected.p) : null;
      const fmtShift = (v) => `${v >= 0 ? "⬆ +" : "⬇ "}${fmt2(Math.abs(v))}%`;
      // 统一口径：将不同量纲映射到“影响百分比”，并限制在可读区间
      const shootShift = selectedImpact ? emphasizePercent(impactToPercent(selectedImpact.delta.fg3_pp, 1.9, 24), 1.0) : 0;
      const defenseShift = selectedImpact ? emphasizePercent(impactToPercent(-selectedImpact.delta.drtg, 2.1, 24), 1.0) : 0;
      const playShift = selectedImpact ? emphasizePercent(impactToPercent(selectedImpact.delta.ast, 1.8, 24), 1.0) : 0;
      draftResults.innerHTML = `
        <div class="draft-war-room">
          <header class="draft-war-room__top">
            <div>
              <p class="draft-war-room__kicker">War Room Live</p>
              <h2 class="draft-war-room__title">2026 NBA Draft</h2>
            </div>
          </header>

          <section class="draft-war-room__stage">
            <div class="draft-pool-toolbar">
              <label>位置筛选</label>
              <div class="draft-pos-tags" role="group" aria-label="Position filters">
                <button type="button" class="draft-pos-tag ${selectedGroup === "all" ? "is-active" : ""}" data-pos="all">全部</button>
                <button type="button" class="draft-pos-tag ${selectedGroup === "guard" ? "is-active" : ""}" data-pos="guard">后卫</button>
                <button type="button" class="draft-pos-tag ${selectedGroup === "forward" ? "is-active" : ""}" data-pos="forward">前锋</button>
                <button type="button" class="draft-pos-tag ${selectedGroup === "center" ? "is-active" : ""}" data-pos="center">中锋</button>
              </div>
              <div class="draft-pool-pager" aria-label="Prospects pages">
                <button type="button" class="draft-page-btn" id="draft-page-prev" ${draftState.page <= 0 ? "disabled" : ""}>‹ 上一页</button>
                <span class="draft-page-indicator">${draftState.page + 1} / ${totalPages}</span>
                <button type="button" class="draft-page-btn" id="draft-page-next" ${draftState.page >= totalPages - 1 ? "disabled" : ""}>下一页 ›</button>
              </div>
            </div>
            <div class="draft-hall-grid">
              ${pageItems
                .map(({ p }) => {
                  const fallback = grayPersonAvatarDataUrl();
                  const avatar = draftAvatarFromUrl(p.avatar_url) || fallback;
                  const selectedCls = draftState.selectedId === p.id ? "is-selected" : "";
                  const tags = [];
                  if (num(p.potential, 1) >= 1.12) tags.push("🔥 High Potential");
                  if (num(p.stl) + num(p.blk) >= num(avgs.stl) + num(avgs.blk)) tags.push("🛡 Defense");
                  if (!tags.length) tags.push("🎯 Rotation");
                  const sub = [String(p.pos || "").trim(), String(p.school || "").trim()].filter(Boolean).join(" · ");
                  return `<article class="draft-pool-card draft-ut-card ${selectedCls}" data-id="${p.id}">
                    <img src="${avatar}" alt="${p.player_name}" class="draft-pool-card__avatar" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='${fallback.replace(/'/g, "%27")}'" />
                    <div class="draft-pool-card__meta">
                      <div class="draft-pool-card__name">${p.player_name}</div>
                      <div class="draft-pool-card__sub">${sub || "--"}</div>
                      <div class="draft-pool-card__tags">${tags.map((x) => `<span class="role-badge">${x}</span>`).join("")}</div>
                    </div>
                    <div class="draft-card-stats">
                      <span class="draft-stat-pill">得分 ${num(p.pts).toFixed(1)}</span>
                      <span class="draft-stat-pill">AST ${num(p.ast).toFixed(1)}</span>
                      <span class="draft-stat-pill">REB ${num(p.reb).toFixed(1)}</span>
                    </div>
                  </article>`;
                })
                .join("")}
            </div>
          </section>

          <section class="draft-war-room__feedback">
            ${
              selected
                ? `<div class="draft-impact__pick">Selected: <strong>${selected.p.player_name}</strong> (${selected.p.pos})</div>
                   <div class="draft-feedback-grid">
                     <div>
                       <div id="draft-impact-radar" class="draft-impact-radar"></div>
                       <div class="draft-player-info">
                         <div class="draft-player-info__head">
                           <strong>新秀信息</strong>
                           <span>#${num(selected.p.draft_rank, 0) || "-"}</span>
                         </div>
                         <div class="draft-player-info__grid">
                           <div>姓名：${selected.p.player_name || "-"}</div>
                           <div>位置：${selected.p.pos || "-"}</div>
                           <div>学校：${selected.p.school || "-"}</div>
                           <div>投射(3P%)：${fmt2(num(selected.p.fg3_pct) * 100)}%</div>
                           <div>防守破坏：${fmt2(num(selected.p.stl) + num(selected.p.blk))}</div>
                           <div>场均得分：${fmt2(num(selected.p.pts))}</div>
                           <div>场均篮板：${fmt2(num(selected.p.reb))}</div>
                           <div>场均助攻：${fmt2(num(selected.p.ast))}</div>
                           <div>场均失误：${fmt2(num(selected.p.tov))}</div>
                         </div>
                       </div>
                     </div>
                     <div class="draft-feedback-side">
                       <div class="draft-impact-shifts">
                         <div class="draft-shift-row ${shootShift >= 0 ? "is-up" : "is-down"}"><span>外线投射</span><strong>${fmtShift(shootShift)}</strong></div>
                         <div class="draft-shift-row ${defenseShift >= 0 ? "is-up" : "is-down"}"><span>防守能力</span><strong>${fmtShift(defenseShift)}</strong></div>
                         <div class="draft-shift-row ${playShift >= 0 ? "is-up" : "is-down"}"><span>组织能力</span><strong>${fmtShift(playShift)}</strong></div>
                       </div>
                       <div class="draft-gm-insight">
                         <span>📈 预计提升方面：</span>
                         <div>${udr ? udr.ups.join("；") : "-"}</div>
                       </div>
                       <div class="draft-gm-insight">
                         <span>📉 预计降低方面：</span>
                         <div>${udr ? udr.downs.join("；") : "-"}</div>
                       </div>
                       <div class="draft-gm-insight">
                         <span>⚠️ 选择风险：</span>
                         <div>${udr ? udr.risk : gmInsight}</div>
                       </div>
                       <button type="button" class="draft-lock-btn" id="draft-lock-btn">✅ Draft This Player</button>
                       ${
                         draftState.lockedId === selected.p.id
                           ? `<div class="draft-lock-result">✔ You selected: ${selected.p.player_name}<br/>Draft Grade: ${grade}</div>`
                           : ""
                       }
                     </div>
                   </div>`
                : `<p class="draft-empty">请选择一名新秀查看实时模拟。</p>`
            }
          </section>
        </div>
      `;

      const radarEl = document.getElementById("draft-impact-radar");
      if (selectedImpact && radarEl && typeof echarts !== "undefined") {
        const labels = ["投射", "组织", "篮板", "防守", "控失误", "进攻等级"];
        const beforeVals = [
          num(selectedImpact.before.fg3_pct) * 220,
          num(selectedImpact.before.ast) * 3.4,
          num(selectedImpact.before.reb) * 2.1,
          clamp(240 - num(selectedImpact.before.drtg) * 1.6, 0, 100),
          clamp(120 - num(selectedImpact.before.tov) * 5.2, 0, 100),
          num(selectedImpact.before.ortg) * 0.82,
        ].map((v) => clamp(v, 0, 100));
        const afterVals = [
          num(selectedImpact.after.fg3_pct) * 220,
          num(selectedImpact.after.ast) * 3.4,
          num(selectedImpact.after.reb) * 2.1,
          clamp(240 - num(selectedImpact.after.drtg) * 1.6, 0, 100),
          clamp(120 - num(selectedImpact.after.tov) * 5.2, 0, 100),
          num(selectedImpact.after.ortg) * 0.82,
        ].map((v) => clamp(v, 0, 100));
        const deltaVals = afterVals.map((v, i) => v - beforeVals[i]);
        const draftRadar = echarts.getInstanceByDom(radarEl) || echarts.init(radarEl, null, { renderer: "canvas" });
        draftRadar.setOption({
          animation: true,
          grid: { left: 62, right: 22, top: 34, bottom: 22 },
          legend: { top: 4, icon: "roundRect", itemWidth: 14, itemHeight: 8, textStyle: { color: "#6b7280", fontSize: 11 } },
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            formatter(params) {
              const list = Array.isArray(params) ? params : [];
              const idx = list[0]?.dataIndex ?? 0;
              const b = beforeVals[idx] || 0;
              const a = afterVals[idx] || 0;
              const d = deltaVals[idx] || 0;
              const dStr = `${d >= 0 ? "+" : ""}${fmt2(d)}`;
              return `${labels[idx]}<br/>选秀前：${fmt2(b)}<br/>选秀后：${fmt2(a)}<br/>变化：${dStr}`;
            },
          },
          xAxis: {
            type: "value",
            min: 0,
            max: 100,
            axisLabel: { color: "#6b7280", fontSize: 10 },
            splitLine: { lineStyle: { color: "rgba(100,116,139,0.18)" } },
          },
          yAxis: {
            type: "category",
            data: labels,
            axisLabel: { color: "#475569", fontSize: 12, fontWeight: 600 },
            axisLine: { show: false },
            axisTick: { show: false },
          },
          series: [
            {
              name: "选秀前（球队基线）",
              type: "bar",
              data: beforeVals,
              barWidth: 10,
              barGap: "35%",
              itemStyle: { color: "#6b7280", borderRadius: [0, 4, 4, 0] },
            },
            {
              name: "选秀后（球队变化）",
              type: "bar",
              data: afterVals,
              barWidth: 10,
              itemStyle: { color: "#2563eb", borderRadius: [0, 4, 4, 0] },
              label: {
                show: true,
                position: "right",
                color: "#334155",
                fontSize: 10,
                formatter(p) {
                  const d = deltaVals[p.dataIndex] || 0;
                  return `Δ${d >= 0 ? "+" : ""}${fmt2(d)}`;
                },
              },
            },
          ],
        });
      }
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

