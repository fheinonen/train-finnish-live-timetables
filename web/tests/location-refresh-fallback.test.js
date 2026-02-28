const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Location refresh fallback

Scenario: Retry with high accuracy when coarse location is unavailable
  Given browser geolocation is available
  And the first location attempt fails with code 2
  When the user refreshes location
  Then the refresh retries once with high accuracy

Scenario: Do not retry when location permission is denied
  Given browser geolocation is available
  And the first location attempt fails with code 1
  When the user refreshes location
  Then the refresh does not retry and permission is required
`;

function bootDataApi(world) {
  const scriptPath = path.resolve(__dirname, "../scripts/app/03-data.js");
  const scriptText = fs.readFileSync(scriptPath, "utf8");

  const geolocationCalls = [];
  const geolocation = {
    getCurrentPosition(success, error, options) {
      geolocationCalls.push({ success, error, options });
    },
  };

  const permissionRequiredCalls = [];
  const statusCalls = [];

  const context = {
    window: {
      HMApp: {
        api: {
          setResolvedLocationHint: () => {},
          setStatus: (status) => statusCalls.push(status),
          setPermissionRequired: (required) => permissionRequiredCalls.push(Boolean(required)),
          setLoading: () => {},
          setStorageItem: () => {},
          getGeolocationErrorStatus: (error) => `geo:${error?.code ?? "unknown"}`,
          updateNextSummary: () => {},
          uniqueNonEmptyStrings: (items) =>
            [...new Set((Array.isArray(items) ? items : []).filter((item) => String(item || "").trim()))],
          sanitizeStopSelections: () => {},
          getActiveResultsLimit: () => 8,
          render: () => {},
          setLastUpdated: () => {},
          buildStatusFromResponse: () => "",
          trackFirstSuccessfulRender: () => {},
          persistUiState: () => {},
          trackInitialNearestStopResolved: () => {},
          reportClientError: () => {},
          getLoadErrorStatus: () => "load-error",
        },
        dom: {
          resultEl: {
            classList: {
              add: () => {},
            },
          },
        },
        state: {
          isLoading: false,
          isVoiceListening: false,
          currentCoords: null,
          latestResponse: null,
          locationGranted: false,
          latestLoadToken: 0,
          mode: "rail",
          busStopId: null,
          hasCompletedInitialStopModeLoad: true,
          deferInitialStopContext: false,
        },
        constants: {
          MODE_TRAM: "tram",
          MODE_METRO: "metro",
          MODE_BUS: "bus",
          FETCH_TIMEOUT_MS: 8000,
          VOICE_SILENCE_STOP_MS: 1200,
          VOICE_RECOGNITION_TIMEOUT_MS: 8000,
          VOICE_QUERY_MIN_LENGTH: 3,
        },
      },
    },
    navigator: {
      geolocation,
      language: "en-US",
      languages: ["en-US"],
    },
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ station: { departures: [] }, stops: [] }),
    }),
    document: {
      createElement: () => ({
        addEventListener: () => {},
      }),
    },
    URLSearchParams,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Set,
    Promise,
    RegExp,
    Error,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
  };

  vm.createContext(context);
  vm.runInContext(scriptText, context, { filename: scriptPath });

  world.api = context.window.HMApp.api;
  world.geolocationCalls = geolocationCalls;
  world.permissionRequiredCalls = permissionRequiredCalls;
  world.statusCalls = statusCalls;
}

defineFeature(test, featureText, {
  createWorld: () => ({
    api: null,
    geolocationCalls: [],
    firstErrorCode: null,
    permissionRequiredCalls: [],
    statusCalls: [],
  }),
  stepDefinitions: [
    {
      pattern: /^Given browser geolocation is available$/,
      run: ({ world }) => {
        bootDataApi(world);
      },
    },
    {
      pattern: /^Given the first location attempt fails with code (\d+)$/,
      run: ({ args, world }) => {
        world.firstErrorCode = Number(args[0]);
      },
    },
    {
      pattern: /^When the user refreshes location$/,
      run: ({ assert, world }) => {
        const started = world.api.requestLocationAndLoad();
        assert.equal(started, true);
        world.geolocationCalls[0].error({ code: world.firstErrorCode });
      },
    },
    {
      pattern: /^Then the refresh retries once with high accuracy$/,
      run: ({ assert, world }) => {
        assert.equal(world.geolocationCalls.length, 2);
        assert.equal(world.geolocationCalls[1].options.enableHighAccuracy, true);
      },
    },
    {
      pattern: /^Then the refresh does not retry and permission is required$/,
      run: ({ assert, world }) => {
        assert.equal(world.geolocationCalls.length, 1);
        assert.equal(world.permissionRequiredCalls.at(-1), true);
        assert.equal(world.statusCalls.at(-1), "geo:1");
      },
    },
  ],
});
