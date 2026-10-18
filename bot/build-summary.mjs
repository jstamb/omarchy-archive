// Writes src/generated/summary.json: the small slice of site-wide data the
// layout, sidebar and cards need (counts, meta, sources, latest release, the
// creator slug map). SSR routes import this instead of data/*.json, so the
// Worker bundle stays small and never parses the 5.5 MB plugin catalog.
// Run automatically from astro.config.mjs; the output is gitignored.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { creatorSlugMap } from './lib/creators.mjs';

export function buildSummary(root) {
  const read = (f) => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'));
  const meta = read('meta.json');
  const sources = read('sources.json');
  const posts = read('posts.json');
  const themes = read('themes.json');
  const plugins = read('plugins.json');
  const apps = read('apps.json');
  const timeline = read('timeline.json');
  const setups = posts.filter((p) => p.kind === 'setup').length;
  return {
    meta,
    sources,
    counts: {
      posts: posts.length,
      setups,
      themes: themes.length,
      bundledThemes: themes.filter((t) => t.bundled).length,
      extraThemes: themes.filter((t) => !t.bundled).length,
      plugins: plugins.length,
      firstPartyPlugins: plugins.filter((p) => p.first_party).length,
      sources: sources.length,
      apps: apps.length,
      releases: timeline.length,
      milestones: timeline.filter((r) => r.tier === 'node').length,
    },
    latestRelease: timeline[0] ? { version: timeline[0].version, date: timeline[0].date } : null,
    creatorSlugs: creatorSlugMap({ themes, plugins, posts }),
  };
}

export function writeSummary(root) {
  const dir = join(root, 'src', 'generated');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, 'summary.json');
  const next = `${JSON.stringify(buildSummary(root))}\n`;
  let prev = '';
  try {
    prev = readFileSync(out, 'utf8');
  } catch {}
  if (prev !== next) writeFileSync(out, next);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(writeSummary(join(import.meta.dirname, '..')));
}
