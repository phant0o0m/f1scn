const API_BASE = "https://f1api.dev/api";
const DRIVERS_API = `${API_BASE}/current/drivers-championship`;
const CONSTRUCTORS_API = `${API_BASE}/current/constructors-championship`;

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
  constructors: null,
  modal: null,
  detailCache: new Map()
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
      wins: Number(firstDefined(entry?.wins, 0)),
      driverId: firstDefined(entry?.driverId, entry?.driver?.driverId, null),
      teamId: firstDefined(entry?.teamId, entry?.team?.teamId, null)
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
      secondary: firstDefined(entry?.team?.country, entry?.team?.teamNationality, "N/A"),
      points: Number(firstDefined(entry?.points, 0)),
      wins: Number(firstDefined(entry?.wins, 0)),
      teamId: firstDefined(entry?.teamId, entry?.team?.teamId, null)
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

function ensureModal() {
  if (state.modal) return state.modal;

  const overlay = document.createElement("div");
  overlay.className = "race-modal standings-modal";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="race-modal-backdrop" data-close="true"></div>
    <div class="race-modal-dialog standings-modal-dialog" role="dialog" aria-modal="true" aria-label="Standings details">
      <button class="race-modal-close" type="button" aria-label="Close">X</button>
      <div class="race-modal-body standings-modal-body"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const body = overlay.querySelector(".standings-modal-body");
  const closeButton = overlay.querySelector(".race-modal-close");

  function closeModal() {
    overlay.hidden = true;
    document.body.classList.remove("modal-open");
  }

  overlay.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.close === "true") {
      closeModal();
    }
  });

  closeButton.addEventListener("click", closeModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) {
      closeModal();
    }
  });

  state.modal = { overlay, body, closeModal };
  return state.modal;
}

function buildInfoLine(label, value) {
  if (value === null || value === undefined || value === "") return null;
  const line = document.createElement("p");
  line.className = "standings-detail-line";
  line.innerHTML = `<span class="standings-detail-key">${label}:</span> ${value}`;
  return line;
}

function renderDriverDetail(payload) {
  const driver = Array.isArray(payload?.driver) ? payload.driver[0] : null;
  if (!driver) throw new Error("Driver detail missing.");

  const fragment = document.createDocumentFragment();
  const title = document.createElement("p");
  title.className = "panel-title";
  title.textContent = `[ driver ] ${formatDriverName(driver)}`;
  fragment.appendChild(title);

  const lines = [
    buildInfoLine("Nationality", firstDefined(driver.nationality, "N/A")),
    buildInfoLine("Birthday", firstDefined(driver.birthday, "N/A")),
    buildInfoLine("Number", firstDefined(driver.number, "N/A")),
    buildInfoLine("Short Name", firstDefined(driver.shortName, "N/A")),
    buildInfoLine("Driver ID", firstDefined(driver.driverId, "N/A"))
  ].filter(Boolean);

  for (const line of lines) fragment.appendChild(line);

  if (driver.url) {
    const link = document.createElement("a");
    link.className = "standings-detail-link";
    link.href = driver.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Open reference";
    fragment.appendChild(link);
  }

  return fragment;
}

function renderTeamDetail(payload) {
  const team = Array.isArray(payload?.team) ? payload.team[0] : null;
  if (!team) throw new Error("Team detail missing.");

  const fragment = document.createDocumentFragment();
  const title = document.createElement("p");
  title.className = "panel-title";
  title.textContent = `[ constructor ] ${firstDefined(team.teamName, team.teamId, "N/A")}`;
  fragment.appendChild(title);

  const lines = [
    buildInfoLine("Nationality", firstDefined(team.teamNationality, team.country, "N/A")),
    buildInfoLine("First Appearance", firstDefined(team.firstAppeareance, team.firstAppareance, "N/A")),
    buildInfoLine("Constructors Titles", firstDefined(team.constructorsChampionships, 0)),
    buildInfoLine("Drivers Titles", firstDefined(team.driversChampionships, 0)),
    buildInfoLine("Team ID", firstDefined(team.teamId, "N/A"))
  ].filter(Boolean);

  for (const line of lines) fragment.appendChild(line);

  if (team.url) {
    const link = document.createElement("a");
    link.className = "standings-detail-link";
    link.href = team.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Open reference";
    fragment.appendChild(link);
  }

  return fragment;
}

async function openDetail(kind, id) {
  if (!id) return;

  const cacheKey = `${kind}:${id}`;
  const { overlay, body } = ensureModal();
  body.textContent = "Loading details...";
  overlay.hidden = false;
  document.body.classList.add("modal-open");

  try {
    let payload = state.detailCache.get(cacheKey);
    if (!payload) {
      payload = await fetchJson(`${API_BASE}/${kind}/${id}`);
      state.detailCache.set(cacheKey, payload);
    }

    body.textContent = "";
    body.appendChild(kind === "drivers" ? renderDriverDetail(payload) : renderTeamDetail(payload));
  } catch (error) {
    body.textContent = "";
    const title = document.createElement("p");
    title.className = "panel-title";
    title.textContent = "[ detail error ]";
    const line = document.createElement("p");
    line.className = "standings-detail-line";
    line.textContent = error.message;
    body.append(title, line);
  }
}

function renderPodium(data) {
  nodes.podiumGrid.textContent = "";
  const top3 = data.rows.slice(0, 3);

  for (const row of top3) {
    const card = document.createElement("article");
    card.className = "podium-card entity-card";
    const detailKind = data.mode === "drivers" ? "drivers" : "teams";
    const detailId = data.mode === "drivers" ? row.driverId : row.teamId;
    if (detailId) {
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.addEventListener("click", () => openDetail(detailKind, detailId));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetail(detailKind, detailId);
        }
      });
    }

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
    tr.className = "entity-row";
    const detailKind = data.mode === "drivers" ? "drivers" : "teams";
    const detailId = data.mode === "drivers" ? row.driverId : row.teamId;
    if (detailId) {
      tr.tabIndex = 0;
      tr.addEventListener("click", () => openDetail(detailKind, detailId));
      tr.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetail(detailKind, detailId);
        }
      });
    }
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
  ensureModal();

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
