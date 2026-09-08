/*
 * The narrow-screen navigation drawer.
 *
 * Below 1100px the sidebar is positioned off-canvas and slides in; above it the
 * same element is the permanent rail and this script stays out of the way. One
 * nav in the document, two presentations — nothing to keep in sync.
 *
 * Behaviour contract:
 *   - `data-nav-open` on <html> drives every visual state (drawer, scrim, the
 *     toggle's bars, the scroll lock). CSS owns the animation.
 *   - a closed drawer is `visibility: hidden`, so it holds no tab stops
 *   - Escape, the scrim, the toggle, and following a link all close it
 *   - focus moves to the panel on open and back to the toggle on close
 *   - Tab cycles the toggle and the panel's own controls, nothing behind them
 *   - crossing into the wide layout closes it, so a resize cannot strand the
 *     scroll lock or leave the rail mid-animation
 */
export {};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

const root = document.documentElement;
const toggle = document.querySelector<HTMLButtonElement>('[data-nav-toggle]');
const drawer = document.querySelector<HTMLElement>('[data-nav-drawer]');
const scrim = document.querySelector<HTMLElement>('[data-nav-scrim]');
const masthead = document.querySelector<HTMLElement>('.masthead');

if (toggle && drawer && scrim) {
  const wide = matchMedia('(min-width: 1100px)');
  const isOpen = () => root.hasAttribute('data-nav-open');

  /*
   * The masthead stays above the drawer so the toggle keeps animating into its
   * close state while the panel is out — which means the panel has to start
   * below it. The header wraps at these widths, so its height is measured
   * rather than assumed.
   */
  const measureMasthead = (): void => {
    if (masthead) root.style.setProperty('--masthead-h', `${Math.round(masthead.offsetHeight)}px`);
  };

  // The toggle first: it is the visible close affordance, so Tab off the last
  // link should land back on it rather than on the page behind the scrim.
  const focusables = (): HTMLElement[] => [
    toggle,
    ...[...drawer.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null),
  ];

  const open = (): void => {
    if (isOpen()) return;
    measureMasthead();
    root.setAttribute('data-nav-open', '');
    toggle.setAttribute('aria-expanded', 'true');
    // The panel, not its search field: focusing an input here pops the
    // on-screen keyboard over the menu you just asked to see.
    drawer.focus();
  };

  const close = ({ restoreFocus = true } = {}): void => {
    if (!isOpen()) return;
    root.removeAttribute('data-nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus();
  };

  measureMasthead();
  addEventListener('resize', measureMasthead);

  toggle.addEventListener('click', () => (isOpen() ? close() : open()));
  scrim.addEventListener('click', () => close());

  // A link closes the drawer as well as navigating: an in-page hash target
  // would otherwise sit behind an open menu.
  drawer.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('a[href]')) close({ restoreFocus: false });
  });

  document.addEventListener('keydown', (event) => {
    if (!isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const inside = active === toggle || drawer.contains(active);
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  });

  // Reaching the wide layout with the drawer open would leave the rail styled
  // as a panel and the page scroll locked.
  wide.addEventListener('change', (event) => {
    if (event.matches) close({ restoreFocus: false });
  });
}
