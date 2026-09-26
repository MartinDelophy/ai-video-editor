import { useMemo } from 'react';
import { Studio, useClient, useCurrentUser } from 'sanity';
import { FilmSlate } from '@phosphor-icons/react';
import { API_VERSION, connectionConfig, DEFAULT_CONNECTION, LANGUAGES } from './storyboard.js';
import { storyboardCopy } from './copy.js';
import { schemaTypes } from './schema.js';
import WorkbenchPanel from './WorkbenchPanel.jsx';

const params = new URLSearchParams(window.location.search);
let previous;
try { previous = JSON.parse(sessionStorage.getItem('ts-sanity-workbench')); } catch { /* optional session preference */ }
const requestedLanguage = params.get('lang') || previous?.language;
const initialLanguage = LANGUAGES.includes(requestedLanguage) ? requestedLanguage : 'en';
let connection;
try {
  connection = connectionConfig({ projectId: params.get('projectId') || previous?.projectId || DEFAULT_CONNECTION.projectId,
    dataset: params.get('dataset') || previous?.dataset || DEFAULT_CONNECTION.dataset });
} catch { connection = DEFAULT_CONNECTION; }
// Studio routing and login callbacks may remove query parameters. Preserve only
// public configuration in this tab, never credentials or draft contents.
try { sessionStorage.setItem('ts-sanity-workbench', JSON.stringify({ ...connection, language: initialLanguage })); } catch { /* optional */ }

function ReviewTool() {
  const client = useClient({ apiVersion: API_VERSION });
  const user = useCurrentUser();
  return <WorkbenchPanel client={client} user={user} connection={connection} initialLanguage={initialLanguage} />;
}

export default function StoryboardStudio() {
  const config = useMemo(() => ({ name: 'timeline-storyboards', title: 'Timeline Studio', ...connection, basePath: '/storyboard',
    schema: { types: schemaTypes(initialLanguage) }, tools: [{ name: 'review', title: storyboardCopy(initialLanguage).title, icon: FilmSlate, component: ReviewTool }],
  }), []);
  return <Studio config={config} />;
}
