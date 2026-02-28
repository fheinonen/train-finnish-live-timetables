const { test, expect } = require("@playwright/test");
const { defineFeature } = require("../helpers/playwright-bdd");

function nextIso(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function buildBusPayload() {
  return {
    mode: "BUS",
    station: {
      stopName: "Kamppi",
      stopCode: "H1234",
      stopCodes: ["H1234"],
      type: "stop",
      distanceMeters: 140,
      departures: [
        {
          line: "550",
          destination: "Pasila",
          departureIso: nextIso(2),
          stopId: "HSL:1234",
          stopCode: "H1234",
          stopName: "Kamppi",
        },
        {
          line: "550",
          destination: "Itakeskus",
          departureIso: nextIso(7),
          stopId: "HSL:1234",
          stopCode: "H1234",
          stopName: "Kamppi",
        },
      ],
    },
    stops: [
      {
        id: "HSL:1234",
        name: "Kamppi",
        code: "H1234",
        stopCodes: ["H1234"],
        distanceMeters: 140,
      },
    ],
    selectedStopId: "HSL:1234",
    filterOptions: {
      lines: [{ value: "550", count: 2 }],
      destinations: [
        { value: "Pasila", count: 1 },
        { value: "Itakeskus", count: 1 },
      ],
    },
  };
}

async function installApiMocks(page) {
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/departures") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify(buildBusPayload()),
      });
      return;
    }

    if (url.pathname === "/api/v1/client-error") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Not found" }),
    });
  });

  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
}

async function installSingleFrameWhiteFlashInjection(page) {
  await page.addInitScript(() => {
    const attach = () => {
      const button = document.getElementById("stopFiltersToggleBtn");
      const panel = document.getElementById("stopFiltersPanel");
      if (!button || !panel) {
        requestAnimationFrame(attach);
        return;
      }

      button.addEventListener(
        "click",
        () => {
          let frames = 0;
          const waitUntilVisible = () => {
            frames += 1;
            const rect = panel.getBoundingClientRect();
            if (rect.height > 12 || frames > 20) {
              const previousBackground = panel.style.background;
              panel.style.background = "rgb(255, 255, 255)";
              requestAnimationFrame(() => {
                panel.style.background = previousBackground;
              });
              return;
            }
            requestAnimationFrame(waitUntilVisible);
          };
          requestAnimationFrame(waitUntilVisible);
        },
        { once: true }
      );
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
      return;
    }
    attach();
  });
}

