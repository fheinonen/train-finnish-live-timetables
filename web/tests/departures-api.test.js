const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const { createMockRequest, createMockResponse } = require("./helpers/http-mocks");
const departuresModule = require("../api/v1/departures");

const { createDeparturesHandler } = departuresModule._private;

function createStopEdge({ distance = 50, stop = {} } = {}) {
  return {
    node: {
      distance,
      stop: {
        gtfsId: stop.gtfsId ?? "HSL:1234",
        name: stop.name ?? "Kamppi",
        code: stop.code ?? "1234",
        vehicleMode: stop.vehicleMode ?? "BUS",
        parentStation: stop.parentStation ?? null,
      },
    },
  };
}

function createStopTime({ pickupType = 0, mode = "BUS", line = "550", seconds = 60 } = {}) {
  return {
    serviceDay: Math.floor(Date.now() / 1000) + 120,
    realtimeDeparture: seconds,
    scheduledDeparture: seconds,
    pickupType,
    headsign: "Pasila",
    stop: {
      gtfsId: "HSL:1234",
      name: "Kamppi",
      code: "1234",
      platformCode: "A",
    },
    trip: {
      route: {
        mode,
        shortName: line,
      },
    },
  };
}

async function runHandler({ method = "GET", query = {}, graphqlRequest }) {
  const handler = createDeparturesHandler({ graphqlRequest, logError: () => {} });
  const req = createMockRequest({ method, query });
  const res = createMockResponse();
  await handler(req, res);
  return res;
}

const featureText = `
Feature: Departures API behavior

Scenario: Reject non-GET methods
  Given a departures request with method "POST"
  When the departures API is called
  Then the departures response status is 405
  And the departures error message is "Method not allowed"
  And the allow header equals "GET"

Scenario: Reject invalid coordinates
  Given a departures GET query with lat "bad", lon "24.9", and mode "RAIL"
  When the departures API is called
  Then the departures response status is 400
  And the departures error message is "Invalid lat/lon"

Scenario: Reject whitespace coordinates
  Given a departures GET query with lat "   ", lon "24.9", and mode "RAIL"
  When the departures API is called
  Then the departures response status is 400
  And the departures error message is "Invalid lat/lon"

Scenario: Reject invalid mode
  Given a departures GET query with lat "60.17", lon "24.9", and mode "PLANE"
  When the departures API is called
  Then the departures response status is 400
  And the departures error message is "Invalid mode"

Scenario: Reject invalid result limits
  Given a departures GET query with lat "60.17", lon "24.9", mode "BUS", and results "0"
  When the departures API is called
  Then the departures response status is 400
  And the departures error message is "Invalid results"

Scenario: Return sanitized 500 on upstream failure
  Given upstream Digitransit throws "boom"
  And a departures GET query with lat "60.17", lon "24.9", and mode "RAIL"
  When the departures API is called
  Then the departures response status is 500
  And the departures error message is "Temporary server error. Please try again."

Scenario: Return no nearby bus stops payload
  Given nearby stops are empty for mode "BUS"
  And a departures GET query with lat "60.17", lon "24.9", and mode "BUS"
  When the departures API is called
  Then the departures response status is 200
  And the departures payload message is "No nearby bus stops"
  And the departures payload selected stop id is null

Scenario: Return no nearby train stations payload
  Given nearby stops are empty for mode "RAIL"
  And a departures GET query with lat "60.17", lon "24.9", and mode "RAIL"
  When the departures API is called
  Then the departures response status is 200
  And the departures payload message is "No nearby train stations"

Scenario: Ignore non-boardable stop times while returning boardable departures
  Given a BUS stop selection with one boardable and one non-boardable departure
  And a departures GET query with lat "60.17", lon "24.9", and mode "BUS"
  When the departures API is called
  Then the departures response status is 200
  And the departures payload contains 1 departure
  And the first departure line equals "550"

Scenario: Resolve selected stop by member stop id
  Given a BUS stop group with member stop ids "HSL:1234|HSL:5678"
  And a departures GET query with lat "60.17", lon "24.9", mode "BUS", and stopId "HSL:5678"
  When the departures API is called
  Then the departures response status is 200
  And the departures payload selected stop id is "HSL:1234"

Scenario: Return nearby rail station departures via stop mode
  Given a RAIL stop group with parent station "HSL:STN" named "Central Station"
  And a departures GET query with lat "60.17", lon "24.9", and mode "RAIL"
  When the departures API is called
  Then the departures response status is 200
  And the departures payload station type is "stop"
  And the departures payload contains 1 departure

Scenario: Return nearby rail stop departures when no parent station exists
  Given a RAIL stop group without parent station named "Pasilan asema"
  And a departures GET query with lat "60.17", lon "24.9", and mode "RAIL"
  When the departures API is called
  Then the departures response status is 200
  And the departures payload station type is "stop"
  And the departures payload contains 1 departure

Scenario: Return stop-mode fallback when nearby stops cannot be grouped
  Given nearby BUS stops have missing names
  And a departures GET query with lat "60.17", lon "24.9", and mode "BUS"
  When the departures API is called
  Then the departures response status is 200
  And the departures payload message is "No nearby bus stops"
`;

