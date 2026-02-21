const { MODE_RAIL, MODE_BUS } = require("./digitransit");

function parseRequestedMode(rawMode) {
  const mode = String(rawMode || MODE_RAIL).trim().toUpperCase();
  if (mode === MODE_RAIL || mode === MODE_BUS) return mode;
  return null;
}

function parseMultiQueryParam(rawValue) {
  if (rawValue == null) return [];

  const parts = (Array.isArray(rawValue) ? rawValue : [rawValue]).flatMap((value) =>
    String(value || "")
      .split(",")
      .map((item) => item.trim())
  );

  return [...new Set(parts.filter(Boolean))];
}

function parseDeparture(item, fallbackTrack, expectedMode, fallbackStop = null) {
  if (!item || !item.trip || !item.trip.route) return null;
  if ((item.trip.route.mode || "").toUpperCase() !== expectedMode) return null;

  const serviceDay = Number(item.serviceDay);
  const realtimeSeconds = Number(item.realtimeDeparture);
  const scheduledSeconds = Number(item.scheduledDeparture);
  const seconds = Number.isFinite(realtimeSeconds) ? realtimeSeconds : scheduledSeconds;

  if (!Number.isFinite(serviceDay) || !Number.isFinite(seconds)) return null;

  const epoch = serviceDay + seconds;
  const departureDate = new Date(epoch * 1000);
  if (Number.isNaN(departureDate.getTime())) return null;

  const stopId = String(item.stop?.gtfsId || fallbackStop?.gtfsId || "").trim() || null;
  const stopCode = String(item.stop?.code || fallbackStop?.code || "").trim() || null;
  const stopName = String(item.stop?.name || fallbackStop?.name || "").trim() || null;

  return {
    line: item.trip.route.shortName || "Service",
    destination: item.headsign || "",
    track: item.stop?.platformCode || fallbackTrack || null,
    stopId,
    stopCode,
    stopName,
    departureIso: departureDate.toISOString(),
    delaySeconds: item.departureDelay || 0,
  };
}

function buildFilterOptions(departures) {
  const lines = new Map();
  const destinations = new Map();

  for (const departure of departures || []) {
    const line = String(departure.line || "").trim();
    if (line) {
      lines.set(line, (lines.get(line) || 0) + 1);
    }

    const destination = String(departure.destination || "").trim();
    if (destination) {
      destinations.set(destination, (destinations.get(destination) || 0) + 1);
    }
  }

  const toSortedOptions = (sourceMap) =>
    [...sourceMap.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }));

  return {
    lines: toSortedOptions(lines),
    destinations: toSortedOptions(destinations),
  };
}

module.exports = {
  parseRequestedMode,
  parseMultiQueryParam,
  parseDeparture,
  buildFilterOptions,
};
