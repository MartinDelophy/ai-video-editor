// A thin UI adapter: timeline edits remain in the shared command engine.
export const VOICE_DESTINATIONS = {
  'media-upload': ['media', 'upload'], 'media-library': ['media', 'library'],
  'my-assets': ['media', 'mine'], captions: ['caption'],
  'voice-synthesis': ['audio', 'synthesis'], 'voice-clone': ['audio', 'mine'],
  'voice-favorites': ['audio', 'favorites'], 'voice-history': ['audio', 'history'],
  audio: ['audio'], effects: ['effects'], stickers: ['stickers'],
  chatcut: ['smart', 'chatcut'], 'automatic-edit': ['smart', 'auto-edit'],
  'automatic-captions': ['smart', 'browser-captions'],
  settings: ['settings'], export: ['export'],
};
export const VOICE_UI_TOOLS = [
  { name: 'timeline_ui_control', description: 'Use the editor’s existing undo, redo, play or pause control. Never implies export completion.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['undo', 'redo', 'play', 'pause'] } }, required: ['action'], additionalProperties: false } },
  { name: 'timeline_ui_inspect', description: 'Inspect current editor page, selected clip, available navigation destinations and supported editor tools. Always inspect before answering what the page can do or navigating. Tool schemas describe actual capabilities; do not invent features.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'timeline_ui_navigate', description: 'Open an existing editor panel. Export opens settings only; it does not export or publish. Navigation never starts generation.', inputSchema: { type: 'object', properties: { destination: { type: 'string', enum: Object.keys(VOICE_DESTINATIONS) } }, required: ['destination'], additionalProperties: false } },
];
export function createVoiceEditor(editor, inspect, navigate, control) {
  return {
    ...editor,
    tools: () => [...editor.tools(), ...VOICE_UI_TOOLS],
    execute: async (name, input, options) => {
      if (options?.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (name === 'timeline_ui_control') {
        if (!control || !['undo', 'redo', 'play', 'pause'].includes(input?.action) || Object.keys(input).some(key => key !== 'action')) throw new Error('Invalid control');
        control(input.action);
        return { ok: true, action: input.action };
      }
      if (name === 'timeline_ui_inspect') {
        if (Object.keys(input || {}).length) throw new Error('Invalid inspection');
        return { ok: true, ...inspect(), destinations: Object.keys(VOICE_DESTINATIONS), capabilities: editor.tools().map(({ name, description }) => ({ name, description })) };
      }
      if (name === 'timeline_ui_navigate') {
        if (!VOICE_DESTINATIONS[input?.destination] || Object.keys(input).some(key => key !== 'destination')) throw new Error('Invalid destination');
        navigate(input.destination, VOICE_DESTINATIONS[input.destination]);
        return { ok: true, destination: input.destination };
      }
      return editor.execute(name, input, options);
    },
  };
}
