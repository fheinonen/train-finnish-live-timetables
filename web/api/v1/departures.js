const {
  MODE_RAIL,
  MODE_BUS,
  nearbyStopsQuery,
  stopDeparturesQuery,
  stationDeparturesQuery,
  graphqlRequest,
} = require("../lib/digitransit");
const {
  parseRequestedMode,
  parseMultiQueryParam,
  parseDeparture,
  buildFilterOptions,
} = require("../lib/departures-utils");

function getModeStops(nearbyData, mode) {
  const edges = (nearbyData?.stopsByRadius?.edges || [])
    .map((e) => e.node)
    .filter((n) => n && n.stop && n.stop.gtfsId)
    .sort((a, b) => a.distance - b.distance);

  return edges.filter((n) => (n.stop.vehicleMode || "").toUpperCase() === mode);
}

function buildBusStops(modeStops) {
  const stopGroups = new Map();

  for (const node of modeStops) {
    const stopId = node.stop.gtfsId;
    const stopName = String(node.stop.name || "").trim();
    const stopCode = String(node.stop.code || "").trim();
    if (!stopId || !stopName) continue;

    const groupKey = stopName.toLowerCase();
    let group = stopGroups.get(groupKey);
    if (!group) {
      group = {
        id: stopId,
        name: stopName,
        code: stopCode || null,
        distance: node.distance,
        memberStopIds: new Set(),
        memberStopCodes: new Set(),
      };
      stopGroups.set(groupKey, group);
    }

    group.memberStopIds.add(stopId);
    if (stopCode) {
      group.memberStopCodes.add(stopCode);
    }

    if (node.distance < group.distance) {
      // Use nearest member stop id as canonical selectable id for this name-group.
      group.id = stopId;
      group.code = stopCode || group.code;
      group.distance = node.distance;
    }
  }

  return [...stopGroups.values()]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8)
    .map((group) => ({
      id: group.id,
      name: group.name,
      code: group.code || [...group.memberStopCodes][0] || null,
      distance: group.distance,
      memberStopIds: [...group.memberStopIds],
      memberStopCodes: [...group.memberStopCodes].sort((a, b) => a.localeCompare(b)),
    }));
}

function filterUpcoming(departures, now = Date.now()) {
  return departures
    .filter(Boolean)
    .filter((d) => new Date(d.departureIso).getTime() >= now - 60 * 1000)
    .sort((a, b) => new Date(a.departureIso).getTime() - new Date(b.departureIso).getTime());
}

function dedupeBusDepartures(departures) {
  return departures.filter(
    (departure, index, array) =>
      array.findIndex(
        (candidate) =>
          candidate.line === departure.line &&
          candidate.destination === departure.destination &&
          candidate.departureIso === departure.departureIso &&
          candidate.track === departure.track &&
          candidate.stopId === departure.stopId
      ) === index
  );
}

function filterBusBySelections(departures, requestedLines, requestedDestinations) {
  const lineFilterSet = new Set(requestedLines);
  const destinationFilterSet = new Set(requestedDestinations);

  return departures
    .filter((departure) => {
      if (lineFilterSet.size === 0) return true;
      const line = String(departure.line || "").trim();
      return lineFilterSet.has(line);
    })
    .filter((departure) => {
      if (destinationFilterSet.size === 0) return true;
      const destination = String(departure.destination || "").trim();
      return destinationFilterSet.has(destination);
    });
}

