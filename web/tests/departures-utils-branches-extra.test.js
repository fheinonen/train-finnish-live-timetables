const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const departuresUtils = require("../api/lib/departures-utils");

function createBaseStopTime(overrides = {}) {
  return {
    serviceDay: 1_700_000_000,
    scheduledDeparture: 120,
    realtimeDeparture: 120,
    headsign: "Kamppi",
    pickupType: 0,
    stop: {
      gtfsId: "HSL:1234",
      name: "Kamppi",
      code: "1234",
      platformCode: "A",
    },
    trip: {
      route: {
        mode: "BUS",
        shortName: "550",
      },
    },
    ...overrides,
  };
}

const featureText = `
Feature: Extra departures utility branch coverage

Scenario: Empty pickup type string becomes null
  Given pickup type raw input ""
  When pickup type helper runs
  Then pickup type helper output is null

Scenario: Null pickup type becomes null
  Given pickup type raw input is null
  When pickup type helper runs
  Then pickup type helper output is null

Scenario: Departure parsing rejects missing trip route
  Given stop time without trip route
  When departure parsing helper runs for mode "BUS"
  Then parsed departure is null

Scenario: Departure parsing falls back to empty destination
  Given stop time without headsign
  When departure parsing helper runs for mode "BUS"
  Then parsed departure destination equals ""

Scenario: Departure parsing allows missing stop metadata
  Given stop time without stop metadata
  When departure parsing helper runs for mode "BUS"
  Then parsed departure stop id is null
  And parsed departure stop code is null
  And parsed departure stop name is null

Scenario: Filter options for empty departures are empty
  Given departures input is empty
  When filter option helper runs
  Then filter option lines are empty
  And filter option destinations are empty

Scenario: Multi query parsing handles blank scalar
  Given multi query raw input ""
  When multi query helper runs
  Then multi query helper output equals ""
`;

defineFeature(test, featureText, {
  createWorld: () => ({
    input: {},
    output: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given pickup type raw input "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.pickupType = args[0];
      },
    },
    {
      pattern: /^Given pickup type raw input is null$/,
      run: ({ world }) => {
        world.input.pickupType = null;
      },
    },
    {
      pattern: /^When pickup type helper runs$/,
      run: ({ world }) => {
        world.output = departuresUtils.normalizePickDropType(world.input.pickupType);
      },
    },
    {
      pattern: /^Then pickup type helper output is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given stop time without trip route$/,
      run: ({ world }) => {
        world.input.stopTime = { serviceDay: 1_700_000_000, realtimeDeparture: 120, trip: null };
      },
    },
    {
      pattern: /^Given stop time without headsign$/,
      run: ({ world }) => {
        world.input.stopTime = createBaseStopTime({ headsign: null });
      },
    },
    {
      pattern: /^Given stop time without stop metadata$/,
      run: ({ world }) => {
        world.input.stopTime = createBaseStopTime({ stop: null });
      },
    },
    {
      pattern: /^When departure parsing helper runs for mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.output = departuresUtils.parseDeparture(world.input.stopTime, null, args[0], null);
      },
    },
    {
      pattern: /^Then parsed departure is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Then parsed departure destination equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.destination, args[0]);
      },
    },
    {
      pattern: /^Then parsed departure stop id is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output?.stopId, null);
      },
    },
    {
      pattern: /^Then parsed departure stop code is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output?.stopCode, null);
      },
    },
    {
      pattern: /^Then parsed departure stop name is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output?.stopName, null);
      },
    },
    {
      pattern: /^Given departures input is empty$/,
      run: ({ world }) => {
        world.input.departures = [];
      },
    },
    {
      pattern: /^When filter option helper runs$/,
      run: ({ world }) => {
        world.output = departuresUtils.buildFilterOptions(world.input.departures);
      },
    },
    {
      pattern: /^Then filter option lines are empty$/,
      run: ({ assert, world }) => {
        assert.deepEqual(world.output?.lines, []);
      },
    },
    {
      pattern: /^Then filter option destinations are empty$/,
      run: ({ assert, world }) => {
        assert.deepEqual(world.output?.destinations, []);
      },
    },
    {
      pattern: /^Given multi query raw input "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.multi = args[0];
      },
    },
    {
      pattern: /^When multi query helper runs$/,
      run: ({ world }) => {
        world.output = departuresUtils.parseMultiQueryParam(world.input.multi);
      },
    },
    {
      pattern: /^Then multi query helper output equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.join("|"), args[0]);
      },
    },
  ],
});
