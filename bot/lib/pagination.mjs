/**
 * Follow a paginated JSON-array endpoint by its own pagination evidence.
 *
 * The timeline ingest used to walk GitHub releases with a page-size heuristic
 * and a hard `for (page = 1; page <= 10; …)` cap. That cap is a *silent* limit:
 * a repo with more than ten pages of releases would quietly lose the oldest
 * history with no error. And a page-size guess cannot tell "this is the last
 * page" from "the API changed shape". This module instead follows the upstream
 * `Link: rel="next"` header — the authoritative evidence that another page
 * exists — and refuses the three ways pagination goes wrong.
 */

/** Parse an RFC 5988 `Link` header into a { rel: url } map (e.g. { next, last }). */
export function parseLinkHeader(header) {
  const links = {};
  if (!header) return links;
  for (const part of String(header).split(',')) {
    const match = /<([^>]+)>\s*;\s*rel="?([^"\s;]+)"?/.exec(part.trim());
    if (match) links[match[2]] = match[1];
  }
  return links;
}

/**
 * Fetch every page starting at `startUrl`, concatenating the arrays in order.
 * Throws — never returns partial or empty-as-success — when:
 *   - a page body is not a JSON array (a shape change, not "no more data");
 *   - a `next` URL has already been fetched (a cursor loop);
 *   - more than `maxPages` pages are seen (a ceiling that fails loudly instead
 *     of silently truncating).
 * Emptiness across pages is left to the caller to judge.
 */
export async function fetchAllPages(startUrl, { headers = {}, maxPages = 50, fetchImpl = fetch } = {}) {
  const startOrigin = new URL(startUrl).origin;
  const items = [];
  const seen = new Set();
  let url = startUrl;
  let pages = 0;

  while (url) {
    if (seen.has(url)) {
      throw new Error(`pagination loop: ${url} was already fetched — refusing to spin`);
    }
    seen.add(url);
    pages += 1;
    if (pages > maxPages) {
      throw new Error(`pagination exceeded ${maxPages} pages — refusing to loop or silently truncate`);
    }

    // Never hand the caller's (possibly credentialed) headers to a rel=next that
    // points at a different origin: a compromised or malicious upstream could
    // otherwise exfiltrate the auth token. Cross-origin pages get no auth.
    const sameOrigin = new URL(url).origin === startOrigin;
    const response = await fetchImpl(url, { headers: sameOrigin ? headers : {} });
    if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);

    const batch = await response.json();
    if (!Array.isArray(batch)) {
      throw new Error(
        `malformed page at ${url}: expected a JSON array, got ${batch === null ? 'null' : typeof batch}`,
      );
    }
    items.push(...batch);

    const next = parseLinkHeader(response.headers.get('link')).next;
    url = next ? new URL(next, url).href : null;
  }

  return items;
}
