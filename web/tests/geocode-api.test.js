const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const { createMockRequest, createMockResponse } = require("./helpers/http-mocks");
const geocodeModule = require("../api/v1/geocode");

const { createGeocodeHandler } = geocodeModule._private;

function createJsonResponse(body, { status = 200, ok = true } = {}) {
  return {
    status,
    ok,
    async json() {
      return body;
    },
  };
}

function createFeature(lat, lon, label, confidence = 1) {
  return {
    geometry: { coordinates: [lon, lat] },
    properties: { label, confidence },
  };
}

async function runHandler({
  method = "GET",
  query = {},
  fetchImpl = async () => createJsonResponse({ features: [] }),
  graphqlRequestImpl = async () => ({ stopsByRadius: { edges: [] } }),
}) {
  const handler = createGeocodeHandler({
    fetchImpl,
    graphqlRequestImpl,
    getApiKey: () => "test-key",
    logError: () => {},
  });
  const req = createMockRequest({ method, query });
  const res = createMockResponse();
  await handler(req, res);
  return res;
}

const featureText = `
Feature: Geocode API behavior

Scenario: Reject non-GET geocode methods
  Given a geocode request method "POST"
  When the geocode API is called
  Then the geocode response status is 405
  And the geocode error message is "Method not allowed"

Scenario: Reject too short text queries
  Given a geocode query text "ab"
  When the geocode API is called
  Then the geocode response status is 400
  And the geocode error message is "Invalid text"

Scenario: Reject invalid bias coordinates
  Given a geocode query text "kamppi" with lat "60.1" and lon "bad"
  When the geocode API is called
  Then the geocode response status is 400
  And the geocode error message is "Invalid lat/lon"

Scenario: Reject whitespace bias coordinates
  Given a geocode query text "kamppi" with lat " " and lon " "
  When the geocode API is called
  Then the geocode response status is 400
  And the geocode error message is "Invalid lat/lon"

Scenario: Return no matching HSL area location
  Given geocoding returns one candidate outside validated HSL stops
  And a geocode query text "kamppi"
  When the geocode API is called
  Then the geocode response status is 200
  And the geocode payload has no location
  And the geocode payload message is "No matching location found in HSL area."

Scenario: Return ambiguous choices when candidates are close
  Given geocoding returns ambiguous Kamppi candidates
  And a geocode query text "kamppi"
  When the geocode API is called
  Then the geocode response status is 200
  And the geocode payload is marked ambiguous
  And the geocode payload has at least 2 choices

Scenario: Return best resolved location when one candidate clearly wins
  Given geocoding returns ranked city center candidates
  And a geocode query text "city center helsinki"
  When the geocode API is called
  Then the geocode response status is 200
  And the geocode location label equals "Citycenter, Kaivokatu 8, Helsinki"

Scenario: Return sanitized 500 response on geocode upstream failure
  Given geocoding upstream throws an error
  And a geocode query text "kamppi"
  When the geocode API is called
  Then the geocode response status is 500
  And the geocode error message is "Could not approximate location. Please try again."
`;

defineFeature(test, featureText, {
  createWorld: () => ({
    request: { method: "GET", query: {} },
    response: null,
    fetchImpl: async () => createJsonResponse({ features: [] }),
    graphqlRequestImpl: async () => ({
      stopsByRadius: {
        edges: [{ node: { stop: { gtfsId: "HSL:1" } } }],
      },
    }),
  }),
  stepDefinitions: [
    {
      pattern: /^Given a geocode request method "([^"]*)"$/,
      run: ({ args, world }) => {
        world.request.method = args[0];
      },
    },
    {
      pattern: /^Given a geocode query text "([^"]*)"$/,
      run: ({ args, world }) => {
        world.request.query = { text: args[0] };
      },
    },
    {
      pattern: /^Given a geocode query text "([^"]*)" with lat "([^"]*)" and lon "([^"]*)"$/,
      run: ({ args, world }) => {
        world.request.query = {
          text: args[0],
          lat: args[1],
          lon: args[2],
        };
      },
    },
    {
      pattern: /^Given geocoding returns one candidate outside validated HSL stops$/,
      run: ({ world }) => {
        world.fetchImpl = async () =>
          createJsonResponse({
            features: [createFeature(60.1708, 24.9375, "Kamppi, Helsinki", 1)],
          });
        world.graphqlRequestImpl = async () => ({ stopsByRadius: { edges: [] } });
      },
    },
    {
      pattern: /^Given geocoding returns ambiguous Kamppi candidates$/,
      run: ({ world }) => {
        world.fetchImpl = async () =>
          createJsonResponse({
            features: [
              createFeature(60.1699, 24.9384, "Kamppi, Helsinki", 1),
              createFeature(60.1688, 24.9325, "Kamppi Center, Helsinki", 0.95),
            ],
          });
      },
    },
    {
      pattern: /^Given geocoding returns ranked city center candidates$/,
      run: ({ world }) => {
        world.fetchImpl = async () =>
          createJsonResponse({
            features: [
              createFeature(60.169626, 24.941783, "Citycenter, Kaivokatu 8, Helsinki", 1),
              createFeature(
                60.221288,
                25.079348,
                "Arena Center Myllypuro (Fat Pipe Center), Alakiventie 2, Helsinki",
                0.94
              ),
            ],
          });
      },
    },
    {
      pattern: /^Given geocoding upstream throws an error$/,
      run: ({ world }) => {
        world.fetchImpl = async () => {
          throw new Error("fetch failure");
        };
      },
    },
    {
      pattern: /^When the geocode API is called$/,
      run: async ({ world }) => {
        world.response = await runHandler({
          method: world.request.method,
          query: world.request.query,
          fetchImpl: world.fetchImpl,
          graphqlRequestImpl: world.graphqlRequestImpl,
        });
      },
    },
    {
      pattern: /^Then the geocode response status is (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.statusCode, Number(args[0]));
      },
    },
    {
      pattern: /^Then the geocode error message is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.deepEqual(world.response.payload, { error: args[0] });
      },
    },
    {
      pattern: /^Then the geocode payload has no location$/,
      run: ({ assert, world }) => {
        assert.equal(world.response.payload.location, null);
      },
    },
    {
      pattern: /^Then the geocode payload message is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.payload.message, args[0]);
      },
    },
    {
      pattern: /^Then the geocode payload is marked ambiguous$/,
      run: ({ assert, world }) => {
        assert.equal(world.response.payload.ambiguous, true);
      },
    },
    {
      pattern: /^Then the geocode payload has at least (\d+) choices$/,
      run: ({ assert, args, world }) => {
        assert.ok(Array.isArray(world.response.payload.choices));
        assert.ok(world.response.payload.choices.length >= Number(args[0]));
      },
    },
    {
      pattern: /^Then the geocode location label equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.payload.location?.label, args[0]);
      },
    },
  ],
});
