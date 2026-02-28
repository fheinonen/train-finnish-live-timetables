const { graphqlRequest, nearbyStopsQuery } = require("../lib/digitransit");

const DIGITRANSIT_GEOCODING_ENDPOINT = "https://api.digitransit.fi/geocoding/v1/search";
const REQUEST_TIMEOUT_MS = 7000;
const HSL_STOP_VALIDATION_RADIUS_METERS = 2500;
const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 140;
const MAX_LANG_LENGTH = 12;
const MAX_GEOCODE_TEXT_VARIANTS = 5;
const MAX_MATCH_TEXT_LENGTH = 220;
const AMBIGUITY_SCORE_DELTA = 8;
const AMBIGUITY_MAX_CHOICES = 4;
const DEFAULT_BIAS_LAT = 60.1699;
const DEFAULT_BIAS_LON = 24.9384;
const HSL_MUNICIPALITY_TOKENS = ["helsinki", "espoo", "vantaa", "kauniainen"];

function safeString(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function parseCoordinate(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  }

  if (typeof raw !== "number") return null;
  return Number.isFinite(raw) ? raw : null;
}

function isValidLatLon(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function normalizeLanguage(raw) {
  if (raw == null) return null;
  const value = safeString(raw, MAX_LANG_LENGTH).trim();
  if (!value) return null;
  if (!/^[a-z]{2,3}(?:-[A-Za-z]{2})?$/.test(value)) return null;
  return value;
}

function addVariant(variants, value) {
  const normalized = safeString(value, MAX_QUERY_LENGTH).trim();
  if (!normalized) return;
  if (variants.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
    return;
  }
  variants.push(normalized);
}

function normalizeGeocodeQuery(value) {
  return safeString(value, MAX_QUERY_LENGTH)
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s\-']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildGeocodeTextVariants(text) {
  const base = normalizeGeocodeQuery(text);
  if (!base) return [];

  const variants = [];
  addVariant(variants, base);

  const hyphenAsSpace = base.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  addVariant(variants, hyphenAsSpace);

  const tokens = hyphenAsSpace.split(" ").filter(Boolean);
  for (let i = 0; i < tokens.length - 1 && variants.length < MAX_GEOCODE_TEXT_VARIANTS; i += 1) {
    const merged = [...tokens];
    merged.splice(i, 2, `${tokens[i]}${tokens[i + 1]}`);
    addVariant(variants, merged.join(" "));
  }

  addVariant(variants, tokens.join(""));
  addVariant(variants, base.replace(/-/g, ""));

  const hasMunicipalityToken = tokens.some((token) => HSL_MUNICIPALITY_TOKENS.includes(token));
  if (!hasMunicipalityToken && tokens.length >= 2) {
    for (const municipality of HSL_MUNICIPALITY_TOKENS) {
      // Speech/geocoder mismatch sometimes requires municipality glued to the last token.
      addVariant(variants, `${hyphenAsSpace}${municipality}`);
      if (variants.length >= MAX_GEOCODE_TEXT_VARIANTS) {
        return variants.slice(0, MAX_GEOCODE_TEXT_VARIANTS);
      }

      addVariant(variants, `${hyphenAsSpace} ${municipality}`);
    }
  }

  return variants.slice(0, MAX_GEOCODE_TEXT_VARIANTS);
}

function normalizeForMatch(value, maxLength) {
  const normalized = safeString(value, maxLength)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalized ? normalized.split(" ").filter(Boolean) : [];
  return {
    text: normalized,
    tokens,
    compact: tokens.join(""),
  };
}

function tokenMatches(queryToken, labelToken) {
  if (!queryToken || !labelToken) return false;
  if (labelToken === queryToken) return true;
  if (queryToken.length < 3) return false;
  if (labelToken.startsWith(queryToken) || queryToken.startsWith(labelToken)) return true;

  if (queryToken.length >= 5 && labelToken.includes(queryToken)) return true;
  if (labelToken.length >= 5 && queryToken.includes(labelToken)) return true;

  return false;
}

function computeTokenCoverage(queryTokens, labelTokens) {
  if (!queryTokens.length || !labelTokens.length) return 0;

  const labelSet = new Set(labelTokens);
  let matched = 0;
  for (const queryToken of queryTokens) {
    if (labelSet.has(queryToken)) {
      matched += 1;
      continue;
    }

    if (labelTokens.some((labelToken) => tokenMatches(queryToken, labelToken))) {
      matched += 0.5;
    }
  }

  return matched / queryTokens.length;
}

function computeOrderedTokenCoverage(queryTokens, labelTokens) {
  if (!queryTokens.length || !labelTokens.length) return 0;

  let labelIndex = 0;
  let matched = 0;

  for (const queryToken of queryTokens) {
    if (!queryToken) continue;

    for (; labelIndex < labelTokens.length; labelIndex += 1) {
      const labelToken = labelTokens[labelIndex];
      const matches = tokenMatches(queryToken, labelToken);

      if (matches) {
        matched += 1;
        labelIndex += 1;
        break;
      }
    }
  }

  return matched / queryTokens.length;
}

function isWeakLocationToken(token) {
  if (!token) return true;
  if (token.length < 4) return true;
  return (
    token === "helsinki" ||
    token === "espoo" ||
    token === "vantaa" ||
    token === "kauniainen"
  );
}

function computeMissingTokenPenalty(queryTokens, labelTokens) {
  if (queryTokens.length < 2 || !labelTokens.length) return 0;

  let penalty = 0;
  let unmatchedStrongTokens = 0;

  for (const queryToken of queryTokens) {
    if (isWeakLocationToken(queryToken)) continue;
    const hasMatch = labelTokens.some((labelToken) => tokenMatches(queryToken, labelToken));
    if (hasMatch) continue;

    unmatchedStrongTokens += 1;
    penalty += Math.min(24, 8 + Math.max(0, queryToken.length - 4) * 2);
  }

  if (unmatchedStrongTokens >= 1) {
    penalty += 8;
  }

  return penalty;
}

function countStrongTokenMatches(queryTokens, labelTokens) {
  if (!queryTokens.length || !labelTokens.length) return 0;
  let count = 0;

  for (const queryToken of queryTokens) {
    if (isWeakLocationToken(queryToken)) continue;
    const hasMatch = labelTokens.some((labelToken) => tokenMatches(queryToken, labelToken));
    if (hasMatch) {
      count += 1;
    }
  }

  return count;
}

function scoreCandidate(queryMatch, candidate) {
  const labelMatch = normalizeForMatch(candidate.label || "", MAX_MATCH_TEXT_LENGTH);
  let score = 0;

  if (queryMatch.compact && labelMatch.compact) {
    if (queryMatch.compact === labelMatch.compact) {
      score += 100;
    } else if (labelMatch.compact.includes(queryMatch.compact)) {
      score += 65;
    } else if (queryMatch.compact.includes(labelMatch.compact)) {
      score += 25;
    }
  }

  score += computeTokenCoverage(queryMatch.tokens, labelMatch.tokens) * 60;
  score += computeOrderedTokenCoverage(queryMatch.tokens, labelMatch.tokens) * 20;
  score -= computeMissingTokenPenalty(queryMatch.tokens, labelMatch.tokens);
  score += Math.max(0, 10 - (candidate.variantIndex || 0) * 2);

  if (Number.isFinite(candidate.confidence)) {
    score += Math.max(0, Math.min(1, candidate.confidence)) * 10;
  }

  return score;
}

function buildLocationPayload(candidate) {
  return {
    lat: candidate.lat,
    lon: candidate.lon,
    label: candidate.label,
    confidence: candidate.confidence,
  };
}

function rankCandidatesForQuery(candidates, queryText) {
  const originalQueryMatch = normalizeForMatch(queryText, MAX_QUERY_LENGTH);
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => {
      const labelMatch = normalizeForMatch(candidate.label || "", MAX_MATCH_TEXT_LENGTH);
      const strongTokenMatches = countStrongTokenMatches(originalQueryMatch.tokens, labelMatch.tokens);
      let score = scoreCandidate(originalQueryMatch, candidate);

      const variantQuery = String(candidate.queryVariant || "").trim();
      if (variantQuery) {
        const variantQueryMatch = normalizeForMatch(variantQuery, MAX_QUERY_LENGTH);
        if (variantQueryMatch.text && variantQueryMatch.text !== originalQueryMatch.text) {
          score = Math.max(score, scoreCandidate(variantQueryMatch, candidate) + 4);
        }
      }

      return { candidate, score, strongTokenMatches };
    })
    .sort((a, b) => {
      if (b.strongTokenMatches !== a.strongTokenMatches) {
        return b.strongTokenMatches - a.strongTokenMatches;
      }
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      const confidenceA = Number.isFinite(a.candidate?.confidence) ? a.candidate.confidence : -1;
      const confidenceB = Number.isFinite(b.candidate?.confidence) ? b.candidate.confidence : -1;
      if (confidenceB !== confidenceA) {
        return confidenceB - confidenceA;
      }

      return (a.candidate?.variantIndex || 0) - (b.candidate?.variantIndex || 0);
    });
}

