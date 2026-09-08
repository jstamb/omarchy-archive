export {}; // Astro imports this as a module; without an export TS scopes its declarations globally and they collide across scripts.

const SAVED_KEY = 'omarchy-archive-saved';
const SEEN_KEY = 'omarchy-archive-posts-seen';

type ArchiveSavedItem = { url: string; title: string; type: string };

function loadArchiveSaved(): ArchiveSavedItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function storeArchiveSaved(items: ArchiveSavedItem[]) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(items));
}

function isArchiveSaved(url: string) {
  return loadArchiveSaved().some((item) => item.url === url);
}

function toggleArchiveSaved(item: ArchiveSavedItem) {
  const items = loadArchiveSaved();
  const next = isArchiveSaved(item.url)
    ? items.filter((entry) => entry.url !== item.url)
    : [...items, item];
  storeArchiveSaved(next);
  return isArchiveSaved(item.url);
}

function paintSavedCount() {
  const n = loadArchiveSaved().length;
  document.querySelectorAll<HTMLElement>('[data-saved-count]').forEach((node) => {
    node.hidden = n === 0;
    node.textContent = String(n);
  });
}

function label(button: HTMLButtonElement, saved: boolean) {
  button.textContent = saved ? 'Saved' : 'Save';
  button.setAttribute('aria-pressed', saved ? 'true' : 'false');
  const dest = button.parentElement?.querySelector<HTMLElement>('[data-save-dest]');
  if (dest) dest.hidden = !saved;
}

document.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((button) => {
  const url = button.dataset.url ?? '';
  const title = button.dataset.title ?? '';
  const type = button.dataset.type ?? '';
  if (!url) return;
  label(button, isArchiveSaved(url));
  button.addEventListener('click', () => {
    const saved = toggleArchiveSaved({ url, title, type });
    label(button, saved);
    paintSavedCount();
  });
});
paintSavedCount();

const feed = document.querySelector('[data-posts-feed]');
if (feed) {
  const previous = localStorage.getItem(SEEN_KEY);
  if (previous) {
    feed.querySelectorAll<HTMLElement>('[data-card][data-date]').forEach((card) => {
      const added = card.dataset.date ?? '';
      if (added && added > previous.slice(0, 10)) card.setAttribute('data-new', 'true');
    });
  }
  localStorage.setItem(SEEN_KEY, new Date().toISOString());
}
