/* UI Rendering + Presentation Helpers */
(() => {
  const app = window.HMApp;
  const { api, dom, state, constants } = app;
  const { MODE_RAIL, MODE_TRAM, MODE_METRO, MODE_BUS } = constants;
  const STOP_FILTER_PANEL_LOCK_MS = 1500;
  const STOP_FILTER_PANEL_AUTO_CLOSE_MS = STOP_FILTER_PANEL_LOCK_MS + 200;
  const STOP_FILTER_OPTION_AUTO_OPEN_LIMIT = 14;
  const FILTER_ATTENTION_DURATION_MS = 1300;
  let filterAttentionTimeoutId = null;
  let stopFilterAutoCloseTimeoutId = null;

  function isStopMode(mode = state.mode) {
    return mode === MODE_BUS || mode === MODE_TRAM || mode === MODE_METRO;
  }

  function getStopModeLabel(mode = state.mode) {
    if (mode === MODE_TRAM) return { singular: "tram", plural: "trams", title: "Tram" };
    if (mode === MODE_METRO) return { singular: "metro", plural: "metros", title: "Metro" };
    return { singular: "bus", plural: "buses", title: "Bus" };
  }

  function formatMinutes(iso) {
    const diffMin = minutesUntil(iso);
    if (diffMin <= 0) return "Now";
    return `${diffMin}m`;
  }

  function minutesUntil(iso) {
    const departure = new Date(iso);
    return Math.floor((departure.getTime() - Date.now()) / 60000);
  }

  function departureRowClass(iso) {
    const diffMin = minutesUntil(iso);

    if (diffMin <= 0 || diffMin < 3) return "departure-now";
    if (diffMin <= 10) return "departure-soon";
    return "departure-later";
  }

  function isHelsinkiBound(departure) {
    const destination = departure?.destination || "";
    return /\bhelsinki\b/i.test(destination);
  }

  function sanitizeStopSelections() {
    const allowedLines = new Set((state.busFilterOptions.lines || []).map((option) => option.value));
    const allowedDestinations = new Set(
      (state.busFilterOptions.destinations || []).map((option) => option.value)
    );

    state.busLineFilters = state.busLineFilters.filter((value) => allowedLines.has(value));
    state.busDestinationFilters = state.busDestinationFilters.filter((value) =>
      allowedDestinations.has(value)
    );
  }

  function getVisibleDepartures(departures) {
    if (!Array.isArray(departures)) return [];

    if (state.mode === MODE_RAIL) {
      if (!state.helsinkiOnly) return departures;
      return departures.filter(isHelsinkiBound);
    }

    if (!isStopMode()) {
      return departures;
    }

    const lineFilterSet = new Set(state.busLineFilters);
    const destinationFilterSet = new Set(state.busDestinationFilters);

    return departures
      .filter((departure) => {
        if (lineFilterSet.size === 0) return true;
        const line = String(departure?.line || "").trim();
        return lineFilterSet.has(line);
      })
      .filter((departure) => {
        if (destinationFilterSet.size === 0) return true;
        const destination = String(departure?.destination || "").trim();
        return destinationFilterSet.has(destination);
      });
  }

  function updateModeButtons() {
    const modeButtons = [
      { el: dom.modeRailBtn, mode: MODE_RAIL, index: 0 },
      { el: dom.modeTramBtn, mode: MODE_TRAM, index: 1 },
      { el: dom.modeMetroBtn, mode: MODE_METRO, index: 2 },
      { el: dom.modeBusBtn, mode: MODE_BUS, index: 3 },
    ];

    for (const { el, mode, index } of modeButtons) {
      if (!el) continue;
      const active = state.mode === mode;
      el.setAttribute("aria-checked", String(active));
      el.classList.toggle("is-active", active);
      if (active) {
        const container = el.closest(".segment-control");
        if (container) container.style.setProperty("--active-index", index);
      }
    }
  }

  function updateModeLabels() {
    const modeLabel = isStopMode() ? getStopModeLabel().title : "Rail";
    const nextLabel = isStopMode() ? `Next ${getStopModeLabel().title}` : "Next Train";

    if (dom.modeEyebrowEl) {
      dom.modeEyebrowEl.textContent = `Helsinki Moves • ${modeLabel}`;
    }

    if (dom.nextLabelEl) {
      dom.nextLabelEl.textContent = nextLabel;
    }
  }

  function toggleResultsLimitDropdown(forceOpen) {
    if (!dom.resultsLimitSelectEl || !dom.resultsLimitSelectListEl) return;
    const isOpen = dom.resultsLimitSelectEl.getAttribute("aria-expanded") === "true";
    const nextOpen = typeof forceOpen === "boolean" ? forceOpen : !isOpen;
    dom.resultsLimitSelectEl.setAttribute("aria-expanded", String(nextOpen));
    dom.resultsLimitSelectListEl.classList.toggle("hidden", !nextOpen);
  }

  function selectResultsLimit(value) {
    const nextLimit = api.parseResultLimit(value);
    if (nextLimit == null) return;

    toggleResultsLimitDropdown(false);

    const currentLimit = api.getActiveResultsLimit();
    if (currentLimit === nextLimit) return;

    api.trackFirstManualInteraction("results_limit_change", {
      nextLimit,
      currentMode: state.mode,
    });
    state.resultsLimitByMode[state.mode] = nextLimit;
    api.persistUiState();

    if (dom.resultsLimitSelectLabelEl) {
      dom.resultsLimitSelectLabelEl.textContent = String(nextLimit);
    }

    if (state.currentCoords) {
      api.load(state.currentCoords.lat, state.currentCoords.lon);
    } else {
      api.requestLocationAndLoad();
    }
  }

  function renderResultsLimitControl() {
    if (!dom.resultsLimitSelectListEl) return;

    const options = Array.isArray(constants.RESULT_LIMIT_OPTIONS)
      ? constants.RESULT_LIMIT_OPTIONS
      : [];
    const activeValue = api.getActiveResultsLimit();
    dom.resultsLimitSelectListEl.innerHTML = "";

    for (const value of options) {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.dataset.value = String(value);
      li.textContent = String(value);
      if (value === activeValue) {
        li.setAttribute("aria-selected", "true");
      }
      li.addEventListener("click", () => selectResultsLimit(String(value)));
      dom.resultsLimitSelectListEl.appendChild(li);
    }

    if (dom.resultsLimitSelectLabelEl) {
      dom.resultsLimitSelectLabelEl.textContent = String(activeValue);
    }
  }

  function updateHelsinkiFilterButton() {
    if (!dom.helsinkiOnlyBtn) return;

    if (state.mode !== MODE_RAIL) {
      dom.helsinkiOnlyBtn.setAttribute("aria-pressed", "false");
      dom.helsinkiOnlyBtn.classList.remove("is-active");
      dom.helsinkiOnlyBtn.disabled = true;
      dom.helsinkiOnlyBtn.textContent = "Helsinki Only (Rail)";
      return;
    }

    dom.helsinkiOnlyBtn.disabled = false;
    dom.helsinkiOnlyBtn.setAttribute("aria-pressed", String(state.helsinkiOnly));
    dom.helsinkiOnlyBtn.classList.toggle("is-active", state.helsinkiOnly);
    dom.helsinkiOnlyBtn.textContent = state.helsinkiOnly ? "Helsinki Only: On" : "Helsinki Only: Off";
  }

  function countActiveStopFilters() {
    const stopCount = hasActiveStopFilter() ? 1 : 0;
    return (
      Math.max(0, state.busLineFilters.length) +
      Math.max(0, state.busDestinationFilters.length) +
      stopCount
    );
  }

  function buildStopFilterSummary(
    lineFilterCount = state.busLineFilters.length,
    destinationFilterCount = state.busDestinationFilters.length,
    stopFilterActive = hasActiveStopFilter()
  ) {
    const totalFilters =
      Math.max(0, Number(lineFilterCount) || 0) +
      Math.max(0, Number(destinationFilterCount) || 0) +
      (stopFilterActive ? 1 : 0);
    if (totalFilters === 0) return "No filters";
    if (totalFilters === 1) return "1 filter";
    return `${totalFilters} filters`;
  }

  function hasActiveStopFilter() {
    if (!isStopMode()) return false;
    return Boolean(state.stopFilterPinned);
  }

  function clearStopFilterAttention() {
    dom.stopFilterSummaryEl?.classList?.remove?.("is-attention");
    dom.stopFiltersToggleBtnEl?.classList?.remove?.("is-attention");
  }

  function clearStopFilterAutoCloseTimer() {
    if (!stopFilterAutoCloseTimeoutId) return;
    clearTimeout(stopFilterAutoCloseTimeoutId);
    stopFilterAutoCloseTimeoutId = null;
  }

  function isCompactViewport() {
    if (typeof window?.matchMedia === "function") {
      try {
        if (window.matchMedia("(max-width: 679px)").matches) {
          return true;
        }
      } catch {
        // Ignore matchMedia failures and fallback to innerWidth.
      }
    }

    const width = Number(window?.innerWidth);
    return Number.isFinite(width) ? width <= 679 : false;
  }

  function shouldAutoOpenStopFiltersPanelForAttention() {
    if (isCompactViewport()) return false;

    const lineOptionCount = Array.isArray(state.busFilterOptions?.lines)
      ? state.busFilterOptions.lines.length
      : 0;
    const destinationOptionCount = Array.isArray(state.busFilterOptions?.destinations)
      ? state.busFilterOptions.destinations.length
      : 0;
    const totalOptions = lineOptionCount + destinationOptionCount;
    return totalOptions <= STOP_FILTER_OPTION_AUTO_OPEN_LIMIT;
  }

  function triggerStopFilterAttention() {
    if (!isStopMode()) return;

    const shouldAutoOpen = !state.stopFiltersPanelOpen && shouldAutoOpenStopFiltersPanelForAttention();
    if (shouldAutoOpen) {
      state.stopFiltersPanelLockUntilMs = Date.now() + STOP_FILTER_PANEL_LOCK_MS;
      setStopFiltersPanelOpen(true);
      clearStopFilterAutoCloseTimer();
      stopFilterAutoCloseTimeoutId = setTimeout(() => {
        state.stopFiltersPanelLockUntilMs = 0;
        setStopFiltersPanelOpen(false);
        stopFilterAutoCloseTimeoutId = null;
      }, STOP_FILTER_PANEL_AUTO_CLOSE_MS);
    } else {
      state.stopFiltersPanelLockUntilMs = 0;
    }

    clearStopFilterAttention();

    dom.stopFilterSummaryEl?.classList?.add?.("is-attention");
    dom.stopFiltersToggleBtnEl?.classList?.add?.("is-attention");

    if (filterAttentionTimeoutId) {
      clearTimeout(filterAttentionTimeoutId);
      filterAttentionTimeoutId = null;
    }

    filterAttentionTimeoutId = setTimeout(() => {
      clearStopFilterAttention();
      filterAttentionTimeoutId = null;
    }, FILTER_ATTENTION_DURATION_MS);
  }

  function isStopFiltersPanelLocked() {
    return Number(state.stopFiltersPanelLockUntilMs || 0) > Date.now();
  }

  function syncStopFiltersPanelUi() {
    if (dom.stopFilterSummaryEl) {
      dom.stopFilterSummaryEl.textContent = buildStopFilterSummary();
    }

    if (dom.busStopSelectEl) {
      dom.busStopSelectEl.classList.toggle("is-active-filter", hasActiveStopFilter());
    }

    if (!dom.stopFiltersToggleBtnEl || !dom.stopFiltersPanelEl) return;

    dom.stopFiltersToggleBtnEl.setAttribute("aria-expanded", String(Boolean(state.stopFiltersPanelOpen)));
    dom.stopFiltersPanelEl.classList.toggle("hidden", !state.stopFiltersPanelOpen);
  }

  function setStopFiltersPanelOpen(nextOpen) {
    state.stopFiltersPanelOpen = Boolean(nextOpen);
    syncStopFiltersPanelUi();
  }

  function toggleStopFiltersPanel(forceOpen) {
    clearStopFilterAutoCloseTimer();
    if ((forceOpen === false || (forceOpen == null && state.stopFiltersPanelOpen)) && isStopFiltersPanelLocked()) {
      return;
    }
    const nextOpen = typeof forceOpen === "boolean" ? forceOpen : !state.stopFiltersPanelOpen;
    setStopFiltersPanelOpen(nextOpen);
  }

  function setStopControlsVisibility(visible) {
    if (!dom.busControlsEl) return;
    dom.busControlsEl.classList.toggle("hidden", !visible);
    if (!visible) {
      clearStopFilterAutoCloseTimer();
      state.stopFiltersPanelOpen = false;
      state.stopFiltersPanelLockUntilMs = 0;
      clearStopFilterAttention();
      dom.busStopSelectEl?.classList?.remove?.("is-active-filter");
    }
    syncStopFiltersPanelUi();
  }

  function rerenderFromLatestResponse() {
    if (!state.latestResponse) return;
    api.render(state.latestResponse);
    api.setStatus(api.buildStatusFromResponse(state.latestResponse));
  }

  function refreshAfterStopContextChange({
    interactionType,
    changeType,
    showAttention = false,
    requireLoad = false,
    extraContext = null,
  }) {
    api.trackFirstManualInteraction(interactionType, {
      currentMode: state.mode,
      ...(extraContext && typeof extraContext === "object" ? extraContext : {}),
    });
    api.trackFirstManualStopContextChange(changeType, extraContext);
    api.persistUiState();
    syncStopFiltersPanelUi();
    if (showAttention) {
      triggerStopFilterAttention();
    }

    if (requireLoad) {
      if (state.currentCoords) {
        api.load(state.currentCoords.lat, state.currentCoords.lon);
      } else {
        api.requestLocationAndLoad();
      }
      return;
    }

    rerenderFromLatestResponse();
  }

  function toggleStringFilter(currentValues, value) {
    const normalized = String(value || "").trim();
    if (!normalized) return currentValues;
    if (currentValues.includes(normalized)) {
      return currentValues.filter((item) => item !== normalized);
    }
    return [...currentValues, normalized];
  }

  function toggleLineFilter(
    value,
    { interactionType = "line_filter_toggle", changeType = "line_filter_toggle", showAttention = false } = {}
  ) {
    if (!isStopMode()) return false;

    const nextFilters = toggleStringFilter(state.busLineFilters, value);
    if (nextFilters.length === state.busLineFilters.length) return false;
    state.busLineFilters = nextFilters;
    refreshAfterStopContextChange({
      interactionType,
      changeType,
      showAttention,
    });
    return true;
  }

  function toggleDestinationFilter(
    value,
    {
      interactionType = "destination_filter_toggle",
      changeType = "destination_filter_toggle",
      showAttention = false,
    } = {}
  ) {
    if (!isStopMode()) return false;

    const nextFilters = toggleStringFilter(state.busDestinationFilters, value);
    if (nextFilters.length === state.busDestinationFilters.length) return false;
    state.busDestinationFilters = nextFilters;
    refreshAfterStopContextChange({
      interactionType,
      changeType,
      showAttention,
    });
    return true;
  }

  function getStopMeta(stopId) {
    return state.busStops.find((stop) => stop.id === stopId) || null;
  }

  function getStopCodes(stop) {
    const stopCodes = api.uniqueNonEmptyStrings([
      ...(Array.isArray(stop?.stopCodes) ? stop.stopCodes : []),
      stop?.code,
    ]);

    if (stopCodes.length === 0 && stop?.id) {
      stopCodes.push(String(stop.id));
    }

    return stopCodes;
  }

  function getStopMemberIds(stop) {
    return api.uniqueNonEmptyStrings([
      ...(Array.isArray(stop?.memberStopIds) ? stop.memberStopIds : []),
      stop?.id,
    ]);
  }

  function buildStopDisplay(station, departure = null) {
    const selectedStop = getStopMeta(state.busStopId);
    const stopName = String(departure?.stopName || station?.stopName || selectedStop?.name || "").trim();
    const stopCodes = api.uniqueNonEmptyStrings([
      departure?.stopCode,
      ...(Array.isArray(station?.stopCodes) ? station.stopCodes : []),
      station?.stopCode,
      ...getStopCodes(selectedStop),
    ]);
    const primaryCode = stopCodes[0] || "";

    if (stopName && primaryCode) return `${stopName} ${primaryCode}`;
    if (stopName) return stopName;
    if (primaryCode) return primaryCode;
    return "—";
  }

  function buildModeStopDisplay(station, departure = null) {
    if (isStopMode()) {
      return buildStopDisplay(station, departure);
    }

    const stopName = String(departure?.stopName || station?.stopName || "").trim();
    const stopCode = String(departure?.stopCode || station?.stopCode || "").trim();
    if (stopName && stopCode) return `${stopName} ${stopCode}`;
    if (stopName) return stopName;
    if (stopCode) return stopCode;
    return "—";
  }

  function updateDataScope(data) {
    if (!dom.dataScopeEl) return;

    if (!isStopMode()) {
      dom.dataScopeEl.classList.add("hidden");
      dom.dataScopeEl.textContent = "";
      return;
    }

    const stopName = String(data?.station?.stopName || getStopMeta(state.busStopId)?.name || "").trim();
    const selectedStopCodes = api.uniqueNonEmptyStrings([
      ...(Array.isArray(data?.station?.stopCodes) ? data.station.stopCodes : []),
      data?.station?.stopCode,
      ...getStopCodes(getStopMeta(state.busStopId)),
    ]);
    const stopIdsScope = selectedStopCodes.join(", ");
    const stopScope = hasActiveStopFilter() ? "custom stop selected" : "nearest stop";
    const lineScope =
      state.busLineFilters.length === 0
        ? "all lines"
        : `${state.busLineFilters.length} line${state.busLineFilters.length === 1 ? "" : "s"} selected`;
    const destinationScope =
      state.busDestinationFilters.length === 0
        ? "all destinations"
        : `${state.busDestinationFilters.length} destination${state.busDestinationFilters.length === 1 ? "" : "s"} selected`;
    const resultScope = `${api.getActiveResultsLimit()} results`;

    if (!stopName) {
      dom.dataScopeEl.textContent = `Selecting stop... (${stopScope}, ${lineScope}, ${destinationScope}, ${resultScope})`;
    } else {
      dom.dataScopeEl.textContent = `Selected stop ${stopName} (${stopIdsScope || "—"}) - ${stopScope}, ${lineScope}, ${destinationScope}, ${resultScope}`;
    }

    dom.dataScopeEl.classList.remove("hidden");
  }

  function renderFilterButtons(container, options, activeValues, onToggle) {
    if (!container) return;
    container.innerHTML = "";

    if (!Array.isArray(options) || options.length === 0) {
      const empty = document.createElement("span");
      empty.className = "chip-empty";
      empty.textContent = "No options";
      container.appendChild(empty);
      return;
    }

    const activeSet = new Set(activeValues);
    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip-toggle";
      if (activeSet.has(option.value)) {
        button.classList.add("is-active");
        button.setAttribute("aria-pressed", "true");
      } else {
        button.setAttribute("aria-pressed", "false");
      }

      button.textContent = `${option.value} (${option.count})`;
      button.addEventListener("click", () => onToggle(option.value));
      container.appendChild(button);
    }
  }

  function toggleStopDropdown(forceOpen) {
    if (!dom.busStopSelectEl || !dom.busStopSelectListEl) return;
    const isOpen = dom.busStopSelectEl.getAttribute("aria-expanded") === "true";
    const nextOpen = typeof forceOpen === "boolean" ? forceOpen : !isOpen;
    dom.busStopSelectEl.setAttribute("aria-expanded", String(nextOpen));
    dom.busStopSelectListEl.classList.toggle("hidden", !nextOpen);
  }

  function selectStop(stopId) {
    if (state.suppressBusStopChange) return;
    if (!stopId || stopId === state.busStopId) {
      toggleStopDropdown(false);
      return;
    }

    state.busStopId = stopId;
    state.stopFilterPinned = true;
    toggleStopDropdown(false);

    if (dom.busStopSelectLabelEl) {
      const stop = state.busStops.find((s) => s.id === stopId);
      dom.busStopSelectLabelEl.textContent = stop
        ? `${stop.name} (${stop.distanceMeters}m)`
        : stopId;
    }

    refreshAfterStopContextChange({
      interactionType: "stop_select",
      changeType: "stop_select",
      requireLoad: true,
      extraContext: { selectedStopId: stopId },
    });
  }

  function getNearestStopId() {
    return state.busStops[0]?.id || null;
  }

  function toggleStopFromResultCard(stopId) {
    if (!isStopMode()) return false;
    const normalizedStopId = String(stopId || "").trim();
    if (!normalizedStopId) return false;

    const currentStopId = String(state.busStopId || "").trim() || null;
    const nearestStopId = getNearestStopId();
    const currentPinned = Boolean(state.stopFilterPinned);
    let nextStopId = currentStopId;
    let nextPinned = currentPinned;
    let requireLoad = false;

    if (currentStopId !== normalizedStopId) {
      nextStopId = normalizedStopId;
      nextPinned = true;
      requireLoad = true;
    } else if (currentPinned) {
      nextPinned = false;
      if (nearestStopId && nearestStopId !== currentStopId) {
        nextStopId = nearestStopId;
        requireLoad = true;
      }
    } else {
      nextPinned = true;
    }

    if (nextStopId === currentStopId && nextPinned === currentPinned) return false;
    state.busStopId = nextStopId;
    state.stopFilterPinned = nextPinned;

    if (dom.busStopSelectLabelEl) {
      const activeStop = getStopMeta(state.busStopId);
      dom.busStopSelectLabelEl.textContent = activeStop
        ? `${activeStop.name} (${activeStop.distanceMeters}m)`
        : "Nearest stop";
    }

    refreshAfterStopContextChange({
      interactionType: "result_card_stop_toggle",
      changeType: "result_card_stop_toggle",
      showAttention: true,
      requireLoad,
      extraContext: { selectedStopId: state.busStopId || "" },
    });
    return true;
  }

  function resolveStopIdFromDeparture(departure, station = null) {
    const departureStopId = String(departure?.stopId || "").trim();
    if (departureStopId) {
      const matchedById = state.busStops.find((stop) => getStopMemberIds(stop).includes(departureStopId));
      if (matchedById?.id) return matchedById.id;
    }

    const stopCodeCandidates = api.uniqueNonEmptyStrings([
      departure?.stopCode,
      ...(Array.isArray(station?.stopCodes) ? station.stopCodes : []),
      station?.stopCode,
    ]);

    for (const code of stopCodeCandidates) {
      const matchedStop = state.busStops.find((stop) => getStopCodes(stop).includes(code));
      if (matchedStop?.id) return matchedStop.id;
    }

    return state.busStopId || getNearestStopId();
  }

  function clearResultFilterTrigger(element) {
    if (!element) return;
    element.classList?.remove?.("result-filter-trigger", "is-active");
    element.removeAttribute?.("role");
    element.removeAttribute?.("tabindex");
    element.removeAttribute?.("aria-pressed");
    element.removeAttribute?.("aria-label");
    element.onclick = null;
    element.onkeydown = null;
  }

  function setResultFilterTrigger(element, { active = false, onActivate, ariaLabel }) {
    if (!element || typeof onActivate !== "function") {
      clearResultFilterTrigger(element);
      return;
    }

    element.classList?.add?.("result-filter-trigger");
    element.classList?.toggle?.("is-active", Boolean(active));
    element.setAttribute?.("role", "button");
    element.setAttribute?.("tabindex", "0");
    element.setAttribute?.("aria-pressed", String(Boolean(active)));
    element.setAttribute?.("aria-label", String(ariaLabel || "Toggle filter"));

    const activate = () => onActivate();
    element.onclick = () => activate();
    element.onkeydown = (event) => {
      const key = event?.key;
      if (key !== "Enter" && key !== " " && key !== "Spacebar") return;
      event?.preventDefault?.();
      activate();
    };
  }

  function toggleLineFilterFromResultCard(value) {
    return toggleLineFilter(value, {
      interactionType: "result_card_line_toggle",
      changeType: "result_card_line_toggle",
      showAttention: true,
    });
  }

  function toggleDestinationFilterFromResultCard(value) {
    return toggleDestinationFilter(value, {
      interactionType: "result_card_destination_toggle",
      changeType: "result_card_destination_toggle",
      showAttention: true,
    });
  }

  function renderStopControls() {
    const visible = isStopMode();
    setStopControlsVisibility(visible);
    if (!visible) return;
    syncStopFiltersPanelUi();

    if (dom.busStopSelectListEl) {
      state.suppressBusStopChange = true;
      dom.busStopSelectListEl.innerHTML = "";

      if (state.busStops.length === 0) {
        if (dom.busStopSelectLabelEl) {
          dom.busStopSelectLabelEl.textContent = `No nearby ${getStopModeLabel().singular} stops`;
        }
        if (dom.busStopSelectEl) dom.busStopSelectEl.disabled = true;
      } else {
        if (dom.busStopSelectEl) dom.busStopSelectEl.disabled = false;

        let selectedId = state.busStopId;
        if (!selectedId || !state.busStops.some((s) => s.id === selectedId)) {
          selectedId = state.busStops[0].id;
        }

        for (const stop of state.busStops) {
          const li = document.createElement("li");
          li.setAttribute("role", "option");
          li.dataset.value = stop.id;
          li.textContent = `${stop.name} (${stop.distanceMeters}m)`;
          if (stop.id === selectedId) {
            li.setAttribute("aria-selected", "true");
          }
          li.addEventListener("click", () => selectStop(stop.id));
          dom.busStopSelectListEl.appendChild(li);
        }

        if (dom.busStopSelectLabelEl) {
          const selectedStop = state.busStops.find((s) => s.id === selectedId);
          dom.busStopSelectLabelEl.textContent = selectedStop
            ? `${selectedStop.name} (${selectedStop.distanceMeters}m)`
            : "Select stop";
        }
      }

      state.suppressBusStopChange = false;
    }

    renderFilterButtons(
      dom.busLineFiltersEl,
      state.busFilterOptions.lines,
      state.busLineFilters,
      (value) => toggleLineFilter(value)
    );

    renderFilterButtons(
      dom.busDestinationFiltersEl,
      state.busFilterOptions.destinations,
      state.busDestinationFilters,
      (value) => toggleDestinationFilter(value)
    );
  }

  function updateNextSummary(nextDeparture, station = null) {
    if (!dom.nextSummaryEl || !dom.nextMinsEl || !dom.nextLineEl || !dom.nextTrackEl || !dom.nextDestinationEl) {
      return;
    }

    if (!nextDeparture) {
      dom.nextSummaryEl.classList.add("hidden");
      dom.nextSummaryEl.classList.remove("next-summary-now", "next-summary-soon", "next-summary-later");
      clearResultFilterTrigger(dom.nextLineEl);
      clearResultFilterTrigger(dom.nextDestinationEl);
      clearResultFilterTrigger(dom.nextTrackEl);
      return;
    }

    const diffMin = minutesUntil(nextDeparture.departureIso);

    dom.nextMinsEl.textContent = formatMinutes(nextDeparture.departureIso);
    dom.nextLineEl.textContent = nextDeparture.line || "—";
    dom.nextLineEl.classList.toggle("next-letter-now", diffMin < 3);
    dom.nextTrackEl.textContent =
      isStopMode()
        ? `Stop ${buildModeStopDisplay(station, nextDeparture)}`
        : nextDeparture.track
          ? `Track ${nextDeparture.track}`
          : "Track —";
    dom.nextDestinationEl.textContent = nextDeparture.destination || "—";

    if (isStopMode()) {
      const lineValue = String(nextDeparture.line || "").trim();
      const destinationValue = String(nextDeparture.destination || "").trim();
      const stopId = resolveStopIdFromDeparture(nextDeparture, station);
      setResultFilterTrigger(dom.nextLineEl, {
        active: lineValue ? state.busLineFilters.includes(lineValue) : false,
        onActivate: () => toggleLineFilterFromResultCard(lineValue),
        ariaLabel: `Toggle line filter ${lineValue || "unknown"}`,
      });
      setResultFilterTrigger(dom.nextDestinationEl, {
        active: destinationValue ? state.busDestinationFilters.includes(destinationValue) : false,
        onActivate: () => toggleDestinationFilterFromResultCard(destinationValue),
        ariaLabel: `Toggle destination filter ${destinationValue || "unknown"}`,
      });
      setResultFilterTrigger(dom.nextTrackEl, {
        active: stopId ? state.busStopId === stopId : false,
        onActivate: () => toggleStopFromResultCard(stopId),
        ariaLabel: "Toggle stop filter",
      });
    } else {
      clearResultFilterTrigger(dom.nextLineEl);
      clearResultFilterTrigger(dom.nextDestinationEl);
      clearResultFilterTrigger(dom.nextTrackEl);
    }

    dom.nextSummaryEl.classList.remove("next-summary-now", "next-summary-soon", "next-summary-later");
    if (diffMin < 3) {
      dom.nextSummaryEl.classList.add("next-summary-now");
    } else if (diffMin <= 10) {
      dom.nextSummaryEl.classList.add("next-summary-soon");
    } else {
      dom.nextSummaryEl.classList.add("next-summary-later");
    }
    dom.nextSummaryEl.classList.remove("hidden");
  }

  function buildStatusFromResponse(data) {
    if (!data || !data.station) {
      if (isStopMode()) {
        return data?.message || `No nearby ${getStopModeLabel().singular} stops found.`;
      }

      return data?.message || "No nearby train stations found.";
    }

    const visibleDepartures = getVisibleDepartures(data.station.departures);
    const next = visibleDepartures[0];
    if (!next) {
      if (isStopMode()) {
        if (state.busLineFilters.length > 0 || state.busDestinationFilters.length > 0) {
          const servicePlural = getStopModeLabel().plural;
          return `No upcoming ${servicePlural} match selected filters.`;
        }
        return "No upcoming departures from this stop.";
      }

      return state.helsinkiOnly
        ? "No Helsinki-bound trains in upcoming departures."
        : "No upcoming commuter trains right now.";
    }

    const destination = next.destination ? ` • ${next.destination}` : "";
    const nextTrack =
      state.mode === MODE_RAIL
        ? next.track
          ? ` • Track ${next.track}`
          : ""
        : data.station.stopName || data.station.stopCode
          ? ` • ${buildModeStopDisplay(data.station, next)}`
          : "";
    const serviceName = isStopMode() ? getStopModeLabel().singular : "train";
    return `Next ${next.line || serviceName} in ${formatMinutes(next.departureIso)}${destination}${nextTrack}`;
  }

  function getLoadErrorStatus(error) {
    if (!(error instanceof Error)) {
      return "Could not refresh departures. Please try again.";
    }

    if (error.name === "AbortError") {
      return "Request timed out. Please try again.";
    }

    const message = (error.message || "").trim();
    if (message === "Temporary server error. Please try again.") {
      return message;
    }
    if (message === "Invalid lat/lon") {
      return "Location coordinates were invalid. Please refresh your location.";
    }
    if (message === "Invalid mode") {
      return "Unsupported transport mode.";
    }

    return "Could not refresh departures. Please try again.";
  }

  function getGeolocationErrorStatus(error) {
    if (error?.code === 1) return "Location permission denied.";
    if (error?.code === 2) return "Location unavailable. Please try again.";
    if (error?.code === 3) return "Location request timed out. Please try again.";
    return "Unable to get your location.";
  }

  function getVoiceLocationErrorStatus(error) {
    const code = String(error?.code || "").trim();

    if (code === "voice_unsupported") {
      return "Voice location is not supported in this browser.";
    }
    if (code === "voice_permission_denied") {
      return "Microphone permission denied.";
    }
    if (code === "voice_no_microphone") {
      return "No microphone was found for voice location.";
    }
    if (code === "voice_no_speech") {
      return "No speech detected. Please try again.";
    }
    if (code === "voice_recognition_timeout") {
      return "Voice listening timed out. Please try again.";
    }
    if (code === "voice_language_not_supported") {
      return "Voice language was not supported on this device.";
    }
    if (code === "voice_query_too_short") {
      return "Please describe your location with a few words.";
    }
    if (code === "voice_location_not_found") {
      return "Could not match that place. Try a nearby landmark or street.";
    }
    if (code === "voice_location_selection_cancelled") {
      return "Location selection was cancelled.";
    }
    if (code === "voice_location_selection_invalid") {
      return "Please choose one of the suggested locations.";
    }
    if (code === "voice_recognition_network") {
      return "Voice recognition failed due to a network error. On iPhone, try enabling Siri & Dictation.";
    }
    return "Could not use voice location. Please try again.";
  }

  function showSkeleton() {
    if (dom.skeletonEl) dom.skeletonEl.classList.remove("hidden");
  }

  function hideSkeleton() {
    if (dom.skeletonEl) dom.skeletonEl.classList.add("hidden");
  }

  function render(data) {
    hideSkeleton();
    renderStopControls();
    updateDataScope(data);

    if (!data || !data.station) {
      dom.resultEl.classList.add("hidden");
      updateNextSummary(null);
      return;
    }

    const station = data.station;
    dom.resultEl.classList.remove("hidden");

    dom.stationTitleEl.textContent = station.stopName;
    dom.stationMetaEl.textContent = `${station.distanceMeters}m away`;

    dom.departuresEl.innerHTML = "";
    const visibleDepartures = getVisibleDepartures(station.departures);

    if (visibleDepartures.length === 0) {
      updateNextSummary(null);
      const li = document.createElement("li");
      li.className = "empty-row";
      if (isStopMode()) {
        li.textContent =
          state.busLineFilters.length > 0 || state.busDestinationFilters.length > 0
            ? `No upcoming ${getStopModeLabel().plural} match selected filters.`
            : "No upcoming departures from this stop.";
      } else {
        li.textContent = state.helsinkiOnly
          ? "No Helsinki-bound trains in upcoming departures."
          : "No upcoming commuter trains right now.";
      }
      dom.departuresEl.appendChild(li);
      return;
    }

    updateNextSummary(visibleDepartures[0], station);
    const listDepartures = visibleDepartures.slice(1);

    if (listDepartures.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-row";
      li.textContent =
        isStopMode()
          ? `No additional upcoming ${getStopModeLabel().plural} right now.`
          : "No additional upcoming commuter trains right now.";
      dom.departuresEl.appendChild(li);
      return;
    }

    for (let i = 0; i < listDepartures.length; i++) {
      const item = listDepartures[i];
      const li = document.createElement("li");
      li.className = `departure-row ${departureRowClass(item.departureIso)}`;
      li.style.setProperty("--i", i);

      const letterBadge = document.createElement("div");
      letterBadge.className = "letter-badge";
      letterBadge.textContent = item.line || "?";
      const lineValue = String(item.line || "").trim();
      if (isStopMode()) {
        setResultFilterTrigger(letterBadge, {
          active: lineValue ? state.busLineFilters.includes(lineValue) : false,
          onActivate: () => toggleLineFilterFromResultCard(lineValue),
          ariaLabel: `Toggle line filter ${lineValue || "unknown"}`,
        });
      }

      const train = document.createElement("div");
      train.className = "train";

      const destination = document.createElement("div");
      destination.className = "destination";
      destination.textContent = item.destination || "—";
      const destinationValue = String(item.destination || "").trim();
      if (isStopMode()) {
        setResultFilterTrigger(destination, {
          active: destinationValue ? state.busDestinationFilters.includes(destinationValue) : false,
          onActivate: () => toggleDestinationFilterFromResultCard(destinationValue),
          ariaLabel: `Toggle destination filter ${destinationValue || "unknown"}`,
        });
      }
      train.appendChild(destination);

      const track = document.createElement("span");
      track.className = "track";
      if (isStopMode()) {
        track.textContent = `Stop ${buildModeStopDisplay(station, item)}`;
        const stopId = resolveStopIdFromDeparture(item, station);
        setResultFilterTrigger(track, {
          active: stopId ? state.busStopId === stopId : false,
          onActivate: () => toggleStopFromResultCard(stopId),
          ariaLabel: "Toggle stop filter",
        });
      } else {
        track.textContent = item.track ? `Track ${item.track}` : "Track —";
      }
      train.appendChild(track);

      const time = document.createElement("div");
      time.className = "time";
      const remaining = document.createElement("span");
      remaining.className = "remaining";
      remaining.textContent = formatMinutes(item.departureIso);

      const clockTime = document.createElement("span");
      clockTime.className = "clock-time";
      clockTime.textContent = new Date(item.departureIso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      time.appendChild(remaining);
      time.appendChild(clockTime);

      li.appendChild(letterBadge);
      li.appendChild(train);
      li.appendChild(time);
      dom.departuresEl.appendChild(li);
    }

  }

  function updateClock() {
    if (!dom.nowClockEl) return;
    dom.nowClockEl.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  Object.assign(api, {
    formatMinutes,
    minutesUntil,
    departureRowClass,
    isHelsinkiBound,
    sanitizeStopSelections,
    getVisibleDepartures,
    updateModeButtons,
    updateModeLabels,
    toggleResultsLimitDropdown,
    selectResultsLimit,
    renderResultsLimitControl,
    updateHelsinkiFilterButton,
    countActiveStopFilters,
    buildStopFilterSummary,
    syncStopFiltersPanelUi,
    setStopFiltersPanelOpen,
    toggleStopFiltersPanel,
    setStopControlsVisibility,
    getStopMeta,
    getStopCodes,
    buildStopDisplay,
    buildModeStopDisplay,
    updateDataScope,
    renderFilterButtons,
    toggleStopDropdown,
    selectStop,
    toggleLineFilter,
    toggleDestinationFilter,
    toggleLineFilterFromResultCard,
    toggleDestinationFilterFromResultCard,
    toggleStopFromResultCard,
    resolveStopIdFromDeparture,
    setResultFilterTrigger,
    clearResultFilterTrigger,
    triggerStopFilterAttention,
    renderStopControls,
    updateNextSummary,
    buildStatusFromResponse,
    getLoadErrorStatus,
    getGeolocationErrorStatus,
    getVoiceLocationErrorStatus,
    showSkeleton,
    hideSkeleton,
    render,
    updateClock,
  });
})();
