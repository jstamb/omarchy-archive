/** Helpers for X / Twitter status URLs used by source previews. */

const STATUS_RE =
  /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i;

export function xStatusId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = STATUS_RE.exec(url.trim());
  return match?.[1] ?? null;
}

export function isXStatusUrl(url: string | null | undefined): boolean {
  return xStatusId(url) !== null;
}
