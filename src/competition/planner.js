// This is an intentionally small local command grammar, never a simulated LLM.
export const COMPETITION_OPERATIONS = ["project.set_ratio", "project.set_fit", "visual.trim", "visual.reorder", "clip.set_property", "clip.set_muted"];

export function validateCompetitionPlan(plan) {
  if (!plan || typeof plan.reply !== "string" || plan.reply.length > 2000 || !Array.isArray(plan.operations) || plan.operations.length > 30 ||
    plan.operations.some((op) => !op || !COMPETITION_OPERATIONS.includes(op.type))) throw new Error("invalidPlan");
  return { reply: plan.reply, operations: plan.operations };
}

export function planLocalCommand(prompt, context) {
  const request = prompt.trim();
  const ratio = /^(?:ratio\s*|画幅\s*|比例\s*)?(16:9|9:16|1:1|4:5)$/i.exec(request);
  if (ratio) return { reply: "", operations: [{ type: "project.set_ratio", ratio: ratio[1] }] };
  const music = /^(?:music|音乐)\s+(\d+(?:\.\d+)?)\s*%$/i.exec(request);
  if (music && Number(music[1]) <= 400) {
    const clips = context.tracks.music;
    if (!clips.length) throw new Error("missingMusic");
    return { reply: "", operations: clips.map((clip) => ({ type: "clip.set_property", clipId: clip.clipId || clip.id, property: "volume", value: Number(music[1]) / 100 })) };
  }
  const trim = /^(?:trim first|首段)\s+(\d+(?:\.\d+)?)\s*(?:s|秒)?$/i.exec(request);
  if (trim) {
    const clip = context.tracks.visuals[0];
    const seconds = Number(trim[1]);
    if (!clip || !clip.trimAllowed || seconds < 0.05 || seconds > clip.duration) throw new Error("cannotTrim");
    return { reply: "", operations: [{ type: "visual.trim", clipId: clip.clipId || clip.id, sourceIn: clip.sourceIn, sourceOut: clip.sourceIn + seconds }] };
  }
  if (/^(?:last first|末段移到开头)$/i.test(request)) {
    const clips = context.tracks.visuals;
    if (clips.length < 2) throw new Error("needClips");
    return { reply: "", operations: [{ type: "visual.reorder", clipId: clips.at(-1).clipId || clips.at(-1).id, toIndex: 0 }] };
  }
  throw new Error("unsupported");
}

export async function captureCompetitionContext(execute, signal) {
  const read = async (name, input) => {
    const result = await execute(name, input, { signal });
    if (!result?.ok) throw new Error(result?.error?.message || "failed");
    return result;
  };
  const project = await read("timeline_project_inspect", {});
  const tracks = {};
  for (const track of ["visuals", "music", "audio"]) {
    const result = await read("timeline_track_inspect", { track, limit: 100 });
    if (result.stateToken !== project.stateToken) throw new Error("stale");
    if (result.nextOffset !== null) throw new Error("tooManyClips");
    tracks[track] = result.items.map((clip) => Object.fromEntries([
      "id", "clipId", "type", "name", "duration", "start", "sourceIn", "sourceOut", "trimAllowed",
    ].filter((key) => key in clip).map((key) => [key, clip[key]])));
  }
  for (const track of ["music", "audio"]) {
    for (const clip of tracks[track]) {
      const detail = await read("timeline_clip_inspect", { clipId: clip.clipId || clip.id });
      if (detail.stateToken !== project.stateToken) throw new Error("stale");
      clip.properties = Object.fromEntries(["volume", "fadeIn", "fadeOut", "muted"].filter((key) => key in detail.properties).map((key) => [key, detail.properties[key]]));
    }
  }
  return { stateToken: project.stateToken, ratio: project.ratio, duration: project.duration, tracks };
}
