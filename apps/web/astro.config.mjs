import { defineConfig } from 'astro/config';

const base = process.env.PUBLIC_BASE_PATH || '/';
export default defineConfig({
  output: 'static',
  site: process.env.PUBLIC_SITE_URL || 'http://localhost:4321',
  base,
  build: { format: 'directory' },
});
