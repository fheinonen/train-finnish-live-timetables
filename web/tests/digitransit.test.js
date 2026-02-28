const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const digitransit = require("../api/lib/digitransit");

async function withMockedRuntime({ apiKey = "test-key", fetchImpl }, run) {
  const originalFetch = global.fetch;
  const originalKey = process.env.DIGITRANSIT_API_KEY;
  global.fetch = fetchImpl;
  process.env.DIGITRANSIT_API_KEY = apiKey;
  try {
    return await run();
  } finally {
    global.fetch = originalFetch;
    if (originalKey == null) {
      delete process.env.DIGITRANSIT_API_KEY;
    } else {
      process.env.DIGITRANSIT_API_KEY = originalKey;
    }
  }
}

const featureText = `
Feature: Digitransit GraphQL client behavior

Scenario: Reject empty multi-stop query ids
  Given a multi-stop query input with no stop ids
  When the multi-stop query is built
  Then building the multi-stop query throws "buildMultiStopDeparturesQuery requires at least one stop id"

Scenario: Reject invalid multi-stop departures limit
  Given a multi-stop query input with ids "HSL:1" and departures 0
  When the multi-stop query is built
  Then building the multi-stop query throws "buildMultiStopDeparturesQuery requires a positive integer departures limit"

Scenario: Reject non-integer multi-stop departures limit
  Given a multi-stop query input with ids "HSL:1" and non-integer departures "1.5"
  When the multi-stop query is built
  Then building the multi-stop query throws "buildMultiStopDeparturesQuery requires a positive integer departures limit"

Scenario: Build deduplicated multi-stop GraphQL query metadata
  Given a multi-stop query input with ids "HSL:1|HSL:1|HSL:2" and departures 8
  When the multi-stop query is built
  Then multi-stop query aliases equal "s0|s1"
  And multi-stop query variables include id0 "HSL:1" and id1 "HSL:2"

Scenario: Build multi-stop query after trimming blank stop ids
  Given a multi-stop query input with ids " HSL:1 | | HSL:2 " and departures 8
  When the multi-stop query is built
  Then multi-stop query aliases equal "s0|s1"
  And multi-stop query variables include id0 "HSL:1" and id1 "HSL:2"

Scenario: Reject GraphQL calls without API key
  Given graphql runtime without API key
  When graphql request is executed
  Then graphql request throws "Missing DIGITRANSIT_API_KEY environment variable."

Scenario: Convert aborted fetch errors into timeout messages
  Given graphql runtime where fetch aborts
  When graphql request is executed
  Then graphql request throws "Digitransit request timed out"

Scenario: Re-throw non-abort fetch failures
  Given graphql runtime where fetch fails with "network down"
  When graphql request is executed
  Then graphql request throws "network down"

Scenario: Reject invalid JSON response payloads
  Given graphql runtime where JSON parsing fails
  When graphql request is executed
  Then graphql request throws "Digitransit invalid response (HTTP 200)"

Scenario: Reject non-OK HTTP status responses
  Given graphql runtime with HTTP status 502
  When graphql request is executed
  Then graphql request throws "Digitransit HTTP 502"

Scenario: Reject GraphQL errors in successful HTTP responses
  Given graphql runtime with GraphQL error message "upstream failed"
  When graphql request is executed
  Then graphql request throws "upstream failed"

Scenario: Allow empty GraphQL error arrays
  Given graphql runtime with empty GraphQL errors list
  When graphql request is executed
  Then graphql request returns data with key "ok"

Scenario: Return GraphQL data for successful responses
  Given graphql runtime with successful data payload
  When graphql request is executed
  Then graphql request returns data with key "ok"
`;

