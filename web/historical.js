/**
 * Historical Analysis：仅趋势与对比可视化，不做任何推荐。
 * 数据：../data/history/echarts_history.json
 */

const HIST_DIM_IDS = [
  "chart-hist-dim-ortg",
  "chart-hist-dim-drtg",
  "chart-hist-dim-pace",
  "chart-hist-dim-fg3",
  "chart-hist-dim-rebp",
  "chart-hist-dim-rpg",
  "chart-hist-dim-stkblk",
  "chart-hist-dim-tov",
];

/** 三分小球时代参考（在数据中存在该赛季时才画竖线） */
const SMALL_BALL_MARK_SEASONS = ["2014-15", "2015-16", "2016-17"];

function alignLeague(seasons, leagueObj, key) {
  if (!leagueObj || !seasons.length) return seasons.map(() => null);
  return seasons.map((s) => {
    const row = leagueObj[s];
    if (!row || row[key] == null || row[key] === "") return null;
    const n = Number(row[key]);
    return Number.isFinite(n) ? n : null;
  });
}

/** 展示与坐标轴：统一两位小数 */
function histFmt2(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

function histFmt2Axis(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(1);
}

function histTextColor() {
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue("--text").trim() || "#ffffff";
}

function histIsDark() {
  return (document.documentElement.getAttribute("data-theme") || "").toLowerCase() === "dark";
}

function histInk(alpha) {
  const a = Math.max(0, Math.min(1, Number(alpha)));
  return histIsDark() ? `rgba(247, 243, 236, ${a})` : `rgba(11, 14, 20, ${a})`;
}

function histMuted(alpha = 0.56) {
  return histInk(alpha);
}

const histTooltipAxis2 = {
  trigger: "axis",
  valueFormatter: histFmt2,
};

/** 时间轴探索：默认仅展示最近 N 年；拖动平移；滚轮缩放 */
function timeZoomForSeasons(seasons, { windowYears = 10 } = {}) {
  const s = Array.isArray(seasons) ? seasons : [];
  const end = s.length ? s[s.length - 1] : undefined;
  const start = s.length > windowYears ? s[s.length - windowYears] : s[0];
  return [
    {
      type: "inside",
      xAxisIndex: 0,
      filterMode: "none",
      startValue: start,
      endValue: end,
      zoomLock: true,
      zoomOnMouseWheel: false,
      moveOnMouseMove: true,
      moveOnMouseWheel: false,
      preventDefaultMouseMove: true,
    },
  ];
}

function emptyDimChartOption(msg) {
  return {
    ...ecThemeLight(),
    title: {
      text: msg,
      left: "center",
      top: "center",
      textStyle: { color: histMuted(0.52), fontSize: 13, fontWeight: 500 },
    },
    grid: { left: 12, right: 12, top: 12, bottom: 12 },
    xAxis: [{ show: false, type: "category", data: [] }],
    yAxis: [{ show: false, type: "value" }],
    series: [],
  };
}

/** 卡片标题在 HTML 中展示；画布内仅图例+坐标轴，图例在底部避免与标题叠字 */
function baseDimGrid({ withLegend = false } = {}) {
  return withLegend
    ? { left: 48, right: 14, top: 6, bottom: 76 }
    : { left: 48, right: 14, top: 6, bottom: 48 };
}

const dimLegendBottom = {
  bottom: 8,
  left: "center",
  orient: "horizontal",
  itemGap: 18,
  textStyle: { fontSize: 11, color: histMuted(0.56) },
};

function fg3MarkLineData(seasons) {
  return SMALL_BALL_MARK_SEASONS.filter((s) => seasons.includes(s)).map((s) => ({
    xAxis: s,
    label: { show: true, formatter: s, color: histMuted(0.56), fontSize: 10 },
    lineStyle: { color: histInk(0.34), type: "dashed", width: 1.2 },
  }));
}

const histChartInstances = [];
let historicalDataInitialized = false;
let selectedHistoricalTeam = null;

const DIVISION_TEAMS = [
  {
    name: "Atlantic",
    teams: [
      ["BOS", "Boston Celtics", 1610612738],
      ["BKN", "Brooklyn Nets", 1610612751],
      ["NYK", "New York Knicks", 1610612752],
      ["PHI", "Philadelphia 76ers", 1610612755],
      ["TOR", "Toronto Raptors", 1610612761],
    ],
  },
  {
    name: "Central",
    teams: [
      ["CHI", "Chicago Bulls", 1610612741],
      ["CLE", "Cleveland Cavaliers", 1610612739],
      ["DET", "Detroit Pistons", 1610612765],
      ["IND", "Indiana Pacers", 1610612754],
      ["MIL", "Milwaukee Bucks", 1610612749],
    ],
  },
  {
    name: "Southeast",
    teams: [
      ["ATL", "Atlanta Hawks", 1610612737],
      ["CHO", "Charlotte Hornets", 1610612766],
      ["MIA", "Miami Heat", 1610612748],
      ["ORL", "Orlando Magic", 1610612753],
      ["WAS", "Washington Wizards", 1610612764],
    ],
  },
  {
    name: "Northwest",
    teams: [
      ["DEN", "Denver Nuggets", 1610612743],
      ["MIN", "Minnesota Timberwolves", 1610612750],
      ["OKC", "Oklahoma City Thunder", 1610612760],
      ["POR", "Portland Trail Blazers", 1610612757],
      ["UTA", "Utah Jazz", 1610612762],
    ],
  },
  {
    name: "Pacific",
    teams: [
      ["GSW", "Golden State Warriors", 1610612744],
      ["LAC", "LA Clippers", 1610612746],
      ["LAL", "Los Angeles Lakers", 1610612747],
      ["PHX", "Phoenix Suns", 1610612756],
      ["SAC", "Sacramento Kings", 1610612758],
    ],
  },
  {
    name: "Southwest",
    teams: [
      ["DAL", "Dallas Mavericks", 1610612742],
      ["HOU", "Houston Rockets", 1610612745],
      ["MEM", "Memphis Grizzlies", 1610612763],
      ["NOP", "New Orleans Pelicans", 1610612740],
      ["SAS", "San Antonio Spurs", 1610612759],
    ],
  },
];

const TEAM_KEY_ALIASES = {
  CHO: ["CHO", "CHA"],
  CHA: ["CHO", "CHA"],
  BKN: ["BKN", "BRK"],
  BRK: ["BKN", "BRK"],
  PHX: ["PHX", "PHO"],
  PHO: ["PHX", "PHO"],
};

/** 与 team_style_8d / JSON 中字段一致，用于雷达展示 */
const STYLE8D_METRICS = [
  { key: "off_rating", name: "进攻 ORtg", radar: (v) => (Number.isFinite(Number(v)) ? Number(v) : 0) },
  { key: "def_rating", name: "防守 DRtg", radar: (v) => (Number.isFinite(Number(v)) ? Number(v) : 0) },
  { key: "pace", name: "节奏 Pace", radar: (v) => (Number.isFinite(Number(v)) ? Number(v) : 0) },
  { key: "fg3_pct", name: "三分命中率", radar: (v) => (Number.isFinite(Number(v)) ? Number(v) * 100 : 0) },
  { key: "fg3a", name: "三分出手", radar: (v) => (Number.isFinite(Number(v)) ? Number(v) : 0) },
  { key: "rpg", name: "场均篮板 RPG", radar: (v) => (Number.isFinite(Number(v)) ? Number(v) : 0) },
  { key: "stl_blk", name: "抢断+盖帽", radar: (v) => (Number.isFinite(Number(v)) ? Number(v) : 0) },
];

function allDivisionEntries() {
  return DIVISION_TEAMS.flatMap((d) => d.teams);
}

/** ?team=LAL 或 ?team=1610612747：解析为与 echarts_history.teams 一致的 key */
function pickInitialTeamFromUrl(keys, teams) {
  let q = "";
  try {
    q = (new URLSearchParams(location.search).get("team") || "").trim();
  } catch (_) {
    return null;
  }
  if (!q) return null;
  const qu = q.toUpperCase();
  if (keys.includes(q)) return q;
  if (keys.includes(qu)) return qu;
  for (const [, , tid] of allDivisionEntries()) {
    const idKey = String(tid);
    if (keys.includes(idKey) && (q === idKey || qu === idKey)) return idKey;
  }
  for (const [abbr, , tid] of allDivisionEntries()) {
    if (abbr.toUpperCase() !== qu) continue;
    const idKey = String(tid);
    if (keys.includes(idKey)) return idKey;
    if (keys.includes(abbr)) return abbr;
    const aliases = TEAM_KEY_ALIASES[abbr] || [abbr];
    for (const a of aliases) {
      if (keys.includes(a)) return a;
    }
  }
  for (const k of keys) {
    const label = ((teams[k] && teams[k].label) || "").toUpperCase();
    if (label && (label.includes(qu) || qu.includes(label))) return k;
  }
  return null;
}

function gathersSeasonRows(teams8d, season) {
  const rows = [];
  if (!teams8d) return rows;
  for (const arr of Object.values(teams8d)) {
    const hit = (arr || []).find((x) => x.season === season);
    if (hit) rows.push(hit);
  }
  return rows;
}

function rowToRadarValues(row) {
  if (!row) return STYLE8D_METRICS.map(() => 0);
  return STYLE8D_METRICS.map((m) => m.radar(row[m.key]));
}

function histMetricRawText(metricKey, rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return "—";
  if (metricKey === "fg3_pct") return `${(n * 100).toFixed(1)}%`;
  return n.toFixed(1);
}

function maxesForSeason(teams8d, season) {
  const rows = gathersSeasonRows(teams8d, season);
  return STYLE8D_METRICS.map((m) => {
    const vals = rows.map((r) => m.radar(r[m.key])).filter((v) => Number.isFinite(v) && v > 0);
    const mx = vals.length ? Math.max(...vals) : 1;
    return mx * 1.12;
  });
}

function leagueMeanRow(teams8d, season) {
  const rows = gathersSeasonRows(teams8d, season);
  if (!rows.length) return null;
  const o = { season };
  for (const m of STYLE8D_METRICS) {
    // 注意：这里必须对「原始值」求均值，不能对 radar() 后的值再求均值，
    // 否则后续 rowToRadarValues() 再次 radar() 会造成重复缩放（例如 fg3_pct 被 ×100 两次）。
    const nums = rows
      .map((r) => Number(r[m.key]))
      .filter((v) => Number.isFinite(v));
    o[m.key] = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  }
  return o;
}

function renderHist8dEmptyState(histChart, text = "请先选择赛季") {
  if (!histChart) return;
  histChart.setOption(
    {
      ...ecThemeLight(),
      title: { show: false },
      legend: { show: false },
      tooltip: { show: false },
      radar: undefined,
      series: [],
      graphic: [
        {
          type: "group",
          left: "center",
          top: "middle",
          children: [
            {
              type: "text",
              style: {
                text,
                fill: histMuted(0.58),
                font: "600 14px DM Sans, Segoe UI, sans-serif",
                textAlign: "center",
              },
            },
          ],
        },
      ],
    },
    true
  );
}

function setHist8dPickerUIState(seasonSelect, mode) {
  const panel = seasonSelect ? seasonSelect.closest(".panel-hist-8d") : null;
  if (!panel) return;
  panel.classList.toggle("is-season-pending", mode === "pending");
}

function drawHistStyle8d(histChart, seasonSelect, data, teamKey) {
  const teams8d = data.teams8d || {};
  if (!histChart) return;
  const picker = document.getElementById("hist-8d-picker");
  const trigger = document.getElementById("hist-8d-trigger");
  const menu = document.getElementById("hist-8d-menu");

  const closeSeasonMenu = () => {
    if (!picker || !trigger || !menu) return;
    picker.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    menu.hidden = true;
  };

  const setSeasonPickerDisabled = (disabled, text = "选择赛季") => {
    if (!picker || !trigger || !menu) return;
    picker.classList.toggle("is-disabled", !!disabled);
    trigger.textContent = text;
    closeSeasonMenu();
  };

  if (!teamKey) {
    if (seasonSelect) {
      seasonSelect.innerHTML = "";
      seasonSelect.disabled = true;
    }
    if (menu) menu.innerHTML = "";
    setSeasonPickerDisabled(true, "先选球队");
    setHist8dPickerUIState(seasonSelect, "pending");
    renderHist8dEmptyState(histChart, "请先选择球队");
    return;
  }

  const mine = teams8d[teamKey];
  const teamLabel = (data.teams && data.teams[teamKey] && data.teams[teamKey].label) || teamKey;
  if (!mine || !mine.length) {
    if (seasonSelect) {
      seasonSelect.innerHTML = "";
      seasonSelect.disabled = true;
    }
    if (menu) menu.innerHTML = "";
    setSeasonPickerDisabled(true, "暂无赛季");
    setHist8dPickerUIState(seasonSelect, "pending");
    renderHist8dEmptyState(histChart, "暂无该队风格维度数据");
    return;
  }

  if (seasonSelect) {
    seasonSelect.disabled = false;
    seasonSelect.innerHTML = ['<option value="">选择赛季</option>', ...mine.map((r) => `<option value="${r.season}">${r.season}</option>`)].join("");
    seasonSelect.value = "";
  }
  if (menu) {
    menu.innerHTML = mine
      .map(
        (r) =>
          `<button type="button" class="hist-season-option" data-season="${r.season}" role="option" aria-selected="false">${r.season}</button>`
      )
      .join("");
  }
  setSeasonPickerDisabled(false, "选择赛季");
  setHist8dPickerUIState(seasonSelect, "pending");
  renderHist8dEmptyState(histChart, "请选择赛季后显示雷达图");

  function paint() {
    const season = seasonSelect ? seasonSelect.value : "";
    if (!season) {
      setHist8dPickerUIState(seasonSelect, "pending");
      renderHist8dEmptyState(histChart, "请选择赛季后显示雷达图");
      return;
    }
    const row = mine.find((r) => r.season === season);
    const league = leagueMeanRow(teams8d, season);
    const maxes = maxesForSeason(teams8d, season);
    const teamVals = rowToRadarValues(row);
    const leagueVals = rowToRadarValues(league);
    const indicators = STYLE8D_METRICS.map((m, i) => ({
      name: m.name,
      max: Math.max(maxes[i] || 1, teamVals[i] || 0, leagueVals[i] || 0, 1),
      min: 0,
    }));

    setHist8dPickerUIState(seasonSelect, "picked");
    if (trigger) trigger.textContent = season;
    if (menu) {
      menu.querySelectorAll(".hist-season-option").forEach((el) => {
        const active = el.getAttribute("data-season") === season;
        el.classList.toggle("is-active", active);
        el.setAttribute("aria-selected", active ? "true" : "false");
      });
    }
    histChart.setOption(
      {
        ...ecThemeLight(),
        title: {
          text: `${teamLabel} · ${season} · 风格雷达`,
          left: 0,
          top: 2,
          textStyle: { fontSize: 14, fontWeight: 700 },
        },
        legend: {
          data: ["本队", "联盟均值"],
          right: 16,
          bottom: 16,
          itemWidth: 20,
          itemHeight: 12,
          itemGap: 18,
          textStyle: { color: histTextColor(), fontSize: 14, fontWeight: 700 },
        },
        radar: {
          indicator: indicators,
          radius: "64%",
          center: ["50%", "56%"],
          splitNumber: 5,
          axisName: { color: histTextColor(), fontSize: 12, fontWeight: 600 },
          axisLine: { lineStyle: { color: histInk(0.22) } },
          splitLine: { lineStyle: { color: histInk(0.18) } },
          splitArea: {
            areaStyle: { color: [histInk(0.10), histInk(0.07), histInk(0.05), histInk(0.03), histInk(0.015)] },
          },
        },
        tooltip: {
          trigger: "item",
          backgroundColor: histIsDark() ? "rgba(17, 19, 24, 0.95)" : "rgba(247, 243, 236, 0.97)",
          borderColor: histIsDark() ? "rgba(247, 243, 236, 0.16)" : "rgba(11, 14, 20, 0.14)",
          borderWidth: 1,
          padding: [12, 14],
          textStyle: {
            color: histTextColor(),
            fontSize: 13,
            lineHeight: 20,
          },
          extraCssText: [
            "border-radius:14px",
            "box-shadow:0 12px 28px rgba(0,0,0,0.22)",
            "backdrop-filter: blur(2px)",
          ].join(";"),
          formatter(p) {
            if (!p || p.value == null) return "";
            const vals = Array.isArray(p.value) ? p.value : [p.value];
            const seriesLabel = p.name;
            const lines = STYLE8D_METRICS.map((m, i) => {
              const teamRawNum = Number(row && row[m.key]);
              const leagueRawNum = Number(league && league[m.key]);
              const teamRaw = histMetricRawText(m.key, row && row[m.key]);
              const rawLeague = histMetricRawText(m.key, league && league[m.key]);
              let deltaText = "—";
              if (Number.isFinite(teamRawNum) && Number.isFinite(leagueRawNum)) {
                const delta = m.key === "fg3_pct" ? (teamRawNum - leagueRawNum) * 100 : teamRawNum - leagueRawNum;
                const unit = m.key === "fg3_pct" ? "pp" : "";
                deltaText = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}${unit}`;
              }
              return `<span style="display:inline-block;min-width:98px;color:${histMuted(0.72)}">${m.name}</span><span style="font-weight:700">雷达 ${histFmt2(
                vals[i]
              )}</span><span style="color:${histMuted(0.64)}">  ·  本队 ${teamRaw}  ·  联盟 ${rawLeague}  ·  Δ ${deltaText}</span>`;
            }).join("<br/>");
            return `<div style="margin-bottom:6px;font-size:14px;font-weight:800;letter-spacing:.01em">${p.marker}<span>${seriesLabel} · ${teamLabel} · ${season}</span></div>${lines}`;
          },
        },
        series: [
          {
            type: "radar",
            data: [
              {
                value: teamVals,
                name: "本队",
                areaStyle: { opacity: 0.2, color: histInk(0.30) },
                lineStyle: { width: 2.6, color: histInk(0.9) },
                symbol: "circle",
                symbolSize: 6,
                itemStyle: { color: histInk(0.9) },
              },
              {
                value: leagueVals,
                name: "联盟均值",
                symbol: "none",
                lineStyle: { type: "dashed", dashOffset: 0, width: 3, color: histInk(0.42) },
                areaStyle: { opacity: 0 },
                itemStyle: { color: histInk(0.42) },
              },
            ],
          },
        ],
      },
      true
    );
  }

  if (picker && trigger && menu && !picker.dataset.bound) {
    picker.dataset.bound = "1";
    trigger.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (picker.classList.contains("is-disabled")) return;
      const open = !picker.classList.contains("is-open");
      picker.classList.toggle("is-open", open);
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      menu.hidden = !open;
    });
    menu.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".hist-season-option");
      if (!btn || !seasonSelect) return;
      seasonSelect.value = btn.getAttribute("data-season") || "";
      closeSeasonMenu();
      paint();
    });
    document.addEventListener("click", (ev) => {
      if (!picker.contains(ev.target)) closeSeasonMenu();
    });
  }

  if (seasonSelect) seasonSelect.onchange = paint;
}

function ecThemeLight() {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const text = style.getPropertyValue("--text").trim() || "#e5e7eb";
  return {
    color: [histInk(0.9), histInk(0.72), histInk(0.55), histInk(0.38)],
    textStyle: { color: text },
    backgroundColor: "transparent",
  };
}

async function loadHistoryJson() {
  const url = new URL("../data/history/echarts_history.json", window.location.href);
  const r = await fetch(url);
  if (!r.ok) throw new Error("echarts_history.json");
  return r.json();
}

function pushChart(chart) {
  if (chart) histChartInstances.push(chart);
}

function resizeHistoricalCharts() {
  histChartInstances.forEach((c) => {
    try {
      c.resize();
    } catch (_) {}
  });
}

function seasonsList(data) {
  if (data.meta?.seasons?.length) return data.meta.seasons;
  return [];
}

function renderDivisionBoard(containerEl, teamsData, onPick) {
  const keys = new Set(Object.keys(teamsData || {}));
  containerEl.innerHTML = "";

  function resolveTeamKey(abbr, teamId) {
    const idKey = String(teamId || "");
    if (idKey && keys.has(idKey)) return idKey;
    if (keys.has(abbr)) return abbr;
    const aliases = TEAM_KEY_ALIASES[abbr] || [abbr];
    for (const k of aliases) {
      if (keys.has(k)) return k;
    }
    return null;
  }

  for (const div of DIVISION_TEAMS) {
    const row = document.createElement("div");
    row.className = "division-row";
    const title = document.createElement("div");
    title.className = "division-name";
    title.textContent = div.name;
    row.appendChild(title);
    const teamsWrap = document.createElement("div");
    teamsWrap.className = "teams-row";

    for (const [abbr, name, teamId] of div.teams) {
      const resolvedKey = resolveTeamKey(abbr, teamId);
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "team-tile";
      tile.dataset.team = resolvedKey || abbr;
      tile.disabled = !resolvedKey;
      tile.innerHTML = `
        <img src="https://cdn.nba.com/logos/nba/${teamId}/global/L/logo.svg" alt="${name} logo" loading="lazy" />
        <span>${name}</span>
      `;
      tile.addEventListener("click", () => {
        if (resolvedKey) onPick(resolvedKey);
      });
      teamsWrap.appendChild(tile);
    }
    row.appendChild(teamsWrap);
    containerEl.appendChild(row);
  }
}

function syncDivisionBoardActive(containerEl, teamKey) {
  containerEl.querySelectorAll(".team-tile").forEach((n) => {
    n.classList.toggle("is-active", n.dataset.team === teamKey);
  });
}

function drawHistoricalDimCards(dimCharts, leagueObj, teamKey, teams) {
  const empty = (msg) => {
    dimCharts.forEach((c) => {
      if (c) c.setOption(emptyDimChartOption(msg), true);
    });
  };

  if (!teamKey) {
    empty("请选择球队");
    return;
  }

  const t = teams[teamKey];
  if (!t) {
    empty("无该队数据");
    return;
  }

  const seasons = t.seasons || [];
  const league = leagueObj || {};
  const dataZoom = timeZoomForSeasons(seasons, { windowYears: 10 });

  const [cOrtg, cDrtg, cPace, cFg3, cRebp, cRpg, cStk, cTov] = dimCharts;

  const dualLine = (chart, yName, teamArr, leagueArr) => {
    if (!chart) return;
    chart.setOption(
      {
        ...ecThemeLight(),
        tooltip: histTooltipAxis2,
        legend: { ...dimLegendBottom, data: ["本队", "联盟场均"] },
        grid: baseDimGrid({ withLegend: true }),
        dataZoom,
        xAxis: {
          type: "category",
          data: seasons,
          axisLabel: { rotate: 38, fontSize: 10, margin: 14 },
        },
        yAxis: {
          type: "value",
          name: yName,
          scale: true,
          nameTextStyle: { fontSize: 11, color: histMuted(0.56) },
          axisLabel: { formatter: histFmt2Axis, fontSize: 10, color: histTextColor() },
        },
        series: [
          {
            name: "本队",
            type: "line",
            data: teamArr,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 2.1 },
          },
          {
            name: "联盟场均",
            type: "line",
            data: leagueArr,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 1.4, type: "dashed" },
            itemStyle: { color: histInk(0.42) },
          },
        ],
      },
      true
    );
  };

  dualLine(cOrtg, "ORtg", t.off_rating || [], alignLeague(seasons, league, "off_rating"));

  dualLine(cDrtg, "DRtg", t.def_rating || [], alignLeague(seasons, league, "def_rating"));

  if (cPace) {
    const leaguePace = alignLeague(seasons, league, "pace");
    cPace.setOption(
      {
        ...ecThemeLight(),
        tooltip: histTooltipAxis2,
        legend: { ...dimLegendBottom, data: ["本队", "联盟场均"] },
        grid: baseDimGrid({ withLegend: true }),
        dataZoom,
        xAxis: {
          type: "category",
          data: seasons,
          axisLabel: { rotate: 38, fontSize: 10, margin: 14 },
        },
        yAxis: {
          type: "value",
          name: "Pace",
          scale: true,
          nameTextStyle: { fontSize: 11, color: histMuted(0.56) },
          axisLabel: { formatter: histFmt2Axis, fontSize: 10, color: histTextColor() },
        },
        series: [
          {
            name: "本队",
            type: "line",
            data: t.pace || [],
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 2.1 },
          },
          {
            name: "联盟场均",
            type: "line",
            data: leaguePace,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 1.4, type: "dashed" },
            itemStyle: { color: histInk(0.42) },
          },
        ],
      },
      true
    );
  }

  const teamFg3 = (t.fg3_pct || []).map((v) => (v == null || v === "" ? null : Number(v) * 100));
  const leagueFg3 = alignLeague(seasons, league, "fg3_pct").map((v) => (v == null ? null : v * 100));
  const fg3Mark = fg3MarkLineData(seasons);

  if (cFg3) {
    cFg3.setOption(
      {
        ...ecThemeLight(),
        legend: { ...dimLegendBottom, data: ["本队", "联盟场均"] },
        tooltip: {
          trigger: "axis",
          valueFormatter: (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? "—" : `${Number(v).toFixed(1)}%`),
        },
        grid: baseDimGrid({ withLegend: true }),
        dataZoom,
        xAxis: {
          type: "category",
          data: seasons,
          axisLabel: { rotate: 38, fontSize: 10, margin: 14 },
        },
        yAxis: {
          type: "value",
          name: "命中率 %",
          scale: true,
          nameTextStyle: { fontSize: 11, color: histMuted(0.56) },
          axisLabel: { formatter: (v) => `${histFmt2Axis(v)}%`, fontSize: 10, color: histTextColor() },
        },
        series: [
          {
            name: "本队",
            type: "line",
            data: teamFg3,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 2.1 },
            markLine: fg3Mark.length
              ? { symbol: "none", silent: true, data: fg3Mark }
              : undefined,
          },
          {
            name: "联盟场均",
            type: "line",
            data: leagueFg3,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 1.4, type: "dashed" },
            itemStyle: { color: histInk(0.42) },
          },
        ],
      },
      true
    );
  }

  dualLine(cRebp, "RPG", t.rpg || [], alignLeague(seasons, league, "reb"));

  if (cRpg) {
    const leagueReb = alignLeague(seasons, league, "reb");
    cRpg.setOption(
      {
        ...ecThemeLight(),
        tooltip: histTooltipAxis2,
        legend: { ...dimLegendBottom, data: ["本队 RPG", "联盟场均"] },
        grid: baseDimGrid({ withLegend: true }),
        dataZoom,
        xAxis: {
          type: "category",
          data: seasons,
          axisLabel: { rotate: 38, fontSize: 10, margin: 14 },
        },
        yAxis: {
          type: "value",
          name: "RPG",
          scale: true,
          nameTextStyle: { fontSize: 11, color: histMuted(0.56) },
          axisLabel: { formatter: histFmt2Axis, fontSize: 10, color: histTextColor() },
        },
        series: [
          {
            name: "本队 RPG",
            type: "bar",
            data: t.rpg || [],
            itemStyle: { color: histInk(0.72), borderRadius: [3, 3, 0, 0] },
          },
          {
            name: "联盟场均",
            type: "line",
            data: leagueReb,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 1.6, type: "dashed", color: histInk(0.42) },
            itemStyle: { color: histInk(0.42) },
          },
        ],
      },
      true
    );
  }

  if (cStk) {
    const stl = (t.stl || []).map((v) => (v == null ? 0 : Number(v)));
    const blk = (t.blk || []).map((v) => (v == null ? 0 : Number(v)));
    const leagueStl = alignLeague(seasons, league, "stl");
    const leagueBlk = alignLeague(seasons, league, "blk");
    cStk.setOption(
      {
        ...ecThemeLight(),
        legend: { ...dimLegendBottom, data: ["本队 STL", "本队 BLK", "联盟 STL", "联盟 BLK"] },
        tooltip: histTooltipAxis2,
        grid: baseDimGrid({ withLegend: true }),
        dataZoom,
        xAxis: {
          type: "category",
          data: seasons,
          axisLabel: { rotate: 38, fontSize: 10, margin: 14 },
        },
        yAxis: {
          type: "value",
          name: "场均",
          scale: true,
          nameTextStyle: { fontSize: 11, color: histMuted(0.56) },
          axisLabel: { formatter: histFmt2Axis, fontSize: 10, color: histTextColor() },
        },
        series: [
          {
            name: "本队 STL",
            type: "bar",
            stack: "def",
            data: stl,
            itemStyle: { color: histInk(0.72) },
          },
          {
            name: "本队 BLK",
            type: "bar",
            stack: "def",
            data: blk,
            itemStyle: { color: histInk(0.48) },
          },
          {
            name: "联盟 STL",
            type: "line",
            data: leagueStl,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 1.6, type: "dashed", color: histInk(0.42) },
            itemStyle: { color: histInk(0.42) },
            z: 5,
          },
          {
            name: "联盟 BLK",
            type: "line",
            data: leagueBlk,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 1.6, type: "dashed", color: histInk(0.28) },
            itemStyle: { color: histInk(0.28) },
            z: 5,
          },
        ],
      },
      true
    );
  }

  dualLine(cTov, "TOV / 场", t.tov || [], alignLeague(seasons, league, "tov"));
}

function chartTeamSeasonPerformance(boardEl, selectedLabelEl, data) {
  const teams = data.teams || {};
  const keys = Object.keys(teams).sort((a, b) => (teams[a].label || a).localeCompare(teams[b].label || b));
  const historicalPanel = document.getElementById("panel-historical");
  const insightsEl = document.getElementById("historical-insights");
  const pickerPanel = document.getElementById("historical-team-picker");
  const pickerSelected = document.getElementById("picker-selected");
  const toggleBtn = document.getElementById("toggle-team-board");
  const hist8dEl = document.getElementById("chart-hist-8d");
  const seasonSel = document.getElementById("hist-8d-season");
  let hist8dChart = null;
  if (hist8dEl) {
    hist8dChart = echarts.init(hist8dEl, null, { renderer: "canvas" });
    pushChart(hist8dChart);
  }

  const dimCharts = HIST_DIM_IDS.map((id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const c = echarts.init(el, null, { renderer: "canvas" });
    pushChart(c);
    return c;
  });

  function draw(teamKey) {
    const t = teams[teamKey];
    if (!t) return;
    if (selectedLabelEl) selectedLabelEl.textContent = `已选择：${t.label || teamKey}`;
    if (pickerSelected) pickerSelected.textContent = `当前球队：${t.label || teamKey}`;
    syncDivisionBoardActive(boardEl, teamKey);
    drawHistoricalDimCards(dimCharts, data.league, teamKey, teams);
    if (hist8dChart) drawHistStyle8d(hist8dChart, seasonSel, data, teamKey);
  }

  function openInsights() {
    if (!historicalPanel || !insightsEl) return;
    historicalPanel.classList.add("is-team-selected");
    insightsEl.classList.add("is-open");
    setTimeout(() => resizeHistoricalCharts(), 260);
  }

  function setPickerCollapsed(collapsed) {
    if (!pickerPanel || !toggleBtn) return;
    pickerPanel.classList.toggle("is-collapsed", collapsed);
    toggleBtn.textContent = collapsed ? "更换球队" : "收起";
    toggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  if (keys.length) {
    const urlPick = pickInitialTeamFromUrl(keys, teams);
    if (urlPick) selectedHistoricalTeam = urlPick;
    selectedHistoricalTeam = keys.includes(selectedHistoricalTeam) ? selectedHistoricalTeam : null;
    renderDivisionBoard(boardEl, teams, (abbr) => {
      selectedHistoricalTeam = abbr;
      openInsights();
      draw(abbr);
      setPickerCollapsed(true);
    });
    if (selectedHistoricalTeam) {
      openInsights();
      draw(selectedHistoricalTeam);
      setPickerCollapsed(true);
    } else if (selectedLabelEl) {
      selectedLabelEl.textContent = "先点击上方球队，再查看八张分析卡片。";
      if (pickerSelected) pickerSelected.textContent = "请选择一支球队";
      setPickerCollapsed(false);
      drawHistoricalDimCards(dimCharts, data.league, null, teams);
      if (hist8dChart) drawHistStyle8d(hist8dChart, seasonSel, data, null);
    }
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const nextCollapsed = !pickerPanel?.classList.contains("is-collapsed");
        setPickerCollapsed(nextCollapsed);
      });
    }
  } else {
    drawHistoricalDimCards(dimCharts, data.league, null, teams);
    if (hist8dChart) drawHistStyle8d(hist8dChart, seasonSel, data, null);
  }

  window.addEventListener("resize", () => {
    dimCharts.forEach((c) => {
      if (c) c.resize();
    });
    if (hist8dChart) hist8dChart.resize();
  });
}

function showHistPlaceholder(msg) {
  const cap = document.getElementById("hist-caption-global");
  if (cap) cap.textContent = msg;
}

async function initHistoricalPanel() {
  if (historicalDataInitialized) return;
  histChartInstances.length = 0;
  let data;
  try {
    data = await loadHistoryJson();
  } catch (e) {
    showHistPlaceholder("无法加载历史 JSON。请运行 scripts 生成 data/history/echarts_history.json，并用 http.server 打开页面。");
    return;
  }
  historicalDataInitialized = true;

  const empty = !data.meta?.seasons?.length && !Object.keys(data.league || {}).length;
  if (empty) {
    showHistPlaceholder("当前为占位数据：请运行 fetch_history + build_echarts_history_json（见 INSTRUCTIONS.txt）。");
  }

  chartTeamSeasonPerformance(
    document.getElementById("team-division-board"),
    document.getElementById("selected-team-name"),
    data
  );
}

function syncTabUrl(name) {
  try {
    const url = new URL(location.href);
    url.searchParams.set("tab", name);
    url.hash = "";
    history.replaceState(null, "", url.pathname + url.search);
  } catch (_) {}
}

function finishTabCharts(name) {
  if (name === "historical") {
    initHistoricalPanel().then(() => setTimeout(() => resizeHistoricalCharts(), 120));
  } else {
    setTimeout(() => resizeHistoricalCharts(), 0);
  }
  if (name === "current") {
    setTimeout(() => {
      if (typeof window.refreshCurrentSeason === "function") window.refreshCurrentSeason();
      if (typeof window.resizeCurrentCharts === "function") window.resizeCurrentCharts();
    }, 120);
  }
}

function initTabs() {
  const viewTrack = document.getElementById("view-track");
  const navInner = document.getElementById("site-nav-inner");
  const tabs = document.querySelectorAll("#site-nav-inner .site-nav__btn[data-tab]");
  const panels = {
    historical: document.getElementById("panel-historical"),
    current: document.getElementById("panel-current"),
  };

  if (!viewTrack || !panels.historical || !panels.current || !tabs.length) return;

  const viewPort = document.getElementById("view-port");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let resizeFallbackTimer;

  function syncViewPortHeight() {
    if (!viewPort) return;
    const name = viewTrack.getAttribute("data-active") || "historical";
    const panel = name === "current" ? panels.current : panels.historical;
    viewPort.style.height = `${Math.ceil(panel.offsetHeight)}px`;
  }

  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => syncViewPortHeight());
    ro.observe(panels.historical);
    ro.observe(panels.current);
  }
  window.addEventListener("resize", () => syncViewPortHeight());

  function activate(name, opts) {
    const isInitial = !!(opts && opts.isInitial);
    const prev = viewTrack.getAttribute("data-active") || "historical";
    if (!isInitial && prev === name) return;

    window.__NBA_ACTIVE_TAB = name;
    viewTrack.setAttribute("data-active", name);
    if (navInner) navInner.setAttribute("data-active", name);
    syncViewPortHeight();

    tabs.forEach((btn) => {
      const on = btn.dataset.tab === name;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });

    panels.historical.setAttribute("aria-hidden", name === "current" ? "true" : "false");
    panels.current.setAttribute("aria-hidden", name === "historical" ? "true" : "false");

    syncTabUrl(name);

    const runCharts = () => {
      finishTabCharts(name);
      requestAnimationFrame(() => syncViewPortHeight());
    };

    if (isInitial || reducedMotion) {
      setTimeout(runCharts, isInitial ? 0 : 30);
      return;
    }

    clearTimeout(resizeFallbackTimer);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(resizeFallbackTimer);
      viewTrack.removeEventListener("transitionend", onEnd);
      setTimeout(runCharts, 60);
    };
    const onEnd = (e) => {
      if (e.target !== viewTrack || e.propertyName !== "transform") return;
      finish();
    };
    viewTrack.addEventListener("transitionend", onEnd);
    resizeFallbackTimer = setTimeout(finish, 520);
  }

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => activate(btn.dataset.tab, { isInitial: false }));
  });

  const boot = document.documentElement.dataset.bootTab || "historical";
  activate(boot === "current" ? "current" : "historical", { isInitial: true });
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
});
