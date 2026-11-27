/*
 * Claude Studio — mascot overlay.
 * Runs in an Electron isolated world on claude.ai (shares the DOM and localStorage, not page JS).
 * Injected again after every load / SPA navigation, so everything here is idempotent.
 */
(() => {
  'use strict';

  const LEVELS = ['low', 'medium', 'high', 'extra', 'max'];
  const LABELS = { low: 'Low', medium: 'Med', high: 'High', extra: 'Extra', max: 'Max' };
  const LINES = {
    low: ['Chill mode~', 'Eco mode on', 'Zzz… ready'],
    medium: ['Ready!', 'Focus on!', 'Let’s go'],
    high: ['Power up! ⚡', 'Charging…', 'Getting serious'],
    extra: ['Going beyond!', 'Overdrive ⚡⚡', 'Almost there…'],
    max: ['MAXIMUM POWER!!', 'FULL POWER!!', 'LIMIT BREAK!'],
  };
  const KEY = (k) => `claudeStudio.${k}`;
  const DEFAULT_POS = { x: 24, y: 150 }; // distance from the right / bottom edges (px)

  const store = {
    get(k, fallback) {
      try {
        const v = localStorage.getItem(KEY(k));
        return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(k, v) {
      try { localStorage.setItem(KEY(k), JSON.stringify(v)); } catch {}
    },
    del(k) {
      try { localStorage.removeItem(KEY(k)); } catch {}
    },
  };

  // Re-injection after SPA navigation: if our root is still mounted, nothing to do.
  const existing = window.ClaudeStudio;
  if (existing && existing.root) {
    if (!existing.root.isConnected) document.body.appendChild(existing.root);
    existing.refresh && existing.refresh();
    return;
  }
  const stale = document.getElementById('cs-root');
  if (stale) stale.remove();

  /* ---------------------------------------------------------------- *
   * Pixel-art markup (static, no user data). 1 SVG unit = 1 pixel = 4 CSS px.
   * Body: the classic orange Claude bot. Hair / aura / bolts / sparks appear per effort level.
   * ---------------------------------------------------------------- */
  // Pixel map (rows of chars, '.' = empty) → merged <rect>s with class "px-<char>".
  function px(rows, ox = 0, oy = 0) {
    let out = '';
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') { x++; continue; }
        let w = 1;
        while (row[x + w] === ch) w++;
        out += `<rect x="${ox + x}" y="${oy + y}" width="${w}" height="1" class="px-${ch}"/>`;
        x += w;
      }
    });
    return out;
  }
  // Pixel ellipse (stacked rows) for blocky glows.
  function pxBlob(cx, cy, rx, ry, cls) {
    let out = '';
    for (let y = -ry; y <= ry; y++) {
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / (ry + 0.5)) ** 2)));
      if (half > 0) out += `<rect x="${cx - half}" y="${cy + y}" width="${half * 2}" height="1" class="${cls}"/>`;
    }
    return out;
  }

  // Pixel outline around a map: every empty cell touching a filled one becomes `ch` (drawn at ox-1, oy-1).
  function outline(rows, ch = 'O') {
    const H = rows.length, W = Math.max(...rows.map((r) => r.length));
    const filled = (x, y) => y >= 0 && y < H && x >= 0 && x < W && rows[y][x] && rows[y][x] !== '.';
    const out = [];
    for (let y = -1; y <= H; y++) {
      let row = '';
      for (let x = -1; x <= W; x++) {
        const near = filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1);
        row += !filled(x, y) && near ? ch : '.';
      }
      out.push(row);
    }
    return out;
  }

  // Body 22×15: H = highlight, B = body, S = shade (arms on rows 6–8, four little legs).
  const BODY = [
    '...HHHHHHHHHHHHHHHH...',
    '...HBBBBBBBBBBBBBBS...',
    '...HBBBBBBBBBBBBBBS...',
    '...HBBBBBBBBBBBBBBS...',
    '...HBBBBBBBBBBBBBBS...',
    '...HBBBBBBBBBBBBBBS...',
    'HHHHBBBBBBBBBBBBBBSBBS',
    'BBBBBBBBBBBBBBBBBBSBBS',
    'SSSHBBBBBBBBBBBBBBSSSS',
    '...HBBBBBBBBBBBBBBS...',
    '...HBBBBBBBBBBBBBBS...',
    '...SSSSSSSSSSSSSSSS...',
    '....B.B.......B.B.....',
    '....B.B.......B.B.....',
    '....S.S.......S.S.....',
  ];
  // Super-warrior hair (Y gold, L light, D dark). Small for High, big for Extra / Max.
  const HAIR_S = [
    '.......Y.Y..........',
    '..Y....YYY.....Y....',
    '..YY..YYLYY...YY....',
    '...YYYYYLYYYYYY.....',
    'Y..YYLYYLYYLYYY..Y..',
    'YYYYYLYYYYYLYYYYYY..',
    '.YYYYYYYYYYYYYYYYYY.',
    '.YDYYYDYYYYDYYYDYY..',
    '..D..D...DD...D.....',
  ];
  const HAIR_B = [
    '...........Y............',
    '..........YY............',
    '..Y.......YLY.......Y...',
    '..YY.....YYLY......YY...',
    '...YY...YYLLYY....YY....',
    'Y...YY..YLLYYY..YYY....Y',
    'YY..YYYYYLYYLYYYYY....YY',
    '.YYYYYLYYLYYYLYYYYYYYYY.',
    '..YYYYLYYYYYYYLYYYYYYY..',
    'Y.YYYYYYYYYYYYYYYYYYYY.Y',
    'YYYYYYYYYYYYYYYYYYYYYYYY',
    '.YYDYYYYDYYYYYDYYYYDYYY.',
    '..D..YD..YD..DY..DY..D..',
  ];
  const BOLT_MAP = ['...CC', '..CC.', '.CWC.', 'CCWCC', '..CC.', '.CC..', '.C...', 'C....'];

  // Pixel flame aura frames (3 frames, flip-book). Ground at y = 13 (the bot's feet).
  function flameFrame(seed) {
    let o = '';
    const cx = 10.5, ground = 15;
    for (let x = -13; x <= 34; x++) {
      const dx = Math.abs(x - cx);
      let h = 36 - dx * dx * 0.05 + (Math.random() * 4 - 2);
      if ((x + seed) % 3 === 0) h += 4 + Math.random() * 6; // jagged spikes
      h = Math.round(h);
      if (h < 2) continue;
      const hm = Math.round(h * 0.72 + Math.random() * 2 - 1);
      const hi = dx < 10 ? Math.round(h * 0.45 + Math.random() * 2) : 0;
      o += `<rect x="${x}" y="${ground - h - 1}" width="1" height="${h + 1}" class="px-E"/>`;
      o += `<rect x="${x}" y="${ground - h}" width="1" height="${h}" class="px-F"/>`;
      if (hm > 1) o += `<rect x="${x}" y="${ground - hm}" width="1" height="${hm}" class="px-G"/>`;
      if (hi > 1) o += `<rect x="${x}" y="${ground - hi}" width="1" height="${hi}" class="px-I"/>`;
    }
    return o;
  }
  // Medium: marching pixel ring around the bot (3 frames).
  function ringFrame(phase) {
    let o = '';
    const x0 = -3, x1 = 24, y0 = -4, y1 = 16;
    const pts = [];
    for (let x = x0 + 2; x <= x1 - 2; x++) pts.push([x, y0], [x, y1]);
    for (let y = y0 + 2; y <= y1 - 2; y++) pts.push([x0, y], [x1, y]);
    pts.push([x0 + 1, y0 + 1], [x1 - 1, y0 + 1], [x0 + 1, y1 - 1], [x1 - 1, y1 - 1]);
    for (const [x, y] of pts) {
      if ((x + y + phase) % 3 !== 0) o += `<rect x="${x}" y="${y}" width="1" height="1" class="px-C"/>`;
    }
    return o;
  }

  const AURA_SVG = `
<svg class="cs-aura" viewBox="-14 -36 50 53" shape-rendering="crispEdges" aria-hidden="true" focusable="false">
  <g class="cs-glow">${pxBlob(10.5, 2, 17, 14, 'px-Q')}${pxBlob(10.5, 3, 12, 10, 'px-Q')}${pxBlob(10.5, 4, 8, 7, 'px-Q')}</g>
  <g class="cs-flames"><g class="cs-fr f0">${flameFrame(0)}</g><g class="cs-fr f1">${flameFrame(1)}</g><g class="cs-fr f2">${flameFrame(2)}</g></g>
  <g class="cs-ring"><g class="cs-fr f0">${ringFrame(0)}</g><g class="cs-fr f1">${ringFrame(1)}</g><g class="cs-fr f2">${ringFrame(2)}</g></g>
  <g class="cs-ground">${px(['......LLLLLLLLLLLLLL......', '..LLLLLLLLLLLLLLLLLLLLLL..', '......LLLLLLLLLLLLLL......'], -2, 14)}</g>
</svg>`;

  const BOT_SVG = `
<svg class="cs-bot" viewBox="-2 -12 26 27" shape-rendering="crispEdges" aria-hidden="true" focusable="false">
  <g class="cs-outline">${px(outline(BODY), -1, -1)}</g>
  <g class="cs-body">${px(BODY)}</g>
  <g class="cs-hair cs-hair-s">${px(outline(HAIR_S), 0, -9)}${px(HAIR_S, 1, -8)}</g>
  <g class="cs-hair cs-hair-b"><g class="cs-hair-in">${px(outline(HAIR_B), -2, -13)}${px(HAIR_B, -1, -12)}</g></g>
  <g class="cs-eyes-n"><rect x="7" y="3" width="1" height="2" class="px-K cs-eye"/><rect x="14" y="3" width="1" height="2" class="px-K cs-eye"/></g>
  <g class="cs-eyes-a"><g class="cs-eye">${px(['WW', '.WW'], 6, 3)}</g><g class="cs-eye">${px(['.WW', 'WW'], 13, 3)}</g></g>
</svg>`;

  const MINI_SVG = `
<svg class="cs-bot cs-bot-mini" viewBox="0 0 22 12" shape-rendering="crispEdges" aria-hidden="true" focusable="false">
  ${px(BODY.slice(0, 12))}
  <rect x="7" y="3" width="1" height="2" class="px-K cs-eye"/><rect x="14" y="3" width="1" height="2" class="px-K cs-eye"/>
</svg>`;

  const BOLT = `<svg viewBox="0 0 5 8" shape-rendering="crispEdges" aria-hidden="true">${px(BOLT_MAP)}</svg>`;

  const HTML = `
<div class="cs-stack">
  <div class="cs-stage" title="Kéo để di chuyển · bấm để chào">
    <div class="cs-say" aria-live="polite"></div>
    <div class="cs-scale">
      <div class="cs-shake">
        ${AURA_SVG}
        <div class="cs-particles"></div>
        <div class="cs-float">
          <div class="cs-morph">
            ${BOT_SVG}
            <div class="cs-bolt b1">${BOLT}</div>
            <div class="cs-bolt b2">${BOLT}</div>
            <div class="cs-bolt b3">${BOLT}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="cs-smoke"></div>
  </div>
  <div class="cs-panel" role="group" aria-label="Effort">
    ${LEVELS.map((l) => `<button type="button" class="cs-lvl" data-level="${l}" aria-pressed="false" title="Effort: ${l}">${LABELS[l]}</button>`).join('')}
    <button type="button" class="cs-icon cs-theme" title="Bật/tắt theme Starry Night (Ctrl+Shift+T)">✦</button>
    <button type="button" class="cs-icon cs-sync" title="Tự đồng bộ effort với claude.ai" aria-pressed="true">⟳</button>
    <button type="button" class="cs-icon cs-collapse" title="Thu gọn (Ctrl+Shift+J)">–</button>
  </div>
</div>
<button type="button" class="cs-mini" title="Mở Claude Studio mascot">${MINI_SVG}</button>`;

  function setHTML(el, html) {
    try {
      el.innerHTML = html;
    } catch (err) {
      // Trusted Types fallback (normally not enforced in isolated worlds).
      const tt = window.trustedTypes;
      const policy = tt && tt.createPolicy('claude-studio-overlay', { createHTML: (s) => s });
      if (!policy) throw err;
      el.innerHTML = policy.createHTML(html);
    }
  }

  const root = document.createElement('div');
  root.id = 'cs-root';
  root.setAttribute('data-effort', 'low');
  setHTML(root, HTML);

  const $ = (sel) => root.querySelector(sel);
  const stage = $('.cs-stage');
  const say = $('.cs-say');
  const mini = $('.cs-mini');
  const syncBtn = $('.cs-sync');

  // Pixel dust clouds that burst out sideways from the feet when the form changes.
  function puffSvg(r) {
    const vb = `${-r - 1} ${-r - 2} ${2 * r + 2} ${2 * r + 3}`;
    return `<svg viewBox="${vb}" shape-rendering="crispEdges" aria-hidden="true">` +
      pxBlob(0, 0, r, r, 'sm-d') +                       // grey underside
      pxBlob(0, -1, r - 1, r - 1, 'sm-m') +              // light body
      pxBlob(-1, -2, Math.max(1, r - 3), Math.max(1, r - 3), 'sm-l') + // white highlight
      '</svg>';
  }
  const smoke = $('.cs-smoke');
  const PUFFS = [
    { r: 3, tx: 52, ty: -2, s: 1.0, delay: 0 },
    { r: 4, tx: 72, ty: -4, s: 1.1, delay: 0.04 },
    { r: 5, tx: 96, ty: -6, s: 1.15, delay: 0.07 },
    { r: 6, tx: 124, ty: -4, s: 1.2, delay: 0.1 },
    { r: 5, tx: 150, ty: -10, s: 1.1, delay: 0.13 },
    { r: 3, tx: 108, ty: -26, s: 1.0, delay: 0.12 },
  ];
  for (const side of [-1, 1]) {
    for (const p of PUFFS) {
      const el = document.createElement('div');
      el.className = 'cs-puff';
      setHTML(el, puffSvg(p.r));
      const size = (2 * p.r + 2) * 4;
      el.style.width = `${size}px`;
      el.style.height = `${size + 4}px`;
      el.style.marginLeft = `${-size / 2}px`;
      el.style.setProperty('--tx', `${side * p.tx}px`);
      el.style.setProperty('--ty', `${p.ty}px`);
      el.style.setProperty('--s', String(p.s));
      el.style.setProperty('--delay', `${p.delay}s`);
      el.style.setProperty('--flip', String(side));
      smoke.appendChild(el);
    }
  }

  // Square pixel sparks (Extra / Max), geometry via CSSOM.
  const particles = $('.cs-particles');
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('span');
    p.className = 'cs-p' + (i % 3 === 0 ? ' cs-p-w' : '');
    const d = 1.2 + Math.random() * 1.2;
    p.style.setProperty('--x', `${(Math.round(Math.random() * 24) * 4 - 4)}px`);
    p.style.setProperty('--s', `${i % 4 === 0 ? 8 : 4}px`);
    p.style.setProperty('--d', `${d.toFixed(2)}s`);
    p.style.setProperty('--delay', `${(-Math.random() * d).toFixed(2)}s`);
    p.style.setProperty('--drift', `${(Math.round(Math.random() * 6) - 3) * 4}px`);
    particles.appendChild(p);
  }

  /* ---------------------------------------------------------------- *
   * State
   * ---------------------------------------------------------------- */
  const state = {
    effort: LEVELS.includes(store.get('effort')) ? store.get('effort') : 'low',
    pos: sanitizePos(store.get('pos', DEFAULT_POS)),
    collapsed: !!store.get('collapsed', false),
    sync: store.get('sync', true) !== false,
    hidden: false,
    lift: 0, // temporary upward shift to keep clear of the chat input (not saved)
  };

  function sanitizePos(p) {
    const ok = p && Number.isFinite(p.x) && Number.isFinite(p.y);
    return ok ? { x: p.x, y: p.y } : { ...DEFAULT_POS };
  }

  function applyPos() {
    root.style.transform = `translate(${-state.pos.x}px, ${-(state.pos.y + state.lift)}px)`;
  }

  function clampPos() {
    const r = root.getBoundingClientRect();
    const w = r.width || 200;
    const h = r.height || 160;
    state.pos.x = Math.min(Math.max(0, state.pos.x), Math.max(0, window.innerWidth - w));
    state.pos.y = Math.min(Math.max(0, state.pos.y), Math.max(0, window.innerHeight - h));
  }

  /* ---------------------------------------------------------------- *
   * Effort
   * ---------------------------------------------------------------- */
  let morphTimer = 0;
  function setEffort(level, opts = {}) {
    if (!LEVELS.includes(level)) return;
    const prev = state.effort;
    state.effort = level;
    store.set('effort', level);
    root.setAttribute('data-effort', level);
    root.querySelectorAll('.cs-lvl').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === level)));
    // Manual picks (panel, shortcuts) are pushed to claude.ai's own Effort menu; sync-driven ones are not.
    if (!opts.silent && opts.source !== 'sync' && api.applyToPage) api.applyToPage(level);
    if (prev !== level && !opts.silent) {
      root.classList.remove('cs-morphing');
      void root.offsetWidth; // restart the transform animation
      root.classList.add('cs-morphing');
      clearTimeout(morphTimer);
      morphTimer = setTimeout(() => root.classList.remove('cs-morphing'), 1250);
      if (!opts.quiet) speak(pick(LINES[level]));
    }
  }

  /* ---------------------------------------------------------------- *
   * Speech bubble
   * ---------------------------------------------------------------- */
  let sayTimer = 0;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function speak(text, ms = 1500) {
    say.textContent = text;
    say.classList.add('cs-show');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => say.classList.remove('cs-show'), ms);
  }

  /* ---------------------------------------------------------------- *
   * Blink
   * ---------------------------------------------------------------- */
  let blinkTimer = 0;
  function blinkOnce(ms = 130) {
    root.classList.add('cs-blink');
    setTimeout(() => root.classList.remove('cs-blink'), ms);
  }
  function scheduleBlink() {
    blinkTimer = setTimeout(() => {
      if (!document.hidden && root.isConnected) {
        blinkOnce();
        if (Math.random() < 0.25) setTimeout(() => blinkOnce(110), 280); // occasional double blink
      }
      scheduleBlink();
    }, 2200 + Math.random() * 4200);
  }

  /* ---------------------------------------------------------------- *
   * Collapse / hide
   * ---------------------------------------------------------------- */
  function setCollapsed(v) {
    state.collapsed = !!v;
    store.set('collapsed', state.collapsed);
    root.classList.toggle('cs-collapsed', state.collapsed);
    requestAnimationFrame(() => { clampPos(); avoidInput(true); });
  }
  function setHidden(v) {
    state.hidden = !!v;
    root.hidden = state.hidden;
  }

  /* ---------------------------------------------------------------- *
   * Sync toggle (effort-sync.js reads isSyncEnabled / writes setSyncStatus)
   * ---------------------------------------------------------------- */
  function setSync(v) {
    state.sync = !!v;
    store.set('sync', state.sync);
    syncBtn.setAttribute('aria-pressed', String(state.sync));
    if (state.sync && api.resyncNow) api.resyncNow();
  }
  function setSyncStatus(status) {
    syncBtn.dataset.status = status; // 'found' | 'none'
    syncBtn.title = status === 'found'
      ? 'Đồng bộ effort: đã nhận diện selector của claude.ai'
      : 'Đồng bộ effort: chưa tìm thấy selector — dùng chọn tay (sửa overlay/selectors.json)';
  }

  /* ---------------------------------------------------------------- *
   * Keep clear of the chat input
   * ---------------------------------------------------------------- */
  const cfg = window.__CS_SELECTORS || {};
  function findChatInput() {
    for (const sel of cfg.chatInput || []) {
      let el = null;
      try { el = document.querySelector(sel); } catch { continue; }
      if (el && !root.contains(el)) return el.closest('fieldset') || el.closest('form') || el;
    }
    return null;
  }
  function avoidInput(force) {
    if (dragging || state.hidden || !root.isConnected) return;
    let lift = 0;
    const input = findChatInput();
    if (input) {
      const ir = input.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      // Root rect as if it were not lifted.
      const top = rr.top + state.lift;
      const bottom = rr.bottom + state.lift;
      const overlapX = rr.left < ir.right && rr.right > ir.left;
      const overlapY = top < ir.bottom && bottom > ir.top;
      if (ir.width > 0 && overlapX && overlapY) {
        lift = Math.max(0, bottom - ir.top + 12);
        if (top - lift < 0) lift = Math.max(0, top - 4); // never push off-screen
      }
    }
    if (force || Math.abs(lift - state.lift) > 1) {
      state.lift = lift;
      applyPos();
    }
  }

  /* ---------------------------------------------------------------- *
   * Drag (pointer events, transform-only positioning)
   * ---------------------------------------------------------------- */
  let dragging = false;
  function makeDraggable(handle, onClick) {
    let start = null;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      start = { px: e.clientX, py: e.clientY, x: state.pos.x, y: state.pos.y + state.lift, moved: false };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.px;
      const dy = e.clientY - start.py;
      if (!start.moved && Math.hypot(dx, dy) < 5) return;
      if (!start.moved) {
        start.moved = true;
        dragging = true;
        state.lift = 0;
        root.classList.add('cs-dragging');
      }
      state.pos.x = start.x - dx;
      state.pos.y = start.y - dy;
      clampPos();
      applyPos();
    });
    const end = (e) => {
      if (!start) return;
      const wasDrag = start.moved;
      start = null;
      try { handle.releasePointerCapture(e.pointerId); } catch {}
      if (wasDrag) {
        dragging = false;
        root.classList.remove('cs-dragging');
        store.set('pos', state.pos);
        avoidInput(true);
      } else if (e.type === 'pointerup') {
        onClick();
      }
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  makeDraggable(stage, () => {
    root.classList.remove('cs-poke');
    void root.offsetWidth;
    root.classList.add('cs-poke');
    setTimeout(() => root.classList.remove('cs-poke'), 600);
    blinkOnce(180);
    speak(pick(['Hi! 👋', 'Beep boop!', `Effort: ${LABELS[state.effort]}`, '(◕‿◕)']), 1200);
  });
  makeDraggable(mini, () => setCollapsed(false));

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !root.contains(b)) return;
    if (b.classList.contains('cs-lvl')) setEffort(b.dataset.level, { source: 'manual' });
    else if (b.classList.contains('cs-collapse')) setCollapsed(true);
    else if (b.classList.contains('cs-sync')) setSync(!state.sync);
    else if (b.classList.contains('cs-theme') && api.toggleTheme) api.toggleTheme();
  });

  /* ---------------------------------------------------------------- *
   * Lifecycle
   * ---------------------------------------------------------------- */
  const onResize = () => { clampPos(); avoidInput(true); };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', () => root.classList.toggle('cs-paused', document.hidden));
  const watchdog = setInterval(() => {
    if (!root.isConnected && document.body) document.body.appendChild(root); // React re-render safety
    avoidInput(false);
  }, 1000);

  const api = {
    version: '0.1.0',
    root,
    levels: LEVELS.slice(),
    getEffort: () => state.effort,
    setEffort,
    isSyncEnabled: () => state.sync,
    setSync,
    setSyncStatus,
    speak,
    toggleHidden: () => setHidden(!state.hidden),
    toggleCollapsed: () => setCollapsed(!state.collapsed),
    resetPosition: () => { state.pos = { ...DEFAULT_POS }; store.del('pos'); clampPos(); avoidInput(true); },
    refresh: () => { clampPos(); avoidInput(true); },
    destroy: () => {
      clearInterval(watchdog);
      clearTimeout(blinkTimer);
      window.removeEventListener('resize', onResize);
      root.remove();
      delete window.ClaudeStudio;
    },
  };
  window.ClaudeStudio = api;

  document.body.appendChild(root);
  setEffort(state.effort, { silent: true });
  setSync(state.sync);
  setSyncStatus('none');
  root.classList.toggle('cs-collapsed', state.collapsed);
  applyPos();
  requestAnimationFrame(() => { clampPos(); avoidInput(true); });
  scheduleBlink();
  console.info(`[ClaudeStudio] mascot ready (effort: ${state.effort})`);
})();
