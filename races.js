const API_BASE = "https://f1api.dev/api";

const nodes = {
  localClock: document.getElementById("localClock"),
  apiNfo: document.getElementById("apiNfo"),
  seasonValue: document.getElementById("seasonValue"),
  raceCountValue: document.getElementById("raceCountValue"),
  nextRoundValue: document.getElementById("nextRoundValue"),
  nextEventValue: document.getElementById("nextEventValue"),
  raceList: document.getElementById("raceList")
};

const SESSION_ORDER = [
  { key: "race", label: "Race" },
  { key: "qualy", label: "Qualy" },
  { key: "fp1", label: "FP1" },
  { key: "fp2", label: "FP2" },
  { key: "fp3", label: "FP3" },
  { key: "sprintQualy", label: "Sprint Qualy" },
  { key: "sprintRace", label: "Sprint Race" }
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TRIPLEHEADER_TOLERANCE_MS = 2 * 24 * 60 * 60 * 1000;

let modalNodes = null;

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

function formatDateTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatDateOnly(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function buildDateFromParts(datePart, timePart) {
  if (!datePart || !timePart) return null;
  const parsed = new Date(`${datePart}T${String(timePart).trim()}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeSessions(schedule) {
  const source = schedule ?? {};
  return SESSION_ORDER
    .map((session) => {
      const entry = source?.[session.key];
      if (!entry || entry.date == null || entry.time == null) return null;
      const date = buildDateFromParts(entry.date, entry.time);
      if (!date) return null;
      return { label: session.label, date };
    })
    .filter(Boolean);
}

function normalizeRace(race) {
  const sessions = normalizeSessions(race?.schedule);
  const raceSession = sessions.find((session) => session.label === "Race") ?? sessions[0] ?? null;
  const winner = race?.winner;
  const winnerName =
    winner && typeof winner === "object"
      ? [winner.name, winner.surname].filter(Boolean).join(" ").trim()
      : firstDefined(winner, null);
  const teamWinner = race?.teamWinner;
  const teamWinnerName =
    teamWinner && typeof teamWinner === "object"
      ? firstDefined(teamWinner.teamName, teamWinner.name, null)
      : firstDefined(teamWinner, null);

  return {
    round: firstDefined(race?.round, "N/A"),
    name: firstDefined(race?.raceName, race?.name, "N/A"),
    circuitId: firstDefined(race?.circuit?.circuitId, null),
    circuitName: firstDefined(race?.circuit?.circuitName, "N/A"),
    city: firstDefined(race?.circuit?.city, "N/A"),
    country: firstDefined(race?.circuit?.country, "N/A"),
    length: firstDefined(race?.circuit?.circuitLength, "N/A"),
    corners: firstDefined(race?.circuit?.corners, null),
    laps: firstDefined(race?.laps, null),
    winnerName: winnerName || null,
    teamWinnerName: teamWinnerName || null,
    raceDate: raceSession?.date ?? null,
    sessions
  };
}

function normalizePayload(payload) {
  const racesRaw = Array.isArray(payload?.races) ? payload.races : [];
  const races = racesRaw.map(normalizeRace).sort((a, b) => Number(a.round) - Number(b.round));
  if (races.length === 0) return null;

  return {
    season: firstDefined(payload?.season, new Date().getFullYear()),
    total: races.length,
    races
  };
}

function findNextEvent(races) {
  const now = Date.now();
  let next = null;

  for (const race of races) {
    for (const session of race.sessions) {
      const ts = session.date.getTime();
      if (ts > now && (!next || ts < next.session.date.getTime())) {
        next = { race, session };
      }
    }
  }

  return next;
}

function isWeeklyGap(gapMs) {
  return Math.abs(gapMs - WEEK_MS) <= TRIPLEHEADER_TOLERANCE_MS;
}

function countTripleHeaders(races) {
  const datedRaces = races
    .filter((race) => race.raceDate)
    .sort((a, b) => a.raceDate.getTime() - b.raceDate.getTime());
  let total = 0;

  for (let index = 0; index <= datedRaces.length - 3; index += 1) {
    const firstGap = datedRaces[index + 1].raceDate.getTime() - datedRaces[index].raceDate.getTime();
    const secondGap = datedRaces[index + 2].raceDate.getTime() - datedRaces[index + 1].raceDate.getTime();

    if (isWeeklyGap(firstGap) && isWeeklyGap(secondGap)) {
      total += 1;
    }
  }

  return total;
}

function getSeasonInsights(races, counts) {
  const now = Date.now();
  const completedRaces = races.filter((race) => race.raceDate && race.raceDate.getTime() < now).length;
  const remainingRaces = races.filter((race) => !race.raceDate || race.raceDate.getTime() >= now).length;
  const sprintWeekends = races.filter((race) => race.sessions.some((session) => session.label === "Sprint Race")).length;
  const countries = new Set(races.map((race) => race.country).filter(Boolean)).size;
  const tripleHeaders = countTripleHeaders(races);

  return {
    countries,
    teams: counts.teams,
    drivers: counts.drivers,
    completedRaces,
    remainingRaces,
    sprintWeekends,
    tripleHeaders
  };
}

function formatNextLine(nextEvent) {
  if (!nextEvent) return " [NEXT     ] Completed";
  return ` [NEXT     ] ${nextEvent.race.name} / ${nextEvent.session.label}`;
}

function buildNfo(data, insights, nextEvent) {
  return [
    ` [SEASON   ] ${data.season}`,
    ` [TOTAL    ] ${data.total}`,
    ` [COUNTRIES] ${insights.countries}`,
    ` [TEAMS    ] ${insights.teams}`,
    ` [DRIVERS  ] ${insights.drivers}`,
    formatNextLine(nextEvent)
  ].join("\n");
}

function renderStats(insights) {
  nodes.seasonValue.textContent = String(insights.completedRaces);
  nodes.raceCountValue.textContent = String(insights.remainingRaces);
  nodes.nextRoundValue.textContent = String(insights.sprintWeekends);
  nodes.nextEventValue.textContent = String(insights.tripleHeaders);
}

function buildFacts(race) {
  const facts = [];
  if (race.length !== null && race.length !== "N/A") facts.push(`Length: ${race.length}`);
  if (race.corners !== null) facts.push(`Corners: ${race.corners}`);
  if (race.laps !== null) facts.push(`Laps: ${race.laps}`);
  return facts;
}

function ensureModal() {
  if (modalNodes) return modalNodes;

  const overlay = document.createElement("div");
  overlay.className = "race-modal";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="race-modal-backdrop" data-close="true"></div>
    <div class="race-modal-dialog" role="dialog" aria-modal="true" aria-label="Race details">
      <button class="race-modal-close" type="button" aria-label="Close">X</button>
      <div class="race-modal-body"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeButton = overlay.querySelector(".race-modal-close");
  const body = overlay.querySelector(".race-modal-body");

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

  modalNodes = { overlay, body, closeModal };
  return modalNodes;
}

function openRaceModal(race) {
  const { overlay, body } = ensureModal();
  const facts = buildFacts(race);

  body.textContent = "";

  const title = document.createElement("p");
  title.className = "panel-title";
  title.textContent = `[ race ${race.round} ] ${race.name}`;

  const meta = document.createElement("p");
  meta.className = "race-card-meta";
  meta.textContent = `${race.circuitName} | ${race.city}, ${race.country}`;

  body.append(title, meta);

  if (race.raceDate) {
    const dateLine = document.createElement("p");
    dateLine.className = "race-card-result";
    dateLine.textContent = `Race Date: ${formatDateTime(race.raceDate)}`;
    body.appendChild(dateLine);
  }

  if (facts.length > 0) {
    const factsLine = document.createElement("p");
    factsLine.className = "race-card-facts";
    factsLine.textContent = facts.join(" | ");
    body.appendChild(factsLine);
  }

  if (race.winnerName || race.teamWinnerName) {
    const result = document.createElement("p");
    result.className = "race-card-result";
    const parts = [];
    if (race.winnerName) parts.push(`Winner: ${race.winnerName}`);
    if (race.teamWinnerName) parts.push(`Team: ${race.teamWinnerName}`);
    result.textContent = parts.join(" | ");
    body.appendChild(result);
  }

  if (race.sessions.length > 0) {
    const list = document.createElement("ul");
    list.className = "race-sessions";

    for (const session of race.sessions) {
      const li = document.createElement("li");

      const label = document.createElement("span");
      label.className = "race-session-label";
      label.textContent = session.label;

      const time = document.createElement("span");
      time.className = "race-session-time";
      time.textContent = formatDateTime(session.date);

      li.append(label, time);
      list.appendChild(li);
    }

    body.appendChild(list);
  }

  overlay.hidden = false;
  document.body.classList.add("modal-open");
}

function renderRaceList(races) {
  nodes.raceList.textContent = "";

  for (const race of races) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "race-accordion";

    const summary = document.createElement("div");
    summary.className = "race-summary";

    const title = document.createElement("span");
    title.className = "race-summary-title";
    title.textContent = `R${race.round} - ${race.name}`;

    const dateBadge = document.createElement("span");
    dateBadge.className = "race-summary-date";
    dateBadge.textContent = race.raceDate ? formatDateOnly(race.raceDate) : "TBA";

    summary.append(title, dateBadge);
    card.appendChild(summary);
    card.addEventListener("click", () => openRaceModal(race));
    nodes.raceList.appendChild(card);
  }
}

function startLocalClock() {
  const tick = () => {
    nodes.localClock.textContent = `LOCAL ${formatClock(new Date())}`;
  };
  tick();
  setInterval(tick, 1000);
}

async function getSeasonRaces(year) {
  const response = await fetch(`${API_BASE}/${year}`, {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`API error (${response.status})`);
  }

  const payload = await response.json();
  const data = normalizePayload(payload);
  if (!data) {
    throw new Error("Could not parse season races response.");
  }

  return data;
}

async function getChampionshipCounts(year) {
  const [driversResponse, constructorsResponse] = await Promise.all([
    fetch(`${API_BASE}/${year}/drivers-championship`, {
      method: "GET",
      headers: { Accept: "application/json" }
    }),
    fetch(`${API_BASE}/${year}/constructors-championship`, {
      method: "GET",
      headers: { Accept: "application/json" }
    })
  ]);

  if (!driversResponse.ok || !constructorsResponse.ok) {
    throw new Error("Could not fetch standings counts.");
  }

  const [driversPayload, constructorsPayload] = await Promise.all([
    driversResponse.json(),
    constructorsResponse.json()
  ]);

  return {
    drivers: Array.isArray(driversPayload?.drivers_championship) ? driversPayload.drivers_championship.length : 0,
    teams: Array.isArray(constructorsPayload?.constructors_championship) ? constructorsPayload.constructors_championship.length : 0
  };
}

async function init() {
  startLocalClock();
  ensureModal();
  const year = new Date().getFullYear();

  try {
    const [data, counts] = await Promise.all([
      getSeasonRaces(year),
      getChampionshipCounts(year)
    ]);
    const nextEvent = findNextEvent(data.races);
    const insights = getSeasonInsights(data.races, counts);
    nodes.apiNfo.textContent = buildNfo(data, insights, nextEvent);
    renderStats(insights);
    renderRaceList(data.races);
  } catch (error) {
    nodes.apiNfo.textContent = [
      " [ERROR  ] Could not fetch season races.",
      " [DETAIL ] Check API availability or internet connection.",
      ` [MSG    ] ${error.message}`
    ].join("\n");
    nodes.raceList.innerHTML = '<p class="race-empty">Could not load races.</p>';
  }
}

init();
