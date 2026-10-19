// FTS5 query building shared by /api/search and its tests. No D1 here.

/** Turn free text into a safe FTS5 MATCH expression: every token quoted, the last one a prefix. */
export function toMatch(raw: string): string | null {
  const tokens = raw
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean)
    .slice(0, 8);
  if (!tokens.length) return null;
  return tokens.map((t, i) => `"${t.replace(/"/g, '""')}"${i === tokens.length - 1 ? '*' : ''}`).join(' ');
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** snippet() output uses \u0001/\u0002 as marks; escape, then turn them into <mark>. */
export function renderSnippet(raw: string): string {
  return escapeHtml(raw ?? '').replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>');
}
