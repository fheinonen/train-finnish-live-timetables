const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizePickDropType,
  isBoardableStopTime,
  parseDeparture,
} = require("../api/lib/departures-utils");

function createBaseStopTime(overrides = {}) {
  return {
    serviceDay: 1_700_000_000,
    scheduledDeparture: 120,
    realtimeDeparture: 130,
    headsign: "Kamppi",
    pickupType: 0,
    dropoffType: 0,
    stop: {
      gtfsId: "HSL:1234",
      name: "Kamppi",
      code: "H1234",
      platformCode: "A",
    },
    trip: {
      route: {
        mode: "BUS",
        shortName: "550",
      },
    },
    ...overrides,
  };
}

test("normalizePickDropType maps non-boardable enum-like values", () => {
  assert.equal(normalizePickDropType("NONE"), 1);
  assert.equal(normalizePickDropType("no_pickup"), 1);
  assert.equal(normalizePickDropType("NOT_AVAILABLE"), 1);
  assert.equal(normalizePickDropType("1"), 1);
});

test("isBoardableStopTime excludes pickupType NONE", () => {
  assert.equal(isBoardableStopTime({ pickupType: 1 }), false);
  assert.equal(isBoardableStopTime({ pickupType: "NONE" }), false);
  assert.equal(isBoardableStopTime({ pickupType: 0 }), true);
});

test("parseDeparture returns boardable departures", () => {
  const parsed = parseDeparture(createBaseStopTime(), null, "BUS");

  assert.equal(parsed?.line, "550");
  assert.equal(parsed?.destination, "Kamppi");
  assert.equal(parsed?.stopId, "HSL:1234");
  assert.equal(typeof parsed?.departureIso, "string");
});

test("parseDeparture ignores arrival-only/non-boardable stop times", () => {
  const parsed = parseDeparture(createBaseStopTime({ pickupType: "NONE" }), null, "BUS");
  assert.equal(parsed, null);
});
