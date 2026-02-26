/* UI Rendering + Presentation Helpers */
(() => {
  const app = window.HMApp;
  const { api, dom, state, constants } = app;
  const { MODE_RAIL, MODE_TRAM, MODE_METRO, MODE_BUS } = constants;

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

    if (diffMin <= 0 || diffMin < 5) return "departure-now";
    if (diffMin <= 15) return "departure-soon";
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

  function renderResultsLimitControl() {
    if (!dom.resultsLimitSelectEl) return;

    const options = Array.isArray(constants.RESULT_LIMIT_OPTIONS)
      ? constants.RESULT_LIMIT_OPTIONS
      : [];
    const activeValue = api.getActiveResultsLimit();
    dom.resultsLimitSelectEl.innerHTML = "";

    for (const value of options) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `${value}`;
      dom.resultsLimitSelectEl.appendChild(option);
    }

    dom.resultsLimitSelectEl.value = String(activeValue);
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

  function setStopControlsVisibility(visible) {
    if (!dom.busControlsEl) return;
    dom.busControlsEl.classList.toggle("hidden", !visible);
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
      dom.dataScopeEl.textContent = `Selecting stop... (${lineScope}, ${destinationScope}, ${resultScope})`;
    } else {
      dom.dataScopeEl.textContent = `Selected stop ${stopName} (${stopIdsScope || "—"}) - ${lineScope}, ${destinationScope}, ${resultScope}`;
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

    api.trackFirstManualInteraction("stop_select", { currentMode: state.mode });
    api.trackFirstManualStopContextChange("stop_select", { selectedStopId: stopId });
    state.busStopId = stopId;
    api.persistUiState();
    toggleStopDropdown(false);

    if (dom.busStopSelectLabelEl) {
      const stop = state.busStops.find((s) => s.id === stopId);
      dom.busStopSelectLabelEl.textContent = stop
        ? `${stop.name} (${stop.distanceMeters}m)`
        : stopId;
    }

    if (state.currentCoords) {
      api.load(state.currentCoords.lat, state.currentCoords.lon);
    }
  }

  function renderStopControls() {
    const visible = isStopMode();
    setStopControlsVisibility(visible);
    if (!visible) return;

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
      (value) => {
        if (state.busLineFilters.includes(value)) {
          state.busLineFilters = state.busLineFilters.filter((item) => item !== value);
        } else {
          state.busLineFilters = [...state.busLineFilters, value];
        }

        api.trackFirstManualInteraction("line_filter_toggle", { currentMode: state.mode });
        api.trackFirstManualStopContextChange("line_filter_toggle");
        api.persistUiState();
        if (state.latestResponse) {
          api.render(state.latestResponse);
          api.setStatus(api.buildStatusFromResponse(state.latestResponse));
        }
      }
    );

    renderFilterButtons(
      dom.busDestinationFiltersEl,
      state.busFilterOptions.destinations,
      state.busDestinationFilters,
      (value) => {
        if (state.busDestinationFilters.includes(value)) {
          state.busDestinationFilters = state.busDestinationFilters.filter((item) => item !== value);
        } else {
          state.busDestinationFilters = [...state.busDestinationFilters, value];
        }

        api.trackFirstManualInteraction("destination_filter_toggle", { currentMode: state.mode });
        api.trackFirstManualStopContextChange("destination_filter_toggle");
        api.persistUiState();
        if (state.latestResponse) {
          api.render(state.latestResponse);
          api.setStatus(api.buildStatusFromResponse(state.latestResponse));
        }
      }
    );
  }

  function updateNextSummary(nextDeparture, station = null) {
    if (!dom.nextSummaryEl || !dom.nextMinsEl || !dom.nextLineEl || !dom.nextTrackEl || !dom.nextDestinationEl) {
      return;
    }

    if (!nextDeparture) {
      dom.nextSummaryEl.classList.add("hidden");
      dom.nextSummaryEl.classList.remove("next-summary-now", "next-summary-soon", "next-summary-later");
      return;
    }

    const diffMin = minutesUntil(nextDeparture.departureIso);

    dom.nextMinsEl.textContent = formatMinutes(nextDeparture.departureIso);
    dom.nextLineEl.textContent = nextDeparture.line || "—";
    dom.nextLineEl.classList.toggle("next-letter-now", diffMin < 5);
    dom.nextTrackEl.textContent =
      isStopMode()
        ? `Stop ${buildModeStopDisplay(station, nextDeparture)}`
        : nextDeparture.track
          ? `Track ${nextDeparture.track}`
          : "Track —";
    dom.nextDestinationEl.textContent = nextDeparture.destination || "—";
    dom.nextSummaryEl.classList.remove("next-summary-now", "next-summary-soon", "next-summary-later");
    if (diffMin < 5) {
      dom.nextSummaryEl.classList.add("next-summary-now");
    } else if (diffMin <= 15) {
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

      const train = document.createElement("div");
      train.className = "train";

      const destination = document.createElement("div");
      destination.className = "destination";
      destination.textContent = item.destination || "—";
      train.appendChild(destination);

      const track = document.createElement("span");
      track.className = "track";
      if (isStopMode()) {
        track.textContent = `Stop ${buildModeStopDisplay(station, item)}`;
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
    renderResultsLimitControl,
    updateHelsinkiFilterButton,
    setStopControlsVisibility,
    getStopMeta,
    getStopCodes,
    buildStopDisplay,
    buildModeStopDisplay,
    updateDataScope,
    renderFilterButtons,
    toggleStopDropdown,
    selectStop,
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
