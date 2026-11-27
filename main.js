'use strict';
/**
 * Claude Studio — Electron wrapper for https://claude.ai with an in-page mascot overlay.
 *
 * Ground rules (kept on purpose):
 *   - UI only: no cookie/token extraction, no auto-sending messages, no network interception.
 *   - The overlay runs in an isolated JS world: it shares the DOM with claude.ai but not its JS globals.
 */
const { app, BrowserWindow, Menu, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_NAME = 'Claude Studio';
const START_URL = 'https://claude.ai/';
const PARTITION = 'persist:claude';
const OVERLAY_WORLD_ID = 1001;
const OVERLAY_DIR = path.join(__dirname, 'overlay');
const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

/* ------------------------------------------------------------------ *
 * Flags / env (must be applied before app "ready")
 * ------------------------------------------------------------------ */
const argv = process.argv.slice(1);
const truthy = (v) => /^(1|true|yes|on)$/i.test(String(v || ''));
const flag = (name, env) => argv.includes(`--${name}`) || truthy(process.env[env]);

const opts = {
  x11: flag('studio-x11', 'CLAUDE_STUDIO_X11'),
  egl: flag('studio-egl', 'CLAUDE_STUDIO_EGL') || String(process.env.CLAUDE_STUDIO_GL || '').toLowerCase() === 'egl',
  noGpu: flag('studio-no-gpu', 'CLAUDE_STUDIO_NO_GPU'),
  noIme: flag('studio-no-ime', 'CLAUDE_STUDIO_NO_IME'),
  noSandbox: flag('studio-no-sandbox', 'CLAUDE_STUDIO_NO_SANDBOX'), // opt-in only, never default
  debug: flag('studio-debug', 'CLAUDE_STUDIO_DEBUG'),
};

const enableFeatures = [];
if (opts.x11) {
  app.commandLine.appendSwitch('ozone-platform', 'x11');
} else {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  enableFeatures.push('WaylandWindowDecorations');
  if (!opts.noIme) {
    // Vietnamese / CJK input via fcitx5 or ibus on KDE Wayland (text-input-v3).
    app.commandLine.appendSwitch('enable-wayland-ime');
    app.commandLine.appendSwitch('wayland-text-input-version', '3');
  }
}
if (enableFeatures.length) app.commandLine.appendSwitch('enable-features', enableFeatures.join(','));
// Developer only: expose Chrome DevTools Protocol on 127.0.0.1 to inspect claude.ai's DOM when updating selectors.
const devtoolsPort = (argv.find((a) => a.startsWith('--studio-devtools-port=')) || '').split('=')[1] || process.env.CLAUDE_STUDIO_DEVTOOLS_PORT;
if (devtoolsPort && /^\d{4,5}$/.test(devtoolsPort)) {
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
  app.commandLine.appendSwitch('remote-debugging-port', devtoolsPort);
  console.warn(`[studio] DevTools protocol open on 127.0.0.1:${devtoolsPort} (debug only)`);
}
if (opts.egl) app.commandLine.appendSwitch('use-gl', 'egl');
if (opts.noGpu) app.disableHardwareAcceleration();
if (opts.noSandbox) {
  console.warn('[studio] WARNING: sandbox disabled by --studio-no-sandbox / CLAUDE_STUDIO_NO_SANDBOX');
  app.commandLine.appendSwitch('no-sandbox');
}

/* ------------------------------------------------------------------ *
 * User agent: a plain Chrome UA (no "Electron/x" or app name)
 * ------------------------------------------------------------------ */
function buildUserAgent() {
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const base = [app.getName(), 'claude-studio', 'Claude Studio'];
  // Electron puts the product name in the UA with spaces removed ("ClaudeStudio/0.1.0").
  const names = new Set(base.flatMap((n) => [n, n.replace(/\s+/g, ''), n.replace(/\s+/g, '-')]));
  let ua = app.userAgentFallback || '';
  ua = ua.replace(/\s*Electron\/\S+/gi, '');
  for (const n of names) ua = ua.replace(new RegExp(`\\s*${escapeRe(n)}\\/\\S+`, 'gi'), '');
  ua = ua.replace(/\s{2,}/g, ' ').trim();
  if (!/Chrome\/\d+/.test(ua) || /Electron/i.test(ua)) {
    const major = String(process.versions.chrome || '130').split('.')[0];
    ua = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
  }
  return ua;
}
const USER_AGENT = buildUserAgent();
app.userAgentFallback = USER_AGENT;

/* ------------------------------------------------------------------ *
 * URL helpers
 * ------------------------------------------------------------------ */
const parse = (url) => { try { return new URL(url); } catch { return null; } };

function isClaudeUrl(url) {
  const u = parse(url);
  return !!u && u.protocol === 'https:' && (u.hostname === 'claude.ai' || u.hostname.endsWith('.claude.ai'));
}

// Hosts allowed to load inside the app window (login flows, Cloudflare checks).
const IN_APP_HOSTS = [
  /^(.+\.)?claude\.ai$/,
  /^(.+\.)?anthropic\.com$/,
  /^accounts\.google\.com$/,
  /^appleid\.apple\.com$/,
  /^(.+\.)?cloudflare\.com$/,
];
function isInAppUrl(url) {
  const u = parse(url);
  return !!u && u.protocol === 'https:' && IN_APP_HOSTS.some((re) => re.test(u.hostname));
}

function openExternalSafe(url) {
  const u = parse(url);
  if (u && ['https:', 'http:', 'mailto:'].includes(u.protocol)) shell.openExternal(url).catch(() => {});
}

/* ------------------------------------------------------------------ *
 * Overlay injection
 * ------------------------------------------------------------------ */
function readOverlay() {
  const read = (f) => fs.readFileSync(path.join(OVERLAY_DIR, f), 'utf8');
  let selectors = {};
  try {
    selectors = JSON.parse(read('selectors.json'));
  } catch (err) {
    console.warn('[studio] overlay/selectors.json unreadable, effort-sync disabled:', err.message);
  }
  return {
    css: read('bot.css') + '\n' + read('theme.css'),
    js: [read('bot.js'), read('theme.js'), read('effort-sync.js'), read('quick-chat.js')].join('\n;\n'),
    selectors,
  };
}

async function injectOverlay(wc, withCss) {
  if (wc.isDestroyed()) return;
  const url = wc.getURL();
  if (!isClaudeUrl(url) || url.includes('/cdn-cgi/')) return;
  try {
    // Files are re-read every time so edits to overlay/* (e.g. selectors.json) apply on reload (Ctrl+R).
    const o = readOverlay();
    if (withCss) await wc.insertCSS(o.css, { cssOrigin: 'author' });
    const code =
      `window.__CS_SELECTORS = ${JSON.stringify(o.selectors)};\n` +
      `${o.js}\n;true;`;
    await wc.executeJavaScriptInIsolatedWorld(OVERLAY_WORLD_ID, [{ code, url: 'claude-studio://overlay/bundle.js' }]);
  } catch (err) {
    console.error('[studio] overlay injection failed:', err && err.message ? err.message : err);
  }
}

function runInOverlay(wc, code) {
  if (!wc || wc.isDestroyed()) return Promise.resolve();
  return wc
    .executeJavaScriptInIsolatedWorld(OVERLAY_WORLD_ID, [{ code: `try { ${code} } catch (e) {}` }])
    .catch(() => {});
}

/* ------------------------------------------------------------------ *
 * Window state (size / maximized)
 * ------------------------------------------------------------------ */
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (s && s.width > 300 && s.height > 300) return s;
  } catch {}
  return { width: 1280, height: 860 };
}
function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch {}
}