function getNearestRailCandidate(modeStops) {
  const candidateMap = new Map();

  for (const node of modeStops) {
    const parent = node.stop.parentStation;
    const key = parent?.gtfsId || node.stop.gtfsId;
    const name = parent?.name || node.stop.name;
    const kind = parent?.gtfsId ? "station" : "stop";

    const existing = candidateMap.get(key);
    if (!existing || node.distance < existing.distance) {
      candidateMap.set(key, {
        key,
        name,
        distance: node.distance,
        kind,
        stopId: node.stop.gtfsId,
      });
    }
  }

  return [...candidateMap.values()].sort((a, b) => a.distance - b.distance)[0] || null;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const mode = parseRequestedMode(req.query.mode);
  const requestedLines = parseMultiQueryParam(req.query.line);
  const requestedDestinations = parseMultiQueryParam(req.query.dest);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: "Invalid lat/lon" });
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: "Invalid lat/lon" });
  }

  if (!mode) {
    return res.status(400).json({ error: "Invalid mode" });
  }

  try {
    const nearbyData = await graphqlRequest(nearbyStopsQuery, {
      lat,
      lon,
      radius: 1200,
    });

    const modeStops = getModeStops(nearbyData, mode);

    if (modeStops.length === 0) {
      if (mode === MODE_BUS) {
        return res.status(200).json({
          mode,
          station: null,
          stops: [],
          selectedStopId: null,
          filterOptions: { lines: [], destinations: [] },
          message: "No nearby bus stops",
        });
      }

      return res.status(200).json({ mode, station: null, message: "No nearby train stations" });
    }

    if (mode === MODE_BUS) {
      const stops = buildBusStops(modeStops);
      const requestedStopId = typeof req.query.stopId === "string" ? req.query.stopId.trim() : "";
      const selectedStop =
        stops.find((stop) => stop.id === requestedStopId) ||
        stops.find((stop) => stop.memberStopIds.includes(requestedStopId)) ||
        stops[0];

      if (!selectedStop) {
        return res.status(200).json({
          mode,
          station: null,
          stops: [],
          selectedStopId: null,
          filterOptions: { lines: [], destinations: [] },
          message: "No nearby bus stops",
        });
      }

      const stopIds = selectedStop.memberStopIds || [selectedStop.id];
      const stopDataList = await Promise.all(
        stopIds.map((id) => graphqlRequest(stopDeparturesQuery, { id, departures: 24 }))
      );

      const allDepartures = filterUpcoming(
        dedupeBusDepartures(
          stopDataList.flatMap((stopData) => {
            const items = stopData?.stop?.stoptimesWithoutPatterns || [];
            const fallbackTrack = stopData?.stop?.platformCode || null;
            const fallbackStop = stopData?.stop || null;
            return items.map((item) => parseDeparture(item, fallbackTrack, mode, fallbackStop));
          })
        )
      );

      const departures = filterBusBySelections(
        allDepartures,
        requestedLines,
        requestedDestinations
      ).slice(0, 24);

      return res.status(200).json({
        mode,
        station: {
          stopName: selectedStop.name,
          stopCode: selectedStop.code || null,
          stopCodes: selectedStop.memberStopCodes || [],
          type: "stop",
          distanceMeters: Math.round(selectedStop.distance),
          departures,
        },
        stops: stops.map((stop) => ({
          id: stop.id,
          name: stop.name,
          code: stop.code || null,
          stopCodes: stop.memberStopCodes || [],
          distanceMeters: Math.round(stop.distance),
        })),
        selectedStopId: selectedStop.id,
        filterOptions: buildFilterOptions(allDepartures),
      });
    }

    const nearest = getNearestRailCandidate(modeStops);
    if (!nearest) {
      return res.status(200).json({ mode, station: null, message: "No nearby train stations" });
    }

    let items = [];
    let fallbackTrack = null;

    if (nearest.kind === "station") {
      const stationData = await graphqlRequest(stationDeparturesQuery, {
        id: nearest.key,
        departures: 20,
      });
      items = stationData?.station?.stoptimesWithoutPatterns || [];
    } else {
      const stopData = await graphqlRequest(stopDeparturesQuery, {
        id: nearest.stopId,
        departures: 20,
      });
      items = stopData?.stop?.stoptimesWithoutPatterns || [];
      fallbackTrack = stopData?.stop?.platformCode || null;
    }

    const departures = filterUpcoming(items.map((item) => parseDeparture(item, fallbackTrack, mode))).slice(
      0,
      8
    );

    return res.status(200).json({
      mode,
      station: {
        stopName: nearest.name,
        type: nearest.kind,
        distanceMeters: Math.round(nearest.distance),
        departures,
      },
    });
  } catch (error) {
    // Keep detailed error only in server logs; avoid leaking internals to clients.
    console.error("v1/departures API error:", error);
    return res.status(500).json({ error: "Temporary server error. Please try again." });
  }
};
