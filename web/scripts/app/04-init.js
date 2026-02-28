/* Startup + Event Wiring */
(() => {
  const app = window.HMApp;
  const { api, dom, state, constants } = app;
  const { MODE_RAIL, MODE_TRAM, MODE_METRO, MODE_BUS } = constants;
  const initialSearch = window.location.search;

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

  /* ─── Mock Overlay Tuning Tools ─── */
  (() => {
    const layerEl = document.getElementById("mockOverlayLayer");
    const imageEl = document.getElementById("mockOverlayImage");
    const controlsEl = document.getElementById("mockOverlayControls");
    const urlInputEl = document.getElementById("mockOverlayUrlInput");
    const opacityInputEl = document.getElementById("mockOverlayOpacityInput");
    const offsetXInputEl = document.getElementById("mockOverlayOffsetXInput");
    const offsetYInputEl = document.getElementById("mockOverlayOffsetYInput");
    const scaleInputEl = document.getElementById("mockOverlayScaleInput");
    const toggleBtnEl = document.getElementById("mockOverlayToggleBtn");
    const resetBtnEl = document.getElementById("mockOverlayResetBtn");

    if (
      !layerEl ||
      !imageEl ||
      !controlsEl ||
      !urlInputEl ||
      !opacityInputEl ||
      !offsetXInputEl ||
      !offsetYInputEl ||
      !scaleInputEl ||
      !toggleBtnEl ||
      !resetBtnEl
    ) {
      return;
    }

    const storageKeys = {
      url: "dev:overlay:url",
      opacity: "dev:overlay:opacity",
      offsetX: "dev:overlay:offsetX",
      offsetY: "dev:overlay:offsetY",
      scale: "dev:overlay:scale",
      visible: "dev:overlay:visible",
      panelVisible: "dev:overlay:panelVisible",
    };

    const searchParams = new URLSearchParams(initialSearch);
    const queryOverlayEnabled = searchParams.get("overlay") === "1";

    const parseNumber = (value, { min, max, fallback }) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.min(max, Math.max(min, parsed));
    };

    const parseBool = (value, fallback = false) => {
      if (value === "1" || value === "true") return true;
      if (value === "0" || value === "false") return false;
      return fallback;
    };

    const state = {
      url: "",
      opacity: 45,
      offsetX: 0,
      offsetY: 0,
      scale: 100,
      visible: false,
      panelVisible: false,
    };

    const setInputValues = () => {
      urlInputEl.value = state.url;
      opacityInputEl.value = String(state.opacity);
      offsetXInputEl.value = String(state.offsetX);
      offsetYInputEl.value = String(state.offsetY);
      scaleInputEl.value = String(state.scale);
    };

    const persist = () => {
      api.setStorageItem(storageKeys.url, state.url);
      api.setStorageItem(storageKeys.opacity, String(state.opacity));
      api.setStorageItem(storageKeys.offsetX, String(state.offsetX));
      api.setStorageItem(storageKeys.offsetY, String(state.offsetY));
      api.setStorageItem(storageKeys.scale, String(state.scale));
      api.setStorageItem(storageKeys.visible, state.visible ? "1" : "0");
      api.setStorageItem(storageKeys.panelVisible, state.panelVisible ? "1" : "0");
    };

    const apply = () => {
      const hasSource = state.url.length > 0;
      const showOverlay = hasSource && state.visible;

      controlsEl.classList.toggle("hidden", !state.panelVisible);
      layerEl.classList.toggle("hidden", !showOverlay);
      layerEl.setAttribute("aria-hidden", String(!showOverlay));
      toggleBtnEl.textContent = showOverlay ? "Overlay: On" : "Overlay: Off";
      toggleBtnEl.setAttribute("aria-pressed", String(showOverlay));

      if (hasSource) {
        if (imageEl.getAttribute("src") !== state.url) {
          imageEl.setAttribute("src", state.url);
        }
      } else {
        imageEl.removeAttribute("src");
      }

      imageEl.style.opacity = String(state.opacity / 100);
      imageEl.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale / 100})`;
      setInputValues();
    };

    const isEditableTarget = (target) => {
      const element = target instanceof Element ? target : null;
      if (!element) return false;
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT") {
        return true;
      }
      return Boolean(element.closest("[contenteditable='true']"));
    };

    const loadInitialState = () => {
      state.url = String(api.getStorageItem(storageKeys.url) || "").trim();
      state.opacity = parseNumber(api.getStorageItem(storageKeys.opacity), {
        min: 0,
        max: 100,
        fallback: 45,
      });
      state.offsetX = parseNumber(api.getStorageItem(storageKeys.offsetX), {
        min: -2000,
        max: 2000,
        fallback: 0,
      });
      state.offsetY = parseNumber(api.getStorageItem(storageKeys.offsetY), {
        min: -2000,
        max: 2000,
        fallback: 0,
      });
      state.scale = parseNumber(api.getStorageItem(storageKeys.scale), {
        min: 50,
        max: 200,
        fallback: 100,
      });
      state.visible = parseBool(api.getStorageItem(storageKeys.visible), false);
      state.panelVisible = parseBool(api.getStorageItem(storageKeys.panelVisible), false);

      const queryUrl = String(searchParams.get("overlayUrl") || "").trim();
      if (queryUrl) {
        state.url = queryUrl;
      }

      if (searchParams.has("overlayOpacity")) {
        state.opacity = parseNumber(searchParams.get("overlayOpacity"), {
          min: 0,
          max: 100,
          fallback: state.opacity,
        });
      }

      if (searchParams.has("overlayOffsetX")) {
        state.offsetX = parseNumber(searchParams.get("overlayOffsetX"), {
          min: -2000,
          max: 2000,
          fallback: state.offsetX,
        });
      }

      if (searchParams.has("overlayOffsetY")) {
        state.offsetY = parseNumber(searchParams.get("overlayOffsetY"), {
          min: -2000,
          max: 2000,
          fallback: state.offsetY,
        });
      }

      if (searchParams.has("overlayScale")) {
        state.scale = parseNumber(searchParams.get("overlayScale"), {
          min: 50,
          max: 200,
          fallback: state.scale,
        });
      }

      if (searchParams.has("overlayVisible")) {
        state.visible = parseBool(searchParams.get("overlayVisible"), state.visible);
      }

      if (queryOverlayEnabled) {
        state.panelVisible = true;
        if (!searchParams.has("overlayVisible")) {
          state.visible = true;
        }
      }
    };

    const updateStateAndApply = (updates) => {
      Object.assign(state, updates);
      persist();
      apply();
    };

    loadInitialState();
    apply();

    urlInputEl.addEventListener("input", () => {
      const nextUrl = String(urlInputEl.value || "").trim();
      updateStateAndApply({
        url: nextUrl,
        visible: nextUrl.length > 0 ? true : state.visible,
      });
    });

    opacityInputEl.addEventListener("input", () => {
      updateStateAndApply({
        opacity: parseNumber(opacityInputEl.value, { min: 0, max: 100, fallback: state.opacity }),
      });
    });

    offsetXInputEl.addEventListener("input", () => {
      updateStateAndApply({
        offsetX: parseNumber(offsetXInputEl.value, { min: -2000, max: 2000, fallback: state.offsetX }),
      });
    });

    offsetYInputEl.addEventListener("input", () => {
      updateStateAndApply({
        offsetY: parseNumber(offsetYInputEl.value, { min: -2000, max: 2000, fallback: state.offsetY }),
      });
    });

    scaleInputEl.addEventListener("input", () => {
      updateStateAndApply({
        scale: parseNumber(scaleInputEl.value, { min: 50, max: 200, fallback: state.scale }),
      });
    });

    toggleBtnEl.addEventListener("click", () => {
      updateStateAndApply({ visible: !state.visible });
    });

    resetBtnEl.addEventListener("click", () => {
      updateStateAndApply({
        opacity: 45,
        offsetX: 0,
        offsetY: 0,
        scale: 100,
      });
    });

    document.addEventListener("keydown", (event) => {
      if (isEditableTarget(event.target)) return;
      if (event.key.toLowerCase() !== "o") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      if (event.shiftKey) {
        updateStateAndApply({ panelVisible: !state.panelVisible });
        return;
      }
      updateStateAndApply({ visible: !state.visible });
    });
  })();
})();
