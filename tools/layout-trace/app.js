import { OPTS, runTrace, alignSteps, rowDiffers } from './diff.mjs';
const $ = (s) => document.querySelector(s);

const samples = {
  couple() {
    const p = (id, name, gender, birth = '') => [id, { id, name, gender, birth }];
    return {
      people: Object.fromEntries([
        p('h', 'Husband', 'm', '1980'),
        p('w', 'Wife', 'f', '1982'),
        p('hf', 'His father', 'm', '1950'),
        p('hm', 'His mother', 'f', '1952'),
        p('wf', 'Her father', 'm', '1951'),
        p('wm', 'Her mother', 'f', '1955'),
        p('k1', 'Child 1', 'f', '2010'),
        p('k2', 'Child 2', 'm', '2013'),
        p('hb', 'His brother', 'm', '1984'),
        p('ws', 'Her sister', 'f', '1979'),
      ]),
      families: {
        f1: { id: 'f1', parents: ['h', 'w'], children: ['k1', 'k2'] },
        f2: { id: 'f2', parents: ['hf', 'hm'], children: ['h', 'hb'] },
        f3: { id: 'f3', parents: ['wf', 'wm'], children: ['ws', 'w'] },
      },
      indexPerson: 'h',
      collapsed: [],
    };
  },
  marriages() {
    const p = (id, name, gender, birth = '') => [id, { id, name, gender, birth }];
    return {
      people: Object.fromEntries([
        p('m', 'Man', 'm', '1950'),
        p('w1', 'First wife', 'f', '1952'),
        p('w2', 'Second wife', 'f', '1958'),
        p('a', 'Son of 1st', 'm', '1975'),
        p('b', 'Daughter of 2nd', 'f', '1985'),
        p('c', 'Son of 2nd', 'm', '1988'),
        p('x', 'Her first husband', 'm', '1948'),
        p('d', 'Her son', 'm', '1972'),
      ]),
      families: {
        f1: { id: 'f1', parents: ['m', 'w1'], children: ['a'], married: '1974' },
        f2: { id: 'f2', parents: ['m', 'w2'], children: ['b', 'c'], married: '1984' },
        f3: { id: 'f3', parents: ['x', 'w1'], children: ['d'], married: '1971', ended: '1973' },
      },
      indexPerson: 'm',
      collapsed: [],
    };
  },
  pulled() {
    const p = (id, name, gender, birth = '') => [id, { id, name, gender, birth }];
    return {
      people: Object.fromEntries([
        p('f', 'Father', 'm', '1940'),
        p('mo', 'Mother', 'f', '1942'),
        p('s1', 'Son 1', 'm', '1965'),
        p('d', 'Daughter', 'f', '1967'),
        p('s2', 'Son 2', 'm', '1970'),
        p('h', 'Her husband', 'm', '1964'),
        p('hf', 'His father', 'm', '1935'),
        p('hm', 'His mother', 'f', '1938'),
        p('g', 'Grandchild', 'f', '1990'),
      ]),
      families: {
        f1: { id: 'f1', parents: ['f', 'mo'], children: ['s1', 'd', 's2'] },
        f2: { id: 'f2', parents: ['hf', 'hm'], children: ['h'] },
        f3: { id: 'f3', parents: ['h', 'd'], children: ['g'] },
      },
      indexPerson: 'f',
      collapsed: [],
    };
  },
};

function parseFile(buf) {
  const bytes = new Uint8Array(buf);
  const magic = new TextDecoder().decode(bytes.subarray(0, 5));
  if (magic === 'FTREE') {
    const len = new DataView(buf).getUint32(6, true);
    return JSON.parse(new TextDecoder().decode(bytes.subarray(10, 10 + len)));
  }
  const text = new TextDecoder().decode(bytes);
  const j = JSON.parse(text);
  return j.people ? j : j.state;
}

async function loadEngines() {
  const after = (await import('../../src/engine.js')).computeLayout;
  let before = null;
  try {
    before = (await import('./engine-before.js')).computeLayout;
  } catch {}
  return { before, after };
}

