/**
 * Chip filtering + sorting for already-rendered card grids.
 *
 * Everything is server-rendered; this only hides, reorders, and syncs the URL.
 * Facet values live on the cards as `data-facet-<name>` / `data-tags`, so the
 * filter never parses visible text and stays correct when copy changes.
 *
 * Filtering and sorting are kept apart on purpose. A facet click only flips
 * `hidden` on the cards, so the node order never moves — assistive tech and the
 * reader keep their place, and nothing thrashes the layout. Reordering happens
 * only when the sort changes (or once on load), replaying a per-mode order that
 * is computed up front and cached.
 */
import { track } from './analytics';

type Facet = string;

interface Gallery {
  /** The `[data-gallery-filters]` section; carries `data-open` on mobile. */
  filtersEl: HTMLElement;
  grid: HTMLElement;
  cards: HTMLElement[];
  countEl: HTMLElement | null;
  emptyEl: HTMLElement | null;
  resetEl: HTMLElement | null;
  toggleEl: HTMLButtonElement | null;
  activeEl: HTMLElement | null;
  activeCountEl: HTMLElement | null;
  chips: HTMLButtonElement[];
  sortChips: HTMLButtonElement[];
  selected: Map<Facet, Set<string>>;
  /** Cards pre-sorted per mode, computed once. This is the cached sort. */
  orders: Map<string, HTMLElement[]>;
  sort: string;
  /** The sort whose order is currently laid out in the DOM, if any. */
  applied: string | null;
  defaultSort: string;
}

const galleries: Gallery[] = [];

function collect(): Gallery[] {
  return [...document.querySelectorAll<HTMLElement>('[data-gallery]')].map((grid) => {
    const scope = grid.closest<HTMLElement>('[data-gallery-scope]') ?? document.body;
    const controls = scope.querySelector<HTMLElement>('[data-gallery-filters]');
    const sortChips = controls
      ? [...controls.querySelectorAll<HTMLButtonElement>('[data-sort]')]
      : [];
    const defaultSort =
      sortChips.find((chip) => chip.getAttribute('aria-pressed') === 'true')?.dataset.sort ??
      'newest';
    const cards = [...grid.querySelectorAll<HTMLElement>('[data-card]')];

    return {
      filtersEl: controls ?? scope,
      grid,
      cards,
      countEl: scope.querySelector<HTMLElement>('[data-gallery-count]'),
      emptyEl: scope.querySelector<HTMLElement>('[data-gallery-empty]'),
      resetEl: scope.querySelector<HTMLElement>('[data-gallery-reset]'),
      toggleEl: controls?.querySelector<HTMLButtonElement>('[data-gallery-toggle]') ?? null,
      activeEl: controls?.querySelector<HTMLElement>('[data-gallery-active]') ?? null,
      activeCountEl: controls?.querySelector<HTMLElement>('[data-gallery-active-count]') ?? null,
      chips: controls ? [...controls.querySelectorAll<HTMLButtonElement>('[data-facet]')] : [],
      sortChips,
      selected: new Map(),
      orders: buildOrders(cards, sortChips, defaultSort),
      sort: defaultSort,
      applied: null,
      defaultSort,
    };
  });
}

/**
 * Pre-sort the cards once for every sort mode the page offers. Each mode's
 * key is computed a single time here; the click handlers only replay the
 * finished order, never re-key or re-sort.
 */
function buildOrders(
  cards: HTMLElement[],
  sortChips: HTMLButtonElement[],
  defaultSort: string,
): Map<string, HTMLElement[]> {
  const modes = new Set<string>([defaultSort]);
  for (const chip of sortChips) if (chip.dataset.sort) modes.add(chip.dataset.sort);

  const orders = new Map<string, HTMLElement[]>();
  for (const mode of modes) {
    const keyed = cards.map((card) => ({ card, key: sortKey(card, mode) }));
    keyed.sort((a, b) => a.key.localeCompare(b.key));
    orders.set(
      mode,
      keyed.map((entry) => entry.card),
    );
  }
  return orders;
}

function cardValues(card: HTMLElement, facet: Facet): string[] {
  if (facet === 'tag') return (card.dataset.tags ?? '').split(' ').filter(Boolean);
  const value = card.dataset[`facet${facet.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())}`];
  return value ? [value] : [];
}

function matches(card: HTMLElement, selected: Map<Facet, Set<string>>): boolean {
  for (const [facet, values] of selected) {
    if (values.size === 0) continue;
    const owned = cardValues(card, facet);
    if (!owned.some((value) => values.has(value))) return false;
  }
  return true;
}

function sortKey(card: HTMLElement, mode: string): string {
  if (mode === 'featured') {
    // Featured first, then newest inside each bucket.
    return `${card.dataset.featured === 'true' ? '0' : '1'}:${invert(card.dataset.date ?? '')}`;
  }
  if (mode === 'name') return card.dataset.title ?? '';
  return invert(card.dataset.date ?? '');
}

/** Descending dates as an ascending string sort, without parsing them. */
function invert(date: string): string {
  return date
    ? [...date].map((char) => (/\d/.test(char) ? String(9 - Number(char)) : char)).join('')
    : 'zzzz';
}

/** How many facet values are set — what the mobile toggle advertises. */
function activeCount(gallery: Gallery): number {
  let n = 0;
  for (const values of gallery.selected.values()) n += values.size;
  return n;
}

