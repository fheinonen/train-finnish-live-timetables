const MAX_BODY_SIZE = 8000;
const MAX_CONTEXT_DEPTH = 3;
const MAX_CONTEXT_KEYS = 30;
const MAX_CONTEXT_ARRAY_ITEMS = 30;
const MAX_CONTEXT_STRING_LENGTH = 200;

function safeString(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function sanitizeContext(value, depth = 0) {
  if (value == null) return null;

  if (typeof value === "string") {
    return safeString(value, MAX_CONTEXT_STRING_LENGTH);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (depth >= MAX_CONTEXT_DEPTH) {
    return "[Truncated]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_CONTEXT_ARRAY_ITEMS)
      .map((item) => sanitizeContext(item, depth + 1));
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    const limitedEntries = entries.slice(0, MAX_CONTEXT_KEYS);
    const result = {};

    for (const [rawKey, rawValue] of limitedEntries) {
      const key = safeString(rawKey, 60);
      result[key] = sanitizeContext(rawValue, depth + 1);
    }

    if (entries.length > MAX_CONTEXT_KEYS) {
      result._truncated = true;
    }

    return result;
  }

  return safeString(value, MAX_CONTEXT_STRING_LENGTH);
}

function getPayloadByteSize(payload) {
  try {
    return Buffer.byteLength(JSON.stringify(payload), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function sanitizePayload(payload) {
  if (!isPlainObject(payload)) return null;

  return {
    type: safeString(payload.type, 40),
    message: safeString(payload.message, 400),
    stack: safeString(payload.stack, 1200),
    url: safeString(payload.url, 500),
    userAgent: safeString(payload.userAgent, 300),
    timestamp: safeString(payload.timestamp, 40),
    context: sanitizeContext(payload.context),
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
      if (Buffer.byteLength(data, "utf8") > MAX_BODY_SIZE) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });

    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function errorResponse(res, status, message) {
  return res.status(status).json({ error: message });
}

function parseRawPayload(raw) {
  if (!raw) return null;
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_SIZE) {
    throw new Error("Payload too large");
  }
  return JSON.parse(raw);
}

async function parseRequestPayload(req) {
  const body = req.body;
  if (body && typeof body !== "string") {
    return body;
  }

  const raw = typeof body === "string" ? body : await readBody(req);
  return parseRawPayload(raw);
}

function validateSanitizedPayload(payload) {
  if (payload == null) {
    return { status: 400, error: "Invalid payload", sanitized: null };
  }

  if (getPayloadByteSize(payload) > MAX_BODY_SIZE) {
    return { status: 413, error: "Payload too large", sanitized: null };
  }

  const sanitized = sanitizePayload(payload);
  if (!sanitized) {
    return { status: 400, error: "Invalid payload", sanitized: null };
  }

  if (getPayloadByteSize(sanitized) > MAX_BODY_SIZE) {
    return { status: 413, error: "Payload too large", sanitized: null };
  }

  return { status: null, error: null, sanitized };
}

function createClientErrorHandler({ logError = console.error } = {}) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return errorResponse(res, 405, "Method not allowed");
    }

    try {
      const payload = await parseRequestPayload(req);
      const validation = validateSanitizedPayload(payload);
      if (validation.error) {
        return errorResponse(res, validation.status, validation.error);
      }

      logError("client error report:", validation.sanitized);
      return res.status(204).end();
    } catch (error) {
      if (error?.message === "Payload too large") {
        return errorResponse(res, 413, "Payload too large");
      }
      logError("client error report failed:", error);
      return errorResponse(res, 400, "Invalid payload");
    }
  };
}

const handler = createClientErrorHandler();

module.exports = handler;
module.exports._private = {
  safeString,
  isPlainObject,
  sanitizeContext,
  getPayloadByteSize,
  sanitizePayload,
  readBody,
  errorResponse,
  parseRawPayload,
  parseRequestPayload,
  validateSanitizedPayload,
  createClientErrorHandler,
};
