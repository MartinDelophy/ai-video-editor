import { createChromeBuiltInSession } from "./chromeBuiltInAi.js";

export const AI_MUSIC_PRESETS = {
  style: [
    ["cinematic", "cinematic soundtrack"],
    ["lofi", "lo-fi hip hop"],
    ["ambient", "ambient"],
    ["electronic", "electronic"],
    ["orchestral", "orchestral"],
  ],
  mood: [
    ["uplifting", "uplifting"],
    ["calm", "calm and peaceful"],
    ["dreamy", "dreamy"],
    ["dramatic", "dramatic"],
    ["dark", "dark and tense"],
  ],
  instrument: [
    ["piano", "piano"],
    ["guitar", "acoustic guitar"],
    ["synth", "analog synthesizer"],
    ["strings", "cinematic strings"],
    ["drums", "punchy drums"],
  ],
};

export function buildEnglishMusicPrompt(selection) {
  const lookup = (group, id) => AI_MUSIC_PRESETS[group].find(([key]) => key === id)?.[1];
  return [
    selection.descriptionEnglish?.trim(),
    lookup("style", selection.style),
    lookup("mood", selection.mood),
    lookup("instrument", selection.instrument),
    `${Math.max(60, Math.min(180, Number(selection.bpm) || 90))} BPM`,
    "instrumental music, clean production, no vocals",
  ].filter(Boolean).join(", ");
}

function containsOnlyEnglishPromptText(text) {
  return /^[\x00-\x7F]*$/.test(text);
}

export async function translateMusicDescriptionToEnglish(text, sourceLanguage = "en") {
  const value = text.trim();
  if (!value || containsOnlyEnglishPromptText(value)) return value;

  let detectedLanguage = sourceLanguage === "zh" ? "zh" : sourceLanguage;
  if (globalThis.LanguageDetector?.create) {
    try {
      const detector = await createChromeBuiltInSession({
        create: (options) => globalThis.LanguageDetector.create(options),
      });
      const results = await detector.detect(value);
      detectedLanguage = results?.[0]?.detectedLanguage || detectedLanguage;
      detector.destroy?.();
    } catch {
      // The selected interface language remains a useful source-language hint.
    }
  }
  if (!globalThis.Translator?.create) {
    throw new Error("Browser translation is unavailable. Use English or enable Chrome built-in translation.");
  }
  const translator = await createChromeBuiltInSession({
    create: (options) => globalThis.Translator.create(options),
    options: { sourceLanguage: detectedLanguage, targetLanguage: "en" },
  });
  try {
    return await translator.translate(value);
  } finally {
    translator.destroy?.();
  }
}

export function createAiMusicFileName(selection) {
  const style = selection.style || "music";
  return `AI ${style} ${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.wav`;
}
