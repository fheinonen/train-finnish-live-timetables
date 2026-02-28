const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const { createMockRequest, createMockResponse } = require("./helpers/http-mocks");
const clientErrorModule = require("../api/v1/client-error");

const helpers = clientErrorModule._private;
const { createClientErrorHandler } = helpers;

async function runHandler({ method = "POST", body, streamChunks = null, logger = () => {} }) {
  const handler = createClientErrorHandler({ logError: logger });
  const req = createMockRequest({ method, body });
  const res = createMockResponse();

  const pending = handler(req, res);
  if (Array.isArray(streamChunks)) {
    process.nextTick(() => {
      for (const chunk of streamChunks) {
        req.emit("data", chunk);
      }
      req.emit("end");
    });
  }
  await pending;
  return { req, res };
}

const apiFeatureText = `
Feature: Client error API behavior

Scenario: Reject non-POST methods
  Given a client-error request method "GET"
  When the client-error API is called
  Then the client-error response status is 405
  And the client-error payload error is "Method not allowed"
  And the client-error allow header is "POST"

Scenario: Reject invalid JSON payload string
  Given a client-error JSON string payload "{invalid json"
  When the client-error API is called
  Then the client-error response status is 400
  And the client-error payload error is "Invalid payload"

Scenario: Reject non-object payloads
  Given a client-error object payload type "array"
  When the client-error API is called
  Then the client-error response status is 400
  And the client-error payload error is "Invalid payload"

Scenario: Reject oversized payload objects
  Given a client-error object payload type "oversized"
  When the client-error API is called
  Then the client-error response status is 413
  And the client-error payload error is "Payload too large"

Scenario: Accept valid payload objects
  Given a client-error object payload type "valid"
  When the client-error API is called
  Then the client-error response status is 204
  And the client-error response has ended

Scenario: Accept streamed payload objects
  Given a streamed client-error payload type "valid"
  When the client-error API is called
  Then the client-error response status is 204
  And the client-error response has ended

Scenario: Reject oversized streamed payload objects
  Given a streamed client-error payload type "oversized"
  When the client-error API is called
  Then the client-error response status is 413
  And the client-error payload error is "Payload too large"
  And the request stream is destroyed
`;

defineFeature(test, apiFeatureText, {
  createWorld: () => ({
    req: {
      method: "POST",
      body: undefined,
      streamChunks: null,
    },
    response: null,
    request: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given a client-error request method "([^"]*)"$/,
      run: ({ args, world }) => {
        world.req.method = args[0];
      },
    },
    {
      pattern: /^Given a client-error JSON string payload "([^"]*)"$/,
      run: ({ args, world }) => {
        world.req.body = args[0];
      },
    },
    {
      pattern: /^Given a client-error object payload type "([^"]*)"$/,
      run: ({ args, world }) => {
        if (args[0] === "array") {
          world.req.body = ["not", "an", "object"];
          return;
        }
        if (args[0] === "oversized") {
          world.req.body = {
            type: "client-error",
            message: "x".repeat(20_000),
          };
          return;
        }

        world.req.body = {
          type: "client-error",
          message: "Boom",
          context: {
            metricName: "first_successful_render",
            departureCount: 5,
          },
        };
      },
    },
    {
      pattern: /^Given a streamed client-error payload type "([^"]*)"$/,
      run: ({ args, world }) => {
        world.req.body = undefined;
        if (args[0] === "oversized") {
          world.req.streamChunks = ["x".repeat(9000)];
          return;
        }

        world.req.streamChunks = [
          JSON.stringify({
            type: "client-error",
            message: "stream payload",
          }),
        ];
      },
    },
    {
      pattern: /^When the client-error API is called$/,
      run: async ({ world }) => {
        const result = await runHandler({
          method: world.req.method,
          body: world.req.body,
          streamChunks: world.req.streamChunks,
        });
        world.request = result.req;
        world.response = result.res;
      },
    },
    {
      pattern: /^Then the client-error response status is (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.statusCode, Number(args[0]));
      },
    },
    {
      pattern: /^Then the client-error payload error is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.deepEqual(world.response.payload, { error: args[0] });
      },
    },
    {
      pattern: /^Then the client-error allow header is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.headers.get("allow"), args[0]);
      },
    },
    {
      pattern: /^Then the client-error response has ended$/,
      run: ({ assert, world }) => {
        assert.equal(world.response.ended, true);
      },
    },
    {
      pattern: /^Then the request stream is destroyed$/,
      run: ({ assert, world }) => {
        assert.equal(world.request.destroyed, true);
      },
    },
  ],
});

