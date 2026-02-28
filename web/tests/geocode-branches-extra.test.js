const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const geocodeHelpers = require("../api/v1/geocode")._private;

function createJsonResponse(body, { status = 200, ok = true } = {}) {
  return {
    status,
    ok,
    async json() {
      return body;
    },
  };
}

const featureText = `
Feature: Extra geocode helper branch coverage

Scenario: Parse geocode coordinate from trimmed string
  Given geocode coordinate raw input " 24.93 "
  When geocode coordinate helper runs
  Then geocode coordinate helper output equals 24.93

Scenario: Reject geocode coordinate object input
  Given geocode coordinate raw input is object
  When geocode coordinate helper runs
  Then geocode coordinate helper output is null

Scenario: Normalize null language as null
  Given geocode language raw input is null
  When geocode language helper runs
  Then geocode language helper output is null

Scenario: Normalize blank language as null
  Given geocode language raw input "   "
  When geocode language helper runs
  Then geocode language helper output is null

Scenario: Build variants from punctuation-only text
  Given geocode variant query input "!!!"
  When geocode variant builder runs
  Then geocode variant count equals 0

Scenario: Build variants without municipality fallback when municipality token exists
  Given geocode variant query input "kamppi helsinki"
  When geocode variant builder runs
  Then geocode variants do not include "kamppi helsinki espoo"

Scenario: Rank candidates returns empty for non-array input
  Given ranked candidate input is null
  When ranked candidate helper runs for query "kamppi"
  Then ranked candidate helper count equals 0

Scenario: Deduplicate ambiguous choices by coordinate
  Given ranked candidates with duplicate ambiguity coordinates
  When ambiguity choice helper runs
  Then ambiguity choice labels equal "Kamppi|Kamppi center"

Scenario: Drop ambiguity choices when score delta is too wide
  Given ranked candidates outside ambiguity score delta
  When ambiguity choice helper runs
  Then ambiguity choice helper count equals 0

Scenario: Cap ambiguity choices to four items
  Given ranked candidates with five close ambiguity matches
  When ambiguity choice helper runs
  Then ambiguity choice helper count equals 4

Scenario: Build geocoding URL without language parameter
  Given geocoding URL params with null language
  When geocoding URL helper runs
  Then geocoding URL does not contain "lang="

Scenario: Parse feature label from locality and region fallback
  Given geocode feature with locality "Kamppi" and region "Helsinki"
  When geocode feature helper runs
  Then parsed geocode feature label equals "Kamppi, Helsinki"

Scenario: Parse feature keeps null label when properties are blank
  Given geocode feature with blank label properties
  When geocode feature helper runs
  Then parsed geocode feature label is null

Scenario: Parse feature keeps null confidence when confidence is invalid
  Given geocode feature with invalid confidence
  When geocode feature helper runs
  Then parsed geocode feature confidence is null

Scenario: Return empty geocode results when features payload is not an array
  Given geocode fetch returns non-array features payload
  And geocode API key value is "ok"
  When direct geocode helper executes
  Then direct geocode helper returns 0 candidates

Scenario: Convert geocode AbortError into timeout message
  Given geocode fetch throws AbortError
  And geocode API key value is "ok"
  When direct geocode helper executes
  Then direct geocode helper throws "Digitransit geocoding request timed out"

Scenario: Nearby stop helper returns false when stops payload has no edges array
  Given nearby stop helper runtime with malformed payload
  When nearby stop helper executes
  Then nearby stop helper output equals false

Scenario: Parse geocode request keeps explicit bias coordinates
  Given geocode request query with explicit bias coordinates
  When geocode request helper runs
  Then parsed geocode request bias equals "60.17|24.93"
`;

