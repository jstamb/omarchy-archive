/**
 * The site theme switcher.
 *
 * Any indexed theme with colours can restyle the archive: pick one from the
 * masthead, or press "Use on this site" on its page. The choice is stored in
 * this browser as the computed tokens, so the inline script in <head> can
 * paint them before first render without knowing anything about the catalog.
 *
 * Two sources feed the same pipeline:
 *   - the catalog (/themes/catalog.json), fetched on first open;
 *   - the machine's live Omarchy theme, read through the File System Access
 *     API once the user grants it — see local-theme.ts.
 */
import { track } from './analytics';
import {
  connectLocalTheme,
  disconnectLocalTheme,
  regrantLocalTheme,
  resumeLocalTheme,
  supportsLocalTheme,
} from './local-theme';
import type { LocalThemeStatus } from './local-theme';
import { pixelsFor, tokensFor, toneOf } from '../lib/theme-tokens';
import type { CatalogTheme, Tokens, Tone } from '../lib/theme-tokens';

export const STORAGE_KEY = 'omarchy-archive-theme';
const CATALOG_URL = '/themes/catalog.json';
const DEFAULT_ID = 'tokyo-night';
const DEFAULT_NAME = 'Tokyo Night';
const DEFAULT_PIXELS = ['#1a1b26', '#7aa2f7', '#f7768e', '#9ece6a', '#e0af68'];

export interface StoredTheme {
  id: string;
  name: string;
  tone: Tone;
  tokens: Tokens;
  pixels: string[];
  /** `local` follows the machine's Omarchy theme; `catalog` is a pick. */
  source: 'catalog' | 'local';
}

// ------------------------------------------------------------------ storage + paint

function load(): StoredTheme | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return parsed && typeof parsed === 'object' && parsed.tokens ? (parsed as StoredTheme) : null;
  } catch {
    return null;
  }
}

function store(theme: StoredTheme | null) {
  try {
    if (theme) localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or a full quota: the theme still applies for this page.
  }
}

const TOKEN_NAMES = [
  '--bg',
  '--bg-raised',
  '--bg-sunken',
  '--line',
  '--line-soft',
  '--ink',
  '--ink-dim',
  '--ink-meta',
  '--accent',
  '--accent-sunken',
  '--link',
  '--link-hover',
  '--highlight',
  '--blue',
  '--warn',
  '--warn-sunken',
];

/** Paint tokens onto <html>. Mirrors the inline head script; keep the two in step. */
function paint(theme: StoredTheme | null) {
  const root = document.documentElement;
  for (const name of TOKEN_NAMES) root.style.removeProperty(name);
  if (theme) {
    for (const [name, value] of Object.entries(theme.tokens)) root.style.setProperty(name, value);
    root.dataset.siteTheme = theme.id;
    root.dataset.tone = theme.tone;
  } else {
    delete root.dataset.siteTheme;
    delete root.dataset.tone;
  }
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = theme?.tokens['--bg'] ?? '#1a1b26';
  document.dispatchEvent(new CustomEvent('site-theme', { detail: theme }));
}

function fromCatalog(theme: CatalogTheme): StoredTheme | null {
  const tokens = tokensFor(theme.colors, theme.tone);
  if (!tokens) return null;
  return {
    id: theme.id,
    name: theme.name,
    tone: toneOf(theme.colors, theme.tone),
    tokens,
    pixels: pixelsFor(theme),
    source: 'catalog',
  };
}

export function applyTheme(theme: StoredTheme | null, reason: string) {
  store(theme);
  paint(theme);
  track('site_theme', { theme: theme?.id ?? 'default', source: theme?.source ?? 'default', via: reason });
}

// ------------------------------------------------------------------ catalog

let catalogPromise: Promise<CatalogTheme[]> | null = null;

export function loadCatalog(): Promise<CatalogTheme[]> {
  if (!catalogPromise) {
    catalogPromise = fetch(CATALOG_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`GET ${CATALOG_URL} -> ${response.status}`);
        return response.json() as Promise<CatalogTheme[]>;
      })
      .catch((error) => {
        catalogPromise = null;
        throw error;
      });
  }
  return catalogPromise;
}

