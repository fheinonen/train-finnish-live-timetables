const assert = require("node:assert/strict");
const { parseFeature } = require("./bdd");

const FAIL_FIRST_PROBE_ERROR = "__playwright_bdd_fail_first_probe__";

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

async function executeScenario({ scenario, stepDefinitions, world, fixtures, assertionApi = assert }) {
  for (let index = 0; index < scenario.steps.length; index += 1) {
    const step = scenario.steps[index];
    const match = resolveStep(step, stepDefinitions);
    await match.definition.run({
      assert: assertionApi,
      args: match.args,
      scenario,
      step,
      world,
      fixtures,
    });
  }
}

async function createScenarioWorld(createWorldFn, fixtures, testInfo, extra = {}) {
  return (await createWorldFn({ fixtures, testInfo, ...extra })) || {};
}

async function assertFailFirstProbe({ scenario, stepDefinitions, createWorldFn, fixtures, testInfo }) {
  let probeContext = null;
  let probeFixtures = fixtures;

  if (fixtures.browser && typeof fixtures.browser.newContext === "function") {
    probeContext = await fixtures.browser.newContext();
    const probePage = await probeContext.newPage();
    probeFixtures = {
      ...fixtures,
      context: probeContext,
      page: probePage,
    };
  }

  try {
    await executeScenario({
      scenario,
      stepDefinitions,
      world: await createScenarioWorld(createWorldFn, probeFixtures, testInfo, { probe: true }),
      fixtures: probeFixtures,
      assertionApi: createFailFirstProbeAssert(),
    });
  } catch (error) {
    if (error?.message === FAIL_FIRST_PROBE_ERROR) {
      if (probeContext) {
        await probeContext.close();
      }
      return;
    }
    if (probeContext) {
      await probeContext.close();
    }
    throw error;
  }

  if (probeContext) {
    await probeContext.close();
  }

  throw new Error(`Fail-first probe did not hit any assertions in scenario "${scenario.name}"`);
}

function defineFeature(
  test,
  featureText,
  { createWorld, stepDefinitions, failFirstProbe = false } = {}
) {
  if (typeof createWorld !== "function") {
    throw new Error("createWorld() is required");
  }

  const normalizedDefinitions = normalizeStepDefinitions(stepDefinitions);
  const scenarios = parseFeature(featureText);

  for (const scenario of scenarios) {
    test(scenario.name, async ({ page, context, browser, request }, testInfo) => {
      const fixtures = { page, context, browser, request };
      if (failFirstProbe) {
        await assertFailFirstProbe({
          scenario,
          stepDefinitions: normalizedDefinitions,
          createWorldFn: createWorld,
          fixtures,
          testInfo,
        });
      }

      await executeScenario({
        scenario,
        stepDefinitions: normalizedDefinitions,
        world: await createScenarioWorld(createWorld, fixtures, testInfo),
        fixtures,
      });
    });
  }
}

module.exports = {
  defineFeature,
  executeScenario,
  FAIL_FIRST_PROBE_ERROR,
};
