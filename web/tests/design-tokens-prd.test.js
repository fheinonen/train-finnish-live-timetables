const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Design tokens match PRD target values

Scenario: Spacing tokens match PRD scale
  Given the design token stylesheet
  When spacing tokens are inspected
  Then token --space-1 equals "4px"
  And token --space-2 equals "8px"
  And token --space-3 equals "12px"
  And token --space-4 equals "16px"
  And token --space-6 equals "24px"
  And token --space-8 equals "32px"

Scenario: Typography tokens match PRD scale
  Given the design token stylesheet
  When typography tokens are inspected
  Then token --text-xs equals "0.75rem"
  And token --text-sm equals "0.875rem"
  And token --text-base equals "1rem"
  And token --text-lg equals "1.125rem"
  And token --text-xl equals "1.5rem"
  And token --text-2xl equals "2rem"

Scenario: Motion tokens match PRD
  Given the design token stylesheet
  When motion tokens are inspected
  Then token --ease-out equals "cubic-bezier(0.16, 1, 0.3, 1)"
  And token --duration-fast equals "150ms"
  And token --duration-normal equals "250ms"

Scenario: Surface tokens defined
  Given the design token stylesheet
  When surface tokens are inspected
  Then token --surface-0 equals "#080c16"
  And token --surface-1 equals "#0d1321"
  And token --surface-2 equals "#141c2d"
  And token --surface-3 equals "#1e2a3f"
`;

function extractTokenValue(css, tokenName) {
  const escaped = tokenName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escaped}:\\s*([^;]+);`);
  const match = css.match(regex);
  return match ? match[1].trim() : null;
}

defineFeature(test, featureText, {
  createWorld: () => ({
    css: "",
  }),
  stepDefinitions: [
    {
      pattern: /^Given the design token stylesheet$/,
      run: ({ world }) => {
        world.css = fs.readFileSync(path.resolve(__dirname, "../styles/tokens.css"), "utf8");
      },
    },
    {
      pattern: /^When (?:spacing|typography|motion|surface) tokens are inspected$/,
      run: () => {},
    },
    {
      pattern: /^Then token (--[\w-]+) equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const value = extractTokenValue(world.css, args[0]);
        assert.ok(value !== null, `Expected token ${args[0]} to exist`);
        assert.equal(value, args[1]);
      },
    },
  ],
});
