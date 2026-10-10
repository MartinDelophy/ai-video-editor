import { competitionApi } from "../../server/competition-api.mjs";

export default (request) => competitionApi(request);
export const config = { path: "/api/competition/plan" };