function run(engine, model) {
  const { trace, positions, hidden, ms } = runTrace(engine, model);
  const units = trace.units || [];
  const unitOf = new Map();
  for (const u of units) for (const m of u.members) unitOf.set(m, u);
  const unitById = new Map(units.map((u) => [u.id, u]));
  const shown = [];
  let cur = new Set(),
    phase = null;
  for (const s of trace) {
    if (s.phase !== phase) {
      phase = s.phase;
      if (phase === 'tree' || phase === 'coords') cur = new Set();
      else cur = new Set(units.map((u) => u.id));
    }
    if (phase === 'tree' && s.unit != null) cur.add(s.unit);
    if (phase === 'coords' && s.reveal) for (const id of s.reveal) cur.add(id);
    shown.push(new Set(cur));
  }
  return { trace, positions, hidden, units, unitOf, unitById, shown, ms };
}

const state = {
  model: null,
  engines: null,
  before: null,
  after: null,
  rows: [],
  i: 0,
  playing: null,
  linked: true,
  compare: true,
  follow: true,
  target: null,
  cam: { x: 40, y: 60, s: 0.5 },
  camBefore: { x: 40, y: 60, s: 0.5 },
  anim: new Map(),
};

const panes = [
  { el: $('.pane.before'), key: 'before' },
  { el: $('.pane.after'), key: 'after' },
];
for (const p of panes) {
  p.canvas = p.el.querySelector('canvas');
  p.ctx = p.canvas.getContext('2d');
  p.desc = p.el.querySelector('.desc');
}

function camFor(p) {
  return state.linked || p.key === 'after' ? state.cam : state.camBefore;
}

function rowOf(run, idx) {
  return run.trace[Math.min(idx, run.trace.length - 1)];
}

function stepIndex(key) {
  const r = state.rows[state.i];
  if (!r) return 0;
  const k = key === 'before' ? 0 : 1;
  if (r[k] != null) return r[k];
  for (let i = state.i; i >= 0; i--) if (state.rows[i][k] != null) return state.rows[i][k];
  return 0;
}

