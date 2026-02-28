const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Result cards can toggle stop mode filters

Scenario: Tapping hero line toggles line filter on and off
  Given stop mode departures with lines "550" and "560"
  When result card line "550" is toggled
  Then active line filters equal "550"
  And visible departures are filtered to line "550"
  And stop filters panel is open
  And filter pill feedback is visible
  When result card line "550" is toggled again
  Then active line filters equal ""

Scenario: Tapping list destination toggles destination filter
  Given stop mode departures with destinations "Kamppi" and "Pasila"
  When result card destination "Kamppi" is toggled
  Then active destination filters equal "Kamppi"
  And visible departures are filtered to destination "Kamppi"

Scenario: Tapping selected stop in a result card deselects to nearest stop
  Given stop mode with nearest stop "nearest-stop" and selected stop "custom-stop"
  When result card stop "custom-stop" is toggled
  Then selected stop equals "nearest-stop"

Scenario: Tapping nearest stop toggles explicit stop filter on and off
  Given stop mode with nearest stop "nearest-stop" and selected stop "nearest-stop"
  When result card stop "nearest-stop" is toggled
  Then stop filter summary text equals "1 filter"
  When result card stop "nearest-stop" is toggled again
  Then stop filter summary text equals "No filters"

Scenario: Tapping alternative stop applies stop filter state
  Given stop mode with nearest stop "nearest-stop" and alternative stop "custom-stop"
  When result card stop "custom-stop" is toggled
  Then selected stop equals "custom-stop"
  And stop filter summary text equals "1 filter"

Scenario: Filters dropdown lists real stop ids with card stop code labels
  Given stop mode departures with stop ids "HSL:1001" and "HSL:2002"
  When stop filters panel controls are rendered
  Then filters panel stop id options equal "HSL:1001,HSL:2002"
  And filters panel stop labels equal "H1001,H2002"
  When filters panel stop id "HSL:2002" is toggled
  Then active member stop filter id equals "HSL:2002"
  And visible departures are filtered to stop id "HSL:2002"
  When data scope is refreshed from latest response
  Then data scope chips equal "Stop H2002"
  When filters panel stop id "HSL:2002" is toggled again
  Then active member stop filter id equals ""
  When data scope is refreshed from latest response
  Then data scope is hidden

Scenario: Real departure stop id resolves and toggles matching selectable stop
  Given stop mode with nearest stop "nearest-stop", alternative stop "custom-stop", and departure stop id "HSL:2002"
  When result card stop target is resolved from departure stop id
  Then resolved stop target equals "custom-stop"
  When resolved result card stop is toggled
  Then selected stop equals "custom-stop"
  And visible departures are filtered to stop id "HSL:2002"
  And stop filter summary text equals "1 filter"

Scenario: Stop code fallback keeps real departure stop id for filtering
  Given stop mode with nearest stop "nearest-stop", alternative stop code "2001", and unresolved departure stop id "HSL:2002"
  When result card stop target details are resolved from departure stop id
  Then resolved stop target equals "custom-stop"
  And resolved member stop id equals "HSL:2002"
  When resolved stop target details are toggled
  Then visible departures are filtered to stop id "HSL:2002"

Scenario: Card tap feedback keeps panel open during lock window
  Given stop mode departures with lines "550" and "560"
  When result card line "550" is toggled
  And the user requests closing stop filters panel immediately
  Then stop filters panel is open

Scenario: Compact viewport keeps results visible by skipping panel auto-open
  Given compact viewport stop mode departures with lines "550" and "560"
  When result card line "550" is toggled
  Then stop filters panel is closed
  And filter pill feedback is visible
