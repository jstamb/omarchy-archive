/**
 * Rybbit custom events.
 *
 * Fired programmatically rather than with `data-rybbit-event` attributes. The
 * attribute form only works when "Web Events" auto-capture is toggled on in
 * the Rybbit dashboard, so instrumentation that looks correct in the HTML can
 * silently record nothing. `window.rybbit.event()` works either way, and the
 * events are then in git rather than in a settings panel.
 *
 * Everything here is best-effort. An ad blocker, a failed request, or a click
 * in the moment before the script has loaded all end in a dropped event, and
 * none of them may take a copy button or a link with them.
 */
type Props = Record<string, string | number | boolean>;

declare global {
  interface Window {
    rybbit?: { event?: (name: string, props?: Props) => void };
  }
}

export function track(name: string, props: Props = {}): void {
  try {
    window.rybbit?.event?.(name, { page: location.pathname, ...props });
  } catch {
    // Analytics is never load-bearing.
  }
}

/**
 * Search queries are free text, so they are the one property here that could
 * grow unbounded or carry something personal. Folding case and trimming to a
 * sane length keeps "ThinkPad " and "thinkpad" one row instead of two, and
 * stops a pasted essay becoming a column in someone's dashboard.
 */
export const cleanQuery = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
