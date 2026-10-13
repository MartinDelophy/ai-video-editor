import { QlooError } from "./qloo-client.mjs";
import { directorOptions } from "../src/qloo/director-options.js";
const lead = {
  zh: "依据返回作品的类型与排名，规则建议采用：",
  en: "Based on returned genres and ranking, the policy proposes: ",
  ja: "返されたジャンルと順位に基づくルール提案：",
  ko: "반환된 장르와 순위에 따른 규칙 제안: ",
  es: "Según los géneros y el orden devueltos, la regla propone: ",
  fr: "Selon les genres et le classement reçus, la règle propose : ",
  de: "Auf Basis der Genres und Rangfolge schlägt die Regel vor: ",
  pt: "Com base nos gêneros e na ordem retornados, a regra propõe: ",
  th: "จากประเภทและอันดับที่ได้รับ กฎเสนอ: ",
  vi: "Dựa trên thể loại và thứ hạng trả về, quy tắc đề xuất: ",
  ru: "На основе жанров и ранга правило предлагает: ",
  it: "In base ai generi e all’ordine restituiti, la regola propone: ",
  id: "Berdasarkan genre dan urutan hasil, aturan menyarankan: ",
};
export async function policyBrief(client, input) {
  if (
    typeof input.brief !== "string" ||
    !input.brief.trim() ||
    input.brief.length > 1600 ||
    !lead[input.language]
  )
    throw new QlooError("INVALID_BRIEF");
  const evidence = await client.insights(input);
  const entities = evidence.data.results?.entities;
  if (!Array.isArray(entities) || !entities.length) throw new QlooError("NO_EVIDENCE", 422);
  const scored = entities.slice(0, 8).map((e, i) => {
    const genres = e.properties?.genres || [];
    const gentle = genres.some((g) => ["Family", "Fantasy", "Animation"].includes(g));
    const punchy = genres.some((g) => ["Action", "Thriller", "Crime"].includes(g));
    return { entity: e, gentle: (gentle ? 1 : 0) / (i + 1), punchy: (punchy ? 1 : 0) / (i + 1) };
  });
  const gentle = scored.reduce((n, e) => n + e.gentle, 0),
    punchy = scored.reduce((n, e) => n + e.punchy, 0);
  const index = Math.abs(gentle - punchy) < 0.25 ? 1 : gentle > punchy ? 0 : 2;
  const choices = directorOptions(input.language);
  const plan = {
    hook: choices.hook[0],
    pacing: choices.pacing[index],
    visuals: choices.visuals[0],
    audio: choices.audio[0],
    rationale: scored
      .slice(0, 2)
      .map(({ entity }) => ({
        entityId: entity.entity_id,
        inference: lead[input.language] + choices.pacing[index] + ".",
      })),
  };
  return {
    provider: "evidence-policy",
    model: null,
    evidence,
    plan,
    policy: {
      version: 1,
      gentle,
      punchy,
      description:
        "Rank-weighted genre heuristic; not Qloo-generated editing advice or a performance prediction.",
    },
  };
}
