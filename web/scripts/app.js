const locateBtn = document.getElementById("locateBtn");
const helsinkiOnlyBtn = document.getElementById("helsinkiOnlyBtn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const permissionCardEl = document.getElementById("permissionCard");
const stationTitleEl = document.getElementById("stationTitle");
const stationMetaEl = document.getElementById("stationMeta");
const departuresEl = document.getElementById("departures");
const nextSummaryEl = document.getElementById("nextSummary");
const nextMinsEl = document.getElementById("nextMins");
const nextLineEl = document.getElementById("nextLine");
const nextTrackEl = document.getElementById("nextTrack");
const nextDestinationEl = document.getElementById("nextDestination");
const nowClockEl = document.getElementById("nowClock");
const lastUpdatedEl = document.getElementById("lastUpdated");

let isLoading = false;
let currentCoords = null;
let latestResponse = null;
let helsinkiOnly = false;

function setLoading(loading) {
  isLoading = loading;
  locateBtn.disabled = loading;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setPermissionRequired(required) {
  if (!permissionCardEl) return;
  permissionCardEl.classList.toggle("hidden", !required);
}

function setLastUpdated(date) {
  if (!lastUpdatedEl || !(date instanceof Date)) return;
  lastUpdatedEl.textContent = `Last updated: ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })}`;
}

function formatMinutes(iso) {
  const diffMin = minutesUntil(iso);
  if (diffMin <= 0) return "Now";
  return `${diffMin}m`;
}

function minutesUntil(iso) {
  const departure = new Date(iso);
  return Math.floor((departure.getTime() - Date.now()) / 60000);
}

function departureRowClass(iso) {
  const diffMin = minutesUntil(iso);

  if (diffMin <= 0 || diffMin < 5) return "departure-now";
  if (diffMin <= 15) return "departure-soon";
  return "departure-later";
}

function isHelsinkiBound(departure) {
  const destination = departure?.destination || "";
  return /\bhelsinki\b/i.test(destination);
}

function getVisibleDepartures(departures) {
  if (!Array.isArray(departures)) return [];
  if (!helsinkiOnly) return departures;
  return departures.filter(isHelsinkiBound);
}

function updateHelsinkiFilterButton() {
  if (!helsinkiOnlyBtn) return;
  helsinkiOnlyBtn.setAttribute("aria-pressed", String(helsinkiOnly));
  helsinkiOnlyBtn.classList.toggle("is-active", helsinkiOnly);
  helsinkiOnlyBtn.textContent = helsinkiOnly ? "Helsinki Only: On" : "Helsinki Only: Off";
}

function updateNextSummary(nextDeparture) {
  if (!nextSummaryEl || !nextMinsEl || !nextLineEl || !nextTrackEl || !nextDestinationEl) return;

  if (!nextDeparture) {
    nextSummaryEl.classList.add("hidden");
    nextSummaryEl.classList.remove("next-summary-now", "next-summary-soon", "next-summary-later");
    return;
  }

  const diffMin = minutesUntil(nextDeparture.departureIso);

  nextMinsEl.textContent = formatMinutes(nextDeparture.departureIso);
  nextLineEl.textContent = nextDeparture.line || "—";
  nextLineEl.classList.toggle("next-letter-now", diffMin < 5);
  nextTrackEl.textContent = nextDeparture.track ? `Track ${nextDeparture.track}` : "Track —";
  nextDestinationEl.textContent = nextDeparture.destination || "—";
  nextSummaryEl.classList.remove("next-summary-now", "next-summary-soon", "next-summary-later");
  if (diffMin < 5) {
    nextSummaryEl.classList.add("next-summary-now");
  } else if (diffMin <= 15) {
    nextSummaryEl.classList.add("next-summary-soon");
  } else {
    nextSummaryEl.classList.add("next-summary-later");
  }
  nextSummaryEl.classList.remove("hidden");
}

function buildStatusFromResponse(data) {
  if (!data || !data.station) {
    return data?.message || "No nearby train stations found.";
  }

  const visibleDepartures = getVisibleDepartures(data.station.departures);
  const next = visibleDepartures[0];
  if (!next) {
    return helsinkiOnly
      ? "No Helsinki-bound trains in upcoming departures."
      : "No upcoming commuter trains right now.";
  }

  const destination = next.destination ? ` • ${next.destination}` : "";
  const nextTrack = next.track ? ` • Track ${next.track}` : "";
  return `Next ${next.line || "train"} in ${formatMinutes(next.departureIso)}${destination}${nextTrack}`;
}

function getLoadErrorStatus(error) {
  if (!(error instanceof Error)) {
    return "Could not refresh departures. Please try again.";
  }

  const message = (error.message || "").trim();
  if (message === "Temporary server error. Please try again.") {
    return message;
  }
  if (message === "Invalid lat/lon") {
    return "Location coordinates were invalid. Please refresh your location.";
  }

  return "Could not refresh departures. Please try again.";
}

function getGeolocationErrorStatus(error) {
  if (error?.code === 1) return "Location permission denied.";
  if (error?.code === 2) return "Location unavailable. Please try again.";
  if (error?.code === 3) return "Location request timed out. Please try again.";
  return "Unable to get your location.";
}

function alignDepartureColumns() {
  const rows = [...document.querySelectorAll(".departure-row .train-top")];
  if (rows.length === 0) return;

  const destinations = rows
    .map((row) => row.querySelector(".destination"))
    .filter(Boolean);

  // Reset to natural width before measuring.
  for (const destination of destinations) {
    destination.style.width = "auto";
  }

  let widestDestination = 0;
  for (const destination of destinations) {
    widestDestination = Math.max(widestDestination, Math.ceil(destination.scrollWidth));
  }

  let maxAllowed = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const time = row.querySelector(".time");
    if (!time) continue;

    const rowStyle = getComputedStyle(row);
    const gap = parseFloat(rowStyle.columnGap || rowStyle.gap || "0") || 0;
    const available = row.clientWidth - time.offsetWidth - gap;
    if (available > 0) {
      maxAllowed = Math.min(maxAllowed, available);
    }
  }

  const targetWidth = Math.max(0, Math.min(widestDestination, maxAllowed));
  for (const destination of destinations) {
    destination.style.width = `${targetWidth}px`;
  }
}

function render(data) {
  if (!data || !data.station) {
    resultEl.classList.add("hidden");
    updateNextSummary(null);
    return;
  }

  const station = data.station;
  resultEl.classList.remove("hidden");

  stationTitleEl.textContent = station.stopName;
  stationMetaEl.textContent = `${station.distanceMeters}m away`;

  departuresEl.innerHTML = "";
  const visibleDepartures = getVisibleDepartures(station.departures);

  if (visibleDepartures.length === 0) {
    updateNextSummary(null);
    const li = document.createElement("li");
    li.className = "empty-row";
    li.textContent = helsinkiOnly
      ? "No Helsinki-bound trains in upcoming departures."
      : "No upcoming commuter trains right now.";
    departuresEl.appendChild(li);
    return;
  }

  updateNextSummary(visibleDepartures[0]);
  const listDepartures = visibleDepartures.slice(1);

  if (listDepartures.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-row";
    li.textContent = "No additional upcoming commuter trains right now.";
    departuresEl.appendChild(li);
    return;
  }

  for (const item of listDepartures) {
    const li = document.createElement("li");
    li.className = `departure-row ${departureRowClass(item.departureIso)}`;

    const letterBadge = document.createElement("div");
    letterBadge.className = "letter-badge";
    letterBadge.textContent = item.line || "?";

    const left = document.createElement("div");
    left.className = "train";

    const top = document.createElement("div");
    top.className = "train-top";

    const destination = document.createElement("div");
    destination.className = "destination";
    destination.textContent = item.destination || "—";
    top.appendChild(destination);

    const time = document.createElement("div");
    time.className = "time";
    const remaining = document.createElement("span");
    remaining.className = "remaining";
    remaining.textContent = formatMinutes(item.departureIso);

    const clockTime = document.createElement("span");
    clockTime.className = "clock-time";
    clockTime.textContent = new Date(item.departureIso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    time.appendChild(remaining);
    time.appendChild(clockTime);
    top.appendChild(time);
    left.appendChild(top);

    const track = document.createElement("span");
    track.className = "track";
    track.textContent = item.track ? `Track ${item.track}` : "Track —";
    left.appendChild(track);

    li.appendChild(letterBadge);
    li.appendChild(left);
    departuresEl.appendChild(li);
  }

  // Keep time columns vertically aligned across rows by normalizing destination width.
  requestAnimationFrame(alignDepartureColumns);
}

function updateClock() {
  if (!nowClockEl) return;
  nowClockEl.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetryOnce(url) {
  let res;

  try {
    res = await fetch(url);
  } catch {
    await delay(350);
    return fetch(url);
  }

  if (res.status >= 500) {
    await delay(350);
    return fetch(url);
  }

  return res;
}

async function load(lat, lon) {
  if (isLoading) return;

  setLoading(true);
  setStatus("Loading departures...");

  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    const res = await fetchWithRetryOnce(`/api/next-trains?${params.toString()}`);
    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error || "Request failed");
    }

    latestResponse = json;
    render(json);
    setPermissionRequired(false);
    setLastUpdated(new Date());
    setStatus(buildStatusFromResponse(json));
  } catch (err) {
    latestResponse = null;
    console.error("load departures error:", err);
    setStatus(getLoadErrorStatus(err));
    resultEl.classList.add("hidden");
    updateNextSummary(null);
  } finally {
    setLoading(false);
  }
}

