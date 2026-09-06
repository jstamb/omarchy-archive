/**
 * Scroll-driven reveal for the history page.
 *
 * Nodes fade and slide in as they enter the viewport, and the spine draws down
 * to the last one revealed, so scrolling the page reads as travelling along the
 * timeline rather than as a list appearing.
 *
 * Everything is CSS transitions driven by one class and one custom property —
 * no animation loop, nothing recalculated on scroll. If IntersectionObserver is
 * missing or the reader prefers reduced motion, every node is simply revealed
 * up front and the page is complete without any of this.
 */
const nodes = [...document.querySelectorAll<HTMLElement>('[data-tl-node]')];
const list = document.querySelector<HTMLElement>('[data-timeline]');

const revealAll = () => {
  for (const node of nodes) node.dataset.revealed = 'true';
  list?.style.setProperty('--tl-progress', '100%');
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

if (nodes.length === 0) {
  // nothing to do
} else if (reducedMotion.matches || typeof IntersectionObserver === 'undefined') {
  revealAll();
} else {
  // -1, not 0: at 0 the first node's `index > deepest` is false and the spine
  // never leaves 0% until the second node scrolls in.
  let deepest = -1;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const node = entry.target as HTMLElement;
        node.dataset.revealed = 'true';
        observer.unobserve(node);

        // The spine only ever grows. Scrolling back up should not retract it.
        const index = nodes.indexOf(node);
        if (index > deepest) {
          deepest = index;
          const progress = ((index + 1) / nodes.length) * 100;
          list?.style.setProperty('--tl-progress', `${progress.toFixed(2)}%`);
        }
      }
    },
    // Fire a little before the node reaches the fold, so it is already settled
    // by the time it is properly on screen.
    { rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
  );

  for (const node of nodes) observer.observe(node);

  // A reader who switches the preference mid-visit gets the static version.
  reducedMotion.addEventListener('change', (event) => {
    if (event.matches) {
      observer.disconnect();
      revealAll();
    }
  });
}
