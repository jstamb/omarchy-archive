// @ts-check
import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';
import { writeSummary } from './bot/build-summary.mjs';

// Small, Worker-safe slice of site data (counts, creator slugs) for the layout
// and the on-demand routes. Regenerated on every dev/build/check start.
writeSummary(new URL('.', import.meta.url).pathname);

// Hybrid output on Cloudflare Workers (Static Assets) + D1.
// - Index/listing pages stay prerendered (about 20 HTML files).
// - Detail pages (/posts/[id], /plugins/[id], /creators/[slug]), search,
//   sitemaps and the feed render on request from D1 (`prerender = false`) and
//   are cached at the edge, purged by Cache-Tag after each sync.
// `trailingSlash: 'always'` + `build.format: 'directory'` keeps the URL shape
// identical to the old static site.
export default defineConfig({
  site: 'https://omarchyarchive.com',
  output: 'static',
  adapter: cloudflare({
    imageService: 'passthrough',
    platformProxy: { enabled: true },
    // Serves /images/* from R2 before Astro routing (src/worker/entry.ts).
    workerEntryPoint: { path: 'src/worker/entry.ts' },
  }),
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  devToolbar: {
    enabled: false,
  },
  vite: {
    define: {
      __BUILD_ID__: JSON.stringify(/** @type {any} */ (globalThis).process?.env?.GITHUB_SHA?.slice(0, 12) || String(Date.now())),
    },
    build: {
      // Card grids are the whole product; keep the client JS in one small file.
      assetsInlineLimit: 0,
    },
  },
});
