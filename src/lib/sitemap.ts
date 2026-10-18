export const SITEMAP_CHUNK = 5000;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function urlset(site: string, entries: { path: string; lastmod?: string | null; priority?: string }[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    ({ path, lastmod, priority }) =>
      `  <url><loc>${esc(new URL(path, site).href)}</loc>${lastmod ? `<lastmod>${esc(lastmod.slice(0, 10))}</lastmod>` : ''}${
        priority ? `<priority>${priority}</priority>` : ''
      }</url>`,
  )
  .join('\n')}
</urlset>
`;
}

export function xml(body: string) {
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}

export { esc };
