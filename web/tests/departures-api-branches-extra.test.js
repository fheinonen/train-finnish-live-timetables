const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const departuresApi = require("../api/v1/departures")._private;

function createModeStop(id, mode, distance, name = "Stop", code = "1001") {
  return {
    distance,
    stop: {
      gtfsId: id,
      vehicleMode: mode,
      name,
      code,
      parentStation: null,
    },
  };
}

const featureText = `
Feature: Extra departures API helper branch coverage

Scenario: BUS default result limit is 24
  Given default limit mode "BUS"
  When default limit helper runs
  Then default limit equals 24

Scenario: Bus no-nearby message is bus specific
  Given no-nearby message mode "BUS"
  When no-nearby message helper runs
  Then no-nearby message helper output equals "No nearby bus stops"

Scenario: BUS mode is recognized as stop mode
  Given stop-mode mode "BUS"
  When stop-mode helper runs
  Then stop-mode helper output equals true

Scenario: Requested stop can match member stop id
  Given selectable stop groups with member ids
  And requested stop id "HSL:member-2"
  When requested stop helper runs
  Then selected stop helper id equals "HSL:group"

Scenario: Parse departures request trims stopId and keeps defaults
  Given departures query with valid coordinates and stopId padding
  When departures request helper runs
  Then departures request helper has no error
  And parsed requested stop id equals "HSL:group"

Scenario: Destination-only filtering keeps matching departures
  Given departures list with mixed destinations
  And destination filters "Kamppi"
  When departures filter helper runs
  Then departures filter result count equals 2

Scenario: Selectable stop builder caps grouped results to eight stops
  Given nine unique nearby stops
  When selectable stop builder runs
  Then selectable stop builder output count equals 8

Scenario: Mode stop selector ignores stops without gtfs id
  Given nearby data with one missing stop id and one valid bus stop
  When mode stop selector runs for mode "BUS"
  Then mode stop selector count equals 1
`;

defineFeature(test, featureText, {
  createWorld: () => ({
    input: {},
    output: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given default limit mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.mode = args[0];
      },
    },
    {
      pattern: /^When default limit helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.getDefaultResultLimit(world.input.mode);
      },
    },
    {
      pattern: /^Then default limit equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, Number(args[0]));
      },
    },
    {
      pattern: /^Given no-nearby message mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.mode = args[0];
      },
    },
    {
      pattern: /^When no-nearby message helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.getNoNearbyStopsMessage(world.input.mode);
      },
    },
    {
      pattern: /^Then no-nearby message helper output equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0]);
      },
    },
    {
      pattern: /^Given stop-mode mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.mode = args[0];
      },
    },
    {
      pattern: /^When stop-mode helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.isStopMode(world.input.mode);
      },
    },
    {
      pattern: /^Then stop-mode helper output equals (true|false)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0] === "true");
      },
    },
    {
      pattern: /^Given selectable stop groups with member ids$/,
      run: ({ world }) => {
        world.input.stops = [
          { id: "HSL:group", memberStopIds: ["HSL:member-1", "HSL:member-2"] },
          { id: "HSL:other", memberStopIds: ["HSL:other"] },
        ];
      },
    },
    {
      pattern: /^Given requested stop id "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.requestedStopId = args[0];
      },
    },
    {
      pattern: /^When requested stop helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.selectRequestedStop(world.input.stops, world.input.requestedStopId);
      },
    },
    {
      pattern: /^Then selected stop helper id equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.id, args[0]);
      },
    },
    {
      pattern: /^Given departures query with valid coordinates and stopId padding$/,
      run: ({ world }) => {
        world.input.query = {
          lat: "60.17",
          lon: "24.93",
          mode: "BUS",
          stopId: "  HSL:group  ",
        };
      },
    },
    {
      pattern: /^When departures request helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.parseDeparturesRequest(world.input.query);
      },
    },
    {
      pattern: /^Then departures request helper has no error$/,
      run: ({ assert, world }) => {
        assert.equal(world.output?.error, null);
      },
    },
    {
      pattern: /^Then parsed requested stop id equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.params?.requestedStopId, args[0]);
      },
    },
    {
      pattern: /^Given departures list with mixed destinations$/,
      run: ({ world }) => {
        world.input.departures = [
          { line: "550", destination: "Kamppi" },
          { line: "551", destination: "Kamppi" },
          { line: "560", destination: "Pasila" },
        ];
        world.input.lines = [];
      },
    },
    {
      pattern: /^Given destination filters "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.destinations = args[0] ? args[0].split("|") : [];
      },
    },
    {
      pattern: /^When departures filter helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.filterDeparturesBySelections(
          world.input.departures,
          world.input.lines,
          world.input.destinations
        );
      },
    },
    {
      pattern: /^Then departures filter result count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given nine unique nearby stops$/,
      run: ({ world }) => {
        world.input.modeStops = Array.from({ length: 9 }, (_, index) =>
          createModeStop(`HSL:${index + 1}`, "BUS", index + 10, `Stop ${index + 1}`, `${index + 1}`)
        );
      },
    },
    {
      pattern: /^When selectable stop builder runs$/,
      run: ({ world }) => {
        world.output = departuresApi.buildSelectableStops(world.input.modeStops);
      },
    },
    {
      pattern: /^Then selectable stop builder output count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given nearby data with one missing stop id and one valid bus stop$/,
      run: ({ world }) => {
        world.input.nearbyData = {
          stopsByRadius: {
            edges: [
              { node: { distance: 20, stop: { gtfsId: "", vehicleMode: "BUS" } } },
              { node: { distance: 10, stop: { gtfsId: "HSL:1", vehicleMode: "BUS" } } },
            ],
          },
        };
      },
    },
    {
      pattern: /^When mode stop selector runs for mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.output = departuresApi.getModeStops(world.input.nearbyData, args[0]);
      },
    },
    {
      pattern: /^Then mode stop selector count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
  ],
});
