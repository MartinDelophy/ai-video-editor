const clipId = { type: "string", minLength: 1, maxLength: 256 };
const operation = (type, fields) => ({
  type: "object", additionalProperties: false,
  properties: { type: { const: type }, ...fields }, required: ["type", ...Object.keys(fields)],
});
export const localPlanSchema = {
  type: "object", additionalProperties: false, required: ["reply", "operations"],
  properties: {
    reply: { type: "string", maxLength: 500 },
    operations: { type: "array", maxItems: 30, items: { oneOf: [
      operation("project.set_ratio", { ratio: { enum: ["16:9", "9:16", "1:1", "4:5"] } }),
      operation("project.set_fit", { fitMode: { enum: ["contain", "cover"] } }),
      operation("visual.trim", { clipId, sourceIn: { type: "number", minimum: 0 }, sourceOut: { type: "number", minimum: 0 } }),
      operation("visual.reorder", { clipId, toIndex: { type: "integer", minimum: 0, maximum: 500 } }),
      operation("clip.set_property", { clipId, property: { enum: ["volume", "fadeIn", "fadeOut"] }, value: { type: "number", minimum: 0, maximum: 1800 } }),
      operation("clip.set_muted", { clipId, muted: { type: "boolean" } }),
    ] } },
  },
};

export function schemaForProject(context) {
  const visuals = context.tracks.visuals || [];
  const all = [...visuals, ...(context.tracks.music || []), ...(context.tracks.audio || [])];
  const id = (clip) => clip.clipId || clip.id;
  const alternatives = localPlanSchema.properties.operations.items.oneOf.slice(0, 2);
  for (const clip of visuals) {
    if (clip.trimAllowed) alternatives.push(operation("visual.trim", {
      clipId: { const: id(clip) },
      sourceIn: { type: "number", minimum: clip.sourceIn, maximum: clip.sourceOut },
      sourceOut: { type: "number", minimum: clip.sourceIn, maximum: clip.sourceOut },
    }));
  }
  if (visuals.length > 1) alternatives.push(operation("visual.reorder", {
    clipId: { enum: visuals.map(id) }, toIndex: { type: "integer", minimum: 0, maximum: visuals.length - 1 },
  }));
  if (all.length) {
    alternatives.push(operation("clip.set_property", {
      clipId: { enum: all.map(id) }, property: { const: "volume" }, value: { type: "number", minimum: 0, maximum: 4 },
    }), operation("clip.set_property", {
      clipId: { enum: all.map(id) }, property: { enum: ["fadeIn", "fadeOut"] }, value: { type: "number", minimum: 0, maximum: 1800 },
    }), operation("clip.set_muted", { clipId: { enum: all.map(id) }, muted: { type: "boolean" } }));
  }
  return { ...localPlanSchema, properties: { ...localPlanSchema.properties,
    operations: { ...localPlanSchema.properties.operations, items: { oneOf: alternatives } },
  } };
}

