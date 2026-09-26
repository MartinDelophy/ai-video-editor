import { boardError, contentOf, RELEASE_TYPE, STORYBOARD_TYPE, validateReady } from './storyboard.js';

// Every transition guards the exact revision; approval and its immutable content
// snapshot commit together. These are application workflow rules, not an ACL.
export async function saveBoard(client, board) {
  const content = contentOf(board);
  if (board._rev && !['draft', 'changesRequested'].includes(board.status)) throw boardError('staleRelease');
  if (!board._rev) return client.create({ _id: board._id, _type: STORYBOARD_TYPE, ...content, status: 'draft', reviewNote: '' });
  return client.patch(board._id).ifRevisionId(board._rev).set(content).commit();
}
export async function transitionBoard(client, board, target, user, note = '') {
  const allowed = { draft: ['inReview'], changesRequested: ['inReview'], inReview: ['approved', 'changesRequested'], approved: ['draft'] };
  if (!board._rev || !allowed[board.status]?.includes(target)) throw boardError('staleRelease');
  const content = validateReady(board);
  if (target === 'changesRequested' && !note.trim()) throw boardError('requiredError');
  let transaction = client.transaction();
  const fields = { status: target, reviewNote: note.slice(0, 4000), changedBy: user.id, changedAt: new Date().toISOString() };
  if (target === 'approved') {
    const releaseId = `ts-release-${crypto.randomUUID()}`;
    transaction = transaction.create({ _id: releaseId, _type: RELEASE_TYPE, ...content,
      storyboard: { _type: 'reference', _ref: board._id }, approvedAt: fields.changedAt, approvedBy: user.id, sourceRevision: board._rev });
    fields.approvedRelease = { _type: 'reference', _ref: releaseId };
  }
  transaction = transaction.patch(board._id, (patch) => {
    const next = patch.ifRevisionId(board._rev).set(fields);
    return target === 'draft' ? next.unset(['approvedRelease']) : next;
  });
  await transaction.commit();
  // A fresh read is deliberate: if someone edited immediately after commit the
  // UI must use their latest revision instead of labeling the old one as saved.
  return client.getDocument(board._id);
}
