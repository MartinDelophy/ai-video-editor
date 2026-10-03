// Composer syntax is display text; asset identities travel separately to ChatCut.
export function getChatCutTrigger(text, caret) {
  const before = text.slice(0, caret);
  const match = /(?:^|[^a-zA-Z0-9_「」])([@/])([^\n@/「」]{0,80})$/.exec(before);
  if (!match || match[1] === '/' && /\s/.test(match[2])) return null;
  return { kind: match[1] === '@' ? 'asset' : 'command', query: match[2], start: before.length - match[2].length - 1, end: caret };
}
export function getChatCutCommand(text) {
  const match = /^\s*\/(image|remotion)(?=\s|$)/i.exec(text);
  return match ? { command: match[1].toLowerCase(), instruction: text.slice(match[0].length).trim() } : { command: null, instruction: text.trim() };
}
export function getChatCutMentions(text, mentions, assets) {
  return (mentions || []).filter(item => typeof item.token === 'string' && (item.selected === true || text.includes(item.token)) && assets.some(asset => (asset.assetId || asset.id) === item.assetId)).map(item => ({ name: item.token.slice(2, -1), assetId: item.assetId }));
}

export function getChatCutClipboardFiles(clipboard) {
  const items = Array.from(clipboard?.items || []).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean);
  return items.length ? items : Array.from(clipboard?.files || []);
}
