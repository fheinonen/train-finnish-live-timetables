const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const departuresUtils = require("../api/lib/departures-utils");

function createBaseStopTime(overrides = {}) {
  return {
    serviceDay: 1_700_000_000,
    scheduledDeparture: 120,
    realtimeDeparture: 130,
    headsign: "Kamppi",
    pickupType: 0,
    dropoffType: 0,
    stop: {
      gtfsId: "HSL:1234",
      name: "Kamppi",
      code: "H1234",
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
Feature: Departure utility behavior

Scenario: Convert Digitransit pickup aliases into boardability enums
  Given a pickup type value of "NONE"
  When pickup type normalization is requested
  Then the normalized pickup type equals 1

Scenario: Reject non-boardable stop times
  Given a stop time pickup type value of "NONE"
  When boardability is evaluated
  Then the stop time is not boardable

Scenario: Parse boardable departures into public payload shape
  Given a default boardable BUS stop time
  When departure payload is parsed with expected mode "BUS"
  Then the parsed departure line equals "550"
  And the parsed departure has ISO departure time

Scenario: Ignore non-boardable departures
  Given a BUS stop time with pickup type "NONE"
  When departure payload is parsed with expected mode "BUS"
  Then no parsed departure is returned

Scenario: Parse requested modes and defaults
  Given a requested mode value of ""
  When requested mode is parsed
  Then requested mode equals "RAIL"

Scenario: Parse and deduplicate comma separated filters
  Given a multi-value query input list "550,550, 551,  ,M2"
  When multi-value query parsing runs
  Then parsed query values equal "550|551|M2"

Scenario: Validate requested result limits
  Given a requested result limit value of "0" and default value 8
  When requested result limit is parsed
  Then requested result limit is invalid

Scenario: Build sorted filter options from departure list
  Given departures with lines "550|550|551" and destinations "Kamppi|Pasila|Kamppi"
  When filter options are built
  Then line filter options equal "550:2|551:1"
  And destination filter options equal "Kamppi:2|Pasila:1"
`;

defineFeature(test, featureText, {
  createWorld: () => ({
    actual: null,
    input: {},
  }),
  stepDefinitions: [
    {
      pattern: /^Given a pickup type value of "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.pickupType = String(args[0] || "");
        world.input.givenPickupPreview = departuresUtils.normalizePickDropType(world.input.pickupType);
      },
    },
    {
      pattern: /^When pickup type normalization is requested$/,
      run: ({ world }) => {
        world.actual = departuresUtils.normalizePickDropType(world.input.pickupType);
      },
    },
    {
      pattern: /^Then the normalized pickup type equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.actual, Number(args[0]));
      },
    },
    {
      pattern: /^Given a stop time pickup type value of "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.stopTime = { pickupType: args[0] };
        world.input.givenBoardabilityPreview = departuresUtils.isBoardableStopTime(world.input.stopTime);
      },
    },
    {
      pattern: /^When boardability is evaluated$/,
      run: ({ world }) => {
        world.actual = departuresUtils.isBoardableStopTime(world.input.stopTime);
      },
    },
    {
      pattern: /^Then the stop time is not boardable$/,
      run: ({ assert, world }) => {
        assert.equal(world.actual, false);
      },
    },
    {
      pattern: /^Given a default boardable BUS stop time$/,
      run: ({ world }) => {
        world.input.stopTime = createBaseStopTime();
      },
    },
    {
      pattern: /^When departure payload is parsed with expected mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.actual = departuresUtils.parseDeparture(world.input.stopTime, null, args[0]);
      },
    },
    {
      pattern: /^Then the parsed departure line equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.actual?.line, args[0]);
      },
    },
    {
      pattern: /^Then the parsed departure has ISO departure time$/,
      run: ({ assert, world }) => {
        assert.equal(typeof world.actual?.departureIso, "string");
      },
    },
    {
      pattern: /^Given a BUS stop time with pickup type "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.stopTime = createBaseStopTime({ pickupType: args[0] });
      },
    },
    {
      pattern: /^Then no parsed departure is returned$/,
      run: ({ assert, world }) => {
        assert.equal(world.actual, null);
      },
    },
    {
      pattern: /^Given a requested mode value of "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.mode = args[0];
      },
    },
    {
      pattern: /^When requested mode is parsed$/,
      run: ({ world }) => {
        world.actual = departuresUtils.parseRequestedMode(world.input.mode);
      },
    },
    {
      pattern: /^Then requested mode equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.actual, args[0]);
      },
    },
    {
      pattern: /^Given a multi-value query input list "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.multi = args[0];
      },
    },
    {
      pattern: /^When multi-value query parsing runs$/,
      run: ({ world }) => {
        world.actual = departuresUtils.parseMultiQueryParam(world.input.multi);
      },
    },
    {
      pattern: /^Then parsed query values equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.actual.join("|"), args[0]);
      },
    },
    {
      pattern: /^Given a requested result limit value of "([^"]*)" and default value (\d+)$/,
      run: ({ args, world }) => {
        world.input.limitRaw = args[0];
        world.input.limitDefault = Number(args[1]);
      },
    },
    {
      pattern: /^When requested result limit is parsed$/,
      run: ({ world }) => {
        world.actual = departuresUtils.parseRequestedResultLimit(
          world.input.limitRaw,
          world.input.limitDefault
        );
      },
    },
    {
      pattern: /^Then requested result limit is invalid$/,
      run: ({ assert, world }) => {
        assert.equal(world.actual, null);
      },
    },
    {
      pattern: /^Given departures with lines "([^"]*)" and destinations "([^"]*)"$/,
      run: ({ args, world }) => {
        const lines = args[0].split("|");
        const destinations = args[1].split("|");
        world.input.departures = lines.map((line, index) => ({
          line,
          destination: destinations[index] || "",
        }));
      },
    },
    {
      pattern: /^When filter options are built$/,
      run: ({ world }) => {
        world.actual = departuresUtils.buildFilterOptions(world.input.departures);
      },
    },
    {
      pattern: /^Then line filter options equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const actual = world.actual.lines.map((item) => `${item.value}:${item.count}`).join("|");
        assert.equal(actual, args[0]);
      },
    },
    {
      pattern: /^Then destination filter options equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const actual = world.actual.destinations
          .map((item) => `${item.value}:${item.count}`)
          .join("|");
        assert.equal(actual, args[0]);
      },
    },
  ],
});
