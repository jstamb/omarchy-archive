import type { APIRoute } from 'astro';
import { themes, timeline } from '../lib/content';
import { urlset, xml } from '../lib/sitemap';
import { meta } from '../lib/summary';

// Prebuilt: fixed pages plus the 176 prerendered theme pages.
export const prerender = true;

export const GET: APIRoute = () =>
  xml(
    urlset(meta.site_url, [
      { path: '/', lastmod: meta.updated_at, priority: '1.0' },
      { path: '/posts/', priority: '0.9' },
      { path: '/setups/', priority: '0.9' },
      { path: '/themes/', priority: '0.9' },
      { path: '/plugins/', priority: '0.9' },
      { path: '/resources/', priority: '0.9' },
      { path: '/sources/', priority: '0.8' },
      { path: '/history/', lastmod: timeline[0]?.date, priority: '0.8' },
      { path: '/install/', priority: '0.7' },
      { path: '/start/', priority: '0.8' },
      { path: '/hardware/', priority: '0.7' },
      { path: '/themes/compare/', priority: '0.5' },
      { path: '/saved/', priority: '0.3' },
      { path: '/creators/', priority: '0.6' },
      { path: '/about/', priority: '0.5' },
      { path: '/plugins/all/', priority: '0.5' },
      ...themes.map((theme) => ({ path: `/themes/${theme.id}/`, lastmod: theme.added_at, priority: '0.7' })),
    ]),
  );