defineFeature(test, featureText, {
  createWorld: () => ({
    input: {},
    output: null,
    error: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given a multi-stop query input with no stop ids$/,
      run: ({ world }) => {
        world.input.stopIds = [];
        world.input.departures = 8;
      },
    },
    {
      pattern: /^Given a multi-stop query input with ids "([^"]*)" and departures (\d+)$/,
      run: ({ args, world }) => {
        world.input.stopIds = args[0].split("|");
        world.input.departures = Number(args[1]);
      },
    },
    {
      pattern: /^Given a multi-stop query input with ids "([^"]*)" and non-integer departures "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.stopIds = args[0].split("|");
        world.input.departures = Number(args[1]);
      },
    },
    {
      pattern: /^When the multi-stop query is built$/,
      run: ({ world }) => {
        world.error = null;
        try {
          world.output = digitransit.buildMultiStopDeparturesQuery(
            world.input.stopIds,
            world.input.departures
          );
        } catch (error) {
          world.error = error;
        }
      },
    },
    {
      pattern: /^Then building the multi-stop query throws "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.error?.message, args[0]);
      },
    },
    {
      pattern: /^Then multi-stop query aliases equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.aliases.join("|"), args[0]);
      },
    },
    {
      pattern: /^Then multi-stop query variables include id0 "([^"]*)" and id1 "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.variables.id0, args[0]);
        assert.equal(world.output.variables.id1, args[1]);
      },
    },
    {
      pattern: /^Given graphql runtime without API key$/,
      run: ({ world }) => {
        world.input.apiKey = "";
        world.input.fetchImpl = async () => {
          throw new Error("fetch should not run");
        };
      },
    },
    {
      pattern: /^Given graphql runtime where fetch aborts$/,
      run: ({ world }) => {
        world.input.apiKey = "test-key";
        world.input.fetchImpl = async () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          throw error;
        };
      },
    },
    {
      pattern: /^Given graphql runtime where fetch fails with "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.apiKey = "test-key";
        world.input.fetchImpl = async () => {
          throw new Error(args[0]);
        };
      },
    },
    {
      pattern: /^Given graphql runtime where JSON parsing fails$/,
      run: ({ world }) => {
        world.input.apiKey = "test-key";
        world.input.fetchImpl = async () => ({
          ok: true,
          status: 200,
          async json() {
            throw new Error("invalid json");
          },
        });
      },
    },
    {
      pattern: /^Given graphql runtime with HTTP status (\d+)$/,
      run: ({ args, world }) => {
        world.input.apiKey = "test-key";
        world.input.fetchImpl = async () => ({
          ok: false,
          status: Number(args[0]),
          async json() {
            return { data: null };
          },
        });
      },
    },
    {
      pattern: /^Given graphql runtime with GraphQL error message "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.apiKey = "test-key";
        world.input.fetchImpl = async () => ({
          ok: true,
          status: 200,
          async json() {
            return {
              errors: [{ message: args[0] }],
            };
          },
        });
      },
    },
    {
      pattern: /^Given graphql runtime with empty GraphQL errors list$/,
      run: ({ world }) => {
        world.input.apiKey = "test-key";
        world.input.fetchImpl = async () => ({
          ok: true,
          status: 200,
          async json() {
            return {
              data: { ok: true },
              errors: [],
            };
          },
        });
      },
    },
    {
      pattern: /^Given graphql runtime with successful data payload$/,
      run: ({ world }) => {
        world.input.apiKey = "test-key";
        world.input.fetchImpl = async () => ({
          ok: true,
          status: 200,
          async json() {
            return {
              data: { ok: true },
            };
          },
        });
      },
    },
    {
      pattern: /^When graphql request is executed$/,
      run: async ({ world }) => {
        world.error = null;
        world.output = null;
        try {
          world.output = await withMockedRuntime(
            {
              apiKey: world.input.apiKey,
              fetchImpl: world.input.fetchImpl,
            },
            () => digitransit.graphqlRequest("query Test { ok }", {})
          );
        } catch (error) {
          world.error = error;
        }
      },
    },
    {
      pattern: /^Then graphql request throws "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.error?.message, args[0]);
      },
    },
    {
      pattern: /^Then graphql request returns data with key "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.error, null);
        assert.ok(world.output);
        assert.equal(Object.prototype.hasOwnProperty.call(world.output, args[0]), true);
      },
    },
  ],
});
