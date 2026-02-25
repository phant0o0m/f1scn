const NEXT_RACE_API = "https://f1api.dev/api/current/next";

const SESSION_ORDER = [
  { id: "race", label: "Race", aliases: ["race"] },
  { id: "qualy", label: "Qualy", aliases: ["qualy", "quali", "qualifying"] },
  { id: "fp1", label: "FP1", aliases: ["fp1"] },
  { id: "fp2", label: "FP2", aliases: ["fp2"] },
  { id: "fp3", label: "FP3", aliases: ["fp3"] },
  { id: "sprintQualy", label: "Sprint Qualy", aliases: ["sprintQualy", "sprint_qualy", "sprintQualifying"] },
  { id: "sprintRace", label: "Sprint Race", aliases: ["sprintRace", "sprint_race", "sprint"] }
];

const nodes = {
  apiNfo: document.getElementById("apiNfo"),
  localClock: document.getElementById("localClock"),
  statusLine: document.getElementById("statusLine"),
  sessionPicker: document.getElementById("sessionPicker"),
  days: document.getElementById("days"),
  hours: document.getElementById("hours"),
  minutes: document.getElementById("minutes"),
  seconds: document.getElementById("seconds")
};

const state = {
  race: null,
  selectedSessionId: null
};

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function formatClock(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function setCountdownZero() {
  nodes.days.textContent = "00";
  nodes.hours.textContent = "00";
  nodes.minutes.textContent = "00";
  nodes.seconds.textContent = "00";
}

function buildDateFromParts(datePart, timePart) {
  if (!datePart || !timePart) return null;
  const rawTime = String(timePart).trim();
  const withSeconds = /^\d{2}:\d{2}$/.test(rawTime) ? `${rawTime}:00` : rawTime;
  const isoGuess = rawTime.includes("T") ? rawTime : `${datePart}T${withSeconds}`;
  const date = new Date(isoGuess);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveScheduleEntry(schedule, aliases) {
  for (const alias of aliases) {
    if (schedule?.[alias]) return schedule[alias];
  }
  return null;
}

function parseSession(sessionInfo, schedule) {
  const entry = resolveScheduleEntry(schedule, sessionInfo.aliases);
  if (!entry || entry.date == null || entry.time == null) return null;
  const date = buildDateFromParts(entry.date, entry.time);
  if (!date) return null;
  return {
    id: sessionInfo.id,
    label: sessionInfo.label,
    date
  };
}

function extractSessions(race, fallbackDate) {
  const schedule = race?.schedule ?? {};
  const sessions = SESSION_ORDER
    .map((sessionInfo) => parseSession(sessionInfo, schedule))
    .filter(Boolean);

  if (sessions.length > 0) return sessions;
  if (!fallbackDate) return [];
  return [{ id: "race", label: "Race", date: fallbackDate }];
}

function extractRace(payload) {
  const raceContainer = firstDefined(payload?.race, payload?.nextRace, payload?.data, payload);
  const race = Array.isArray(raceContainer) ? raceContainer[0] : raceContainer;
  if (!race) return null;

  const scheduleRace = race?.schedule?.race ?? null;
  const name = firstDefined(
    race?.name,
    race?.raceName,
    race?.race_name,
    race?.grandPrix,
    race?.grand_prix,
    race?.event_name
  );

  const rawDateTime = firstDefined(
    race?.date,
    race?.dateTime,
    race?.datetime,
    race?.start_time,
    race?.startTime,
    race?.start_date,
    scheduleRace?.dateTime,
    scheduleRace?.datetime
  );

  let fallbackDate = rawDateTime ? new Date(rawDateTime) : null;
  if (!fallbackDate || Number.isNaN(fallbackDate.getTime())) {
    const datePart = firstDefined(race?.date, race?.startDate, race?.start_date, scheduleRace?.date);
    const timePart = firstDefined(race?.time, race?.startTime, race?.start_time, scheduleRace?.time);
    fallbackDate = buildDateFromParts(datePart, timePart);
  }

  const sessions = extractSessions(race, fallbackDate);
  if (!name || sessions.length === 0) return null;

  return {
    name,
    season: firstDefined(payload?.season, race?.season, payload?.championship?.year, "N/A"),
    round: firstDefined(payload?.round, race?.round, "N/A"),
    circuitName: firstDefined(race?.circuit?.circuitName, race?.circuit?.name, "N/A"),
    city: firstDefined(race?.circuit?.city, "N/A"),
    country: firstDefined(race?.circuit?.country, "N/A"),
    sessions
  };
}

function getSelectedSession() {
  if (!state.race || !state.selectedSessionId) return null;
  return state.race.sessions.find((session) => session.id === state.selectedSessionId) ?? null;
}

function buildRaceNfo(race, session) {
  const utcStamp = session.date.toISOString().replace(".000Z", "Z");
  const localStamp = formatDateTime(session.date);

  return [
    ` [EVENT  ] ${race.name}`,
    ` [TARGET ] ${session.label}`,
    ` [SEASON ] ${race.season}   [ROUND] ${race.round}`,
    ` [TRACK  ] ${race.circuitName}`,
    ` [PLACE  ] ${race.city}, ${race.country}`,
    ` [UTC    ] ${utcStamp}`,
    ` [LOCAL  ] ${localStamp}`
  ].join("\n");
}

function renderSessionPicker(race) {
  nodes.sessionPicker.textContent = "";

  for (const session of race.sessions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "session-btn";
    button.dataset.sessionId = session.id;
    button.textContent = session.label;
    button.addEventListener("click", () => {
      state.selectedSessionId = session.id;
      renderSelectedSession();
    });
    nodes.sessionPicker.appendChild(button);
  }
}

function renderSelectedSession() {
  const race = state.race;
  const session = getSelectedSession();
  if (!race || !session) return;

  for (const button of nodes.sessionPicker.querySelectorAll(".session-btn")) {
    button.classList.toggle("active", button.dataset.sessionId === state.selectedSessionId);
  }

  nodes.apiNfo.textContent = buildRaceNfo(race, session);
  renderCountdown(session);
}

function renderCountdown(session) {
  const diff = session.date.getTime() - Date.now();

  if (diff <= 0) {
    setCountdownZero();
    nodes.statusLine.textContent = `${session.label} is live now.`;
    return false;
  }

  const secondsTotal = Math.floor(diff / 1000);
  const days = Math.floor(secondsTotal / 86400);
  const hours = Math.floor((secondsTotal % 86400) / 3600);
  const minutes = Math.floor((secondsTotal % 3600) / 60);
  const seconds = secondsTotal % 60;

  nodes.days.textContent = pad(days);
  nodes.hours.textContent = pad(hours);
  nodes.minutes.textContent = pad(minutes);
  nodes.seconds.textContent = pad(seconds);
  nodes.statusLine.textContent = `Counting down to ${session.label}...`;
  return true;
}

async function getNextRace() {
  const response = await fetch(NEXT_RACE_API, {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`API error (${response.status})`);
  }

  const payload = await response.json();
  const race = extractRace(payload);
  if (!race) {
    throw new Error("Could not parse race response.");
  }

  return race;
}

function startLocalClock() {
  const tick = () => {
    nodes.localClock.textContent = `LOCAL ${formatClock(new Date())}`;
  };
  tick();
  setInterval(tick, 1000);
}

async function init() {
  startLocalClock();
  nodes.statusLine.textContent = "Fetching next race...";

  try {
    state.race = await getNextRace();
    state.selectedSessionId =
      state.race.sessions.find((session) => session.id === "race")?.id ??
      state.race.sessions[0].id;

    renderSessionPicker(state.race);
    renderSelectedSession();

    setInterval(() => {
      const session = getSelectedSession();
      if (session) renderCountdown(session);
    }, 1000);
  } catch (error) {
    setCountdownZero();
    nodes.sessionPicker.innerHTML = '<span class="session-empty">No sessions available.</span>';
    nodes.apiNfo.textContent = [
      " [ERROR  ] Could not fetch next race.",
      " [DETAIL ] Check API availability or internet connection.",
      ` [MSG    ] ${error.message}`
    ].join("\n");
    nodes.statusLine.textContent = `Error: ${error.message}`;
  }
}

init();
