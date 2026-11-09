import { t, lang } from './i18n.js';
import { $, esc, rounded, year, initials, hueOf, dateParts, ageOf } from './util.js';
import { state, people, fam, childFamily, parentFamilies, parentsOf, childrenOf, spousesOf, siblingsOf, husbandOf, birthOrder, byBirth, kindOf } from './model.js';
import { computeLayout } from './layout.js';
import { applyCrossings } from './crossings.js';

let ctx = null;
export function initRender(c) { ctx = c; }

export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const badgesEl = document.getElementById('badges');
export const viewport = $('#viewport'), world = $('#world'), edgesSvg = $('#edges'), cardsEl = $('#cards'), emptyEl = $('#empty');
export const cardEl = (id) => cardsEl.querySelector(`.card[data-id="${id}"]`);

export let marriages = [];
let displayPos = new Map(), animFrame = 0, spawnFrom = null;
export function setSpawnFrom(id) { spawnFrom = id; }

export function layout() {
  marriages = [];
  ctx.positions = computeLayout({ CARD_W: ctx.CARD_W, CARD_H: ctx.CARD_H, COUPLE_GAP: ctx.COUPLE_GAP, H_GAP: ctx.H_GAP, V_GAP: ctx.V_GAP, TREE_GAP: ctx.TREE_GAP, strictOrder: ctx.strictOrder });
}

export function render() {
  layout();
  renderCards();
  if (ctx.multi.size > 1) ctx.paintMulti(true);
  animatePositions();
  ctx.placeSheet();
  emptyEl.hidden = people().length > 0;
  $('#actions').classList.toggle('show', !!ctx.selectedId && !ctx.editingId);
  document.body.classList.toggle('has-selection', !!ctx.selectedId);
  $('#filename').textContent = ctx.shownName(ctx.fileName);
  $('#filename').classList.toggle('dirty', ctx.dirty);
  document.title = (ctx.dirty ? '• ' : '') + ctx.shownName(ctx.fileName) + ' — ' + t('app');
}

export function renderCards() {
  const seen = new Set();
  for (const p of people()) {
    let el = cardEl(p.id);
    if (el && el.classList.contains('leave')) { el.remove(); el = null; }
    const fresh = !el;
    if (fresh) { el = document.createElement('div'); el.dataset.id = p.id; cardsEl.appendChild(el); }
    el.className = 'card' + (p.id === ctx.selectedId ? ' selected' : '') + (p.id === ctx.sheetId ? ' editing' : '') + (fresh ? ' enter' : '') + (p.fate ? ' unborn' : '') + (ctx.linkFrom === p.id ? ' link-source' : '') + (!p.alive && !p.fate ? ' deceased' : '') + (state.indexPerson === p.id ? ' index' : '') + (p.gender ? ' g-' + p.gender : '');
    if (fresh) el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true });
    el.style.setProperty('--h', hueOf(p.id));
    el.innerHTML = cardHTML(p);
    seen.add(p.id);
  }
  for (const el of cardsEl.querySelectorAll('.card')) {
    if (seen.has(el.dataset.id) || el.classList.contains('leave')) continue;
    el.classList.remove('selected', 'editing'); el.classList.add('leave');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }
}

export function fateGlyph(f) {
  const g = { pregnancy: '<path d="M16 6 L27 26 H5 Z"/>', miscarriage: '<circle cx="16" cy="16" r="6" fill="currentColor"/>', abortion: '<path d="M9 9 L23 23 M23 9 L9 23"/>', stillborn: '<rect x="7" y="7" width="18" height="18" rx="2"/><path d="M9 9 L23 23 M23 9 L9 23"/>' }[f] || '';
  return `<svg class="fg" viewBox="0 0 32 32">${g}</svg>`;
}

