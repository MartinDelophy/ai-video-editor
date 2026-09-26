import { defineConfig } from 'sanity';
import { schemaTypes } from './src/sanity/schema.js';

// CLI schema deployment shares the exact content model used by the custom tool.
export default defineConfig({
  name: 'timeline-storyboards',
  title: 'Timeline Studio',
  projectId: process.env.VITE_SANITY_PROJECT_ID || 'rgq98xsq',
  dataset: process.env.VITE_SANITY_DATASET || 'production',
  schema: { types: schemaTypes('en') },
});
