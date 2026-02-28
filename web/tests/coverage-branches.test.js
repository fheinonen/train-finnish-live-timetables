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

Scenario: Parse METRO requested mode
  Given requested mode input "metro"
  When requested mode parsing executes
  Then requested mode parsing output equals "METRO"

Scenario: Parse null multi query input
  Given multi query input is null
  When multi query parsing executes
  Then multi query parsing output equals ""

Scenario: Parse null requested result limit as default
  Given requested result input is null and default 12
  When requested result parsing executes
  Then requested result parsing output equals 12

Scenario: Reject out-of-range requested result limit
  Given requested result raw value "61" and default 8
  When requested result parsing executes
  Then requested result parsing output is null

Scenario: Normalize numeric pickup type value
  Given pickup type numeric input 2
  When pickup normalization executes
  Then pickup normalization output equals 2

Scenario: Reject non-integer numeric pickup type value
  Given pickup type numeric input 2.5
  When pickup normalization executes
  Then pickup normalization output is null

Scenario: Normalize numeric-string pickup type value
  Given pickup type input "3"
  When pickup normalization executes
  Then pickup normalization output equals 3

Scenario: Normalize whitespace pickup type string as unknown enum
  Given pickup type input "   "
  When pickup normalization executes
  Then pickup normalization output equals 0

Scenario: Boardability defaults to true when pickup type is missing
  Given stop time without pickup type
  When boardability helper executes
  Then boardability helper output equals true

Scenario: Parse departure with fallback track and service line name
  Given stop time with missing line and platform and fallback track "B"
  When departure parsing executes for mode "BUS"
  Then parsed departure line equals "Service"
  And parsed departure track equals "B"

Scenario: Reject departure when service day is invalid
  Given stop time with invalid service day
  When departure parsing executes for mode "BUS"
  Then departure parsing output is null

Scenario: Reject departure when departure seconds are invalid
  Given stop time with invalid departure seconds
  When departure parsing executes for mode "BUS"
  Then departure parsing output is null

