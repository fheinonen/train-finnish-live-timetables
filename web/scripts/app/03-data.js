/* Data Loading + Geolocation Flow */
(() => {
  const app = window.HMApp;
  const { api, dom, state, constants } = app;
  const { MODE_TRAM, MODE_METRO, MODE_BUS } = constants;

  function isStopMode(mode) {
    return mode === MODE_BUS || mode === MODE_TRAM || mode === MODE_METRO;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = constants.FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function fetchWithRetryOnce(url, options = {}) {
    let res;

    try {
      res = await fetchWithTimeout(url, options);
    } catch {
      await delay(350);
      return fetchWithTimeout(url, options);
    }

    if (res.status >= 500) {
      await delay(350);
      return fetchWithTimeout(url, options);
    }

    return res;
  }

  function buildFilterOptionsFromDepartures(departures) {
    const lines = new Map();
    const destinations = new Map();

    for (const departure of departures || []) {
      const line = String(departure?.line || "").trim();
      if (line) {
        lines.set(line, (lines.get(line) || 0) + 1);
      }

      const destination = String(departure?.destination || "").trim();
      if (destination) {
        destinations.set(destination, (destinations.get(destination) || 0) + 1);
      }
    }

    const toSortedOptions = (sourceMap) =>
      [...sourceMap.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([value, count]) => ({ value, count }));

    return {
      lines: toSortedOptions(lines),
      destinations: toSortedOptions(destinations),
    };
  }

  function updateStopModeStateFromResponse(responseData) {
    const stops = Array.isArray(responseData?.stops)
      ? responseData.stops
          .filter((stop) => stop && stop.id && stop.name)
          .map((stop) => ({
            id: stop.id,
            name: stop.name,
            code: String(stop.code || "").trim() || null,
            stopCodes: api.uniqueNonEmptyStrings([
              ...(Array.isArray(stop.stopCodes) ? stop.stopCodes : []),
              stop.code,
            ]),
            distanceMeters: Number(stop.distanceMeters) || 0,
          }))
      : [];

    state.busStops = stops;

    const selectedFromResponse = String(responseData?.selectedStopId || "").trim() || null;
    const stopExists = (id) => stops.some((stop) => stop.id === id);

    if (selectedFromResponse && stopExists(selectedFromResponse)) {
      state.busStopId = selectedFromResponse;
    } else if (!state.busStopId || !stopExists(state.busStopId)) {
      state.busStopId = stops[0]?.id || null;
    }

    if (state.deferInitialStopContext) {
      state.deferInitialStopContext = false;
      state.deferredBusStopId = null;
      state.deferredBusLineFilters = [];
      state.deferredBusDestinationFilters = [];
      state.busLineFilters = [];
      state.busDestinationFilters = [];
    }

    state.hasCompletedInitialStopModeLoad = true;

    const departures = Array.isArray(responseData?.station?.departures)
      ? responseData.station.departures
      : [];
    state.busFilterOptions = buildFilterOptionsFromDepartures(departures);
    api.sanitizeStopSelections();
  }

  function createVoiceError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function getVoiceErrorCode(error) {
    return String(error?.code || "")
      .trim()
      .toLowerCase();
  }

  function getVoiceRecognitionLanguages() {
    return api.uniqueNonEmptyStrings([
      "fi-FI",
      "en-US",
      ...(Array.isArray(navigator.languages) ? navigator.languages : []),
      navigator.language,
    ]);
  }

  function getSpeechRecognitionConstructor() {
    if (typeof window.SpeechRecognition === "function") return window.SpeechRecognition;
    if (typeof window.webkitSpeechRecognition === "function") return window.webkitSpeechRecognition;
    return null;
  }

  function supportsVoiceLocation() {
    return Boolean(getSpeechRecognitionConstructor());
  }

  function mapSpeechError(errorCode) {
    if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
      return createVoiceError("voice_permission_denied", "Microphone permission denied.");
    }
    if (errorCode === "audio-capture") {
      return createVoiceError("voice_no_microphone", "No microphone available.");
    }
    if (errorCode === "language-not-supported") {
      return createVoiceError("voice_language_not_supported", "Speech language is not supported.");
    }
    if (errorCode === "network") {
      return createVoiceError("voice_recognition_network", "Voice recognition network error.");
    }
    if (errorCode === "no-speech") {
      return createVoiceError("voice_no_speech", "No speech detected.");
    }
    return createVoiceError("voice_not_understood", "Voice recognition failed.");
  }

  function captureVoiceQuery(language) {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      return Promise.reject(
        createVoiceError("voice_unsupported", "Voice recognition not supported.")
      );
    }

    return new Promise((resolve, reject) => {
      const recognition = new SpeechRecognition();
      const preferredLanguage = String(language || navigator.language || "fi-FI").trim();
      recognition.lang = preferredLanguage || "fi-FI";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let settled = false;
      let transcript = "";
      let silenceStopTimerId = null;
      let stopRequested = false;

      const clearSilenceStopTimer = () => {
        clearTimeout(silenceStopTimerId);
        silenceStopTimerId = null;
      };

      const requestStop = () => {
        if (stopRequested || settled) return;
        stopRequested = true;
        try {
          recognition.stop();
        } catch {
          // Ignore stop errors; timeout/onend handlers still guard completion.
        }
      };

      const scheduleSilenceStop = () => {
        clearSilenceStopTimer();
        silenceStopTimerId = setTimeout(requestStop, constants.VOICE_SILENCE_STOP_MS);
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        clearSilenceStopTimer();
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.onspeechend = null;
        recognition.onsoundend = null;
        recognition.onaudioend = null;
        recognition.onnomatch = null;
      };

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };

      const timeoutId = setTimeout(() => {
        try {
          recognition.abort();
        } catch {
          // Ignore abort errors during timeout cleanup.
        }
        finish(
          reject,
          createVoiceError("voice_recognition_timeout", "Voice recognition timed out.")
        );
      }, constants.VOICE_RECOGNITION_TIMEOUT_MS);

      recognition.onresult = (event) => {
        for (let index = event?.resultIndex || 0; index < (event?.results?.length || 0); index += 1) {
          const result = event.results[index];
          const nextTranscript = String(result?.[0]?.transcript || "").trim();
          if (!nextTranscript) continue;
          transcript = nextTranscript;
          scheduleSilenceStop();
          if (result?.isFinal) {
            requestStop();
            return;
          }
        }
      };

      recognition.onerror = (event) => {
        const speechCode = String(event?.error || "")
          .trim()
          .toLowerCase();
        finish(reject, mapSpeechError(speechCode));
      };

      recognition.onend = () => {
        if (settled) return;

        const cleaned = String(transcript || "").trim();
        if (!cleaned) {
          finish(reject, createVoiceError("voice_no_speech", "No speech detected."));
          return;
        }

        finish(resolve, cleaned);
      };

      recognition.onspeechend = () => {
        requestStop();
      };

      recognition.onsoundend = () => {
        scheduleSilenceStop();
      };

      recognition.onaudioend = () => {
        scheduleSilenceStop();
      };

      recognition.onnomatch = () => {
        finish(reject, createVoiceError("voice_not_understood", "Could not understand speech."));
      };

      try {
        recognition.start();
      } catch (error) {
        const errorName = String(error?.name || "")
          .trim()
          .toLowerCase();
        if (errorName === "notallowederror" || errorName === "securityerror") {
          finish(reject, createVoiceError("voice_permission_denied", "Microphone permission denied."));
          return;
        }
        finish(reject, createVoiceError("voice_not_understood", "Unable to start voice recognition."));
      }
    });
  }

  function shouldRetryVoiceRecognition(errorCode) {
    return (
      errorCode === "voice_no_speech" ||
      errorCode === "voice_not_understood" ||
      errorCode === "voice_recognition_timeout" ||
      errorCode === "voice_language_not_supported"
    );
  }

  async function captureVoiceQueryWithRetry() {
    const languages = getVoiceRecognitionLanguages();
    let lastError = null;

    for (const language of languages) {
      try {
        return await captureVoiceQuery(language);
      } catch (error) {
        lastError = error;
        if (!shouldRetryVoiceRecognition(getVoiceErrorCode(error))) {
          break;
        }
      }
    }

    throw lastError || createVoiceError("voice_not_understood", "Voice recognition failed.");
  }

  function normalizeVoiceLocationChoices(rawChoices) {
    if (!Array.isArray(rawChoices)) return [];

    return rawChoices
      .map((choice) => {
        const lat = Number(choice?.lat);
        const lon = Number(choice?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

        return {
          lat,
          lon,
          label: String(choice?.label || "").trim(),
        };
      })
      .filter(Boolean);
  }

  function hideVoiceLocationChoices() {
    if (dom.voiceLocationChoicesEl) {
      dom.voiceLocationChoicesEl.classList.add("hidden");
    }
    if (dom.voiceLocationChoicesTitleEl) {
      dom.voiceLocationChoicesTitleEl.textContent = "";
    }
    if (dom.voiceLocationChoicesOptionsEl) {
      dom.voiceLocationChoicesOptionsEl.innerHTML = "";
    }
    if (dom.voiceLocationChoicesCancelEl) {
      dom.voiceLocationChoicesCancelEl.onclick = null;
    }
  }

  function promptVoiceLocationChoiceWithPrompt(query, choices) {
    if (typeof window.prompt !== "function") {
      throw createVoiceError(
        "voice_location_selection_cancelled",
        "Location selection was cancelled."
      );
    }

    const optionsText = choices
      .map((choice, index) => `${index + 1}. ${choice.label || `${choice.lat}, ${choice.lon}`}`)
      .join("\n");
    const response = window.prompt(
      `Multiple matches found for "${api.safeString(query, 80)}". Select number:\n${optionsText}`,
      "1"
    );

    if (response == null) {
      throw createVoiceError(
        "voice_location_selection_cancelled",
        "Location selection was cancelled."
      );
    }

    const parsed = Number.parseInt(String(response).trim(), 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > choices.length) {
      throw createVoiceError("voice_location_selection_invalid", "Invalid location selection.");
    }

    return choices[parsed - 1];
  }

  async function promptVoiceLocationChoice(query, choices) {
    if (!Array.isArray(choices) || choices.length === 0) {
      throw createVoiceError("voice_location_not_found", "No matching location found.");
    }

    if (
      !dom.voiceLocationChoicesEl ||
      !dom.voiceLocationChoicesTitleEl ||
      !dom.voiceLocationChoicesOptionsEl ||
      !dom.voiceLocationChoicesCancelEl
    ) {
      return promptVoiceLocationChoiceWithPrompt(query, choices);
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        hideVoiceLocationChoices();
        callback(value);
      };

      dom.voiceLocationChoicesTitleEl.textContent = `Multiple matches for "${api.safeString(
        query,
        80
      )}". Choose one:`;
      api.setStatus("Multiple matches found. Choose one below.");
      dom.voiceLocationChoicesOptionsEl.innerHTML = "";

      for (const choice of choices) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "voice-location-choice-option";
        button.textContent = choice.label || `${choice.lat.toFixed(5)}, ${choice.lon.toFixed(5)}`;
        button.addEventListener("click", () => finish(resolve, choice), { once: true });
        dom.voiceLocationChoicesOptionsEl.appendChild(button);
      }

      dom.voiceLocationChoicesCancelEl.onclick = () =>
        finish(
          reject,
          createVoiceError("voice_location_selection_cancelled", "Location selection was cancelled.")
        );

      dom.voiceLocationChoicesEl.classList.remove("hidden");
    });
  }

  async function resolveVoiceLocationQuery(rawQuery) {
    const query = String(rawQuery || "").trim();
    if (query.length < constants.VOICE_QUERY_MIN_LENGTH) {
      throw createVoiceError("voice_query_too_short", "Voice query too short.");
    }

    const params = new URLSearchParams({ text: query });
    if (state.currentCoords) {
      params.set("lat", String(state.currentCoords.lat));
      params.set("lon", String(state.currentCoords.lon));
    }

    const preferredLanguage =
      (Array.isArray(navigator.languages) && navigator.languages[0]) || navigator.language || "";
    if (preferredLanguage) {
      params.set("lang", String(preferredLanguage));
    }

    let res;
    try {
      res = await fetchWithRetryOnce(`/api/v1/geocode?${params.toString()}`);
    } catch {
      throw createVoiceError("voice_geocode_failed", "Location lookup failed.");
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw createVoiceError("voice_geocode_failed", "Unexpected location lookup response.");
    }

    const json = await res.json();
    if (!res.ok) {
      throw createVoiceError(
        "voice_geocode_failed",
        String(json?.error || "Location lookup failed.").trim()
      );
    }

    const choices = normalizeVoiceLocationChoices(json?.choices);
    if (json?.ambiguous && choices.length > 1) {
      const selected = await promptVoiceLocationChoice(query, choices);
      return {
        lat: selected.lat,
        lon: selected.lon,
        label: selected.label,
        query,
      };
    }

    const lat = Number(json?.location?.lat);
    const lon = Number(json?.location?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw createVoiceError("voice_location_not_found", "No matching location found.");
    }

    return {
      lat,
      lon,
      label: String(json?.location?.label || "").trim(),
      query,
    };
  }

  function shouldOfferVoiceTypedFallback(errorCode) {
    return (
      errorCode === "voice_unsupported" ||
      errorCode === "voice_no_speech" ||
      errorCode === "voice_recognition_timeout" ||
      errorCode === "voice_recognition_network" ||
      errorCode === "voice_not_understood"
    );
  }

  function promptVoiceTypedFallback(errorCode) {
    if (!shouldOfferVoiceTypedFallback(errorCode) || typeof window.prompt !== "function") {
      return null;
    }

    const hint =
      errorCode === "voice_unsupported"
        ? "Voice input is limited in this browser. Type your location instead:"
        : "Could not capture your voice on this device. Type your location:";
    const input = window.prompt(`${hint}\nExample: Kamppi Helsinki`, "");
    const cleaned = String(input || "").trim();
    return cleaned || null;
  }

  async function resolveVoiceQueryAndLoad(rawQuery) {
    const transcript = String(rawQuery || "").trim();
    hideVoiceLocationChoices();
    api.setStatus(`Looking up "${api.safeString(transcript, 80)}"...`);
    const location = await resolveVoiceLocationQuery(transcript);
    api.setResolvedLocationHint({
      query: transcript,
      label: location.label,
      lat: location.lat,
      lon: location.lon,
    });
    state.currentCoords = { lat: location.lat, lon: location.lon };
    api.setPermissionRequired(false);
    await load(location.lat, location.lon);
    return true;
  }

  async function requestVoiceLocationAndLoad() {
    if (state.isLoading || state.isVoiceListening) return false;

    hideVoiceLocationChoices();
    api.setVoiceListening(true);
    api.setStatus("Listening... speak now, then pause.");

    try {
      if (!supportsVoiceLocation()) {
        const unsupportedError = createVoiceError(
          "voice_unsupported",
          "Voice recognition not supported."
        );
        const fallbackQuery = promptVoiceTypedFallback(getVoiceErrorCode(unsupportedError));
        if (!fallbackQuery) {
          api.setStatus(api.getVoiceLocationErrorStatus(unsupportedError));
          return false;
        }
        return resolveVoiceQueryAndLoad(fallbackQuery);
      }

      const transcript = await captureVoiceQueryWithRetry();
      return resolveVoiceQueryAndLoad(transcript);
    } catch (error) {
      const errorCode = getVoiceErrorCode(error);
      const fallbackQuery = promptVoiceTypedFallback(errorCode);
      if (fallbackQuery) {
        try {
          return await resolveVoiceQueryAndLoad(fallbackQuery);
        } catch (fallbackError) {
          console.error("voice fallback location error:", fallbackError);
          api.reportClientError("voice-location-fallback", fallbackError, {
            mode: state.mode,
            sourceCode: errorCode || "unknown",
          });
          api.setStatus(api.getVoiceLocationErrorStatus(fallbackError));
          return false;
        }
      }

      if (!errorCode || errorCode === "unknown") {
        console.error("voice location error:", error);
      }
      api.reportClientError("voice-location", error, {
        mode: state.mode,
        code: errorCode || "unknown",
      });
      api.setStatus(api.getVoiceLocationErrorStatus(error));
      return false;
    } finally {
      api.setVoiceListening(false);
    }
  }

  async function load(lat, lon) {
    const loadToken = ++state.latestLoadToken;
    const requestMode = state.mode;
    const requestBusStopId = state.busStopId;
    const wasInitialStopModeLoad = isStopMode(requestMode) && !state.hasCompletedInitialStopModeLoad;

    api.setLoading(true);
    api.setStatus("Loading departures...");

    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lon),
        mode: requestMode.toUpperCase(),
        results: String(api.getActiveResultsLimit(requestMode)),
      });

      // Keep first stop-mode request nearest-first; persisted stop context is only
      // restored if user explicitly re-selects it during this session.
      const skipPersistedStopContext =
        isStopMode(requestMode) &&
        (state.deferInitialStopContext || !state.hasCompletedInitialStopModeLoad);
      if (isStopMode(requestMode) && requestBusStopId && !skipPersistedStopContext) {
        params.set("stopId", requestBusStopId);
      }

      const res = await fetchWithRetryOnce(`/api/v1/departures?${params.toString()}`);
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        if (!res.ok) {
          throw new Error("Request failed");
        }
        throw new Error("Unexpected server response.");
      }

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Request failed");
      }

      if (loadToken !== state.latestLoadToken) {
        return;
      }

      if (isStopMode(requestMode)) {
        updateStopModeStateFromResponse(json);
        api.persistUiState();
        if (wasInitialStopModeLoad) {
          api.trackInitialNearestStopResolved(json, requestMode);
        }
      }

      state.latestResponse = json;
      api.render(json);
      api.setPermissionRequired(false);
      api.setLastUpdated(new Date());
      api.setStatus(api.buildStatusFromResponse(json));
      api.trackFirstSuccessfulRender(json, requestMode);
    } catch (err) {
      if (loadToken !== state.latestLoadToken) {
        return;
      }

      state.latestResponse = null;
      console.error("load departures error:", err);
      api.reportClientError("load", err, { mode: requestMode });
      api.setStatus(api.getLoadErrorStatus(err));
      dom.resultEl.classList.add("hidden");
      api.updateNextSummary(null);
    } finally {
      if (loadToken === state.latestLoadToken) {
        api.setLoading(false);
      }
    }
  }

  function requestLocationAndLoad() {
    hideVoiceLocationChoices();
    api.setResolvedLocationHint(null);

    if (!navigator.geolocation) {
      api.setStatus("Geolocation not supported in this browser.");
      api.setPermissionRequired(true);
      return false;
    }

    if (state.isLoading || state.isVoiceListening) return false;

    api.setStatus("Getting your location...");
    api.setLoading(true);

    const geolocationOptions = (enableHighAccuracy) => ({
      enableHighAccuracy,
      timeout: enableHighAccuracy ? 15000 : 10000,
      maximumAge: 0,
    });

    const shouldRetryWithHighAccuracy = (error, usedHighAccuracy) => {
      if (usedHighAccuracy) return false;
      return error?.code === 2 || error?.code === 3;
    };

    const handleLocationSuccess = (pos) => {
      state.currentCoords = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
      };
      state.locationGranted = true;
      api.setStorageItem("location:granted", "1");
      api.setPermissionRequired(false);
      api.setLoading(false);
      load(state.currentCoords.lat, state.currentCoords.lon);
    };

    const handleLocationError = (error) => {
      if (error.code === 1) {
        api.setPermissionRequired(true);
      } else {
        api.setPermissionRequired(false);
      }

      api.setStatus(api.getGeolocationErrorStatus(error));
      state.latestResponse = null;
      dom.resultEl.classList.add("hidden");
      api.updateNextSummary(null);
      api.setLoading(false);
    };

    const requestGeolocation = (enableHighAccuracy) => {
      navigator.geolocation.getCurrentPosition(
        handleLocationSuccess,
        (error) => {
          if (shouldRetryWithHighAccuracy(error, enableHighAccuracy)) {
            requestGeolocation(true);
            return;
          }
          handleLocationError(error);
        },
        geolocationOptions(enableHighAccuracy)
      );
    };

    requestGeolocation(false);

    return true;
  }

  function refreshDeparturesOnly() {
    if (state.isVoiceListening) return;

    if (state.currentCoords) {
      load(state.currentCoords.lat, state.currentCoords.lon);
      return;
    }

    requestLocationAndLoad();
  }

  function applyModeUiState(options = {}) {
    const modeOnly = Boolean(options.modeOnly);
    api.updateModeButtons();
    api.updateModeLabels();
    if (modeOnly) return;
    api.renderResultsLimitControl();
    api.updateHelsinkiFilterButton();
    api.renderStopControls();
    api.updateDataScope(state.latestResponse);
  }

  Object.assign(api, {
    delay,
    fetchWithTimeout,
    fetchWithRetryOnce,
    updateStopModeStateFromResponse,
    buildFilterOptionsFromDepartures,
    load,
    requestLocationAndLoad,
    requestVoiceLocationAndLoad,
    supportsVoiceLocation,
    captureVoiceQuery,
    captureVoiceQueryWithRetry,
    getVoiceRecognitionLanguages,
    shouldRetryVoiceRecognition,
    resolveVoiceLocationQuery,
    refreshDeparturesOnly,
    applyModeUiState,
  });
})();
