/**
 * Source previews for post cards / detail:
 * - Hover/focus: hosted screenshot popover when data-preview-image is set
 * - Click "Embed": lazy official X widgets.js embed in a dialog
 *
 * Progressive enhancement only — links still work without JS.
 */

const WIDGETS_SRC = 'https://platform.twitter.com/widgets.js';
let widgetsPromise: Promise<void> | null = null;

function loadWidgets(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const tw = (window as unknown as { twttr?: { widgets?: { load: (el?: HTMLElement) => void } } }).twttr;
  if (tw?.widgets?.load) return Promise.resolve();
  if (widgetsPromise) return widgetsPromise;
  widgetsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${WIDGETS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('widgets.js failed')), { once: true });
      return;
    }
    const tag = document.createElement('script');
    tag.src = WIDGETS_SRC;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('widgets.js failed'));
    document.head.append(tag);
  });
  return widgetsPromise;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ensureImagePopover(): HTMLElement {
  let el = document.querySelector<HTMLElement>('[data-source-image-popover]');
  if (el) return el;
  el = document.createElement('div');
  el.className = 'source-preview-popover';
  el.hidden = true;
  el.setAttribute('data-source-image-popover', '');
  el.setAttribute('role', 'img');
  el.innerHTML = '<img alt="" decoding="async" />';
  document.body.append(el);
  return el;
}

function positionPopover(popover: HTMLElement, anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  const pad = 8;
  const width = Math.min(420, window.innerWidth - pad * 2);
  popover.style.width = `${width}px`;
  // Measure after width set
  popover.hidden = false;
  const height = popover.offsetHeight || 240;
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
  let top = rect.bottom + pad;
  if (top + height > window.innerHeight - pad && rect.top > height + pad) {
    top = rect.top - height - pad;
  }
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

function showImagePreview(anchor: HTMLElement) {
  const src = anchor.getAttribute('data-preview-image');
  if (!src) return;
  const popover = ensureImagePopover();
  const img = popover.querySelector('img');
  if (!img) return;
  if (img.getAttribute('src') !== src) {
    img.src = src;
    img.alt = anchor.getAttribute('data-preview-alt') || 'Source post screenshot';
  }
  positionPopover(popover, anchor);
}

function hideImagePreview() {
  const popover = document.querySelector<HTMLElement>('[data-source-image-popover]');
  if (popover) popover.hidden = true;
}

function ensureEmbedDialog(): HTMLDialogElement {
  let dialog = document.querySelector<HTMLDialogElement>('[data-source-embed-dialog]');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'source-embed-dialog';
  dialog.setAttribute('data-source-embed-dialog', '');
  dialog.innerHTML = `
    <form method="dialog" class="source-embed-dialog__bar">
      <strong class="source-embed-dialog__title">Original on X</strong>
      <button class="btn" value="cancel" type="submit">Close</button>
    </form>
    <div class="source-embed-dialog__body" data-source-embed-body>
      <p class="source-embed-dialog__status" data-source-embed-status>Loading…</p>
    </div>
  `;
  document.body.append(dialog);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

async function openEmbed(statusUrl: string) {
  const dialog = ensureEmbedDialog();
  const body = dialog.querySelector<HTMLElement>('[data-source-embed-body]');
  const status = dialog.querySelector<HTMLElement>('[data-source-embed-status]');
  if (!body) return;
  body.innerHTML = '';
  const statusEl = document.createElement('p');
  statusEl.className = 'source-embed-dialog__status';
  statusEl.setAttribute('data-source-embed-status', '');
  statusEl.textContent = 'Loading…';
  body.append(statusEl);

  const block = document.createElement('blockquote');
  block.className = 'twitter-tweet';
  block.setAttribute('data-dnt', 'true');
  block.setAttribute('data-theme', 'dark');
  const link = document.createElement('a');
  link.href = statusUrl;
  link.textContent = statusUrl;
  block.append(link);
  body.append(block);

  dialog.showModal();
  try {
    await loadWidgets();
    const tw = (window as unknown as { twttr?: { widgets?: { load: (el?: HTMLElement) => void } } }).twttr;
    tw?.widgets?.load(body);
    statusEl.remove();
  } catch {
    statusEl.textContent = 'Could not load the X embed. Use the source link instead.';
  }
}

function onPointerEnter(event: Event) {
  if (prefersReducedMotion()) return;
  const target = (event.target as HTMLElement | null)?.closest?.('[data-preview-image]') as HTMLElement | null;
  if (!target) return;
  showImagePreview(target);
}

function onPointerLeave(event: Event) {
  const target = (event.target as HTMLElement | null)?.closest?.('[data-preview-image]') as HTMLElement | null;
  if (!target) return;
  const related = (event as PointerEvent).relatedTarget as Node | null;
  const popover = document.querySelector('[data-source-image-popover]');
  if (related && (target.contains(related) || popover?.contains(related))) return;
  hideImagePreview();
}

function onFocusIn(event: Event) {
  const target = (event.target as HTMLElement | null)?.closest?.('[data-preview-image]') as HTMLElement | null;
  if (target) showImagePreview(target);
}

function onFocusOut(event: Event) {
  const target = (event.target as HTMLElement | null)?.closest?.('[data-preview-image]') as HTMLElement | null;
  if (!target) return;
  const related = (event as FocusEvent).relatedTarget as Node | null;
  if (related && target.contains(related)) return;
  hideImagePreview();
}

function onClick(event: Event) {
  const btn = (event.target as HTMLElement | null)?.closest?.('[data-source-embed]') as HTMLElement | null;
  if (!btn) return;
  event.preventDefault();
  const url = btn.getAttribute('data-source-embed');
  if (url) void openEmbed(url);
}

function onScroll() {
  hideImagePreview();
}

document.addEventListener('pointerenter', onPointerEnter, true);
document.addEventListener('pointerleave', onPointerLeave, true);
document.addEventListener('focusin', onFocusIn);
document.addEventListener('focusout', onFocusOut);
document.addEventListener('click', onClick);
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);
