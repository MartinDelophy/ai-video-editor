export function translateRemasterPhase(job, t, fallbackKey = "remasterProcessing") {
  const template = job?.phaseKey ? t(job.phaseKey) : job?.phase || t(fallbackKey);
  return Object.entries(job?.phaseParams || {}).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
