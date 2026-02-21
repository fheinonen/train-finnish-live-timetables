const locateBtn = document.getElementById("locateBtn");
const modeRailBtn = document.getElementById("modeRailBtn");
const modeBusBtn = document.getElementById("modeBusBtn");
const helsinkiOnlyBtn = document.getElementById("helsinkiOnlyBtn");
const busControlsEl = document.getElementById("busControls");
const busStopSelectEl = document.getElementById("busStopSelect");
const busLineFiltersEl = document.getElementById("busLineFilters");
const busDestinationFiltersEl = document.getElementById("busDestinationFilters");
const modeEyebrowEl = document.getElementById("modeEyebrow");
const statusEl = document.getElementById("status");
const dataScopeEl = document.getElementById("dataScope");
const resultEl = document.getElementById("result");
const permissionCardEl = document.getElementById("permissionCard");
const stationTitleEl = document.getElementById("stationTitle");
const stationMetaEl = document.getElementById("stationMeta");
const departuresEl = document.getElementById("departures");
const nextSummaryEl = document.getElementById("nextSummary");
const nextLabelEl = document.getElementById("nextLabel");
const nextMinsEl = document.getElementById("nextMins");
const nextLineEl = document.getElementById("nextLine");
const nextTrackEl = document.getElementById("nextTrack");
const nextDestinationEl = document.getElementById("nextDestination");
const nowClockEl = document.getElementById("nowClock");
const lastUpdatedEl = document.getElementById("lastUpdated");

const MODE_RAIL = "rail";
const MODE_BUS = "bus";
const STORAGE_MODE_KEY = "prefs:mode";
const STORAGE_HELSINKI_ONLY_KEY = "prefs:helsinkiOnly";
const STORAGE_BUS_STOP_KEY = "prefs:busStopId";
const STORAGE_BUS_LINES_KEY = "prefs:busLines";
const STORAGE_BUS_DESTINATIONS_KEY = "prefs:busDestinations";
const FETCH_TIMEOUT_MS = 8000;
const ERROR_REPORT_LIMIT = 5;

let isLoading = false;
let currentCoords = null;
let latestResponse = null;
let mode = MODE_RAIL;
let helsinkiOnly = false;
let busStopId = null;
let busLineFilters = [];
let busDestinationFilters = [];
let busStops = [];
let busFilterOptions = { lines: [], destinations: [] };
let suppressBusStopChange = false;
let errorReportCount = 0;
let latestLoadToken = 0;

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

function getStorageItem(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStorageItem(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore localStorage errors (private mode, disabled storage, quota).
  }
}

function safeString(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function toError(value) {
  if (value instanceof Error) return value;

  try {
    const message = typeof value === "string" ? value : JSON.stringify(value);
    return new Error(message || "Unknown error");
  } catch {
    return new Error(String(value || "Unknown error"));
  }
}

function reportClientError(type, rawError, context = null) {
  if (errorReportCount >= ERROR_REPORT_LIMIT) return;
  errorReportCount += 1;

  const error = toError(rawError);
  const payload = {
    type: safeString(type, 40),
    message: safeString(error.message, 400),
    stack: safeString(error.stack || "", 1200),
    url: safeString(window.location.href, 500),
    userAgent: safeString(navigator.userAgent || "", 300),
    timestamp: new Date().toISOString(),
    context: context && typeof context === "object" ? context : null,
  };

  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/v1/client-error", blob);
    return;
  }

  fetch("/api/v1/client-error", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Ignore reporting failures.
  });
}

function normalizeMode(value) {
  if (!value) return null;
  const lowered = String(value).trim().toLowerCase();
  if (lowered === MODE_RAIL || lowered === MODE_BUS) return lowered;
  return null;
}

function parseBoolean(raw) {
  if (raw == null) return null;
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function uniqueNonEmptyStrings(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((item) => String(item || "").trim()).filter(Boolean))];
}

function parseStoredArray(key) {
  const raw = getStorageItem(key);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return uniqueNonEmptyStrings(parsed);
  } catch {
    return [];
  }
}

