import { createQlooHandler } from "../../server/qloo-http.mjs";
const origins = [
  process.env.QLOO_ALLOWED_ORIGIN,
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  process.env.VERCEL_PROJECT_PRODUCTION_URL &&
    `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
].filter(Boolean);
const handler = createQlooHandler({
  apiKey: process.env.QLOO_API_KEY,
  origin: origins,
  director: "policy",
});
export default handler;
