/*
 * Claude Studio — quick chat on the mascot.
 *
 * Text: what you type is put into claude.ai's own composer and sent with its own Send button,
 *       in the conversation currently open (on /new it starts a new chat). Nothing is sent unless
 *       you press Enter / ➤ yourself.
 * Mic:  toggles claude.ai's own "Dictate" button (its speech-to-text); the transcript is mirrored
 *       into the quick-chat box so you can edit it before sending.
 * The reply is read from the page (read-only) and shown in the card while it streams.
 * Selectors: overlay/selectors.json → "quickChat".
 */
(() => {
  'use strict';
  const CS = window.ClaudeStudio;
  if (!CS || CS.__quickChat) return;
  CS.__quickChat = true;

  const cfg = (window.__CS_SELECTORS || {}).quickChat || {};
  const SEL = {
    editor: cfg.editor || ['[data-testid="chat-input"]', 'div.ProseMirror[contenteditable="true"]'],
    send: cfg.send || ['[data-testid="chat-input-send"]', 'button[aria-label="Send message"]'],
    dictate: cfg.dictate || ['button[aria-label="Dictate"]', 'button[aria-label*="dictat" i]'],
    dictateHold: cfg.dictateHold || ['button[aria-label="Press and hold to record"]'],
    reply: cfg.reply || ['[data-testid="assistant-message"]'],
    replyText: cfg.replyText || ['.standard-markdown', '[data-cds="Prose"]'],
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (list, root = document) => {
    for (const s of list) {
      try {
        const el = root.querySelector(s);
        if (el && !CS.root.contains(el)) return el;
      } catch {}
    }
    return null;
  };
  const qAll = (list) => {
    for (const s of list) {
      try {
        const els = [...document.querySelectorAll(s)].filter((e) => !CS.root.contains(e));
        if (els.length) return els;
      } catch {}
    }
    return [];
  };
  async function waitFor(fn, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = fn();
      if (v) return v;
      await sleep(80);
    }
    return null;
  }

  /* ---------------------------------------------------------------- *
   * UI
   * ---------------------------------------------------------------- */
  const root = CS.root;
  const card = document.createElement('div');
  card.className = 'cs-qc';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Quick chat');
  card.hidden = true;

  const head = document.createElement('div');
  head.className = 'cs-qc-head';
  const title = document.createElement('span');
  title.className = 'cs-qc-title';
  title.textContent = 'Quick chat';
  const status = document.createElement('span');
  status.className = 'cs-qc-status';
  const jump = document.createElement('button');
  jump.type = 'button';
  jump.className = 'cs-qc-icon';
  jump.title = 'Xem câu trả lời trong khung chat';
  jump.textContent = '↗';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'cs-qc-icon';
  close.title = 'Đóng (Esc)';
  close.textContent = '×';
  head.append(title, status, jump, close);

  const reply = document.createElement('div');
  reply.className = 'cs-qc-reply';
  reply.textContent = 'Hỏi nhanh Claude — tin nhắn được gửi vào cuộc trò chuyện đang mở (trang New → cuộc trò chuyện mới).';

  const foot = document.createElement('div');
  foot.className = 'cs-qc-foot';
  const input = document.createElement('textarea');
  input.className = 'cs-qc-input';
  input.rows = 2;
  input.placeholder = 'Nhập câu hỏi… (Enter gửi, Shift+Enter xuống dòng)';
  const mic = document.createElement('button');
  mic.type = 'button';
  mic.className = 'cs-qc-btn cs-qc-mic';
  mic.title = 'Nói (dùng Dictate của claude.ai)';
  mic.setAttribute('aria-pressed', 'false');
  mic.textContent = '🎙';
  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'cs-qc-btn cs-qc-send';
  send.title = 'Gửi (Enter)';
  send.textContent = '➤';
  foot.append(input, mic, send);
  card.append(head, reply, foot);
  root.appendChild(card);

  // 💬 button on the mascot panel
  const panel = root.querySelector('.cs-panel');
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'cs-icon cs-chat';
  openBtn.title = 'Quick chat (Ctrl+Shift+K)';
  openBtn.textContent = '💬';
  panel.insertBefore(openBtn, panel.querySelector('.cs-theme'));

  // Keep claude.ai's global shortcuts away from our textarea.
  for (const t of ['keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'paste']) {
    card.addEventListener(t, (e) => e.stopPropagation());
  }

  /* ---------------------------------------------------------------- *
   * Composer helpers (claude.ai's own input)
   * ---------------------------------------------------------------- */
  const editor = () => q(SEL.editor);
  const composerText = () => (editor()?.innerText || '').replace(/ /g, ' ').trim();

  function setComposer(text) {
    const ed = editor();
    if (!ed) return false;
    ed.focus();
    const sel = getSelection();
    sel.selectAllChildren(ed);
    if (text) document.execCommand('insertText', false, text);
    else document.execCommand('delete');
    return true;
  }

  function fireClick(el) {
    const r = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, composed: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, init));
    }
    el.click();
  }

  /* ---------------------------------------------------------------- *
   * State
   * ---------------------------------------------------------------- */
  let listening = false;
  let mirrorTimer = 0;
  let busy = false;
  let lastReplyEl = null;

  const setStatus = (t) => { status.textContent = t || ''; };
  const setMood = (cls, on) => root.classList.toggle(cls, !!on);

  function open() {
    if (root.classList.contains('cs-collapsed')) CS.toggleCollapsed();
    card.hidden = false;
    root.classList.add('cs-qc-open');
    // Don't lose a draft that is already in claude.ai's composer.
    if (!input.value.trim() && composerText()) input.value = composerText();
    setTimeout(() => input.focus(), 30);
  }
  function hide() {
    if (listening) toggleMic();
    card.hidden = true;
    root.classList.remove('cs-qc-open');
  }
  const toggle = () => (card.hidden ? open() : hide());

  /* ---------------------------------------------------------------- *
   * Mic (claude.ai Dictate)
   * ---------------------------------------------------------------- */
  // Chat/Cowork have a click-to-toggle "Dictate" button; the Code view has a press-and-hold one.
  let holdBtn = null;
  function pointer(el, types) {
    const r = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, composed: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, buttons: 1, pointerId: 7, pointerType: 'mouse', isPrimary: true };
    for (const t of types) el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, { ...init, buttons: /up/.test(t) ? 0 : 1 }));
  }
  async function toggleMic() {
    const hold = !listening ? q(SEL.dictateHold) : holdBtn;
    const btn = hold || q(SEL.dictate);
    if (!btn) {
      setStatus('Không thấy nút Dictate');
      CS.speak && CS.speak('Không có mic ở trang này', 1600);
      return;
    }
    if (!listening) {
      setComposer(input.value.trim()); // dictation appends to what is already typed
      if (hold) { holdBtn = hold; pointer(hold, ['pointerover', 'pointerdown', 'mousedown']); }
      else fireClick(btn);
      listening = true;
      mic.setAttribute('aria-pressed', 'true');
      setMood('cs-listening', true);
      setStatus('Đang nghe…');
      mirrorTimer = setInterval(() => {
        const t = composerText();
        if (t) input.value = t;
      }, 250);
    } else {
      if (holdBtn) { pointer(holdBtn, ['pointerup', 'mouseup']); holdBtn = null; }
      else fireClick(btn);
      listening = false;
      mic.setAttribute('aria-pressed', 'false');
      setMood('cs-listening', false);
      setStatus('');
      await sleep(700); // let the last words land
      clearInterval(mirrorTimer);
      const t = composerText();
      if (t) input.value = t;
      input.focus();
    }
  }

  /* ---------------------------------------------------------------- *
   * Send + follow the reply
   * ---------------------------------------------------------------- */
  async function doSend() {
    if (busy) return;
    if (listening) await toggleMic();
    const text = input.value.trim();
    if (!text) return;
    if (!editor()) { setStatus('Không thấy ô chat của claude.ai'); return; }

    busy = true;
    send.disabled = true;
    try {
      const before = qAll(SEL.reply).length;
      setComposer(text);
      const btn = await waitFor(() => { const b = q(SEL.send); return b && !b.disabled ? b : null; }, 2000);
      if (!btn) { setStatus('Nút Gửi chưa sẵn sàng'); return; }
      fireClick(btn);
      input.value = '';
      setStatus('Đang gửi…');
      reply.textContent = '';
      setMood('cs-thinking', true);
      CS.speak && CS.speak('Để mình nghĩ… 💭', 1400);

      const msg = await waitFor(() => {
        const all = qAll(SEL.reply);
        return all.length > before ? all[all.length - 1] : null;
      }, 30000);
      if (!msg) { setStatus('Chưa thấy câu trả lời — xem trong khung chat'); return; }
      lastReplyEl = msg;
      setStatus('Claude đang trả lời…');

      let stableSince = 0;
      let lastText = '';
      const t0 = Date.now();
      while (Date.now() - t0 < 10 * 60 * 1000) {
        const cur = qAll(SEL.reply).slice(-1)[0] || msg;
        lastReplyEl = cur;
        const body = q(SEL.replyText, cur) || cur;
        const txt = (body.innerText || '').trim();
        if (txt !== lastText) {
          lastText = txt;
          stableSince = Date.now();
          const atBottom = reply.scrollTop + reply.clientHeight >= reply.scrollHeight - 30;
          reply.textContent = txt;
          if (atBottom) reply.scrollTop = reply.scrollHeight;
        }
        const streaming = cur.getAttribute('data-is-streaming') === 'true';
        if (!streaming && txt && Date.now() - stableSince > 900) break;
        await sleep(300);
      }
      setStatus('Xong');
      CS.speak && CS.speak('Xong! ✨', 1400);
    } catch (e) {
      setStatus('Lỗi: ' + (e && e.message));
    } finally {
      busy = false;
      send.disabled = false;
      setMood('cs-thinking', false);
      if (!card.hidden) input.focus();
    }
  }

  /* ---------------------------------------------------------------- */
  openBtn.addEventListener('click', toggle);
  close.addEventListener('click', hide);
  send.addEventListener('click', doSend);
  mic.addEventListener('click', toggleMic);
  jump.addEventListener('click', () => {
    const el = lastReplyEl && lastReplyEl.isConnected ? lastReplyEl : qAll(SEL.reply).slice(-1)[0];
    el && el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); doSend(); }
    else if (e.key === 'Escape') { e.preventDefault(); hide(); }
  });

  CS.__qcDebug = { setComposer, composerText }; // for selector debugging only; never sends
  CS.toggleQuickChat = toggle;
  CS.openQuickChat = open;
})();