function readStateFromUrl() {
  const params = new URLSearchParams(window.location.search);

  return {
    mode: normalizeMode(params.get("mode")),
    helsinkiOnly: parseBoolean(params.get("helsinkiOnly")),
    stopProvided: params.has("stop"),
    busStopId: params.get("stop") ? params.get("stop").trim() : null,
    linesProvided: params.has("line"),
    busLines: uniqueNonEmptyStrings(params.getAll("line")),
    destinationsProvided: params.has("dest"),
    busDestinations: uniqueNonEmptyStrings(params.getAll("dest")),
  };
}

function hydrateInitialState() {
  const urlState = readStateFromUrl();
  const storedMode = normalizeMode(getStorageItem(STORAGE_MODE_KEY));
  const storedHelsinkiOnly = parseBoolean(getStorageItem(STORAGE_HELSINKI_ONLY_KEY));

  mode = urlState.mode || storedMode || MODE_RAIL;
  helsinkiOnly = urlState.helsinkiOnly ?? storedHelsinkiOnly ?? false;
  if (mode !== MODE_RAIL) {
    helsinkiOnly = false;
  }

  const storedStopId = String(getStorageItem(STORAGE_BUS_STOP_KEY) || "").trim() || null;
  busStopId = urlState.stopProvided ? urlState.busStopId : storedStopId;

  const storedLines = parseStoredArray(STORAGE_BUS_LINES_KEY);
  const storedDestinations = parseStoredArray(STORAGE_BUS_DESTINATIONS_KEY);
  busLineFilters = urlState.linesProvided ? urlState.busLines : storedLines;
  busDestinationFilters = urlState.destinationsProvided
    ? urlState.busDestinations
    : storedDestinations;
}

function syncStateToStorage() {
  setStorageItem(STORAGE_MODE_KEY, mode);
  setStorageItem(STORAGE_HELSINKI_ONLY_KEY, helsinkiOnly ? "1" : "0");
  setStorageItem(STORAGE_BUS_STOP_KEY, busStopId || "");
  setStorageItem(STORAGE_BUS_LINES_KEY, JSON.stringify(busLineFilters));
  setStorageItem(STORAGE_BUS_DESTINATIONS_KEY, JSON.stringify(busDestinationFilters));
}

