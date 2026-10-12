const BASE = "https://hackathon.api.qloo.com";
const TYPES = new Set(["movie", "artist", "brand", "book", "tv_show"]);

export class QlooError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

// An allowlisted adapter: never accepts arbitrary URLs, headers, or parameters.
export function createQlooClient({ apiKey, fetchImpl = fetch } = {}) {
  async function query(path, params) {
    if (!apiKey) throw new QlooError("QLOO_NOT_CONFIGURED", 503);
    const url = new URL(path, BASE);
    url.search = new URLSearchParams(params).toString();
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { "X-Api-Key": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
    } catch {
      throw new QlooError("QLOO_UNAVAILABLE", 502);
    }
    if (!response.ok) {
      // Never relay upstream error bodies, which can contain credential details.
      throw new QlooError(
        response.status === 429 ? "QLOO_RATE_LIMITED" :
          response.status === 401 || response.status === 403 ? "QLOO_ACCESS_DENIED" : "QLOO_REQUEST_FAILED",
        response.status === 429 ? 429 : 502,
      );
    }
    const body = await response.text();
    if (body.length > 2_000_000) throw new QlooError("QLOO_RESPONSE_TOO_LARGE", 502);
    let data;
    try { data = JSON.parse(body); } catch { throw new QlooError("QLOO_INVALID_RESPONSE", 502); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new QlooError("QLOO_INVALID_RESPONSE", 502);
    return {
      source: "Qloo",
      retrievedAt: new Date().toISOString(),
      request: { endpoint: path, parameters: params },
      data,
    };
  }
  return {
    search(text) {
      if (typeof text !== "string" || !text.trim() || text.length > 120) throw new QlooError("INVALID_SEARCH");
      return query("/search", { query: text.trim(), take: "8" });
    },
    insights({ entityIds, type } = {}) {
      if (!TYPES.has(type)) throw new QlooError("INVALID_CATEGORY");
      if (!Array.isArray(entityIds) || entityIds.length < 1 || entityIds.length > 5 ||
          entityIds.some((id) => typeof id !== "string" || !/^[a-zA-Z0-9:-]{1,120}$/.test(id))) {
        throw new QlooError("INVALID_ENTITY_IDS");
      }
      return query("/v2/insights", {
        "filter.type": `urn:entity:${type}`,
        "signal.interests.entities": [...new Set(entityIds)].join(","),
        take: "8",
      });
    },
  };
}
