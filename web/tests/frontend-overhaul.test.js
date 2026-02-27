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

Scenario: Next departure is framed as a hero card
  Given the app shell markup
  When the departure presentation is inspected
  Then the next departure card has a hero style hook
  And the departures list appears after the next departure card

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
          helsinkiOnly: false,
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
  return context.window.HMApp.api;
}

defineFeature(test, featureText, {
  createWorld: () => ({
    html: "",
    css: "",
    lineCount: 0,
    destinationCount: 0,
    actual: null,
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
      run: () => {},
    },
    {
      pattern: /^Then a stop filter toggle action exists$/,
      run: ({ assert, world }) => {
        assert.match(world.html, /id="stopFiltersToggleBtn"/);
      },
    },
    {
      pattern: /^Then the stop filter panel is collapsed by default$/,
      run: ({ assert, world }) => {
        assert.match(world.html, /id="stopFiltersPanel"[^>]*class="[^"]*hidden/);
      },
    },
    {
      pattern: /^Then the stop filter summary says "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const summaryMatch = world.html.match(/id="stopFilterSummary"[^>]*>([^<]+)</);
        assert.ok(summaryMatch, "Expected stop filter summary element");
        assert.equal(summaryMatch[1].trim(), args[0]);
      },
    },
    {
      pattern: /^When the departure presentation is inspected$/,
      run: () => {},
    },
    {
      pattern: /^Then the next departure card has a hero style hook$/,
      run: ({ assert, world }) => {
        assert.match(world.html, /id="nextSummary"[^>]*class="[^"]*next-hero/);
      },
    },
    {
      pattern: /^Then the departures list appears after the next departure card$/,
      run: ({ assert, world }) => {
        const nextSummaryPosition = world.html.indexOf('id="nextSummary"');
        const departuresPosition = world.html.indexOf('id="departures"');
        assert.ok(nextSummaryPosition >= 0, "Expected next summary section");
        assert.ok(departuresPosition >= 0, "Expected departures list");
        assert.ok(departuresPosition > nextSummaryPosition, "Expected departures list after next summary");
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
      run: () => {},
    },
    {
      pattern: /^Then the display font token equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const match = world.css.match(/--font-display:\s*"([^"]+)"/);
        assert.ok(match, "Expected display font token");
        assert.equal(match[1], args[0]);
      },
    },
    {
      pattern: /^Then the body font token equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const match = world.css.match(/--font-body:\s*"([^"]+)"/);
        assert.ok(match, "Expected body font token");
        assert.equal(match[1], args[0]);
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
        const api = bootUiApi();
        world.actual = api.buildStopFilterSummary(world.lineCount, world.destinationCount);
      },
    },
    {
      pattern: /^Then stop filter summary text equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.actual, args[0]);
      },
    },
  ],
});
