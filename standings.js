const DRIVERS_API = "https://f1api.dev/api/current/drivers-championship";
const CONSTRUCTORS_API = "https://f1api.dev/api/current/constructors-championship";

const nodes = {
  localClock: document.getElementById("localClock"),
  apiNfo: document.getElementById("apiNfo"),
  podiumGrid: document.getElementById("podiumGrid"),
  standingsBody: document.getElementById("standingsBody"),
  standingsToggle: document.getElementById("standingsToggle"),
  standingsTitle: document.getElementById("standingsTitle"),
  colMain: document.getElementById("colMain"),
  colSecondary: document.getElementById("colSecondary")
};

const state = {
  mode: "drivers",
  drivers: null,
  constructors: null
};

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function formatClock(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function formatDriverName(driver) {
  if (!driver) return "N/A";
  const fullName = [driver.name, driver.surname].filter(Boolean).join(" ").trim();
  return fullName || firstDefined(driver.shortName, "N/A");
}

function normalizeDrivers(payload) {
  const raw = Array.isArray(payload?.drivers_championship) ? payload.drivers_championship : [];
  const rows = raw
    .map((entry) => ({
      position: Number(firstDefined(entry?.position, 999)),
      main: formatDriverName(entry?.driver),
      secondary: firstDefined(entry?.team?.teamName, entry?.team?.name, entry?.teamId, "N/A"),
      points: Number(firstDefined(entry?.points, 0)),
      wins: Number(firstDefined(entry?.wins, 0))
    }))
    .sort((a, b) => a.position - b.position);

  if (rows.length === 0) return null;
  const leaderPoints = rows[0].points;
  for (const row of rows) row.gap = leaderPoints - row.points;

  return {
    mode: "drivers",
    season: firstDefined(payload?.season, "N/A"),
    championshipId: firstDefined(payload?.championshipId, "N/A"),
    total: rows.length,
    rows
  };
}

function normalizeConstructors(payload) {
  const raw = Array.isArray(payload?.constructors_championship) ? payload.constructors_championship : [];
  const rows = raw
    .map((entry) => ({
      position: Number(firstDefined(entry?.position, 999)),
      main: firstDefined(entry?.team?.teamName, entry?.team?.name, entry?.teamId, "N/A"),
      secondary: firstDefined(entry?.team?.country, "N/A"),
      points: Number(firstDefined(entry?.points, 0)),
      wins: Number(firstDefined(entry?.wins, 0))
    }))
    .sort((a, b) => a.position - b.position);

  if (rows.length === 0) return null;
  const leaderPoints = rows[0].points;
  for (const row of rows) row.gap = leaderPoints - row.points;

  return {
    mode: "constructors",
    season: firstDefined(payload?.season, "N/A"),
    championshipId: firstDefined(payload?.championshipId, "N/A"),
    total: rows.length,
    rows
  };
}

function buildNfo(data) {
  const topWins = data.rows.reduce((max, row) => Math.max(max, row.wins), 0);
  const topWinEntity = data.rows.find((row) => row.wins === topWins);
  const label = data.mode === "drivers" ? "drivers championship" : "constructors championship";

  return [
    ` [TYPE   ] ${label}`,
    ` [SEASON ] ${data.season}`,
    ` [ENTRYS ] ${data.total}`,
    ` [LEADER ] ${data.rows[0].main}`,
    ` [POINTS ] ${data.rows[0].points}`,
    ` [WINS   ] ${topWinEntity ? `${topWinEntity.main} (${topWins})` : "N/A"}`
  ].join("\n");
}

function renderPodium(data) {
  nodes.podiumGrid.textContent = "";
  const top3 = data.rows.slice(0, 3);

  for (const row of top3) {
    const card = document.createElement("article");
    card.className = "podium-card";

    const pos = document.createElement("p");
    pos.className = "podium-pos";
    pos.textContent = `#${row.position}`;

    const main = document.createElement("p");
    main.className = "podium-driver";
    main.textContent = row.main;

    const meta = document.createElement("p");
    meta.className = "podium-meta";
    meta.textContent = `${row.points} pts | ${row.wins} wins`;

    card.append(pos, main, meta);
    nodes.podiumGrid.appendChild(card);
  }
}

function renderTable(data) {
  nodes.standingsBody.textContent = "";
  const secondaryLabel = data.mode === "drivers" ? "Team" : "Country";

  for (const row of data.rows) {
    const tr = document.createElement("tr");
    const gapText = row.position === 1 ? "-" : `-${row.gap}`;

    const values = [
      { label: "Pos", value: row.position },
      { label: data.mode === "drivers" ? "Driver" : "Constructor", value: row.main },
      { label: secondaryLabel, value: row.secondary },
      { label: "Pts", value: row.points },
      { label: "Wins", value: row.wins },
      { label: "Gap", value: gapText }
    ];

    for (const item of values) {
      const td = document.createElement("td");
      td.setAttribute("data-label", item.label);
      td.textContent = String(item.value);
      tr.appendChild(td);
    }

    nodes.standingsBody.appendChild(tr);
  }
}

function getCurrentData() {
  return state.mode === "drivers" ? state.drivers : state.constructors;
}

function renderMode() {
  const data = getCurrentData();
  if (!data) return;

  nodes.standingsTitle.textContent =
    state.mode === "drivers" ? "[ drivers championship ]" : "[ constructors championship ]";
  nodes.colMain.textContent = state.mode === "drivers" ? "Driver" : "Constructor";
  nodes.colSecondary.textContent = state.mode === "drivers" ? "Team" : "Country";

  for (const btn of nodes.standingsToggle.querySelectorAll("button")) {
    btn.classList.toggle("active", btn.dataset.mode === state.mode);
  }

  nodes.apiNfo.textContent = buildNfo(data);
  renderPodium(data);
  renderTable(data);
}

function attachToggleEvents() {
  nodes.standingsToggle.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button) return;
    state.mode = button.dataset.mode;
    renderMode();
  });
}

function startLocalClock() {
  const tick = () => {
    nodes.localClock.textContent = `LOCAL ${formatClock(new Date())}`;
  };
  tick();
  setInterval(tick, 1000);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`API error (${response.status}) from ${url}`);
  return response.json();
}

async function init() {
  startLocalClock();
  attachToggleEvents();

  try {
    const [driversPayload, constructorsPayload] = await Promise.all([
      fetchJson(DRIVERS_API),
      fetchJson(CONSTRUCTORS_API)
    ]);

    state.drivers = normalizeDrivers(driversPayload);
    state.constructors = normalizeConstructors(constructorsPayload);
    if (!state.drivers || !state.constructors) {
      throw new Error("Could not parse standings response.");
    }

    renderMode();
  } catch (error) {
    nodes.apiNfo.textContent = [
      " [ERROR  ] Could not fetch standings.",
      " [DETAIL ] Check API availability or internet connection.",
      ` [MSG    ] ${error.message}`
    ].join("\n");
    nodes.standingsBody.innerHTML = '<tr><td colspan="6">Could not load standings.</td></tr>';
    nodes.podiumGrid.innerHTML = "";
  }
}

init();
