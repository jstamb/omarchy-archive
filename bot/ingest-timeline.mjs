#!/usr/bin/env node
/**
 * Build data/timeline.json from the Omarchy repo's own release history.
 *
 * Usage:
 *   node bot/ingest-timeline.mjs            # refresh from GitHub
 *   node bot/ingest-timeline.mjs --dry-run  # print the tiering, write nothing
 *
 * Two tiers, because a flat list of 64 releases is a changelog, not a history:
 *
 *   node  a release worth stopping at. Gets a full entry on /history/ —
 *         headline, summary, contributors, links into the catalogue.
 *   tick  everything else. A mark on the line between nodes, expandable.
 *
 * The tiering is scored from signals Omarchy already publishes rather than a
 * threshold invented here. The tentpole releases are *named* — "The Quattro
 * Release", "The Gaming Edition" — and they are an order of magnitude longer
 * than a patch note (37,000 characters against 200). Score:
 *
 *   +4  x.0.0            +3  editorially named      +3  body > 8000 chars
 *   +2  x.y.0            +2  25 or more contributors  +1  body > 3000 chars
 *
 * >= 5 is a node. Against the history to date that yields 11 nodes and 53
 * ticks, which is the rhythm the page is designed around.
 *
 * Contributors are parsed, not guessed: release notes carry
 * "@user made their first contribution in <pull request url>" and
 * "Thanks also to [@user](...)" lines.
 */
import { fetchAllPages } from './lib/pagination.mjs';
import { githubHeaders, nowIso, parseArgs } from './lib/util.mjs';
import { runStagedIngest } from './lib/staging.mjs';

const REPO = 'basecamp/omarchy';
const RELEASES =
  process.env.ARCHIVE_RELEASES ?? `https://api.github.com/repos/${REPO}/releases?per_page=100`;

const NODE_SCORE = 5;
const flags = parseArgs(process.argv.slice(2));

/** A heading that is just the version number tells us nothing editorial. */
const GENERIC_HEADING = /^(v?[\d.]+|omarchy[\s\d.]*|what'?s changed\??|what changed\??|changelog)$/i;

const releases = await fetchAllReleases();
const entries = releases
  .filter((release) => !release.draft && !release.prerelease && release.tag_name)
  .map(toEntry)
  .filter(Boolean)
  .sort((a, b) => b.published_at.localeCompare(a.published_at));

const nodes = entries.filter((entry) => entry.tier === 'node');

if (flags['dry-run']) {
  for (const entry of entries) {
    if (entry.tier !== 'node') continue;
    console.log(
      `${entry.version.padEnd(9)} ${entry.date}  score ${String(entry.score).padStart(2)}  ` +
        `${String(entry.contributors.length).padStart(3)} people  ${entry.headline ?? ''}`,
    );
  }
  console.log(`\n${nodes.length} nodes, ${entries.length - nodes.length} ticks`);
  process.exit(0);
}

const { published } = await runStagedIngest(async (ctx) => {
  await ctx.writeData('timeline.json', entries);
  await touchMeta(ctx);
});
console.log(
  `timeline: ${entries.length} releases — ${nodes.length} nodes, ${entries.length - nodes.length} ticks` +
    (published.length ? ` — published ${published.join(', ')}` : ' — nothing to publish'),
);

// ------------------------------------------------------------------- fetching

async function fetchAllReleases() {
  // Follow GitHub's own Link: rel="next" evidence rather than a page-size guess
  // with a hard page cap; fetchAllPages fails loudly on a malformed page, a
  // cursor loop, or an implausible page count instead of silently truncating.
  const releases = await fetchAllPages(RELEASES, { headers: githubHeaders(RELEASES) });
  if (releases.length === 0) {
    throw new Error('GitHub returned no releases — refusing to write an empty timeline');
  }
  return releases;
}

// -------------------------------------------------------------------- mapping

function toEntry(release) {
  const version = release.tag_name.replace(/^v/, '');
  const semver = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!semver) return null;
  const [, major, minor, patch] = semver.map(Number);

  const body = release.body ?? '';
  const headline = editorialHeadline(body, release.name);
  const contributors = parseContributors(body);

  let score = 0;
  if (minor === 0 && patch === 0) score += 4;
  else if (patch === 0) score += 2;
  if (headline) score += 3;
  if (body.length > 8000) score += 3;
  else if (body.length > 3000) score += 1;
  if (contributors.length >= 25) score += 2;

  return {
    id: `v${version}`,
    version,
    major,
    date: release.published_at.slice(0, 10),
    published_at: release.published_at,
    tier: score >= NODE_SCORE ? 'node' : 'tick',
    score,
    headline,
    summary: summarise(body),
    highlights: score >= NODE_SCORE ? highlights(body) : [],
    contributors,
    release_url: release.html_url,
    notes_chars: body.length,
  };
}

