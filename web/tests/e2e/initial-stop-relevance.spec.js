const { test, expect } = require("@playwright/test");
const { defineFeature } = require("../helpers/playwright-bdd");

function nextIso(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function buildStopModePayload(selectedStopId) {
  const selectedId = selectedStopId === "HSL:OLD" ? "HSL:OLD" : "HSL:NEAR";
  const isOld = selectedId === "HSL:OLD";

  return {
    mode: "BUS",
    station: {
      stopName: isOld ? "Old Terminal" : "Nearest Stop",
      stopCode: isOld ? "O200" : "N100",
      stopCodes: isOld ? ["O200"] : ["N100"],
      type: "stop",
      distanceMeters: isOld ? 620 : 80,
      departures: [
        {
          line: isOld ? "550" : "20",
          destination: isOld ? "Old Terminal" : "Central Railway Station",
          departureIso: nextIso(3),
          stopId: selectedId,
          stopCode: isOld ? "O200" : "N100",
          stopName: isOld ? "Old Terminal" : "Nearest Stop",
        },
      ],
    },
    stops: [
      {
        id: "HSL:NEAR",
        name: "Nearest Stop",
        code: "N100",
        stopCodes: ["N100"],
        distanceMeters: 80,
      },
      {
        id: "HSL:OLD",
        name: "Old Terminal",
        code: "O200",
        stopCodes: ["O200"],
        distanceMeters: 620,
      },
    ],
    selectedStopId: selectedId,
    filterOptions: isOld
      ? {
          lines: [{ value: "550", count: 1 }],
          destinations: [{ value: "Old Terminal", count: 1 }],
        }
      : {
          lines: [{ value: "20", count: 1 }],
          destinations: [{ value: "Central Railway Station", count: 1 }],
        },
  };
}

const featureText = `
Feature: Stop-mode relevance

Scenario: First stop-mode load ignores stale stop context and picks nearest stop
  Given stale bus stop preferences are persisted
  And departures API always returns nearest stop payload
  When the page is opened with stale bus stop query filters
  Then first departures request omits stop id
  And selected stop label equals "Nearest Stop"
  And current URL stop query equals "HSL:NEAR"
  And current URL has no line or destination filters

Scenario: Persisted stop context is restored only after explicit user re-selection
  Given stale bus stop preferences are persisted
  And departures API reflects requested stop payload
  When the page is opened with stale bus stop query filters
  And the user selects stop "HSL:OLD" from stop dropdown
  Then first departures request omits stop id
  And second departures request stop id equals "HSL:OLD"
  And selected stop label equals "Old Terminal"
  And current URL stop query equals "HSL:OLD"
`;

defineFeature(test, featureText, {
  failFirstProbe: true,
  createWorld: ({ fixtures }) => ({
    page: fixtures.page,
    departuresCalls: [],
  }),
  stepDefinitions: [
    {
      pattern: /^Given stale bus stop preferences are persisted$/,
      run: async ({ world }) => {
        await world.page.addInitScript(() => {
          window.localStorage.setItem("prefs:mode", "bus");
          window.localStorage.setItem("prefs:busStopId", "HSL:OLD");
          window.localStorage.setItem("prefs:busLines", JSON.stringify(["550"]));
          window.localStorage.setItem("prefs:busDestinations", JSON.stringify(["Old Terminal"]));
        });
      },
    },
    {
      pattern: /^Given departures API always returns nearest stop payload$/,
      run: async ({ world }) => {
        await world.page.route("**/api/v1/**", async (route) => {
          const url = new URL(route.request().url());
          if (url.pathname === "/api/v1/departures") {
            world.departuresCalls.push(url);
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              headers: { "cache-control": "no-store" },
              body: JSON.stringify(buildStopModePayload("HSL:NEAR")),
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
      pattern: /^Given departures API reflects requested stop payload$/,
      run: async ({ world }) => {
        await world.page.route("**/api/v1/**", async (route) => {
          const url = new URL(route.request().url());
          if (url.pathname === "/api/v1/departures") {
            world.departuresCalls.push(url);
            const requestedStopId = String(url.searchParams.get("stopId") || "").trim();
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              headers: { "cache-control": "no-store" },
              body: JSON.stringify(buildStopModePayload(requestedStopId)),
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
      pattern: /^When the page is opened with stale bus stop query filters$/,
      run: async ({ world }) => {
        await world.page.goto("/?mode=bus&stop=HSL:OLD&line=550&dest=Old%20Terminal");
        const allowLocationButton = world.page.locator("#locationPromptAllow");
        if (await allowLocationButton.isVisible()) {
          await allowLocationButton.click();
        }
      },
    },
    {
      pattern: /^When the user selects stop "([^"]*)" from stop dropdown$/,
      run: async ({ args, world }) => {
        await expect.poll(() => world.departuresCalls.length).toBeGreaterThan(0);
        await world.page.click("#busStopSelect");
        await world.page.click(`#busStopSelectList li[data-value="${args[0]}"]`);
      },
    },
    {
      pattern: /^Then first departures request omits stop id$/,
      run: async ({ assert, world }) => {
        await expect.poll(() => world.departuresCalls.length).toBeGreaterThan(0);
        assert.equal(world.departuresCalls[0].searchParams.has("stopId"), false);
      },
    },
    {
      pattern: /^Then second departures request stop id equals "([^"]*)"$/,
      run: async ({ assert, args, world }) => {
        await expect.poll(() => world.departuresCalls.length).toBeGreaterThan(1);
        assert.equal(world.departuresCalls[1].searchParams.get("stopId"), args[0]);
      },
    },
    {
      pattern: /^Then selected stop label equals "([^"]*)"$/,
      run: async ({ args, world }) => {
        await expect(world.page.locator("#busStopSelectLabel")).toHaveText(new RegExp(args[0]));
      },
    },
    {
      pattern: /^Then current URL stop query equals "([^"]*)"$/,
      run: async ({ assert, args, world }) => {
        await expect.poll(() => new URL(world.page.url()).searchParams.get("stop")).toBe(args[0]);
        assert.equal(new URL(world.page.url()).searchParams.get("stop"), args[0]);
      },
    },
    {
      pattern: /^Then current URL has no line or destination filters$/,
      run: async ({ assert, world }) => {
        await expect.poll(() => new URL(world.page.url()).searchParams.getAll("line").length).toBe(0);
        await expect.poll(() => new URL(world.page.url()).searchParams.getAll("dest").length).toBe(0);
        assert.equal(new URL(world.page.url()).searchParams.getAll("line").length, 0);
        assert.equal(new URL(world.page.url()).searchParams.getAll("dest").length, 0);
      },
    },
  ],
});
