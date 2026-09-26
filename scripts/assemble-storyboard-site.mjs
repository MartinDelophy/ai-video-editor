import { access, cp } from 'node:fs/promises';

// Compose only after both builds succeed. Astro must never clean the editor's
// output or copy the editor's large public directory into a second build.
await access(new URL('../dist/index.html', import.meta.url));
await access(new URL('../.storyboard-dist/storyboard/index.html', import.meta.url));
await cp(new URL('../.storyboard-dist/', import.meta.url), new URL('../dist/', import.meta.url), { recursive: true });
console.log('Astro storyboard frontend assembled alongside the editor.');
