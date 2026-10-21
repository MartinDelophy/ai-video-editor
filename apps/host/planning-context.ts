import { HostError } from "./sessions.ts";
import { planningRequestText } from "./planning-provider.ts";
import type { ScriptDraft } from "./storage/script-records.ts";
import { sha256 } from "./storage/records.ts";

export function planningContext(draft: ScriptDraft, maximum: number) {
  const sources = draft.sources.map(({ sourceId, range, kind, capability, originalText, visualNotes, labels }) =>
    ({ sourceId, range, kind, capability, originalText, visualNotes, labels }));
  const part = (selected: typeof sources) => {
    const ids = new Set(selected.map(item => item.sourceId));
    return planningRequestText({ goals: draft.goals, feedback: draft.feedback,
      classifications: draft.content.classifications.filter(item => ids.has(item.sourceId)),
      currentScript: { ...draft.content, classifications: [], segments: draft.content.segments.filter(segment => segment.sourceIds.every(id => ids.has(id))) },
      sources: selected });
  };
  const groups: { inputText: string; digest: string; output: null; remoteId: null }[] = [];
  let selected: typeof sources = [];
  const push = () => { const inputText = part(selected); groups.push({ inputText, digest: sha256(Buffer.from(inputText)), output: null, remoteId: null }); };
  for (const source of sources) {
    if (Buffer.byteLength(part([...selected, source])) > maximum) {
      if (selected.length) push();
      selected = [];
      if (Buffer.byteLength(part([source])) > maximum) throw new HostError("RESOURCE_LIMIT_EXCEEDED", 400, "One source plus review context exceeds the configured request limit. Split its analysis range or increase the limit.");
    }
    selected.push(source);
  }
  if (selected.length) push();
  const inputText = JSON.stringify({ groups: groups.map(group => JSON.parse(group.inputText)), merge: groups.length > 1 });
  if (Buffer.byteLength(inputText) > 2_000_000 || groups.length > 1000) throw new HostError("RESOURCE_LIMIT_EXCEEDED", 400, "The complete approved scope exceeds the planning limit. Reduce the selection.");
  return { groups, inputText };
}
