import { REFERENCE_TEMPLATES } from "./referenceTemplates.js";
import { BEAT_MONTAGE_ID, MONTAGE_BPM, TEMPLATE_SLOTS, createBeatTemplate, getBeatTemplateDuration } from "./beatMontage.js";
import { CARD_ROTATION_ID, CARD_ROTATION_BPM, CARD_ROTATION_SLOTS, createCardRotationTemplate, getCardRotationDuration } from "./cardRotationTemplate.js";

export const TIMELINE_TEMPLATES = [
  {
    id: BEAT_MONTAGE_ID,
    slots: TEMPLATE_SLOTS,
    defaultBpm: MONTAGE_BPM,
    requiredTracks: ["image", "overlay", "effects"],
    getDuration: getBeatTemplateDuration,
    create: createBeatTemplate,
  },
  {
    id: CARD_ROTATION_ID,
    slots: CARD_ROTATION_SLOTS,
    defaultBpm: CARD_ROTATION_BPM,
    requiredTracks: ["image"],
    getDuration: getCardRotationDuration,
    create: createCardRotationTemplate,
  },
  ...REFERENCE_TEMPLATES,
];

export const getTimelineTemplate = (id) => TIMELINE_TEMPLATES.find((item) => item.id === id);