defineFeature(test, featureText, {
  createWorld: () => ({
    req: { method: "GET", query: {} },
    graphqlRequest: async () => ({ stopsByRadius: { edges: [] } }),
    response: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given a departures request with method "([^"]*)"$/,
      run: ({ args, world }) => {
        world.req.method = args[0];
        world.req.query = {};
      },
    },
    {
      pattern: /^Given a departures GET query with lat "([^"]*)", lon "([^"]*)", and mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.req = {
          method: "GET",
          query: {
            lat: args[0],
            lon: args[1],
            mode: args[2],
          },
        };
      },
    },
    {
      pattern: /^Given a departures GET query with lat "([^"]*)", lon "([^"]*)", mode "([^"]*)", and results "([^"]*)"$/,
      run: ({ args, world }) => {
        world.req = {
          method: "GET",
          query: {
            lat: args[0],
            lon: args[1],
            mode: args[2],
            results: args[3],
          },
        };
      },
    },
    {
      pattern: /^Given a departures GET query with lat "([^"]*)", lon "([^"]*)", mode "([^"]*)", and stopId "([^"]*)"$/,
      run: ({ args, world }) => {
        world.req = {
          method: "GET",
          query: {
            lat: args[0],
            lon: args[1],
            mode: args[2],
            stopId: args[3],
          },
        };
      },
    },
    {
      pattern: /^Given upstream Digitransit throws "([^"]*)"$/,
      run: ({ args, world }) => {
        world.graphqlRequest = async () => {
          throw new Error(args[0]);
        };
      },
    },
    {
      pattern: /^Given nearby stops are empty for mode "([^"]*)"$/,
      run: ({ args, world }) => {
        const upstreamMode = args[0] === "METRO" ? "SUBWAY" : args[0];
        world.graphqlRequest = async () => ({
          stopsByRadius: {
            edges: [createStopEdge({ stop: { vehicleMode: upstreamMode } })].filter(
              () => upstreamMode === "NONE"
            ),
          },
        });
      },
    },
    {
      pattern: /^Given a BUS stop selection with one boardable and one non-boardable departure$/,
      run: ({ world }) => {
        let callCount = 0;
        world.graphqlRequest = async () => {
          callCount += 1;
          if (callCount === 1) {
            return {
              stopsByRadius: {
                edges: [createStopEdge({ stop: { vehicleMode: "BUS" } })],
              },
            };
          }
          return {
            s0: {
              name: "Kamppi",
              platformCode: "A",
              stoptimesWithoutPatterns: [
                createStopTime({ pickupType: 0, line: "550", seconds: 60 }),
                createStopTime({ pickupType: "NONE", line: "550", seconds: 120 }),
              ],
            },
          };
        };
      },
    },
    {
      pattern: /^Given a BUS stop group with member stop ids "([^"]*)"$/,
      run: ({ args, world }) => {
        const memberIds = args[0].split("|");
        let callCount = 0;
        world.graphqlRequest = async () => {
          callCount += 1;
          if (callCount === 1) {
            return {
              stopsByRadius: {
                edges: memberIds.map((gtfsId, index) =>
                  createStopEdge({
                    distance: 50 + index,
                    stop: {
                      gtfsId,
                      vehicleMode: "BUS",
                      name: "Kamppi",
                      code: index === 0 ? "1234" : "1235",
                    },
                  })
                ),
              },
            };
          }
          return {
            s0: {
              name: "Kamppi",
              platformCode: "A",
              stoptimesWithoutPatterns: [createStopTime({ line: "550", seconds: 60 })],
            },
            s1: {
              name: "Kamppi",
              platformCode: "B",
              stoptimesWithoutPatterns: [createStopTime({ line: "551", seconds: 120 })],
            },
          };
        };
      },
    },
    {
      pattern: /^Given a RAIL stop group with parent station "([^"]*)" named "([^"]*)"$/,
      run: ({ args, world }) => {
        let callCount = 0;
        world.graphqlRequest = async () => {
          callCount += 1;
          if (callCount === 1) {
            return {
              stopsByRadius: {
                edges: [
                  createStopEdge({
                    stop: {
                      gtfsId: "HSL:0100",
                      vehicleMode: "RAIL",
                      name: args[1],
                      parentStation: { gtfsId: args[0], name: args[1] },
                    },
                  }),
                ],
              },
            };
          }
          return {
            s0: {
              stoptimesWithoutPatterns: [createStopTime({ mode: "RAIL", line: "I", seconds: 60 })],
            },
          };
        };
      },
    },
    {
      pattern: /^Given a RAIL stop group without parent station named "([^"]*)"$/,
      run: ({ args, world }) => {
        let callCount = 0;
        world.graphqlRequest = async () => {
          callCount += 1;
          if (callCount === 1) {
            return {
              stopsByRadius: {
                edges: [
                  createStopEdge({
                    stop: {
                      gtfsId: "HSL:0101",
                      vehicleMode: "RAIL",
                      name: args[0],
                      parentStation: null,
                    },
                  }),
                ],
              },
            };
          }
          return {
            s0: {
              platformCode: "7",
              stoptimesWithoutPatterns: [createStopTime({ mode: "RAIL", line: "P", seconds: 60 })],
            },
          };
        };
      },
    },
    {
      pattern: /^Given nearby BUS stops have missing names$/,
      run: ({ world }) => {
        world.graphqlRequest = async () => ({
          stopsByRadius: {
            edges: [
              createStopEdge({
                stop: {
                  gtfsId: "HSL:1234",
                  vehicleMode: "BUS",
                  name: "",
                  code: "1234",
                },
              }),
            ],
          },
        });
      },
    },
    {
      pattern: /^When the departures API is called$/,
      run: async ({ world }) => {
        world.response = await runHandler({
          method: world.req.method,
          query: world.req.query,
          graphqlRequest: world.graphqlRequest,
        });
      },
    },
    {
      pattern: /^Then the departures response status is (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.statusCode, Number(args[0]));
      },
    },
    {
      pattern: /^Then the departures error message is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.deepEqual(world.response.payload, { error: args[0] });
      },
    },
    {
      pattern: /^Then the allow header equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.headers.get("allow"), args[0]);
      },
    },
    {
      pattern: /^Then the departures payload message is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.payload?.message, args[0]);
      },
    },
    {
      pattern: /^Then the departures payload selected stop id is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.response.payload?.selectedStopId, null);
      },
    },
    {
      pattern: /^Then the departures payload selected stop id is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.payload?.selectedStopId, args[0]);
      },
    },
    {
      pattern: /^Then the departures payload contains (\d+) departure$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.payload?.station?.departures?.length, Number(args[0]));
      },
    },
    {
      pattern: /^Then the first departure line equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.payload?.station?.departures?.[0]?.line, args[0]);
      },
    },
    {
      pattern: /^Then the departures payload station type is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.payload?.station?.type, args[0]);
      },
    },
  ],
});
