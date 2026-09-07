/**
 * Chip filtering + sorting for already-rendered card grids.
 *
 * Everything is server-rendered; this only hides, reorders, and syncs the URL.
 * Facet values live on the cards as `data-facet-<name>` / `data-tags`, so the
 * filter never parses visible text and stays correct when copy changes.
 */
import { track } from './analytics';

type Facet = string;

interface Gallery {
  grid: HTMLElement;
  cards: HTMLElement[];
  countEl: HTMLElement | null;
  emptyEl: HTMLElement | null;
  resetEl: HTMLElement | null;
  chips: HTMLButtonElement[];
  sortChips: HTMLButtonElement[];
  selected: Map<Facet, Set<string>>;
  sort: string;
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

    return {
      grid,
      cards: [...grid.querySelectorAll<HTMLElement>('[data-card]')],
      countEl: scope.querySelector<HTMLElement>('[data-gallery-count]'),
      emptyEl: scope.querySelector<HTMLElement>('[data-gallery-empty]'),
      resetEl: scope.querySelector<HTMLElement>('[data-gallery-reset]'),
      chips: controls ? [...controls.querySelectorAll<HTMLButtonElement>('[data-facet]')] : [],
      sortChips,
      selected: new Map(),
      sort: defaultSort,
      defaultSort,
    };
  });
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

/** Applies the current filter + sort, and returns how many cards survived. */
function render(gallery: Gallery): number {
  let visible = 0;
  for (const card of gallery.cards) {
    const show = matches(card, gallery.selected);
    card.hidden = !show;
    if (show) visible++;
  }

  const ordered = [...gallery.cards].sort((a, b) =>
    sortKey(a, gallery.sort).localeCompare(sortKey(b, gallery.sort)),
  );
  for (const card of ordered) gallery.grid.append(card);

  if (gallery.countEl) {
    gallery.countEl.textContent =
      visible === gallery.cards.length
        ? `${gallery.cards.length} shown`
        : `${visible} of ${gallery.cards.length} shown`;
  }
  if (gallery.emptyEl) gallery.emptyEl.hidden = visible !== 0;

  const dirty =
    gallery.sort !== gallery.defaultSort ||
    [...gallery.selected.values()].some((values) => values.size > 0);
  if (gallery.resetEl) gallery.resetEl.hidden = !dirty;

  for (const chip of gallery.chips) {
    const facet = chip.dataset.facet ?? '';
    const value = chip.dataset.value ?? '';
    chip.setAttribute(
      'aria-pressed',
      gallery.selected.get(facet)?.has(value) ? 'true' : 'false',
    );
  }
  for (const chip of gallery.sortChips) {
    chip.setAttribute('aria-pressed', chip.dataset.sort === gallery.sort ? 'true' : 'false');
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

function readUrl(gallery: Gallery) {
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

export function initGalleries() {
  galleries.length = 0;
  galleries.push(...collect());

  for (const gallery of galleries) {
    readUrl(gallery);

    for (const chip of gallery.chips) {
      chip.addEventListener('click', () => {
        const facet = chip.dataset.facet ?? '';
        const value = chip.dataset.value ?? '';
        toggle(gallery, facet, value);
        const results = render(gallery);
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
        render(gallery);
        syncUrl(gallery);
      });
    }

    gallery.resetEl?.addEventListener('click', () => {
      gallery.selected.clear();
      gallery.sort = gallery.defaultSort;
      render(gallery);
      syncUrl(gallery);
    });

    render(gallery);
  }
}

initGalleries();
