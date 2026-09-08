export {}; // Astro imports this as a module; without an export TS scopes its declarations globally and they collide across scripts.

document.querySelectorAll<HTMLElement>('[data-lightbox]').forEach((root) => {
  const open = root.querySelector<HTMLButtonElement>('[data-lightbox-open]');
  const dialog = root.querySelector<HTMLDialogElement>('[data-lightbox-dialog]');
  if (!open || !dialog) return;

  open.addEventListener('click', () => {
    dialog.showModal();
    dialog.querySelector('button')?.focus();
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') dialog.close();
  });
});
