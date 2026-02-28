const { test, expect } = require("@playwright/test");
const { defineFeature } = require("../helpers/playwright-bdd");

const FIXED_NOW_ISO = "2026-02-28T15:52:31+02:00";

function nextIso(minutesFromNow) {
  const base = new Date(FIXED_NOW_ISO).getTime();
  return new Date(base + minutesFromNow * 60_000).toISOString();
}

function buildVisualPayload() {
  return {
    mode: "BUS",
    station: {
      stopName: "Talontie",
      stopCode: "H1513",
      stopCodes: ["H1513"],
      type: "stop",
      distanceMeters: 242,
      departures: [
        {
          line: "200",
          destination: "Espoon keskus via Pitajanmaki as.",
          departureIso: nextIso(0),
          stopId: "HSL:1513",
          stopCode: "H1513",
          stopName: "Talontie",
        },
        {
          line: "52",
          destination: "Otaniemi via Munkkivuori",
          departureIso: nextIso(0),
          stopId: "HSL:1511",
          stopCode: "H1511",
          stopName: "Talontie",
        },
      ],
    },
    stops: [
      {
        id: "HSL:1513",
        name: "Talontie",
        code: "H1513",
        stopCodes: ["H1513"],
        distanceMeters: 242,
      },
      {
        id: "HSL:1511",
        name: "Talontie 2",
        code: "H1511",
        stopCodes: ["H1511"],
        distanceMeters: 265,
      },
    ],
    selectedStopId: "HSL:1513",
    filterOptions: {
      lines: [
        { value: "200", count: 1 },
        { value: "52", count: 1 },
      ],
      destinations: [
        { value: "Espoon keskus via Pitajanmaki as.", count: 1 },
        { value: "Otaniemi via Munkkivuori", count: 1 },
      ],
    },
  };
}

const featureText = `
Feature: UI geometry contracts

Scenario: Desktop spacing and timing geometry are consistent
  Given deterministic geometry mocks are installed
  And deterministic runtime state is configured for geometry checks
  When the app is opened in desktop viewport for geometry checks
  Then the mode indicator keeps visible inset from segment edges
  And the mode indicator keeps vertical inset uniform
  And the mode indicator uses flat styling
  And the relative departure time is larger than the absolute time

Scenario: Mobile spacing and timing geometry are consistent
  Given deterministic geometry mocks are installed
  And deterministic runtime state is configured for geometry checks
  When the app is opened in mobile viewport for geometry checks
  Then the mode indicator keeps visible inset from segment edges
  And the mode indicator keeps vertical inset uniform
  And the mode indicator uses flat styling
  And the relative departure time is larger than the absolute time
`;

