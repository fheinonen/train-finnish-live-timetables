const { test, expect } = require("@playwright/test");

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

test("first stop-mode load ignores stale stop/filter state and uses nearest stop", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("prefs:mode", "bus");
    window.localStorage.setItem("prefs:busStopId", "HSL:OLD");
    window.localStorage.setItem("prefs:busLines", JSON.stringify(["550"]));
    window.localStorage.setItem("prefs:busDestinations", JSON.stringify(["Old Terminal"]));
  });

  const departuresCalls = [];

  await page.route("**/api/v1/departures**", async (route) => {
    const url = new URL(route.request().url());
    departuresCalls.push(url);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify(buildStopModePayload("HSL:NEAR")),
    });
  });

  await page.route("**/api/v1/client-error", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());

  await page.goto("/?mode=bus&stop=HSL:OLD&line=550&dest=Old%20Terminal");

  await expect.poll(() => departuresCalls.length).toBeGreaterThan(0);

  const firstCall = departuresCalls[0];
  expect(firstCall.searchParams.get("mode")).toBe("BUS");
  expect(firstCall.searchParams.has("stopId")).toBeFalsy();

  await expect(page.locator("#busStopSelectLabel")).toHaveText(/Nearest Stop/);

  await expect.poll(() => new URL(page.url()).searchParams.get("stop")).toBe("HSL:NEAR");
  await expect.poll(() => new URL(page.url()).searchParams.getAll("line").length).toBe(0);
  await expect.poll(() => new URL(page.url()).searchParams.getAll("dest").length).toBe(0);
});

test("persisted stop context is only restored after explicit user re-selection", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("prefs:mode", "bus");
    window.localStorage.setItem("prefs:busStopId", "HSL:OLD");
    window.localStorage.setItem("prefs:busLines", JSON.stringify(["550"]));
    window.localStorage.setItem("prefs:busDestinations", JSON.stringify(["Old Terminal"]));
  });

  const departuresCalls = [];

  await page.route("**/api/v1/departures**", async (route) => {
    const url = new URL(route.request().url());
    departuresCalls.push(url);
    const requestedStopId = String(url.searchParams.get("stopId") || "").trim();

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify(buildStopModePayload(requestedStopId)),
    });
  });

  await page.route("**/api/v1/client-error", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());

  await page.goto("/?mode=bus&stop=HSL:OLD&line=550&dest=Old%20Terminal");

  await expect.poll(() => departuresCalls.length).toBeGreaterThan(0);
  expect(departuresCalls[0].searchParams.has("stopId")).toBeFalsy();
  await expect(page.locator("#busStopSelectLabel")).toHaveText(/Nearest Stop/);

  // Open custom dropdown and select HSL:OLD
  await page.click("#busStopSelect");
  await page.click('#busStopSelectList li[data-value="HSL:OLD"]');

  await expect.poll(() => departuresCalls.length).toBeGreaterThan(1);
  const secondCall = departuresCalls[1];
  expect(secondCall.searchParams.get("stopId")).toBe("HSL:OLD");

  await expect(page.locator("#busStopSelectLabel")).toHaveText(/Old Terminal/);
  await expect.poll(() => new URL(page.url()).searchParams.get("stop")).toBe("HSL:OLD");
});