/** Substring match on name and id; prefix matches first, then alphabetical. */
export function filterCatalog(catalog: CatalogTheme[], query: string): CatalogTheme[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalog;
  const score = (theme: CatalogTheme) => {
    const name = theme.name.toLowerCase();
    if (name.startsWith(q) || theme.id.startsWith(q)) return 0;
    if (name.includes(q) || theme.id.includes(q)) return 1;
    return -1;
  };
  return catalog
    .map((theme) => ({ theme, score: score(theme) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.theme.name.localeCompare(b.theme.name))
    .map((entry) => entry.theme);
}

// ------------------------------------------------------------------ pixels

function pixelRow(colors: string[], size = 'sm'): HTMLElement {
  const row = document.createElement('span');
  row.className = `pixels pixels--${size}`;
  row.setAttribute('aria-hidden', 'true');
  for (const hex of colors) {
    const px = document.createElement('i');
    px.style.setProperty('--c', hex);
    row.append(px);
  }
  return row;
}

// ------------------------------------------------------------------ the masthead picker

function wirePicker(root: HTMLElement) {
  const toggle = root.querySelector<HTMLButtonElement>('[data-themepick-toggle]');
  const pop = root.querySelector<HTMLElement>('[data-themepick-pop]');
  const search = root.querySelector<HTMLInputElement>('[data-themepick-search]');
  const list = root.querySelector<HTMLElement>('[data-themepick-list]');
  const note = root.querySelector<HTMLElement>('[data-themepick-note]');
  const reset = root.querySelector<HTMLButtonElement>('[data-themepick-reset]');
  const local = root.querySelector<HTMLButtonElement>('[data-themepick-local]');
  const localOff = root.querySelector<HTMLButtonElement>('[data-themepick-local-off]');
  const name = root.querySelector<HTMLElement>('[data-themepick-name]');
  const pixels = root.querySelector<HTMLElement>('[data-themepick-pixels]');
  if (!toggle || !pop || !search || !list || !note || !reset || !local || !localOff || !name || !pixels) return;

  let catalog: CatalogTheme[] = [];
  let active = -1;

  const current = () => load();

  const paintButton = () => {
    const theme = current();
    name.textContent = theme ? theme.name : DEFAULT_NAME;
    pixels.replaceChildren(...pixelRow(theme?.pixels ?? DEFAULT_PIXELS).childNodes);
    root.dataset.source = theme?.source ?? 'default';
    localOff.hidden = theme?.source !== 'local';
    local.hidden = !supportsLocalTheme() || theme?.source === 'local';
  };

  const options = () => [...list.querySelectorAll<HTMLElement>('[role="option"]')];

  const highlight = (index: number) => {
    const items = options();
    active = items.length ? Math.max(0, Math.min(index, items.length - 1)) : -1;
    items.forEach((item, i) => {
      item.setAttribute('aria-selected', i === active ? 'true' : 'false');
      if (i === active) {
        item.scrollIntoView({ block: 'nearest' });
        search.setAttribute('aria-activedescendant', item.id);
      }
    });
    if (active < 0) search.removeAttribute('aria-activedescendant');
  };

  const render = () => {
    const shown = filterCatalog(catalog, search.value);
    const chosen = current()?.id;
    list.replaceChildren(
      ...shown.map((theme, i) => {
        const li = document.createElement('li');
        li.id = `themepick-${theme.id}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.dataset.themeId = theme.id;
        if (theme.id === chosen) li.dataset.current = 'true';
        li.append(pixelRow(pixelsFor(theme)));
        const label = document.createElement('span');
        label.className = 'themepick__label';
        label.textContent = theme.name;
        li.append(label);
        const kind = document.createElement('span');
        kind.className = 'themepick__kind';
        kind.textContent = theme.bundled ? 'bundled' : (theme.tone ?? '');
        li.append(kind);
        li.tabIndex = -1;
        li.setAttribute('data-index', String(i));
        return li;
      }),
    );
    note.textContent = shown.length
      ? `${shown.length} of ${catalog.length} themes`
      : `No theme matches “${search.value.trim()}”.`;
    highlight(0);
  };

  const choose = (id: string, via: string) => {
    const theme = catalog.find((entry) => entry.id === id);
    const stored = theme ? fromCatalog(theme) : null;
    if (!stored) return;
    disconnectLocalTheme();
    applyTheme(stored, via);
    paintButton();
    close();
  };

  const open = async () => {
    pop.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    search.value = '';
    search.focus();
    if (catalog.length === 0) {
      note.textContent = 'Loading themes…';
      try {
        catalog = await loadCatalog();
      } catch {
        note.textContent = 'Could not load the theme list. Check your connection and try again.';
        return;
      }
    }
    render();
  };

  const close = () => {
    if (pop.hidden) return;
    pop.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', () => (pop.hidden ? open() : close()));
  search.addEventListener('input', render);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      highlight(active + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlight(active - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const id = options()[active]?.dataset.themeId;
      if (id) choose(id, 'picker-keyboard');
    } else if (event.key === 'Escape') {
      close();
      toggle.focus();
    }
  });
  list.addEventListener('click', (event) => {
    const item = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-theme-id]');
    if (item?.dataset.themeId) choose(item.dataset.themeId, 'picker');
  });
  list.addEventListener('mousemove', (event) => {
    const item = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-index]');
    if (item) highlight(Number(item.dataset.index));
  });
  reset.addEventListener('click', () => {
    disconnectLocalTheme();
    applyTheme(null, 'picker-reset');
    paintButton();
    close();
  });

  const onLocalStatus = (status: LocalThemeStatus) => {
    note.textContent = status.message;
    if (status.theme) {
      applyTheme(status.theme, 'local');
      paintButton();
    }
  };
  local.addEventListener('click', async () => {
    // A lapsed grant on a remembered folder only needs the click, not a
    // fresh picker.
    if (await regrantLocalTheme(onLocalStatus)) {
      paintButton();
      return;
    }
    note.textContent = 'Pick your ~/.local/state/omarchy/current folder…';
    await connectLocalTheme(onLocalStatus);
    paintButton();
  });
  localOff.addEventListener('click', () => {
    disconnectLocalTheme();
    applyTheme(null, 'local-off');
    paintButton();
    note.textContent = 'Stopped following your Omarchy theme.';
  });

  document.addEventListener('click', (event) => {
    if (!root.contains(event.target as Node)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !pop.hidden) {
      close();
      toggle.focus();
    }
  });
  document.addEventListener('site-theme', paintButton);

  paintButton();
  // A previously granted local connection resumes silently; one that needs a
  // fresh gesture surfaces in the note the next time the picker opens.
  if (current()?.source === 'local') void resumeLocalTheme(onLocalStatus);
}

// ------------------------------------------------------------------ "Use on this site"

function wireApplyButtons() {
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-theme-apply]');
  if (buttons.length === 0) return;
  const paintAll = () => {
    const chosen = load()?.id ?? DEFAULT_ID;
    for (const button of buttons) {
      const using = button.dataset.themeApply === chosen && (load() !== null || chosen !== DEFAULT_ID);
      button.setAttribute('aria-pressed', using ? 'true' : 'false');
      button.textContent = using ? 'Using on this site — reset' : 'Use on this site';
    }
  };
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      const id = button.dataset.themeApply;
      if (!id) return;
      if (button.getAttribute('aria-pressed') === 'true') {
        applyTheme(null, 'theme-page-reset');
        paintAll();
        return;
      }
      let catalog: CatalogTheme[];
      try {
        catalog = await loadCatalog();
      } catch {
        button.textContent = 'Could not load theme colours';
        return;
      }
      const theme = catalog.find((entry) => entry.id === id);
      const stored = theme ? fromCatalog(theme) : null;
      if (!stored) {
        button.textContent = 'This theme has no colours indexed';
        button.disabled = true;
        return;
      }
      disconnectLocalTheme();
      applyTheme(stored, 'theme-page');
      paintAll();
    });
  }
  document.addEventListener('site-theme', paintAll);
  paintAll();
}

document.querySelectorAll<HTMLElement>('[data-themepick]').forEach(wirePicker);
wireApplyButtons();