/* ------------------------------------------------------------------ *
 * webContents wiring (main window + any allowed popups)
 * ------------------------------------------------------------------ */
const childWebPreferences = {
  partition: PARTITION,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: true,
};

function setupContents(wc) {
  wc.setUserAgent(USER_AGENT);

  wc.on('dom-ready', () => injectOverlay(wc, true));
  wc.on('did-navigate-in-page', (_e, _url, isMainFrame) => {
    if (isMainFrame) injectOverlay(wc, false);
  });

  wc.on('will-navigate', (e, url) => {
    if (!isInAppUrl(url)) {
      e.preventDefault();
      openExternalSafe(url);
    }
  });

  wc.setWindowOpenHandler(({ url }) => {
    if (isInAppUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1000,
          height: 760,
          autoHideMenuBar: true,
          icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
          webPreferences: childWebPreferences,
        },
      };
    }
    openExternalSafe(url);
    return { action: 'deny' };
  });
  wc.on('did-create-window', (child) => setupContents(child.webContents));

  wc.on('context-menu', (_e, p) => buildContextMenu(wc, p).popup());

  wc.on('console-message', (...args) => {
    let level, message, line, sourceId;
    const ev = args[0];
    if (ev && typeof ev.message === 'string') {
      ({ level, message, lineNumber: line, sourceId } = ev);
    } else {
      [, level, message, line, sourceId] = args;
    }
    const isError = level === 3 || level === 'error';
    const ours = /ClaudeStudio|claude-studio/.test(String(message)) || /claude-studio/.test(String(sourceId || ''));
    if (ours || (opts.debug && isError)) {
      console.log(`[renderer${isError ? ':error' : ''}] ${message}${sourceId ? ` (${sourceId}:${line})` : ''}`);
    }
  });

  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3) console.warn(`[studio] load failed ${code} ${desc} ${url}`);
  });
  wc.on('render-process-gone', (_e, d) => console.error('[studio] renderer gone:', d.reason));
}