function requestLocationAndLoad() {
  if (!navigator.geolocation) {
    setStatus("Geolocation not supported in this browser.");
    setPermissionRequired(true);
    return false;
  }

  if (isLoading) return false;

  setStatus("Getting your location...");
  setLoading(true);

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentCoords = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
      };
      setPermissionRequired(false);
      setLoading(false);
      load(currentCoords.lat, currentCoords.lon);
    },
    (err) => {
      setLoading(false);
      if (err.code === 1) {
        setPermissionRequired(true);
        setStatus(getGeolocationErrorStatus(err));
        latestResponse = null;
        resultEl.classList.add("hidden");
        updateNextSummary(null);
        return;
      }

      setPermissionRequired(false);
      setStatus(getGeolocationErrorStatus(err));
      latestResponse = null;
      resultEl.classList.add("hidden");
      updateNextSummary(null);
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
  );

  return true;
}

function refreshDeparturesOnly() {
  if (currentCoords) {
    load(currentCoords.lat, currentCoords.lon);
    return;
  }

  requestLocationAndLoad();
}

locateBtn.addEventListener("click", () => {
  requestLocationAndLoad();
});

helsinkiOnlyBtn.addEventListener("click", () => {
  helsinkiOnly = !helsinkiOnly;
  updateHelsinkiFilterButton();
  if (latestResponse) {
    render(latestResponse);
    setStatus(buildStatusFromResponse(latestResponse));
  }
});

// Auto-load nearest train station timetable on first page view.
updateHelsinkiFilterButton();
updateClock();
setInterval(updateClock, 1000);
requestLocationAndLoad();
setInterval(refreshDeparturesOnly, 30000);
window.addEventListener("resize", () => {
  requestAnimationFrame(alignDepartureColumns);
});
