export {}; // Astro imports this as a module; without an export TS scopes its declarations globally and they collide across scripts.

type ThemeLite = {
  id: string;
  name: string;
  image: string | null;
  palette: string[];
  tone: string | null;
  bundled: boolean;
  command: string | null;
};

function readCatalog(): ThemeLite[] {
  const node = document.getElementById('compare-catalog');
  if (!node?.textContent) return [];
  try {
    return JSON.parse(node.textContent) as ThemeLite[];
  } catch {
    return [];
  }
}

function selectedIds(): string[] {
  return [...document.querySelectorAll<HTMLInputElement>('[data-compare-form] input:checked')].map(
    (input) => input.value,
  );
}

function syncCompareUrl(ids: string[]) {
  const url = new URL(window.location.href);
  if (ids.length) url.searchParams.set('ids', ids.join(','));
  else url.searchParams.delete('ids');
  history.replaceState(null, '', url);
}

function render(catalog: ThemeLite[]) {
  const ids = selectedIds();
  const status = document.querySelector('[data-compare-status]');
  const grid = document.querySelector('[data-compare-grid]');
  if (status) {
    status.textContent =
      ids.length < 2 ? 'Select at least two themes.' : `Comparing ${ids.length} themes.`;
  }
  if (!grid) return;
  const picked = ids.map((id) => catalog.find((theme) => theme.id === id)).filter(Boolean) as ThemeLite[];
  grid.replaceChildren(
    ...picked.map((theme) => {
      const col = document.createElement('article');
      col.className = 'compare-col panel';
      const title = document.createElement('h2');
      const link = document.createElement('a');
      link.href = `/themes/${theme.id}/`;
      link.textContent = theme.name;
      title.append(link);
      col.append(title);
      if (theme.image) {
        const img = document.createElement('img');
        img.src = theme.image;
        img.alt = `${theme.name} preview`;
        col.append(img);
      }
      const meta = document.createElement('p');
      meta.className = 'card__sub';
      meta.textContent = [theme.bundled ? 'bundled' : 'community', theme.tone].filter(Boolean).join(' · ');
      col.append(meta);
      if (theme.palette.length) {
        const palette = document.createElement('div');
        palette.className = 'palette';
        for (const hex of theme.palette) {
          const swatch = document.createElement('span');
          swatch.style.background = hex;
          swatch.title = hex;
          palette.append(swatch);
        }
        col.append(palette);
      }
      if (theme.command) {
        const code = document.createElement('code');
        code.textContent = theme.command;
        col.append(code);
      }
      return col;
    }),
  );
}

const catalog = readCatalog();
const form = document.querySelector('[data-compare-form]');
const initial = new URLSearchParams(window.location.search).get('ids')?.split(',').filter(Boolean) ?? [];
for (const id of initial) {
  const input = form?.querySelector<HTMLInputElement>(`input[value="${CSS.escape(id)}"]`);
  if (input) input.checked = true;
}
form?.addEventListener('change', () => {
  const ids = selectedIds();
  syncCompareUrl(ids);
  render(catalog);
});
render(catalog);