function draw(p) {
  const run = state[p.key];
  const { canvas, ctx } = p;
  const w = canvas.clientWidth,
    h = canvas.clientHeight,
    dpr = devicePixelRatio || 1;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!run) {
    ctx.fillStyle = '#6b7286';
    ctx.font = '14px system-ui';
    ctx.fillText('No snapshot. Run: npm run layout:snapshot', 20, 40);
    return;
  }
  const cam = camFor(p);
  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.scale(cam.s, cam.s);
  const idx = stepIndex(p.key);
  const step = run.trace[idx];
  const shown = run.shown[idx] || new Set();
  const focus = new Set(step?.focus || []);
  const now = performance.now();
  const { CARD_W, CARD_H, V_GAP } = OPTS;
  const rowY = (r) => r * (CARD_H + V_GAP);
  // edges
  ctx.lineWidth = 2 / cam.s;
  ctx.strokeStyle = '#c3c8d6';
  for (const u of run.units) {
    if (!shown.has(u.id)) continue;
    for (const kid of u.kids) {
      const k = run.unitById.get(kid);
      if (!shown.has(k.id)) continue;
      const x1 = u.x + u.width / 2,
        y1 = rowY(u.row) + CARD_H,
        x2 = k.x + k.width / 2,
        y2 = rowY(k.row);
      const my = (y1 + y2) / 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1, my);
      ctx.lineTo(x2, my);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    for (const [side, list] of [
      ['left', u.left],
      ['right', u.right],
    ]) {
      for (const bid of list) {
        const b = run.unitById.get(bid);
        if (!shown.has(b.id)) continue;
        const anchor = u.members.find((m) => anchorOf(run, u, m) === b);
        const ax = anchor != null ? u.x + u.members.indexOf(anchor) * (CARD_W + OPTS.COUPLE_GAP) + CARD_W / 2 : u.x;
        ctx.save();
        ctx.strokeStyle = side === 'left' ? '#7aa0ff' : '#ff9ac0';
        ctx.setLineDash([6 / cam.s, 6 / cam.s]);
        ctx.beginPath();
        ctx.moveTo(b.x + b.width / 2, rowY(b.row) + CARD_H);
        ctx.lineTo(b.x + b.width / 2, rowY(b.row) + CARD_H + V_GAP / 2);
        ctx.lineTo(ax, rowY(b.row) + CARD_H + V_GAP / 2);
        ctx.lineTo(ax, rowY(u.row));
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  // contour bars of the current node
  if (step?.contour && step.unit != null) {
    const u = run.unitById.get(step.unit);
    ctx.fillStyle = 'rgba(79,99,255,.10)';
    ctx.strokeStyle = 'rgba(79,99,255,.45)';
    ctx.lineWidth = 1 / cam.s;
    for (const [r, segs] of step.contour)
      for (const [l, rr] of segs) {
        ctx.fillRect(u.x + l, rowY(r) - 10, rr - l, CARD_H + 20);
        ctx.strokeRect(u.x + l, rowY(r) - 10, rr - l, CARD_H + 20);
      }
  }
  // cards
  ctx.font = `${Math.max(12, 20)}px system-ui`;
  ctx.textBaseline = 'middle';
  for (const u of run.units) {
    if (!shown.has(u.id)) continue;
    const t0 = state.anim.get(p.key + ':' + u.id);
    const a = t0 == null ? 1 : Math.min(1, (now - t0) / 350);
    for (const m of u.members) {
      const pos = run.positions.get(m);
      if (!pos) continue;
      const hot = focus.has(m);
      const y = pos.y - (1 - a) * 30;
      ctx.globalAlpha = a * (hot ? 1 : focus.size ? 0.55 : 0.9);
      ctx.fillStyle =
        state.model.people[m]?.gender === 'm'
          ? '#e4ecff'
          : state.model.people[m]?.gender === 'f'
            ? '#ffe6ef'
            : '#f1f2f6';
      ctx.strokeStyle = hot ? '#4f63ff' : '#c7ccda';
      ctx.lineWidth = (hot ? 4 : 1.5) / cam.s;
      roundRect(ctx, pos.x, y, CARD_W, CARD_H, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1d2233';
      const name = (state.model.people[m]?.name || m).trim();
      ctx.fillText(fitText(ctx, name, CARD_W - 28), pos.x + 14, y + CARD_H / 2 - 12);
      ctx.fillStyle = '#6b7286';
      ctx.font = '15px system-ui';
      ctx.fillText(`${state.model.people[m]?.birth || ''}  row ${u.row}`, pos.x + 14, y + CARD_H / 2 + 16);
      ctx.font = '20px system-ui';
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function anchorOf(run, u, m) {
  for (const bid of [...u.left, ...u.right]) {
    const b = run.unitById.get(bid);
    const fam = Object.values(state.model.families).find((f) => f.children.includes(m));
    if (fam && fam.parents.some((pp) => b.members.includes(pp))) return b;
  }
  return null;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fitText(ctx, s, w) {
  if (ctx.measureText(s).width <= w) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1);
  return s + '…';
}

function describe(p) {
  const run = state[p.key];
  if (!run) {
    p.desc.innerHTML = '';
    return;
  }
  const idx = stepIndex(p.key);
  const s = run.trace[idx];
  const other = state[p.key === 'before' ? 'after' : 'before'];
  const r = state.rows[state.i];
  const paired = r && r[0] != null && r[1] != null;
  const diff = state.compare && other && paired && other.trace[r[p.key === 'before' ? 1 : 0]].detail !== s.detail;
  p.desc.className = 'desc' + (diff || (state.compare && other && !paired) ? ' diff' : '');
  p.desc.innerHTML = `<span class="phase">${s.phase}</span><span class="title">${esc(s.title)}</span><div class="detail">${esc(s.detail)}</div><div class="muted">step ${idx + 1} of ${run.trace.length}${idx === run.trace.length - 1 ? ` · ${run.ms.toFixed(1)} ms` : ''}</div>`;
}
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function renderSteps() {
  const el = $('#steps');
  const b = state.before,
    a = state.after;
  el.innerHTML = state.rows
    .map(([i, j], k) => {
      const sb = i != null ? b.trace[i] : null,
        sa = j != null ? a.trace[j] : null;
      const diff = (sb && sa && sb.detail !== sa.detail) || !sb || !sa;
      const cell = (s) =>
        s
          ? `<div><span class="ph">${s.phase[0].toUpperCase()}</span>${esc(s.title)}</div>`
          : '<div class="empty"></div>';
      return `<div class="row${diff ? ' diff' : ''}${!sb || !sa ? ' gap' : ''}" data-k="${k}">${cell(sb)}${cell(sa)}</div>`;
    })
    .join('');
  el.onclick = (e) => {
    const r = e.target.closest('.row');
    if (r) go(+r.dataset.k);
  };
}

function go(i) {
  const prevShown = panes.map((p) => (state[p.key] ? state[p.key].shown[stepIndex(p.key)] : new Set()));
  state.i = Math.max(0, Math.min(state.rows.length - 1, i));
  $('#pos').value = state.i;
  for (const [n, p] of panes.entries()) {
    const run = state[p.key];
    if (!run) continue;
    const now = run.shown[stepIndex(p.key)];
    for (const id of now) if (!prevShown[n].has(id)) state.anim.set(p.key + ':' + id, performance.now());
  }
  $('#stat').textContent = `${state.i + 1} / ${state.rows.length}`;
  document.querySelectorAll('#steps .row').forEach((r) => r.classList.toggle('cur', +r.dataset.k === state.i));
  document.querySelector('#steps .row.cur')?.scrollIntoView({ block: 'nearest' });
  for (const p of panes) describe(p);
  if (state.follow) followFocus();
}

function followFocus() {
  const run = state.after || state.before;
  const step = run.trace[stepIndex(state.after ? 'after' : 'before')];
  const ids = step?.focus?.length ? step.focus : [...run.positions.keys()];
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const id of ids) {
    const pos = run.positions.get(id);
    if (!pos) continue;
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x + OPTS.CARD_W);
    minY = Math.min(minY, pos.y);
    maxY = Math.max(maxY, pos.y + OPTS.CARD_H);
  }
  if (!isFinite(minX)) return;
  const c = panes[1].canvas;
  const pad = 2.5;
  const s = Math.max(
    0.12,
    Math.min(0.7, Math.min(c.clientWidth / ((maxX - minX) * pad), c.clientHeight / ((maxY - minY + 600) * 1.2))),
  );
  state.target = { s, x: c.clientWidth / 2 - ((minX + maxX) / 2) * s, y: c.clientHeight / 2 - ((minY + maxY) / 2) * s };
}

function frame() {
  if (state.target) {
    const t = state.target,
      c = state.cam,
      k = 0.15;
    c.x += (t.x - c.x) * k;
    c.y += (t.y - c.y) * k;
    c.s += (t.s - c.s) * k;
    if (Math.abs(t.x - c.x) < 0.5 && Math.abs(t.y - c.y) < 0.5 && Math.abs(t.s - c.s) < 0.001) state.target = null;
    if (state.linked) state.camBefore = state.cam;
  }
  for (const p of panes) if (p.el.offsetParent !== null) draw(p);
  requestAnimationFrame(frame);
}

function fit() {
  const run = state.after || state.before;
  if (!run) return;
  let minX = Infinity,
    maxX = -Infinity,
    maxY = 0;
  for (const pos of run.positions.values()) {
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x + OPTS.CARD_W);
    maxY = Math.max(maxY, pos.y + OPTS.CARD_H);
  }
  const p = panes[1].canvas;
  const s = Math.min((p.clientWidth - 40) / (maxX - minX), (p.clientHeight - 40) / maxY, 1);
  state.target = null;
  state.cam = { x: 20 - minX * s, y: 40, s };
  state.camBefore = state.linked ? state.cam : { ...state.cam };
}

function load(model) {
  state.model = model;
  state.after = run(state.engines.after, model);
  state.before = state.engines.before ? run(state.engines.before, model) : null;
  state.rows =
    state.before && state.compare
      ? alignSteps(state.before.trace, state.after.trace)
      : state.after.trace.map((_, j) => [null, j]);
  if (!state.compare || !state.before) state.rows = state.after.trace.map((_, j) => [state.before ? j : null, j]);
  $('#pos').max = state.rows.length - 1;
  state.anim.clear();
  renderSteps();
  fit();
  go(0);
  const diffs = state.rows.filter((r) => rowDiffers(state.before, state.after, r)).length;
  $('#snapinfo').textContent = state.before ? `${diffs} differing steps` : 'no snapshot (npm run layout:snapshot)';
}

function setCompare(on) {
  state.compare = on && !!state.before;
  $('#compare').classList.toggle('on', state.compare);
  $('main').classList.toggle('single', !state.compare);
  if (state.model) load(state.model);
}

async function pickSample(v) {
  if (v === 'fixture') {
    const r = await fetch('../../tests/fixtures/wide-tree.json');
    load(await r.json());
  } else load(samples[v]());
}

// camera interaction
for (const p of panes) {
  let drag = null;
  p.canvas.addEventListener('pointerdown', (e) => {
    state.target = null;
    drag = { x: e.clientX, y: e.clientY, cam: { ...camFor(p) } };
    p.canvas.setPointerCapture(e.pointerId);
  });
  p.canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const cam = camFor(p);
    cam.x = drag.cam.x + e.clientX - drag.x;
    cam.y = drag.cam.y + e.clientY - drag.y;
  });
  p.canvas.addEventListener('pointerup', () => (drag = null));
  p.canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      state.target = null;
      const cam = camFor(p);
      const rect = p.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left,
        my = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        const k = Math.exp(-e.deltaY * 0.01);
        cam.x = mx - (mx - cam.x) * k;
        cam.y = my - (my - cam.y) * k;
        cam.s *= k;
      } else {
        cam.x -= e.deltaX;
        cam.y -= e.deltaY;
      }
    },
    { passive: false },
  );
}