function syncStateToUrl() {
  const params = new URLSearchParams(window.location.search);

  if (mode === MODE_RAIL) {
    params.delete("mode");
  } else {
    params.set("mode", mode);
  }

  if (mode === MODE_RAIL && helsinkiOnly) {
    params.set("helsinkiOnly", "1");
  } else {
    params.delete("helsinkiOnly");
  }

  params.delete("stop");
  params.delete("line");
  params.delete("dest");

  if (mode === MODE_BUS) {
    if (busStopId) {
      params.set("stop", busStopId);
    }

    for (const line of busLineFilters) {
      params.append("line", line);
    }

    for (const destination of busDestinationFilters) {
      params.append("dest", destination);
    }
  }

  const queryString = params.toString();
  const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

function persistUiState() {
  syncStateToStorage();
  syncStateToUrl();
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

function sanitizeBusSelections() {
  const allowedLines = new Set((busFilterOptions.lines || []).map((option) => option.value));
  const allowedDestinations = new Set(
    (busFilterOptions.destinations || []).map((option) => option.value)
  );

  busLineFilters = busLineFilters.filter((value) => allowedLines.has(value));
  busDestinationFilters = busDestinationFilters.filter((value) => allowedDestinations.has(value));
}

function getVisibleDepartures(departures) {
  if (!Array.isArray(departures)) return [];

  if (mode === MODE_RAIL) {
    if (!helsinkiOnly) return departures;
    return departures.filter(isHelsinkiBound);
  }

  // BUS filtering is applied server-side via query params.
  return departures;
}

function updateModeButtons() {
  if (modeRailBtn) {
    const railActive = mode === MODE_RAIL;
    modeRailBtn.setAttribute("aria-pressed", String(railActive));
    modeRailBtn.classList.toggle("is-active", railActive);
  }

  if (modeBusBtn) {
    const busActive = mode === MODE_BUS;
    modeBusBtn.setAttribute("aria-pressed", String(busActive));
    modeBusBtn.classList.toggle("is-active", busActive);
  }
}

function updateModeLabels() {
  if (modeEyebrowEl) {
    modeEyebrowEl.textContent = mode === MODE_BUS ? "Helsinki Moves • Bus" : "Helsinki Moves • Rail";
  }

  if (nextLabelEl) {
    nextLabelEl.textContent = mode === MODE_BUS ? "Next Bus" : "Next Train";
  }
}

function updateHelsinkiFilterButton() {
  if (!helsinkiOnlyBtn) return;

  if (mode !== MODE_RAIL) {
    helsinkiOnlyBtn.setAttribute("aria-pressed", "false");
    helsinkiOnlyBtn.classList.remove("is-active");
    helsinkiOnlyBtn.disabled = true;
    helsinkiOnlyBtn.textContent = "Helsinki Only (Rail)";
    return;
  }

  helsinkiOnlyBtn.disabled = false;
  helsinkiOnlyBtn.setAttribute("aria-pressed", String(helsinkiOnly));
  helsinkiOnlyBtn.classList.toggle("is-active", helsinkiOnly);
  helsinkiOnlyBtn.textContent = helsinkiOnly ? "Helsinki Only: On" : "Helsinki Only: Off";
}

function setBusControlsVisibility(visible) {
  if (!busControlsEl) return;
  busControlsEl.classList.toggle("hidden", !visible);
}

function getBusStopMeta(stopId) {
  return busStops.find((stop) => stop.id === stopId) || null;
}

function getBusStopCodes(stop) {
  const stopCodes = uniqueNonEmptyStrings([
    ...(Array.isArray(stop?.stopCodes) ? stop.stopCodes : []),
    stop?.code,
  ]);

  if (stopCodes.length === 0 && stop?.id) {
    stopCodes.push(String(stop.id));
  }

  return stopCodes;
}

function buildBusStopDisplay(station, departure = null) {
  const selectedStop = getBusStopMeta(busStopId);
  const stopName = String(departure?.stopName || station?.stopName || selectedStop?.name || "").trim();
  const stopCodes = uniqueNonEmptyStrings([
    departure?.stopCode,
    ...(Array.isArray(station?.stopCodes) ? station.stopCodes : []),
    station?.stopCode,
    ...getBusStopCodes(selectedStop),
  ]);
  const primaryCode = stopCodes[0] || "";

  if (stopName && primaryCode) return `${stopName} ${primaryCode}`;
  if (stopName) return stopName;
  if (primaryCode) return primaryCode;
  return "—";
}

function updateDataScope(data) {
  if (!dataScopeEl) return;

  if (mode !== MODE_BUS) {
    dataScopeEl.classList.add("hidden");
    dataScopeEl.textContent = "";
    return;
  }

  const stopName = String(data?.station?.stopName || getBusStopMeta(busStopId)?.name || "").trim();
  const selectedStopCodes = uniqueNonEmptyStrings([
    ...(Array.isArray(data?.station?.stopCodes) ? data.station.stopCodes : []),
    data?.station?.stopCode,
    ...getBusStopCodes(getBusStopMeta(busStopId)),
  ]);
  const stopIdsScope = selectedStopCodes.join(", ");
  const lineScope =
    busLineFilters.length === 0
      ? "all lines"
      : `${busLineFilters.length} line${busLineFilters.length === 1 ? "" : "s"} selected`;
  const destinationScope =
    busDestinationFilters.length === 0
      ? "all destinations"
      : `${busDestinationFilters.length} destination${busDestinationFilters.length === 1 ? "" : "s"} selected`;

  if (!stopName) {
    dataScopeEl.textContent = `Selecting stop... (${lineScope}, ${destinationScope})`;
  } else {
    dataScopeEl.textContent = `Selected stop ${stopName} (${stopIdsScope || "—"}) - ${lineScope}, ${destinationScope}`;
  }

  dataScopeEl.classList.remove("hidden");
}

function renderFilterButtons(container, options, activeValues, onToggle) {
  if (!container) return;
  container.innerHTML = "";

  if (!Array.isArray(options) || options.length === 0) {
    const empty = document.createElement("span");
    empty.className = "chip-empty";
    empty.textContent = "No options";
    container.appendChild(empty);
    return;
  }

  const activeSet = new Set(activeValues);
  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip-toggle";
    if (activeSet.has(option.value)) {
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
    } else {
      button.setAttribute("aria-pressed", "false");
    }

    button.textContent = `${option.value} (${option.count})`;
    button.addEventListener("click", () => onToggle(option.value));
    container.appendChild(button);
  }
}

function renderBusControls() {
  const visible = mode === MODE_BUS;
  setBusControlsVisibility(visible);
  if (!visible) return;

  if (busStopSelectEl) {
    suppressBusStopChange = true;
    busStopSelectEl.innerHTML = "";

    if (busStops.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No nearby bus stops";
      busStopSelectEl.appendChild(option);
      busStopSelectEl.disabled = true;
    } else {
      busStopSelectEl.disabled = false;
      for (const stop of busStops) {
        const option = document.createElement("option");
        option.value = stop.id;
        option.textContent = `${stop.name} (${stop.distanceMeters}m)`;
        busStopSelectEl.appendChild(option);
      }

      if (busStopId && busStops.some((stop) => stop.id === busStopId)) {
        busStopSelectEl.value = busStopId;
      } else {
        busStopSelectEl.value = busStops[0].id;
      }
    }

    suppressBusStopChange = false;
  }

  renderFilterButtons(busLineFiltersEl, busFilterOptions.lines, busLineFilters, (value) => {
    if (busLineFilters.includes(value)) {
      busLineFilters = busLineFilters.filter((item) => item !== value);
    } else {
      busLineFilters = [...busLineFilters, value];
    }

    persistUiState();
    refreshDeparturesOnly();
  });

  renderFilterButtons(
    busDestinationFiltersEl,
    busFilterOptions.destinations,
    busDestinationFilters,
    (value) => {
      if (busDestinationFilters.includes(value)) {
        busDestinationFilters = busDestinationFilters.filter((item) => item !== value);
      } else {
        busDestinationFilters = [...busDestinationFilters, value];
      }

      persistUiState();
      refreshDeparturesOnly();
    }
  );
}

function updateNextSummary(nextDeparture, station = null) {
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
  nextTrackEl.textContent =
    mode === MODE_BUS
      ? `Stop ${buildBusStopDisplay(station, nextDeparture)}`
      : nextDeparture.track
        ? `Track ${nextDeparture.track}`
        : "Track —";
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
    if (mode === MODE_BUS) {
      return data?.message || "No nearby bus stops found.";
    }

    return data?.message || "No nearby train stations found.";
  }

  const visibleDepartures = getVisibleDepartures(data.station.departures);
  const next = visibleDepartures[0];
  if (!next) {
    if (mode === MODE_BUS) {
      if (busLineFilters.length > 0 || busDestinationFilters.length > 0) {
        return "No upcoming buses match selected filters.";
      }
      return "No upcoming buses right now.";
    }

    return helsinkiOnly
      ? "No Helsinki-bound trains in upcoming departures."
      : "No upcoming commuter trains right now.";
  }

  const destination = next.destination ? ` • ${next.destination}` : "";
  const nextTrack =
    mode === MODE_RAIL
      ? next.track
        ? ` • Track ${next.track}`
        : ""
      : data.station.stopName || data.station.stopCode
        ? ` • ${buildBusStopDisplay(data.station)}`
        : "";
  const serviceName = mode === MODE_BUS ? "bus" : "train";
  return `Next ${next.line || serviceName} in ${formatMinutes(next.departureIso)}${destination}${nextTrack}`;
}

