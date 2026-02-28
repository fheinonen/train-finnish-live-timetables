const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const departuresApi = require("../api/v1/departures")._private;

function createModeStop({
  id,
  mode = "BUS",
  distance = 100,
  name = "Stop",
  code = "1001",
  parentStation = null,
}) {
  return {
    distance,
    stop: {
      gtfsId: id,
      vehicleMode: mode,
      name,
      code,
      parentStation,
    },
  };
}

const featureText = `
Feature: Additional departures helper branch coverage

Scenario: Return no mode stops for missing nearby payload
  Given nearby payload is missing
  When mode-stop helper runs for mode "BUS"
  Then mode-stop helper output count equals 0

Scenario: Exclude mismatched mode stops
  Given nearby payload with only rail stops
  When mode-stop helper runs for mode "BUS"
  Then mode-stop helper output count equals 0

Scenario: Keep null selectable stop code when every grouped code is empty
  Given grouped nearby stops with empty codes only
  When selectable-stop helper runs
  Then first selectable stop code is null

Scenario: Keep all departures when no filters are selected
  Given departures for filter helper
  And filter helper selected lines are empty
  And filter helper selected destinations are empty
  When filter helper runs
  Then filter helper output count equals 3

Scenario: Filter departures by line when destination filter is empty
  Given departures for filter helper
  And filter helper selected lines are "550"
  And filter helper selected destinations are empty
  When filter helper runs
  Then filter helper output count equals 2

Scenario: Reject non-finite departure coordinate helper input
  Given departure coordinate helper raw input is infinity
  When departure coordinate helper runs
  Then departure coordinate helper output is null

Scenario: Build stop mode station defaults code and stopCodes
  Given stop mode station input without optional code fields
  When stop mode station helper runs
  Then stop mode station code is null
  And stop mode station code list count equals 0

Scenario: Map selectable stops defaults stopCodes to empty list
  Given selectable stop mapping input without member stop codes
  When selectable stop mapping helper runs
  Then mapped selectable stop code list count equals 0

Scenario: Build stop mode response with missing alias payload
  Given stop mode response input with missing multi-stop aliases
  When stop mode response helper runs
  Then stop mode response departures count equals 0

`;

defineFeature(test, featureText, {
  createWorld: () => ({
    input: {},
    output: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given nearby payload is missing$/,
      run: ({ world }) => {
        world.input.nearbyData = null;
      },
    },
    {
      pattern: /^Given nearby payload with only rail stops$/,
      run: ({ world }) => {
        world.input.nearbyData = {
          stopsByRadius: {
            edges: [
              { node: createModeStop({ id: "HSL:rail1", mode: "RAIL", distance: 80 }) },
              { node: createModeStop({ id: "HSL:rail2", mode: "RAIL", distance: 120 }) },
            ],
          },
        };
      },
    },
    {
      pattern: /^When mode-stop helper runs for mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.output = departuresApi.getModeStops(world.input.nearbyData, args[0]);
      },
    },
    {
      pattern: /^Then mode-stop helper output count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given grouped nearby stops with empty codes only$/,
      run: ({ world }) => {
        world.input.modeStops = [
          createModeStop({ id: "HSL:1", distance: 30, name: "Shared", code: "" }),
          createModeStop({ id: "HSL:2", distance: 50, name: "Shared", code: "" }),
        ];
      },
    },
    {
      pattern: /^When selectable-stop helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.buildSelectableStops(world.input.modeStops);
      },
    },
    {
      pattern: /^Then first selectable stop code is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output?.[0]?.code, null);
      },
    },
    {
      pattern: /^Given departures for filter helper$/,
      run: ({ world }) => {
        world.input.departures = [
          { line: "550", destination: "Kamppi" },
          { line: "551", destination: "Pasila" },
          { line: "550", destination: "Pasila" },
        ];
      },
    },
    {
      pattern: /^Given filter helper selected lines are empty$/,
      run: ({ world }) => {
        world.input.lines = [];
      },
    },
    {
      pattern: /^Given filter helper selected lines are "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.lines = args[0].split("|").filter(Boolean);
      },
    },
    {
      pattern: /^Given filter helper selected destinations are empty$/,
      run: ({ world }) => {
        world.input.destinations = [];
      },
    },
    {
      pattern: /^When filter helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.filterDeparturesBySelections(
          world.input.departures,
          world.input.lines,
          world.input.destinations
        );
      },
    },
    {
      pattern: /^Then filter helper output count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given departure coordinate helper raw input is infinity$/,
      run: ({ world }) => {
        world.input.coordinate = Infinity;
      },
    },
    {
      pattern: /^When departure coordinate helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.parseRequiredCoordinate(world.input.coordinate);
      },
    },
    {
      pattern: /^Then departure coordinate helper output is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given stop mode station input without optional code fields$/,
      run: ({ world }) => {
        world.input.selectedStop = {
          id: "HSL:1",
          name: "Kamppi",
          code: "",
          distance: 15.2,
        };
        world.input.departures = [];
      },
    },
    {
      pattern: /^When stop mode station helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.buildStopModeStation(world.input.selectedStop, world.input.departures);
      },
    },
    {
      pattern: /^Then stop mode station code is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output.stopCode, null);
      },
    },
    {
      pattern: /^Then stop mode station code list count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.stopCodes.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given selectable stop mapping input without member stop codes$/,
      run: ({ world }) => {
        world.input.selectableStops = [
          {
            id: "HSL:1",
            name: "Kamppi",
            code: "1001",
            distance: 25,
            memberStopIds: ["HSL:1"],
          },
        ];
      },
    },
    {
      pattern: /^When selectable stop mapping helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.mapSelectableStops(world.input.selectableStops);
      },
    },
    {
      pattern: /^Then mapped selectable stop code list count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output[0].stopCodes.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given stop mode response input with missing multi-stop aliases$/,
      run: ({ world }) => {
        world.input.stopModeParams = {
          graphqlRequest: async () => ({}),
          mode: "BUS",
          upstreamMode: "BUS",
          modeStops: [createModeStop({ id: "HSL:1", mode: "BUS", distance: 20, name: "Kamppi", code: "1001" })],
          requestedResultLimit: 8,
          requestedLines: [],
          requestedDestinations: [],
          requestedStopId: "HSL:1",
        };
      },
    },
    {
      pattern: /^When stop mode response helper runs$/,
      run: async ({ world }) => {
        world.output = await departuresApi.buildStopModeResponse(world.input.stopModeParams);
      },
    },
    {
      pattern: /^Then stop mode response departures count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.station.departures.length, Number(args[0]));
      },
    },
  ],
});
