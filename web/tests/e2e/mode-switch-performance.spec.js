const { test, expect } = require("@playwright/test");
const { defineFeature } = require("../helpers/playwright-bdd");

function nextIso(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function buildDeparturesPayload(requestUrl) {
  const mode = String(requestUrl.searchParams.get("mode") || "RAIL").toUpperCase();
  const line = mode === "BUS" ? "550" : mode === "TRAM" ? "4" : mode === "METRO" ? "M1" : "I";
  const isStopMode = mode === "BUS" || mode === "TRAM" || mode === "METRO";

  return {
    mode,
    station: {
      stopName: isStopMode ? "Kamppi" : "Helsinki Central",
      stopCode: isStopMode ? "H1001" : undefined,
      stopCodes: isStopMode ? ["H1001"] : undefined,
      type: isStopMode ? "stop" : "station",
      distanceMeters: 140,
      departures: [
        {
          line,
          destination: "Pasila",
          departureIso: nextIso(2),
          ...(isStopMode
            ? {
                stopId: "HSL:1001",
                stopCode: "H1001",
                stopName: "Kamppi",
              }
            : { track: "4" }),
        },
        {
          line,
          destination: "Itakeskus",
          departureIso: nextIso(7),
          ...(isStopMode
            ? {
                stopId: "HSL:1001",
                stopCode: "H1001",
                stopName: "Kamppi",
              }
            : { track: "5" }),
        },
      ],
    },
    ...(isStopMode
      ? {
          stops: [
            {
              id: "HSL:1001",
              name: "Kamppi",
              code: "H1001",
              stopCodes: ["H1001"],
              distanceMeters: 140,
            },
          ],
          selectedStopId: "HSL:1001",
          filterOptions: {
            lines: [{ value: line, count: 2 }],
            destinations: [
              { value: "Pasila", count: 1 },
              { value: "Itakeskus", count: 1 },
            ],
          },
        }
      : {}),
  };
}

async function installApiMocks(page) {
  await page.route("**/api/v1/**", async (route) => {
    const requestUrl = new URL(route.request().url());

    if (requestUrl.pathname === "/api/v1/departures") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify(buildDeparturesPayload(requestUrl)),
      });
      return;
    }

    if (requestUrl.pathname === "/api/v1/client-error") {
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

const featureText = `
Feature: Mode switch performance

Scenario: Mode highlight responds quickly after mode switch click
  Given departures API mocks are installed for performance measurements
  And geolocation permission is pre-granted
  When frame timings are captured while switching from rail to bus mode
  Then mode highlight movement starts within 4 animation frames
  And mode highlight movement starts within 120 milliseconds
`;

defineFeature(test, featureText, {
  failFirstProbe: true,
  createWorld: ({ fixtures }) => ({
    page: fixtures.page,
    timing: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given departures API mocks are installed for performance measurements$/,
      run: async ({ world }) => {
        await installApiMocks(world.page);
      },
    },
    {
      pattern: /^Given geolocation permission is pre-granted$/,
      run: async ({ world }) => {
        await world.page.addInitScript(() => {
          window.localStorage.setItem("location:granted", "1");
        });
      },
    },
    {
      pattern: /^When frame timings are captured while switching from rail to bus mode$/,
      run: async ({ world }) => {
        await world.page.goto("/");
        await expect(world.page.locator("#modeBusBtn")).toBeVisible();

        world.timing = await world.page.evaluate(async () => {
          const button = document.querySelector("#modeBusBtn");
          const indicator = document.querySelector(".segment-indicator");
          if (!button || !indicator) {
            return {
              movementStartFrame: null,
              movementStartMs: null,
              maxFrameGapMs: null,
              samples: 0,
            };
          }

          const beforeTransform = getComputedStyle(indicator).transform;
          const startMs = performance.now();
          button.click();

          let movementStartFrame = null;
          let movementStartMs = null;
          const frameGaps = [];
          let previousFrameMs = startMs;

          await new Promise((resolve) => {
            function sample(frameMs) {
              frameGaps.push(frameMs - previousFrameMs);
              previousFrameMs = frameMs;

              const currentTransform = getComputedStyle(indicator).transform;
              if (movementStartFrame == null && currentTransform !== beforeTransform) {
                movementStartFrame = frameGaps.length;
                movementStartMs = frameMs - startMs;
              }

              const elapsed = frameMs - startMs;
              if (elapsed >= 260 || (movementStartFrame != null && frameGaps.length >= 8)) {
                resolve();
                return;
              }

              requestAnimationFrame(sample);
            }

            requestAnimationFrame(sample);
          });

          return {
            movementStartFrame,
            movementStartMs,
            maxFrameGapMs: frameGaps.length > 0 ? Math.max(...frameGaps) : null,
            samples: frameGaps.length,
          };
        });
      },
    },
    {
      pattern: /^Then mode highlight movement starts within 4 animation frames$/,
      run: async ({ assert, world }) => {
        assert.ok(world.timing, "Expected timing metrics");
        assert.notEqual(world.timing.movementStartFrame, null);
        assert.ok(
          world.timing.movementStartFrame <= 4,
          `Expected movement start frame <= 4 but got ${world.timing.movementStartFrame}`
        );
      },
    },
    {
      pattern: /^Then mode highlight movement starts within 120 milliseconds$/,
      run: async ({ assert, world }) => {
        assert.ok(world.timing, "Expected timing metrics");
        assert.notEqual(world.timing.movementStartMs, null);
        assert.ok(
          world.timing.movementStartMs <= 120,
          `Expected movement start <= 120ms but got ${world.timing.movementStartMs}ms`
        );
      },
    },
  ],
});
