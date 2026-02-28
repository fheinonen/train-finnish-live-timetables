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
        {
          line: "52",
          destination: "Kuninkaantammi via Huopa",
          departureIso: nextIso(1),
          stopId: "HSL:1513",
          stopCode: "H1513",
          stopName: "Talontie",
        },
        {
          line: "300",
          destination: "Myyrmaki via Pahkinarinne",
          departureIso: nextIso(2),
          stopId: "HSL:1513",
          stopCode: "H1513",
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
        { value: "52", count: 2 },
        { value: "300", count: 1 },
      ],
      destinations: [
        { value: "Espoon keskus via Pitajanmaki as.", count: 1 },
        { value: "Otaniemi via Munkkivuori", count: 1 },
        { value: "Kuninkaantammi via Huopa", count: 1 },
        { value: "Myyrmaki via Pahkinarinne", count: 1 },
      ],
    },
  };
}

const featureText = `
Feature: UI visual regression workflow

Scenario: Desktop visual baseline remains stable
  Given deterministic visual mocks are installed
  And deterministic runtime state is configured
  When the app is opened in desktop viewport
  Then the main board matches the approved desktop baseline

Scenario: Mobile visual baseline remains stable
  Given deterministic visual mocks are installed
  And deterministic runtime state is configured
  When the app is opened in mobile viewport
  Then the main board matches the approved mobile baseline
`;

defineFeature(test, featureText, {
  failFirstProbe: false,
  createWorld: ({ fixtures }) => ({
    page: fixtures.page,
  }),
  stepDefinitions: [
    {
      pattern: /^Given deterministic visual mocks are installed$/,
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
      pattern: /^Given deterministic runtime state is configured$/,
      run: async ({ world }) => {
        const fixedNowMs = new Date(FIXED_NOW_ISO).getTime();
        await world.page.addInitScript(({ nowMs }) => {
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

          const realMathRandom = Math.random;
          Math.random = () => 0.42;
          window.__restoreMathRandom = () => {
            Math.random = realMathRandom;
          };
        }, { nowMs: fixedNowMs });
      },
    },
    {
      pattern: /^When the app is opened in desktop viewport$/,
      run: async ({ world }) => {
        await world.page.setViewportSize({ width: 1280, height: 960 });
        await world.page.goto("/?mode=bus");
        await expect(world.page.locator("#departures > li").first()).toBeVisible();
      },
    },
    {
      pattern: /^Then the main board matches the approved desktop baseline$/,
      run: async ({ world, assert }) => {
        assert.ok(true);
        await expect(world.page.locator(".board")).toHaveScreenshot("ui-board-desktop.png", {
          animations: "disabled",
          caret: "hide",
          scale: "css",
          maxDiffPixels: 120,
        });
      },
    },
    {
      pattern: /^When the app is opened in mobile viewport$/,
      run: async ({ world }) => {
        await world.page.setViewportSize({ width: 390, height: 844 });
        await world.page.goto("/?mode=bus");
        await expect(world.page.locator("#departures > li").first()).toBeVisible();
      },
    },
    {
      pattern: /^Then the main board matches the approved mobile baseline$/,
      run: async ({ world, assert }) => {
        assert.ok(true);
        await expect(world.page.locator(".board")).toHaveScreenshot("ui-board-mobile.png", {
          animations: "disabled",
          caret: "hide",
          scale: "css",
          maxDiffPixels: 120,
        });
      },
    },
  ],
});
