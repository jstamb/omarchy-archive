/**
 * Filtering for the complete plugin index (/plugins/all/).
 *
 * The table is fully server-rendered: every plugin is one row, so find-in-page
 * and the no-JS view both see the whole catalogue. This only layers a
 * searchable, shareable filter on top. Like the gallery, it reads each row's
 * facets from `data-*` attributes and only flips `hidden` — it never rewrites
 * a row, so the server order and every visible fact stay intact.
 */

interface Index {
  root: HTMLElement;
  rows: HTMLElement[];
  q: HTMLInputElement | null;
  origin: HTMLSelectElement | null;
  category: HTMLSelectElement | null;
  kind: HTMLSelectElement | null;
  author: HTMLInputElement | null;
  resets: HTMLButtonElement[];
  countEl: HTMLElement | null;
  emptyEl: HTMLElement | null;
  total: number;
}

/** The query-string keys this page owns; also the control read order. */
const PARAMS = ['q', 'origin', 'category', 'kind', 'author'] as const;
type Param = (typeof PARAMS)[number];
type State = Record<Param, string>;

function collect(root: HTMLElement): Index {
  const rows = [...root.querySelectorAll<HTMLElement>('[data-plugin-row]')];
  return {
    root,
    rows,
    q: root.querySelector<HTMLInputElement>('[data-pindex-q]'),
    origin: root.querySelector<HTMLSelectElement>('[data-pindex-origin]'),
    category: root.querySelector<HTMLSelectElement>('[data-pindex-category]'),
    kind: root.querySelector<HTMLSelectElement>('[data-pindex-kind]'),
    author: root.querySelector<HTMLInputElement>('[data-pindex-author]'),
    resets: [...root.querySelectorAll<HTMLButtonElement>('[data-pindex-reset]')],
    countEl: root.querySelector<HTMLElement>('[data-pindex-count]'),
    emptyEl: root.querySelector<HTMLElement>('[data-pindex-empty]'),
    total: rows.length,
  };
}

/** Current state from the controls — the source of truth once wired. */
function readControls(index: Index): State {
  return {
    q: index.q?.value.trim() ?? '',
    origin: index.origin?.value ?? '',
    category: index.category?.value ?? '',
    kind: index.kind?.value ?? '',
    author: index.author?.value.trim() ?? '',
  };
}

/** Current state from the URL — used to restore on load and on popstate. */
function readUrl(): State {
  const params = new URLSearchParams(window.location.search);
  const state = {} as State;
  for (const key of PARAMS) state[key] = params.get(key) ?? '';
  return state;
}

function setSelect(select: HTMLSelectElement | null, value: string) {
  if (!select) return;
  // A stale/invalid share link should fall back to "all", not a blank select.
  const ok = value !== '' && [...select.options].some((option) => option.value === value);
  select.value = ok ? value : '';
}

/** Push a state onto the controls (URL -> UI). */
function writeControls(index: Index, state: State) {
  if (index.q) index.q.value = state.q;
  setSelect(index.origin, state.origin);
  setSelect(index.category, state.category);
  setSelect(index.kind, state.kind);
  if (index.author) index.author.value = state.author;
}

function syncUrl(state: State) {
  const url = new URL(window.location.href);
  for (const key of PARAMS) {
    if (state[key]) url.searchParams.set(key, state[key]);
    else url.searchParams.delete(key);
  }
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

/** Filter the rows to `state` and refresh the count / empty / reset readouts. */
function apply(index: Index, state: State): number {
  const q = state.q.toLowerCase();
  const author = state.author.toLowerCase();

  let visible = 0;
  for (const row of index.rows) {
    const show =
      (!q || (row.dataset.search ?? '').includes(q)) &&
      (!state.origin || row.dataset.origin === state.origin) &&
      (!state.category || row.dataset.category === state.category) &&
      (!state.kind || (row.dataset.kinds ?? '').split(' ').includes(state.kind)) &&
      (!author || (row.dataset.author ?? '').toLowerCase() === author);
    row.hidden = !show;
    if (show) visible++;
  }

  if (index.countEl) {
    index.countEl.textContent =
      visible === index.total
        ? `${index.total} plugins`
        : visible === 0
          ? 'No plugins match those filters'
          : `${visible} of ${index.total} plugins`;
  }
  if (index.emptyEl) index.emptyEl.hidden = visible !== 0;

  const dirty = PARAMS.some((key) => state[key] !== '');
  for (const reset of index.resets) reset.hidden = !dirty;
  return visible;
}

function init() {
  const root = document.querySelector<HTMLElement>('[data-plugin-index]');
  if (!root) return;
  const index = collect(root);

  // Restore from the share link before wiring anything, normalising stale
  // select values back to "all" as we go.
  writeControls(index, readUrl());
  apply(index, readControls(index));

  const onChange = () => {
    const state = readControls(index);
    apply(index, state);
    syncUrl(state);
  };

  index.q?.addEventListener('input', onChange);
  index.author?.addEventListener('input', onChange);
  for (const control of [index.origin, index.category, index.kind]) {
    control?.addEventListener('change', onChange);
  }

  const empty: State = { q: '', origin: '', category: '', kind: '', author: '' };
  for (const reset of index.resets) {
    reset.addEventListener('click', () => {
      writeControls(index, empty);
      apply(index, empty);
      syncUrl(empty);
      index.q?.focus(); // land the keyboard somewhere useful after recovery
    });
  }

  // Back/Forward (and any other history hop that lands here) restores state.
  window.addEventListener('popstate', () => {
    writeControls(index, readUrl());
    apply(index, readControls(index));
  });
}

init();
