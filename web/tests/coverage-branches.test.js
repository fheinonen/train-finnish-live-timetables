const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const departuresUtils = require("../api/lib/departures-utils");
const departuresApi = require("../api/v1/departures")._private;
const geocodeHelpers = require("../api/v1/geocode")._private;
const clientErrorHelpers = require("../api/v1/client-error")._private;

function createJsonResponse(body, { status = 200, ok = true } = {}) {
  return {
    status,
    ok,
    async json() {
      return body;
    },
  };
}

const departuresUtilsFeature = `
Feature: Additional departure utility branches

Scenario: Parse explicit requested modes
  Given requested mode input "tram"
  When requested mode parsing executes
  Then requested mode parsing output equals "TRAM"

Scenario: Reject unsupported requested modes
  Given requested mode input "plane"
  When requested mode parsing executes
  Then requested mode parsing output is null

Scenario: Parse empty requested result limit as default
  Given requested result raw value "" and default 8
  When requested result parsing executes
  Then requested result parsing output equals 8

Scenario: Parse valid requested result limit integer
  Given requested result raw value "16" and default 8
  When requested result parsing executes
  Then requested result parsing output equals 16

Scenario: Reject non-integer requested result limit
  Given requested result raw value "16.5" and default 8
  When requested result parsing executes
  Then requested result parsing output is null

Scenario: Normalize pickup type phone agency to enum 2
  Given pickup type input "PHONE_AGENCY"
  When pickup normalization executes
  Then pickup normalization output equals 2

Scenario: Normalize pickup type coordinate with driver to enum 3
  Given pickup type input "COORDINATE_WITH_DRIVER"
  When pickup normalization executes
  Then pickup normalization output equals 3

Scenario: Normalize unknown pickup string to enum 0
  Given pickup type input "SOMETHING_ELSE"
  When pickup normalization executes
  Then pickup normalization output equals 0

Scenario: Parse departure with fallback stop metadata
  Given a stop time with missing stop metadata and scheduled-only departure
  When departure parsing executes for mode "BUS"
  Then parsed departure stop id equals "HSL:fall"
  And parsed departure stop name equals "Fallback Stop"

Scenario: Reject departures with mismatched route mode
  Given a stop time with route mode "TRAM"
  When departure parsing executes for mode "BUS"
  Then departure parsing output is null

Scenario: Parse comma-separated multi query arrays
  Given multi query array values "550,551|551,M2"
  When multi query parsing executes
  Then multi query parsing output equals "550|551|M2"
`;

defineFeature(test, departuresUtilsFeature, {
  createWorld: () => ({
    input: {},
    output: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given requested mode input "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.mode = args[0];
      },
    },
    {
      pattern: /^When requested mode parsing executes$/,
      run: ({ world }) => {
        world.output = departuresUtils.parseRequestedMode(world.input.mode);
      },
    },
    {
      pattern: /^Then requested mode parsing output equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0]);
      },
    },
    {
      pattern: /^Then requested mode parsing output is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given requested result raw value "([^"]*)" and default (\d+)$/,
      run: ({ args, world }) => {
        world.input.raw = args[0];
        world.input.defaultValue = Number(args[1]);
      },
    },
    {
      pattern: /^When requested result parsing executes$/,
      run: ({ world }) => {
        world.output = departuresUtils.parseRequestedResultLimit(
          world.input.raw,
          world.input.defaultValue
        );
      },
    },
    {
      pattern: /^Then requested result parsing output equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, Number(args[0]));
      },
    },
    {
      pattern: /^Then requested result parsing output is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given pickup type input "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.pickup = args[0];
      },
    },
    {
      pattern: /^When pickup normalization executes$/,
      run: ({ world }) => {
        world.output = departuresUtils.normalizePickDropType(world.input.pickup);
      },
    },
    {
      pattern: /^Then pickup normalization output equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, Number(args[0]));
      },
    },
    {
      pattern: /^Given a stop time with missing stop metadata and scheduled-only departure$/,
      run: ({ world }) => {
        world.input.stopTime = {
          serviceDay: 1_700_000_000,
          realtimeDeparture: "nan",
          scheduledDeparture: 120,
          pickupType: 0,
          headsign: "Kamppi",
          stop: {},
          trip: { route: { mode: "BUS", shortName: "550" } },
        };
        world.input.fallbackStop = {
          gtfsId: "HSL:fall",
          code: "FALL",
          name: "Fallback Stop",
        };
      },
    },
    {
      pattern: /^When departure parsing executes for mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.output = departuresUtils.parseDeparture(
          world.input.stopTime,
          null,
          args[0],
          world.input.fallbackStop
        );
      },
    },
    {
      pattern: /^Then parsed departure stop id equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.stopId, args[0]);
      },
    },
    {
      pattern: /^Then parsed departure stop name equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.stopName, args[0]);
      },
    },
    {
      pattern: /^Given a stop time with route mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.stopTime = {
          serviceDay: 1_700_000_000,
          realtimeDeparture: 120,
          scheduledDeparture: 120,
          pickupType: 0,
          headsign: "Kamppi",
          stop: { gtfsId: "HSL:1", name: "Kamppi", code: "1" },
          trip: { route: { mode: args[0], shortName: "10" } },
        };
        world.input.fallbackStop = null;
      },
    },
    {
      pattern: /^Then departure parsing output is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given multi query array values "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.multi = args[0].split("|");
      },
    },
    {
      pattern: /^When multi query parsing executes$/,
      run: ({ world }) => {
        world.output = departuresUtils.parseMultiQueryParam(world.input.multi);
      },
    },
    {
      pattern: /^Then multi query parsing output equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.join("|"), args[0]);
      },
    },
  ],
});