async function runPanelRafProbe(page) {
  return page.evaluate(async () => {
    const parseCssColor = (value) => {
      const match = String(value || "")
        .trim()
        .match(/^rgba?\(([^)]+)\)$/i);
      if (!match) return null;
      const parts = match[1].split(",").map((part) => Number(part.trim()));
      if (parts.length < 3 || parts.some((part, index) => index < 3 && Number.isNaN(part))) {
        return null;
      }
      return {
        r: parts[0],
        g: parts[1],
        b: parts[2],
        a: Number.isFinite(parts[3]) ? parts[3] : 1,
      };
    };

    const panel = document.querySelector("#stopFiltersPanel");
    const toggle = document.querySelector("#stopFiltersToggleBtn");
    if (!panel || !toggle) {
      return {
        totalSamples: 0,
        visibleSamples: 0,
        solidWhiteFrames: 0,
        maxObservedAlpha: 0,
      };
    }

    const samples = [];
    const start = performance.now();
    toggle.click();

    await new Promise((resolve) => {
      const sample = (now) => {
        const elapsedMs = now - start;
        const computed = getComputedStyle(panel);
        const color = parseCssColor(computed.backgroundColor);
        const panelRect = panel.getBoundingClientRect();
        const opacity = Number.parseFloat(computed.opacity) || 0;
        const colorAlpha = color?.a ?? 0;
        const isVisible = opacity > 0.08 && panelRect.height > 8;
        const isSolidWhite =
          isVisible &&
          color &&
          color.r >= 248 &&
          color.g >= 248 &&
          color.b >= 248 &&
          colorAlpha >= 0.92;

        samples.push({
          elapsedMs,
          opacity,
          colorAlpha,
          height: panelRect.height,
          isSolidWhite,
        });

        if (elapsedMs >= 520) {
          resolve();
          return;
        }

        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    const visibleSamples = samples.filter((sample) => sample.opacity > 0.08 && sample.height > 8);
    const solidWhiteFrames = visibleSamples.filter((sample) => sample.isSolidWhite).length;
    const maxObservedAlpha = samples.reduce((max, sample) => Math.max(max, sample.colorAlpha), 0);

    return {
      totalSamples: samples.length,
      visibleSamples: visibleSamples.length,
      solidWhiteFrames,
      maxObservedAlpha,
    };
  });
}

async function runPanelExpandCollapseOpacityProbe(page) {
  return page.evaluate(async () => {
    const panel = document.querySelector("#stopFiltersPanel");
    const toggle = document.querySelector("#stopFiltersToggleBtn");
    if (!panel || !toggle) {
      return {
        expandVisibleSamples: 0,
        expandLowOpacityVisibleFrames: 0,
        collapseVisibleSamples: 0,
        collapseLowOpacityVisibleFrames: 0,
      };
    }

    const sampleWindow = async (durationMs) => {
      const samples = [];
      const start = performance.now();
      await new Promise((resolve) => {
        const sample = (now) => {
          const elapsedMs = now - start;
          const computed = getComputedStyle(panel);
          const panelRect = panel.getBoundingClientRect();
          const opacity = Number.parseFloat(computed.opacity) || 0;
          const isVisible = opacity > 0.08 && panelRect.height > 8;
          const isLowOpacityWhileVisible = isVisible && opacity < 0.95;

          samples.push({
            opacity,
            height: panelRect.height,
            isVisible,
            isLowOpacityWhileVisible,
          });

          if (elapsedMs >= durationMs) {
            resolve();
            return;
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      return samples;
    };

    toggle.click();
    const expandSamples = await sampleWindow(520);
    toggle.click();
    const collapseSamples = await sampleWindow(520);

    const expandVisibleSamples = expandSamples.filter((sample) => sample.isVisible).length;
    const expandLowOpacityVisibleFrames = expandSamples.filter(
      (sample) => sample.isLowOpacityWhileVisible
    ).length;
    const collapseVisibleSamples = collapseSamples.filter((sample) => sample.isVisible).length;
    const collapseLowOpacityVisibleFrames = collapseSamples.filter(
      (sample) => sample.isLowOpacityWhileVisible
    ).length;

    return {
      expandVisibleSamples,
      expandLowOpacityVisibleFrames,
      collapseVisibleSamples,
      collapseLowOpacityVisibleFrames,
    };
  });
}

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "RAF flicker probe is maintained in Chromium only."
);

const featureText = `
Feature: Light theme filter expansion flicker probe

Scenario: RAF probe catches a one-frame white flash during panel expansion
  Given light theme bus-mode preferences are persisted
  And departures API mocks are installed for flicker probing
  And a one-frame white flash is injected on filter panel expansion
  When the stop filters panel is expanded under RAF style sampling
  Then the RAF probe reports at least 1 solid white frame

Scenario: Light theme panel expansion has no solid white flash
  Given light theme bus-mode preferences are persisted
  And departures API mocks are installed for flicker probing
  When the stop filters panel is expanded under RAF style sampling
  Then the RAF probe reports 0 solid white frames

Scenario: Light theme panel expand and collapse avoid washed frames
  Given light theme bus-mode preferences are persisted
  And departures API mocks are installed for flicker probing
  When the stop filters panel is expanded and collapsed under RAF opacity sampling
  Then the expand probe reports 0 low-opacity visible frames
  And the collapse probe reports 0 low-opacity visible frames
`;

defineFeature(test, featureText, {
  failFirstProbe: true,
  createWorld: ({ fixtures }) => ({
    page: fixtures.page,
    probe: null,
    opacityProbe: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given light theme bus-mode preferences are persisted$/,
      run: async ({ world }) => {
        await world.page.addInitScript(() => {
          window.localStorage.setItem("location:granted", "1");
          window.localStorage.setItem("theme", "light");
          window.localStorage.setItem("prefs:mode", "bus");
        });
      },
    },
    {
      pattern: /^Given departures API mocks are installed for flicker probing$/,
      run: async ({ world }) => {
        await installApiMocks(world.page);
      },
    },
    {
      pattern: /^Given a one-frame white flash is injected on filter panel expansion$/,
      run: async ({ world }) => {
        await installSingleFrameWhiteFlashInjection(world.page);
      },
    },
    {
      pattern: /^When the stop filters panel is expanded under RAF style sampling$/,
      run: async ({ world }) => {
        await world.page.goto("/");
        await expect(world.page.locator("#busControls")).toBeVisible();
        await expect(world.page.locator("#stopFiltersPanel")).toHaveClass(/hidden/);
        world.probe = await runPanelRafProbe(world.page);
      },
    },
    {
      pattern: /^When the stop filters panel is expanded and collapsed under RAF opacity sampling$/,
      run: async ({ world }) => {
        await world.page.goto("/");
        await expect(world.page.locator("#busControls")).toBeVisible();
        await expect(world.page.locator("#stopFiltersPanel")).toHaveClass(/hidden/);
        world.opacityProbe = await runPanelExpandCollapseOpacityProbe(world.page);
      },
    },
    {
      pattern: /^Then the RAF probe reports at least (\d+) solid white frame$/,
      run: async ({ assert, args, world }) => {
        const expectedMinimum = Number(args[0]);
        assert.ok(world.probe, "Expected probe result");
        assert.ok(
          world.probe.solidWhiteFrames >= expectedMinimum,
          `Expected at least ${expectedMinimum} solid white frame(s), observed ${world.probe.solidWhiteFrames}`
        );
      },
    },
    {
      pattern: /^Then the RAF probe reports (\d+) solid white frames$/,
      run: async ({ assert, args, world }) => {
        const expectedCount = Number(args[0]);
        assert.ok(world.probe, "Expected probe result");
        assert.equal(world.probe.solidWhiteFrames, expectedCount);
      },
    },
    {
      pattern: /^Then the expand probe reports (\d+) low-opacity visible frames$/,
      run: async ({ assert, args, world }) => {
        const expectedCount = Number(args[0]);
        assert.ok(world.opacityProbe, "Expected opacity probe result");
        assert.equal(world.opacityProbe.expandLowOpacityVisibleFrames, expectedCount);
      },
    },
    {
      pattern: /^Then the collapse probe reports (\d+) low-opacity visible frames$/,
      run: async ({ assert, args, world }) => {
        const expectedCount = Number(args[0]);
        assert.ok(world.opacityProbe, "Expected opacity probe result");
        assert.equal(world.opacityProbe.collapseLowOpacityVisibleFrames, expectedCount);
      },
    },
  ],
});
