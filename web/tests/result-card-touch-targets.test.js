const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Result card touch target ergonomics

Scenario: Destination and stop taps have separated hit targets
  Given the departures stylesheet
  When result card touch target styles are inspected
  Then train rows use "var(--space-3)" vertical spacing between destination and stop
  And destination filter trigger has minimum hit height "44px"
  And stop filter trigger has minimum hit height "44px"

Scenario: Hero card exposes dedicated filter rail targets
  Given the departures stylesheet
  And the app shell markup
  When hero card filter rail styles are inspected
  Then hero card filter rail exists
  And hero card filter rail gap equals "var(--space-3)"
  And hero destination filter trigger has minimum hit height "44px"
  And hero stop filter trigger has minimum hit height "44px"
  And hero stop filter trigger width equals "100%"

Scenario: Active destination filter is visually prominent
  Given the departures stylesheet
  When active destination filter styles are inspected
  Then active destination filter background equals "var(--interactive-active-bg)"
  And active destination filter border equals "1px solid var(--interactive-active-border)"
  And active destination filter text weight equals "var(--weight-bold)"

Scenario: Active stop filter uses cyan capsule styling
  Given the departures stylesheet
  When active stop filter styles are inspected
  Then active stop filter background equals "var(--interactive-bg-hover)"
  And active stop filter border equals "1px solid var(--interactive-border-hover)"
  And active stop filter text color equals "var(--interactive-text)"
  And active stop filter text weight equals "var(--weight-semibold)"
`;

function getRuleBody(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  return match ? match[1] : "";
}

function getDeclarationValue(block, propertyName) {
  const escapedPropertyName = propertyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`${escapedPropertyName}\\s*:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
}

defineFeature(test, featureText, {
  createWorld: () => ({
    css: "",
    html: "",
    trainGap: null,
    destinationHitHeight: null,
    stopHitHeight: null,
    hasHeroFilterRail: false,
    heroRailGap: null,
    heroDestinationHitHeight: null,
    heroStopHitHeight: null,
    heroStopWidth: null,
    activeDestinationBackground: null,
    activeDestinationBorder: null,
    activeDestinationWeight: null,
    activeStopBackground: null,
    activeStopBorder: null,
    activeStopColor: null,
    activeStopWeight: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given the departures stylesheet$/,
      run: ({ world }) => {
        world.css = fs.readFileSync(path.resolve(__dirname, "../styles/departures.css"), "utf8");
      },
    },
    {
      pattern: /^Given the app shell markup$/,
      run: ({ world }) => {
        world.html = fs.readFileSync(path.resolve(__dirname, "../index.html"), "utf8");
      },
    },
    {
      pattern: /^When result card touch target styles are inspected$/,
      run: ({ world }) => {
        const trainRule = getRuleBody(world.css, ".train");
        const destinationRule = getRuleBody(world.css, ".destination.result-filter-trigger");
        const stopRule = getRuleBody(world.css, ".track.result-filter-trigger");

        world.trainGap = getDeclarationValue(trainRule, "gap");
        world.destinationHitHeight = getDeclarationValue(destinationRule, "min-height");
        world.stopHitHeight = getDeclarationValue(stopRule, "min-height");
      },
    },
    {
      pattern: /^When active destination filter styles are inspected$/,
      run: ({ world }) => {
        const activeDestinationRule = getRuleBody(world.css, ".destination.result-filter-trigger.is-active");
        world.activeDestinationBackground = getDeclarationValue(activeDestinationRule, "background");
        world.activeDestinationBorder = getDeclarationValue(activeDestinationRule, "border");
        world.activeDestinationWeight = getDeclarationValue(activeDestinationRule, "font-weight");
      },
    },
    {
      pattern: /^When active stop filter styles are inspected$/,
      run: ({ world }) => {
        const activeStopRule = getRuleBody(world.css, ".track.result-filter-trigger.is-active");
        world.activeStopBackground = getDeclarationValue(activeStopRule, "background");
        world.activeStopBorder = getDeclarationValue(activeStopRule, "border");
        world.activeStopColor = getDeclarationValue(activeStopRule, "color");
        world.activeStopWeight = getDeclarationValue(activeStopRule, "font-weight");
      },
    },
    {
      pattern: /^When hero card filter rail styles are inspected$/,
      run: ({ world }) => {
        const heroRailRule = getRuleBody(world.css, ".next-filter-rail");
        const heroDestinationRule = getRuleBody(world.css, "#nextDestination.result-filter-trigger");
        const heroStopRule = getRuleBody(world.css, "#nextTrack.result-filter-trigger");

        world.hasHeroFilterRail = /id="nextSummary"[\s\S]*class="[^"]*next-hero[^"]*"/.test(world.html) &&
          /class="next-filter-rail"/.test(world.html);
        world.heroRailGap = getDeclarationValue(heroRailRule, "gap");
        world.heroDestinationHitHeight = getDeclarationValue(heroDestinationRule, "min-height");
        world.heroStopHitHeight = getDeclarationValue(heroStopRule, "min-height");
        world.heroStopWidth = getDeclarationValue(heroStopRule, "width");
      },
    },
    {
      pattern: /^Then train rows use "([^"]*)" vertical spacing between destination and stop$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.trainGap, args[0]);
      },
    },
    {
      pattern: /^Then destination filter trigger has minimum hit height "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.destinationHitHeight, args[0]);
      },
    },
    {
      pattern: /^Then stop filter trigger has minimum hit height "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.stopHitHeight, args[0]);
      },
    },
    {
      pattern: /^Then hero card filter rail exists$/,
      run: ({ assert, world }) => {
        assert.equal(world.hasHeroFilterRail, true);
      },
    },
    {
      pattern: /^Then hero card filter rail gap equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.heroRailGap, args[0]);
      },
    },
    {
      pattern: /^Then hero destination filter trigger has minimum hit height "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.heroDestinationHitHeight, args[0]);
      },
    },
    {
      pattern: /^Then hero stop filter trigger has minimum hit height "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.heroStopHitHeight, args[0]);
      },
    },
    {
      pattern: /^Then hero stop filter trigger width equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.heroStopWidth, args[0]);
      },
    },
    {
      pattern: /^Then active destination filter background equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.activeDestinationBackground, args[0]);
      },
    },
    {
      pattern: /^Then active destination filter border equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.activeDestinationBorder, args[0]);
      },
    },
    {
      pattern: /^Then active destination filter text weight equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.activeDestinationWeight, args[0]);
      },
    },
    {
      pattern: /^Then active stop filter background equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.activeStopBackground, args[0]);
      },
    },
    {
      pattern: /^Then active stop filter border equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.activeStopBorder, args[0]);
      },
    },
    {
      pattern: /^Then active stop filter text color equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.activeStopColor, args[0]);
      },
    },
    {
      pattern: /^Then active stop filter text weight equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.activeStopWeight, args[0]);
      },
    },
  ],
});
