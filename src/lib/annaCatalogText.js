/** Official catalog labels/notes may be plain strings or locale dictionaries.
 * Resolve display text only; never pass a host object through as a React child.
 */
export function getAnnaCatalogText(value, language = "en", fallback = "") {
  const text = candidate => typeof candidate === "string" && candidate.trim() ? candidate : "";
  if (typeof value === "string") return text(value) || text(fallback);
  if (!value || typeof value !== "object" || Array.isArray(value)) return text(fallback);
  const locale = String(language).replaceAll("_", "-").toLowerCase();
  const primary = locale.split("-")[0];
  for (const key of [language, locale, primary, "en", "zh"]) {
    if (Object.hasOwn(value, key) && text(value[key])) return value[key];
  }
  return text(fallback);
}