const departuresHelpersFeature = `
Feature: Departures API helper branches

Scenario: Group selectable stops by name and pick nearest canonical stop
  Given two BUS stops with same name and different distances
  When selectable stop groups are built
  Then canonical selectable stop id equals "HSL:near"
  And grouped member stop codes equal "1000|1001"

Scenario: API selectable stops include grouped member stop ids
  Given two BUS stops with same name and different distances
  When selectable stop groups are built
  And selectable stops are mapped for API response
  Then mapped selectable stop member ids equal "HSL:far|HSL:near"

Scenario: Filter and sort upcoming departures
  Given departures with one past and two future timestamps
  When upcoming departures are filtered
  Then upcoming departure count equals 2

Scenario: Dedupe repeated departures by line destination time track and stop
  Given duplicated departures payload list
  When departures are deduplicated
  Then deduplicated departure count equals 1

Scenario: Filter departures by selected line and destination
  Given departures with mixed lines and destinations
  And selected line filters "550"
  And selected destination filters "Kamppi"
  When departure filters are applied
  Then filtered departure count equals 1

Scenario: Build nearest rail candidate from parent station and stop
  Given rail stops with parent station and plain stop
  When nearest rail candidate is selected
  Then nearest rail candidate kind equals "station"

Scenario: Derive no-nearby message by stop mode
  Given transport mode "METRO"
  When no-nearby stop message is requested
  Then no-nearby stop message equals "No nearby metro stops"
`;

defineFeature(test, departuresHelpersFeature, {
  createWorld: () => ({
    input: {},
    output: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given two BUS stops with same name and different distances$/,
      run: ({ world }) => {
        world.input.modeStops = [
          {
            distance: 80,
            stop: {
              gtfsId: "HSL:far",
              name: "Kamppi",
              code: "1001",
            },
          },
          {
            distance: 50,
            stop: {
              gtfsId: "HSL:near",
              name: "Kamppi",
              code: "1000",
            },
          },
        ];
      },
    },
    {
      pattern: /^When selectable stop groups are built$/,
      run: ({ world }) => {
        world.output = departuresApi.buildSelectableStops(world.input.modeStops);
      },
    },
    {
      pattern: /^Then canonical selectable stop id equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output[0].id, args[0]);
      },
    },
    {
      pattern: /^Then grouped member stop codes equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output[0].memberStopCodes.join("|"), args[0]);
      },
    },
    {
      pattern: /^When selectable stops are mapped for API response$/,
      run: ({ world }) => {
        world.output = departuresApi.mapSelectableStops(world.output);
      },
    },
    {
      pattern: /^Then mapped selectable stop member ids equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(
          [...(world.output[0].memberStopIds || [])].sort((a, b) => a.localeCompare(b)).join("|"),
          args[0]
        );
      },
    },
    {
      pattern: /^Given departures with one past and two future timestamps$/,
      run: ({ world }) => {
        const now = Date.now();
        world.input.now = now;
        world.input.departures = [
          { departureIso: new Date(now - 60_000).toISOString() },
          { departureIso: new Date(now + 120_000).toISOString() },
          { departureIso: new Date(now + 60_000).toISOString() },
        ];
      },
    },
    {
      pattern: /^When upcoming departures are filtered$/,
      run: ({ world }) => {
        world.output = departuresApi.filterUpcoming(world.input.departures, world.input.now);
      },
    },
    {
      pattern: /^Then upcoming departure count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given duplicated departures payload list$/,
      run: ({ world }) => {
        world.input.departures = [
          {
            line: "550",
            destination: "Kamppi",
            departureIso: "2026-01-01T00:00:00.000Z",
            track: "A",
            stopId: "HSL:1",
          },
          {
            line: "550",
            destination: "Kamppi",
            departureIso: "2026-01-01T00:00:00.000Z",
            track: "A",
            stopId: "HSL:1",
          },
        ];
      },
    },
    {
      pattern: /^When departures are deduplicated$/,
      run: ({ world }) => {
        world.output = departuresApi.dedupeStopDepartures(world.input.departures);
      },
    },
    {
      pattern: /^Then deduplicated departure count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given departures with mixed lines and destinations$/,
      run: ({ world }) => {
        world.input.departures = [
          { line: "550", destination: "Kamppi" },
          { line: "551", destination: "Kamppi" },
          { line: "550", destination: "Pasila" },
        ];
      },
    },
    {
      pattern: /^Given selected line filters "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.lines = args[0] ? args[0].split("|") : [];
      },
    },
    {
      pattern: /^Given selected destination filters "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.destinations = args[0] ? args[0].split("|") : [];
      },
    },
    {
      pattern: /^When departure filters are applied$/,
      run: ({ world }) => {
        world.output = departuresApi.filterDeparturesBySelections(
          world.input.departures,
          world.input.lines,
          world.input.destinations
        );
      },
    },
    {
      pattern: /^Then filtered departure count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given rail stops with parent station and plain stop$/,
      run: ({ world }) => {
        world.input.modeStops = [
          {
            distance: 100,
            stop: {
              gtfsId: "HSL:STOP1",
              name: "Stop 1",
              parentStation: { gtfsId: "HSL:STATION", name: "Station" },
            },
          },
          {
            distance: 140,
            stop: {
              gtfsId: "HSL:STOP2",
              name: "Stop 2",
              parentStation: null,
            },
          },
        ];
      },
    },
    {
      pattern: /^When nearest rail candidate is selected$/,
      run: ({ world }) => {
        world.output = departuresApi.getNearestRailCandidate(world.input.modeStops);
      },
    },
    {
      pattern: /^Then nearest rail candidate kind equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.kind, args[0]);
      },
    },
    {
      pattern: /^Given transport mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.mode = args[0];
      },
    },
    {
      pattern: /^When no-nearby stop message is requested$/,
      run: ({ world }) => {
        world.output = departuresApi.getNoNearbyStopsMessage(world.input.mode);
      },
    },
    {
      pattern: /^Then no-nearby stop message equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0]);
      },
    },
  ],
});

