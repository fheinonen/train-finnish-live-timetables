const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Result card touch target ergonomics

Scenario: Destination and stop taps have separated hit targets
  Given the departures stylesheet
  When result card touch target styles are inspected
  Then train rows use "var(--space-2)" vertical spacing between destination and stop
  And destination filter trigger has minimum hit height "36px"
  And stop filter trigger has minimum hit height "36px"

Scenario: Active destination filter is visually prominent
  Given the departures stylesheet
  When active destination filter styles are inspected
  Then active destination filter background equals "var(--interactive-active-bg)"
  And active destination filter border equals "1px solid var(--interactive-active-border)"
  And active destination filter text weight equals "var(--weight-bold)"
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
    trainGap: null,
    destinationHitHeight: null,
    stopHitHeight: null,
    activeDestinationBackground: null,
    activeDestinationBorder: null,
    activeDestinationWeight: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given the departures stylesheet$/,
      run: ({ world }) => {
        world.css = fs.readFileSync(path.resolve(__dirname, "../styles/departures.css"), "utf8");
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
  ],
});
