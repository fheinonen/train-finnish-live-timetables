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
    ],
    selectedStopId: "HSL:1513",
    filterOptions: {
      lines: [{ value: "200", count: 1 }],
      destinations: [{ value: "Espoon keskus via Pitajanmaki as.", count: 1 }],
    },
  };
}

const featureText = `
Feature: Overlay tuning tools

Scenario: Overlay controls can be used to tune against a reference
  Given deterministic overlay mocks are installed
  And deterministic runtime state is configured for overlay checks
  When the app is opened in mobile viewport with overlay tools enabled
  Then mock overlay controls are visible
  When the user sets overlay source and opacity
  Then the overlay is visible with configured opacity
  When the user presses the overlay toggle shortcut
  Then the overlay visibility toggles
`;

defineFeature(test, featureText, {
  failFirstProbe: false,
  createWorld: ({ fixtures }) => ({
    page: fixtures.page,
    overlayVisibleBeforeToggle: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given deterministic overlay mocks are installed$/,
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
      },
    },
    {
      pattern: /^Given deterministic runtime state is configured for overlay checks$/,
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
      pattern: /^When the app is opened in mobile viewport with overlay tools enabled$/,
      run: async ({ world }) => {
        await world.page.setViewportSize({ width: 390, height: 844 });
        await world.page.goto("/?mode=bus&overlay=1");
        await expect(world.page.locator("#departures > li").first()).toBeVisible();
      },
    },
    {
      pattern: /^Then mock overlay controls are visible$/,
      run: async ({ world }) => {
        await expect(world.page.locator("#mockOverlayControls")).toBeVisible();
        await expect(world.page.locator("#mockOverlayUrlInput")).toBeVisible();
      },
    },
    {
      pattern: /^When the user sets overlay source and opacity$/,
      run: async ({ world }) => {
        const tinyPngDataUrl =
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sYxQx8AAAAASUVORK5CYII=";
        await world.page.fill("#mockOverlayUrlInput", tinyPngDataUrl);
        await world.page.fill("#mockOverlayOpacityInput", "65");
      },
    },
    {
      pattern: /^Then the overlay is visible with configured opacity$/,
      run: async ({ world }) => {
        const layer = world.page.locator("#mockOverlayLayer");
        const image = world.page.locator("#mockOverlayImage");
        await expect(layer).toBeVisible();
        await expect(image).toHaveAttribute("src", /^data:image\/png;base64,/);
        await expect(image).toHaveCSS("opacity", "0.65");
      },
    },
    {
      pattern: /^When the user presses the overlay toggle shortcut$/,
      run: async ({ world }) => {
        const layer = world.page.locator("#mockOverlayLayer");
        world.overlayVisibleBeforeToggle = await layer.isVisible();
        await world.page.locator("body").click({ position: { x: 8, y: 8 } });
        await world.page.keyboard.press("o");
      },
    },
    {
      pattern: /^Then the overlay visibility toggles$/,
      run: async ({ world }) => {
        const layer = world.page.locator("#mockOverlayLayer");
        const visibleAfter = await layer.isVisible();
        expect(visibleAfter).toBe(!world.overlayVisibleBeforeToggle);
      },
    },
  ],
});
