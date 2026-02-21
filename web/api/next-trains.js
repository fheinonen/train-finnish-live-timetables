const DIGITRANSIT_ENDPOINT = "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1";
const MODE_RAIL = "RAIL";
const MODE_BUS = "BUS";

async function graphqlRequest(query, variables) {
  const key = process.env.DIGITRANSIT_API_KEY;
  if (!key) {
    throw new Error("Missing DIGITRANSIT_API_KEY environment variable.");
  }

  const response = await fetch(DIGITRANSIT_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "digitransit-subscription-key": key,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(`Digitransit HTTP ${response.status}`);
  }

  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors.map((e) => e.message).join(" | "));
  }

  return json.data;
}

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
    const nearbyQuery = `
      query NearbyStops($lat: Float!, $lon: Float!, $radius: Int!) {
        stopsByRadius(lat: $lat, lon: $lon, radius: $radius) {
          edges {
            node {
              distance
              stop {
                gtfsId
                name
                code
                vehicleMode
                parentStation {
                  gtfsId
                  name
                }
              }
            }
          }
        }
      }
    `;

    const nearbyData = await graphqlRequest(nearbyQuery, {
      lat,
      lon,
      radius: 1200,
    });

    const edges = (nearbyData?.stopsByRadius?.edges || [])
      .map((e) => e.node)
      .filter((n) => n && n.stop && n.stop.gtfsId)
      .sort((a, b) => a.distance - b.distance);

    const modeStops = edges.filter(
      (n) => (n.stop.vehicleMode || "").toUpperCase() === mode
    );

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

    const stopDeparturesQuery = `
      query StopDepartures($id: String!, $departures: Int!) {
        stop(id: $id) {
          name
          platformCode
          stoptimesWithoutPatterns(numberOfDepartures: $departures) {
            serviceDay
            scheduledDeparture
            realtimeDeparture
            departureDelay
            headsign
            stop {
              gtfsId
              name
              code
              platformCode
            }
            trip {
              route {
                mode
                shortName
              }
            }
          }
        }
      }
    `;

    const stationDeparturesQuery = `
      query StationDepartures($id: String!, $departures: Int!) {
        station(id: $id) {
          stoptimesWithoutPatterns(numberOfDepartures: $departures) {
            serviceDay
            scheduledDeparture
            realtimeDeparture
            departureDelay
            headsign
            stop {
              platformCode
            }
            trip {
              route {
                mode
                shortName
              }
            }
          }
        }
      }
    `;

    if (mode === MODE_BUS) {
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

      const stops = [...stopGroups.values()]
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
        stopIds.map((id) =>
          graphqlRequest(stopDeparturesQuery, {
            id,
            departures: 24,
          })
        )
      );

      const now = Date.now();
      const allDepartures = stopDataList
        .flatMap((stopData) => {
          const items = stopData?.stop?.stoptimesWithoutPatterns || [];
          const fallbackTrack = stopData?.stop?.platformCode || null;
          const fallbackStop = stopData?.stop || null;
          return items.map((item) => parseDeparture(item, fallbackTrack, mode, fallbackStop));
        })
        .filter(Boolean)
        .filter(
          (departure, index, array) =>
            array.findIndex(
              (candidate) =>
                candidate.line === departure.line &&
                candidate.destination === departure.destination &&
                candidate.departureIso === departure.departureIso &&
                candidate.track === departure.track &&
                candidate.stopId === departure.stopId
            ) === index
        )
        .filter((d) => new Date(d.departureIso).getTime() >= now - 60 * 1000)
        .sort((a, b) => new Date(a.departureIso).getTime() - new Date(b.departureIso).getTime());

      const lineFilterSet = new Set(requestedLines);
      const destinationFilterSet = new Set(requestedDestinations);
      const departures = allDepartures
        .filter((departure) => {
          if (lineFilterSet.size === 0) return true;
          const line = String(departure.line || "").trim();
          return lineFilterSet.has(line);
        })
        .filter((departure) => {
          if (destinationFilterSet.size === 0) return true;
          const destination = String(departure.destination || "").trim();
          return destinationFilterSet.has(destination);
        })
        .slice(0, 24);

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

    const nearest = [...candidateMap.values()].sort((a, b) => a.distance - b.distance)[0];
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
      const stopData = await graphqlRequest(stopDeparturesQuery, { id: nearest.stopId, departures: 20 });
      items = stopData?.stop?.stoptimesWithoutPatterns || [];
      fallbackTrack = stopData?.stop?.platformCode || null;
    }

    const now = Date.now();
    const departures = items
      .map((item) => parseDeparture(item, fallbackTrack, mode))
      .filter(Boolean)
      .filter((d) => new Date(d.departureIso).getTime() >= now - 60 * 1000)
      .sort((a, b) => new Date(a.departureIso).getTime() - new Date(b.departureIso).getTime())
      .slice(0, 8);

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
    console.error("next-trains API error:", error);
    return res.status(500).json({ error: "Temporary server error. Please try again." });
  }
};