function buildAmbiguousChoices(rankedCandidates) {
  if (!Array.isArray(rankedCandidates) || rankedCandidates.length < 2) return [];

  const best = rankedCandidates[0];
  if (!best || best.strongTokenMatches <= 0) return [];

  const choices = [];
  const seen = new Set();

  for (const ranked of rankedCandidates) {
    if (ranked.strongTokenMatches !== best.strongTokenMatches) continue;
    if (ranked.score < best.score - AMBIGUITY_SCORE_DELTA) continue;

    const location = buildLocationPayload(ranked.candidate);
    const dedupeKey = `${location.lat.toFixed(6)},${location.lon.toFixed(6)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    choices.push(location);
    if (choices.length >= AMBIGUITY_MAX_CHOICES) break;
  }

  return choices.length >= 2 ? choices : [];
}

function getGeocodingUrl({ text, biasLat, biasLon, lang }) {
  const params = new URLSearchParams();
  params.set("text", text);
  params.set("size", "5");
  params.set("boundary.country", "FI");
  params.set("focus.point.lat", String(biasLat));
  params.set("focus.point.lon", String(biasLon));

  if (lang) {
    params.set("lang", lang);
  }

  return `${DIGITRANSIT_GEOCODING_ENDPOINT}?${params.toString()}`;
}

function parseFeature(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!isValidLatLon(lat, lon)) return null;

  const properties = feature?.properties || {};
  const label = safeString(
    properties.label ||
      properties.name ||
      [properties.locality, properties.region].filter(Boolean).join(", "),
    180
  ).trim();

  const confidenceRaw = Number(properties.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : null;

  return {
    lat,
    lon,
    label: label || null,
    confidence,
  };
}

async function geocode(
  text,
  biasLat,
  biasLon,
  lang,
  { fetchImpl = fetch, getApiKey = () => process.env.DIGITRANSIT_API_KEY } = {}
) {
  const key = getApiKey();
  if (!key) {
    throw new Error("Missing DIGITRANSIT_API_KEY environment variable.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;

  try {
    response = await fetchImpl(getGeocodingUrl({ text, biasLat, biasLon, lang }), {
      method: "GET",
      headers: {
        accept: "application/json",
        "digitransit-subscription-key": key,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Digitransit geocoding request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error(`Digitransit geocoding invalid response (HTTP ${response.status})`);
  }

  if (!response.ok) {
    throw new Error(`Digitransit geocoding HTTP ${response.status}`);
  }

  const candidates = (Array.isArray(json?.features) ? json.features : [])
    .map(parseFeature)
    .filter(Boolean);
  return candidates;
}

async function hasNearbyHslStop(
  lat,
  lon,
  { graphqlRequestImpl = graphqlRequest } = {}
) {
  const nearbyData = await graphqlRequestImpl(nearbyStopsQuery, {
    lat,
    lon,
    radius: HSL_STOP_VALIDATION_RADIUS_METERS,
  });
  const edges = Array.isArray(nearbyData?.stopsByRadius?.edges) ? nearbyData.stopsByRadius.edges : [];
  return edges.some((edge) => edge?.node?.stop?.gtfsId);
}

async function filterHslValidCandidates(
  candidates,
  { hasNearbyStop = hasNearbyHslStop } = {}
) {
  const stopValidationCache = new Map();
  const validCandidates = [];

  for (const candidate of candidates) {
    const cacheKey = `${candidate.lat.toFixed(6)},${candidate.lon.toFixed(6)}`;
    let isValid = stopValidationCache.get(cacheKey);
    if (isValid == null) {
      isValid = await hasNearbyStop(candidate.lat, candidate.lon);
      stopValidationCache.set(cacheKey, isValid);
    }

    if (!isValid) continue;
    validCandidates.push(candidate);
  }

  return validCandidates;
}

function parseGeocodeRequest(query) {
  const text = safeString(query.text, MAX_QUERY_LENGTH).trim();
  if (text.length < MIN_QUERY_LENGTH) {
    return { error: "Invalid text", params: null };
  }

  const rawLat = parseCoordinate(query.lat);
  const rawLon = parseCoordinate(query.lon);
  const hasBiasInput = query.lat != null || query.lon != null;
  if (hasBiasInput && (rawLat == null || rawLon == null || !isValidLatLon(rawLat, rawLon))) {
    return { error: "Invalid lat/lon", params: null };
  }

  return {
    error: null,
    params: {
      text,
      biasLat: hasBiasInput ? rawLat : DEFAULT_BIAS_LAT,
      biasLon: hasBiasInput ? rawLon : DEFAULT_BIAS_LON,
      lang: normalizeLanguage(query.lang),
      textVariants: buildGeocodeTextVariants(text),
    },
  };
}

async function collectGeocodeCandidates({
  textVariants,
  biasLat,
  biasLon,
  lang,
  fetchImpl,
  getApiKey,
}) {
  const allCandidates = [];

  for (let variantIndex = 0; variantIndex < textVariants.length; variantIndex += 1) {
    const variant = textVariants[variantIndex];
    const candidates = await geocode(variant, biasLat, biasLon, lang, {
      fetchImpl,
      getApiKey,
    });
    for (const candidate of candidates) {
      allCandidates.push({
        ...candidate,
        variantIndex,
        queryVariant: variant,
      });
    }
  }

  return allCandidates;
}

async function resolveGeocodeMatch({
  text,
  textVariants,
  biasLat,
  biasLon,
  lang,
  fetchImpl,
  graphqlRequestImpl,
  getApiKey,
}) {
  const allCandidates = await collectGeocodeCandidates({
    textVariants,
    biasLat,
    biasLon,
    lang,
    fetchImpl,
    getApiKey,
  });

  const validCandidates = await filterHslValidCandidates(allCandidates, {
    hasNearbyStop: (lat, lon) =>
      hasNearbyHslStop(lat, lon, {
        graphqlRequestImpl,
      }),
  });

  const rankedCandidates = rankCandidatesForQuery(validCandidates, text);
  const bestMatch = rankedCandidates[0] || null;
  const location = bestMatch ? buildLocationPayload(bestMatch.candidate) : null;
  const choices = buildAmbiguousChoices(rankedCandidates);

  return {
    location,
    choices,
    ambiguous: choices.length > 1,
  };
}

function buildNoMatchPayload(text) {
  return {
    query: text,
    location: null,
    choices: [],
    ambiguous: false,
    message: "No matching location found in HSL area.",
  };
}

function createGeocodeHandler({
  fetchImpl = fetch,
  graphqlRequestImpl = graphqlRequest,
  getApiKey = () => process.env.DIGITRANSIT_API_KEY,
  logError = console.error,
} = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const parsedRequest = parseGeocodeRequest(req.query);
    if (parsedRequest.error) {
      return res.status(400).json({ error: parsedRequest.error });
    }

    const { text, biasLat, biasLon, lang, textVariants } = parsedRequest.params;

    try {
      const match = await resolveGeocodeMatch({
        text,
        textVariants,
        biasLat,
        biasLon,
        lang,
        fetchImpl,
        graphqlRequestImpl,
        getApiKey,
      });

      if (!match.location) {
        return res.status(200).json(buildNoMatchPayload(text));
      }

      return res.status(200).json({
        query: text,
        location: match.location,
        choices: match.choices,
        ambiguous: match.ambiguous,
      });
    } catch (error) {
      // Keep detailed error only in server logs; avoid leaking internals to clients.
      logError("v1/geocode API error:", error);
      return res.status(500).json({ error: "Could not approximate location. Please try again." });
    }
  };
}

const handler = createGeocodeHandler();

module.exports = handler;
module.exports._private = {
  parseCoordinate,
  isValidLatLon,
  normalizeLanguage,
  normalizeGeocodeQuery,
  getGeocodingUrl,
  parseFeature,
  geocode,
  hasNearbyHslStop,
  filterHslValidCandidates,
  parseGeocodeRequest,
  collectGeocodeCandidates,
  resolveGeocodeMatch,
  buildNoMatchPayload,
  createGeocodeHandler,
  buildGeocodeTextVariants,
  normalizeForMatch,
  tokenMatches,
  countStrongTokenMatches,
  scoreCandidate,
  rankCandidatesForQuery,
  buildAmbiguousChoices,
};