`;

function createClassList(initialClasses = []) {
  const set = new Set(initialClasses);
  return {
    add: (...names) => names.forEach((name) => set.add(name)),
    remove: (...names) => names.forEach((name) => set.delete(name)),
    toggle(name, force) {
      if (force === true) {
        set.add(name);
        return true;
      }
      if (force === false) {
        set.delete(name);
        return false;
      }
      if (set.has(name)) {
        set.delete(name);
        return false;
      }
      set.add(name);
      return true;
    },
    contains: (name) => set.has(name),
    toString: () => [...set].join(" "),
  };
}

function createMockElement(tagName = "div", initialClasses = []) {
  const attributes = new Map();
  const listeners = new Map();
  const classList = createClassList(initialClasses);
  const element = {
    tagName: String(tagName || "div").toUpperCase(),
    textContent: "",
    dataset: {},
    style: {
      setProperty() {},
    },
    classList,
    children: [],
    innerHTML: "",
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      attributes.set(String(name), String(value));
    },
    removeAttribute(name) {
      attributes.delete(String(name));
    },
    getAttribute(name) {
      return attributes.has(String(name)) ? attributes.get(String(name)) : null;
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    dispatch(type, event = {}) {
      const handlers = listeners.get(type) || [];
      for (const handler of handlers) handler(event);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
  };

  Object.defineProperty(element, "className", {
    get() {
      return classList.toString();
    },
    set(nextClassName) {
      const next = String(nextClassName || "")
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean);
      classList.remove(...String(classList).split(/\s+/).filter(Boolean));
      classList.add(...next);
    },
  });

  return element;
}

function buildDepartures(values, key) {
  return values.map((value, index) => {
    const departure = {
      line: `L${index + 1}`,
      destination: `D${index + 1}`,
      departureIso: new Date(Date.now() + (index + 2) * 60000).toISOString(),
      stopId: `HSL:${1000 + index + 1}`,
      stopCode: "1001",
      stopName: "Test stop",
    };
    departure[key] = value;
    return departure;
  });
}

function createUiHarness({
  mode = "bus",
  departures = [],
  viewportWidth = 1024,
  busStops = [{ id: "nearest-stop", name: "Nearest", code: "1001", stopCodes: ["1001"], distanceMeters: 90 }],
  busStopId = "nearest-stop",
  stopFilterPinned = false,
} = {}) {
  const dom = {
    busControlsEl: createMockElement("section", ["hidden"]),
    busStopSelectEl: createMockElement("button"),
    busStopSelectLabelEl: createMockElement("span"),
    busStopSelectListEl: createMockElement("ul"),
    busStopFiltersEl: createMockElement("div"),
    busLineFiltersEl: createMockElement("div"),
    busDestinationFiltersEl: createMockElement("div"),
    stopFiltersToggleBtnEl: createMockElement("button"),
    stopFiltersPanelEl: createMockElement("div", ["hidden"]),
    stopFilterSummaryEl: createMockElement("span"),
    dataScopeEl: createMockElement("p", ["hidden"]),
    resultEl: createMockElement("section"),
    stationTitleEl: createMockElement("h2"),
    stationMetaEl: createMockElement("p"),
    departuresEl: createMockElement("ul"),
    nextSummaryEl: createMockElement("div", ["hidden"]),
    nextLabelEl: createMockElement("p"),
    nextMinsEl: createMockElement("span"),
    nextLineEl: createMockElement("span"),
    nextTrackEl: createMockElement("span"),
    nextDestinationEl: createMockElement("p"),
    resultsLimitSelectEl: createMockElement("button"),
    resultsLimitSelectLabelEl: createMockElement("span"),
    resultsLimitSelectListEl: createMockElement("ul"),
  };

  const calls = {
    persist: 0,
    status: 0,
    load: 0,
    requestLocation: 0,
    trackInteraction: 0,
    trackStopContext: 0,
  };

  const app = {
    api: {
      uniqueNonEmptyStrings(values) {
        if (!Array.isArray(values)) return [];
        return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
      },
      persistUiState() {
        calls.persist += 1;
      },
      setStatus() {
        calls.status += 1;
      },
      buildStatusFromResponse() {
        return "status";
      },
      load() {
        calls.load += 1;
      },
      requestLocationAndLoad() {
        calls.requestLocation += 1;
      },
      trackFirstManualInteraction() {
        calls.trackInteraction += 1;
      },
      trackFirstManualStopContextChange() {
        calls.trackStopContext += 1;
      },
      getActiveResultsLimit() {
        return 8;
      },
    },
    dom,
    state: {
      mode,
      helsinkiOnly: false,
      busStops,
      busStopId,
      busLineFilters: [],
      busDestinationFilters: [],
      busFilterOptions: {
        lines: [...new Set(departures.map((item) => String(item.line || "").trim()).filter(Boolean))].map(
          (value) => ({ value, count: 1 })
        ),
        destinations: [
          ...new Set(departures.map((item) => String(item.destination || "").trim()).filter(Boolean)),
        ].map((value) => ({ value, count: 1 })),
      },
      stopFiltersPanelOpen: false,
      stopFilterPinned,
      currentCoords: { lat: 60.1, lon: 24.9 },
      latestResponse: {
        station: {
          stopName: "Station",
          stopCode: "1001",
          stopCodes: ["1001"],
          distanceMeters: 120,
          departures,
        },
      },
    },
    constants: {
      MODE_RAIL: "rail",
      MODE_TRAM: "tram",
      MODE_METRO: "metro",
      MODE_BUS: "bus",
      RESULT_LIMIT_OPTIONS: [8, 12, 16],
    },
  };

  const scriptPath = path.resolve(__dirname, "../scripts/app/02-ui.js");
  const scriptText = fs.readFileSync(scriptPath, "utf8");
  const context = {
    window: { HMApp: app, innerWidth: viewportWidth },
    document: {
      createElement: (tagName) => createMockElement(tagName),
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
    Date,
    Set,
    String,
    Number,
    Math,
    Array,
    Object,
    RegExp,
    Boolean,
    console,
  };

  vm.createContext(context);
  vm.runInContext(scriptText, context, { filename: scriptPath });

  return { app, dom, calls };
}

defineFeature(test, featureText, {
  createWorld: () => ({
    harness: null,
    lastVisibleDepartures: [],
    departureForResolution: null,
    stationForResolution: null,
    resolvedStopTarget: null,
    resolvedStopTargetDetails: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given stop mode departures with lines "([^"]*)" and "([^"]*)"$/,
      run: ({ args, world }) => {
        const departures = buildDepartures([args[0], args[1]], "line");
        world.harness = createUiHarness({ departures });
      },
    },
    {
      pattern: /^Given compact viewport stop mode departures with lines "([^"]*)" and "([^"]*)"$/,
      run: ({ args, world }) => {
        const departures = buildDepartures([args[0], args[1]], "line");
        world.harness = createUiHarness({ departures, viewportWidth: 375 });
      },
    },
    {
      pattern: /^When result card line "([^"]*)" is toggled$/,
      run: ({ args, world }) => {
        world.harness.app.api.toggleLineFilterFromResultCard(args[0]);
        world.lastVisibleDepartures = world.harness.app.api.getVisibleDepartures(
          world.harness.app.state.latestResponse.station.departures
        );
      },
    },
    {
      pattern: /^When result card line "([^"]*)" is toggled again$/,
      run: ({ args, world }) => {
        world.harness.app.api.toggleLineFilterFromResultCard(args[0]);
      },
    },
    {
      pattern: /^Then active line filters equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const expected = args[0] ? args[0].split(",").filter(Boolean) : [];
        assert.deepEqual(Array.from(world.harness.app.state.busLineFilters), expected);
      },
    },
    {
      pattern: /^Then visible departures are filtered to line "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.ok(world.lastVisibleDepartures.length > 0, "Expected at least one visible departure");
        assert.equal(world.lastVisibleDepartures.every((item) => item.line === args[0]), true);
      },
    },
    {
      pattern: /^Then stop filters panel is open$/,
      run: ({ assert, world }) => {
        assert.equal(world.harness.app.state.stopFiltersPanelOpen, true);
      },
    },
    {
      pattern: /^Then stop filters panel is closed$/,
      run: ({ assert, world }) => {
        assert.equal(world.harness.app.state.stopFiltersPanelOpen, false);
      },
    },
    {
      pattern: /^Then filter pill feedback is visible$/,
      run: ({ assert, world }) => {
        const summaryClass = world.harness.dom.stopFilterSummaryEl.classList;
        const toggleClass = world.harness.dom.stopFiltersToggleBtnEl.classList;
        assert.equal(summaryClass.contains("is-attention"), true);
        assert.equal(toggleClass.contains("is-attention"), true);
      },
    },
    {
      pattern: /^Given stop mode departures with destinations "([^"]*)" and "([^"]*)"$/,
      run: ({ args, world }) => {
        const departures = buildDepartures([args[0], args[1]], "destination");
        world.harness = createUiHarness({ departures });
      },
    },
    {
      pattern: /^Given stop mode departures with stop ids "([^"]*)" and "([^"]*)"$/,
      run: ({ args, world }) => {
        const toStopCode = (stopId) => {
          const normalized = String(stopId || "").trim();
          const suffix = normalized.includes(":") ? normalized.split(":").pop() : normalized;
          return suffix ? `H${suffix}` : "";
        };
        const departures = buildDepartures(["550", "560"], "line").map((departure, index) => ({
          ...departure,
          stopId: args[index],
          stopCode: toStopCode(args[index]),
          stopName: index === 0 ? "Nearest" : "Custom",
        }));
        world.harness = createUiHarness({
          departures,
          busStops: [
            {
              id: "nearest-stop",
              name: "Nearest",
              code: toStopCode(args[0]),
              stopCodes: [toStopCode(args[0])],
              memberStopIds: [args[0]],
              distanceMeters: 90,
            },
            {
              id: "custom-stop",
              name: "Custom",
              code: toStopCode(args[1]),
              stopCodes: [toStopCode(args[1])],
              memberStopIds: [args[1]],
              distanceMeters: 220,
            },
          ],
          busStopId: "nearest-stop",
        });
      },
    },
    {
      pattern: /^When result card destination "([^"]*)" is toggled$/,
      run: ({ args, world }) => {
        world.harness.app.api.toggleDestinationFilterFromResultCard(args[0]);
        world.lastVisibleDepartures = world.harness.app.api.getVisibleDepartures(
          world.harness.app.state.latestResponse.station.departures
        );
      },
    },
    {
      pattern: /^Then active destination filters equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const expected = args[0] ? args[0].split(",").filter(Boolean) : [];
        assert.deepEqual(Array.from(world.harness.app.state.busDestinationFilters), expected);
      },
    },
    {
      pattern: /^Then visible departures are filtered to destination "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.ok(world.lastVisibleDepartures.length > 0, "Expected at least one visible departure");
        assert.equal(world.lastVisibleDepartures.every((item) => item.destination === args[0]), true);
      },
    },
    {
      pattern: /^Given stop mode with nearest stop "([^"]*)" and selected stop "([^"]*)"$/,
      run: ({ args, world }) => {
        world.harness = createUiHarness({
          departures: buildDepartures(["550", "560"], "line"),
          busStops: [
            { id: args[0], name: "Nearest", code: "1001", stopCodes: ["1001"], distanceMeters: 90 },
            { id: args[1], name: "Custom", code: "2001", stopCodes: ["2001"], distanceMeters: 220 },
          ],
          busStopId: args[1],
          stopFilterPinned: args[1] !== args[0],
        });
      },
    },
    {
      pattern: /^Given stop mode with nearest stop "([^"]*)" and alternative stop "([^"]*)"$/,
      run: ({ args, world }) => {
        world.harness = createUiHarness({
          departures: buildDepartures(["550", "560"], "line"),
          busStops: [
            { id: args[0], name: "Nearest", code: "1001", stopCodes: ["1001"], distanceMeters: 90 },
            { id: args[1], name: "Custom", code: "2001", stopCodes: ["2001"], distanceMeters: 220 },
          ],
          busStopId: args[0],
        });
      },
    },
    {
      pattern: /^Given stop mode with nearest stop "([^"]*)", alternative stop "([^"]*)", and departure stop id "([^"]*)"$/,
      run: ({ args, world }) => {
        const departures = [
          {
            line: "550",
            destination: "Kamppi",
            departureIso: new Date(Date.now() + 120000).toISOString(),
            stopId: "HSL:1001",
            stopCode: "1001",
            stopName: "Nearest",
          },
          {
            line: "550",
            destination: "Kamppi",
            departureIso: new Date(Date.now() + 180000).toISOString(),
            stopId: args[2],
            stopCode: "2001",
            stopName: "Custom",
          },
        ];
        world.harness = createUiHarness({
          departures,
          busStops: [
            {
              id: args[0],
              name: "Nearest",
              code: "1001",
              stopCodes: ["1001"],
              memberStopIds: ["HSL:1001"],
              distanceMeters: 90,
            },
            {
              id: args[1],
              name: "Custom",
              code: "2001",
              stopCodes: ["2001"],
              memberStopIds: ["HSL:2001", "HSL:2002"],
              distanceMeters: 220,
            },
          ],
          busStopId: args[0],
        });
        world.departureForResolution = {
          line: "550",
          destination: "Kamppi",
          stopId: args[2],
          stopCode: "",
          stopName: "Custom",
          departureIso: new Date(Date.now() + 120000).toISOString(),
        };
        world.stationForResolution = {
          stopCode: "1001",
          stopCodes: ["1001"],
          stopName: "Station",
        };
      },
    },
    {
      pattern:
        /^Given stop mode with nearest stop "([^"]*)", alternative stop code "([^"]*)", and unresolved departure stop id "([^"]*)"$/,
      run: ({ args, world }) => {
        const departures = [
          {
            line: "550",
            destination: "Kamppi",
            departureIso: new Date(Date.now() + 2 * 60000).toISOString(),
            stopId: args[2],
            stopCode: args[1],
            stopName: "Custom",
          },
          {
            line: "560",
            destination: "Pasila",
            departureIso: new Date(Date.now() + 4 * 60000).toISOString(),
            stopId: "HSL:3001",
            stopCode: args[1],
            stopName: "Custom",
          },
        ];

        world.harness = createUiHarness({
          departures,
          busStops: [
            {
              id: args[0],
              name: "Nearest",
              code: "1001",
              stopCodes: ["1001"],
              memberStopIds: ["HSL:1001"],
              distanceMeters: 90,
            },
            {
              id: "custom-stop",
              name: "Custom",
              code: args[1],
              stopCodes: [args[1]],
              distanceMeters: 220,
            },
          ],
          busStopId: args[0],
        });

        world.departureForResolution = departures[0];
        world.stationForResolution = {
          stopCode: "1001",
          stopCodes: [args[1]],
          stopName: "Station",
        };
      },
    },
    {
      pattern: /^When result card stop "([^"]*)" is toggled$/,
      run: ({ args, world }) => {
        world.harness.app.api.toggleStopFromResultCard(args[0]);
        world.lastVisibleDepartures = world.harness.app.api.getVisibleDepartures(
          world.harness.app.state.latestResponse.station.departures
        );
      },
    },
    {
      pattern: /^When stop filters panel controls are rendered$/,
      run: ({ world }) => {
        world.harness.app.api.renderStopControls();
      },
    },
    {
      pattern: /^Then filters panel stop id options equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const expected = args[0].split(",").map((value) => value.trim()).filter(Boolean);
        const actual = (world.harness.dom.busStopFiltersEl.children || [])
          .map((item) => String(item?.dataset?.value || "").trim())
          .filter(Boolean);
        assert.deepEqual(actual, expected);
      },
    },
    {
      pattern: /^Then filters panel stop labels equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const expected = args[0].split(",").map((value) => value.trim()).filter(Boolean);
        const actual = (world.harness.dom.busStopFiltersEl.children || [])
          .map((item) => String(item?.textContent || "").trim())
          .filter(Boolean);
        assert.deepEqual(actual, expected);
      },
    },
    {
      pattern: /^When filters panel stop id "([^"]*)" is toggled$/,
      run: ({ args, world }) => {
        const button = (world.harness.dom.busStopFiltersEl.children || []).find(
          (item) => String(item?.dataset?.value || "").trim() === args[0]
        );
        if (!button) throw new Error(`Could not find stop id filter button ${args[0]}`);
        button.dispatch("click");
        world.lastVisibleDepartures = world.harness.app.api.getVisibleDepartures(
          world.harness.app.state.latestResponse.station.departures
        );
      },
    },
    {
      pattern: /^When filters panel stop id "([^"]*)" is toggled again$/,
      run: ({ args, world }) => {
        const button = (world.harness.dom.busStopFiltersEl.children || []).find(
          (item) => String(item?.dataset?.value || "").trim() === args[0]
        );
        if (!button) throw new Error(`Could not find stop id filter button ${args[0]}`);
        button.dispatch("click");
      },
    },
    {
      pattern: /^Then active member stop filter id equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(String(world.harness.app.state.busStopMemberFilterId || ""), args[0]);
      },
    },
    {
      pattern: /^When data scope is refreshed from latest response$/,
      run: ({ world }) => {
        world.harness.app.api.updateDataScope(world.harness.app.state.latestResponse);
      },
    },
    {
      pattern: /^Then data scope chips equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const expected = args[0].split(",").map((value) => value.trim()).filter(Boolean);
        const actual = (world.harness.dom.dataScopeEl.children || [])
          .map((item) => String(item?.textContent || "").trim())
          .filter(Boolean);
        assert.deepEqual(actual, expected);
      },
    },
    {
      pattern: /^Then data scope is hidden$/,
      run: ({ assert, world }) => {
        assert.equal(world.harness.dom.dataScopeEl.classList.contains("hidden"), true);
      },
    },
    {
      pattern: /^When result card stop "([^"]*)" is toggled again$/,
      run: ({ args, world }) => {
        world.harness.app.api.toggleStopFromResultCard(args[0]);
        world.lastVisibleDepartures = world.harness.app.api.getVisibleDepartures(
          world.harness.app.state.latestResponse.station.departures
        );
      },
    },
    {
      pattern: /^When result card stop target is resolved from departure stop id$/,
      run: ({ world }) => {
        world.resolvedStopTarget = world.harness.app.api.resolveStopIdFromDeparture(
          world.departureForResolution,
          world.stationForResolution
        );
      },
    },
    {
      pattern: /^When result card stop target details are resolved from departure stop id$/,
      run: ({ world }) => {
        world.resolvedStopTargetDetails = world.harness.app.api.resolveStopTargetFromDeparture(
          world.departureForResolution,
          world.stationForResolution
        );
        world.resolvedStopTarget = world.resolvedStopTargetDetails.selectableStopId;
      },
    },
    {
      pattern: /^Then resolved stop target equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.resolvedStopTarget, args[0]);
      },
    },
    {
      pattern: /^When resolved result card stop is toggled$/,
      run: ({ world }) => {
        world.harness.app.api.toggleStopFromResultCard(
          world.resolvedStopTarget,
          world.departureForResolution?.stopId
        );
        world.lastVisibleDepartures = world.harness.app.api.getVisibleDepartures(
          world.harness.app.state.latestResponse.station.departures
        );
      },
    },
    {
      pattern: /^When resolved stop target details are toggled$/,
      run: ({ world }) => {
        world.harness.app.api.toggleStopFromResultCard(
          world.resolvedStopTargetDetails?.selectableStopId,
          world.resolvedStopTargetDetails?.memberStopId
        );
        world.lastVisibleDepartures = world.harness.app.api.getVisibleDepartures(
          world.harness.app.state.latestResponse.station.departures
        );
      },
    },
    {
      pattern: /^Then resolved member stop id equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.resolvedStopTargetDetails?.memberStopId, args[0]);
      },
    },
    {
      pattern: /^Then visible departures are filtered to stop id "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.ok(world.lastVisibleDepartures.length > 0, "Expected at least one visible departure");
        assert.equal(world.lastVisibleDepartures.every((item) => item.stopId === args[0]), true);
      },
    },
    {
      pattern: /^Then selected stop equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.harness.app.state.busStopId, args[0]);
      },
    },
    {
      pattern: /^Then stop filter summary text equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.harness.dom.stopFilterSummaryEl.textContent, args[0]);
      },
    },
    {
      pattern: /^When the user requests closing stop filters panel immediately$/,
      run: ({ world }) => {
        world.harness.app.api.toggleStopFiltersPanel(false);
      },
    },
  ],
});
