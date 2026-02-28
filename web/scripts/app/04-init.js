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

  function scheduleNextFrame(task) {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(task);
      return;
    }

    setTimeout(task, 0);
  }

  function handleModeChange(nextMode) {
    if (state.mode === nextMode) return;

    api.trackFirstManualInteraction("mode_change", { toMode: nextMode });
    state.mode = nextMode;
    if (nextMode !== MODE_RAIL) {
      state.helsinkiOnly = false;
    }

    // Keep the mode switch visual response synchronous, and defer heavier
    // render/data work to the next frame so Firefox can paint immediately.
    api.applyModeUiState({ modeOnly: true });
    scheduleNextFrame(() => {
      api.applyModeUiState();
      api.persistUiState();
      refreshWithCurrentLocationOrRequest();
    });
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
    handleModeChange(MODE_RAIL);
  });

  dom.modeTramBtn?.addEventListener("click", () => {
    handleModeChange(MODE_TRAM);
  });

  dom.modeMetroBtn?.addEventListener("click", () => {
    handleModeChange(MODE_METRO);
  });

  dom.modeBusBtn?.addEventListener("click", () => {
    handleModeChange(MODE_BUS);
  });

  /* ─── Custom Results Limit Dropdown ─── */
  dom.resultsLimitSelectEl?.addEventListener("click", (e) => {
    e.stopPropagation();
    api.toggleResultsLimitDropdown();
  });

  document.addEventListener("click", (e) => {
    if (!dom.resultsLimitSelectWrapEl) return;
    if (!dom.resultsLimitSelectWrapEl.contains(e.target)) {
      api.toggleResultsLimitDropdown(false);
    }
  });

  dom.resultsLimitSelectEl?.addEventListener("keydown", (e) => {
    const listEl = dom.resultsLimitSelectListEl;
    if (!listEl) return;

    const isOpen = dom.resultsLimitSelectEl.getAttribute("aria-expanded") === "true";

    if (e.key === "Escape") {
      api.toggleResultsLimitDropdown(false);
      dom.resultsLimitSelectEl.focus();
      e.preventDefault();
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      if (!isOpen) {
        api.toggleResultsLimitDropdown(true);
        e.preventDefault();
        return;
      }
      const focused = listEl.querySelector(".is-focused");
      if (focused?.dataset?.value) {
        api.selectResultsLimit(focused.dataset.value);
      }
      e.preventDefault();
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        api.toggleResultsLimitDropdown(true);
        return;
      }
      const items = [...listEl.querySelectorAll("li[role='option']")];
      if (items.length === 0) return;

      const currentIdx = items.findIndex((item) => item.classList.contains("is-focused"));
      let nextIdx;
      if (e.key === "ArrowDown") {
        nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
      } else {
        nextIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
      }

      for (const item of items) item.classList.remove("is-focused");
      items[nextIdx].classList.add("is-focused");
      items[nextIdx].scrollIntoView({ block: "nearest" });
    }
  });

  /* ─── Custom Stop Dropdown ─── */
  dom.busStopSelectEl?.addEventListener("click", (e) => {
    e.stopPropagation();
    api.toggleStopDropdown();
  });

  document.addEventListener("click", (e) => {
    if (!dom.busStopSelectWrapEl) return;
    if (!dom.busStopSelectWrapEl.contains(e.target)) {
      api.toggleStopDropdown(false);
    }
  });

  dom.busStopSelectEl?.addEventListener("keydown", (e) => {
    const listEl = dom.busStopSelectListEl;
    if (!listEl) return;

    const isOpen = dom.busStopSelectEl.getAttribute("aria-expanded") === "true";

    if (e.key === "Escape") {
      api.toggleStopDropdown(false);
      dom.busStopSelectEl.focus();
      e.preventDefault();
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      if (!isOpen) {
        api.toggleStopDropdown(true);
        e.preventDefault();
        return;
      }
      const focused = listEl.querySelector(".is-focused");
      if (focused?.dataset?.value) {
        api.selectStop(focused.dataset.value);
      }
      e.preventDefault();
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        api.toggleStopDropdown(true);
        return;
      }
      const items = [...listEl.querySelectorAll("li[role='option']")];
      if (items.length === 0) return;

      const currentIdx = items.findIndex((item) => item.classList.contains("is-focused"));
      let nextIdx;
      if (e.key === "ArrowDown") {
        nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
      } else {
        nextIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
      }

      for (const item of items) item.classList.remove("is-focused");
      items[nextIdx].classList.add("is-focused");
      items[nextIdx].scrollIntoView({ block: "nearest" });
    }
  });

  dom.stopFiltersToggleBtnEl?.addEventListener("click", () => {
    api.trackFirstManualInteraction("stop_filters_panel_toggle", { currentMode: state.mode });
    api.toggleStopFiltersPanel();
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

  /* ─── Location Pre-Prompt ─── */
  dom.locationPromptAllowEl?.addEventListener("click", () => {
    api.hideLocationPrompt();
    api.requestLocationAndLoad();
  });

  dom.permissionRetryBtnEl?.addEventListener("click", () => {
    api.trackFirstManualInteraction("permission_retry_click");
    api.requestLocationAndLoad();
  });

  api.hydrateInitialState();
  api.applyModeUiState();
  api.updateClock();
  setInterval(api.updateClock, 1000);

  /* Show pre-prompt if location was never granted, otherwise request directly */
  const previouslyGranted = api.getStorageItem("location:granted") === "1";
  if (previouslyGranted) {
    api.requestLocationAndLoad();
  } else {
    api.showLocationPrompt();
    api.setStatus("Tap Allow Location to get started.");
  }

  setInterval(api.refreshDeparturesOnly, 30000);

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