const geocodeAndClientErrorFeature = `
Feature: Geocode and client error helper branches

Scenario: Normalize valid language tag
  Given language input "fi-FI"
  When geocode language normalization executes
  Then geocode language normalization output equals "fi-FI"

Scenario: Build geocoding URL with language parameter
  Given geocoding URL input text "kamppi", lat 60.17, lon 24.93, and language "fi"
  When geocoding URL is built
  Then geocoding URL contains "lang=fi"

Scenario: Fail geocode when API key is missing
  Given geocode fetch runtime that returns empty features
  And geocode API key value is missing
  When direct geocode execution runs
  Then direct geocode execution throws "Missing DIGITRANSIT_API_KEY environment variable."

Scenario: Fail geocode on invalid JSON
  Given geocode fetch runtime with invalid JSON response
  And geocode API key value is "ok"
  When direct geocode execution runs
  Then direct geocode execution throws "Digitransit geocoding invalid response (HTTP 200)"

Scenario: Fail geocode on non-OK HTTP response
  Given geocode fetch runtime with HTTP status 500
  And geocode API key value is "ok"
  When direct geocode execution runs
  Then direct geocode execution throws "Digitransit geocoding HTTP 500"

Scenario: Return parsed geocode candidates
  Given geocode fetch runtime with one valid feature
  And geocode API key value is "ok"
  When direct geocode execution runs
  Then direct geocode execution returns 1 candidate

Scenario: Validate nearby HSL stop detection false path
  Given nearby stop validation runtime returns no stops
  When nearby HSL stop detection executes
  Then nearby HSL stop detection output equals false

Scenario: Reuse stop validation cache for duplicate candidate coordinates
  Given candidate list with duplicate coordinates
  When HSL candidate filtering executes with cached checker
  Then nearby stop checker call count equals 1

Scenario: Truncate long client error strings
  Given an oversized client error message string
  When client error safe string executes with limit 4
  Then client error safe string output equals "xxxx"

Scenario: Truncate client error context arrays
  Given client error context array with 40 items
  When client error context sanitization executes
  Then sanitized context array length equals 30
`;

