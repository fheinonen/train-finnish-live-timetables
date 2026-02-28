const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Mockup-inspired cards and controls contracts

Scenario: Voice action label uses Voice Search
  Given the app shell is loaded
  And the location action state module is loaded
  When the controls row is rendered
  Then the voice action button label is "Voice Search"

Scenario: Voice action accessibility label matches control text
  Given the app shell is loaded
  When controls accessibility labels are inspected
  Then the voice action aria-label is "Voice Search"

Scenario: Refresh and Voice Search controls use tightened row layout
  Given a mobile viewport
  When the controls row is displayed
  Then Refresh Location and Voice Search are rendered in a compact balanced layout without overlap

Scenario: Departure cards render with badge-destination-time hierarchy
  Given departures are available in a stop mode
  When departure cards are rendered
  Then each visible card has a prominent left route badge, center destination block, and right timing block

Scenario: Card timing prioritizes immediate departures
  Given a departure that is due now
  When its card is rendered
  Then the timing block shows "Now" in high-emphasis style
  And the card also shows its absolute departure time in the same timing block

Scenario: First result shows absolute time like other results
  Given departures are rendered
  When the first visible result card is displayed
  Then its timing area includes an absolute clock time just like non-first result cards

Scenario: Tapping card line toggles line filter
  Given departures are rendered with line "52"
  When the user taps line "52" on a departure card
  Then line filter "52" becomes active
  And tapping line "52" again removes that line filter

Scenario: Tapping card destination toggles destination filter
  Given departures are rendered with destination "Otaniemi"
  When the user taps destination "Otaniemi" on a departure card
  Then destination filter "Otaniemi" becomes active
  And tapping destination "Otaniemi" again removes that destination filter

Scenario: Tapping card stop preserves stop-filter behavior
  Given departures are rendered in a stop mode
  When the user taps a stop value on a departure card
  Then stop filter updates using current production stop-filter rules
  And the filter summary reflects the new active filter state

Scenario: Updated icons are applied to key controls
  Given the app shell is rendered
  When the user views top controls and filter affordances
  Then refresh, voice, and filter indicators use the new icon style set

Scenario: Realtime badge is removed from result header
  Given departures are rendered
  When the result header is displayed
  Then no "Realtime" badge or pill is shown

Scenario: Legacy realtime badge styles are removed
  Given the departures stylesheet
  When legacy realtime badge styles are inspected
  Then no live-pill style rules are present

Scenario: Transit mode selector matches mockup segmented style
  Given the app shell is rendered
  When the user views the mode selector
  Then all transport modes are shown inside one rounded segmented control
  And the active mode is rendered as a filled highlighted segment
  And inactive modes are visually separated with subtle dividers
  And the segmented track uses the mockup slate tone
  And the active segment uses mockup border and shadow treatment
`;

function getRuleBody(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  return match ? match[1] : "";
}

function getDeclarationValue(block, propertyName) {
  const escapedPropertyName = propertyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`${escapedPropertyName}\\s*:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
}

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
    disabled: false,
    onclick: null,
    onkeydown: null,
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
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

function createStateHarness() {
  const byId = {
    locateBtn: createMockElement("button"),
    voiceLocateBtn: createMockElement("button"),
    voiceLocateBtnLabel: createMockElement("span"),
    skeleton: createMockElement("div", ["hidden"]),
  };

  byId.voiceLocateBtnLabel.textContent = "Describe Location";

  const scriptPath = path.resolve(__dirname, "../scripts/app/01-state.js");
  const scriptText = fs.readFileSync(scriptPath, "utf8");
  const context = {
    window: {
      HMApp: {},
      localStorage: {
        getItem: () => null,
        setItem: () => {},
      },
    },
    document: {
      getElementById(id) {
        return byId[id] || null;
      },
      querySelector() {
        return null;
      },
    },
    Math,
    Date,
    Set,
    String,
    Number,
    Array,
    Object,
    JSON,
    console,
  };

  vm.createContext(context);
  vm.runInContext(scriptText, context, { filename: scriptPath });

  return {
    app: context.window.HMApp,
    dom: byId,
  };
}

