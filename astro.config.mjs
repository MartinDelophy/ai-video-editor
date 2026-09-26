import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// A separate Astro frontend for the storyboard workflow, sharing the tested
// React/Sanity components with the editor's local development route.
export default defineConfig({
  srcDir: './storyboard-site',
  publicDir: './storyboard-site/public',
  outDir: './.storyboard-dist',
  integrations: [react()],
  vite: { envPrefix: ['PUBLIC_', 'VITE_'] },
});