defineFeature(test, featureText, {
  failFirstProbe: false,
  createWorld: ({ fixtures }) => ({
    page: fixtures.page,
  }),
  stepDefinitions: [
    {
      pattern: /^Given deterministic geometry mocks are installed$/,
      run: async ({ world }) => {
        await world.page.route("**/api/v1/**", async (route) => {
          const url = new URL(route.request().url());
          if (url.pathname === "/api/v1/departures") {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              headers: { "cache-control": "no-store" },
              body: JSON.stringify(buildVisualPayload()),
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

        await world.page.route("https://fonts.googleapis.com/**", (route) => route.abort());
        await world.page.route("https://fonts.gstatic.com/**", (route) => route.abort());
      },
    },
    {
      pattern: /^Given deterministic runtime state is configured for geometry checks$/,
      run: async ({ world }) => {
        const fixedNowMs = new Date(FIXED_NOW_ISO).getTime();
        await world.page.addInitScript(
          ({ nowMs }) => {
            const RealDate = Date;
            class FixedDate extends RealDate {
              constructor(...args) {
                if (args.length === 0) {
                  super(nowMs);
                  return;
                }
                super(...args);
              }

              static now() {
                return nowMs;
              }
            }

            FixedDate.UTC = RealDate.UTC;
            FixedDate.parse = RealDate.parse;
            FixedDate.prototype = RealDate.prototype;
            window.Date = FixedDate;
            window.localStorage.setItem("location:granted", "1");
            window.localStorage.setItem("prefs:mode", "bus");
            window.localStorage.setItem("theme", "light");
          },
          { nowMs: fixedNowMs }
        );
      },
    },
    {
      pattern: /^When the app is opened in desktop viewport for geometry checks$/,
      run: async ({ world }) => {
        await world.page.setViewportSize({ width: 1280, height: 960 });
        await world.page.goto("/?mode=bus");
        await expect(world.page.locator("#departures > li").first()).toBeVisible();
        await expect(world.page.locator("#modeBusBtn")).toHaveClass(/is-active/);
      },
    },
    {
      pattern: /^When the app is opened in mobile viewport for geometry checks$/,
      run: async ({ world }) => {
        await world.page.setViewportSize({ width: 390, height: 844 });
        await world.page.goto("/?mode=bus");
        await expect(world.page.locator("#departures > li").first()).toBeVisible();
        await expect(world.page.locator("#modeBusBtn")).toHaveClass(/is-active/);
      },
    },
    {
      pattern: /^Then the mode indicator keeps visible inset from segment edges$/,
      run: async ({ world }) => {
        // Disable transitions so we measure final position, not mid-animation
        await world.page.evaluate(() => {
          document.querySelector(".segment-indicator").style.transition = "none";
        });
        // Force a reflow so the non-transitioned position takes effect
        await world.page.evaluate(() => void document.body.offsetHeight);
        const metrics = await world.page.evaluate(() => {
          const indicator = document.querySelector(".segment-indicator");
          const segments = [...document.querySelectorAll(".segment")];
          if (!indicator || segments.length === 0) return null;
          const i = indicator.getBoundingClientRect();
          const centerX = i.left + i.width / 2;
          const centerY = i.top + i.height / 2;
          const hostSegment =
            segments.find((segment) => {
              const s = segment.getBoundingClientRect();
              return centerX >= s.left && centerX <= s.right && centerY >= s.top && centerY <= s.bottom;
            }) || null;
          if (!hostSegment) return null;
          const s = hostSegment.getBoundingClientRect();
          return {
            left: i.left - s.left,
            right: s.right - i.right,
          };
        });

        expect(metrics).not.toBeNull();
        expect(metrics.left).toBeGreaterThanOrEqual(0.5);
        expect(metrics.right).toBeGreaterThanOrEqual(0.5);
        expect(metrics.left).toBeLessThanOrEqual(14);
        expect(metrics.right).toBeLessThanOrEqual(14);
      },
    },
    {
      pattern: /^Then the mode indicator keeps vertical inset uniform$/,
      run: async ({ world }) => {
        const metrics = await world.page.evaluate(() => {
          const indicator = document.querySelector(".segment-indicator");
          const segments = [...document.querySelectorAll(".segment")];
          if (!indicator || segments.length === 0) return null;
          const i = indicator.getBoundingClientRect();
          const centerX = i.left + i.width / 2;
          const centerY = i.top + i.height / 2;
          const hostSegment =
            segments.find((segment) => {
              const s = segment.getBoundingClientRect();
              return centerX >= s.left && centerX <= s.right && centerY >= s.top && centerY <= s.bottom;
            }) || null;
          if (!hostSegment) return null;
          const s = hostSegment.getBoundingClientRect();
          return {
            top: i.top - s.top,
            bottom: s.bottom - i.bottom,
          };
        });

        expect(metrics).not.toBeNull();
        const tolerance = 1.2;
        expect(Math.abs(metrics.top - metrics.bottom)).toBeLessThanOrEqual(tolerance);
      },
    },
    {
      pattern: /^Then the mode indicator uses flat styling$/,
      run: async ({ world }) => {
        const styles = await world.page.evaluate(() => {
          const indicator = document.querySelector(".segment-indicator");
          const activeSegment = document.querySelector(".segment.is-active");
          if (!indicator || !activeSegment) return null;
          const indicatorStyle = getComputedStyle(indicator);
          const activeStyle = getComputedStyle(activeSegment);
          return {
            indicatorShadow: indicatorStyle.boxShadow,
            activeTextShadow: activeStyle.textShadow,
          };
        });

        expect(styles).not.toBeNull();
        expect(styles.indicatorShadow).toBe("none");
        expect(styles.activeTextShadow).toBe("none");
      },
    },
    {
      pattern: /^Then the relative departure time is larger than the absolute time$/,
      run: async ({ world }) => {
        const sizes = await world.page.evaluate(() => {
          const row = document.querySelector("#departures > li");
          const remaining = row?.querySelector(".remaining");
          const clock = row?.querySelector(".clock-time");
          if (!remaining || !clock) return null;
          const remainingSize = parseFloat(getComputedStyle(remaining).fontSize || "0");
          const clockSize = parseFloat(getComputedStyle(clock).fontSize || "0");
          return { remainingSize, clockSize };
        });

        expect(sizes).not.toBeNull();
        expect(sizes.remainingSize).toBeGreaterThan(sizes.clockSize);
      },
    },
  ],
});
