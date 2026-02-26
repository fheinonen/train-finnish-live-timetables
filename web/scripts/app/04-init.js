/* Startup + Event Wiring */
(() => {
  const app = window.HMApp;
  const { api, dom, state, constants } = app;
  const { MODE_RAIL, MODE_TRAM, MODE_METRO, MODE_BUS } = constants;

  function refreshWithCurrentLocationOrRequest() {
    if (state.currentCoords) {
      api.load(state.currentCoords.lat, state.currentCoords.lon);
      return;
    }

    api.requestLocationAndLoad();
  }

  dom.locateBtn?.addEventListener("click", () => {
    api.trackFirstManualInteraction("refresh_location_click");
    api.requestLocationAndLoad();
  });

  dom.voiceLocateBtn?.addEventListener("click", () => {
    api.trackFirstManualInteraction("voice_location_click");
    api.requestVoiceLocationAndLoad();
  });

  dom.modeRailBtn?.addEventListener("click", () => {
    if (state.mode === MODE_RAIL) return;
    api.trackFirstManualInteraction("mode_change", { toMode: MODE_RAIL });
    state.mode = MODE_RAIL;
    api.applyModeUiState();
    api.persistUiState();
    refreshWithCurrentLocationOrRequest();
  });

  dom.modeTramBtn?.addEventListener("click", () => {
    if (state.mode === MODE_TRAM) return;
    api.trackFirstManualInteraction("mode_change", { toMode: MODE_TRAM });
    state.mode = MODE_TRAM;
    state.helsinkiOnly = false;
    api.applyModeUiState();
    api.persistUiState();
    refreshWithCurrentLocationOrRequest();
  });

  dom.modeMetroBtn?.addEventListener("click", () => {
    if (state.mode === MODE_METRO) return;
    api.trackFirstManualInteraction("mode_change", { toMode: MODE_METRO });
    state.mode = MODE_METRO;
    state.helsinkiOnly = false;
    api.applyModeUiState();
    api.persistUiState();
    refreshWithCurrentLocationOrRequest();
  });

  dom.modeBusBtn?.addEventListener("click", () => {
    if (state.mode === MODE_BUS) return;
    api.trackFirstManualInteraction("mode_change", { toMode: MODE_BUS });
    state.mode = MODE_BUS;
    state.helsinkiOnly = false;
    api.applyModeUiState();
    api.persistUiState();
    refreshWithCurrentLocationOrRequest();
  });

  dom.resultsLimitSelectEl?.addEventListener("change", () => {
    const nextLimit = api.parseResultLimit(dom.resultsLimitSelectEl.value);
    if (nextLimit == null) {
      api.renderResultsLimitControl();
      return;
    }

    const currentLimit = api.getActiveResultsLimit();
    if (currentLimit === nextLimit) return;

    api.trackFirstManualInteraction("results_limit_change", {
      nextLimit,
      currentMode: state.mode,
    });
    state.resultsLimitByMode[state.mode] = nextLimit;
    api.persistUiState();
    refreshWithCurrentLocationOrRequest();
  });

  dom.busStopSelectEl?.addEventListener("change", () => {
    if (
      state.suppressBusStopChange ||
      (state.mode !== MODE_BUS && state.mode !== MODE_TRAM && state.mode !== MODE_METRO)
    ) {
      return;
    }

    const nextStopId = String(dom.busStopSelectEl.value || "").trim();
    if (!nextStopId || nextStopId === state.busStopId) return;

    api.trackFirstManualInteraction("stop_select", { currentMode: state.mode });
    api.trackFirstManualStopContextChange("stop_select", { selectedStopId: nextStopId });
    state.busStopId = nextStopId;
    api.persistUiState();

    if (state.currentCoords) {
      api.load(state.currentCoords.lat, state.currentCoords.lon);
    }
  });

  dom.helsinkiOnlyBtn?.addEventListener("click", () => {
    if (state.mode !== MODE_RAIL) return;
    api.trackFirstManualInteraction("helsinki_only_toggle");
    state.helsinkiOnly = !state.helsinkiOnly;
    api.persistUiState();
    api.updateHelsinkiFilterButton();

    if (state.latestResponse) {
      api.render(state.latestResponse);
      api.setStatus(api.buildStatusFromResponse(state.latestResponse));
    }
  });

  api.hydrateInitialState();
  api.applyModeUiState();
  api.updateClock();
  setInterval(api.updateClock, 1000);
  api.requestLocationAndLoad();
  setInterval(api.refreshDeparturesOnly, 30000);

  window.addEventListener("resize", () => {
    requestAnimationFrame(api.alignDepartureColumns);
  });

  window.addEventListener("error", (event) => {
    api.reportClientError("error", event.error || event.message || "Unknown error", {
      source: event.filename || "",
      line: event.lineno || null,
      column: event.colno || null,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    api.reportClientError("unhandledrejection", event.reason || "Unhandled promise rejection");
  });

  /* ─── Theme Toggle ─── */
  (() => {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;

    const root = document.documentElement;
    const darkSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const getStoredTheme = () => {
      const value = api.getStorageItem("theme");
      return value === "dark" || value === "light" ? value : null;
    };

    const applyEffectiveTheme = (theme) => {
      root.setAttribute("data-theme", theme === "light" ? "light" : "dark");
    };

    const applyCurrentTheme = () => {
      const storedTheme = getStoredTheme();
      if (storedTheme) {
        applyEffectiveTheme(storedTheme);
        return;
      }

      applyEffectiveTheme(darkSchemeQuery.matches ? "dark" : "light");
    };

    const handleSystemThemeChange = (event) => {
      if (getStoredTheme()) return;
      applyEffectiveTheme(event.matches ? "dark" : "light");
    };

    applyCurrentTheme();

    if (typeof darkSchemeQuery.addEventListener === "function") {
      darkSchemeQuery.addEventListener("change", handleSystemThemeChange);
    } else if (typeof darkSchemeQuery.addListener === "function") {
      darkSchemeQuery.addListener(handleSystemThemeChange);
    }

    btn.addEventListener("click", () => {
      const nextTheme = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyEffectiveTheme(nextTheme);
      api.setStorageItem("theme", nextTheme);
    });
  })();
})();