function buildContextMenu(wc, p) {
  const t = [];
  if (p.misspelledWord && p.dictionarySuggestions.length) {
    for (const s of p.dictionarySuggestions.slice(0, 5)) {
      t.push({ label: s, click: () => wc.replaceMisspelling(s) });
    }
    t.push({ type: 'separator' });
  }
  if (p.linkURL) {
    t.push({ label: 'Mở liên kết trong trình duyệt', click: () => openExternalSafe(p.linkURL) });
    t.push({ label: 'Sao chép liên kết', click: () => clipboard.writeText(p.linkURL) });
    t.push({ type: 'separator' });
  }
  if (p.isEditable) {
    t.push({ role: 'undo', label: 'Hoàn tác' }, { role: 'redo', label: 'Làm lại' }, { type: 'separator' });
    t.push({ role: 'cut', label: 'Cắt' }, { role: 'copy', label: 'Sao chép' }, { role: 'paste', label: 'Dán' });
    t.push({ role: 'selectAll', label: 'Chọn tất cả' });
  } else if (p.selectionText) {
    t.push({ role: 'copy', label: 'Sao chép' });
  }
  if (opts.debug) {
    t.push({ type: 'separator' }, { label: 'Inspect', click: () => wc.inspectElement(p.x, p.y) });
  }
  if (!t.length) t.push({ role: 'reload', label: 'Tải lại' });
  return Menu.buildFromTemplate(t);
}

/* ------------------------------------------------------------------ *
 * App menu (hidden, Alt shows it; accelerators always work)
 * ------------------------------------------------------------------ */
