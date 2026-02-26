const DIGITRANSIT_ENDPOINT = "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1";
const DIGITRANSIT_TIMEOUT_MS = 7000;
const MODE_RAIL = "RAIL";
const MODE_BUS = "BUS";
const MODE_TRAM = "TRAM";
const MODE_METRO = "METRO";

const nearbyStopsQuery = `
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

const stopDeparturesQuery = `
  query StopDepartures($id: String!, $departures: Int!) {
    stop(id: $id) {
      name
      platformCode
      stoptimesWithoutPatterns(numberOfDepartures: $departures) {
        serviceDay
        scheduledDeparture
        realtimeDeparture
        scheduledArrival
        realtimeArrival
        departureDelay
        pickupType
        dropoffType
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
        scheduledArrival
        realtimeArrival
        departureDelay
        pickupType
        dropoffType
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

function buildMultiStopDeparturesQuery(stopIds, departures) {
  const ids = [...new Set((stopIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new Error("buildMultiStopDeparturesQuery requires at least one stop id");
  }

  if (!Number.isInteger(departures) || departures < 1) {
    throw new Error("buildMultiStopDeparturesQuery requires a positive integer departures limit");
  }

  const variableDefs = ["$departures: Int!"];
  const stopFields = [];
  const aliases = [];
  const variables = { departures };

  ids.forEach((id, index) => {
    const alias = `s${index}`;
    const variable = `id${index}`;
    aliases.push(alias);
    variableDefs.push(`$${variable}: String!`);
    variables[variable] = id;
    stopFields.push(`
      ${alias}: stop(id: $${variable}) {
        name
        platformCode
        stoptimesWithoutPatterns(numberOfDepartures: $departures) {
          serviceDay
          scheduledDeparture
          realtimeDeparture
          scheduledArrival
          realtimeArrival
          departureDelay
          pickupType
          dropoffType
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
    `);
  });

  const query = `
    query MultiStopDepartures(${variableDefs.join(", ")}) {
${stopFields.join("\n")}
    }
  `;

  return { query, variables, aliases };
}

async function graphqlRequest(query, variables) {
  const key = process.env.DIGITRANSIT_API_KEY;
  if (!key) {
    throw new Error("Missing DIGITRANSIT_API_KEY environment variable.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DIGITRANSIT_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(DIGITRANSIT_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "digitransit-subscription-key": key,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Digitransit request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error(`Digitransit invalid response (HTTP ${response.status})`);
  }

  if (!response.ok) {
    throw new Error(`Digitransit HTTP ${response.status}`);
  }

  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors.map((e) => e.message).join(" | "));
  }

  return json.data;
}

module.exports = {
  MODE_RAIL,
  MODE_BUS,
  MODE_TRAM,
  MODE_METRO,
  nearbyStopsQuery,
  stopDeparturesQuery,
  stationDeparturesQuery,
  buildMultiStopDeparturesQuery,
  graphqlRequest,
};
