// Site-wide numbers and lookups for the layout and cards, without data/*.json.
// Generated at build by bot/build-summary.mjs (see astro.config.mjs).
import summaryJson from '../generated/summary.json';
import type { Meta, Source } from './content';

interface Summary {
  meta: Meta;
  sources: Source[];
  counts: {
    posts: number;
    setups: number;
    themes: number;
    bundledThemes: number;
    extraThemes: number;
    plugins: number;
    firstPartyPlugins: number;
    sources: number;
    apps: number;
    releases: number;
    milestones: number;
  };
  latestRelease: { version: string; date: string } | null;
  creatorSlugs: Record<string, string>;
}

const summary = summaryJson as unknown as Summary;

export const meta = summary.meta;
export const counts = summary.counts;
export const sources = summary.sources;
export const creatorSlugs = summary.creatorSlugs;
export const latestRelease = summary.latestRelease;
export const sourceById = new Map(sources.map((source) => [source.id, source]));
const slugByName = new Map(Object.entries(summary.creatorSlugs));
const nameBySlug = new Map(Object.entries(summary.creatorSlugs).map(([name, slug]) => [slug, name]));

/** Same result as lib/creators.ts creatorHref, from the precomputed map. */
export function creatorHref(name: string | null | undefined): string | null {
  const key = name?.trim();
  if (!key) return null;
  const slug = slugByName.get(key);
  return slug ? `/creators/${slug}/` : null;
}

export function creatorNameBySlug(slug: string): string | undefined {
  return nameBySlug.get(slug);
}

export function creatorSlug(name: string | null | undefined): string | null {
  const key = name?.trim();
  return key ? (slugByName.get(key) ?? null) : null;
}
