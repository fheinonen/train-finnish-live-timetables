const assert = require("node:assert/strict");

const STEP_PATTERN = /^(Given|When|Then|And|But)\s+(.+)$/i;
const SCENARIO_PATTERN = /^Scenario:\s+(.+)$/i;
const FAIL_FIRST_PROBE_ERROR = "__bdd_fail_first_probe__";

function parseFeature(featureText) {
  const scenarios = [];
  const lines = String(featureText || "").split(/\r?\n/);
  let currentScenario = null;
  let previousKeyword = "Given";

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || /^Feature:/i.test(line)) {
      continue;
    }

    const scenarioMatch = line.match(SCENARIO_PATTERN);
    if (scenarioMatch) {
      currentScenario = {
        name: scenarioMatch[1].trim(),
        steps: [],
      };
      previousKeyword = "Given";
      scenarios.push(currentScenario);
      continue;
    }

    const stepMatch = line.match(STEP_PATTERN);
    if (!stepMatch) {
      throw new Error(`Invalid feature syntax at line ${lineNumber}: ${rawLine}`);
    }
    if (!currentScenario) {
      throw new Error(`Step before Scenario at line ${lineNumber}: ${rawLine}`);
    }

    const rawKeyword = stepMatch[1];
    const stepText = stepMatch[2].trim();
    const keyword =
      /^and$/i.test(rawKeyword) || /^but$/i.test(rawKeyword)
        ? previousKeyword
        : normalizeKeyword(rawKeyword);
    previousKeyword = keyword;

    currentScenario.steps.push({
      lineNumber,
      rawKeyword,
      keyword,
      text: stepText,
      phrase: `${keyword} ${stepText}`,
    });
  }

  if (scenarios.length === 0) {
    throw new Error("Feature does not contain any Scenario sections");
  }
  for (const scenario of scenarios) {
    if (scenario.steps.length === 0) {
      throw new Error(`Scenario "${scenario.name}" does not contain steps`);
    }
  }
  return scenarios;
}

function normalizeKeyword(keyword) {
  const normalized = String(keyword || "").toLowerCase();
  if (normalized === "given") return "Given";
  if (normalized === "when") return "When";
  if (normalized === "then") return "Then";
  throw new Error(`Unsupported step keyword: ${keyword}`);
}

function normalizeStepDefinitions(stepDefinitions) {
  if (!Array.isArray(stepDefinitions) || stepDefinitions.length === 0) {
    throw new Error("Step definitions are required");
  }

  return stepDefinitions.map((definition, index) => {
    if (!definition || (typeof definition !== "object" && !Array.isArray(definition))) {
      throw new Error(`Invalid step definition at index ${index}`);
    }

    const pattern = Array.isArray(definition) ? definition[0] : definition.pattern;
    const run = Array.isArray(definition) ? definition[1] : definition.run;
    if (!(typeof pattern === "string" || pattern instanceof RegExp)) {
      throw new Error(`Step definition ${index} has invalid pattern`);
    }
    if (typeof run !== "function") {
      throw new Error(`Step definition ${index} has invalid run function`);
    }

    return { pattern, run };
  });
}

function resolveStep(step, stepDefinitions) {
  const matches = [];

  for (const definition of stepDefinitions) {
    const { pattern } = definition;
    if (typeof pattern === "string") {
      if (pattern.toLowerCase() === step.phrase.toLowerCase()) {
        matches.push({ definition, args: [] });
      }
      continue;
    }

    const regex = new RegExp(pattern.source, pattern.flags);
    const match = step.phrase.match(regex);
    if (match) {
      matches.push({ definition, args: match.slice(1) });
    }
  }

  if (matches.length === 0) {
    throw new Error(`Missing step definition for: "${step.phrase}"`);
  }
  if (matches.length > 1) {
    throw new Error(`Ambiguous step definition for: "${step.phrase}"`);
  }
  return matches[0];
}

function createFailFirstProbeAssert() {
  const fail = () => {
    throw new Error(FAIL_FIRST_PROBE_ERROR);
  };

  let proxy = null;
  proxy = new Proxy(fail, {
    apply: () => fail(),
    get: (_, property) => {
      if (property === "strict") return proxy;
      return fail;
    },
  });
  return proxy;
}

async function executeScenario({ scenario, stepDefinitions, world, assertionApi = assert }) {
  for (let index = 0; index < scenario.steps.length; index += 1) {
    const step = scenario.steps[index];
    const match = resolveStep(step, stepDefinitions);
    await match.definition.run({
      assert: assertionApi,
      args: match.args,
      scenario,
      step,
      world,
    });
  }
}

async function assertFailFirstProbe({ scenario, stepDefinitions, createWorld }) {
  try {
    await executeScenario({
      scenario,
      stepDefinitions,
      world: createWorld(),
      assertionApi: createFailFirstProbeAssert(),
    });
  } catch (error) {
    if (error?.message === FAIL_FIRST_PROBE_ERROR) {
      return;
    }
    throw error;
  }

  throw new Error(`Fail-first probe did not hit any assertions in scenario "${scenario.name}"`);
}

function defineFeature(test, featureText, { createWorld, stepDefinitions, failFirstProbe = true } = {}) {
  if (typeof createWorld !== "function") {
    throw new Error("createWorld() is required");
  }

  const normalizedDefinitions = normalizeStepDefinitions(stepDefinitions);
  const scenarios = parseFeature(featureText);

  for (const scenario of scenarios) {
    test(scenario.name, { concurrency: false }, async () => {
      if (failFirstProbe) {
        await assertFailFirstProbe({
          scenario,
          stepDefinitions: normalizedDefinitions,
          createWorld,
        });
      }

      await executeScenario({
        scenario,
        stepDefinitions: normalizedDefinitions,
        world: createWorld(),
      });
    });
  }
}

module.exports = {
  parseFeature,
  defineFeature,
  executeScenario,
  FAIL_FIRST_PROBE_ERROR,
};