function getLoadErrorStatus(error) {
  if (!(error instanceof Error)) {
    return "Could not refresh departures. Please try again.";
  }

  if (error.name === "AbortError") {
    return "Request timed out. Please try again.";
  }

  const message = (error.message || "").trim();
  if (message === "Temporary server error. Please try again.") {
    return message;
  }
  if (message === "Invalid lat/lon") {
    return "Location coordinates were invalid. Please refresh your location.";
  }
  if (message === "Invalid mode") {
    return "Unsupported transport mode.";
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

  const destinations = rows.map((row) => row.querySelector(".destination")).filter(Boolean);

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
  renderBusControls();
  updateDataScope(data);

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
    if (mode === MODE_BUS) {
      li.textContent =
        busLineFilters.length > 0 || busDestinationFilters.length > 0
          ? "No upcoming buses match selected filters."
          : "No upcoming buses right now.";
    } else {
      li.textContent = helsinkiOnly
        ? "No Helsinki-bound trains in upcoming departures."
        : "No upcoming commuter trains right now.";
    }
    departuresEl.appendChild(li);
    return;
  }

  updateNextSummary(visibleDepartures[0], station);
  const listDepartures = visibleDepartures.slice(1);

  if (listDepartures.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-row";
    li.textContent =
      mode === MODE_BUS
        ? "No additional upcoming buses right now."
        : "No additional upcoming commuter trains right now.";
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
    if (mode === MODE_BUS) {
      track.textContent = `Stop ${buildBusStopDisplay(station, item)}`;
    } else {
      track.textContent = item.track ? `Track ${item.track}` : "Track —";
    }
    left.appendChild(track);

    li.appendChild(letterBadge);
    li.appendChild(left);
    departuresEl.appendChild(li);
  }

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

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetryOnce(url, options = {}) {
  let res;

  try {
    res = await fetchWithTimeout(url, options);
  } catch {
    await delay(350);
    return fetchWithTimeout(url, options);
  }

  if (res.status >= 500) {
    await delay(350);
    return fetchWithTimeout(url, options);
  }

  return res;
}

function updateBusStateFromResponse(responseData) {
  const stops = Array.isArray(responseData?.stops)
    ? responseData.stops
        .filter((stop) => stop && stop.id && stop.name)
        .map((stop) => ({
          id: stop.id,
          name: stop.name,
          code: String(stop.code || "").trim() || null,
          stopCodes: uniqueNonEmptyStrings([
            ...(Array.isArray(stop.stopCodes) ? stop.stopCodes : []),
            stop.code,
          ]),
          distanceMeters: Number(stop.distanceMeters) || 0,
        }))
    : [];

  busStops = stops;

  const selectedFromResponse = String(responseData?.selectedStopId || "").trim() || null;
  const stopExists = (id) => stops.some((stop) => stop.id === id);

  if (selectedFromResponse && stopExists(selectedFromResponse)) {
    busStopId = selectedFromResponse;
  } else if (!busStopId || !stopExists(busStopId)) {
    busStopId = stops[0]?.id || null;
  }

  const lines = Array.isArray(responseData?.filterOptions?.lines)
    ? responseData.filterOptions.lines
        .filter((item) => item && item.value)
        .map((item) => ({ value: String(item.value), count: Number(item.count) || 0 }))
    : [];

  const destinations = Array.isArray(responseData?.filterOptions?.destinations)
    ? responseData.filterOptions.destinations
        .filter((item) => item && item.value)
        .map((item) => ({ value: String(item.value), count: Number(item.count) || 0 }))
    : [];

  busFilterOptions = { lines, destinations };
  sanitizeBusSelections();
}

async function load(lat, lon) {
  const loadToken = ++latestLoadToken;
  const requestMode = mode;
  const requestBusStopId = busStopId;
  const requestBusLineFilters = [...busLineFilters];
  const requestBusDestinationFilters = [...busDestinationFilters];

  setLoading(true);
  setStatus("Loading departures...");

  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      mode: requestMode.toUpperCase(),
    });

    if (requestMode === MODE_BUS && requestBusStopId) {
      params.set("stopId", requestBusStopId);
      for (const line of requestBusLineFilters) {
        params.append("line", line);
      }
      for (const destination of requestBusDestinationFilters) {
        params.append("dest", destination);
      }
    }

    const res = await fetchWithRetryOnce(`/api/v1/departures?${params.toString()}`);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      if (!res.ok) {
        throw new Error("Request failed");
      }
      throw new Error("Unexpected server response.");
    }

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error || "Request failed");
    }

    if (loadToken !== latestLoadToken) {
      return;
    }

    if (requestMode === MODE_BUS) {
      updateBusStateFromResponse(json);
      persistUiState();
    }

    latestResponse = json;
    render(json);
    setPermissionRequired(false);
    setLastUpdated(new Date());
    setStatus(buildStatusFromResponse(json));
  } catch (err) {
    if (loadToken !== latestLoadToken) {
      return;
    }

    latestResponse = null;
    console.error("load departures error:", err);
    reportClientError("load", err, { mode: requestMode });
    setStatus(getLoadErrorStatus(err));
    resultEl.classList.add("hidden");
    updateNextSummary(null);
  } finally {
    if (loadToken === latestLoadToken) {
      setLoading(false);
    }
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

function applyModeUiState() {
  updateModeButtons();
  updateModeLabels();
  updateHelsinkiFilterButton();
  renderBusControls();
  updateDataScope(latestResponse);
}

locateBtn.addEventListener("click", () => {
  requestLocationAndLoad();
});

modeRailBtn?.addEventListener("click", () => {
  if (mode === MODE_RAIL) return;
  mode = MODE_RAIL;
  applyModeUiState();
  persistUiState();

  if (currentCoords) {
    load(currentCoords.lat, currentCoords.lon);
    return;
  }

  requestLocationAndLoad();
});

modeBusBtn?.addEventListener("click", () => {
  if (mode === MODE_BUS) return;
  mode = MODE_BUS;
  helsinkiOnly = false;
  applyModeUiState();
  persistUiState();

  if (currentCoords) {
    load(currentCoords.lat, currentCoords.lon);
    return;
  }

  requestLocationAndLoad();
});

busStopSelectEl?.addEventListener("change", () => {
  if (suppressBusStopChange || mode !== MODE_BUS) return;

  const nextStopId = String(busStopSelectEl.value || "").trim();
  if (!nextStopId || nextStopId === busStopId) return;

  busStopId = nextStopId;
  persistUiState();

  if (currentCoords) {
    load(currentCoords.lat, currentCoords.lon);
  }
});

helsinkiOnlyBtn.addEventListener("click", () => {
  if (mode !== MODE_RAIL) return;
  helsinkiOnly = !helsinkiOnly;
  persistUiState();
  updateHelsinkiFilterButton();

  if (latestResponse) {
    render(latestResponse);
    setStatus(buildStatusFromResponse(latestResponse));
  }
});

hydrateInitialState();
persistUiState();
applyModeUiState();
updateClock();
setInterval(updateClock, 1000);
requestLocationAndLoad();
setInterval(refreshDeparturesOnly, 30000);
window.addEventListener("resize", () => {
  requestAnimationFrame(alignDepartureColumns);
});

window.addEventListener("error", (event) => {
  reportClientError("error", event.error || event.message || "Unknown error", {
    source: event.filename || "",
    line: event.lineno || null,
    column: event.colno || null,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  reportClientError("unhandledrejection", event.reason || "Unhandled promise rejection");
});

/* ─── Theme Toggle ─── */
(() => {
  const btn = document.getElementById("themeToggle");
  const root = document.documentElement;
  const stored = localStorage.getItem("theme");
  if (stored) root.setAttribute("data-theme", stored);

  btn.addEventListener("click", () => {
    const isDark = root.getAttribute("data-theme") === "dark" ||
      (!root.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });
})();