export function cardHTML(p) {
  const canAddParent = parentsOf(p.id).length < 2;
  const dt = datesText(p);
  return `
      <div class="photo" title="${t('set_photo')}">
        ${p.fate ? fateGlyph(p.fate) : p.photo ? `<img src="${p.photo}" alt="">` : `<span>${initials(p.name)}</span>`}
        ${p.illness ? `<i class="hx ill ${p.illness}" title="${t('illness')}"></i>` : ''}${p.substance ? `<i class="hx sub ${p.substance}" title="${t('substance')}"></i>` : ''}
        <div class="cam">📷</div>
        <button class="photo-x ${p.photo ? 'has-photo' : ''}" title="${t('remove_photo')}">×</button>
      </div>
      ${birthOrder(p.id) ? `<span class="ord" title="${t('birth_order')}">${birthOrder(p.id)}</span>` : ''}
      <div class="info">
        <div class="name ${p.name ? '' : 'empty'}" title="${esc(fullName(p))}"><span class="nm">${esc(p.name) || t('unnamed')}</span>${p.birthName ? ` <span class="nee">${t('nee')} ${esc(p.birthName)}</span>` : ''}</div>
        <div class="dates ${dt ? '' : 'empty'}">${esc(dt)}${p.fate ? `<span class="fate-chip">${t('fate_' + p.fate)}</span>` : ''}</div>
      </div>
      ${canAddParent ? `<button class="plus top" data-add="parent" data-tip="${t('tip_parent')}">+</button>` : ''}
      <button class="plus left" data-add="sibling-left" data-tip="${t('tip_sibling_l')}">+</button>
      <button class="plus right" data-add="sibling-right" data-tip="${t('tip_sibling_r')}">+</button>
      <button class="plus bottom" data-add="child" data-tip="${t('tip_child')}">+</button>
      <button class="plus spouse" data-add="spouse" data-tip="${t('tip_spouse')}">♥</button>`;
}

export function applyPositions(map) {
  for (const [id, p] of map) { const el = cardEl(id); if (el) { el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; } }
  renderEdges(map);
}

export function animatePositions() {
  cancelAnimationFrame(animFrame);
  const from = new Map();
  for (const [id, p] of ctx.positions) {
    const prev = displayPos.get(id) || (spawnFrom && displayPos.get(spawnFrom)) || p;
    from.set(id, { x: prev.x, y: prev.y });
  }
  spawnFrom = null;
  const moving = [...ctx.positions].some(([id, p]) => { const f = from.get(id); return Math.abs(f.x - p.x) > .5 || Math.abs(f.y - p.y) > .5; });
  if (!moving || reduceMotion) { displayPos = new Map(ctx.positions); applyPositions(displayPos); return; }
  applyPositions(from);
  const start = performance.now(), dur = 340;
  const step = (now) => {
    const k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 3);
    displayPos = new Map();
    for (const [id, p] of ctx.positions) { const f = from.get(id); displayPos.set(id, { x: f.x + (p.x - f.x) * e, y: f.y + (p.y - f.y) * e }); }
    applyPositions(displayPos);
    if (k < 1) animFrame = requestAnimationFrame(step);
  };
  animFrame = requestAnimationFrame(step);
}

export function fullName(p) { return p.birthName ? `${p.name || t('unnamed')} (${t('nee')} ${p.birthName})` : (p.name || t('unnamed')); }

