/*
 * Claude Studio — effort sync (both directions).
 *
 *  claude.ai → mascot : a MutationObserver reads the model/effort button and mirrors it on the mascot.
 *  mascot → claude.ai : when YOU pick a level on the mascot, it opens claude.ai's own model menu → Effort
 *                       submenu and clicks the matching option (menus are hidden while this happens).
 *
 * Only claude.ai's effort setting is touched: nothing is typed or sent, no network access.
 * Selectors / labels live in overlay/selectors.json. Every failure is silent (the mascot still changes).
 */
(() => {
  'use strict';
  const CS = window.ClaudeStudio;
  if (!CS || CS.__syncStarted) return;
  CS.__syncStarted = true;

  const cfg = window.__CS_SELECTORS || {};
  const ORDER = ['max', 'extra', 'high', 'medium', 'low']; // most specific first
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reCache = new Map();

  const kwRegex = (kw) => {
    if (!reCache.has(kw)) {
      const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      reCache.set(kw, new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, 'iu'));
    }
    return reCache.get(kw);
  };

  function matchLevel(text, keywords) {
    if (!text || !keywords) return null;
    for (const lvl of ORDER) {
      for (const kw of keywords[lvl] || []) {
        if (kwRegex(kw).test(text)) return lvl;
      }
    }
    return null;
  }

  function textOf(el) {
    return [el.getAttribute('aria-label'), el.getAttribute('data-value'), el.textContent]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .slice(0, 200);
  }

  function queryAll(selectors) {
    const out = [];
    for (const sel of selectors || []) {
      try { out.push(...document.querySelectorAll(sel)); } catch { /* invalid selector: skip */ }
    }
    return out.filter((el) => !CS.root.contains(el));
  }

  function scan(selectors, keywords) {
    for (const sel of selectors || []) {
      for (const el of queryAll([sel])) {
        const lvl = matchLevel(textOf(el), keywords);
        if (lvl) return { level: lvl, selector: sel };
      }
    }
    return null;
  }

  function detect() {
    const hit = scan(cfg.effortSelectors, cfg.effortKeywords);
    if (hit) return { ...hit, via: 'effort' };
    const m = cfg.modelSync;
    if (m && m.enabled !== false) {
      const mh = scan(m.selectors, m.keywords);
      if (mh) return { ...mh, via: 'model' };
    }
    return null;
  }

  /* ---------------------------------------------------------------- *
   * claude.ai → mascot
   * ---------------------------------------------------------------- */
  let lastDetected = null;
  let timer = 0;
  let applying = false;

  function run() {
    timer = 0;
    if (applying) return;
    try {
      const hit = detect();
      CS.setSyncStatus(hit ? 'found' : 'none');
      if (!hit || !CS.isSyncEnabled()) return;
      // Only react when claude.ai's own value changes, so a manual pick on the mascot is respected.
      if (hit.level !== lastDetected) {
        lastDetected = hit.level;
        if (CS.getEffort() !== hit.level) {
          console.info(`[ClaudeStudio] effort-sync → ${hit.level} (via ${hit.via}: ${hit.selector})`);
          CS.setEffort(hit.level, { source: 'sync' });
        }
      }
    } catch {
      /* fail silently: manual selector keeps working */
    }
  }

  const schedule = () => { if (!timer) timer = setTimeout(run, 700); };

  /* ---------------------------------------------------------------- *
   * mascot → claude.ai
   * ---------------------------------------------------------------- */
  const ap = cfg.effortApply || {};
  const CLICK = ['pointerover', 'pointerenter', 'pointermove', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
  const HOVER = ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove'];

  function fire(el, types) {
    const r = el.getBoundingClientRect();
    const init = {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: r.left + Math.min(24, r.width / 2), clientY: r.top + r.height / 2,
      button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true,
    };
    for (const t of types) {
      const Ctor = t.startsWith('pointer') ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(t, { ...init, buttons: /up|click/.test(t) ? 0 : init.buttons }));
    }
  }

  // Base UI keeps closed menus in the DOM for their exit animation; ignore those.
  const openMenus = () =>
    [...document.querySelectorAll(ap.menu || '[role="menu"]')].filter(
      (m) => !m.hasAttribute('data-closed') && !m.hasAttribute('data-ending-style') && !CS.root.contains(m),
    );

  async function waitFor(fn, ms = 1500) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = fn();
      if (v) return v;
      await sleep(40);
    }
    return null;
  }

  function closeMenus() {
    for (const m of openMenus().reverse()) {
      m.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
    }
  }

  const firstWord = (el) => ((el.innerText || el.textContent || '').trim().split(/\s+/)[0] || '').toLowerCase();

  function levelOfOption(el) {
    const w = firstWord(el);
    for (const lvl of ORDER) {
      if ((ap.levelText && ap.levelText[lvl] || [lvl]).some((t) => t.toLowerCase() === w)) return lvl;
    }
    return null;
  }

  async function applyOnce(level) {
    const trigger = queryAll(ap.trigger)[0];
    if (!trigger) return 'no-trigger';
    if (matchLevel(textOf(trigger), cfg.effortKeywords) === level) return 'already';

    const html = document.documentElement;
    html.setAttribute('data-cs-applying', '');
    applying = true;
    try {
      if (!openMenus().length) fire(trigger, CLICK);
      const itemSel = ap.effortItem || '[role="menuitem"][aria-haspopup="menu"]';
      const effItem = await waitFor(() =>
        openMenus()
          .flatMap((m) => [...m.querySelectorAll(itemSel)])
          .find((e) => (ap.effortItemText || ['effort']).some((t) => firstWord(e) === t.toLowerCase())),
      );
      if (!effItem) { closeMenus(); return 'no-effort-menu'; }

      fire(effItem, HOVER);
      await sleep(60);
      if (effItem.getAttribute('aria-expanded') !== 'true') fire(effItem, CLICK);

      const optSel = ap.option || '[role="menuitemradio"]';
      const option = await waitFor(() => {
        const sub = openMenus().find((m) => m.id && m.id === effItem.getAttribute('aria-controls')) || openMenus().slice(-1)[0];
        return sub && [...sub.querySelectorAll(optSel)].find((o) => levelOfOption(o) === level);
      });
      if (!option) { closeMenus(); return 'no-level'; }

      if (option.getAttribute('aria-checked') !== 'true') fire(option, CLICK);
      await sleep(150);
      if (openMenus().length) closeMenus();

      const ok = await waitFor(() => matchLevel(textOf(trigger), cfg.effortKeywords) === level, 1200);
      return ok ? 'ok' : 'unconfirmed';
    } finally {
      lastDetected = level; // claude.ai now reports this level; don't bounce back
      setTimeout(() => {
        html.removeAttribute('data-cs-applying');
        applying = false;
      }, 250);
    }
  }

  let wanted = null;
  let busy = false;
  CS.applyToPage = async (level) => {
    if (ap.enabled === false) return;
    wanted = level;
    if (busy) return;
    busy = true;
    try {
      while (wanted) {
        const lvl = wanted;
        wanted = null;
        let result;
        try { result = await applyOnce(lvl); } catch (e) { result = 'error: ' + (e && e.message); }
        console.info(`[ClaudeStudio] effort-apply ${lvl}: ${result}`);
        if (result === 'no-effort-menu') CS.speak && CS.speak('Model này không có Effort', 1800);
        else if (result === 'no-level') CS.speak && CS.speak(`claude.ai không có mức ${lvl}`, 1800);
        else if (result === 'no-trigger' || result.startsWith('error')) CS.speak && CS.speak('Chưa đổi được effort', 1500);
        else if (lvl === 'max' && result === 'ok') CS.speak && CS.speak('MAX! (≈5× usage)', 1800);
      }
    } finally {
      busy = false;
    }
  };

  /* ---------------------------------------------------------------- */
  try {
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        if (!CS.root.contains(r.target)) { schedule(); return; }
      }
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'aria-checked', 'aria-selected', 'data-state', 'data-value'],
    });
    CS.__syncObserver = mo;
  } catch {
    return;
  }

  CS.resyncNow = () => { lastDetected = null; run(); };
  run();
})();
