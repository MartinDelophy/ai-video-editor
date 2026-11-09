import { cardRotationCopy } from "../i18nCardRotationTemplate.js";
import { referenceTemplateCopy } from "../i18nReferenceTemplates.js";
import { templateCopy } from "../i18nTemplates.js";
import { RATIO_OPTIONS } from "../config/editor.js";
import { CARD_ROTATION_ID } from "./cardRotationTemplate.js";
import { renderBeatTemplateMusic } from "./beatTemplateMusic.js";
import { encodeAudioBufferAsWav, getAudioWaveformPeaks } from "./media.js";

export function createTemplateComposition(template, { assets, bpm, intro, language, start, ratio, targetRatio, overlays, markers, builtInMusic }) {
  const card = template.id === CARD_ROTATION_ID ? cardRotationCopy(language) : null;
  const outputRatio = RATIO_OPTIONS.find((item) => item.id === targetRatio) || ratio;
  const result = template.create({
    assets, bpm, start, intro, copy: card,
    frameRatio: outputRatio.width / outputRatio.height,
    firstLayer: Math.max(0, ...overlays.map((item) => item.layer || 0)) + 1,
  });
  const copy = templateCopy(language);
  let music;
  if (builtInMusic) {
    const score = renderBeatTemplateMusic({ bpm, start, duration: result.duration, markers: result.markers });
    music = {
      blob: encodeAudioBufferAsWav(score), duration: result.duration, name: copy.builtInMusic,
      peaks: getAudioWaveformPeaks(score.getChannelData(0), score.duration), volume: 0.72,
    };
  }
  const existingBeatTimes = new Set(markers.filter((marker) => marker.type === "marker").map((marker) => Math.round(marker.time * 1000)));
  return {
    ...result,
    markers: result.markers.filter((marker) => !existingBeatTimes.has(Math.round(marker.time * 1000))),
    music,
    message: card?.applied || referenceTemplateCopy(template.id, language)?.applied || copy.applied,
  };
}
