import { competitionApi } from "./competition-api.mjs";

// AWS Lambda Function URL / API Gateway HTTP API payload v2.
export async function handler(event) {
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  const body = event.isBase64Encoded ? Buffer.from(event.body || "", "base64") : event.body || "";
  const request = new Request("https://competition.internal/api/competition/plan", {
    method, headers: event.headers || {},
    ...(["GET", "HEAD"].includes(method) ? {} : { body }),
  });
  const response = await competitionApi(request);
  return { statusCode: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
}
