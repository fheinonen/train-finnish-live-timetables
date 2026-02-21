const MAX_BODY_SIZE = 8000;

function safeString(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object") return null;

  return {
    type: safeString(payload.type, 40),
    message: safeString(payload.message, 400),
    stack: safeString(payload.stack, 1200),
    url: safeString(payload.url, 500),
    userAgent: safeString(payload.userAgent, 300),
    timestamp: safeString(payload.timestamp, 40),
    context: payload.context && typeof payload.context === "object" ? payload.context : null,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY_SIZE) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });

    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let payload = req.body;

    if (!payload || typeof payload === "string") {
      const raw = typeof payload === "string" ? payload : await readBody(req);
      if (!raw) {
        return res.status(400).json({ error: "Invalid payload" });
      }
      payload = JSON.parse(raw);
    }

    const sanitized = sanitizePayload(payload);
    if (!sanitized) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    console.error("client error report:", sanitized);
    return res.status(204).end();
  } catch (error) {
    console.error("client error report failed:", error);
    return res.status(400).json({ error: "Invalid payload" });
  }
};