defineFeature(test, geocodeAndClientErrorFeature, {
  createWorld: () => ({
    input: {},
    output: null,
    error: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given language input "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.language = args[0];
      },
    },
    {
      pattern: /^When geocode language normalization executes$/,
      run: ({ world }) => {
        world.output = geocodeHelpers.normalizeLanguage(world.input.language);
      },
    },
    {
      pattern: /^Then geocode language normalization output equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0]);
      },
    },
    {
      pattern: /^Given geocoding URL input text "([^"]*)", lat ([\d.]+), lon ([\d.]+), and language "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.urlParams = {
          text: args[0],
          biasLat: Number(args[1]),
          biasLon: Number(args[2]),
          lang: args[3],
        };
      },
    },
    {
      pattern: /^When geocoding URL is built$/,
      run: ({ world }) => {
        world.output = geocodeHelpers.getGeocodingUrl(world.input.urlParams);
      },
    },
    {
      pattern: /^Then geocoding URL contains "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.ok(world.output.includes(args[0]));
      },
    },
    {
      pattern: /^Given geocode fetch runtime that returns empty features$/,
      run: ({ world }) => {
        world.input.fetchImpl = async () => createJsonResponse({ features: [] });
      },
    },
    {
      pattern: /^Given geocode API key value is missing$/,
      run: ({ world }) => {
        world.input.getApiKey = () => "";
      },
    },
    {
      pattern: /^Given geocode API key value is "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.getApiKey = () => args[0];
      },
    },
    {
      pattern: /^Given geocode fetch runtime with invalid JSON response$/,
      run: ({ world }) => {
        world.input.fetchImpl = async () => ({
          ok: true,
          status: 200,
          async json() {
            throw new Error("bad json");
          },
        });
      },
    },
    {
      pattern: /^Given geocode fetch runtime with HTTP status (\d+)$/,
      run: ({ args, world }) => {
        world.input.fetchImpl = async () => createJsonResponse({}, { ok: false, status: Number(args[0]) });
      },
    },
    {
      pattern: /^Given geocode fetch runtime with one valid feature$/,
      run: ({ world }) => {
        world.input.fetchImpl = async () =>
          createJsonResponse({
            features: [
              {
                geometry: { coordinates: [24.93, 60.17] },
                properties: { label: "Kamppi, Helsinki", confidence: 0.9 },
              },
            ],
          });
      },
    },
    {
      pattern: /^When direct geocode execution runs$/,
      run: async ({ world }) => {
        world.output = null;
        world.error = null;
        try {
          world.output = await geocodeHelpers.geocode("kamppi", 60.17, 24.93, "fi", {
            fetchImpl: world.input.fetchImpl,
            getApiKey: world.input.getApiKey,
          });
        } catch (error) {
          world.error = error;
        }
      },
    },
    {
      pattern: /^Then direct geocode execution throws "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.error?.message, args[0]);
      },
    },
    {
      pattern: /^Then direct geocode execution returns (\d+) candidate$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.error, null);
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given nearby stop validation runtime returns no stops$/,
      run: ({ world }) => {
        world.input.graphqlRequestImpl = async () => ({ stopsByRadius: { edges: [] } });
      },
    },
    {
      pattern: /^When nearby HSL stop detection executes$/,
      run: async ({ world }) => {
        world.output = await geocodeHelpers.hasNearbyHslStop(60.17, 24.93, {
          graphqlRequestImpl: world.input.graphqlRequestImpl,
        });
      },
    },
    {
      pattern: /^Then nearby HSL stop detection output equals false$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, false);
      },
    },
    {
      pattern: /^Given candidate list with duplicate coordinates$/,
      run: ({ world }) => {
        world.input.candidates = [
          { lat: 60.17, lon: 24.93, label: "A" },
          { lat: 60.17, lon: 24.93, label: "B" },
        ];
      },
    },
    {
      pattern: /^When HSL candidate filtering executes with cached checker$/,
      run: async ({ world }) => {
        world.input.callCount = 0;
        world.output = await geocodeHelpers.filterHslValidCandidates(world.input.candidates, {
          hasNearbyStop: async () => {
            world.input.callCount += 1;
            return true;
          },
        });
      },
    },
    {
      pattern: /^Then nearby stop checker call count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.input.callCount, Number(args[0]));
      },
    },
    {
      pattern: /^Given an oversized client error message string$/,
      run: ({ world }) => {
        world.input.value = "xxxxxxxxxxxx";
      },
    },
    {
      pattern: /^When client error safe string executes with limit (\d+)$/,
      run: ({ args, world }) => {
        world.output = clientErrorHelpers.safeString(world.input.value, Number(args[0]));
      },
    },
    {
      pattern: /^Then client error safe string output equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0]);
      },
    },
    {
      pattern: /^Given client error context array with (\d+) items$/,
      run: ({ args, world }) => {
        world.input.contextArray = new Array(Number(args[0])).fill("x");
      },
    },
    {
      pattern: /^When client error context sanitization executes$/,
      run: ({ world }) => {
        world.output = clientErrorHelpers.sanitizeContext(world.input.contextArray);
      },
    },
    {
      pattern: /^Then sanitized context array length equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
  ],
});