Scenario: Build filter options ignores blank fields and sorts ties alphabetically
  Given departures with line tie and blank values
  When filter options are built from helper
  Then helper line filter options equal "A:1|B:1"
  And helper destination filter options equal "Kamppi:1|Pasila:1"
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
      pattern: /^Given requested result input is null and default (\d+)$/,
      run: ({ args, world }) => {
        world.input.raw = null;
        world.input.defaultValue = Number(args[0]);
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
      pattern: /^Given pickup type numeric input (-?\d+(?:\.\d+)?)$/,
      run: ({ args, world }) => {
        world.input.pickup = Number(args[0]);
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
      pattern: /^Then pickup normalization output is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given stop time without pickup type$/,
      run: ({ world }) => {
        world.input.stopTime = {};
      },
    },
    {
      pattern: /^When boardability helper executes$/,
      run: ({ world }) => {
        world.output = departuresUtils.isBoardableStopTime(world.input.stopTime);
      },
    },
    {
      pattern: /^Then boardability helper output equals (true|false)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0] === "true");
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
        world.input.fallbackTrack = null;
      },
    },
    {
      pattern: /^Given stop time with missing line and platform and fallback track "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.stopTime = {
          serviceDay: 1_700_000_000,
          realtimeDeparture: 60,
          scheduledDeparture: 60,
          pickupType: 0,
          headsign: "Kamppi",
          stop: {
            gtfsId: "HSL:1",
            name: "Kamppi",
            code: "1",
            platformCode: "",
          },
          trip: { route: { mode: "BUS", shortName: "" } },
        };
        world.input.fallbackStop = null;
        world.input.fallbackTrack = args[0];
      },
    },
    {
      pattern: /^Given stop time with invalid service day$/,
      run: ({ world }) => {
        world.input.stopTime = {
          serviceDay: "bad",
          realtimeDeparture: 60,
          scheduledDeparture: 60,
          pickupType: 0,
          headsign: "Kamppi",
          stop: { gtfsId: "HSL:1", name: "Kamppi", code: "1" },
          trip: { route: { mode: "BUS", shortName: "550" } },
        };
        world.input.fallbackStop = null;
        world.input.fallbackTrack = null;
      },
    },
    {
      pattern: /^Given stop time with invalid departure seconds$/,
      run: ({ world }) => {
        world.input.stopTime = {
          serviceDay: 1_700_000_000,
          realtimeDeparture: "nan",
          scheduledDeparture: "nan",
          pickupType: 0,
          headsign: "Kamppi",
          stop: { gtfsId: "HSL:1", name: "Kamppi", code: "1" },
          trip: { route: { mode: "BUS", shortName: "550" } },
        };
        world.input.fallbackStop = null;
        world.input.fallbackTrack = null;
      },
    },
    {
      pattern: /^When departure parsing executes for mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.output = departuresUtils.parseDeparture(
          world.input.stopTime,
          world.input.fallbackTrack || null,
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
      pattern: /^Then parsed departure line equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.line, args[0]);
      },
    },
    {
      pattern: /^Then parsed departure track equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.track, args[0]);
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
      pattern: /^Given multi query input is null$/,
      run: ({ world }) => {
        world.input.multi = null;
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
    {
      pattern: /^Given departures with line tie and blank values$/,
      run: ({ world }) => {
        world.input.departures = [
          { line: "B", destination: "Kamppi" },
          { line: "A", destination: "Pasila" },
          { line: "", destination: " " },
        ];
      },
    },
    {
      pattern: /^When filter options are built from helper$/,
      run: ({ world }) => {
        world.output = departuresUtils.buildFilterOptions(world.input.departures);
      },
    },
    {
      pattern: /^Then helper line filter options equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const actual = world.output.lines.map((item) => `${item.value}:${item.count}`).join("|");
        assert.equal(actual, args[0]);
      },
    },
    {
      pattern: /^Then helper destination filter options equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const actual = world.output.destinations.map((item) => `${item.value}:${item.count}`).join("|");
        assert.equal(actual, args[0]);
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

Scenario: Derive no-nearby message by stop mode
  Given transport mode "METRO"
  When no-nearby stop message is requested
  Then no-nearby stop message equals "No nearby metro stops"

Scenario: Parse numeric departure coordinate inputs
  Given departure coordinate raw value 60.17
  When departure coordinate parsing executes
  Then parsed departure coordinate equals 60.17

Scenario: Reject out-of-range departures request coordinates
  Given departures request query with lat "91", lon "24.93", and mode "RAIL"
  When departures request parsing executes
  Then departures request parsing error equals "Invalid lat/lon"

Scenario: Filter and sort mode stops by mode while ignoring invalid nodes
  Given nearby mode-stop payload with invalid entries and mixed modes
  When mode stops are selected for mode "BUS"
  Then selected mode stop ids equal "HSL:2|HSL:1"

Scenario: Build selectable stop code fallback from grouped member codes
  Given grouped stops where nearest member has empty code
  When selectable stop groups are built
  Then first selectable stop code equals "2002"

Scenario: Parse invalid departure coordinate string
  Given departure coordinate raw string "abc"
  When departure coordinate string parsing executes
  Then parsed departure coordinate is null

Scenario: Select requested stop falls back to first available stop
  Given selectable stop list with ids "HSL:1|HSL:2"
  And requested stop id value "HSL:missing"
  When requested stop selection executes
  Then selected stop id equals "HSL:1"

Scenario: Select requested stop returns null for empty stop list
  Given selectable stop list is empty
  And requested stop id value "HSL:any"
  When requested stop selection executes
  Then selected stop is null

Scenario: Map selectable stop defaults missing member ids
  Given selectable stop mapping input without member ids
  When selectable stop mapping executes
  Then mapped selectable stop member ids equal "HSL:solo"

Scenario: Derive default result limit for non-bus mode
  Given default result limit mode input "RAIL"
  When default result limit helper executes
  Then default result limit equals 8

Scenario: Derive no-nearby message for tram mode
  Given transport mode "TRAM"
  When no-nearby stop message is requested
  Then no-nearby stop message equals "No nearby tram stops"

Scenario: Detect stop mode boolean values
  Given stop-mode check mode input "RAIL"
  When stop-mode check executes
  Then stop-mode check output equals true

Scenario: Translate upstream mode for metro and rail
  Given upstream mode input "METRO"
  When upstream mode helper executes
  Then upstream mode output equals "SUBWAY"
  Given upstream mode input "RAIL"
  When upstream mode helper executes
  Then upstream mode output equals "RAIL"

Scenario: Build stop-mode response fallback when no selectable stop survives grouping
  Given stop mode response helper input with ungrouppable stops
  When stop mode response helper executes
  Then stop mode fallback message equals "No nearby bus stops"

Scenario: Dedupe helper returns empty list for null input
  Given dedupe helper input is null
  When stop departures dedupe helper executes
  Then dedupe helper output count equals 0
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
    {
      pattern: /^Given departure coordinate raw value (-?\d+(?:\.\d+)?)$/,
      run: ({ args, world }) => {
        world.input.rawCoordinate = Number(args[0]);
      },
    },
    {
      pattern: /^When departure coordinate parsing executes$/,
      run: ({ world }) => {
        world.output = departuresApi.parseRequiredCoordinate(world.input.rawCoordinate);
      },
    },
    {
      pattern: /^Then parsed departure coordinate equals (-?\d+(?:\.\d+)?)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, Number(args[0]));
      },
    },
    {
      pattern: /^Given departures request query with lat "([^"]*)", lon "([^"]*)", and mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.requestQuery = {
          lat: args[0],
          lon: args[1],
          mode: args[2],
        };
      },
    },
    {
      pattern: /^When departures request parsing executes$/,
      run: ({ world }) => {
        world.output = departuresApi.parseDeparturesRequest(world.input.requestQuery);
      },
    },
    {
      pattern: /^Then departures request parsing error equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.error, args[0]);
      },
    },
    {
      pattern: /^Given nearby mode-stop payload with invalid entries and mixed modes$/,
      run: ({ world }) => {
        world.input.nearbyData = {
          stopsByRadius: {
            edges: [
              { node: null },
              {
                node: {
                  distance: 200,
                  stop: { gtfsId: "HSL:rail", vehicleMode: "RAIL" },
                },
              },
              {
                node: {
                  distance: 120,
                  stop: { gtfsId: "HSL:1", vehicleMode: "BUS" },
                },
              },
              {
                node: {
                  distance: 80,
                  stop: { gtfsId: "HSL:2", vehicleMode: "BUS" },
                },
              },
            ],
          },
        };
      },
    },
    {
      pattern: /^When mode stops are selected for mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.output = departuresApi.getModeStops(world.input.nearbyData, args[0]);
      },
    },
    {
      pattern: /^Then selected mode stop ids equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const actual = world.output.map((item) => item.stop.gtfsId).join("|");
        assert.equal(actual, args[0]);
      },
    },
    {
      pattern: /^Given grouped stops where nearest member has empty code$/,
      run: ({ world }) => {
        world.input.modeStops = [
          {
            distance: 90,
            stop: { gtfsId: "HSL:far", name: "Shared Stop", code: "2002" },
          },
          {
            distance: 20,
            stop: { gtfsId: "HSL:near", name: "Shared Stop", code: "" },
          },
        ];
      },
    },
    {
      pattern: /^Then first selectable stop code equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.[0]?.code, args[0]);
      },
    },
    {
      pattern: /^Given departure coordinate raw string "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.rawCoordinateString = args[0];
      },
    },
    {
      pattern: /^When departure coordinate string parsing executes$/,
      run: ({ world }) => {
        world.output = departuresApi.parseRequiredCoordinate(world.input.rawCoordinateString);
      },
    },
    {
      pattern: /^Then parsed departure coordinate is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given selectable stop list with ids "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.selectableStops = args[0].split("|").map((id, index) => ({
          id,
          name: `Stop ${index + 1}`,
          memberStopIds: [id],
        }));
      },
    },
    {
      pattern: /^Given selectable stop list is empty$/,
      run: ({ world }) => {
        world.input.selectableStops = [];
      },
    },
    {
      pattern: /^Given requested stop id value "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.requestedStopId = args[0];
      },
    },
    {
      pattern: /^When requested stop selection executes$/,
      run: ({ world }) => {
        world.output = departuresApi.selectRequestedStop(
          world.input.selectableStops,
          world.input.requestedStopId
        );
      },
    },
    {
      pattern: /^Then selected stop id equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.id, args[0]);
      },
    },
    {
      pattern: /^Then selected stop is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given selectable stop mapping input without member ids$/,
      run: ({ world }) => {
        world.input.selectableStops = [
          {
            id: "HSL:solo",
            name: "Solo",
            code: null,
            memberStopCodes: ["S1"],
            distance: 25,
          },
        ];
      },
    },
    {
      pattern: /^When selectable stop mapping executes$/,
      run: ({ world }) => {
        world.output = departuresApi.mapSelectableStops(world.input.selectableStops);
      },
    },
    {
      pattern: /^Given default result limit mode input "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.mode = args[0];
      },
    },
    {
      pattern: /^When default result limit helper executes$/,
      run: ({ world }) => {
        world.output = departuresApi.getDefaultResultLimit(world.input.mode);
      },
    },
    {
      pattern: /^Then default result limit equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, Number(args[0]));
      },
    },
    {
      pattern: /^Given stop-mode check mode input "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.mode = args[0];
      },
    },
    {
      pattern: /^When stop-mode check executes$/,
      run: ({ world }) => {
        world.output = departuresApi.isStopMode(world.input.mode);
      },
    },
    {
      pattern: /^Then stop-mode check output equals (true|false)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0] === "true");
      },
    },
    {
      pattern: /^Given upstream mode input "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.mode = args[0];
      },
    },
    {
      pattern: /^When upstream mode helper executes$/,
      run: ({ world }) => {
        world.output = departuresApi.getUpstreamMode(world.input.mode);
      },
    },
    {
      pattern: /^Then upstream mode output equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0]);
      },
    },
    {
      pattern: /^Given stop mode response helper input with ungrouppable stops$/,
      run: ({ world }) => {
        world.input.stopModeParams = {
          graphqlRequest: async () => {
            throw new Error("graphqlRequest should not run when no selectable stop exists");
          },
          mode: "BUS",
          upstreamMode: "BUS",
          modeStops: [
            {
              distance: 10,
              stop: { gtfsId: "HSL:1", name: "", code: "1" },
            },
          ],
          requestedResultLimit: 8,
          requestedLines: [],
          requestedDestinations: [],
          requestedStopId: "",
        };
      },
    },
    {
      pattern: /^When stop mode response helper executes$/,
      run: async ({ world }) => {
        world.output = await departuresApi.buildStopModeResponse(world.input.stopModeParams);
      },
    },
    {
      pattern: /^Then stop mode fallback message equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.message, args[0]);
      },
    },
    {
      pattern: /^Given dedupe helper input is null$/,
      run: ({ world }) => {
        world.input.departures = null;
      },
    },
    {
      pattern: /^When stop departures dedupe helper executes$/,
      run: ({ world }) => {
        world.output = departuresApi.dedupeStopDepartures(world.input.departures);
      },
    },
    {
      pattern: /^Then dedupe helper output count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
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

Scenario: Parse numeric geocode coordinate value
  Given geocode coordinate raw value 24.93
  When geocode coordinate parsing executes
  Then parsed geocode coordinate equals 24.93

Scenario: Normalize oversized geocode query text to maximum length
  Given geocode query text with 180 letters "q"
  When geocode query normalization executes
  Then normalized geocode query text length equals 140

Scenario: Score exact compact candidate match with strong boost
  Given scoring query text "Kamppi Center" and candidate label "Kamppi Center"
  When geocode candidate scoring executes
  Then geocode candidate score is at least 100

Scenario: Score compact-contained candidate match
  Given scoring query text "Kamppi Center Helsinki" and candidate label "Kamppi"
  When geocode candidate scoring executes
  Then geocode candidate score is greater than 0

Scenario: Rank tied candidates by confidence first
  Given tied ranking candidates with confidences 0.7 and 0.9
  When tied candidate ranking executes for query "Kamppi"
  Then top ranked candidate confidence equals 0.9

Scenario: Rank tied candidates by variant index when confidence is equal
  Given tied ranking candidates with equal confidence and variant indexes 2 and 0
  When tied candidate ranking executes for query "Kamppi"
  Then top ranked candidate variant index equals 0

Scenario: Rank fully identical tied candidates without dropping entries
  Given fully identical tied ranking candidates
  When tied candidate ranking executes for query "Kamppi"
  Then ranked candidate count equals 2

Scenario: Reject fuzzy token matches for too-short query fragments
  Given token match query token "ka" and label token "kamppi"
  When token matching executes
  Then token matching output equals false

Scenario: Accept token matches when label starts with query token
  Given token match query token "kamp" and label token "kamppi"
  When token matching executes
  Then token matching output equals true

Scenario: Accept token matches when query token contains long label token
  Given token match query token "kamppikeskus" and label token "keskus"
  When token matching executes
  Then token matching output equals true

Scenario: Apply missing-token penalty for unmatched strong query terms
  Given missing-token penalty query tokens "kamppi|arena" and label tokens "kamppi|helsinki"
  When missing-token penalty is computed
  Then missing-token penalty is greater than 0

Scenario: Count strong token matches while ignoring weak municipality tokens
  Given strong-token counting query tokens "helsinki|kamppi" and label tokens "kamppi|helsinki"
  When strong-token match count is computed
  Then strong-token match count equals 1

Scenario: Return no ambiguity choices when top match has zero strong tokens
  Given ranked candidates with zero strong token matches at top
  When ambiguity choices are built
  Then ambiguity choice count equals 0

Scenario: Clamp parsed geocode confidence into one
  Given geocode feature with confidence 1.5
  When geocode feature parsing executes
  Then parsed geocode confidence equals 1

Scenario: Collect candidates from multiple geocode query variants
  Given geocode candidate collection with variants "kamppi|pasila"
  When geocode candidate collection executes
  Then collected geocode candidate count equals 2

Scenario: Resolve geocode match returns no location when validated candidates are empty
  Given geocode resolution input with no validated candidates
  When geocode match resolution executes
  Then geocode resolution has no location
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
      pattern: /^Given geocode coordinate raw value (-?\d+(?:\.\d+)?)$/,
      run: ({ args, world }) => {
        world.input.geocodeCoordinateRaw = Number(args[0]);
      },
    },
    {
      pattern: /^When geocode coordinate parsing executes$/,
      run: ({ world }) => {
        world.output = geocodeHelpers.parseCoordinate(world.input.geocodeCoordinateRaw);
      },
    },
    {
      pattern: /^Then parsed geocode coordinate equals (-?\d+(?:\.\d+)?)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, Number(args[0]));
      },
    },
    {
      pattern: /^Given geocode query text with (\d+) letters "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.rawGeocodeQuery = String(args[1]).repeat(Number(args[0]));
      },
    },
    {
      pattern: /^When geocode query normalization executes$/,
      run: ({ world }) => {
        world.output = geocodeHelpers.normalizeGeocodeQuery(world.input.rawGeocodeQuery);
      },
    },
    {
      pattern: /^Then normalized geocode query text length equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
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
      pattern: /^Given scoring query text "([^"]*)" and candidate label "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.scoreQueryMatch = geocodeHelpers.normalizeForMatch(args[0], 140);
        world.input.scoreCandidate = {
          label: args[1],
          confidence: 1,
          variantIndex: 0,
        };
      },
    },
    {
      pattern: /^When geocode candidate scoring executes$/,
      run: ({ world }) => {
        world.output = geocodeHelpers.scoreCandidate(world.input.scoreQueryMatch, world.input.scoreCandidate);
      },
    },
    {
      pattern: /^Then geocode candidate score is at least (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.ok(world.output >= Number(args[0]));
      },
    },
    {
      pattern: /^Then geocode candidate score is greater than (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.ok(world.output > Number(args[0]));
      },
    },
    {
      pattern: /^Given tied ranking candidates with confidences ([\d.]+) and ([\d.]+)$/,
      run: ({ args, world }) => {
        world.input.rankingCandidates = [
          {
            label: "Kamppi",
            confidence: Number(args[0]),
            variantIndex: 0,
          },
          {
            label: "Kamppi",
            confidence: Number(args[1]),
            variantIndex: 1,
          },
        ];
      },
    },
    {
      pattern: /^Given tied ranking candidates with equal confidence and variant indexes (\d+) and (\d+)$/,
      run: ({ args, world }) => {
        world.input.rankingCandidates = [
          {
            label: "Kamppi Center",
            confidence: 1,
            variantIndex: Number(args[0]),
          },
          {
            label: "Kamppi",
            confidence: 1,
            variantIndex: Number(args[1]),
          },
        ];
      },
    },
    {
      pattern: /^Given fully identical tied ranking candidates$/,
      run: ({ world }) => {
        world.input.rankingCandidates = [
          {
            label: "Kamppi",
            confidence: 1,
            variantIndex: 0,
          },
          {
            label: "Kamppi",
            confidence: 1,
            variantIndex: 0,
          },
        ];
      },
    },
    {
      pattern: /^When tied candidate ranking executes for query "([^"]*)"$/,
      run: ({ args, world }) => {
        world.output = geocodeHelpers.rankCandidatesForQuery(world.input.rankingCandidates, args[0]);
      },
    },
    {
      pattern: /^Then top ranked candidate confidence equals ([\d.]+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.[0]?.candidate?.confidence, Number(args[0]));
      },
    },
    {
      pattern: /^Then top ranked candidate variant index equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.[0]?.candidate?.variantIndex, Number(args[0]));
      },
    },
    {
      pattern: /^Then ranked candidate count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given token match query token "([^"]*)" and label token "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.queryToken = args[0];
        world.input.labelToken = args[1];
      },
    },
    {
      pattern: /^When token matching executes$/,
      run: ({ world }) => {
        world.output = geocodeHelpers.tokenMatches(world.input.queryToken, world.input.labelToken);
      },
    },
    {
      pattern: /^Then token matching output equals (true|false)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0] === "true");
      },
    },
    {
      pattern: /^Given missing-token penalty query tokens "([^"]*)" and label tokens "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.queryTokens = args[0].split("|").filter(Boolean);
        world.input.labelTokens = args[1].split("|").filter(Boolean);
      },
    },
    {
      pattern: /^When missing-token penalty is computed$/,
      run: ({ world }) => {
        const scoredCandidate = {
          label: world.input.labelTokens.join(" "),
          confidence: null,
          variantIndex: 0,
        };
        const baselineQueryTokens = [world.input.queryTokens[0]].filter(Boolean);
        const baseline = geocodeHelpers.scoreCandidate(
          {
            text: baselineQueryTokens.join(" "),
            tokens: baselineQueryTokens,
            compact: baselineQueryTokens.join(""),
          },
          scoredCandidate
        );
        const penalized = geocodeHelpers.scoreCandidate(
          {
            text: world.input.queryTokens.join(" "),
            tokens: world.input.queryTokens,
            compact: world.input.queryTokens.join(""),
          },
          scoredCandidate
        );
        world.output = baseline - penalized;
      },
    },
    {
      pattern: /^Then missing-token penalty is greater than (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.ok(Number.isFinite(world.output));
        assert.ok(world.output > Number(args[0]));
      },
    },
    {
      pattern: /^Given strong-token counting query tokens "([^"]*)" and label tokens "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.queryTokens = args[0].split("|").filter(Boolean);
        world.input.labelTokens = args[1].split("|").filter(Boolean);
      },
    },
    {
      pattern: /^When strong-token match count is computed$/,
      run: ({ world }) => {
        world.output = geocodeHelpers.countStrongTokenMatches(
          world.input.queryTokens,
          world.input.labelTokens
        );
      },
    },
    {
      pattern: /^Then strong-token match count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, Number(args[0]));
      },
    },
    {
      pattern: /^Given ranked candidates with zero strong token matches at top$/,
      run: ({ world }) => {
        world.input.rankedCandidates = [
          {
            candidate: { lat: 60.17, lon: 24.93, label: "A", confidence: 0.8 },
            strongTokenMatches: 0,
            score: 100,
          },
          {
            candidate: { lat: 60.18, lon: 24.94, label: "B", confidence: 0.7 },
            strongTokenMatches: 0,
            score: 99,
          },
        ];
      },
    },
    {
      pattern: /^When ambiguity choices are built$/,
      run: ({ world }) => {
        world.output = geocodeHelpers.buildAmbiguousChoices(world.input.rankedCandidates);
      },
    },
    {
      pattern: /^Then ambiguity choice count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given geocode feature with confidence ([\d.]+)$/,
      run: ({ args, world }) => {
        world.input.feature = {
          geometry: { coordinates: [24.93, 60.17] },
          properties: {
            label: "Kamppi, Helsinki",
            confidence: Number(args[0]),
          },
        };
      },
    },
    {
      pattern: /^When geocode feature parsing executes$/,
      run: ({ world }) => {
        world.output = geocodeHelpers.parseFeature(world.input.feature);
      },
    },
    {
      pattern: /^Then parsed geocode confidence equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.confidence, Number(args[0]));
      },
    },
    {
      pattern: /^Given geocode candidate collection with variants "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.textVariants = args[0].split("|").filter(Boolean);
        world.input.fetchCallIndex = 0;
        world.input.fetchImpl = async () => {
          const index = world.input.fetchCallIndex;
          world.input.fetchCallIndex += 1;
          return createJsonResponse({
            features: [
              {
                geometry: { coordinates: [24.93 + index * 0.01, 60.17 + index * 0.01] },
                properties: { label: `Variant ${index + 1}`, confidence: 0.9 },
              },
            ],
          });
        };
        world.input.getApiKey = () => "ok";
      },
    },
    {
      pattern: /^When geocode candidate collection executes$/,
      run: async ({ world }) => {
        world.output = await geocodeHelpers.collectGeocodeCandidates({
          textVariants: world.input.textVariants,
          biasLat: 60.17,
          biasLon: 24.93,
          lang: "fi",
          fetchImpl: world.input.fetchImpl,
          getApiKey: world.input.getApiKey,
        });
      },
    },
    {
      pattern: /^Then collected geocode candidate count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given geocode resolution input with no validated candidates$/,
      run: ({ world }) => {
        world.input.text = "kamppi";
        world.input.textVariants = ["kamppi"];
        world.input.fetchImpl = async () => createJsonResponse({ features: [] });
        world.input.graphqlRequestImpl = async () => ({ stopsByRadius: { edges: [] } });
        world.input.getApiKey = () => "ok";
      },
    },
    {
      pattern: /^When geocode match resolution executes$/,
      run: async ({ world }) => {
        world.output = await geocodeHelpers.resolveGeocodeMatch({
          text: world.input.text,
          textVariants: world.input.textVariants,
          biasLat: 60.17,
          biasLon: 24.93,
          lang: "fi",
          fetchImpl: world.input.fetchImpl,
          graphqlRequestImpl: world.input.graphqlRequestImpl,
          getApiKey: world.input.getApiKey,
        });
      },
    },
    {
      pattern: /^Then geocode resolution has no location$/,
      run: ({ assert, world }) => {
        assert.equal(world.output?.location, null);
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
