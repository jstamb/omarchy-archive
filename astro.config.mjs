// @ts-check
import { defineConfig } from 'astro/config';

// Static output. Cloudflare Pages serves `dist/` directly — no adapter, no worker.
// `trailingSlash: 'always'` + `build.format: 'directory'` keeps one canonical URL
// shape so Pages does not serve `/themes/nord` and `/themes/nord/` as two pages.
export default defineConfig({
  site: 'https://omarchyinspo.com',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  devToolbar: {
    enabled: false,
  },
  vite: {
    build: {
      // Card grids are the whole product; keep the client JS in one small file.
      assetsInlineLimit: 0,
    },
  },
});