$('#prev').onclick = () => go(state.i - 1);
$('#next').onclick = () => go(state.i + 1);
$('#fit').onclick = fit;
$('#pos').oninput = (e) => go(+e.target.value);
$('#play').onclick = () => {
  if (state.playing) {
    clearInterval(state.playing);
    state.playing = null;
    $('#play').textContent = 'Play';
    return;
  }
  $('#play').textContent = 'Pause';
  state.playing = setInterval(() => {
    if (state.i >= state.rows.length - 1) return $('#play').onclick();
    go(state.i + 1);
  }, +$('#speed').value);
};
$('#speed').onchange = () => {
  if (state.playing) {
    $('#play').onclick();
    $('#play').onclick();
  }
};
$('#compare').onclick = () => setCompare(!state.compare);
$('#link').onclick = () => {
  state.linked = !state.linked;
  $('#link').classList.toggle('on', state.linked);
  if (state.linked) state.camBefore = state.cam;
  else state.camBefore = { ...state.cam };
};
$('#link').classList.add('on');
$('#follow').onclick = () => {
  state.follow = !state.follow;
  $('#follow').classList.toggle('on', state.follow);
  if (state.follow) followFocus();
};
$('#firstdiff').onclick = () => {
  const k = state.rows.findIndex((r) => rowDiffers(state.before, state.after, r));
  if (k >= 0) go(k);
};
$('#sample').onchange = (e) => pickSample(e.target.value);
$('#file').onchange = async (e) => {
  const f = e.target.files[0];
  if (f) load(parseFile(await f.arrayBuffer()));
};
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('drop');
});
document.addEventListener('dragleave', () => document.body.classList.remove('drop'));
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('drop');
  const f = e.dataTransfer.files[0];
  if (f) load(parseFile(await f.arrayBuffer()));
});
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'ArrowRight') go(state.i + 1);
  else if (e.key === 'ArrowLeft') go(state.i - 1);
  else if (e.key === ' ') {
    e.preventDefault();
    $('#play').onclick();
  } else if (e.key === 'f') fit();
});

state.engines = await loadEngines();
await pickSample('fixture');
if (!state.before) setCompare(false);
frame();
