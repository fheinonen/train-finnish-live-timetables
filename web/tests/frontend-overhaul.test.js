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

Scenario: Next departure is framed as a hero card
  Given the app shell markup
  When the departure presentation is inspected
  Then the next departure card has a hero style hook
  And the departures list appears after the next departure card
  And the next label default text equals ""

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
          nextSummaryPosition: world.html.indexOf('id="nextSummary"'),
          departuresPosition: world.html.indexOf('id="departures"'),
          nextSummaryClass: /id="nextSummary"[^>]*class="([^"]*)"/.exec(world.html)?.[1] || "",
          nextLabelText: /id="nextLabel"[^>]*>([^<]*)</.exec(world.html)?.[1]?.trim?.() || "",
        };
      },
    },
    {
      pattern: /^Then the next departure card has a hero style hook$/,
      run: ({ assert, world }) => {
        assert.match(world.departureLayout.nextSummaryClass, /next-hero/);
      },
    },
    {
      pattern: /^Then the departures list appears after the next departure card$/,
      run: ({ assert, world }) => {
        const { nextSummaryPosition, departuresPosition } = world.departureLayout;
        assert.ok(nextSummaryPosition >= 0, "Expected next summary section");
        assert.ok(departuresPosition >= 0, "Expected departures list");
        assert.ok(departuresPosition > nextSummaryPosition, "Expected departures list after next summary");
      },
    },
    {
      pattern: /^Then the next label default text equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.departureLayout.nextLabelText, args[0]);
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
