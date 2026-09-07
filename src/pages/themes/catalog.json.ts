import type { APIRoute } from 'astro';
import { themes } from '../../lib/content';
import type { CatalogTheme } from '../../lib/theme-tokens';

/**
 * The theme switcher's catalog: every indexed theme that carries colours,
 * trimmed to what the switcher needs. Fetched once, on first open, rather
 * than inlined into every page — 166 palettes is ~60KB of JSON.
 */
export const GET: APIRoute = () => {
  const catalog: CatalogTheme[] = themes
    .filter((theme) => theme.colors && Object.keys(theme.colors).length > 0)
    .map((theme) => ({
      id: theme.id,
      name: theme.name,
      tone: theme.tone,
      bundled: theme.bundled,
      palette: theme.palette,
      colors: theme.colors ?? {},
    }));
  return new Response(JSON.stringify(catalog), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
