const {
  MODE_RAIL,
  MODE_BUS,
  MODE_TRAM,
  MODE_METRO,
  nearbyStopsQuery,
  stopDeparturesQuery,
  stationDeparturesQuery,
  buildMultiStopDeparturesQuery,
  graphqlRequest: defaultGraphqlRequest,
} = require("../lib/digitransit");
const {
  parseRequestedMode,
  parseMultiQueryParam,
  parseRequestedResultLimit,
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

function buildSelectableStops(modeStops) {
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
    .filter((d) => new Date(d.departureIso).getTime() > now)
    .sort((a, b) => new Date(a.departureIso).getTime() - new Date(b.departureIso).getTime());
}

function dedupeStopDepartures(departures) {
  const validDepartures = (departures || []).filter(Boolean);

  return validDepartures.filter(
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

function filterDeparturesBySelections(departures, requestedLines, requestedDestinations) {
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

function getDefaultResultLimit(mode) {
  return mode === MODE_BUS ? 24 : 8;
}

function getNoNearbyStopsMessage(mode) {
  if (mode === MODE_METRO) return "No nearby metro stops";
  return mode === MODE_TRAM ? "No nearby tram stops" : "No nearby bus stops";
}

function isStopMode(mode) {
  return mode === MODE_BUS || mode === MODE_TRAM || mode === MODE_METRO;
}

function getUpstreamMode(mode) {
  // Digitransit labels metro routes/stops as SUBWAY while API mode remains METRO.
  return mode === MODE_METRO ? "SUBWAY" : mode;
}

function noNearbyStopModeResponse(mode) {
  return {
    mode,
    station: null,
    stops: [],
    selectedStopId: null,
    filterOptions: { lines: [], destinations: [] },
    message: getNoNearbyStopsMessage(mode),
  };
}

function noNearbyRailModeResponse(mode) {
  return { mode, station: null, message: "No nearby train stations" };
}

function parseDeparturesRequest(query) {
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  const mode = parseRequestedMode(query.mode);
  const requestedLines = parseMultiQueryParam(query.line);
  const requestedDestinations = parseMultiQueryParam(query.dest);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { error: "Invalid lat/lon" };
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { error: "Invalid lat/lon" };
  }

  if (!mode) {
    return { error: "Invalid mode" };
  }

  const requestedResultLimit = parseRequestedResultLimit(query.results, getDefaultResultLimit(mode));
  if (requestedResultLimit == null) {
    return { error: "Invalid results" };
  }

  return {
    error: null,
    params: {
      lat,
      lon,
      mode,
      requestedLines,
      requestedDestinations,
      requestedResultLimit,
      requestedStopId: typeof query.stopId === "string" ? query.stopId.trim() : "",
    },
  };
}

function selectRequestedStop(stops, requestedStopId) {
  return (
    stops.find((stop) => stop.id === requestedStopId) ||
    stops.find((stop) => stop.memberStopIds.includes(requestedStopId)) ||
    stops[0] ||
    null
  );
}

function buildStopModeStation(selectedStop, departures) {
  return {
    stopName: selectedStop.name,
    stopCode: selectedStop.code || null,
    stopCodes: selectedStop.memberStopCodes || [],
    type: "stop",
    distanceMeters: Math.round(selectedStop.distance),
    departures,
  };
}

function mapSelectableStops(stops) {
  return stops.map((stop) => ({
    id: stop.id,
    name: stop.name,
    code: stop.code || null,
    memberStopIds: stop.memberStopIds || [stop.id],
    stopCodes: stop.memberStopCodes || [],
    distanceMeters: Math.round(stop.distance),
  }));
}

async function buildStopModeResponse({
  graphqlRequest,
  mode,
  upstreamMode,
  modeStops,
  requestedResultLimit,
  requestedLines,
  requestedDestinations,
  requestedStopId,
}) {
  const stops = buildSelectableStops(modeStops);
  const selectedStop = selectRequestedStop(stops, requestedStopId);
  if (!selectedStop) {
    return noNearbyStopModeResponse(mode);
  }

  const stopIds = selectedStop.memberStopIds || [selectedStop.id];
  const { query, variables, aliases } = buildMultiStopDeparturesQuery(stopIds, requestedResultLimit);
  const multiStopData = await graphqlRequest(query, variables);
  const stopDataList = aliases.map((alias) => ({ stop: multiStopData?.[alias] || null }));

  const allDepartures = filterUpcoming(
    dedupeStopDepartures(
      stopDataList.flatMap((stopData) => {
        const items = stopData?.stop?.stoptimesWithoutPatterns || [];
        const fallbackTrack = stopData?.stop?.platformCode || null;
        const fallbackStop = stopData?.stop || null;
        return items.map((item) => parseDeparture(item, fallbackTrack, upstreamMode, fallbackStop));
      })
    )
  );

  const departures = filterDeparturesBySelections(
    allDepartures,
    requestedLines,
    requestedDestinations
  ).slice(0, requestedResultLimit);

  return {
    mode,
    station: buildStopModeStation(selectedStop, departures),
    stops: mapSelectableStops(stops),
    selectedStopId: selectedStop.id,
    filterOptions: buildFilterOptions(allDepartures),
  };
}

async function buildRailModeResponse({
  graphqlRequest,
  mode,
  upstreamMode,
  modeStops,
  requestedResultLimit,
}) {
  const nearest = getNearestRailCandidate(modeStops);
  if (!nearest) {
    return noNearbyRailModeResponse(mode);
  }

  let items = [];
  let fallbackTrack = null;

  if (nearest.kind === "station") {
    const stationData = await graphqlRequest(stationDeparturesQuery, {
      id: nearest.key,
      departures: requestedResultLimit,
    });
    items = stationData?.station?.stoptimesWithoutPatterns || [];
  } else {
    const stopData = await graphqlRequest(stopDeparturesQuery, {
      id: nearest.stopId,
      departures: requestedResultLimit,
    });
    items = stopData?.stop?.stoptimesWithoutPatterns || [];
    fallbackTrack = stopData?.stop?.platformCode || null;
  }

  const departures = filterUpcoming(
    items.map((item) => parseDeparture(item, fallbackTrack, upstreamMode))
  ).slice(0, requestedResultLimit);

  return {
    mode,
    station: {
      stopName: nearest.name,
      type: nearest.kind,
      distanceMeters: Math.round(nearest.distance),
      departures,
    },
  };
}

function createDeparturesHandler({
  graphqlRequest = defaultGraphqlRequest,
  logError = console.error,
} = {}) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const parsedRequest = parseDeparturesRequest(req.query);
    if (parsedRequest.error) {
      return res.status(400).json({ error: parsedRequest.error });
    }

    const {
      lat,
      lon,
      mode,
      requestedLines,
      requestedDestinations,
      requestedResultLimit,
      requestedStopId,
    } = parsedRequest.params;

    try {
      const upstreamMode = getUpstreamMode(mode);
      const nearbyData = await graphqlRequest(nearbyStopsQuery, {
        lat,
        lon,
        radius: 1200,
      });

      const modeStops = getModeStops(nearbyData, upstreamMode);

      if (modeStops.length === 0) {
        if (isStopMode(mode)) {
          return res.status(200).json(noNearbyStopModeResponse(mode));
        }

        return res.status(200).json(noNearbyRailModeResponse(mode));
      }

      if (isStopMode(mode)) {
        return res.status(200).json(
          await buildStopModeResponse({
            graphqlRequest,
            mode,
            upstreamMode,
            modeStops,
            requestedResultLimit,
            requestedLines,
            requestedDestinations,
            requestedStopId,
          })
        );
      }

      return res.status(200).json(
        await buildRailModeResponse({
          graphqlRequest,
          mode,
          upstreamMode,
          modeStops,
          requestedResultLimit,
        })
      );
    } catch (error) {
      // Keep detailed error only in server logs; avoid leaking internals to clients.
      logError("v1/departures API error:", error);
      return res.status(500).json({ error: "Temporary server error. Please try again." });
    }
  };
}

const handler = createDeparturesHandler();

module.exports = handler;
module.exports._private = {
  getModeStops,
  buildSelectableStops,
  filterUpcoming,
  dedupeStopDepartures,
  filterDeparturesBySelections,
  getNearestRailCandidate,
  getDefaultResultLimit,
  getNoNearbyStopsMessage,
  isStopMode,
  getUpstreamMode,
  noNearbyStopModeResponse,
  noNearbyRailModeResponse,
  parseDeparturesRequest,
  selectRequestedStop,
  buildStopModeStation,
  mapSelectableStops,
  buildStopModeResponse,
  buildRailModeResponse,
  createDeparturesHandler,
};
