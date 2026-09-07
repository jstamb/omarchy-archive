/**
 * Follow the machine's live Omarchy theme.
 *
 * A web page cannot read ~/.local/state on its own, and must not be able to.
 * What it can do, in Chromium-family browsers, is ask: the File System Access
 * API lets the user hand the page one directory, read-only, and remember that
 * grant. Nothing leaves the browser — the colours are parsed here and written
 * to localStorage like a catalog pick.
 *
 * The user points the picker at ~/.local/state/omarchy/current (the folder
 * Omarchy repoints on every `omarchy theme set`), or at its theme/ child.
 * While a tab is visible the file is re-read every few seconds, so a theme
 * change on the desktop reaches the page within one poll. Chromium keeps the
 * grant across sessions once the user ticks "allow on every visit"; a grant
 * that lapsed needs one click to come back, never a silent re-prompt.
 *
 * Firefox and Safari have no directory picker. The option simply is not
 * offered there.
 */
import { pixelsFor, tokensFor, toneOf } from '../lib/theme-tokens';
import type { ThemeColors } from '../lib/theme-tokens';
import type { StoredTheme } from './site-theme';

// The File System Access API is not in TypeScript's DOM lib yet.
type PermissionState = 'granted' | 'denied' | 'prompt';
interface FileHandle {
  kind: 'file';
  getFile(): Promise<File>;
}
interface DirHandle {
  kind: 'directory';
  name: string;
  getFileHandle(name: string): Promise<FileHandle>;
  getDirectoryHandle(name: string): Promise<DirHandle>;
  queryPermission(options: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' }): Promise<PermissionState>;
}
declare global {
  interface Window {
    showDirectoryPicker?: (options: { id?: string; mode?: 'read' }) => Promise<DirHandle>;
  }
}

export interface LocalThemeStatus {
  message: string;
  theme: StoredTheme | null;
}
type StatusListener = (status: LocalThemeStatus) => void;

const DB = 'omarchy-archive';
const STORE = 'handles';
const KEY = 'omarchy-current';
const POLL_MS = 4000;

let timer: number | null = null;
let lastText = '';

export const supportsLocalTheme = () => typeof window.showDirectoryPicker === 'function';

// ------------------------------------------------------------------ handle persistence

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHandle(handle: DirHandle | null): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    if (handle) tx.objectStore(STORE).put(handle, KEY);
    else tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandle(): Promise<DirHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve((request.result as DirHandle | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ reading the theme

/** The flat `key = "#hex"` layout every current Omarchy theme ships. */
export function parseColorsToml(text: string): { mode: 'dark' | 'light' | null; colors: ThemeColors } {
  const colors: ThemeColors = {};
  let mode: 'dark' | 'light' | null = null;
  for (const line of text.split('\n')) {
    const match = /^\s*([a-z_]+)\s*=\s*"([^"]*)"/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (key === 'mode') mode = value === 'light' ? 'light' : value === 'dark' ? 'dark' : null;
    else if (/^#[0-9a-fA-F]{6}$/.test(value)) colors[key] = value.toLowerCase();
  }
  return { mode, colors };
}

/**
 * Accepts `current/` (reads theme/colors.toml and theme.name) or `theme/`
 * itself (colors.toml only; the theme is named after the accent).
 */
async function readCurrent(dir: DirHandle): Promise<{ text: string; name: string | null }> {
  try {
    const themeDir = await dir.getDirectoryHandle('theme');
    const file = await (await themeDir.getFileHandle('colors.toml')).getFile();
    let name: string | null = null;
    try {
      name = (await (await (await dir.getFileHandle('theme.name')).getFile()).text()).trim() || null;
    } catch {
      name = null;
    }
    return { text: await file.text(), name };
  } catch {
    const file = await (await dir.getFileHandle('colors.toml')).getFile();
    return { text: await file.text(), name: null };
  }
}

function titleize(slug: string) {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function toStored(text: string, name: string | null): StoredTheme | null {
  const { mode, colors } = parseColorsToml(text);
  const tokens = tokensFor(colors, mode);
  if (!tokens) return null;
  const id = name ?? 'local';
  return {
    id,
    name: name ? titleize(name) : 'Your Omarchy theme',
    tone: toneOf(colors, mode),
    tokens,
    pixels: pixelsFor({ palette: Object.values(colors), colors }),
    source: 'local',
  };
}

// ------------------------------------------------------------------ polling

function stopPolling() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisible);
}

let pollHandle: DirHandle | null = null;
let pollListener: StatusListener | null = null;

async function poll(force = false) {
  if (!pollHandle || !pollListener || (document.hidden && !force)) return;
  try {
    const { text, name } = await readCurrent(pollHandle);
    if (text === lastText && !force) return;
    lastText = text;
    const theme = toStored(text, name);
    pollListener(
      theme
        ? { message: `Following your Omarchy theme: ${theme.name}.`, theme }
        : { message: 'colors.toml has no background colour; nothing to apply.', theme: null },
    );
  } catch {
    stopPolling();
    pollListener({ message: 'Lost access to the theme folder. Reconnect to keep following it.', theme: null });
  }
}

function onVisible() {
  if (!document.hidden) void poll(true);
}

function startPolling(handle: DirHandle, listener: StatusListener) {
  stopPolling();
  pollHandle = handle;
  pollListener = listener;
  lastText = '';
  void poll(true);
  timer = window.setInterval(() => void poll(), POLL_MS);
  document.addEventListener('visibilitychange', onVisible);
}

// ------------------------------------------------------------------ public API

/** Ask for the folder. Must run from a user gesture. */
export async function connectLocalTheme(listener: StatusListener): Promise<void> {
  if (!supportsLocalTheme()) {
    listener({ message: 'This browser cannot read local folders. Chromium, Chrome, Brave and Edge can.', theme: null });
    return;
  }
  let handle: DirHandle;
  try {
    handle = await window.showDirectoryPicker!({ id: 'omarchy-current', mode: 'read' });
  } catch {
    listener({ message: 'No folder chosen.', theme: null });
    return;
  }
  try {
    await readCurrent(handle);
  } catch {
    listener({
      message: `“${handle.name}” has no theme/colors.toml. Pick ~/.local/state/omarchy/current.`,
      theme: null,
    });
    return;
  }
  try {
    await saveHandle(handle);
  } catch {
    // Without IndexedDB the grant lasts one visit. Still worth following.
  }
  startPolling(handle, listener);
}

/**
 * Resume a saved grant. Reads straight away when the browser still allows
 * it; otherwise reports that a click is needed, and the picker's "follow"
 * button becomes that click.
 */
export async function resumeLocalTheme(listener: StatusListener): Promise<boolean> {
  const handle = await loadHandle();
  if (!handle) return false;
  let state: PermissionState;
  try {
    state = await handle.queryPermission({ mode: 'read' });
  } catch {
    return false;
  }
  if (state !== 'granted') {
    listener({
      message: 'Your Omarchy theme folder needs permission again — open the theme picker and choose “Follow my Omarchy theme”.',
      theme: null,
    });
    return false;
  }
  startPolling(handle, listener);
  return true;
}

/** Re-grant a lapsed permission from a gesture, without a new folder picker. */
export async function regrantLocalTheme(listener: StatusListener): Promise<boolean> {
  const handle = await loadHandle();
  if (!handle) return false;
  try {
    if ((await handle.requestPermission({ mode: 'read' })) !== 'granted') return false;
  } catch {
    return false;
  }
  startPolling(handle, listener);
  return true;
}

export function disconnectLocalTheme(): void {
  stopPolling();
  pollHandle = null;
  pollListener = null;
  void saveHandle(null).catch(() => undefined);
}