export function renderEdges(pos = ctx.positions) {
  const d = [], dPartners = [], dPast = [], dPartnersPast = [], dSlash = [], dEnded = [], rels = [], dAdopted = [], dFoster = [], dArrow = [], dHouse = [], dHi = [];
  const lineBuckets = [d, dPartners, dPast, dPartnersPast, dAdopted, dFoster];
  const capture = (on, fn) => {
    if (!on) return fn();
    const before = lineBuckets.map(b => b.length);
    fn();
    lineBuckets.forEach((b, i) => dHi.push(...b.slice(before[i])));
  };
  const isPast = (f) => !!f.ended || f.status === 'divorced' || f.status === 'separated';
  const hull = (pts) => {
    pts = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = []; for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    const upper = []; for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  };
  const houseBadges = [];
  for (const h of state.households || []) {
    const pts = [];
    for (const id of h.members) { const q = pos.get(id); if (!q) continue; const pad = 18; pts.push({ x: q.x - pad, y: q.y - pad }, { x: q.x + ctx.CARD_W + pad, y: q.y - pad }, { x: q.x - pad, y: q.y + ctx.CARD_H + pad }, { x: q.x + ctx.CARD_W + pad, y: q.y + ctx.CARD_H + pad }); }
    if (pts.length < 8) continue;
    const hp = hull(pts); let path = '';
    for (let i = 0; i < hp.length; i++) {
      const a = hp[i], b = hp[(i + 1) % hp.length], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      path += i === 0 ? `M${m.x} ${m.y}` : ` Q${a.x} ${a.y} ${m.x} ${m.y}`;
    }
    const a0 = hp[0], b0 = hp[1 % hp.length];
    dHouse.push(path + ` Q${a0.x} ${a0.y} ${(a0.x + b0.x) / 2} ${(a0.y + b0.y) / 2} Z`);
    const top = hp.reduce((m, p) => p.y < m.y ? p : m, hp[0]);
    houseBadges.push({ h, x: hp.reduce((a, p) => a + p.x, 0) / hp.length, y: top.y });
  }
  marriages = [];
  const midY = ctx.compact ? 46 : ctx.CARD_H / 2, halfW = ctx.compact ? 44 : ctx.CARD_W / 2;
  const contentBottom = (id) => { const el = ctx.compact && cardEl(id); return el ? Math.min(ctx.CARD_H, el.offsetHeight) : ctx.CARD_H; };
  const mid = (id) => { const p = pos.get(id); return { id, x: p.x, cx: p.x + ctx.CARD_W / 2, cy: p.y + midY, top: p.y, bottom: p.y + contentBottom(id) }; };
  const slashes = (mx, my, status) => {
    if (!status || status === 'married' || status === 'partners') return;
    const two = status === 'divorced' || status === 'reconciled_div';
    if (two) { dSlash.push(`M${mx - 9} ${my + 8} L${mx - 1} ${my - 8}`, `M${mx + 1} ${my + 8} L${mx + 9} ${my - 8}`); }
    else dSlash.push(`M${mx - 4} ${my + 8} L${mx + 4} ${my - 8}`);
    if (status.startsWith('reconciled')) dSlash.push(`M${mx - 10} ${my - 8} L${mx + 10} ${my + 8}`);
  };
  const lanes = [];
  const laneFor = (y, x1, x2) => {
    for (let k = 0; ; k++) {
      const used = lanes.filter(l => l.y === y && l.k === k).some(l => x1 <= l.x2 + 8 && x2 >= l.x1 - 8);
      if (!used) { lanes.push({ y, k, x1, x2 }); return k; }
    }
  };
  const fams = Object.values(state.families).sort((a, b) => b.children.length - a.children.length);
  for (const f of fams) {
    const ps = f.parents.filter(id => pos.has(id)).map(mid).sort((a, b) => a.cx - b.cx);
    const cs = f.children.filter(id => pos.has(id)).map(mid);
    const hiFam = ctx.hiPeople.size > 0 && f.parents.some(id => ctx.hiPeople.has(id)) && f.children.some(id => ctx.hiPeople.has(id));
    let origin = null;
    if (ps.length === 2) capture(hiFam, () => {
      const [a, b] = ps;
      const adjacent = Math.abs(a.top - b.top) < 1 && ![...pos.values()].some(q => Math.abs(q.y - a.top) < 1 && q.x > a.x && q.x < b.x);
      const past = isPast(f);
      const bucket = f.status === 'partners' ? (past ? dPartnersPast : dPartners) : (past ? dPast : d);
      if (adjacent) {
        bucket.push(`M${a.cx + halfW} ${a.cy} L${b.cx - halfW} ${b.cy}`);
        origin = { x: (a.cx + b.cx) / 2, y: a.cy };
        marriages.push({ f, x: origin.x, y: a.cy + 27, past });
        slashes(origin.x, a.cy, f.status);
      } else {
        const gap = Math.round((b.cx - a.cx) / (ctx.CARD_W + ctx.COUPLE_GAP));
        const stepY = Math.max(a.bottom, b.bottom) + 18 + 12 * Math.max(0, gap - 2);
        bucket.push(`M${a.cx} ${a.bottom} L${a.cx} ${stepY} L${b.cx} ${stepY} L${b.cx} ${b.bottom}`);
        origin = { x: (a.cx + b.cx) / 2, y: stepY };
        marriages.push({ f, x: origin.x, y: stepY, past });
        slashes(origin.x, stepY, f.status);
      }
    }); else if (ps.length === 1) origin = { x: ps[0].cx, y: ps[0].bottom };
    if (!cs.length) continue;
    const rowTop = Math.min(...cs.map(c => c.top));
    const xs = cs.map(c => c.cx);
    if (origin) xs.push(origin.x);
    const busY = rowTop - ctx.V_GAP / 2 - 14 * laneFor(rowTop, Math.min(...xs), Math.max(...xs));
    const sorted = [...cs].sort((a, b) => a.cx - b.cx);
    const kinds = f.kinds || {};
    const twinOf = (id) => kinds[id]?.twin || Object.keys(kinds).find(k => kinds[k].twin === id) || '';
    const bucketFor = (id) => ({ adopted: dAdopted, foster: dFoster }[kinds[id]?.type] || d);
    const drop = (c, fromX) => {
      const tw = twinOf(c.id); const other = sorted.find(x => x.id === tw);
      if (other && other.cx > c.cx) {
        const apex = (c.cx + other.cx) / 2;
        d.push(`M${fromX} ${busY} L${apex} ${busY}`);
        bucketFor(c.id).push(`M${apex} ${busY} L${c.cx} ${c.top}`); bucketFor(other.id).push(`M${apex} ${busY} L${other.cx} ${other.top}`);
        const ident = kinds[c.id]?.identical || kinds[other.id]?.identical;
        if (ident) { const m = 0.55; d.push(`M${apex + (c.cx - apex) * m} ${busY + (c.top - busY) * m} L${apex + (other.cx - apex) * m} ${busY + (other.top - busY) * m}`); }
        return true;
      }
      if (other) return true;
      bucketFor(c.id).push(`M${c.cx} ${busY} L${c.cx} ${c.top}`);
      if (kinds[c.id]?.type === 'adopted') dArrow.push(`M${c.cx - 5} ${c.top - 9} L${c.cx} ${c.top - 1} L${c.cx + 5} ${c.top - 9}`);
      return false;
    };
    const hiXs = hiFam ? sorted.filter(c => ctx.hiPeople.has(c.id)).map(c => c.cx) : [];
    if (origin) {
      d.push(rounded([origin, { x: origin.x, y: busY }, { x: sorted[0].cx, y: busY }]));
      d.push(`M${Math.min(origin.x, sorted[0].cx)} ${busY} L${Math.max(origin.x, sorted[sorted.length - 1].cx)} ${busY}`);
      if (hiXs.length) dHi.push(`M${origin.x} ${origin.y} L${origin.x} ${busY}`, `M${Math.min(origin.x, ...hiXs)} ${busY} L${Math.max(origin.x, ...hiXs)} ${busY}`);
      for (const c of sorted) capture(hiFam && ctx.hiPeople.has(c.id), () => drop(c, origin.x));
    } else {
      const f0 = sorted[0], fn = sorted[sorted.length - 1];
      d.push(`M${f0.cx} ${busY} L${fn.cx} ${busY}`);
      if (hiXs.length > 1) dHi.push(`M${Math.min(...hiXs)} ${busY} L${Math.max(...hiXs)} ${busY}`);
      for (const c of sorted) capture(hiFam && ctx.hiPeople.has(c.id), () => drop(c, f0.cx));
    }
  }
  for (const p of people()) {
    if (!p.lineEnded || childrenOf(p.id).length || !pos.has(p.id)) continue;
    const q = pos.get(p.id), cx = q.x + ctx.CARD_W / 2, y = q.y + ctx.CARD_H;
    dEnded.push(`M${cx} ${y} L${cx} ${y + 16} M${cx - 14} ${y + 16} L${cx + 14} ${y + 16}`);
  }
  const anchorPt = (from, to) => {
    const dx = to.cx - from.cx, dy = to.cy - from.cy;
    const hw = ctx.CARD_W / 2 + 6, hh = ctx.CARD_H / 2 + 6;
    const k = Math.min(hw / Math.max(Math.abs(dx), 1e-6), hh / Math.max(Math.abs(dy), 1e-6));
    return { x: from.cx + dx * k, y: from.cy + dy * k };
  };
  const relBadges = [];
  for (const r of state.relations) {
    if (!pos.has(r.from) || !pos.has(r.to)) continue;
    const a = mid(r.from), b = mid(r.to);
    const p1 = anchorPt(a, b), p2 = anchorPt(b, a);
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const nx = -(p2.y - p1.y) / len, ny = (p2.x - p1.x) / len;
    const bow = Math.min(90, len * 0.22);
    const cx = mx + nx * bow, cy = my + ny * bow;
    const q = (tt) => ({ x: (1 - tt) * (1 - tt) * p1.x + 2 * (1 - tt) * tt * cx + tt * tt * p2.x, y: (1 - tt) * (1 - tt) * p1.y + 2 * (1 - tt) * tt * cy + tt * tt * p2.y });
    const curve = `M${p1.x} ${p1.y} Q${cx} ${cy} ${p2.x} ${p2.y}`;
    const type = r.type;
    if (type === 'conflict') {
      const n = Math.max(8, Math.round(len / 14)); let z = `M${p1.x} ${p1.y}`;
      for (let i = 1; i < n; i++) { const pt = q(i / n); const sgn = i % 2 ? 1 : -1; z += ` L${pt.x + nx * 6 * sgn} ${pt.y + ny * 6 * sgn}`; }
      rels.push(`<path class="rel conflict" d="${z} L${p2.x} ${p2.y}"/>`);
    } else if (type === 'close' || type === 'fused') {
      const w = type === 'fused' ? 9 : 6;
      rels.push(`<path class="rel ${type}" style="stroke-width:${w}" d="${curve}"/><path class="rel inner" style="stroke-width:${w - 4}" d="${curve}"/>`);
      if (type === 'fused') rels.push(`<path class="rel ${type}" style="stroke-width:1.5" d="${curve}"/>`);
    } else if (type === 'cutoff') {
      const m = q(0.5), m2 = q(0.5 + 6 / len), m1 = q(0.5 - 6 / len);
      rels.push(`<path class="rel cutoff" d="${curve}"/><path class="rel cutoff" style="stroke-width:2.5" d="M${m1.x + nx * 9} ${m1.y + ny * 9} L${m1.x - nx * 9} ${m1.y - ny * 9} M${m2.x + nx * 9} ${m2.y + ny * 9} L${m2.x - nx * 9} ${m2.y - ny * 9}"/>`);
      void m;
    } else if (type === 'focused') {
      rels.push(`<path class="rel focused" marker-end="url(#arrow-head)" d="${curve}"/>`);
    } else {
      rels.push(`<path class="rel ${esc(type)}" d="${curve}"/>`);
    }
    relBadges.push({ r, x: (p1.x + 2 * cx + p2.x) / 4, y: (p1.y + 2 * cy + p2.y) / 4 });
  }
  const defs = `<defs><marker id="arrow-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="currentColor" style="color: var(--text)"/></marker></defs>`;
  if (ctx.crossMode !== 'default') applyCrossings([d, dAdopted, dFoster, dPartners, dPast, dPartnersPast, dHi], ctx.crossMode);
  edgesSvg.innerHTML = defs + `<path class="house" d="${dHouse.join(' ')}"/><path d="${d.join(' ')}"/><path class="adopted" d="${dAdopted.join(' ')}"/><path class="foster" d="${dFoster.join(' ')}"/><path d="${dArrow.join(' ')}"/><path class="partners" d="${dPartners.join(' ')}"/><path class="past" d="${dPast.join(' ')}"/><path class="partners past" d="${dPartnersPast.join(' ')}"/><path class="slash" d="${dSlash.join(' ')}"/><path class="ended" d="${dEnded.join(' ')}"/><path class="hi" d="${dHi.join(' ')}"/>` + rels.join('');
  badgesEl.innerHTML = '';
  for (const { h, x, y } of houseBadges) {
    const el = document.createElement('div');
    el.className = 'relbadge house'; el.dataset.hid = h.id; el.title = t('household_title');
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.textContent = '⌂ ' + h.members.length;
    badgesEl.appendChild(el);
  }
  for (const { r, x, y } of relBadges) {
    const el = document.createElement('div');
    el.className = 'relbadge'; el.dataset.rid = r.id; el.title = t('relation');
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.textContent = r.label || t('rel_' + r.type);
    badgesEl.appendChild(el);
  }
  for (const m of marriages) {
    const el = document.createElement('div');
    const txt = marriageText(m.f);
    el.className = 'marriage' + (txt ? '' : ' empty') + (m.past ? ' past' : '');
    el.dataset.fid = m.f.id; el.title = t('marriage_dates');
    el.style.left = m.x + 'px'; el.style.top = m.y + 'px';
    el.innerHTML = `<span class="h">♥${marriageOrdinal(m.f)}</span>${esc(txt)}`;
    badgesEl.appendChild(el);
  }
}

