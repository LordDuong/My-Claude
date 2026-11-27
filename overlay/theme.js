/*
 * Claude Studio — "Starry Night" theme.
 * A procedurally painted homage to Van Gogh's The Starry Night (1889, public domain):
 *   - static layer: thousands of brush strokes on a <canvas>, following a flow field around the swirls
 *   - animated layers: rotating swirls, flowing wind bands (SVG dashes), pulsing stars + moon with
 *     brush-ring halos, a swaying cypress, flickering village windows.
 * claude.ai's panels become frosted glass on top (overlay/theme.css).
 * Toggle: ✦ on the mascot panel, Ctrl+Shift+T, or menu Studio → Theme. Saved in localStorage.
 */
(() => {
  'use strict';
  const CS = window.ClaudeStudio;
  if (!CS) return;
  const html = document.documentElement;
  const KEY = 'claudeStudio.theme';
  const THEMES = ['starry', 'off'];
  const SVGNS = 'http://www.w3.org/2000/svg';

  const read = () => {
    try { const v = JSON.parse(localStorage.getItem(KEY)); return THEMES.includes(v) ? v : 'starry'; } catch { return 'starry'; }
  };

  /* ================================================================ *
   * Scene description (normalised 0..1 coordinates)
   * ================================================================ */
  const SWIRLS = [
    { x: 0.37, y: 0.31, r: 0.13, s: 1.0 },   // big left swirl
    { x: 0.53, y: 0.41, r: 0.095, s: -0.9 }, // counter-swirl (the "S")
  ];
  const MOON = { x: 0.87, y: 0.16, r: 0.075 };
  const STARS = [
    { x: 0.08, y: 0.07, r: 0.032 }, { x: 0.21, y: 0.05, r: 0.026 }, { x: 0.32, y: 0.06, r: 0.03 },
    { x: 0.42, y: 0.07, r: 0.022 }, { x: 0.60, y: 0.10, r: 0.034 }, { x: 0.23, y: 0.17, r: 0.028 },
    { x: 0.31, y: 0.34, r: 0.022 }, { x: 0.36, y: 0.53, r: 0.05 }, { x: 0.04, y: 0.45, r: 0.024 },
    { x: 0.13, y: 0.48, r: 0.03 }, { x: 0.70, y: 0.25, r: 0.032 }, { x: 0.75, y: 0.06, r: 0.02 },
  ];
  // Horizon of the rolling hills (higher on the right like the painting's mountains).
  const hillY = (x) => 0.71 - 0.1 * smooth(0.5, 0.97, x) + 0.022 * Math.sin(x * 9 + 0.6) + 0.012 * Math.sin(x * 23);
  const villageTop = (x) => hillY(x) + 0.05 + 0.02 * Math.sin(x * 5);

  function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  /* ================================================================ *
   * Flow field: gentle wavy wind + vortices around swirls, stars, moon
   * ================================================================ */
  function flowAngle(nx, ny, aspect) {
    let vx = 1, vy = 0.22 * Math.sin(nx * 7 + ny * 4) + 0.18 * Math.sin(ny * 11 - nx * 3);
    const add = (c, strength) => {
      const dx = (nx - c.x) * aspect, dy = ny - c.y;
      const d = Math.hypot(dx, dy) + 1e-4;
      const w = Math.exp(-((d / c.r) ** 2)) * strength;
      vx += (-dy / d) * w; vy += (dx / d) * w;
    };
    for (const s of SWIRLS) add(s, 3.2 * s.s);
    add({ x: MOON.x, y: MOON.y, r: MOON.r * 1.9 }, 2.4);
    for (const s of STARS) add({ x: s.x, y: s.y, r: s.r * 1.8 }, 2.2);
    return Math.atan2(vy, vx);
  }

  /* ================================================================ *
   * Static painting (canvas)
   * ================================================================ */
  const SKY_DEEP = ['#0c2464', '#132f78', '#183a8a', '#1d4596'];
  const SKY_MID = ['#1f4ea6', '#2a5cb5', '#3569c2', '#2552a8', '#4174c6'];
  const SKY_LIGHT = ['#5f8fd3', '#7aa3dc', '#9bbde6', '#bcd3ee', '#d9e6f3'];
  const YELLOWS = ['#f6e27a', '#f2d050', '#fff3b8', '#e8c33f', '#fbe9a0'];
  const HILLS = ['#1b3a78', '#244a8c', '#16306a', '#2f5a98', '#3d69a6', '#5b86bf'];
  const VILLAGE = ['#14284a', '#1c3a5e', '#24506a', '#1a3350', '#2c5a6a', '#0f1f3c'];

  function skyColor(nx, ny, aspect) {
    // near swirls → pale; near stars/moon → yellow; low sky → lighter; top → deep
    for (const s of SWIRLS) {
      const d = Math.hypot((nx - s.x) * aspect, ny - s.y) / s.r;
      if (d < 1.05 && Math.random() < 0.75 - d * 0.35) return Math.random() < 0.12 ? pick(YELLOWS) : pick(SKY_LIGHT);
    }
    const md = Math.hypot((nx - MOON.x) * aspect, ny - MOON.y) / MOON.r;
    if (md < 2.1 && Math.random() < 0.9 - md * 0.35) return md < 1.2 ? pick(YELLOWS) : pick(['#fbf1c4', '#e9e7c9', '#cfe0ee', ...YELLOWS]);
    for (const s of STARS) {
      const d = Math.hypot((nx - s.x) * aspect, ny - s.y) / s.r;
      if (d < 2.0 && Math.random() < 0.95 - d * 0.42) return d < 1 ? pick(YELLOWS) : pick(['#fdf6d0', '#d7e6f2', '#bcd3ee', '#f4e8a8']);
    }
    // the bright wind band through the middle of the sky
    const band = Math.abs(ny - (0.24 + 0.22 * nx + 0.05 * Math.sin(nx * 8)));
    if (band < 0.035 && Math.random() < 0.55) return pick(SKY_LIGHT);
    if (ny > hillY(nx) - 0.08 && Math.random() < 0.55) return pick(SKY_LIGHT.slice(0, 3));
    return ny < 0.18 ? pick(Math.random() < 0.6 ? SKY_DEEP : SKY_MID) : pick(Math.random() < 0.7 ? SKY_MID : SKY_DEEP);
  }

  function stroke(ctx, x, y, angleAt, len, width, color, segs = 4) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const step = len / segs;
    for (let i = 0; i < segs; i++) {
      const a = angleAt(x, y);
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function paintScene(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const W = Math.max(320, window.innerWidth), H = Math.max(240, window.innerHeight);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    const aspect = W / H;
    const scale = Math.sqrt(W * H) / 1100;
    const skyAngle = (px, py) => flowAngle(px / W, py / H, aspect);

    // base
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b2260'); g.addColorStop(0.45, '#1c4aa0'); g.addColorStop(0.72, '#4a7cc8'); g.addColorStop(1, '#0d1d3a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // sky strokes
    const n = Math.round((W * H) / 70);
    ctx.globalAlpha = 0.82;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const nx = x / W, ny = y / H;
      if (ny > hillY(nx) + 0.01) continue;
      stroke(ctx, x, y, skyAngle, rand(9, 20) * scale, rand(2.4, 4.6) * scale, skyColor(nx, ny, aspect));
    }
    ctx.globalAlpha = 1;

    // hills
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, hillY(x / W) * H);
    ctx.lineTo(W, H);
    ctx.closePath();
    const hg = ctx.createLinearGradient(0, H * 0.58, 0, H);
    hg.addColorStop(0, '#2b5596'); hg.addColorStop(0.35, '#183a74'); hg.addColorStop(1, '#0c1a34');
    ctx.fillStyle = hg;
    ctx.fill();
    const hillAngle = (px, py) => {
      const nx = px / W, e = 0.004;
      const slope = (hillY(nx + e) - hillY(nx - e)) / (2 * e) / aspect;
      return Math.atan(slope) + 0.35 * Math.sin(px * 0.02 + py * 0.03);
    };
    for (let i = 0; i < n * 0.28; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const nx = x / W, ny = y / H;
      if (ny < hillY(nx) || ny > villageTop(nx) + 0.02) continue;
      const depth = (ny - hillY(nx)) / 0.07;
      stroke(ctx, x, y, hillAngle, rand(10, 22) * scale, rand(2.4, 4.2) * scale, depth < 0.3 ? pick(HILLS.slice(3)) : pick(HILLS.slice(0, 4)));
    }

    // village ground / trees
    const vAngle = (px, py) => 0.4 * Math.sin(px * 0.05) + 0.6 * Math.sin(py * 0.08 + px * 0.01);
    for (let i = 0; i < n * 0.35; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const nx = x / W, ny = y / H;
      if (ny < villageTop(nx)) continue;
      stroke(ctx, x, y, vAngle, rand(7, 16) * scale, rand(2.4, 4.4) * scale, pick(VILLAGE), 3);
    }

    // houses + church
    const windows = [];
    const houseScale = Math.max(0.7, scale);
    const drawHouse = (cx, baseY, w, h, roofH) => {
      ctx.fillStyle = pick(['#25406a', '#2e4a74', '#1f3558', '#384f78']);
      ctx.fillRect(cx - w / 2, baseY - h, w, h);
      ctx.fillStyle = pick(['#3a3f5e', '#4a4a62', '#2c3656', '#5b4a4a']);
      ctx.beginPath();
      ctx.moveTo(cx - w / 2 - 2, baseY - h); ctx.lineTo(cx, baseY - h - roofH); ctx.lineTo(cx + w / 2 + 2, baseY - h);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(10,20,40,0.8)'; ctx.lineWidth = 1.2;
      ctx.strokeRect(cx - w / 2, baseY - h, w, h);
      const wins = Math.random() < 0.7 ? 1 + ((Math.random() * 2) | 0) : 0;
      for (let k = 0; k < wins; k++) {
        const wx = cx - w / 2 + w * (0.25 + 0.5 * Math.random()), wy = baseY - h * (0.35 + 0.35 * Math.random());
        ctx.fillStyle = pick(['#ffd860', '#f7c948', '#ffe68a']);
        ctx.fillRect(wx - 2, wy - 2, 4 * houseScale, 4 * houseScale);
        windows.push({ x: wx / W, y: wy / H });
      }
    };
    for (let i = 0; i < 34; i++) {
      const nx = rand(0.3, 0.9);
      const base = (villageTop(nx) + rand(0.03, 0.2)) * H;
      if (base > H * 0.98) continue;
      drawHouse(nx * W, base, rand(18, 34) * houseScale, rand(12, 22) * houseScale, rand(6, 12) * houseScale);
    }
    // church with spire
    const cx = 0.57 * W, cb = (villageTop(0.57) + 0.1) * H;
    ctx.fillStyle = '#22385e';
    ctx.fillRect(cx - 22 * houseScale, cb - 30 * houseScale, 44 * houseScale, 30 * houseScale);
    ctx.fillStyle = '#2c4470';
    ctx.beginPath();
    ctx.moveTo(cx - 6 * houseScale, cb - 30 * houseScale);
    ctx.lineTo(cx, cb - 150 * houseScale);
    ctx.lineTo(cx + 6 * houseScale, cb - 30 * houseScale);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6f8fc0'; ctx.lineWidth = 1.5; ctx.stroke();

    return windows;
  }

  /* ================================================================ *
   * Animated swirl (transparent canvas, rotated by CSS)
   * ================================================================ */
  function paintSwirl(canvas, rPx, dir) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const S = Math.round(rPx * 2.3);
    canvas.width = Math.round(S * dpr); canvas.height = Math.round(S * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    const c = S / 2, turns = 2.6, scale = rPx / 140;
    for (let band = 0; band < 7; band++) {
      const off = band * 0.22;
      for (let t = 0.35; t < turns * Math.PI * 2; t += 0.09) {
        if (Math.random() < 0.2) continue;
        const r = (rPx * (t / (turns * Math.PI * 2))) * (1 + off * 0.12) + band * 2.2;
        const a = dir * t + off;
        const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
        const a2 = a + dir * 0.16;
        const r2 = r + 1.5;
        ctx.globalAlpha = 0.45 + 0.4 * (r / rPx);
        ctx.strokeStyle = r < rPx * 0.25 ? pick(['#e9eedb', '#fff6c8', '#cfe0f5']) : pick(['#bcd3ee', '#9bbde6', '#d9e6f3', '#7aa3dc', '#eef0d8']);
        ctx.lineWidth = rand(2.6, 4.4) * scale + 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(c + Math.cos(a2) * r2, c + Math.sin(a2) * r2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ================================================================ *
   * Cypress (own canvas so it can sway)
   * ================================================================ */
  function paintCypress(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const W = Math.round(window.innerWidth * 0.2), H = Math.round(window.innerHeight * 0.95);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    // flame-shaped silhouette from several lobes
    const lobes = [
      { cx: 0.5, top: 0.0, w: 0.34 }, { cx: 0.36, top: 0.22, w: 0.42 }, { cx: 0.66, top: 0.3, w: 0.36 },
      { cx: 0.48, top: 0.45, w: 0.6 }, { cx: 0.3, top: 0.55, w: 0.44 }, { cx: 0.7, top: 0.6, w: 0.42 },
    ];
    const inside = (x, y) => lobes.some((l) => {
      const ny = y / H; if (ny < l.top) return false;
      const t = (ny - l.top) / (1 - l.top);
      const half = l.w * W * 0.5 * Math.min(1, Math.sqrt(t) * 1.3) * (1 - 0.15 * t);
      return Math.abs(x - l.cx * W - Math.sin(ny * 14) * W * 0.03) < half;
    });
    const angle = (x, y) => -Math.PI / 2 + 0.55 * Math.sin(y * 0.045 + x * 0.05) + 0.25 * Math.sin(y * 0.11);
    const cols = ['#14261e', '#1c3a2a', '#28462f', '#3b4a2a', '#4a3b22', '#203225', '#5a5a32', '#0e1a14'];
    const n = Math.round((W * H) / 22);
    const scale = Math.sqrt(window.innerWidth * window.innerHeight) / 1100;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      if (!inside(x, y)) continue;
      ctx.globalAlpha = 0.9;
      stroke(ctx, x, y, angle, rand(10, 24) * scale, rand(2.6, 5) * scale, pick(cols));
    }
    ctx.globalAlpha = 1;
  }

  /* ================================================================ *
   * Wind bands (SVG paths with flowing dashes)
   * ================================================================ */
  function buildWind() {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'cs-wind');
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('preserveAspectRatio', 'none');
    const bands = [
      // the long S-shaped band through the middle of the sky, curling around the swirls
      { d: 'M-40 250 C 120 210, 220 330, 330 420 S 470 470, 520 410 S 560 300, 650 330 S 820 470, 1040 430', n: 12, spread: 5, colors: ['#e7eedf', '#c9dcf2', '#a9c6ec', '#f4f0cf', '#8fb4e6'] },
      // low band just above the hills
      { d: 'M-40 610 C 160 570, 300 640, 460 600 S 760 560, 1040 590', n: 8, spread: 6, colors: ['#bcd3ee', '#9bbde6', '#d9e6f3', '#7aa3dc'] },
      // high band near the top stars
      { d: 'M-40 120 C 140 90, 260 160, 420 130 S 700 80, 1040 140', n: 6, spread: 6, colors: ['#5f8fd3', '#7aa3dc', '#9bbde6'] },
    ];
    for (const b of bands) {
      for (let i = 0; i < b.n; i++) {
        const p = document.createElementNS(SVGNS, 'path');
        p.setAttribute('d', b.d);
        p.setAttribute('fill', 'none');
        p.setAttribute('vector-effect', 'non-scaling-stroke');
        p.setAttribute('class', 'cs-wind-stroke');
        p.setAttribute('transform', `translate(0 ${(i - b.n / 2) * b.spread})`);
        p.style.setProperty('--c', pick(b.colors));
        p.style.setProperty('--w', `${rand(2.2, 4.2).toFixed(1)}px`);
        const dash = rand(18, 40), gap = rand(10, 26);
        p.style.setProperty('--dash', `${dash.toFixed(0)}px ${gap.toFixed(0)}px`);
        p.style.setProperty('--dl', `${(-(dash + gap) * 12).toFixed(0)}px`);
        p.style.setProperty('--dur', `${rand(14, 26).toFixed(1)}s`);
        p.style.setProperty('--delay', `${(-rand(0, 20)).toFixed(1)}s`);
        p.style.setProperty('--o', rand(0.45, 0.85).toFixed(2));
        svg.appendChild(p);
      }
    }
    return svg;
  }

  /* ================================================================ *
   * Assemble the sky
   * ================================================================ */
  function place(el, x, y, size) {
    el.style.left = `${(x * 100).toFixed(2)}%`;
    el.style.top = `${(y * 100).toFixed(2)}%`;
    if (size != null) el.style.setProperty('--size', size);
  }

  function buildSky() {
    const sky = document.createElement('div');
    sky.id = 'cs-sky';
    sky.setAttribute('aria-hidden', 'true');
    const div = (cls, parent = sky) => { const d = document.createElement('div'); d.className = cls; parent.appendChild(d); return d; };

    const paint = document.createElement('canvas');
    paint.className = 'cs-paint';
    sky.appendChild(paint);

    const swirls = SWIRLS.map((s, i) => {
      const wrap = div(`cs-swirl2 sw${i}`);
      const cv = document.createElement('canvas');
      wrap.appendChild(cv);
      wrap.style.setProperty('--spin', s.s > 0 ? '360deg' : '-360deg');
      return { wrap, cv, s };
    });

    sky.appendChild(buildWind());
    div('cs-lightsweep');

    const moon = div('cs-moon2');
    div('cs-halo h2', moon); div('cs-halo h1', moon); div('cs-moon-disc', moon); div('cs-crescent', moon);

    STARS.forEach((s, i) => {
      const st = div('cs-vstar');
      st.style.setProperty('--d', `${(2.4 + (i % 5) * 0.6).toFixed(1)}s`);
      st.style.setProperty('--delay', `${(-i * 0.7).toFixed(1)}s`);
      st.style.setProperty('--spin-dur', `${(40 + (i % 4) * 14)}s`);
      div('cs-halo h2', st); div('cs-halo h1', st); div('cs-core', st);
      st.__cs = s;
    });

    const cypress = document.createElement('canvas');
    cypress.className = 'cs-cypress';
    sky.appendChild(cypress);

    const windowsLayer = div('cs-windows');
    div('cs-veil');

    const layout = () => {
      const W = window.innerWidth, H = window.innerHeight, vmin = Math.min(W, H);
      const windows = paintScene(paint);
      swirls.forEach(({ wrap, cv, s }) => {
        const rPx = s.r * W * 0.92;
        paintSwirl(cv, rPx, s.s > 0 ? 1 : -1);
        wrap.style.width = wrap.style.height = `${Math.round(rPx * 2.3)}px`;
        place(wrap, s.x, s.y);
      });
      place(moon, MOON.x, MOON.y, `${Math.round(MOON.r * W * 1.25 + vmin * 0.02)}px`);
      sky.querySelectorAll('.cs-vstar').forEach((st) => place(st, st.__cs.x, st.__cs.y, `${Math.round(st.__cs.r * W * 1.1 + vmin * 0.015)}px`));
      paintCypress(cypress);
      windowsLayer.textContent = '';
      windows.filter(() => Math.random() < 0.45).forEach((w, i) => {
        const s = document.createElement('span');
        place(s, w.x, w.y);
        s.style.setProperty('--delay', `${(-Math.random() * 6).toFixed(1)}s`);
        s.style.setProperty('--d', `${(3 + (i % 4)).toFixed(1)}s`);
        windowsLayer.appendChild(s);
      });
    };

    let t = 0;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => { if (sky.isConnected) layout(); }, 350);
    });
    sky.__layout = layout;
    return sky;
  }

  /* ================================================================ */
  function apply(theme) {
    if (theme === 'off') {
      html.removeAttribute('data-cs-theme');
      if (CS.__sky) CS.__sky.remove();
      return;
    }
    html.setAttribute('data-cs-theme', theme);
    if (!CS.__sky || !CS.__sky.__layout) {
      document.getElementById('cs-sky')?.remove();
      CS.__sky = buildSky();
      document.body.prepend(CS.__sky);
      CS.__sky.__layout();
    } else if (!CS.__sky.isConnected) {
      document.body.prepend(CS.__sky);
    }
  }

  let current = read();
  function setTheme(t) {
    current = THEMES.includes(t) ? t : 'starry';
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch {}
    apply(current);
    CS.root.querySelector('.cs-theme')?.setAttribute('aria-pressed', String(current !== 'off'));
  }

  CS.setTheme = setTheme;
  CS.getTheme = () => current;
  CS.toggleTheme = () => setTheme(current === 'off' ? 'starry' : 'off');

  setTheme(current);
  if (!CS.__themeWatch) {
    // claude.ai may re-render <html> attributes or <body> children; keep the theme attached.
    CS.__themeWatch = setInterval(() => {
      const t = CS.getTheme();
      if (t === 'off') return;
      if (html.getAttribute('data-cs-theme') !== t) html.setAttribute('data-cs-theme', t);
      if (CS.__sky && !CS.__sky.isConnected && document.body) document.body.prepend(CS.__sky);
    }, 1500);
    document.addEventListener('visibilitychange', () => html.toggleAttribute('data-cs-hidden', document.hidden));
  }
})();