const helperFeatureText = `
Feature: Client error helper behavior

Scenario: Truncate nested context and mark object truncation
  Given a deeply nested context payload
  When context sanitization runs
  Then sanitized context includes "_truncated" marker
  And sanitized context includes "[Truncated]" marker

Scenario: Return infinity for circular payload byte size
  Given a circular payload object
  When payload byte size is calculated
  Then payload byte size is positive infinity

Scenario: Reject non-plain object payload sanitization
  Given a non-object payload value
  When payload sanitization runs
  Then payload sanitization result is null

Scenario: Sanitize unsupported context values into safe strings
  Given a symbol context payload
  When context sanitization runs
  Then sanitized context equals "Symbol(client)"

Scenario: Reject oversized raw payload parsing
  Given an oversized raw payload string
  When raw payload parsing runs
  Then raw payload parsing throws "Payload too large"

Scenario: Return request body object payload directly
  Given a request body object payload
  When request payload parsing runs
  Then parsed request payload message equals "Boom"

Scenario: Reject null payload validation
  Given a null payload value
  When payload validation runs
  Then payload validation error equals "Invalid payload"

Scenario: Reject payloads that exceed body limit after sanitization
  Given a payload that expands after sanitization
  When payload validation runs
  Then payload validation error equals "Payload too large"
`;

defineFeature(test, helperFeatureText, {
  createWorld: () => ({
    input: {},
    output: null,
    error: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given a deeply nested context payload$/,
      run: ({ world }) => {
        const oversizedKeys = {};
        for (let i = 0; i < 40; i += 1) {
          oversizedKeys[`key-${i}`] = `value-${i}`;
        }
        world.input.context = {
          nested: { level2: { level3: { level4: "too deep" } } },
          ...oversizedKeys,
        };
      },
    },
    {
      pattern: /^When context sanitization runs$/,
      run: ({ world }) => {
        world.output = helpers.sanitizeContext(world.input.context);
      },
    },
    {
      pattern: /^Then sanitized context includes "_truncated" marker$/,
      run: ({ assert, world }) => {
        assert.equal(world.output._truncated, true);
      },
    },
    {
      pattern: /^Then sanitized context includes "\[Truncated\]" marker$/,
      run: ({ assert, world }) => {
        assert.equal(world.output.nested.level2.level3, "[Truncated]");
      },
    },
    {
      pattern: /^Given a circular payload object$/,
      run: ({ world }) => {
        const payload = {};
        payload.self = payload;
        world.input.payload = payload;
      },
    },
    {
      pattern: /^When payload byte size is calculated$/,
      run: ({ world }) => {
        world.output = helpers.getPayloadByteSize(world.input.payload);
      },
    },
    {
      pattern: /^Then payload byte size is positive infinity$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, Number.POSITIVE_INFINITY);
      },
    },
    {
      pattern: /^Given a non-object payload value$/,
      run: ({ world }) => {
        world.input.payload = "string value";
      },
    },
    {
      pattern: /^Given a symbol context payload$/,
      run: ({ world }) => {
        world.input.context = Symbol("client");
      },
    },
    {
      pattern: /^Given an oversized raw payload string$/,
      run: ({ world }) => {
        world.input.rawPayload = "x".repeat(9000);
      },
    },
    {
      pattern: /^Given a request body object payload$/,
      run: ({ world }) => {
        world.input.request = {
          body: {
            type: "client-error",
            message: "Boom",
          },
        };
      },
    },
    {
      pattern: /^Given a null payload value$/,
      run: ({ world }) => {
        world.input.payload = null;
      },
    },
    {
      pattern: /^Given a payload that expands after sanitization$/,
      run: ({ world }) => {
        const largeContext = {};
        for (let i = 0; i < 30; i += 1) {
          largeContext[`key_${i}_${"z".repeat(80)}`] = "x".repeat(400);
        }
        world.input.payload = {
          type: "client-error-type-that-will-be-trimmed".repeat(4),
          message: "message".repeat(200),
          stack: "stack".repeat(500),
          url: "https://example.com/path/".repeat(40),
          userAgent: "agent".repeat(120),
          timestamp: "2026-02-28T00:00:00.000Z".repeat(5),
          context: largeContext,
          toJSON() {
            return { small: true };
          },
        };
      },
    },
    {
      pattern: /^When payload sanitization runs$/,
      run: ({ world }) => {
        world.output = helpers.sanitizePayload(world.input.payload);
      },
    },
    {
      pattern: /^When raw payload parsing runs$/,
      run: ({ world }) => {
        world.error = null;
        world.output = null;
        try {
          world.output = helpers.parseRawPayload(world.input.rawPayload);
        } catch (error) {
          world.error = error;
        }
      },
    },
    {
      pattern: /^When request payload parsing runs$/,
      run: async ({ world }) => {
        world.output = await helpers.parseRequestPayload(world.input.request);
      },
    },
    {
      pattern: /^When payload validation runs$/,
      run: ({ world }) => {
        world.output = helpers.validateSanitizedPayload(world.input.payload);
      },
    },
    {
      pattern: /^Then payload sanitization result is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Then sanitized context equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0]);
      },
    },
    {
      pattern: /^Then raw payload parsing throws "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.error?.message, args[0]);
      },
    },
    {
      pattern: /^Then parsed request payload message equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.message, args[0]);
      },
    },
    {
      pattern: /^Then payload validation error equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.error, args[0]);
      },
    },
  ],
});
