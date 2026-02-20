const DIGITRANSIT_ENDPOINT = "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1";

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

function parseDeparture(item, fallbackTrack) {
  if (!item || !item.trip || !item.trip.route) return null;
  if ((item.trip.route.mode || "").toUpperCase() !== "RAIL") return null;

  const serviceDay = Number(item.serviceDay);
  const realtimeSeconds = Number(item.realtimeDeparture);
  const scheduledSeconds = Number(item.scheduledDeparture);
  const seconds = Number.isFinite(realtimeSeconds) ? realtimeSeconds : scheduledSeconds;

  if (!Number.isFinite(serviceDay) || !Number.isFinite(seconds)) return null;

  const epoch = serviceDay + seconds;
  const departureDate = new Date(epoch * 1000);
  if (Number.isNaN(departureDate.getTime())) return null;

  return {
    line: item.trip.route.shortName || "Train",
    destination: item.headsign || "",
    track: item.stop?.platformCode || fallbackTrack || null,
    departureIso: departureDate.toISOString(),
  };
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: "Invalid lat/lon" });
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: "Invalid lat/lon" });
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

    const railStops = edges.filter(
      (n) => (n.stop.vehicleMode || "").toUpperCase() === "RAIL"
    );

    if (railStops.length === 0) {
      return res.status(200).json({ station: null, message: "No nearby train stations" });
    }

    const stopDeparturesQuery = `
      query StopDepartures($id: String!) {
        stop(id: $id) {
          platformCode
          stoptimesWithoutPatterns(numberOfDepartures: 8) {
            serviceDay
            scheduledDeparture
            realtimeDeparture
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

    const stationDeparturesQuery = `
      query StationDepartures($id: String!) {
        station(id: $id) {
          stoptimesWithoutPatterns(numberOfDepartures: 8) {
            serviceDay
            scheduledDeparture
            realtimeDeparture
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

    const candidateMap = new Map();
    for (const node of railStops) {
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
      return res.status(200).json({ station: null, message: "No nearby train stations" });
    }

    let items = [];
    let fallbackTrack = null;

    if (nearest.kind === "station") {
      const stationData = await graphqlRequest(stationDeparturesQuery, { id: nearest.key });
      items = stationData?.station?.stoptimesWithoutPatterns || [];
    } else {
      const stopData = await graphqlRequest(stopDeparturesQuery, { id: nearest.stopId });
      items = stopData?.stop?.stoptimesWithoutPatterns || [];
      fallbackTrack = stopData?.stop?.platformCode || null;
    }

    const now = Date.now();
    const departures = items
      .map((item) => parseDeparture(item, fallbackTrack))
      .filter(Boolean)
      .filter((d) => new Date(d.departureIso).getTime() >= now - 60 * 1000)
      .sort((a, b) => new Date(a.departureIso).getTime() - new Date(b.departureIso).getTime())
      .slice(0, 8);

    return res.status(200).json({
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
