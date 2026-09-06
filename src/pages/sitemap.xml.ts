import type { APIRoute } from 'astro';
import { meta, pluginSlug, plugins, posts, themes, timeline } from '../lib/content';

/**
 * Hand-rolled so the site keeps zero integrations. Every record page plus the
 * fixed pages; `lastmod` is the day the record last changed, which for content
 * in git is exactly `added_at`.
 */
export const GET: APIRoute = () => {
  const entries: { path: string; lastmod?: string; priority: string }[] = [
    { path: '/', lastmod: meta.updated_at.slice(0, 10), priority: '1.0' },
    { path: '/posts/', priority: '0.9' },
    { path: '/setups/', priority: '0.9' },
    { path: '/themes/', priority: '0.9' },
    { path: '/plugins/', priority: '0.9' },
    { path: '/sources/', priority: '0.8' },
    { path: '/history/', lastmod: timeline[0]?.date, priority: '0.8' },
    { path: '/install/', priority: '0.7' },
    { path: '/about/', priority: '0.5' },
    ...posts.map((post) => ({
      path: `/posts/${post.id}/`,
      lastmod: post.added_at,
      priority: '0.7',
    })),
    ...themes.map((theme) => ({
      path: `/themes/${theme.id}/`,
      lastmod: theme.added_at,
      priority: '0.7',
    })),
    ...plugins.map((plugin) => ({
      path: `/plugins/${pluginSlug(plugin.id)}/`,
      lastmod: plugin.added_at,
      priority: '0.6',
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    ({ path, lastmod, priority }) =>
      `  <url><loc>${new URL(path, meta.site_url).href}</loc>${
        lastmod ? `<lastmod>${lastmod}</lastmod>` : ''
      }<priority>${priority}</priority></url>`,
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
