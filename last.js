const LAST_RACE_API = "https://f1api.dev/api/current/last/race";

const nodes = {
  apiNfo: document.getElementById("apiNfo"),
  localClock: document.getElementById("localClock"),
  statusLine: document.getElementById("statusLine"),
  winnerValue: document.getElementById("winnerValue"),
  teamValue: document.getElementById("teamValue"),
  fastLapValue: document.getElementById("fastLapValue"),
  fastDriverValue: document.getElementById("fastDriverValue"),
  resultsBody: document.getElementById("resultsBody")
};

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
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

function parseDateTime(datePart, timePart) {
  if (!datePart || !timePart) return null;
  const parsed = new Date(`${datePart}T${String(timePart).trim()}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDriverName(driver) {
  if (!driver) return "N/A";
  const fullName = [driver.name, driver.surname].filter(Boolean).join(" ").trim();
  return fullName || firstDefined(driver.shortName, driver.driverId, "N/A");
}

function formatTeamName(team) {
  if (!team) return "N/A";
  return firstDefined(team.teamName, team.name, team.teamId, "N/A");
}

function normalizeRace(payload) {
  const rawRace = payload?.races;
  const race = Array.isArray(rawRace) ? rawRace[0] : rawRace;
  if (!race) return null;

  const results = Array.isArray(race.results) ? race.results : [];
  const raceDate = parseDateTime(race.date, race.time);
  const winnerResult = results.find((entry) => String(entry?.position) === "1") ?? null;
  const fastestResult = findFastestLap(results);

  return {
    name: firstDefined(race.raceName, race.name, "N/A"),
    season: firstDefined(payload?.season, "N/A"),
    round: firstDefined(race.round, "N/A"),
    circuitName: firstDefined(race?.circuit?.circuitName, "N/A"),
    city: firstDefined(race?.circuit?.city, "N/A"),
    country: firstDefined(race?.circuit?.country, "N/A"),
    raceDate,
    winnerName: formatDriverName(winnerResult?.driver),
    winnerTeam: formatTeamName(winnerResult?.team),
    fastestLap: fastestResult?.fastLap ?? "N/A",
    fastestDriver: fastestResult ? formatDriverName(fastestResult.driver) : "N/A",
    results: results
      .map((entry) => {
        const isDnf = entry?.retired !== null && entry?.retired !== undefined && entry?.retired !== "";
        const timeValue = isDnf ? "DNF" : firstDefined(entry?.time, "N/A");
        const status = isDnf ? `DNF${entry.retired ? ` (${entry.retired})` : ""}` : "Finished";

        return {
          position: firstDefined(entry?.position, "N/A"),
          grid: firstDefined(entry?.grid, "N/A"),
          points: firstDefined(entry?.points, 0),
          driver: formatDriverName(entry?.driver),
          team: formatTeamName(entry?.team),
          time: timeValue,
          status
        };
      })
      .sort((a, b) => Number(a.position) - Number(b.position))
  };
}

function lapTimeToMs(lapTime) {
  if (!lapTime || typeof lapTime !== "string") return null;
  const match = lapTime.trim().match(/^(\d+):(\d{2})\.(\d{3})$/);
  if (!match) return null;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const millis = Number(match[3]);
  return (minutes * 60 + seconds) * 1000 + millis;
}

function findFastestLap(results) {
  let best = null;
  let bestMs = Infinity;

  for (const entry of results) {
    const lapTime = entry?.fastLap;
    const lapMs = lapTimeToMs(lapTime);
    if (lapMs === null) continue;

    if (lapMs < bestMs) {
      bestMs = lapMs;
      best = entry;
    }
  }

  return best;
}

function buildNfo(race) {
  const utcStamp = race.raceDate ? race.raceDate.toISOString().replace(".000Z", "Z") : "N/A";
  const localStamp = race.raceDate ? formatDateTime(race.raceDate) : "N/A";

  return [
    ` [EVENT  ] ${race.name}`,
    ` [SEASON ] ${race.season}   [ROUND] ${race.round}`,
    ` [TRACK  ] ${race.circuitName}`,
    ` [PLACE  ] ${race.city}, ${race.country}`,
    ` [RACE   ] ${utcStamp}`,
    ` [LOCAL  ] ${localStamp}`,
    ` [WINNER ] ${race.winnerName} (${race.winnerTeam})`,
    ` [FASTEST] ${race.fastestLap} - ${race.fastestDriver}`
  ].join("\n");
}

function renderHighlights(race) {
  nodes.winnerValue.textContent = race.winnerName;
  nodes.teamValue.textContent = race.winnerTeam;
  nodes.fastLapValue.textContent = race.fastestLap;
  nodes.fastDriverValue.textContent = race.fastestDriver;
}

function renderResults(results) {
  nodes.resultsBody.textContent = "";

  for (const row of results) {
    const tr = document.createElement("tr");

    const positionCell = document.createElement("td");
    positionCell.setAttribute("data-label", "Pos");
    positionCell.textContent = String(row.position);

    const gridCell = document.createElement("td");
    gridCell.setAttribute("data-label", "Grid");
    gridCell.textContent = String(row.grid);

    const deltaCell = document.createElement("td");
    deltaCell.setAttribute("data-label", "Delta Pos");
    const gridNum = Number(row.grid);
    const posNum = Number(row.position);
    if (Number.isFinite(gridNum) && Number.isFinite(posNum)) {
      const delta = gridNum - posNum;
      if (delta > 0) {
        deltaCell.textContent = `+${delta} Gained`;
      } else if (delta < 0) {
        deltaCell.textContent = `${delta} Lost`;
      } else {
        deltaCell.textContent = "0 Even";
      }
    } else {
      deltaCell.textContent = "N/A";
    }

    const pointsCell = document.createElement("td");
    pointsCell.setAttribute("data-label", "Pts");
    pointsCell.textContent = String(row.points);

    const driverCell = document.createElement("td");
    driverCell.setAttribute("data-label", "Driver");
    driverCell.textContent = row.driver;

    const teamCell = document.createElement("td");
    teamCell.setAttribute("data-label", "Team");
    teamCell.textContent = row.team;

    const timeCell = document.createElement("td");
    timeCell.setAttribute("data-label", "Time");
    timeCell.textContent = row.time;

    const statusCell = document.createElement("td");
    statusCell.setAttribute("data-label", "Status");
    statusCell.textContent = row.status;
    if (row.status.startsWith("DNF")) {
      statusCell.classList.add("status-dnf");
    }

    tr.append(positionCell, gridCell, deltaCell, pointsCell, driverCell, teamCell, timeCell, statusCell);
    nodes.resultsBody.appendChild(tr);
  }
}

function startLocalClock() {
  const tick = () => {
    nodes.localClock.textContent = `LOCAL ${formatClock(new Date())}`;
  };
  tick();
  setInterval(tick, 1000);
}

async function getLastRace() {
  const response = await fetch(LAST_RACE_API, {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`API error (${response.status})`);
  }

  const payload = await response.json();
  const race = normalizeRace(payload);
  if (!race) {
    throw new Error("Could not parse last race response.");
  }

  return race;
}

async function init() {
  startLocalClock();
  nodes.statusLine.textContent = "Fetching last race...";

  try {
    const race = await getLastRace();
    nodes.apiNfo.textContent = buildNfo(race);
    renderHighlights(race);
    renderResults(race.results);
    nodes.statusLine.textContent = "Last race data loaded.";
  } catch (error) {
    nodes.resultsBody.innerHTML = '<tr><td colspan="8">Could not load results.</td></tr>';
    nodes.apiNfo.textContent = [
      " [ERROR  ] Could not fetch last race.",
      " [DETAIL ] Check API availability or internet connection.",
      ` [MSG    ] ${error.message}`
    ].join("\n");
    nodes.statusLine.textContent = `Error: ${error.message}`;
  }
}

init();
