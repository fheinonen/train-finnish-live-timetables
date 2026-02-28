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
  ],
});