defineFeature(test, featureText, {
  createWorld: () => ({
    input: {},
    output: null,
    error: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given geocode coordinate raw input "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.coordinateRaw = args[0];
      },
    },
    {
      pattern: /^Given geocode coordinate raw input is object$/,
      run: ({ world }) => {
        world.input.coordinateRaw = { value: "24.93" };
      },
    },
    {
      pattern: /^When geocode coordinate helper runs$/,
      run: ({ world }) => {
        world.output = geocodeHelpers.parseCoordinate(world.input.coordinateRaw);
      },
    },
    {
      pattern: /^Then geocode coordinate helper output equals ([\d.]+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, Number(args[0]));
      },
    },
    {
      pattern: /^Then geocode coordinate helper output is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given geocode language raw input is null$/,
      run: ({ world }) => {
        world.input.languageRaw = null;
      },
    },
    {
      pattern: /^Given geocode language raw input "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.languageRaw = args[0];
      },
    },
    {
      pattern: /^When geocode language helper runs$/,
      run: ({ world }) => {
        world.output = geocodeHelpers.normalizeLanguage(world.input.languageRaw);
      },
    },
    {
      pattern: /^Then geocode language helper output is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given geocode variant query input "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.queryText = args[0];
      },
    },
    {
      pattern: /^When geocode variant builder runs$/,
      run: ({ world }) => {
        world.output = geocodeHelpers.buildGeocodeTextVariants(world.input.queryText);
      },
    },
    {
      pattern: /^Then geocode variant count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Then geocode variants do not include "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.includes(args[0]), false);
      },
    },
    {
      pattern: /^Given ranked candidate input is null$/,
      run: ({ world }) => {
        world.input.rankCandidates = null;
      },
    },
    {
      pattern: /^When ranked candidate helper runs for query "([^"]*)"$/,
      run: ({ args, world }) => {
        world.output = geocodeHelpers.rankCandidatesForQuery(world.input.rankCandidates, args[0]);
      },
    },
    {
      pattern: /^Then ranked candidate helper count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given ranked candidates with duplicate ambiguity coordinates$/,
      run: ({ world }) => {
        world.input.rankedCandidates = [
          {
            candidate: { lat: 60.17, lon: 24.93, label: "Kamppi", confidence: 0.9 },
            strongTokenMatches: 1,
            score: 100,
          },
          {
            candidate: { lat: 60.17, lon: 24.93, label: "Kamppi duplicate", confidence: 0.8 },
            strongTokenMatches: 1,
            score: 99,
          },
          {
            candidate: { lat: 60.171, lon: 24.931, label: "Kamppi center", confidence: 0.85 },
            strongTokenMatches: 1,
            score: 98,
          },
        ];
      },
    },
    {
      pattern: /^Given ranked candidates outside ambiguity score delta$/,
      run: ({ world }) => {
        world.input.rankedCandidates = [
          {
            candidate: { lat: 60.17, lon: 24.93, label: "Kamppi", confidence: 0.9 },
            strongTokenMatches: 1,
            score: 100,
          },
          {
            candidate: { lat: 60.171, lon: 24.931, label: "Pasila", confidence: 0.8 },
            strongTokenMatches: 1,
            score: 80,
          },
        ];
      },
    },
    {
      pattern: /^Given ranked candidates with five close ambiguity matches$/,
      run: ({ world }) => {
        world.input.rankedCandidates = Array.from({ length: 5 }, (_, index) => ({
          candidate: {
            lat: 60.17 + index * 0.001,
            lon: 24.93 + index * 0.001,
            label: `Choice ${index + 1}`,
            confidence: 0.9,
          },
          strongTokenMatches: 2,
          score: 100 - index,
        }));
      },
    },
    {
      pattern: /^When ambiguity choice helper runs$/,
      run: ({ world }) => {
        world.output = geocodeHelpers.buildAmbiguousChoices(world.input.rankedCandidates);
      },
    },
    {
      pattern: /^Then ambiguity choice labels equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.map((choice) => choice.label).join("|"), args[0]);
      },
    },
    {
      pattern: /^Then ambiguity choice helper count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given geocoding URL params with null language$/,
      run: ({ world }) => {
        world.input.urlParams = {
          text: "kamppi",
          biasLat: 60.17,
          biasLon: 24.93,
          lang: null,
        };
      },
    },
    {
      pattern: /^When geocoding URL helper runs$/,
      run: ({ world }) => {
        world.output = geocodeHelpers.getGeocodingUrl(world.input.urlParams);
      },
    },
    {
      pattern: /^Then geocoding URL does not contain "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.includes(args[0]), false);
      },
    },
    {
      pattern: /^Given geocode feature with locality "([^"]*)" and region "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.feature = {
          geometry: { coordinates: [24.93, 60.17] },
          properties: {
            locality: args[0],
            region: args[1],
          },
        };
      },
    },
    {
      pattern: /^Given geocode feature with blank label properties$/,
      run: ({ world }) => {
        world.input.feature = {
          geometry: { coordinates: [24.93, 60.17] },
          properties: {
            label: " ",
            name: "",
            locality: "",
            region: "",
          },
        };
      },
    },
    {
      pattern: /^Given geocode feature with invalid confidence$/,
      run: ({ world }) => {
        world.input.feature = {
          geometry: { coordinates: [24.93, 60.17] },
          properties: {
            label: "Kamppi",
            confidence: "bad",
          },
        };
      },
    },
    {
      pattern: /^When geocode feature helper runs$/,
      run: ({ world }) => {
        world.output = geocodeHelpers.parseFeature(world.input.feature);
      },
    },
    {
      pattern: /^Then parsed geocode feature label equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.label, args[0]);
      },
    },
    {
      pattern: /^Then parsed geocode feature label is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output?.label, null);
      },
    },
    {
      pattern: /^Then parsed geocode feature confidence is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output?.confidence, null);
      },
    },
    {
      pattern: /^Given geocode fetch returns non-array features payload$/,
      run: ({ world }) => {
        world.input.fetchImpl = async () => createJsonResponse({});
      },
    },
    {
      pattern: /^Given geocode fetch throws AbortError$/,
      run: ({ world }) => {
        world.input.fetchImpl = async () => {
          const error = new Error("abort");
          error.name = "AbortError";
          throw error;
        };
      },
    },
    {
      pattern: /^Given geocode API key value is "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.getApiKey = () => args[0];
      },
    },
    {
      pattern: /^When direct geocode helper executes$/,
      run: async ({ world }) => {
        world.error = null;
        world.output = null;
        try {
          world.output = await geocodeHelpers.geocode("kamppi", 60.17, 24.93, null, {
            fetchImpl: world.input.fetchImpl,
            getApiKey: world.input.getApiKey,
          });
        } catch (error) {
          world.error = error;
        }
      },
    },
    {
      pattern: /^Then direct geocode helper returns (\d+) candidates$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.length, Number(args[0]));
      },
    },
    {
      pattern: /^Then direct geocode helper throws "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.error?.message, args[0]);
      },
    },
    {
      pattern: /^Given nearby stop helper runtime with malformed payload$/,
      run: ({ world }) => {
        world.input.graphqlRequestImpl = async () => ({ stopsByRadius: { edges: null } });
      },
    },
    {
      pattern: /^When nearby stop helper executes$/,
      run: async ({ world }) => {
        world.output = await geocodeHelpers.hasNearbyHslStop(60.17, 24.93, {
          graphqlRequestImpl: world.input.graphqlRequestImpl,
        });
      },
    },
    {
      pattern: /^Then nearby stop helper output equals (true|false)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0] === "true");
      },
    },
    {
      pattern: /^Given geocode request query with explicit bias coordinates$/,
      run: ({ world }) => {
        world.input.query = {
          text: "kamppi",
          lat: "60.17",
          lon: "24.93",
        };
      },
    },
    {
      pattern: /^When geocode request helper runs$/,
      run: ({ world }) => {
        world.output = geocodeHelpers.parseGeocodeRequest(world.input.query);
      },
    },
    {
      pattern: /^Then parsed geocode request bias equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const actual = `${world.output?.params?.biasLat}|${world.output?.params?.biasLon}`;
        assert.equal(actual, args[0]);
      },
    },
  ],
});