function findDescendantByClass(root, className) {
  if (!root) return null;
  if (root.classList?.contains?.(className)) return root;
  for (const child of root.children || []) {
    const match = findDescendantByClass(child, className);
    if (match) return match;
  }
  return null;
}

function buildDeparture({
  line = "52",
  destination = "Otaniemi",
  minutesFromNow = 5,
  stopId = "HSL:1001",
  stopCode = "H1001",
  stopName = "Kamppi",
} = {}) {
  return {
    line,
    destination,
    departureIso: new Date(Date.now() + minutesFromNow * 60_000).toISOString(),
    stopId,
    stopCode,
    stopName,
  };
}

function createUiHarness({
  departures,
  mode = "bus",
  busStops = [
    {
      id: "nearest-stop",
      name: "Kamppi",
      code: "H1001",
      stopCodes: ["H1001"],
      memberStopIds: ["HSL:1001"],
      distanceMeters: 120,
    },
  ],
  busStopId = "nearest-stop",
} = {}) {
  const dom = {
    modeRailBtn: createMockElement("button"),
    modeTramBtn: createMockElement("button"),
    modeMetroBtn: createMockElement("button"),
    modeBusBtn: createMockElement("button"),
    busControlsEl: createMockElement("section", ["hidden"]),
    busStopSelectEl: createMockElement("button"),
    busStopSelectLabelEl: createMockElement("span"),
    busStopSelectListEl: createMockElement("ul"),
    busStopSelectWrapEl: createMockElement("div"),
    busStopFiltersEl: createMockElement("div"),
    busLineFiltersEl: createMockElement("div"),
    busDestinationFiltersEl: createMockElement("div"),
    stopFiltersToggleBtnEl: createMockElement("button"),
    stopFiltersPanelEl: createMockElement("div", ["hidden"]),
    stopFilterSummaryEl: createMockElement("span"),
    resultsLimitSelectEl: createMockElement("button"),
    resultsLimitSelectLabelEl: createMockElement("span"),
    resultsLimitSelectListEl: createMockElement("ul"),
    dataScopeEl: createMockElement("p", ["hidden"]),
    resultEl: createMockElement("section", ["hidden"]),
    stationTitleEl: createMockElement("h2"),
    stationMetaEl: createMockElement("p"),
    departuresEl: createMockElement("ul"),
    nextSummaryEl: createMockElement("div", ["hidden"]),
    nextLabelEl: createMockElement("p"),
    nextMinsEl: createMockElement("span"),
    nextLineEl: createMockElement("span"),
    nextTrackEl: createMockElement("span"),
    nextDestinationEl: createMockElement("span"),
    modeEyebrowEl: createMockElement("p"),
  };

  const app = {
    api: {
      uniqueNonEmptyStrings(values) {
        if (!Array.isArray(values)) return [];
        return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
      },
      persistUiState() {},
      setStatus() {},
      load() {},
      requestLocationAndLoad() {},
      trackFirstManualInteraction() {},
      trackFirstManualStopContextChange() {},
      getActiveResultsLimit() {
        return 8;
      },
      parseResultLimit(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      },
    },
    dom,
    state: {
      mode,
      busStops,
      busStopId,
      busStopMemberFilterId: null,
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
      stopFilterPinned: false,
      stopFiltersPanelOpen: false,
      stopFiltersPanelLockUntilMs: 0,
      currentCoords: { lat: 60.1, lon: 24.9 },
      latestResponse: {
        station: {
          stopName: "Kamppi",
          stopCode: "H1001",
          stopCodes: ["H1001"],
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
    window: {
      HMApp: app,
      innerWidth: 390,
      matchMedia: () => ({ matches: false }),
    },
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

  return {
    app,
    dom,
  };
}

defineFeature(test, featureText, {
  createWorld: () => ({
    html: "",
    controlsCss: "",
    shellCss: "",
    stateHarness: null,
    uiHarness: null,
    controlsLayout: null,
    firstCard: null,
    secondCard: null,
    iconChecks: null,
    modeSelectorChecks: null,
    accessibilityChecks: null,
    departureStyles: "",
    hasLivePillStyles: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given the app shell is loaded$/,
      run: ({ world }) => {
        world.html = fs.readFileSync(path.resolve(__dirname, "../index.html"), "utf8");
      },
    },
    {
      pattern: /^Given the location action state module is loaded$/,
      run: ({ world }) => {
        world.stateHarness = createStateHarness();
      },
    },
    {
      pattern: /^When the controls row is rendered$/,
      run: ({ world }) => {
        world.stateHarness.app.api.setVoiceListening(false);
      },
    },
    {
      pattern: /^Then the voice action button label is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const markupLabel = world.html.match(/id="voiceLocateBtnLabel"[^>]*>([^<]+)</)?.[1]?.trim() || "";
        assert.equal(markupLabel, args[0]);
        assert.equal(world.stateHarness.dom.voiceLocateBtnLabel.textContent, args[0]);
      },
    },
    {
      pattern: /^When controls accessibility labels are inspected$/,
      run: ({ world }) => {
        world.accessibilityChecks = {
          voiceAriaLabel: world.html.match(/id="voiceLocateBtn"[^>]*aria-label="([^"]+)"/)?.[1] || null,
        };
      },
    },
    {
      pattern: /^Then the voice action aria-label is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.accessibilityChecks?.voiceAriaLabel, args[0]);
      },
    },
    {
      pattern: /^Given a mobile viewport$/,
      run: ({ world }) => {
        world.controlsCss = fs.readFileSync(path.resolve(__dirname, "../styles/controls.css"), "utf8");
      },
    },
    {
      pattern: /^When the controls row is displayed$/,
      run: ({ world }) => {
        const controlsRule = getRuleBody(world.controlsCss, ".controls");
        const locateRule = getRuleBody(world.controlsCss, "#locateBtn");
        const voiceRule = getRuleBody(world.controlsCss, ".voice-locate-btn");

        world.controlsLayout = {
          gridTemplateColumns: getDeclarationValue(controlsRule, "grid-template-columns"),
          locateWidth: getDeclarationValue(locateRule, "width"),
          voiceWidth: getDeclarationValue(voiceRule, "width"),
          locateMinHeight: getDeclarationValue(locateRule, "min-height"),
          voiceMinHeight: getDeclarationValue(voiceRule, "min-height"),
        };
      },
    },
    {
      pattern: /^Then Refresh Location and Voice Search are rendered in a compact balanced layout without overlap$/,
      run: ({ assert, world }) => {
        assert.equal(world.controlsLayout.gridTemplateColumns, "repeat(2, minmax(0, 1fr))");
        assert.equal(world.controlsLayout.locateWidth, "100%");
        assert.equal(world.controlsLayout.voiceWidth, "100%");
        assert.equal(world.controlsLayout.locateMinHeight, "var(--tap-target-min)");
        assert.equal(world.controlsLayout.voiceMinHeight, "var(--tap-target-min)");
      },
    },
    {
      pattern: /^Given departures are (?:available|rendered) in a stop mode$/,
      run: ({ world }) => {
        world.uiHarness = createUiHarness({
          departures: [
            buildDeparture({ line: "52", destination: "Otaniemi", minutesFromNow: 4, stopId: "HSL:2001" }),
            buildDeparture({ line: "15", destination: "Kamppi", minutesFromNow: 7, stopId: "HSL:2002" }),
          ],
          mode: "bus",
          busStops: [
            {
              id: "nearest-stop",
              name: "Kamppi",
              code: "H1001",
              stopCodes: ["H1001"],
              memberStopIds: ["HSL:2001", "HSL:2002"],
              distanceMeters: 120,
            },
          ],
        });
        world.uiHarness.app.api.render(world.uiHarness.app.state.latestResponse);
      },
    },
    {
      pattern: /^When departure cards are rendered$/,
      run: ({ world }) => {
        world.uiHarness.app.api.render(world.uiHarness.app.state.latestResponse);
      },
    },
    {
      pattern: /^Then each visible card has a prominent left route badge, center destination block, and right timing block$/,
      run: ({ assert, world }) => {
        const rows = world.uiHarness.dom.departuresEl.children;
        assert.ok(rows.length > 0, "Expected rendered departures");
        for (const row of rows) {
          assert.ok(findDescendantByClass(row, "route-badge"), "Expected route badge block");
          assert.ok(findDescendantByClass(row, "departure-main"), "Expected destination block");
          assert.ok(findDescendantByClass(row, "departure-timing"), "Expected timing block");
        }
      },
    },
    {
      pattern: /^Given a departure that is due now$/,
      run: ({ world }) => {
        world.uiHarness = createUiHarness({
          departures: [
            buildDeparture({
              line: "52",
              destination: "Otaniemi",
              minutesFromNow: -1,
              stopId: "HSL:2001",
            }),
          ],
          mode: "bus",
        });
      },
    },
    {
      pattern: /^When its card is rendered$/,
      run: ({ world }) => {
        world.uiHarness.app.api.render(world.uiHarness.app.state.latestResponse);
        world.firstCard = world.uiHarness.dom.departuresEl.children[0] || null;
      },
    },
    {
      pattern: /^Then the timing block shows "([^"]*)" in high-emphasis style$/,
      run: ({ assert, args, world }) => {
        const remaining = findDescendantByClass(world.firstCard, "remaining");
        assert.ok(remaining, "Expected remaining time element");
        assert.equal(remaining.textContent, args[0]);
        assert.equal(remaining.classList.contains("time-now"), true);
      },
    },
    {
      pattern: /^Then the card also shows its absolute departure time in the same timing block$/,
      run: ({ assert, world }) => {
        const timing = findDescendantByClass(world.firstCard, "departure-timing");
        const clock = findDescendantByClass(world.firstCard, "clock-time");
        assert.ok(timing, "Expected timing block");
        assert.ok(clock, "Expected absolute clock time element");
        assert.equal(/^\d{2}:\d{2}$/.test(clock.textContent), true);
      },
    },
    {
      pattern: /^Given departures are rendered$/,
      run: ({ world }) => {
        world.uiHarness = createUiHarness({
          departures: [
            buildDeparture({ line: "52", destination: "Otaniemi", minutesFromNow: 1, stopId: "HSL:2001" }),
            buildDeparture({ line: "15", destination: "Kamppi", minutesFromNow: 8, stopId: "HSL:2002" }),
          ],
          mode: "bus",
        });
        world.uiHarness.app.api.render(world.uiHarness.app.state.latestResponse);
      },
    },
    {
      pattern: /^When the first visible result card is displayed$/,
      run: ({ world }) => {
        world.firstCard = world.uiHarness.dom.departuresEl.children[0] || null;
        world.secondCard = world.uiHarness.dom.departuresEl.children[1] || null;
      },
    },
    {
      pattern: /^Then its timing area includes an absolute clock time just like non-first result cards$/,
      run: ({ assert, world }) => {
        const firstClock = findDescendantByClass(world.firstCard, "clock-time")?.textContent || "";
        const secondClock = findDescendantByClass(world.secondCard, "clock-time")?.textContent || "";
        assert.equal(/^\d{2}:\d{2}$/.test(firstClock), true);
        assert.equal(/^\d{2}:\d{2}$/.test(secondClock), true);
      },
    },
    {
      pattern: /^Given departures are rendered with line "([^"]*)"$/,
      run: ({ args, world }) => {
        world.uiHarness = createUiHarness({
          departures: [
            buildDeparture({ line: args[0], destination: "Otaniemi", minutesFromNow: 5, stopId: "HSL:2001" }),
            buildDeparture({ line: "15", destination: "Kamppi", minutesFromNow: 7, stopId: "HSL:2002" }),
          ],
          mode: "bus",
        });
        world.uiHarness.app.api.render(world.uiHarness.app.state.latestResponse);
      },
    },
    {
      pattern: /^When the user taps line "([^"]*)" on a departure card$/,
      run: ({ assert, args, world }) => {
        const row = world.uiHarness.dom.departuresEl.children[0];
        const badge = findDescendantByClass(row, "route-badge");
        assert.ok(badge, "Expected route badge");
        assert.equal(badge.textContent, args[0]);
        badge.onclick();
      },
    },
    {
      pattern: /^Then line filter "([^"]*)" becomes active$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.uiHarness.app.state.busLineFilters.includes(args[0]), true);
      },
    },
    {
      pattern: /^Then tapping line "([^"]*)" again removes that line filter$/,
      run: ({ assert, args, world }) => {
        const row = world.uiHarness.dom.departuresEl.children[0];
        const badge = findDescendantByClass(row, "route-badge");
        assert.ok(badge, "Expected route badge after rerender");
        assert.equal(badge.textContent, args[0]);
        badge.onclick();
        assert.equal(world.uiHarness.app.state.busLineFilters.includes(args[0]), false);
      },
    },
    {
      pattern: /^Given departures are rendered with destination "([^"]*)"$/,
      run: ({ args, world }) => {
        world.uiHarness = createUiHarness({
          departures: [
            buildDeparture({ line: "52", destination: args[0], minutesFromNow: 5, stopId: "HSL:2001" }),
            buildDeparture({ line: "15", destination: "Kamppi", minutesFromNow: 7, stopId: "HSL:2002" }),
          ],
          mode: "bus",
        });
        world.uiHarness.app.api.render(world.uiHarness.app.state.latestResponse);
      },
    },
    {
      pattern: /^When the user taps destination "([^"]*)" on a departure card$/,
      run: ({ assert, args, world }) => {
        const row = world.uiHarness.dom.departuresEl.children[0];
        const destination = findDescendantByClass(row, "destination");
        assert.ok(destination, "Expected destination element");
        assert.equal(destination.textContent, args[0]);
        destination.onclick();
      },
    },
    {
      pattern: /^Then destination filter "([^"]*)" becomes active$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.uiHarness.app.state.busDestinationFilters.includes(args[0]), true);
      },
    },
    {
      pattern: /^Then tapping destination "([^"]*)" again removes that destination filter$/,
      run: ({ assert, args, world }) => {
        const row = world.uiHarness.dom.departuresEl.children[0];
        const destination = findDescendantByClass(row, "destination");
        assert.ok(destination, "Expected destination element after rerender");
        assert.equal(destination.textContent, args[0]);
        destination.onclick();
        assert.equal(world.uiHarness.app.state.busDestinationFilters.includes(args[0]), false);
      },
    },
    {
      pattern: /^When the user taps a stop value on a departure card$/,
      run: ({ assert, world }) => {
        const row = world.uiHarness.dom.departuresEl.children[0];
        const stop = findDescendantByClass(row, "track");
        assert.ok(stop, "Expected stop element");
        stop.onclick();
      },
    },
    {
      pattern: /^Then stop filter updates using current production stop-filter rules$/,
      run: ({ assert, world }) => {
        assert.equal(world.uiHarness.app.state.stopFilterPinned, true);
        assert.equal(world.uiHarness.app.state.busStopMemberFilterId, "HSL:2001");
      },
    },
    {
      pattern: /^Then the filter summary reflects the new active filter state$/,
      run: ({ assert, world }) => {
        assert.equal(world.uiHarness.dom.stopFilterSummaryEl.textContent, "1 filter");
      },
    },
    {
      pattern: /^Given the app shell is rendered$/,
      run: ({ world }) => {
        world.html = fs.readFileSync(path.resolve(__dirname, "../index.html"), "utf8");
        world.shellCss = fs.readFileSync(path.resolve(__dirname, "../styles/shell.css"), "utf8");
      },
    },
    {
      pattern: /^When the user views top controls and filter affordances$/,
      run: ({ world }) => {
        world.iconChecks = {
          hasRefreshIcon: /id="locateBtn"[\s\S]*?<svg[^>]*class="[^"]*control-icon[^"]*icon-refresh/.test(
            world.html
          ),
          hasVoiceIcon: /id="voiceLocateBtn"[\s\S]*?<svg[^>]*class="[^"]*control-icon[^"]*icon-voice/.test(
            world.html
          ),
          hasFilterIcon:
            /id="stopFiltersToggleBtn"[\s\S]*?<svg[^>]*class="[^"]*control-icon[^"]*icon-filter/.test(
              world.html
            ),
          hasSharedIconStroke:
            /\.control-icon\s*\{[\s\S]*stroke-width:\s*2\.25;[\s\S]*stroke-linecap:\s*round;[\s\S]*stroke-linejoin:\s*round;/.test(
              world.shellCss
            ),
        };
      },
    },
    {
      pattern: /^Then refresh, voice, and filter indicators use the new icon style set$/,
      run: ({ assert, world }) => {
        assert.equal(world.iconChecks.hasRefreshIcon, true);
        assert.equal(world.iconChecks.hasVoiceIcon, true);
        assert.equal(world.iconChecks.hasFilterIcon, true);
        assert.equal(world.iconChecks.hasSharedIconStroke, true);
      },
    },
    {
      pattern: /^When the result header is displayed$/,
      run: ({ world }) => {
        world.resultHeaderHasRealtime = /class="live-pill"/.test(world.html) || />Realtime</.test(world.html);
      },
    },
    {
      pattern: /^Then no "Realtime" badge or pill is shown$/,
      run: ({ assert, world }) => {
        assert.equal(world.resultHeaderHasRealtime, false);
      },
    },
    {
      pattern: /^Given the departures stylesheet$/,
      run: ({ world }) => {
        world.departureStyles = fs.readFileSync(path.resolve(__dirname, "../styles/departures.css"), "utf8");
      },
    },
    {
      pattern: /^When legacy realtime badge styles are inspected$/,
      run: ({ world }) => {
        world.hasLivePillStyles = /\.live-pill\b|\.live-pill::before/.test(world.departureStyles);
      },
    },
    {
      pattern: /^Then no live-pill style rules are present$/,
      run: ({ assert, world }) => {
        assert.equal(world.hasLivePillStyles, false);
      },
    },
    {
      pattern: /^When the user views the mode selector$/,
      run: ({ world }) => {
        const segmentControlPattern =
          /<div class="segment-control"[\s\S]*id="modeRailBtn"[\s\S]*id="modeTramBtn"[\s\S]*id="modeMetroBtn"[\s\S]*id="modeBusBtn"/;
        const segmentControlRule = getRuleBody(world.shellCss, ".segment-control");
        const activeSegmentRule = getRuleBody(world.shellCss, ".segment-indicator");
        const dividerRule = getRuleBody(world.shellCss, ".segment + .segment");

        world.modeSelectorChecks = {
          hasAllModesInOneControl: segmentControlPattern.test(world.html),
          controlRadius: getDeclarationValue(segmentControlRule, "border-radius"),
          controlBackground: getDeclarationValue(segmentControlRule, "background"),
          activeSegmentBackground: getDeclarationValue(activeSegmentRule, "background"),
          activeSegmentBorder: getDeclarationValue(activeSegmentRule, "border"),
          activeSegmentShadow: getDeclarationValue(activeSegmentRule, "box-shadow"),
          hasDividerBorder: getDeclarationValue(dividerRule, "border-left"),
        };
      },
    },
    {
      pattern: /^Then all transport modes are shown inside one rounded segmented control$/,
      run: ({ assert, world }) => {
        assert.equal(world.modeSelectorChecks.hasAllModesInOneControl, true);
        assert.equal(world.modeSelectorChecks.controlRadius, "var(--radius-pill)");
      },
    },
    {
      pattern: /^Then the active mode is rendered as a filled highlighted segment$/,
      run: ({ assert, world }) => {
        assert.ok(world.modeSelectorChecks.activeSegmentBackground, "Expected active segment background");
      },
    },
    {
      pattern: /^Then inactive modes are visually separated with subtle dividers$/,
      run: ({ assert, world }) => {
        assert.equal(world.modeSelectorChecks.hasDividerBorder, "1px solid var(--segment-divider)");
      },
    },
    {
      pattern: /^Then the segmented track uses the mockup slate tone$/,
      run: ({ assert, world }) => {
        assert.equal(world.modeSelectorChecks.controlBackground, "var(--segment-track-bg)");
      },
    },
    {
      pattern: /^Then the active segment uses mockup border and shadow treatment$/,
      run: ({ assert, world }) => {
        assert.equal(world.modeSelectorChecks.activeSegmentBackground, "var(--segment-active-bg)");
        assert.equal(world.modeSelectorChecks.activeSegmentBorder, "1px solid var(--segment-active-border)");
        assert.equal(world.modeSelectorChecks.activeSegmentShadow, "var(--segment-active-shadow)");
      },
    },
  ],
});
