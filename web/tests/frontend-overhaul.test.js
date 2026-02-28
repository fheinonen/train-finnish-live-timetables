const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Frontend overhaul contracts

Scenario: Stop mode filters use progressive disclosure
  Given the app shell markup
  When stop controls are inspected
  Then a stop filter toggle action exists
  And the stop filter panel is collapsed by default
  And the stop filter summary says "No filters"
  And the stop filter category label says "Stops"

Scenario: Departures list is rendered without hero summary
  Given the app shell markup
  When the departure presentation is inspected
  Then no hero summary section exists
  And departures list exists

Scenario: Eyebrow label remains static across modes
  Given mode label UI targets are wired
  When mode labels are refreshed for "bus" mode
  Then mode eyebrow text equals "Helsinki Moves"

Scenario: Board subtitle copy is removed
  Given the app shell markup
  When the board subtitle is inspected
  Then the board subtitle text equals ""

Scenario: Last updated metadata is grouped with station header
  Given the app shell markup
  When station header metadata layout is inspected
  Then last updated metadata is placed in the station header block
  And status line is hidden by default

Scenario: Stop selector is embedded in station header
  Given the app shell markup
  When stop selector layout is inspected
  Then station header contains stop dropdown trigger
  And stop controls do not include separate stop selector

Scenario: Typography tokens define a distinct display and body pair
  Given the design token stylesheet
  When typography tokens are inspected
  Then the display font token equals "Manrope"
  And the body font token equals "Manrope"

Scenario: Stop filter summary reflects selected filters
  Given line filter count 2 and destination filter count 1
  When stop filter summary text is generated
  Then stop filter summary text equals "3 filters"

Scenario: Stop filter summary has a zero-state message
  Given line filter count 0 and destination filter count 0
  When stop filter summary text is generated
  Then stop filter summary text equals "No filters"

Scenario: Stop mode status line stays concise
  Given stop mode next departure status input
  When stop mode status text is generated
  Then stop mode status starts with "Bus in "
  And stop mode status does not include "550"
  And stop mode status does not include "Kamppi"
