type StorageKind = 'localStorage' | 'sessionStorage';

function readStorage(kind: StorageKind, key: string): string | null {
  try { return window[kind].getItem(key); } catch { return null; }
}

function writeStorage(kind: StorageKind, key: string, value: string): void {
  try { window[kind].setItem(key, value); } catch { /* Navigation also works without storage. */ }
}

function initializeSidebar(): () => void {
  const root = document.documentElement;
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('main-content');
  const mobileToggle = document.getElementById('sidebar-toggle');
  const closeButton = document.getElementById('sidebar-close');
  const desktopToggle = document.getElementById('sidebar-collapse-btn');
  if (!sidebar || !main || !mobileToggle || !closeButton || !desktopToggle) return () => {};

  const controller = new AbortController();
  const { signal } = controller;
  const media = window.matchMedia('(min-width: 768px)');
  const state = {
    collapsed: root.dataset.sidebarCollapsed === 'true',
    desktop: media.matches,
    mobileOpen: false,
  };
  let initialFrame = 0;
  let nextFrame = 0;

  function render(): void {
    const open = !state.desktop && state.mobileOpen;
    root.dataset.sidebarCollapsed = String(state.collapsed);
    root.dataset.mobileMenuOpen = String(open);
    sidebar!.inert = state.desktop ? state.collapsed : !open;
    main!.inert = open;
    mobileToggle!.setAttribute('aria-expanded', String(open));
    desktopToggle!.setAttribute('aria-expanded', String(!state.collapsed));
    desktopToggle!.setAttribute('aria-label', state.collapsed ? '展开侧边栏' : '收起侧边栏');
  }

  function setMobileOpen(open: boolean, restoreFocus = false): void {
    state.mobileOpen = !state.desktop && open;
    render();
    if (state.mobileOpen) closeButton!.focus({ preventScroll: true });
    else if (restoreFocus) mobileToggle!.focus({ preventScroll: true });
  }

  function renderInitialState(): void {
    cancelAnimationFrame(initialFrame);
    cancelAnimationFrame(nextFrame);
    root.setAttribute('data-sidebar-initializing', '');
    render();
    initialFrame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => root.removeAttribute('data-sidebar-initializing'));
    });
  }

  desktopToggle.addEventListener('click', () => {
    if (!state.desktop) return;
    state.collapsed = !state.collapsed;
    writeStorage('localStorage', 'sidebarCollapsed', String(state.collapsed));
    render();
  }, { signal });
  mobileToggle.addEventListener('click', () => setMobileOpen(!state.mobileOpen), { signal });
  closeButton.addEventListener('click', () => setMobileOpen(false, true), { signal });
  document.getElementById('sidebar-overlay')?.addEventListener('click', () => setMobileOpen(false, true), { signal });

  document.addEventListener('keydown', event => {
    if (!state.mobileOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setMobileOpen(false, true);
    } else if (event.key === 'Tab') {
      const controls = Array.from(sidebar.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if ((!event.shiftKey && document.activeElement === last) || !sidebar.contains(document.activeElement)) {
        event.preventDefault();
        first?.focus();
      }
    }
  }, { signal });

  media.addEventListener('change', () => {
    const focusWasInSidebar = sidebar.contains(document.activeElement);
    state.desktop = media.matches;
    state.mobileOpen = false;
    render();
    if (focusWasInSidebar && !state.desktop) mobileToggle.focus({ preventScroll: true });
    else if (focusWasInSidebar && state.collapsed) desktopToggle.focus({ preventScroll: true });
  }, { signal });

  window.addEventListener('storage', event => {
    try { if (event.storageArea !== window.localStorage) return; } catch { return; }
    if (event.key === 'sidebarCollapsed' || event.key === null) {
      state.collapsed = event.newValue === 'true';
      render();
    }
  }, { signal });

  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    state.collapsed = readStorage('localStorage', 'sidebarCollapsed') === 'true';
    state.desktop = media.matches;
    state.mobileOpen = false;
    renderInitialState();
  }, { signal });

  document.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement)) return;
    if (state.mobileOpen && sidebar.contains(link)) setMobileOpen(false, true);
    // Preserve fragment navigation, modified clicks, downloads and external links.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || link.target || link.hasAttribute('download')) return;
    if (link.href === window.location.href) event.preventDefault();
  }, { signal });

  const saveScroll = () => writeStorage('sessionStorage', 'sidebarScrollPos', String(sidebar.scrollTop));
  sidebar.addEventListener('scroll', saveScroll, { passive: true, signal });
  window.addEventListener('pagehide', saveScroll, { signal });

  renderInitialState();
  const savedScroll = Number(readStorage('sessionStorage', 'sidebarScrollPos'));
  if (Number.isFinite(savedScroll) && savedScroll > 0) sidebar.scrollTop = savedScroll;

  return () => {
    controller.abort();
    cancelAnimationFrame(initialFrame);
    cancelAnimationFrame(nextFrame);
    main.inert = false;
    sidebar.inert = false;
    root.dataset.mobileMenuOpen = 'false';
    root.removeAttribute('data-sidebar-initializing');
  };
}

const dispose = initializeSidebar();
if (import.meta.hot) import.meta.hot.dispose(dispose);