/** The first heading, when it says something a version number doesn't. */
function editorialHeadline(body, name) {
  const heading = /^#{1,3}\s*(.+)$/m.exec(body.trim());
  for (const candidate of [heading?.[1], name]) {
    const text = candidate?.replace(/^#+\s*/, '').trim();
    if (text && !GENERIC_HEADING.test(text)) return text;
  }
  return null;
}

/** First real sentence of prose — skipping headings, boilerplate and lists. */
function summarise(body) {
  const skip = /^(#|\*|-|\||>|\s*$)|^update existing installations/i;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line || skip.test(line)) continue;
    const text = stripMarkdown(line);
    if (text.length < 40) continue;
    return text.length > 260 ? `${text.slice(0, 257).trimEnd()}…` : text;
  }
  return null;
}

/**
 * Bullet lines that read like features, not credit lines or changelog noise.
 * Capped: a release with 300 bullets should not become a wall on the page.
 */
function highlights(body) {
  const out = [];
  for (const raw of body.split('\n')) {
    const bullet = /^[*-]\s+(.+)$/.exec(raw.trim());
    if (!bullet) continue;
    const text = stripMarkdown(bullet[1]);
    if (/made their first contribution|^full changelog|^by @|^@\w+ /i.test(text)) continue;
    // Checksums, hashes and bare version stamps are not features.
    if (/\b(sha256|sha512|md5)\b/i.test(text) || /\b[0-9a-f]{32,}\b/i.test(text)) continue;
    if (text.length < 25 || text.length > 160) continue;
    out.push(text);
    if (out.length === 6) break;
  }
  return out;
}

function stripMarkdown(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Handles credited in the notes. `first_time` comes from GitHub's own
 * "made their first contribution" line, which is the nicest thing on the page:
 * it is the release where somebody joined.
 */
function parseContributors(body) {
  const found = new Map();

  for (const match of body.matchAll(
    /@([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\s+made their first contribution(?:\s+in\s+(\S+))?/g,
  )) {
    found.set(match[1].toLowerCase(), {
      handle: match[1],
      first_time: true,
      pull_request: cleanPr(match[2]),
    });
  }

  for (const match of body.matchAll(/@([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\b/g)) {
    const key = match[1].toLowerCase();
    if (found.has(key)) continue;
    found.set(key, { handle: match[1], first_time: false, pull_request: null });
  }

  // First-timers first, then alphabetical — the page shows a capped subset and
  // the new names are the ones worth showing.
  return [...found.values()].sort(
    (a, b) =>
      Number(b.first_time) - Number(a.first_time) ||
      a.handle.toLowerCase().localeCompare(b.handle.toLowerCase()),
  );
}

function cleanPr(url) {
  if (!url) return null;
  const match = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/.exec(url);
  return match ? match[0] : null;
}

async function touchMeta(ctx) {
  const meta = await ctx.readData('meta.json', null);
  if (!meta) return;
  meta.updated_at = nowIso();
  await ctx.writeData('meta.json', meta);
}