`;

function bootUiApi() {
  const scriptPath = path.resolve(__dirname, "../scripts/app/02-ui.js");
  const scriptText = fs.readFileSync(scriptPath, "utf8");

  const context = {
    window: {
      HMApp: {
        api: {},
        dom: {},
        state: {
          mode: "rail",
          busFilterOptions: { lines: [], destinations: [] },
          busLineFilters: [],
          busDestinationFilters: [],
          busStops: [],
        },
        constants: {
          MODE_RAIL: "rail",
          MODE_TRAM: "tram",
          MODE_METRO: "metro",
          MODE_BUS: "bus",
          RESULT_LIMIT_OPTIONS: [8, 12, 16],
        },
      },
    },
    Date,
    Set,
    String,
    Number,
    Math,
    Array,
    Object,
    RegExp,
    console,
  };

  vm.createContext(context);
  vm.runInContext(scriptText, context, { filename: scriptPath });
  return context.window.HMApp;
}

defineFeature(test, featureText, {
  createWorld: () => ({
    html: "",
    css: "",
    lineCount: 0,
    destinationCount: 0,
    actual: null,
    statusText: "",
    controls: null,
    departureLayout: null,
    boardSubtitleText: "",
    hasHeaderLastUpdated: false,
    statusHiddenByDefault: false,
    hasHeaderStopDropdown: false,
    hasToolbarStopDropdown: false,
    modeLabelApp: null,
    modeEyebrowText: "",
    typographyTokens: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given the app shell markup$/,
      run: ({ world }) => {
        world.html = fs.readFileSync(path.resolve(__dirname, "../index.html"), "utf8");
      },
    },
    {
      pattern: /^When stop controls are inspected$/,
      run: ({ world }) => {
        const summaryMatch = world.html.match(/id="stopFilterSummary"[^>]*>([^<]+)</);
        const stopFilterLabelMatch = world.html.match(
          /<p class="bus-label">([^<]+)<\/p>\s*<div id="busStopFilters"/
        );
        world.controls = {
          hasToggle: /id="stopFiltersToggleBtn"/.test(world.html),
          hasCollapsedPanel: /id="stopFiltersPanel"[^>]*class="[^"]*hidden/.test(world.html),
          summary: summaryMatch ? summaryMatch[1].trim() : null,
          stopFilterLabel: stopFilterLabelMatch ? stopFilterLabelMatch[1].trim() : null,
        };
      },
    },
    {
      pattern: /^Then a stop filter toggle action exists$/,
      run: ({ assert, world }) => {
        assert.equal(world.controls?.hasToggle, true);
      },
    },
    {
      pattern: /^Then the stop filter panel is collapsed by default$/,
      run: ({ assert, world }) => {
        assert.equal(world.controls?.hasCollapsedPanel, true);
      },
    },
    {
      pattern: /^Then the stop filter summary says "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.ok(world.controls, "Expected stop controls to be inspected");
        assert.equal(world.controls.summary, args[0]);
      },
    },
    {
      pattern: /^Then the stop filter category label says "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.ok(world.controls, "Expected stop controls to be inspected");
        assert.equal(world.controls.stopFilterLabel, args[0]);
      },
    },
    {
      pattern: /^When the departure presentation is inspected$/,
      run: ({ world }) => {
        world.departureLayout = {
          hasHeroSummary: /id="nextSummary"/.test(world.html),
          departuresPosition: world.html.indexOf('id="departures"'),
        };
      },
    },
    {
      pattern: /^Then no hero summary section exists$/,
      run: ({ assert, world }) => {
        assert.equal(world.departureLayout.hasHeroSummary, false);
      },
    },
    {
      pattern: /^Then departures list exists$/,
      run: ({ assert, world }) => {
        const { departuresPosition } = world.departureLayout;
        assert.ok(departuresPosition >= 0, "Expected departures list");
      },
    },
    {
      pattern: /^Given mode label UI targets are wired$/,
      run: ({ world }) => {
        const app = bootUiApi();
        app.dom.modeEyebrowEl = { textContent: "" };
        app.dom.nextLabelEl = { textContent: "" };
        world.modeLabelApp = app;
      },
    },
    {
      pattern: /^When mode labels are refreshed for "([^"]*)" mode$/,
      run: ({ args, world }) => {
        const app = world.modeLabelApp;
        app.state.mode = args[0];
        app.api.updateModeLabels();
        world.modeEyebrowText = app.dom.modeEyebrowEl.textContent;
      },
    },
    {
      pattern: /^Then mode eyebrow text equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.modeEyebrowText, args[0]);
      },
    },
    {
      pattern: /^When the board subtitle is inspected$/,
      run: ({ world }) => {
        world.boardSubtitleText =
          /<p class="board-subtitle">([^<]*)<\/p>/.exec(world.html)?.[1]?.trim?.() || "";
      },
    },
    {
      pattern: /^Then the board subtitle text equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.boardSubtitleText, args[0]);
      },
    },
    {
      pattern: /^When station header metadata layout is inspected$/,
      run: ({ world }) => {
        world.hasHeaderLastUpdated = /<div class="result-head">[\s\S]*<p id="stationMeta"[^>]*><\/p>[\s\S]*<p id="lastUpdated"[^>]*>[\s\S]*<\/p>[\s\S]*<div class="result-head-right">/.test(
          world.html
        );
        world.statusHiddenByDefault = /id="status"[^>]*class="[^"]*hidden/.test(world.html);
      },
    },
    {
      pattern: /^Then last updated metadata is placed in the station header block$/,
      run: ({ assert, world }) => {
        assert.equal(world.hasHeaderLastUpdated, true);
      },
    },
    {
      pattern: /^Then status line is hidden by default$/,
      run: ({ assert, world }) => {
        assert.equal(world.statusHiddenByDefault, true);
      },
    },
    {
      pattern: /^When stop selector layout is inspected$/,
      run: ({ world }) => {
        world.hasHeaderStopDropdown = /<div class="result-head">[\s\S]*id="busStopSelectWrap"[\s\S]*id="busStopSelect"[\s\S]*<\/div>[\s\S]*<div class="result-head-right">/.test(
          world.html
        );
        const busControlsSection = /<section id="busControls"[\s\S]*?<\/section>/.exec(world.html)?.[0] || "";
        world.hasToolbarStopDropdown =
          /id="busStopSelectWrap"/.test(busControlsSection) &&
          /id="busStopSelect"/.test(busControlsSection);
      },
    },
    {
      pattern: /^Then station header contains stop dropdown trigger$/,
      run: ({ assert, world }) => {
        assert.equal(world.hasHeaderStopDropdown, true);
      },
    },
    {
      pattern: /^Then stop controls do not include separate stop selector$/,
      run: ({ assert, world }) => {
        assert.equal(world.hasToolbarStopDropdown, false);
      },
    },
    {
      pattern: /^Given the design token stylesheet$/,
      run: ({ world }) => {
        world.css = fs.readFileSync(path.resolve(__dirname, "../styles/tokens.css"), "utf8");
      },
    },
    {
      pattern: /^When typography tokens are inspected$/,
      run: ({ world }) => {
        world.typographyTokens = {
          display: world.css.match(/--font-display:\s*"([^"]+)"/)?.[1] || null,
          body: world.css.match(/--font-body:\s*"([^"]+)"/)?.[1] || null,
        };
      },
    },
    {
      pattern: /^Then the display font token equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.ok(world.typographyTokens?.display, "Expected display font token");
        assert.equal(world.typographyTokens.display, args[0]);
      },
    },
    {
      pattern: /^Then the body font token equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.ok(world.typographyTokens?.body, "Expected body font token");
        assert.equal(world.typographyTokens.body, args[0]);
      },
    },
    {
      pattern: /^Given line filter count (\d+) and destination filter count (\d+)$/,
      run: ({ args, world }) => {
        world.lineCount = Number(args[0]);
        world.destinationCount = Number(args[1]);
      },
    },
    {
      pattern: /^When stop filter summary text is generated$/,
      run: ({ world }) => {
        const app = bootUiApi();
        world.actual = app.api.buildStopFilterSummary(world.lineCount, world.destinationCount);
      },
    },
    {
      pattern: /^Then stop filter summary text equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.actual, args[0]);
      },
    },
    {
      pattern: /^Given stop mode next departure status input$/,
      run: ({ world }) => {
        const app = bootUiApi();
        app.state.mode = "bus";
        app.state.busLineFilters = [];
        app.state.busDestinationFilters = [];
        app.state.stopFilterPinned = false;
        app.state.busStopMemberFilterId = null;
        world.statusText = app.api.buildStatusFromResponse({
          station: {
            stopName: "Kamppi",
            stopCode: "H1234",
            departures: [
              {
                line: "550",
                destination: "Kamppi",
                stopCode: "H1234",
                stopName: "Kamppi",
                departureIso: new Date(Date.now() + 6 * 60000).toISOString(),
              },
            ],
          },
        });
      },
    },
    {
      pattern: /^When stop mode status text is generated$/,
      run: () => {},
    },
    {
      pattern: /^Then stop mode status starts with "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.statusText.startsWith(args[0]), true);
      },
    },
    {
      pattern: /^Then stop mode status does not include "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.statusText.includes(args[0]), false);
      },
    },
  ],
});