/**
 * Lay the grid out in the current sort. This is the only place that moves
 * nodes, and it no-ops when the DOM already holds that order, so a filter
 * toggle (which never changes `gallery.sort`) can never trigger a reorder.
 */
function applySort(gallery: Gallery) {
  if (gallery.applied !== gallery.sort) {
    const order = gallery.orders.get(gallery.sort) ?? gallery.cards;
    for (const card of order) gallery.grid.append(card);
    gallery.applied = gallery.sort;
  }
  for (const chip of gallery.sortChips) {
    chip.setAttribute('aria-pressed', chip.dataset.sort === gallery.sort ? 'true' : 'false');
  }
}

/**
 * Show or hide cards for the current selection and refresh every readout.
 * Only `hidden` is touched, so the node order applySort produced is left
 * exactly as it was. Returns how many cards survived.
 */
function applyFilter(gallery: Gallery): number {
  let visible = 0;
  for (const card of gallery.cards) {
    const show = matches(card, gallery.selected);
    card.hidden = !show;
    if (show) visible++;
  }

  if (gallery.countEl) {
    gallery.countEl.textContent =
      visible === gallery.cards.length
        ? `${gallery.cards.length} shown`
        : `${visible} of ${gallery.cards.length} shown`;
  }
  if (gallery.emptyEl) gallery.emptyEl.hidden = visible !== 0;

  const active = activeCount(gallery);
  const dirty = active > 0 || gallery.sort !== gallery.defaultSort;
  if (gallery.resetEl) gallery.resetEl.hidden = !dirty;
  if (gallery.activeCountEl) gallery.activeCountEl.textContent = String(active);
  if (gallery.activeEl) gallery.activeEl.hidden = active === 0;

  for (const chip of gallery.chips) {
    const facet = chip.dataset.facet ?? '';
    const value = chip.dataset.value ?? '';
    chip.setAttribute('aria-pressed', gallery.selected.get(facet)?.has(value) ? 'true' : 'false');
  }
  return visible;
}

function syncUrl(gallery: Gallery) {
  const url = new URL(window.location.href);
  const keys = new Set([...gallery.chips.map((chip) => chip.dataset.facet ?? ''), 'sort']);
  for (const key of keys) url.searchParams.delete(key);
  for (const [facet, values] of gallery.selected) {
    for (const value of values) url.searchParams.append(facet, value);
  }
  if (gallery.sort !== gallery.defaultSort) url.searchParams.set('sort', gallery.sort);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

/** Load selection + sort from the query string into the gallery's state. */
function readUrl(gallery: Gallery) {
  gallery.selected.clear();
  gallery.sort = gallery.defaultSort;

  const params = new URLSearchParams(window.location.search);
  const known = new Set(gallery.chips.map((chip) => chip.dataset.facet ?? ''));
  for (const facet of known) {
    const values = params.getAll(facet).filter(Boolean);
    if (values.length > 0) gallery.selected.set(facet, new Set(values));
  }
  const sort = params.get('sort');
  if (sort && gallery.sortChips.some((chip) => chip.dataset.sort === sort)) gallery.sort = sort;
}

function toggle(gallery: Gallery, facet: Facet, value: string) {
  const values = gallery.selected.get(facet) ?? new Set<string>();
  if (values.has(value)) values.delete(value);
  else values.add(value);
  gallery.selected.set(facet, values);
}

function setOpen(gallery: Gallery, open: boolean) {
  if (!gallery.toggleEl) return;
  gallery.toggleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) gallery.filtersEl.setAttribute('data-open', '');
  else gallery.filtersEl.removeAttribute('data-open');
}

/** Re-apply whatever the URL now says — for reload and Back/Forward alike. */
function restore(gallery: Gallery) {
  readUrl(gallery);
  applySort(gallery);
  applyFilter(gallery);
}

export function initGalleries() {
  galleries.length = 0;
  galleries.push(...collect());

  for (const gallery of galleries) {
    for (const chip of gallery.chips) {
      chip.addEventListener('click', () => {
        const facet = chip.dataset.facet ?? '';
        const value = chip.dataset.value ?? '';
        toggle(gallery, facet, value);
        const results = applyFilter(gallery); // visibility only — never reorders
        syncUrl(gallery);
        /*
         * Only on the way in. A chip is a toggle, and "turned it off" says
         * nothing about what someone was looking for — it is the same signal
         * as never having pressed it.
         */
        if (gallery.selected.get(facet)?.has(value)) {
          track('filter', { facet, value, results });
        }
      });
    }

    for (const chip of gallery.sortChips) {
      chip.addEventListener('click', () => {
        gallery.sort = chip.dataset.sort ?? gallery.defaultSort;
        applySort(gallery); // reorder happens here, and only here
        applyFilter(gallery); // the reset toggle depends on sort; no node moves
        syncUrl(gallery);
      });
    }

    gallery.resetEl?.addEventListener('click', () => {
      gallery.selected.clear();
      gallery.sort = gallery.defaultSort;
      applySort(gallery);
      applyFilter(gallery);
      syncUrl(gallery);
    });

    gallery.toggleEl?.addEventListener('click', () => {
      setOpen(gallery, gallery.toggleEl!.getAttribute('aria-expanded') !== 'true');
    });

    restore(gallery); // establish initial order + selection from the URL
  }

  window.addEventListener('popstate', () => {
    for (const gallery of galleries) restore(gallery);
  });
}

initGalleries();