export function marriageOrdinal(f) {
  let best = 0;
  for (const pid of f.parents) {
    const fams = parentFamilies(pid);
    if (fams.length < 2) continue;
    best = Math.max(best, fams.indexOf(f) + 1);
  }
  return best ? String(best).replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]) : '';
}

export function marriageText(f) {
  const mark = f.status === 'divorced' ? '⚡ ' : f.status === 'separated' ? '⁄ ' : f.status?.startsWith('reconciled') ? '↺ ' : '';
  if (!f.married && !f.ended) return mark.trim();
  const widowed = f.parents.map(id => state.people[id]).filter(p => p && !p.alive);
  const death = widowed.length ? (widowed.map(p => year(p.death)).filter(Boolean).sort()[0] || '?') : '';
  const end = f.ended ? year(f.ended) : (f.status === 'divorced' || f.status === 'separated') ? '?' : death ? '† ' + death : t('present');
  return mark + `${year(f.married) || '?'} – ${end}`;
}

export const statusHint = (st) => t({ married: 'lg_married', partners: 'lg_partners', separated: 'lg_separated', divorced: 'lg_divorced', reconciled_sep: 'lg_rec_sep', reconciled_div: 'lg_rec_div' }[st] || 'lg_married');

export function datesText(p) {
  if (!p.birth && (p.alive || !p.death)) return '';
  const born = p.birth ? fmtDate(p.birth) : '?';
  if (p.alive) { const a = ageOf(p.birth); return `${t('b')} ${born}` + (a !== null ? ` · ${a} ${t('years')}` : ''); }
  const died = p.death ? fmtDate(p.death) : '?';
  const a = p.birth && p.death ? ageOf(p.birth, p.death) : null;
  return `${born} – ${died}` + (a !== null ? ` (${a})` : '');
}

export function fmtDate(s) {
  if (!s) return '';
  const parts = dateParts(s); if (!parts) return s;
  const [y, m, d] = parts;
  const date = new Date(y, (m || 1) - 1, d || 1);
  const opts = { year: 'numeric', ...(m && { month: d ? 'short' : 'long' }), ...(d && { day: 'numeric' }) };
  return date.toLocaleDateString(lang, opts).replace(/\s*г\.$/, '');
}

export function refreshCard(id) {
  const p = state.people[id], el = cardEl(id); if (!p || !el) return;
  el.innerHTML = cardHTML(p);
  el.classList.toggle('unborn', !!p.fate); el.classList.toggle('deceased', !p.alive && !p.fate); el.classList.toggle('index', state.indexPerson === id);
  for (const g of ['m', 'f', 'x']) el.classList.toggle('g-' + g, p.gender === g);
}