function buildAppMenu(getWin) {
  const wc = () => getWin() && getWin().webContents;
  return Menu.buildFromTemplate([
    {
      label: 'Tệp',
      submenu: [
        {
          label: 'Mở liên kết claude.ai từ clipboard',
          accelerator: 'CmdOrCtrl+Alt+L',
          click: () => {
            const text = clipboard.readText().trim();
            if (isClaudeUrl(text) && wc()) wc().loadURL(text);
          },
        },
        { label: 'Về trang chủ claude.ai', accelerator: 'CmdOrCtrl+Shift+H', click: () => wc() && wc().loadURL(START_URL) },
        { type: 'separator' },
        { role: 'quit', label: 'Thoát' },
      ],
    },
    { role: 'editMenu', label: 'Sửa' },
    {
      label: 'Xem',
      submenu: [
        { role: 'reload', label: 'Tải lại' },
        { role: 'forceReload', label: 'Tải lại (bỏ cache)' },
        { role: 'toggleDevTools', label: 'DevTools' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Cỡ chữ mặc định' },
        { role: 'zoomIn', label: 'Phóng to' },
        { role: 'zoomOut', label: 'Thu nhỏ' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toàn màn hình' },
      ],
    },
    {
      label: 'Studio',
      submenu: [
        { label: 'Ẩn / hiện mascot', accelerator: 'CmdOrCtrl+Shift+M', click: () => runInOverlay(wc(), 'window.ClaudeStudio && window.ClaudeStudio.toggleHidden()') },
        { label: 'Thu gọn / mở rộng', accelerator: 'CmdOrCtrl+Shift+J', click: () => runInOverlay(wc(), 'window.ClaudeStudio && window.ClaudeStudio.toggleCollapsed()') },
        { label: 'Quick chat', accelerator: 'CmdOrCtrl+Shift+K', click: () => runInOverlay(wc(), 'window.ClaudeStudio && window.ClaudeStudio.toggleQuickChat && window.ClaudeStudio.toggleQuickChat()') },
        { label: 'Theme Starry Night (bật/tắt)', accelerator: 'CmdOrCtrl+Shift+T', click: () => runInOverlay(wc(), 'window.ClaudeStudio && window.ClaudeStudio.toggleTheme && window.ClaudeStudio.toggleTheme()') },
        { label: 'Đặt lại vị trí mascot', click: () => runInOverlay(wc(), 'window.ClaudeStudio && window.ClaudeStudio.resetPosition()') },
        { type: 'separator' },
        ...['low', 'medium', 'high', 'extra', 'max'].map((lvl, i) => ({
          label: `Effort: ${lvl[0].toUpperCase()}${lvl.slice(1)}`,
          accelerator: `CmdOrCtrl+Alt+${i + 1}`,
          click: () => runInOverlay(wc(), `window.ClaudeStudio && window.ClaudeStudio.setEffort(${JSON.stringify(lvl)})`),
        })),
      ],
    },
  ]);
}

/* ------------------------------------------------------------------ *
 * Main window
 * ------------------------------------------------------------------ */
let mainWindow = null;

function createMainWindow() {
  const st = loadWindowState();
  const win = new BrowserWindow({
    width: st.width,
    height: st.height,
    x: st.x,
    y: st.y,
    minWidth: 480,
    minHeight: 420,
    show: false,
    title: APP_NAME,
    backgroundColor: '#262624',
    autoHideMenuBar: true,
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  if (st.maximized) win.maximize();

  const ses = win.webContents.session;
  ses.setUserAgent(USER_AGENT);
  const allowedPermissions = new Set(['clipboard-read', 'clipboard-sanitized-write', 'notifications', 'media', 'fullscreen']);
  ses.setPermissionRequestHandler((_wc, permission, cb, details) => {
    cb(allowedPermissions.has(permission) && isClaudeUrl(details.requestingUrl || ''));
  });

  setupContents(win.webContents);

  let shown = false;
  const show = () => { if (!shown && !win.isDestroyed()) { shown = true; win.show(); } };
  win.once('ready-to-show', show);
  setTimeout(show, 4000); // never stay invisible if ready-to-show is late (slow Cloudflare check)

  let saveTimer = null;
  const queueSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveWindowState(win), 500); };
  win.on('resize', queueSave);
  win.on('move', queueSave);
  win.on('close', () => saveWindowState(win));
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });

  win.loadURL(START_URL);
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    console.log(`[studio] ${APP_NAME} ${app.getVersion()} | Electron ${process.versions.electron} | Chrome ${process.versions.chrome}`);
    console.log(`[studio] platform: ${opts.x11 ? 'x11 (forced)' : 'ozone auto'}${opts.egl ? ' | use-gl=egl' : ''}${opts.noGpu ? ' | GPU off' : ''} | session: ${process.env.XDG_SESSION_TYPE || '?'}`);
    if (opts.debug) console.log(`[studio] UA: ${USER_AGENT}`);

    Menu.setApplicationMenu(buildAppMenu(() => BrowserWindow.getFocusedWindow() || mainWindow));
    mainWindow = createMainWindow();

    app.on('activate', () => {
      if (!mainWindow) mainWindow = createMainWindow();
    });
  });

  app.on('before-quit', () => {
    // Make sure the login session is written to disk (persist:claude partition).
    try {
      const { session } = require('electron');
      session.fromPartition(PARTITION).cookies.flushStore().catch(() => {});
    } catch {}
  });

  app.on('window-all-closed', () => app.quit());
}
