/* ============================================================
   NAILL TETRUS — game logic
   ============================================================ */
(() => {
  'use strict';

  /* ---------------- constants ---------------- */
  const COLS = 10;
  const ROWS = 20;
  const LOCK_DELAY = 450;
  const MAX_LOCK_RESETS = 12;
  const LINE_SCORE = [0, 100, 300, 500, 800];
  const LS_NAMES = 'naill_tetrus.names.v1';
  const LS_RECORDS = 'naill_tetrus.records.v1';

  const BASE = {
    I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
    O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] }
  };

  const TYPES = Object.keys(BASE);
  const KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1], [0, -2]];

  const SHAPES = (() => {
    const out = {};
    for (const [type, def] of Object.entries(BASE)) {
      if (type === 'O') {
        out[type] = [0, 1, 2, 3].map(() => def.cells.map(([x, y]) => [x, y]));
      } else {
        let cur = def.cells.map(([x, y]) => [x, y]);
        const states = [];
        for (let i = 0; i < 4; i++) {
          states.push(cur);
          cur = cur.map(([x, y]) => [def.n - 1 - y, x]);
        }
        out[type] = states;
      }
    }
    return out;
  })();

  /* ---------------- dom ---------------- */
  const $ = (sel) => document.querySelector(sel);
  const boardCanvas = $('#board');
  const boardBox = $('#boardBox');
  const nextCanvas = $('#next');
  const overlay = $('#overlay');
  const ovTitle = $('#ovTitle');
  const ovText = $('#ovText');
  const ovBtn = $('#ovBtn');
  const ovNote = $('#ovNote');
  const elScore = $('#score');
  const elLevel = $('#level');
  const elLines = $('#lines');
  const elBest = $('#best');
  const recordsList = $('#records');
  const namesList = $('#namesList');
  const namesCount = $('#namesCount');
  const namesHint = $('#namesHint');
  const namesPanel = $('#namesPanel');
  const nameInput = $('#nameInput');
  const nameForm = $('#nameForm');
  const btnClearNames = $('#btnClearNames');
  const btnPause = $('#btnPause');
  const btnResetRecords = $('#btnResetRecords');
  const nextMini = $('#nextMini');
  const drawer = $('#drawer');
  const scrim = $('#scrim');
  const btnMenu = $('#btnMenu');
  const btnCloseDrawer = $('#btnCloseDrawer');
  const btnFullscreen = $('#btnFullscreen');
  const btnStartPanel = $('#btnStartPanel');

  /* ---------------- names storage ---------------- */
  let names = loadNames();

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'id-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
  }

  function sanitizeColor(v) {
    const h = Number(v && v.h);
    const s = Number(v && v.s);
    const l = Number(v && v.l);
    return {
      h: Number.isFinite(h) ? ((h % 360) + 360) % 360 : Math.floor(Math.random() * 360),
      s: Number.isFinite(s) ? Math.min(100, Math.max(40, s)) : 88,
      l: Number.isFinite(l) ? Math.min(80, Math.max(45, l)) : 63
    };
  }

  function loadNames() {
    try {
      const raw = localStorage.getItem(LS_NAMES);
      const arr = JSON.parse(raw || '[]');
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((n) => n && typeof n.text === 'string' && n.text.trim())
        .map((n) => ({
          id: typeof n.id === 'string' && n.id ? n.id : uid(),
          text: String(n.text).slice(0, 24),
          ...sanitizeColor(n)
        }));
    } catch (err) {
      return [];
    }
  }

  function saveNames() {
    try {
      localStorage.setItem(LS_NAMES, JSON.stringify(names));
    } catch (err) {
      flashHint('Не удалось сохранить список', 'warn');
    }
  }

  function makeColor(index) {
    const h = Math.round((Math.random() * 360 + index * 137.508) % 360);
    const s = 84 + Math.round(Math.random() * 16);
    const l = 60 + Math.round(Math.random() * 10);
    return { h, s, l };
  }

  function plural(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  let hintTimer = 0;
  function flashHint(msg, tone) {
    namesHint.textContent = msg;
    namesHint.className = 'hint pop' + (tone ? ' ' + tone : '');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      namesHint.textContent = names.length
        ? 'Клик по имени — редактировать, ✕ — удалить.'
        : 'Добавь имена — они появятся внутри блоков.';
      namesHint.className = 'hint';
    }, 2600);
  }

  function nudgeNames() {
    openDrawer();
    namesPanel.classList.remove('shake');
    void namesPanel.offsetWidth;
    namesPanel.classList.add('shake');
    namesPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    flashHint('Сначала добавь хотя бы одно имя', 'warn');
    nameInput.focus();
    setTimeout(() => namesPanel.classList.remove('shake'), 500);
  }

  function addName(raw) {
    const text = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!text) return { ok: false, msg: 'Введи имя — пустое нельзя' };
    if (names.some((n) => n.text.toLowerCase() === text.toLowerCase())) {
      return { ok: false, msg: 'Такое имя уже есть в списке' };
    }
    names.push({ id: uid(), text, ...makeColor(names.length) });
    saveNames();
    renderNames();
    return { ok: true };
  }

  function removeName(id) {
    const idx = names.findIndex((n) => n.id === id);
    if (idx === -1) return;
    names.splice(idx, 1);
    saveNames();
    renderNames();
  }

  function startEdit(li, name) {
    if (li.querySelector('.name-edit')) return;
    const input = document.createElement('input');
    input.className = 'name-edit';
    input.type = 'text';
    input.maxLength = 24;
    input.value = name.text;
    const txt = li.querySelector('.name-text');
    const actions = li.querySelector('.name-actions');
    li.classList.add('editing');
    txt.replaceWith(input);
    if (actions) actions.style.visibility = 'hidden';
    input.focus();
    input.select();

    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const val = input.value.trim().replace(/\s+/g, ' ').slice(0, 24);
      if (save && val && val !== name.text) {
        const dup = names.some((n) => n.id !== name.id && n.text.toLowerCase() === val.toLowerCase());
        if (dup) {
          flashHint('Такое имя уже есть в списке', 'warn');
        } else {
          name.text = val;
          saveNames();
        }
      }
      renderNames();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      e.stopPropagation();
    });
    input.addEventListener('blur', () => finish(true));
  }

  function renderNames() {
    namesList.textContent = '';
    for (const name of names) {
      const li = document.createElement('li');
      li.className = 'name-item';

      const dot = document.createElement('span');
      dot.className = 'swatch';
      dot.style.background = `hsl(${name.h},${name.s}%,${name.l}%)`;
      dot.style.boxShadow = `0 0 12px hsla(${name.h},${name.s}%,${name.l}%,0.85)`;

      const txt = document.createElement('span');
      txt.className = 'name-text';
      txt.textContent = name.text;
      txt.title = name.text;

      const actions = document.createElement('div');
      actions.className = 'name-actions';

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'icon-btn';
      edit.title = 'Редактировать';
      edit.setAttribute('aria-label', 'Редактировать ' + name.text);
      edit.textContent = '✎';
      edit.addEventListener('click', () => startEdit(li, name));

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn danger';
      del.title = 'Удалить';
      del.setAttribute('aria-label', 'Удалить ' + name.text);
      del.textContent = '✕';
      del.addEventListener('click', () => removeName(name.id));

      actions.append(edit, del);
      li.append(dot, txt, actions);
      namesList.append(li);
    }

    namesCount.textContent = `${names.length} ${plural(names.length, 'имя', 'имени', 'имён')}`;
    btnClearNames.disabled = names.length === 0;

    if (!names.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Пока пусто. Добавь первое имя ↑';
      namesList.append(empty);
    }
  }

  /* ---------------- game state ---------------- */
  const state = {
    phase: 'idle',
    board: newBoard(),
    piece: null,
    next: null,
    bag: [],
    score: 0,
    lines: 0,
    level: 1,
    dropAcc: 0,
    dropInterval: 860,
    grounded: false,
    groundedAt: 0,
    lockResets: 0,
    flashRows: null,
    flashUntil: 0,
    lastTime: 0,
    gen: 0
  };

  let cell = 26;
  let boardW = 260;
  let boardH = 520;
  let dpr = 1;
  const spriteCache = new Map();

  function newBoard() {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  }

  function refillBag() {
    const bag = TYPES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    state.bag = bag;
  }

  function nextType() {
    if (!state.bag.length) refillBag();
    return state.bag.pop();
  }

  function pickLabel() {
    if (!names.length) return { id: 'fallback', text: 'NAILL', h: 190, s: 100, l: 62 };
    return names[Math.floor(Math.random() * names.length)];
  }

  function makePiece(type) {
    const cells = SHAPES[type][0].map(([dx, dy]) => ({ dx, dy, label: pickLabel() }));
    const x = Math.floor((COLS - BASE[type].n) / 2);
    return { type, rot: 0, x, y: 0, cells };
  }

  function collide(cells, px, py) {
    for (const c of cells) {
      const x = px + c.dx;
      const y = py + c.dy;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && state.board[y][x]) return true;
    }
    return false;
  }

  function spawn() {
    if (!state.next) state.next = makePiece(nextType());
    state.piece = state.next;
    state.next = makePiece(nextType());
    state.grounded = false;
    state.groundedAt = 0;
    state.lockResets = 0;
    state.dropAcc = 0;
    drawNext();
    if (collide(state.piece.cells, state.piece.x, state.piece.y)) gameOver();
  }

  function updateGrounded() {
    if (!state.piece) return;
    const grounded = collide(state.piece.cells, state.piece.x, state.piece.y + 1);
    if (grounded === state.grounded) return;
    state.grounded = grounded;
    state.groundedAt = grounded ? performance.now() : 0;
    if (!grounded) state.lockResets = 0;
  }

  function resetLock() {
    updateGrounded();
    if (!state.grounded) return;
    if (state.lockResets < MAX_LOCK_RESETS) {
      state.lockResets++;
      state.groundedAt = performance.now();
    }
  }

  function move(dir) {
    if (state.phase !== 'playing' || !state.piece) return;
    const p = state.piece;
    if (!collide(p.cells, p.x + dir, p.y)) {
      p.x += dir;
      resetLock();
      return true;
    }
    return false;
  }

  function rotate(dir) {
    if (state.phase !== 'playing' || !state.piece) return;
    const p = state.piece;
    const rot = (p.rot + dir + 4) % 4;
    const coords = SHAPES[p.type][rot];
    const cells = coords.map(([dx, dy], i) => ({ dx, dy, label: p.cells[i].label }));

    for (const [kx, ky] of KICKS) {
      if (!collide(cells, p.x + kx, p.y + ky)) {
        p.rot = rot;
        p.cells = cells;
        p.x += kx;
        p.y += ky;
        resetLock();
        return;
      }
    }
  }

  function softDrop() {
    if (state.phase !== 'playing' || !state.piece) return;
    const p = state.piece;
    if (!collide(p.cells, p.x, p.y + 1)) {
      p.y++;
      state.score += 1;
      state.dropAcc = 0;
      state.grounded = false;
      state.groundedAt = 0;
      updateHUD();
    } else {
      updateGrounded();
    }
  }

  function hardDrop() {
    if (state.phase !== 'playing' || !state.piece) return;
    const p = state.piece;
    let dist = 0;
    while (!collide(p.cells, p.x, p.y + 1)) {
      p.y++;
      dist++;
    }
    state.score += dist * 2;
    lockPiece();
  }

  function lockPiece() {
    if (!state.piece) return;
    const p = state.piece;
    for (const c of p.cells) {
      const x = p.x + c.dx;
      const y = p.y + c.dy;
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) state.board[y][x] = c.label;
    }

    const full = [];
    for (let y = 0; y < ROWS; y++) {
      if (state.board[y].every(Boolean)) full.push(y);
    }

    state.piece = null;
    state.grounded = false;

    if (full.length) {
      state.flashRows = full;
      state.flashUntil = performance.now() + 150;
      state.score += LINE_SCORE[Math.min(full.length, 4)] * state.level;
      state.lines += full.length;
      state.level = 1 + Math.floor(state.lines / 10);
      state.dropInterval = Math.max(70, 860 * Math.pow(0.86, state.level - 1));
      updateHUD();
      const gen = state.gen;
      setTimeout(() => {
        if (state.gen !== gen || state.phase !== 'playing') return;
        state.board = state.board.filter((_, y) => !full.includes(y));
        while (state.board.length < ROWS) state.board.unshift(new Array(COLS).fill(null));
        state.flashRows = null;
        spawn();
        updateHUD();
      }, 140);
      return;
    }

    spawn();
    updateHUD();
  }

  function gameOver() {
    state.phase = 'over';
    state.piece = null;
    saveRecord();
    showOverlay(
      'Игра окончена',
      `Счёт: ${state.score} · Уровень: ${state.level} · Линии: ${state.lines}`,
      'Играть снова',
      'restart',
      'Нажми Enter, чтобы начать заново'
    );
  }

  function startGame() {
    if (!names.length) {
      nudgeNames();
      return;
    }
    state.gen++;
    state.phase = 'playing';
    state.board = newBoard();
    state.score = 0;
    state.lines = 0;
    state.level = 1;
    state.dropAcc = 0;
    state.dropInterval = 860;
    state.bag = [];
    state.piece = null;
    state.next = null;
    state.flashRows = null;
    state.grounded = false;
    state.lastTime = performance.now();
    hideOverlay();
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    spawn();
    updateHUD();
    boardCanvas.focus({ preventScroll: true });
  }

  function togglePause() {
    if (state.phase === 'playing') {
      state.phase = 'paused';
      showOverlay('Пауза', 'Игра приостановлена', 'Продолжить', 'resume', 'P или Esc — продолжить');
    } else if (state.phase === 'paused') {
      state.phase = 'playing';
      state.lastTime = performance.now();
      state.dropAcc = 0;
      hideOverlay();
    }
  }

  /* ---------------- overlay ---------------- */
  function showOverlay(title, text, btnText, action, note) {
    ovTitle.textContent = title;
    ovText.textContent = text;
    ovBtn.textContent = btnText;
    ovNote.textContent = note || '';
    ovNote.style.display = note ? '' : 'none';
    overlay.dataset.action = action;
    overlay.classList.add('show');
  }

  function hideOverlay() {
    overlay.classList.remove('show');
  }

  function primaryAction() {
    closeDrawer();
    const action = overlay.dataset.action;
    if (action === 'start' || action === 'restart') startGame();
    else if (action === 'resume') togglePause();
  }

  /* ---------------- records ---------------- */
  function loadRecords() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS_RECORDS) || '[]');
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((r) => r && Number.isFinite(Number(r.score)))
        .map((r) => ({
          score: Math.max(0, Math.floor(Number(r.score))),
          level: Math.max(1, Math.floor(Number(r.level) || 1)),
          lines: Math.max(0, Math.floor(Number(r.lines) || 0)),
          ts: Number(r.ts) || Date.now()
        }));
    } catch (err) {
      return [];
    }
  }

  function saveRecord() {
    if (state.score <= 0) return;
    const list = loadRecords();
    list.push({ score: state.score, level: state.level, lines: state.lines, ts: Date.now() });
    list.sort((a, b) => b.score - a.score);
    const top = list.slice(0, 5);
    try {
      localStorage.setItem(LS_RECORDS, JSON.stringify(top));
    } catch (err) { /* ignore quota errors */ }
    renderRecords();
  }

  function renderRecords() {
    const list = loadRecords();
    recordsList.textContent = '';
    elBest.textContent = String(list.length ? list[0].score : 0);

    if (!list.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Рекордов пока нет — сыграй первую партию';
      recordsList.append(empty);
      return;
    }

    for (const rec of list) {
      const li = document.createElement('li');

      const score = document.createElement('span');
      score.className = 'rec-score';
      score.textContent = String(rec.score);

      const meta = document.createElement('span');
      meta.className = 'rec-meta';
      const date = new Date(rec.ts);
      const when = Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
      meta.textContent = `ур. ${rec.level} · ${rec.lines} л.${when ? ' · ' + when : ''}`;

      li.append(score, meta);
      recordsList.append(li);
    }
  }

  function updateHUD() {
    elScore.textContent = String(state.score);
    elLevel.textContent = String(state.level);
    elLines.textContent = String(state.lines);
  }

  /* ---------------- rendering ---------------- */
  function roundRect(g, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  }

  function hsla(label, a) {
    return `hsla(${label.h},${label.s}%,${label.l}%,${a})`;
  }

  function setFont(g, fontSize) {
    g.font = `800 ${fontSize}px "Segoe UI", system-ui, -apple-system, Arial, sans-serif`;
  }

  // greedy line wrapping by words; words break after a hyphen, and a single
  // very long word (no spaces in the name) is split by characters so nothing
  // is ever cut off
  function wrapText(g, text, maxW) {
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [''];

    const splitWords = words.length === 1;
    const tokens = [];

    words.forEach((word, wi) => {
      const pieces = word.match(/[^-]+-?|-/g) || [word];
      pieces.forEach((piece, pi) => {
        const fits = g.measureText(piece).width <= maxW;
        const space = wi > 0 && pi === 0;
        if (fits || !splitWords || piece.length <= 6) {
          tokens.push({ t: piece, space });
          return;
        }
        let chunk = '';
        for (const ch of piece) {
          if (chunk && g.measureText(chunk + ch).width > maxW) {
            tokens.push({ t: chunk, space: false });
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        if (chunk) tokens.push({ t: chunk, space: false });
      });
    });

    const lines = [];
    let line = '';
    for (const tok of tokens) {
      const sep = line && tok.space ? ' ' : '';
      const candidate = line + sep + tok.t;
      if (line && g.measureText(candidate).width > maxW) {
        lines.push(line);
        line = tok.t;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  // largest font size at which the whole name fits the cell, with wrapping
  function fitText(g, text, maxW, maxH, startSize) {
    const fits = (lines, lh) =>
      lines.length * lh <= maxH && lines.every((line) => g.measureText(line).width <= maxW);

    let lo = 2.5;
    let hi = startSize;
    let best = null;
    for (let i = 0; i < 16; i++) {
      const fs = (lo + hi) / 2;
      setFont(g, fs);
      const lines = wrapText(g, text, maxW);
      const lh = fs * 1.04;
      if (fits(lines, lh)) {
        best = { size: fs, lines, lh };
        lo = fs;
      } else {
        hi = fs;
      }
    }
    if (!best) {
      setFont(g, lo);
      best = { size: lo, lines: wrapText(g, text, maxW), lh: lo * 1.04 };
    }
    return best;
  }

  function makeSprite(label, size, active) {
    const key = `${label.id}:${label.text}:${label.h}:${Math.round(size * dpr)}:${active ? 1 : 0}`;
    const cached = spriteCache.get(key);
    if (cached) return cached;

    const px = Math.max(12, Math.round(size * dpr));
    const cv = document.createElement('canvas');
    cv.width = px;
    cv.height = px;
    const g = cv.getContext('2d');
    const k = px / size;
    g.setTransform(k, 0, 0, k, 0, 0);

    const pad = Math.max(0.5, size * 0.04);
    roundRect(g, pad, pad, size - pad * 2, size - pad * 2, size * 0.2);
    g.fillStyle = hsla(label, active ? 0.3 : 0.16);
    g.fill();
    g.lineWidth = Math.max(1, size * 0.055);
    g.strokeStyle = hsla(label, active ? 0.98 : 0.78);
    g.shadowColor = hsla(label, 0.85);
    g.shadowBlur = size * 0.22;
    g.stroke();
    g.shadowBlur = 0;

    if (size >= 12) {
      const text = String(label.text || '').trim();
      if (text) {
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const fit = fitText(g, text, size * 0.9, size * 0.9, size * 0.64);
        setFont(g, fit.size);
        g.fillStyle = `hsl(${label.h},${Math.min(label.s, 100)}%,93%)`;
        g.shadowColor = hsla(label, 0.9);
        g.shadowBlur = Math.min(size * 0.16, 3);
        const totalH = fit.lines.length * fit.lh;
        let ty = (size - totalH) / 2 + fit.lh / 2;
        for (const line of fit.lines) {
          g.fillText(line, size / 2, ty);
          ty += fit.lh;
        }
        g.shadowBlur = 0;
      }
    }

    spriteCache.set(key, cv);
    return cv;
  }

  function drawCell(ctx, x, y, size, label, active) {
    ctx.drawImage(makeSprite(label, size, active), x, y, size, size);
  }

  function layout() {
    const rect = boardBox.getBoundingClientRect();
    const w = Math.max(120, Math.floor(rect.width));
    const h = Math.max(240, Math.floor(rect.height));
    cell = Math.max(12, Math.floor(Math.min(w / COLS, h / ROWS)));
    boardW = cell * COLS;
    boardH = cell * ROWS;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    boardCanvas.width = Math.round(boardW * dpr);
    boardCanvas.height = Math.round(boardH * dpr);
    boardCanvas.style.width = boardW + 'px';
    boardCanvas.style.height = boardH + 'px';

    spriteCache.clear();
    drawNext();
  }

  function drawNext() {
    drawNextInto(nextCanvas, 30);
    drawNextInto(nextMini, 18);
  }

  function drawNextInto(canvas, size) {
    if (!canvas) return;
    const px = Math.round(size * 4 * dpr);
    canvas.width = px;
    canvas.height = px;
    canvas.style.width = size * 4 + 'px';
    canvas.style.height = size * 4 + 'px';

    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size * 4, size * 4);

    const p = state.next;
    if (!p) return;

    const xs = p.cells.map((c) => c.dx);
    const ys = p.cells.map((c) => c.dy);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX + 1;
    const h = Math.max(...ys) - minY + 1;
    const ox = (4 - w) / 2;
    const oy = (4 - h) / 2;

    for (const c of p.cells) {
      drawCell(g, (ox + c.dx - minX) * size, (oy + c.dy - minY) * size, size, c.label, false);
    }
  }

  function render(now) {
    const ctx = boardCanvas.getContext('2d');
    const c = cell;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, boardW, boardH);

    // playfield background
    ctx.fillStyle = 'rgba(5,8,17,0.62)';
    ctx.fillRect(0, 0, boardW, boardH);

    // grid
    ctx.strokeStyle = 'rgba(110,190,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(x * c + 0.5, 0);
      ctx.lineTo(x * c + 0.5, boardH);
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.moveTo(0, y * c + 0.5);
      ctx.lineTo(boardW, y * c + 0.5);
    }
    ctx.stroke();

    // ghost
    if (state.phase === 'playing' && state.piece) {
      const p = state.piece;
      let gy = p.y;
      while (!collide(p.cells, p.x, gy + 1)) gy++;
      ctx.save();
      ctx.globalAlpha = 0.55;
      for (const part of p.cells) {
        const x = p.x + part.dx;
        const y = gy + part.dy;
        if (y < 0) continue;
        ctx.strokeStyle = hsla(part.label, 0.55);
        ctx.lineWidth = 1.5;
        roundRect(ctx, x * c + c * 0.12, y * c + c * 0.12, c * 0.76, c * 0.76, c * 0.16);
        ctx.stroke();
      }
      ctx.restore();
    }

    // locked cells
    for (let y = 0; y < ROWS; y++) {
      const row = state.board[y];
      if (!row) continue;
      for (let x = 0; x < COLS; x++) {
        const label = row[x];
        if (label) drawCell(ctx, x * c, y * c, c, label, false);
      }
    }

    // active piece
    if (state.piece) {
      const p = state.piece;
      for (const part of p.cells) {
        const x = p.x + part.dx;
        const y = p.y + part.dy;
        if (y < 0) continue;
        drawCell(ctx, x * c, y * c, c, part.label, true);
      }
    }

    // line clear flash
    if (state.flashRows && now < state.flashUntil) {
      const left = Math.max(0, state.flashUntil - now) / 150;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,255,255,${0.35 * left})`;
      for (const y of state.flashRows) ctx.fillRect(0, y * c, boardW, c);
      ctx.restore();
    }
  }

  /* ---------------- main loop ---------------- */
  function loop(now) {
    if (!state.lastTime) state.lastTime = now;
    const dt = Math.min(120, Math.max(0, now - state.lastTime));
    state.lastTime = now;

    if (state.phase === 'playing' && state.piece) {
      state.dropAcc += dt;
      if (state.dropAcc >= state.dropInterval) {
        state.dropAcc = 0;
        const p = state.piece;
        if (!collide(p.cells, p.x, p.y + 1)) {
          p.y++;
          state.grounded = false;
          state.groundedAt = 0;
          state.lockResets = 0;
        } else {
          updateGrounded();
        }
      }
      if (state.grounded && now - state.groundedAt >= LOCK_DELAY) lockPiece();
    }

    render(now);
    requestAnimationFrame(loop);
  }

  /* ---------------- input ---------------- */
  function isTyping() {
    const el = document.activeElement;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  document.addEventListener('keydown', (e) => {
    if (isTyping()) return;
    const key = e.key;

    if (key === 'Escape' && drawer.classList.contains('open')) {
      e.preventDefault();
      closeDrawer();
      return;
    }

    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'Spacebar'].includes(key)) {
      e.preventDefault();
    }

    if (state.phase !== 'playing') {
      if (key === 'Enter') { e.preventDefault(); primaryAction(); }
      else if ((key === 'p' || key === 'P' || key === 'Escape') && state.phase === 'paused') togglePause();
      return;
    }

    switch (key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        move(-1);
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        move(1);
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        softDrop();
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
      case 'x':
      case 'X':
        rotate(1);
        break;
      case 'z':
      case 'Z':
        rotate(-1);
        break;
      case ' ':
      case 'Spacebar':
        hardDrop();
        break;
      case 'p':
      case 'P':
      case 'Escape':
        togglePause();
        break;
      default:
        break;
    }
  });

  // overlay button
  ovBtn.addEventListener('click', primaryAction);

  // pause button
  btnPause.addEventListener('click', () => {
    if (state.phase === 'playing' || state.phase === 'paused') togglePause();
  });

  /* ---------------- drawer (names, next, records) ---------------- */
  function openDrawer() {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    scrim.classList.add('show');
    if (state.phase === 'playing') togglePause();
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    scrim.classList.remove('show');
  }

  btnMenu.addEventListener('click', openDrawer);
  btnCloseDrawer.addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);

  // start button inside the names panel
  btnStartPanel.addEventListener('click', () => {
    closeDrawer();
    startGame();
  });

  /* ---------------- fullscreen ---------------- */
  btnFullscreen.addEventListener('click', () => {
    const doc = document;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      const el = doc.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) req.call(el).catch(() => {});
    } else {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (exit) exit.call(doc);
    }
  });

  document.addEventListener('fullscreenchange', () => {
    btnFullscreen.textContent = document.fullscreenElement ? '⤢' : '⛶';
    setTimeout(layout, 60);
  });

  // auto pause when tab/window loses focus
  window.addEventListener('blur', () => {
    if (state.phase === 'playing') togglePause();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.phase === 'playing') togglePause();
  });

  /* ---------------- names UI events ---------------- */
  nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const res = addName(nameInput.value);
    if (res.ok) {
      nameInput.value = '';
      flashHint('Имя добавлено', 'ok');
      nameInput.focus();
    } else {
      flashHint(res.msg, 'warn');
      nameInput.focus();
    }
  });

  btnClearNames.addEventListener('click', () => {
    if (!names.length) return;
    if (!window.confirm('Удалить все имена из списка?')) return;
    names = [];
    saveNames();
    renderNames();
    flashHint('Список очищен');
  });

  btnResetRecords.addEventListener('click', () => {
    if (!window.confirm('Сбросить таблицу рекордов?')) return;
    try { localStorage.removeItem(LS_RECORDS); } catch (err) { /* ignore */ }
    renderRecords();
  });

  /* ---------------- touch controls ---------------- */
  function bindHold(el, fn, delay = 170, interval = 60) {
    if (!el) return;
    let t1 = 0;
    let t2 = 0;
    const stop = () => {
      clearTimeout(t1);
      clearInterval(t2);
      el.classList.remove('pressed');
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('pressed');
      fn();
      stop();
      t1 = setTimeout(() => {
        t2 = setInterval(fn, interval);
      }, delay);
    });
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    el.addEventListener('pointerleave', stop);
  }

  bindHold($('#touchLeft'), () => move(-1));
  bindHold($('#touchRight'), () => move(1));
  bindHold($('#touchSoft'), () => softDrop(), 120, 45);

  $('#touchRotate').addEventListener('click', (e) => { e.preventDefault(); rotate(1); });
  $('#touchHard').addEventListener('click', (e) => { e.preventDefault(); hardDrop(); });

  // swipe gestures on the board
  let swipe = null;
  boardCanvas.addEventListener('pointerdown', (e) => {
    if (state.phase !== 'playing') return;
    swipe = { x: e.clientX, y: e.clientY, sx: e.clientX, t: performance.now(), moved: false };
  });

  boardCanvas.addEventListener('pointermove', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    if (Math.abs(dx) >= cell && Math.abs(e.clientX - swipe.sx) >= cell) {
      const steps = Math.trunc(dx / cell);
      for (let i = 0; i < Math.abs(steps); i++) move(Math.sign(steps));
      swipe.x += steps * cell;
      swipe.moved = true;
    }
  });

  boardCanvas.addEventListener('pointerup', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.sx;
    const dy = e.clientY - swipe.y;
    const dt = performance.now() - swipe.t;
    if (!swipe.moved && Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 320) rotate(1);
    else if (dy > Math.max(40, cell * 1.6) && Math.abs(dy) > Math.abs(dx)) hardDrop();
    swipe = null;
  });

  boardCanvas.addEventListener('pointercancel', () => { swipe = null; });

  /* ---------------- boot ---------------- */
  renderNames();
  renderRecords();
  updateHUD();
  layout();
  showOverlay(
    'NAILL TETRUS',
    names.length ? 'Собери имена в линии' : 'Добавь имена в панели слева — и начнём',
    'Начать игру',
    'start',
    'Стрелки — движение, ↑ — поворот, Space — сброс'
  );

  if (window.ResizeObserver) {
    new ResizeObserver(() => layout()).observe(boardBox);
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 120));

  state.lastTime = performance.now();
  requestAnimationFrame(loop);

  /* debug hook: http://localhost:8123/?debug=1 */
  if (new URLSearchParams(location.search).has('debug')) {
    window.NAILL = {
      state,
      startGame,
      move,
      rotate,
      hardDrop,
      softDrop,
      spawn,
      lockPiece,
      makePiece,
      newBoard,
      namesRef: () => names,
      debugFit: (text, size) => {
        const cv = document.createElement('canvas');
        const g = cv.getContext('2d');
        const maxW = size * 0.9;
        const maxH = size * 0.9;
        const fit = fitText(g, String(text), maxW, maxH, size * 0.52);
        setFont(g, fit.size);
        return {
          fontSize: Number(fit.size.toFixed(2)),
          lines: fit.lines,
          widths: fit.lines.map((l) => Number(g.measureText(l).width.toFixed(2))),
          maxW: Number(maxW.toFixed(2)),
          totalH: Number((fit.lines.length * fit.lh).toFixed(2)),
          maxH: Number(maxH.toFixed(2))
        };
      }
    };
  }
})();
