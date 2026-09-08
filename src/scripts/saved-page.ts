export {}; // Astro imports this as a module; without an export TS scopes its declarations globally and they collide across scripts.

type PageSavedItem = { url: string; title: string; type: string };

function loadPageSaved(): PageSavedItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('omarchy-archive-saved') ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const savedList = document.querySelector('[data-saved-list]');
const savedStatus = document.querySelector('[data-saved-status]');
const savedItems = loadPageSaved();
if (savedStatus instanceof HTMLElement) {
  savedStatus.textContent = savedItems.length
    ? `${savedItems.length} saved in this browser.`
    : 'Nothing saved yet.';
}
if (savedList) {
  for (const item of savedItems) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.url;
    link.textContent = item.title;
    const kind = document.createElement('span');
    kind.className = 'card__sub';
    kind.textContent = ` ${item.type}`;
    li.append(link, kind);
    savedList.append(li);
  }
}
