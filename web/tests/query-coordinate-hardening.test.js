const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const departuresApi = require("../api/v1/departures")._private;
const geocodeApi = require("../api/v1/geocode")._private;

const featureText = `
Feature: Query coordinate parser hardening

Scenario: Reject null departures coordinate helper input
  Given departures coordinate helper raw input is null
  When departures coordinate helper executes
  Then departures coordinate helper output is null

Scenario: Reject boolean departures coordinate helper input
  Given departures coordinate helper raw input is false
  When departures coordinate helper executes
  Then departures coordinate helper output is null

Scenario: Reject array departures coordinate helper input
  Given departures coordinate helper raw input is single-value array
  When departures coordinate helper executes
  Then departures coordinate helper output is null

Scenario: Reject departures request when latitude is null
  Given departures request query with null latitude
  When departures request helper executes
  Then departures request helper error equals "Invalid lat/lon"

Scenario: Reject boolean geocode coordinate helper input
  Given geocode coordinate helper raw input is false
  When geocode coordinate helper executes
  Then geocode coordinate helper output is null

Scenario: Reject array geocode coordinate helper input
  Given geocode coordinate helper raw input is single-value array
  When geocode coordinate helper executes
  Then geocode coordinate helper output is null

Scenario: Reject geocode request with array bias coordinates
  Given geocode request query with single-value array bias coordinates
  When geocode request helper executes
  Then geocode request helper error equals "Invalid lat/lon"
`;

defineFeature(test, featureText, {
  createWorld: () => ({
    input: {},
    output: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given departures coordinate helper raw input is null$/,
      run: ({ world }) => {
        world.input.rawCoordinate = null;
      },
    },
    {
      pattern: /^Given departures coordinate helper raw input is false$/,
      run: ({ world }) => {
        world.input.rawCoordinate = false;
      },
    },
    {
      pattern: /^Given departures coordinate helper raw input is single-value array$/,
      run: ({ world }) => {
        world.input.rawCoordinate = ["60.17"];
      },
    },
    {
      pattern: /^When departures coordinate helper executes$/,
      run: ({ world }) => {
        world.output = departuresApi.parseRequiredCoordinate(world.input.rawCoordinate);
      },
    },
    {
      pattern: /^Then departures coordinate helper output is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given departures request query with null latitude$/,
      run: ({ world }) => {
        world.input.departuresQuery = {
          lat: null,
          lon: "24.93",
          mode: "BUS",
        };
      },
    },
    {
      pattern: /^When departures request helper executes$/,
      run: ({ world }) => {
        world.output = departuresApi.parseDeparturesRequest(world.input.departuresQuery);
      },
    },
    {
      pattern: /^Then departures request helper error equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.error, args[0]);
      },
    },
    {
      pattern: /^Given geocode coordinate helper raw input is false$/,
      run: ({ world }) => {
        world.input.geocodeRawCoordinate = false;
      },
    },
    {
      pattern: /^Given geocode coordinate helper raw input is single-value array$/,
      run: ({ world }) => {
        world.input.geocodeRawCoordinate = ["24.93"];
      },
    },
    {
      pattern: /^When geocode coordinate helper executes$/,
      run: ({ world }) => {
        world.output = geocodeApi.parseCoordinate(world.input.geocodeRawCoordinate);
      },
    },
    {
      pattern: /^Then geocode coordinate helper output is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given geocode request query with single-value array bias coordinates$/,
      run: ({ world }) => {
        world.input.geocodeQuery = {
          text: "kamppi",
          lat: ["60.17"],
          lon: ["24.93"],
        };
      },
    },
    {
      pattern: /^When geocode request helper executes$/,
      run: ({ world }) => {
        world.output = geocodeApi.parseGeocodeRequest(world.input.geocodeQuery);
      },
    },
    {
      pattern: /^Then geocode request helper error equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.error, args[0]);
      },
    },
  ],
});
