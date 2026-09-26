/** Shared content contract. No media bytes, editor sessions or credentials go to Sanity. */
export const STORYBOARD_TYPE = 'tsStoryboard';
export const RELEASE_TYPE = 'tsStoryboardRelease';
export const API_VERSION = '2025-02-19';
export const DEFAULT_CONNECTION = Object.freeze({
  projectId: import.meta.env?.VITE_SANITY_PROJECT_ID || 'rgq98xsq',
  dataset: import.meta.env?.VITE_SANITY_DATASET || 'production',
});
export const LANGUAGES = ['zh', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'th', 'vi', 'ru', 'it', 'id'];
export function boardError(code) { return Object.assign(new Error(code), { code }); }
export function connectionConfig(input) {
  const projectId = String(input?.projectId || '').trim();
  const dataset = String(input?.dataset || '').trim();
  if (!/^[a-z0-9]{8}$/.test(projectId) || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(dataset)) throw boardError('configError');
  return { projectId, dataset };
}
export function readConnection() {
  try { return connectionConfig(JSON.parse(localStorage.getItem('ts-sanity-connection')) || DEFAULT_CONNECTION); }
  catch { return DEFAULT_CONNECTION; }
}
export function workbenchUrl(config, language) {
  const url = new URL('/storyboard/', window.location.origin);
  url.search = new URLSearchParams({ ...connectionConfig(config), lang: language });
  return url.href;
}
export function newShot() {
  return { _key: crypto.randomUUID(), title: '', visualBrief: '', narration: '', assetHint: '', duration: 4 };
}
export function newBoard(language = 'en') {
  return { _id: `ts-board-${crypto.randomUUID()}`, _type: STORYBOARD_TYPE, title: '', brief: '', language, status: 'draft', shots: [newShot()], reviewNote: '' };
}
function boundedText(value, limit) {
  if (typeof value !== 'string' || value.length > limit) throw boardError('invalidBoard');
  return value;
}
export function contentOf(board) {
  if (!board || !Array.isArray(board.shots) || board.shots.length < 1 || board.shots.length > 100) throw boardError('invalidBoard');
  const keys = new Set();
  const shots = board.shots.map((shot) => {
    if (!shot || typeof shot._key !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(shot._key) || keys.has(shot._key)) throw boardError('invalidBoard');
    keys.add(shot._key);
    const duration = Number(shot.duration);
    if (!Number.isFinite(duration) || duration < .2 || duration > 1800) throw boardError('invalidBoard');
    return { _key: shot._key, title: boundedText(shot.title, 240), visualBrief: boundedText(shot.visualBrief, 4000),
      narration: boundedText(shot.narration, 4000), assetHint: boundedText(shot.assetHint, 240), duration };
  });
  if (shots.reduce((sum, shot) => sum + shot.duration, 0) > 1800) throw boardError('durationError');
  return { title: boundedText(board.title, 240), brief: boundedText(board.brief, 8000),
    language: LANGUAGES.includes(board.language) ? board.language : 'en', shots };
}
export function validateReady(board) {
  const content = contentOf(board);
  if (!content.title.trim() || content.shots.some((shot) => !shot.title.trim() || !shot.visualBrief.trim())) throw boardError('requiredError');
  return content;
}
export function errorKey(error) {
  if (error?.statusCode === 409 || error?.status === 409) return 'conflict';
  if ([401, 403].includes(error?.statusCode || error?.status)) return 'authError';
  return ['configError', 'invalidBoard', 'durationError', 'requiredError', 'staleRelease', 'assetError', 'lockedError', 'duplicateError', 'editorChanged'].includes(error?.code) ? error.code : 'networkError';
}
export async function publicQuery(config, query, params = {}, signal) {
  const { projectId, dataset } = connectionConfig(config);
  const url = new URL(`https://${projectId}.api.sanity.io/v${API_VERSION}/data/query/${dataset}`);
  url.searchParams.set('query', query);
  url.searchParams.set('perspective', 'published');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(`$${key}`, JSON.stringify(value));
  const response = await fetch(url, { signal, credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw Object.assign(boardError('networkError'), { status: response.status });
  return (await response.json()).result;
}
export const APPROVED_QUERY = `*[_type == "${STORYBOARD_TYPE}" && status == "approved"] | order(_updatedAt desc)[0...100]{_id,_rev,title,language,approvedRelease->{_id,title,brief,language,shots,approvedAt}}`;
export async function currentRelease(config, boardId, releaseId, signal) {
  const board = await publicQuery(config, `*[_type == "${STORYBOARD_TYPE}" && _id == $id][0]{status,approvedRelease->{_id,title,brief,language,shots,approvedAt}}`, { id: boardId }, signal);
  if (board?.status !== 'approved' || board.approvedRelease?._id !== releaseId) throw boardError('staleRelease');
  validateReady(board.approvedRelease);
  return board.approvedRelease;
}
