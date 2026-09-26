import { storyboardCopy } from './copy.js';
import { LANGUAGES, STORYBOARD_TYPE, RELEASE_TYPE } from './storyboard.js';

export function schemaTypes(language = 'en') {
  const c = storyboardCopy(language);
  const contentFields = [
    { name: 'title', title: c.titleLabel, type: 'string', validation: (rule) => rule.required().max(240) },
    { name: 'brief', title: c.brief, type: 'text' },
    { name: 'language', title: c.language, type: 'string', options: { list: LANGUAGES } },
    { name: 'shots', title: c.shots, type: 'array', validation: (rule) => rule.required().min(1).max(100), of: [{ type: 'object', name: 'shot', fields: [
      { name: 'title', title: c.shotTitle, type: 'string', validation: (rule) => rule.required() },
      { name: 'visualBrief', title: c.visualBrief, type: 'text', validation: (rule) => rule.required() },
      { name: 'narration', title: c.narration, type: 'text' },
      { name: 'assetHint', title: c.assetHint, type: 'string' },
      { name: 'duration', title: c.duration, type: 'number', validation: (rule) => rule.required().min(.2).max(1800) },
    ] }] },
  ];
  return [
    { name: STORYBOARD_TYPE, title: c.title, type: 'document', fields: [...contentFields,
      { name: 'status', title: c.note, type: 'string', options: { list: ['draft', 'inReview', 'changesRequested', 'approved'].map((value) => ({ title: c[value], value })) } },
      { name: 'reviewNote', title: c.note, type: 'text' },
      { name: 'changedBy', type: 'string', hidden: true }, { name: 'changedAt', type: 'datetime', hidden: true },
      { name: 'approvedRelease', title: c.release, type: 'reference', to: [{ type: RELEASE_TYPE }], readOnly: true },
    ] },
    { name: RELEASE_TYPE, title: c.release, type: 'document', readOnly: true, fields: [...contentFields,
      { name: 'storyboard', title: c.title, type: 'reference', to: [{ type: STORYBOARD_TYPE }] },
      { name: 'sourceRevision', type: 'string', hidden: true }, { name: 'approvedBy', type: 'string', hidden: true }, { name: 'approvedAt', type: 'datetime', hidden: true },
    ] },
  ];
}
