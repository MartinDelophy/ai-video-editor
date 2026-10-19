const latinWordCharacter = /[\p{Script=Latin}\p{Number}_]/u;

// Literal keywords only: punctuation is never interpreted as a regular expression.
// Latin words respect word boundaries; CJK keywords may occur inside a sentence.
export function getCaptionKeywordRanges(text, keywords) {
  const source = String(text ?? "");
  const words = [...new Set(String(keywords ?? "").split(/[\n,，;；]+/u).map(word => word.trim()).filter(Boolean))].slice(0, 64);
  const ranges = [];
  for (const word of words) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "giu");
    for (const match of source.matchAll(pattern)) {
      const start = match.index, end = start + match[0].length;
      const before = Array.from(source.slice(Math.max(0, start - 2), start)).at(-1) || "";
      const after = Array.from(source.slice(end, end + 2))[0] || "";
      if (latinWordCharacter.test(Array.from(word)[0]) && latinWordCharacter.test(before)) continue;
      if (latinWordCharacter.test(Array.from(word).at(-1)) && latinWordCharacter.test(after)) continue;
      ranges.push({ start, end });
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  return ranges.reduce((merged, range) => {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
    return merged;
  }, []);
}

export function getCaptionLineKeywordRanges(text, lines, keywords, selections = []) {
  const source = String(text ?? "");
  const ranges = normalizeCaptionHighlightRanges([...getCaptionKeywordRanges(source, keywords), ...selections], source.length);
  let cursor = 0;
  return lines.map(line => {
    const start = source.indexOf(line, cursor);
    if (start < 0 || !line) return [];
    cursor = start + line.length;
    return ranges.filter(range => range.end > start && range.start < cursor)
      .map(range => ({ start: Math.max(0, range.start - start), end: Math.min(line.length, range.end - start) }));
  });
}

export function normalizeCaptionHighlightRanges(ranges, length) {
  const sorted = (Array.isArray(ranges) ? ranges : []).map(range => ({
    start: Math.max(0, Math.min(length, Math.trunc(Number(range.start) || 0))),
    end: Math.max(0, Math.min(length, Math.trunc(Number(range.end) || 0))),
  })).filter(range => range.end > range.start).sort((a, b) => a.start - b.start);
  return sorted.reduce((result, range) => {
    const previous = result.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else result.push({ ...range });
    return result;
  }, []);
}

// Keep character selections attached to their text when surrounding text is edited.
export function remapCaptionHighlights(before, after, ranges) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let oldEnd = before.length, newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  const delta = newEnd - oldEnd;
  return normalizeCaptionHighlightRanges((ranges || []).flatMap(range => {
    if (range.end <= start) return [range];
    if (range.start >= oldEnd) return [{ start: range.start + delta, end: range.end + delta }];
    // Changed text loses highlighting; unchanged portions retain it.
    return [
      ...(range.start < start ? [{ start: range.start, end: start }] : []),
      ...(range.end > oldEnd ? [{ start: newEnd, end: range.end + delta }] : []),
    ];
  }), after.length);
}
