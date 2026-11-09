import { t, lang, setLangValue, LANG_KEY } from './i18n.js';
import { state, setState, people, fam, emptyState, childFamily, parentFamilies, moveMarriage, replaceParent, parentsOf, childrenOf, spousesOf, siblingsOf, newPerson, newFamily, addParent, addChild, addSpouse, addSibling, deletePerson, ancestorsOf, linkSpouse, linkChild, addRelation, joinHousehold, birthOrder, moveChild, husbandOf, coupled, kindOf, setKind, nearestRelative, byBirth } from './model.js';
import { computeLayout } from './layout.js';
import { I18N } from './i18n.js';
import { uid, esc, dateParts, isExactDate, rounded, year, initials, hueOf, dataUrlToBytes, bytesToDataUrl, ageOf } from './util.js';
import { applyCrossings } from './crossings.js';

function applyI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { (el.querySelector(':scope > .lbl') || el).textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  for (const [act, k] of [['undo', 'undo_t'], ['redo', 'redo_t'], ['zoomin', 'zoomin_t'], ['zoomout', 'zoomout_t']]) document.querySelector(`[data-act=${act}]`).title = t(k);
  const [[title], ...sections] = t('help');
  document.querySelector('#help .panel').innerHTML = `<h2>${esc(title)}</h2><p style="margin:-6px 0 4px;font-size:13px;color:var(--muted)"><kbd>G</kbd> ${esc(t('legend_t'))}</p>` + sections.map(([h, rows]) =>
    `<h3>${esc(h)}</h3><div class="grid">` + rows.map(([a, b]) => `<div><span>${esc(a)}</span><span>${b.split(' ').map(x => /^(?:[⌘⇧]*[A-Z0-9]{1,2}|[↑↓←→⌫+−?0]+|Enter|Esc|Tab|Del|Space|Leertaste)$/.test(x) ? `<kbd>${esc(x)}</kbd>` : esc(x)).join(' ')}</span></div>`).join('') + '</div>').join('');
  document.getElementById('lang').value = lang;
}
function renderLegend() {
  const card = (x, y, w = 36, h = 18, extra = '') => `<rect class="c" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"${extra}/>`;
  const couple = (mid) => card(6, 13) + card(70, 13) + mid;
  const kids = (lines) => card(38, 2, 36, 14) + `<path d="M56 16 V24"/>` + lines;
  const groups = [
    ['lg_couples', [
      ['lg_married', couple(`<path d="M42 22 H70"/>`)],
      ['lg_partners', couple(`<path d="M42 22 H70" stroke-dasharray="4 3"/>`)],
      ['lg_separated', couple(`<path d="M42 22 H70"/><path class="r" d="M53 29 L59 15"/>`)],
      ['lg_divorced', couple(`<path d="M42 22 H70"/><path class="r" d="M50 29 L56 15 M58 29 L64 15"/>`)],
      ['lg_rec_sep', couple(`<path d="M42 22 H70"/><path class="r" d="M53 29 L59 15 M48 15 L64 29"/>`)],
      ['lg_rec_div', couple(`<path d="M42 22 H70"/><path class="r" d="M50 29 L56 15 M58 29 L64 15 M46 15 L66 29"/>`)],
      ['lg_ordinal', card(2, 13, 30) + card(41, 13, 30) + card(80, 13, 30) + `<path d="M32 22 H41 M71 22 H80"/><text x="31" y="38" font-size="9" fill="currentColor" stroke="none">♥¹</text><text x="71" y="38" font-size="9" fill="currentColor" stroke="none">♥²</text>`],
    ]],
    ['lg_children', [
      ['lg_bio', kids(`<path d="M30 24 H82 M30 24 V30 M56 24 V30 M82 24 V30"/>` + card(14, 30, 32, 12) + card(40, 30, 32, 12) + card(66, 30, 32, 12))],
      ['lg_adopted', kids(`<path d="M56 24 V36" stroke-dasharray="2 4"/><path d="M52 31 L56 36 L60 31"/>` + card(40, 36, 32, 8))],
      ['lg_foster', kids(`<path d="M56 24 V36" stroke-dasharray="5 4"/>` + card(40, 36, 32, 8))],
      ['lg_twins', kids(`<path d="M56 24 L42 36 M56 24 L70 36"/>` + card(26, 36, 32, 8) + card(54, 36, 32, 8))],
      ['lg_identical', kids(`<path d="M56 24 L42 36 M56 24 L70 36 M48 31 H64"/>` + card(26, 36, 32, 8) + card(54, 36, 32, 8))],
      ['lg_pregnancy', `<path d="M56 8 L72 36 H40 Z"/>`],
      ['lg_miscarriage', `<circle class="f" cx="56" cy="22" r="7"/>`],
      ['lg_abortion', `<path d="M48 14 L64 30 M64 14 L48 30"/>`],
      ['lg_stillborn', `<rect x="44" y="10" width="24" height="24" rx="3"/><path d="M48 14 L64 30 M64 14 L48 30"/>`],
    ]],
    ['lg_people', [
      ['lg_gender', `<rect class="c" x="16" y="8" width="28" height="28" rx="5"/><circle class="c" cx="82" cy="22" r="14"/>`],
      ['lg_deceased', `<circle class="c" cx="56" cy="22" r="14"/><path d="M46 12 L66 32 M66 12 L46 32"/>`],
      ['lg_index', `<rect class="c" x="30" y="8" width="52" height="28" rx="6"/><rect x="26" y="4" width="60" height="36" rx="9"/>`],
      ['lg_illness', `<circle class="c" cx="40" cy="22" r="14"/><path class="t" d="M40 8 A14 14 0 0 0 40 36 Z"/><circle class="c" cx="78" cy="22" r="14"/><path class="hz" d="M78 8 A14 14 0 0 0 78 36 Z"/>`],
      ['lg_substance', `<circle class="c" cx="40" cy="22" r="14"/><path class="t" d="M26 22 A14 14 0 0 0 54 22 Z"/><circle class="c" cx="78" cy="22" r="14"/><path class="hz" d="M64 22 A14 14 0 0 0 92 22 Z"/>`],
      ['lg_ended', card(38, 4, 36, 18) + `<path class="m" d="M56 22 V32 M44 32 H68"/>`],
      ['lg_household', card(14, 10, 36, 14) + card(62, 10, 36, 14) + card(38, 28, 36, 12) + `<path class="m" d="M8 20 Q4 4 30 4 H84 Q108 4 104 20 Q102 42 76 42 H34 Q10 42 8 20 Z" stroke-dasharray="5 4"/>`],
    ]],
    ['lg_relations', [
      ['rel_close', card(2, 13, 30) + card(80, 13, 30) + `<path d="M32 22 H80" stroke-width="6"/><path class="bgline" d="M32 22 H80" stroke-width="2"/>`],
      ['rel_fused', card(2, 13, 30) + card(80, 13, 30) + `<path d="M32 22 H80" stroke-width="9"/><path class="bgline" d="M32 22 H80" stroke-width="5"/><path d="M32 22 H80" stroke-width="1.5"/>`],
      ['rel_conflict', card(2, 13, 30) + card(80, 13, 30) + `<path class="r" d="M32 22 L38 16 L44 28 L50 16 L56 28 L62 16 L68 28 L74 16 L80 22"/>`],
      ['rel_distant', card(2, 13, 30) + card(80, 13, 30) + `<path class="m" d="M32 22 H80" stroke-dasharray="7 5"/>`],
      ['rel_cutoff', card(2, 13, 30) + card(80, 13, 30) + `<path d="M32 22 H80 M52 14 V30 M60 14 V30"/>`],
      ['rel_focused', card(2, 13, 30) + card(80, 13, 30) + `<path d="M32 22 H76 M70 16 L78 22 L70 28"/>`],
    ]],
  ];
  const hintFor = (k) => k.startsWith('rel_') ? t('hint_' + k) : t(k);
  const defs = `<defs><pattern id="lg-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="5" fill="color-mix(in srgb, var(--text) 35%, transparent)"/></pattern></defs>`;
  $('#legend .panel').innerHTML = `<h2>${esc(t('legend_title'))}</h2>` + groups.map(([g, items]) =>
    `<h3>${esc(t(g))}</h3><div class="grid">` + items.map(([k, svg]) => `<div class="item"><svg viewBox="0 0 112 44">${defs}${svg}</svg><span>${esc(hintFor(k))}</span></div>`).join('') + '</div>').join('')
    + `<h3>${esc(t('lg_cross'))}</h3><div class="xsel">` + [
      ['default', `<path d="M10 22 H102 M56 4 V40"/>`],
      ['jump', `<path d="M10 22 H50 A6 6 0 0 1 62 22 H102 M56 4 V40"/>`],
      ['gap', `<path d="M10 22 H102 M56 4 V16 M56 28 V40"/>`],
    ].map(([m, svg]) => `<button type="button" data-x="${m}" class="${crossMode === m ? 'on' : ''}"><svg viewBox="0 0 112 44">${svg}</svg><span>${esc(t('x_' + m))}</span></button>`).join('') + '</div>'
    + `<h3>${esc(t('lg_sibs'))}</h3><div class="xsel">` + [
      ['0', `<rect class="c" x="4" y="14" width="24" height="16" rx="3"/><rect class="c" x="44" y="14" width="24" height="16" rx="3"/><rect class="c" x="84" y="14" width="24" height="16" rx="3"/><text x="16" y="10" font-size="9" fill="currentColor" stroke="none" text-anchor="middle">1</text><text x="56" y="10" font-size="9" fill="currentColor" stroke="none" text-anchor="middle">3</text><text x="96" y="10" font-size="9" fill="currentColor" stroke="none" text-anchor="middle">2</text>`],
      ['1', `<rect class="c" x="4" y="14" width="24" height="16" rx="3"/><rect class="c" x="44" y="14" width="24" height="16" rx="3"/><rect class="c" x="84" y="14" width="24" height="16" rx="3"/><text x="16" y="10" font-size="9" fill="currentColor" stroke="none" text-anchor="middle">1</text><text x="56" y="10" font-size="9" fill="currentColor" stroke="none" text-anchor="middle">2</text><text x="96" y="10" font-size="9" fill="currentColor" stroke="none" text-anchor="middle">3</text>`],
    ].map(([m, svg]) => `<button type="button" data-s="${m}" class="${(strictOrder ? '1' : '0') === m ? 'on' : ''}"><svg viewBox="0 0 112 44">${svg}</svg><span>${esc(t('sibs_' + m))}</span></button>`).join('')
    + `<label class="xcheck"><input type="checkbox" id="lg-badges" ${orderBadges ? 'checked' : ''}><span>${esc(t('show_order_badges'))}</span></label></div>`;
}
function setLang(l) {
  setLangValue(l); localStorage.setItem(LANG_KEY, l);
  if (fileName === I18N.en.untitled || Object.values(I18N).some(d => d.untitled === fileName)) fileName = t('untitled');
  applyI18n(); renderLegend(); render();
}

let CARD_W = 280, CARD_H = 112, COUPLE_GAP = 76;
const H_GAP = 36, V_GAP = 96, TREE_GAP = 100;
const COMPACT_KEY = 'familytree.compact', CROSS_KEY = 'familytree.cross', STRICT_KEY = 'familytree.strictOrder';
let strictOrder = localStorage.getItem(STRICT_KEY) === '1';
const BADGE_KEY = 'familytree.orderBadges';
let orderBadges = localStorage.getItem(BADGE_KEY) !== '0';
function setOrderBadges(on) { orderBadges = on; localStorage.setItem(BADGE_KEY, on ? '1' : '0'); document.body.classList.toggle('no-ord', !on); renderLegend(); }
function setStrictOrder(on) { strictOrder = on; localStorage.setItem(STRICT_KEY, on ? '1' : ''); renderLegend(); render(); }
let crossMode = ['default', 'jump', 'gap'].includes(localStorage.getItem(CROSS_KEY)) ? localStorage.getItem(CROSS_KEY) : 'gap';
function setCrossMode(m) { crossMode = m; localStorage.setItem(CROSS_KEY, m); renderLegend(); render(); }
let compact = false;
function setCompact(on) {
  compact = on; localStorage.setItem(COMPACT_KEY, on ? '1' : '');
  [CARD_W, CARD_H, COUPLE_GAP] = on ? [150, 164, 40] : [280, 112, 76];
  document.documentElement.style.setProperty('--card-w', CARD_W + 'px');
  document.documentElement.style.setProperty('--card-h', CARD_H + 'px');
  document.body.classList.toggle('compact', on);
  document.querySelector('[data-act=compact]').classList.toggle('on', on);
}
const GRID = 24, MIN_ZOOM = 0.15, MAX_ZOOM = 3;
const DRAFT_KEY = 'familytree.draft';

let positions = new Map();
let marriages = [];
function layout() {
  marriages = [];
  positions = computeLayout({ CARD_W, CARD_H, COUPLE_GAP, H_GAP, V_GAP, TREE_GAP, strictOrder });
}
let displayPos = new Map(), animFrame = 0, spawnFrom = null;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const badgesEl = document.getElementById('badges');
let selectedId = null;
let multi = new Set(), hiPeople = new Set();
let editingId = null;
let editSnapshot = null;
let undoStack = [], redoStack = [];
let fileHandle = null, fileName = null, dirty = false;
let view = { x: 0, y: 0, s: 1 };


const $ = (s) => document.querySelector(s);
const viewport = $('#viewport'), world = $('#world'), edgesSvg = $('#edges'), cardsEl = $('#cards'), emptyEl = $('#empty');
const photoInput = $('#photoInput'), fileInput = $('#fileInput');




function snapshot() { return JSON.stringify(state); }
function mutate(fn) {
  undoStack.push(snapshot()); redoStack = [];
  if (undoStack.length > 200) undoStack.shift();
  const r = fn();
  afterChange();
  return r;
}
function undo() {
  if (editingId) stopEditing();
  if (!undoStack.length) return toast(t('nothing_undo'));
  redoStack.push(snapshot());
  setState(JSON.parse(undoStack.pop()));
  if (!state.people[selectedId]) selectedId = null;
  afterChange();
}
function redo() {
  if (editingId) stopEditing();
  if (!redoStack.length) return toast(t('nothing_redo'));
  undoStack.push(snapshot());
  setState(JSON.parse(redoStack.pop()));
  if (!state.people[selectedId]) selectedId = null;
  afterChange();
}
function touch() { dirty = true; scheduleDraft(); }
function afterChange() {
  dirty = true;
  render();
  if (sheetId) refreshSheetPhoto();
  scheduleDraft();
}


function render() {
  layout();
  renderCards();
  if (multi.size > 1) paintMulti(true);
  animatePositions();
  placeSheet();
  emptyEl.hidden = people().length > 0;
  $('#actions').classList.toggle('show', !!selectedId && !editingId);
  document.body.classList.toggle('has-selection', !!selectedId);
  $('#filename').textContent = shownName(fileName);
  $('#filename').classList.toggle('dirty', dirty);
  document.title = (dirty ? '• ' : '') + shownName(fileName) + ' — ' + t('app');
}

function setDateField(input, value) {
  const exact = !value || isExactDate(value);
  input.type = exact ? 'date' : 'text';
  if (!exact) { input.inputMode = 'numeric'; input.placeholder = '1980'; }
  input.value = value || '';
  document.querySelector(`.df-mode[data-for=${input.id}]`).textContent = t(exact ? 'year_only' : 'full_date');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.df-mode'); if (!b) return;
  const input = document.getElementById(b.dataset.for);
  const toText = input.type === 'date';
  input.type = toText ? 'text' : 'date';
  if (toText) { input.inputMode = 'numeric'; input.placeholder = '1980'; input.value = year(input.value); }
  else input.value = '';
  b.textContent = t(toText ? 'full_date' : 'year_only');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
});
function fmtDate(s) {
  if (!s) return '';
  const parts = dateParts(s); if (!parts) return s;
  const [y, m, d] = parts;
  const date = new Date(y, (m || 1) - 1, d || 1);
  const opts = { year: 'numeric', ...(m && { month: d ? 'short' : 'long' }), ...(d && { day: 'numeric' }) };
  return date.toLocaleDateString(lang, opts).replace(/\s*г\.$/, '');
}
function datesText(p) {
  if (!p.birth && (p.alive || !p.death)) return '';
  const born = p.birth ? fmtDate(p.birth) : '?';
  if (p.alive) { const a = ageOf(p.birth); return `${t('b')} ${born}` + (a !== null ? ` · ${a} ${t('years')}` : ''); }
  const died = p.death ? fmtDate(p.death) : '?';
  const a = p.birth && p.death ? ageOf(p.birth, p.death) : null;
  return `${born} – ${died}` + (a !== null ? ` (${a})` : '');
}

function renderCards() {
  const seen = new Set();
  for (const p of people()) {
    let el = cardEl(p.id);
    if (el && el.classList.contains('leave')) { el.remove(); el = null; }
    const fresh = !el;
    if (fresh) { el = document.createElement('div'); el.dataset.id = p.id; cardsEl.appendChild(el); }
    el.className = 'card' + (p.id === selectedId ? ' selected' : '') + (p.id === sheetId ? ' editing' : '') + (fresh ? ' enter' : '') + (p.fate ? ' unborn' : '') + (linkFrom === p.id ? ' link-source' : '') + (!p.alive && !p.fate ? ' deceased' : '') + (state.indexPerson === p.id ? ' index' : '') + (p.gender ? ' g-' + p.gender : '');
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
function fateGlyph(f) {
  const g = { pregnancy: '<path d="M16 6 L27 26 H5 Z"/>', miscarriage: '<circle cx="16" cy="16" r="6" fill="currentColor"/>', abortion: '<path d="M9 9 L23 23 M23 9 L9 23"/>', stillborn: '<rect x="7" y="7" width="18" height="18" rx="2"/><path d="M9 9 L23 23 M23 9 L9 23"/>' }[f] || '';
  return `<svg class="fg" viewBox="0 0 32 32">${g}</svg>`;
}
function cardHTML(p) {
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
function applyPositions(map) {
  for (const [id, p] of map) { const el = cardEl(id); if (el) { el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; } }
  renderEdges(map);
}
function animatePositions() {
  cancelAnimationFrame(animFrame);
  const from = new Map();
  for (const [id, p] of positions) {
    const prev = displayPos.get(id) || (spawnFrom && displayPos.get(spawnFrom)) || p;
    from.set(id, { x: prev.x, y: prev.y });
  }
  spawnFrom = null;
  const moving = [...positions].some(([id, p]) => { const f = from.get(id); return Math.abs(f.x - p.x) > .5 || Math.abs(f.y - p.y) > .5; });
  if (!moving || reduceMotion) { displayPos = new Map(positions); applyPositions(displayPos); return; }
  applyPositions(from);
  const start = performance.now(), dur = 340;
  const step = (now) => {
    const k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 3);
    displayPos = new Map();
    for (const [id, p] of positions) { const f = from.get(id); displayPos.set(id, { x: f.x + (p.x - f.x) * e, y: f.y + (p.y - f.y) * e }); }
    applyPositions(displayPos);
    if (k < 1) animFrame = requestAnimationFrame(step);
  };
  animFrame = requestAnimationFrame(step);
}
function fullName(p) { return p.birthName ? `${p.name || t('unnamed')} (${t('nee')} ${p.birthName})` : (p.name || t('unnamed')); }

function renderEdges(pos = positions) {
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
    for (const id of h.members) { const q = pos.get(id); if (!q) continue; const pad = 18; pts.push({ x: q.x - pad, y: q.y - pad }, { x: q.x + CARD_W + pad, y: q.y - pad }, { x: q.x - pad, y: q.y + CARD_H + pad }, { x: q.x + CARD_W + pad, y: q.y + CARD_H + pad }); }
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
  const midY = compact ? 46 : CARD_H / 2, halfW = compact ? 44 : CARD_W / 2;
  const contentBottom = (id) => { const el = compact && cardEl(id); return el ? Math.min(CARD_H, el.offsetHeight) : CARD_H; };
  const mid = (id) => { const p = pos.get(id); return { id, x: p.x, cx: p.x + CARD_W / 2, cy: p.y + midY, top: p.y, bottom: p.y + contentBottom(id) }; };
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
    const hiFam = hiPeople.size > 0 && f.parents.some(id => hiPeople.has(id)) && f.children.some(id => hiPeople.has(id));
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
        const gap = Math.round((b.cx - a.cx) / (CARD_W + COUPLE_GAP));
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
    const busY = rowTop - V_GAP / 2 - 14 * laneFor(rowTop, Math.min(...xs), Math.max(...xs));
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
    const hiXs = hiFam ? sorted.filter(c => hiPeople.has(c.id)).map(c => c.cx) : [];
    if (origin) {
      d.push(rounded([origin, { x: origin.x, y: busY }, { x: sorted[0].cx, y: busY }]));
      d.push(`M${Math.min(origin.x, sorted[0].cx)} ${busY} L${Math.max(origin.x, sorted[sorted.length - 1].cx)} ${busY}`);
      if (hiXs.length) dHi.push(`M${origin.x} ${origin.y} L${origin.x} ${busY}`, `M${Math.min(origin.x, ...hiXs)} ${busY} L${Math.max(origin.x, ...hiXs)} ${busY}`);
      for (const c of sorted) capture(hiFam && hiPeople.has(c.id), () => drop(c, origin.x));
    } else {
      const f0 = sorted[0], fn = sorted[sorted.length - 1];
      d.push(`M${f0.cx} ${busY} L${fn.cx} ${busY}`);
      if (hiXs.length > 1) dHi.push(`M${Math.min(...hiXs)} ${busY} L${Math.max(...hiXs)} ${busY}`);
      for (const c of sorted) capture(hiFam && hiPeople.has(c.id), () => drop(c, f0.cx));
    }
  }
  for (const p of people()) {
    if (!p.lineEnded || childrenOf(p.id).length || !pos.has(p.id)) continue;
    const q = pos.get(p.id), cx = q.x + CARD_W / 2, y = q.y + CARD_H;
    dEnded.push(`M${cx} ${y} L${cx} ${y + 16} M${cx - 14} ${y + 16} L${cx + 14} ${y + 16}`);
  }
  const anchorPt = (from, to) => {
    const dx = to.cx - from.cx, dy = to.cy - from.cy;
    const hw = CARD_W / 2 + 6, hh = CARD_H / 2 + 6;
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
  if (crossMode !== 'default') applyCrossings([d, dAdopted, dFoster, dPartners, dPast, dPartnersPast, dHi], crossMode);
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
const statusHint = (st) => t({ married: 'lg_married', partners: 'lg_partners', separated: 'lg_separated', divorced: 'lg_divorced', reconciled_sep: 'lg_rec_sep', reconciled_div: 'lg_rec_div' }[st] || 'lg_married');
function marriageOrdinal(f) {
  let best = 0;
  for (const pid of f.parents) {
    const fams = parentFamilies(pid);
    if (fams.length < 2) continue;
    best = Math.max(best, fams.indexOf(f) + 1);
  }
  return best ? String(best).replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]) : '';
}
function marriageText(f) {
  const mark = f.status === 'divorced' ? '⚡ ' : f.status === 'separated' ? '⁄ ' : f.status?.startsWith('reconciled') ? '↺ ' : '';
  if (!f.married && !f.ended) return mark.trim();
  const widowed = f.parents.map(id => state.people[id]).filter(p => p && !p.alive);
  const death = widowed.length ? (widowed.map(p => year(p.death)).filter(Boolean).sort()[0] || '?') : '';
  const end = f.ended ? year(f.ended) : (f.status === 'divorced' || f.status === 'separated') ? '?' : death ? '† ' + death : t('present');
  return mark + `${year(f.married) || '?'} – ${end}`;
}

const mpop = $('#mpop');
let mpopFamily = null;
function openMarriage(fid, anchor) {
  const f = fam(fid); if (!f) return;
  stopEditing();
  mpopFamily = fid; mpopSnapshot = snapshot();
  const names = f.parents.map(id => state.people[id]?.name || t('unnamed'));
  $('#mpop-title').textContent = names.join(' & ');
  setDateField($('#m-from'), f.married); setDateField($('#m-to'), f.ended); $('#m-status').value = f.status || 'married';
  $('#m-hint').textContent = statusHint(f.status || 'married');
  $('#m-order-row').hidden = !f.parents.some(id => parentFamilies(id).length > 1);
  const r = anchor.getBoundingClientRect();
  mpop.classList.add('show');
  const w = mpop.offsetWidth, h = mpop.offsetHeight;
  mpop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  mpop.style.top = (r.bottom + 8 + h > innerHeight ? r.top - h - 8 : r.bottom + 8) + 'px';
  $('#m-from').focus();
}
let mpopSnapshot = null;
function closeMarriage() {
  if (!mpopFamily) return;
  mpopFamily = null; mpop.classList.remove('show'); document.activeElement?.blur?.();
  if (mpopSnapshot && mpopSnapshot !== snapshot()) { undoStack.push(mpopSnapshot); redoStack = []; dirty = true; scheduleDraft(); render(); }
  mpopSnapshot = null;
}
mpop.addEventListener('input', (e) => {
  const f = fam(mpopFamily); if (!f) return;
  if (e.target.id === 'm-from') f.married = e.target.value;
  if (e.target.id === 'm-to') f.ended = e.target.value;
  if (e.target.id === 'm-status') { f.status = e.target.value; $('#m-hint').textContent = statusHint(f.status); }
  touch();
});
mpop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); closeMarriage(); } e.stopPropagation(); });
$('#m-close').addEventListener('click', closeMarriage);
for (const [id, dir] of [['#m-earlier', -1], ['#m-later', 1]]) $(id).addEventListener('click', () => { moveMarriage(mpopFamily, dir); render(); });
$('#m-unlink').addEventListener('click', () => {
  const fid = mpopFamily; const f = fam(fid); if (!f) return;
  if (f.children.length && !confirm(t('unlink_confirm'))) return;
  mpopFamily = null; mpop.classList.remove('show'); mpopSnapshot = null;
  mutate(() => { f.parents = f.parents.slice(0, 1); if (!f.children.length) delete state.families[fid]; });
});

const rpop = $('#rpop');
let rpopId = null, rpopSnapshot = null;
function openRelation(rid, anchor) {
  const r = state.relations.find(x => x.id === rid); if (!r) return;
  stopEditing(); if (mpopFamily) closeMarriage();
  rpopId = rid; rpopSnapshot = snapshot();
  $('#r-type').value = r.type; $('#r-label').value = r.label || ''; $('#r-label').placeholder = t('rel_' + r.type); $('#r-hint').textContent = t('hint_rel_' + r.type);
  const b = anchor.getBoundingClientRect();
  rpop.classList.add('show');
  const w = rpop.offsetWidth, h = rpop.offsetHeight;
  rpop.style.left = Math.max(8, Math.min(innerWidth - w - 8, b.left + b.width / 2 - w / 2)) + 'px';
  rpop.style.top = (b.bottom + 8 + h > innerHeight ? b.top - h - 8 : b.bottom + 8) + 'px';
  $('#r-label').focus();
}
function closeRelation() {
  if (!rpopId) return;
  rpopId = null; rpop.classList.remove('show'); document.activeElement?.blur?.();
  if (rpopSnapshot && rpopSnapshot !== snapshot()) { undoStack.push(rpopSnapshot); redoStack = []; dirty = true; scheduleDraft(); render(); }
  rpopSnapshot = null;
}
rpop.addEventListener('input', (e) => {
  const r = state.relations.find(x => x.id === rpopId); if (!r) return;
  if (e.target.id === 'r-type') { r.type = e.target.value; $('#r-label').placeholder = t('rel_' + r.type); $('#r-hint').textContent = t('hint_rel_' + r.type); }
  if (e.target.id === 'r-label') r.label = e.target.value;
  touch();
});
rpop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); closeRelation(); } e.stopPropagation(); });
$('#r-close').addEventListener('click', closeRelation);
$('#r-delete').addEventListener('click', () => {
  const rid = rpopId; rpopId = null; rpop.classList.remove('show'); rpopSnapshot = null;
  mutate(() => { state.relations = state.relations.filter(x => x.id !== rid); });
});

const menu = $('#menu');
function openMenu(anchor, title, items) {
  menu.innerHTML = `<div class="t">${esc(title)}</div>` + items.map((it, i) => `<button data-i="${i}">${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</button>`).join('');
  menu.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; closeMenu(); items[b.dataset.i].run(); };
  const r = anchor.getBoundingClientRect();
  menu.classList.add('show');
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  const below = r.bottom + 6, above = r.top - h - 6;
  menu.style.top = Math.max(8, Math.min(innerHeight - h - 8, below + h <= innerHeight - 8 ? below : (above >= 8 ? above : below))) + 'px';
  menu.querySelector('button').focus();
}
function closeMenu() { menu.classList.remove('show'); menu.innerHTML = ''; }
menu.addEventListener('keydown', (e) => {
  const bs = [...menu.querySelectorAll('button')]; const i = bs.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
  else if (/^[1-9]$/.test(e.key) && bs[e.key - 1]) { e.preventDefault(); bs[e.key - 1].click(); }
  e.stopPropagation();
});
document.addEventListener('pointerdown', (e) => {
  if (menu.classList.contains('show') && !menu.contains(e.target)) closeMenu();
  if (mpop.classList.contains('show') && !mpop.contains(e.target) && !e.target.closest('.marriage')) closeMarriage();
  if (rpop.classList.contains('show') && !rpop.contains(e.target) && !e.target.closest('.relbadge')) closeRelation();
}, true);

function applyView() {
  world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
  placeSheet();
  let g = GRID * view.s; while (g < 16) g *= 2;
  viewport.style.backgroundSize = `${g}px ${g}px`;
  viewport.style.backgroundPosition = `${view.x}px ${view.y}px`;
  $('#zoomlvl').textContent = Math.round(view.s * 100) + '%';
}
function zoomAt(factor, mx, my, anim) {
  const ns = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.s * factor));
  const k = ns / view.s;
  view = { x: mx - (mx - view.x) * k, y: my - (my - view.y) * k, s: ns };
  if (anim) animateView();
  applyView();
}
function animateView() {
  world.classList.add('anim');
  clearTimeout(animateView.t);
  animateView.t = setTimeout(() => world.classList.remove('anim'), 300);
}
function resetView() {
  view = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 - CARD_H / 2 - 40, s: 1 };
  applyView();
}
function toggleCompact() { setCompact(!compact); render(); fitView(); }
function fitView() {
  if (!positions.size) return resetView();
  const b = bbox();
  const vw = viewport.clientWidth, vh = viewport.clientHeight;
  const s = Math.min(MAX_ZOOM, 1.4, (vw - 120) / (b.w), (vh - 160) / (b.h));
  view = { s, x: vw / 2 - (b.x + b.w / 2) * s, y: vh / 2 - (b.y + b.h / 2) * s };
  animateView(); applyView();
}
function bbox() {
  const xs = [...positions.values()];
  const x = Math.min(...xs.map(p => p.x)), y = Math.min(...xs.map(p => p.y));
  return { x, y, w: Math.max(...xs.map(p => p.x)) + CARD_W - x, h: Math.max(...xs.map(p => p.y)) + CARD_H - y };
}
function ensureVisible(id) {
  const p = positions.get(id); if (!p) return;
  const sx = p.x * view.s + view.x, sy = p.y * view.s + view.y, sw = CARD_W * view.s, sh = CARD_H * view.s;
  const m = 40, vw = viewport.clientWidth, vh = viewport.clientHeight;
  let dx = 0, dy = 0;
  if (sx < m) dx = m - sx; else if (sx + sw > vw - m) dx = vw - m - sx - sw;
  if (sy < 80) dy = 80 - sy; else if (sy + sh > vh - 80) dy = vh - 80 - sy - sh;
  if (dx || dy) { view.x += dx; view.y += dy; animateView(); applyView(); }
}

function centerOn(id) {
  const p = positions.get(id); if (!p) return;
  view.s = Math.max(view.s, 1);
  view.x = viewport.clientWidth / 2 - (p.x + CARD_W / 2) * view.s;
  view.y = viewport.clientHeight / 2 - (p.y + CARD_H / 2) * view.s;
  animateView(); applyView();
}
const searchEl = $('#search'), sq = $('#s-q'), sList = $('#s-list');
let sHits = [], sIdx = 0;
function openSearch() {
  stopEditing(); closeMenu();
  sq.placeholder = t('search_ph'); sq.value = '';
  searchEl.classList.add('show'); renderSearch(); sq.focus();
}
function closeSearch() { searchEl.classList.remove('show'); sq.blur(); }
function renderSearch() {
  const q = sq.value.trim().toLowerCase();
  sHits = q ? people().filter(p => (p.name + ' ' + p.birthName).toLowerCase().includes(q)).slice(0, 8) : [];
  sIdx = Math.min(sIdx, Math.max(0, sHits.length - 1));
  sList.innerHTML = q && !sHits.length ? `<div class="none">${t('no_match')}</div>` : sHits.map((p, i) => `<button type="button" data-id="${p.id}" class="${i === sIdx ? 'on' : ''}">${esc(fullName(p))}<small>${esc(datesText(p))}</small></button>`).join('');
}
function pickSearch(id) { closeSearch(); select(id); centerOn(id); }
sq.addEventListener('input', () => { sIdx = 0; renderSearch(); });
sq.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSearch();
  else if (e.key === 'ArrowDown') { sIdx = (sIdx + 1) % Math.max(1, sHits.length); renderSearch(); }
  else if (e.key === 'ArrowUp') { sIdx = (sIdx - 1 + sHits.length) % Math.max(1, sHits.length); renderSearch(); }
  else if (e.key === 'Enter') { if (sHits[sIdx]) pickSearch(sHits[sIdx].id); }
  else return;
  e.preventDefault(); e.stopPropagation();
});
sList.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) pickSearch(b.dataset.id); });
document.addEventListener('pointerdown', (e) => { if (searchEl.classList.contains('show') && !searchEl.contains(e.target)) closeSearch(); }, true);

let pan = null, spaceDown = false;
const pointers = new Map();
let pinch = null;
function pinchGeom() {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}
viewport.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    pointers.forEach((_, id) => { try { viewport.setPointerCapture(id); } catch (_) {} });
    pan = null; pinch = { ...pinchGeom(), v: { ...view } };
    viewport.classList.add('panning', 'dragging');
    return;
  }
  const onCard = e.target.closest('.card');
  if (onCard && !spaceDown && e.pointerType === 'mouse' && e.button === 0) return;
  pan = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, onCard: !!onCard, target: e.target };
  if (!onCard || spaceDown) viewport.classList.add('panning', 'dragging');
});
viewport.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) {
    const g = pinchGeom();
    const s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.v.s * g.d / pinch.d));
    const k = s / pinch.v.s;
    view = { s, x: g.mx - (pinch.mx - pinch.v.x) * k, y: g.my - (pinch.my - pinch.v.y) * k };
    applyView(); return;
  }
  if (!pan) return;
  const dx = e.clientX - pan.sx, dy = e.clientY - pan.sy;
  if (!pan.moved && Math.abs(dx) + Math.abs(dy) > (e.pointerType === 'touch' ? 8 : 3)) {
    pan.moved = true;
    try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
  }
  if (pan.onCard && !spaceDown && !pan.moved) return;
  if (pan.onCard && !spaceDown && pan.moved && e.pointerType !== 'touch') return;
  view.x = pan.vx + dx; view.y = pan.vy + dy; applyView();
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) { pinch = null; viewport.classList.remove('dragging'); if (!spaceDown) viewport.classList.remove('panning'); } return; }
  if (!pan) return;
  const { moved, onCard } = pan; pan = null;
  viewport.classList.remove('dragging'); if (!spaceDown) viewport.classList.remove('panning');
  if (moved || e.type === 'pointercancel') return;
  const badge = e.target.closest('.marriage');
  if (badge) { openMarriage(badge.dataset.fid, badge); return; }
  const hb = e.target.closest('.relbadge.house');
  if (hb) {
    const h = (state.households || []).find(x => x.id === hb.dataset.hid); if (!h) return;
    openMenu(hb, t('household_title'), [
      ...h.members.map(id => ({ label: t('leave_household') + ': ' + (state.people[id]?.name || t('unnamed')), run: () => mutate(() => { h.members = h.members.filter(x => x !== id); if (h.members.length < 2) state.households = state.households.filter(x => x !== h); }) })),
      { label: t('dissolve'), run: () => mutate(() => { state.households = state.households.filter(x => x !== h); }) },
    ]);
    return;
  }
  const rb = e.target.closest('.relbadge');
  if (rb) { openRelation(rb.dataset.rid, rb); return; }
  if (!onCard && !e.target.closest('#empty')) { if (linkFrom) cancelLink(); stopEditing(); select(null); }
}
viewport.addEventListener('pointerup', endPointer);
viewport.addEventListener('pointercancel', endPointer);
viewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
  else { view.x -= e.deltaX; view.y -= e.deltaY; applyView(); }
}, { passive: false });
viewport.addEventListener('dblclick', (e) => {
  if (e.target.closest('.card') || e.target.closest('#empty')) return;
  zoomAt(1.5, e.clientX, e.clientY, true);
});
window.addEventListener('resize', applyView);

function select(id, opts = {}) {
  if (sheetId && id && sheetId !== id) { closeSheet(); openSheet(id, false); }
  else if (sheetId && !id) closeSheet();
  if (mpopFamily) closeMarriage();
  selectedId = id;
  if (!opts.keepMulti) clearMulti();
  $('#actions').classList.toggle('show', !!id);
  document.body.classList.toggle('has-selection', !!id);
  cardsEl.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
  if (id) {
    cardEl(id)?.classList.add('selected');
    if (opts.scroll !== false) ensureVisible(id);
  }
}
const cardEl = (id) => cardsEl.querySelector(`.card[data-id="${id}"]`);
function clearMulti() {
  if (!multi.size && !document.body.classList.contains('has-multi')) return;
  multi = new Set(); hiPeople = new Set(); document.body.classList.remove('has-multi'); renderEdges();
  cardsEl.querySelectorAll('.multi, .common, .onpath').forEach(c => c.classList.remove('multi', 'common', 'onpath'));
}
function toggleMulti(id) {
  if (!multi.size) { if (!selectedId || selectedId === id) return select(id, { scroll: false }); multi.add(selectedId); }
  if (multi.has(id) && multi.size > 1) multi.delete(id); else multi.add(id);
  if (multi.size < 2) { const only = [...multi][0]; clearMulti(); return select(only, { scroll: false }); }
  selectedId = null; closeSheet(); if (mpopFamily) closeMarriage();
  $('#actions').classList.remove('show'); document.body.classList.remove('has-selection');
  paintMulti();
}
function depthsUp(pid) {
  const d = new Map([[pid, 0]]); const q = [pid];
  while (q.length) { const x = q.shift(); for (const a of parentsOf(x)) if (!d.has(a)) { d.set(a, d.get(x) + 1); q.push(a); } }
  return d;
}
function paintMulti(silent) {
  const ids = [...multi];
  const depths = ids.map(depthsUp);
  const common = [...depths[0].keys()].filter(a => depths.every(d => d.has(a)));
  const nearest = common.filter(c => !common.some(o => o !== c && ancestorsOf(o).has(c)));
  document.body.classList.add('has-multi');
  cardsEl.querySelectorAll('.selected, .multi, .common, .onpath').forEach(c => c.classList.remove('selected', 'multi', 'common', 'onpath'));
  for (const id of ids) cardEl(id)?.classList.add('multi');
  hiPeople = new Set([...ids, ...nearest]);
  for (const c of nearest) { cardEl(c)?.classList.add('common'); for (const d of depths) for (const x of d.keys()) if (x !== c && ancestorsOf(x).has(c)) { cardEl(x)?.classList.add('onpath'); hiPeople.add(x); } }
  renderEdges();
  $('#relbar').innerHTML = relationText(ids, depths, nearest);
}
function kinTerm(role, gen, g, half) {
  const raw = kinTermRaw(role, gen, g, half);
  return lang === 'de' ? raw[0].toUpperCase() + raw.slice(1) : raw;
}
function kinTermRaw(role, gen, g, half) {
  const G = (k) => t(k + '_' + (g === 'm' ? 'm' : g === 'f' ? 'f' : 'x'));
  const great = (n) => n > 0 ? t('great').repeat(n) : '';
  if (role === 'parent') return gen === 1 ? G('kin_parent') : great(gen - 2) + G('kin_grandparent');
  if (role === 'child') return gen === 1 ? G('kin_child') : great(gen - 2) + G('kin_grandchild');
  if (role === 'sibling') return (half ? t('half') : '') + G('kin_sibling');
  if (role === 'uncle') return great(gen - 2) + G('kin_uncle');
  if (role === 'nephew') return great(gen - 2) + G('kin_nephew');
  const ords = (g === 'f' && I18N[lang].ordinals_f) || t('ordinals');
  return G('kin_cousin').replace('{n}', ords[gen - 1] || (gen + '.'));
}
function relationText(ids, depths, nearest) {
  const name = (id) => `<b>${esc(state.people[id]?.name || t('unnamed'))}</b>`;
  if (!nearest.length) return t('rel_none');
  if (ids.length !== 2) return t('rel_common') + ': ' + nearest.map(name).join(', ');
  const [da, db] = depths.map(d => Math.min(...nearest.map(c => d.get(c))));
  const [a, b] = da <= db ? ids : [ids[1], ids[0]];
  const lo = Math.min(da, db), hi = Math.max(da, db);
  const ga = state.people[a]?.gender, gb = state.people[b]?.gender;
  const sentence = (subj, term, obj) => t('rel_sentence').replace('{a}', name(subj)).replace('{term}', term).replace('{b}', name(obj));
  if (lo === 0) return sentence(a, kinTerm('parent', hi, ga), b) + ' · ' + sentence(b, kinTerm('child', hi, gb), a);
  if (lo === 1 && hi === 1) return sentence(a, kinTerm('sibling', 1, ga, nearest.length < 2), b);
  if (lo === 1) return sentence(a, kinTerm('uncle', hi, ga), b) + ' · ' + sentence(b, kinTerm('nephew', hi, gb), a);
  return sentence(a, kinTerm('cousin', lo - 1, ga), b) + (hi > lo ? ' ' + t('rel_removed').replace('{r}', hi - lo) : '');
}
let linkFrom = null;
function startLink(id) {
  if (!id || people().length < 2) return;
  stopEditing(); linkFrom = id;
  document.body.classList.add('linking'); cardEl(id)?.classList.add('link-source');
  toast(t('link_hint'));
}
function cancelLink() {
  linkFrom = null; document.body.classList.remove('linking');
  cardsEl.querySelectorAll('.link-source').forEach(el => el.classList.remove('link-source'));
}
function finishLink(targetId, anchor) {
  const a = linkFrom, b = targetId; cancelLink();
  if (!a || a === b || !state.people[a] || !state.people[b]) return;
  const apply = (fn) => {
    let err = null; mutate(() => { err = fn(); });
    if (!err) { toast(t('linked')); select(a); return; }
    undoStack.pop();
    if (Array.isArray(err)) openMenu(anchor, t('two_parents'), err.map(it => ({ ...it, run: () => apply(it.run) })));
    else toast(err);
  };
  const relItems = ['close', 'fused', 'conflict', 'distant', 'cutoff', 'focused'].map(type => ({ label: (type === 'focused' ? '→ ' : '↔ ') + t('rel_' + type), hint: t('hint_rel_' + type), run: () => apply(() => addRelation(a, b, type)) }));
  const childOpts = () => {
    const fams = parentFamilies(a);
    if (fams.length > 1) return openMenu(anchor, t('add_child_menu'), fams.map(f => ({ label: t('with') + ' ' + (f.parents.filter(x => x !== a).map(x => state.people[x]?.name || t('unnamed')).join(', ') || t('no_partner')), run: () => apply(() => linkChild(a, b, f.id)) })));
    apply(() => linkChild(a, b));
  };
  openMenu(anchor, `${state.people[a].name || t('unnamed')} → ${state.people[b].name || t('unnamed')}`, [
    { label: t('as_spouse'), hint: t('hint_as_spouse'), run: () => apply(() => linkSpouse(a, b)) },
    { label: t('as_child'), hint: t('hint_as_child'), run: childOpts },
    { label: t('as_parent'), hint: t('hint_as_parent'), run: () => apply(() => linkChild(b, a)) },
    { label: '◯ ' + t('household'), hint: t('hint_household'), run: () => apply(() => joinHousehold(a, b)) },
    ...relItems,
  ]);
}
const isCoarse = matchMedia('(pointer: coarse)').matches;

function startEditing(id, field = '.f-name', fresh = false) {
  openSheet(id, fresh);
}
function stopEditing() {
  if (sheetId) return closeSheet();
  if (!editingId) return;
  editingId = null; return;
  const id = editingId; editingId = null;
  if (editSnapshot && editSnapshot !== snapshot()) {
    undoStack.push(editSnapshot); redoStack = []; dirty = true; scheduleDraft();
  }
  editSnapshot = null;
  render();
  if (document.activeElement && document.activeElement.closest?.('.card')) document.activeElement.blur();
  return id;
}

cardsEl.addEventListener('pointerdown', (e) => {
  const card = e.target.closest('.card'); if (!card || spaceDown) return;
  const id = card.dataset.id;
  if (linkFrom || e.target.closest('.plus') || e.target.closest('.photo')) return;
  if (e.shiftKey || e.metaKey || e.ctrlKey) { e.preventDefault(); return; }
  if (editingId !== id && e.pointerType === 'mouse' && !isCoarse) { e.preventDefault(); select(id, { scroll: false }); }
});
cardsEl.addEventListener('click', (e) => {
  const card = e.target.closest('.card'); if (!card) return;
  const id = card.dataset.id;
  if (linkFrom) { e.preventDefault(); if (id !== linkFrom) finishLink(id, card); return; }
  const plus = e.target.closest('.plus');
  if (plus) { createRelative(id, plus.dataset.add, plus); return; }
  if (e.shiftKey || e.metaKey || e.ctrlKey) { e.preventDefault(); toggleMulti(id); return; }
  const wasSelected = selectedId === id;
  if (!wasSelected) select(id, { scroll: false });
  if (e.target.closest('.photo-x')) { mutate(() => { removePhoto(state.people[id]); }); startEditing(id); return; }
  if (e.target.closest('.photo')) { photoAction(id, e.target.closest('.photo')); return; }
  if (editingId === id) return;
  if (e.detail >= 2 || (wasSelected && isCoarse)) startEditing(id);
});

const sheet = $('#sheet');
let sheetId = null, sheetSnapshot = null;
const sh = (id) => document.getElementById(id);
function openSheet(id, fresh) {
  if (sheetId && sheetId !== id) closeSheet();
  if (editingId) stopEditing();
  const p = state.people[id]; if (!p) return;
  sheetId = id; sheetSnapshot = fresh ? null : snapshot();
  select(id, { scroll: false });
  sh('sh-name').value = p.name; sh('sh-bname').value = p.birthName; sh('sh-place').value = p.birthplace || ''; sh('sh-prof').value = p.profession || ''; sh('sh-notes').value = p.notes || ''; sh('sh-notes').placeholder = t('notes_hint');
  setDateField(sh('sh-birth'), p.birth); setDateField(sh('sh-death'), p.death); sh('sh-alive').checked = p.alive;
  sh('sh-name').placeholder = t('full_name'); sh('sh-bname').placeholder = t('birth_name');
  sh('sh-death-row').hidden = p.alive;
  sh('sh-fate').value = p.fate || ''; sh('sh-ended').checked = !!p.lineEnded;
  setGenderSeg(p.gender); sh('sh-index').checked = state.indexPerson === id;
  sh('sh-illness').value = p.illness || ''; sh('sh-substance').value = p.substance || '';
  const hasParents = !!childFamily(id);
  sh('sh-kind-row').hidden = sh('sh-twin-row').hidden = sh('sh-identical-row').hidden = !hasParents;
  refreshOrderRow(id);
  sh('sh-family-hint').hidden = hasParents;
  if (hasParents) {
    const k = kindOf(id);
    sh('sh-kind').value = k.type;
    sh('sh-twin').innerHTML = `<option value="">${esc(t('twin_none'))}</option>` + siblingsOf(id).filter(x => x !== id).map(x => `<option value="${x}">${esc(state.people[x]?.name || t('unnamed'))}</option>`).join('');
    sh('sh-twin').value = k.twin || ''; sh('sh-identical').checked = !!k.identical; sh('sh-identical').disabled = !k.twin;
  }
  refreshSheetPhoto();
  sheet.classList.add('show');
  placeSheet();
  editingId = id; cardsEl.querySelectorAll('.card.editing').forEach(el => el.classList.remove('editing')); cardEl(id)?.classList.add('editing');
  $('#actions').classList.remove('show');
  if (fresh || !isCoarse) { sh('sh-name').focus(); if (fresh) sh('sh-name').select(); }
}
if (localStorage.getItem(COMPACT_KEY)) setCompact(true);
$('#legend .panel').addEventListener('click', (e) => { const b = e.target.closest('[data-x]'), c = e.target.closest('[data-s]'); if (b) setCrossMode(b.dataset.x); else if (c) setStrictOrder(c.dataset.s === '1'); });
$('#legend .panel').addEventListener('change', (e) => { if (e.target.id === 'lg-badges') setOrderBadges(e.target.checked); });
document.body.classList.toggle('no-ord', !orderBadges);
const sheetDocked = matchMedia('(max-width: 760px), (pointer: coarse)');
new ResizeObserver(() => placeSheet()).observe(sheet.querySelector('.sheet'));
function placeSheet() {
  if (!sheetId) return;
  const box = sheet.querySelector('.sheet'), pos = positions.get(sheetId);
  if (sheetDocked.matches || !pos) { box.style.left = box.style.top = ''; return; }
  const vr = viewport.getBoundingClientRect(), sr = sheet.getBoundingClientRect();
  const x = vr.left - sr.left + pos.x * view.s + view.x, y = vr.top - sr.top + pos.y * view.s + view.y, w = CARD_W * view.s;
  const bw = box.offsetWidth, bh = box.offsetHeight, m = 16, gap = 12;
  let left = x + w + gap;
  if (left + bw > sr.width - m) left = x - gap - bw;
  if (left < m) left = Math.max(m, Math.min(x, sr.width - m - bw));
  const top = Math.max(m, Math.min(y - 20, sr.height - m - bh));
  box.style.left = left + 'px'; box.style.top = top + 'px';
}
function refreshCard(id) {
  const p = state.people[id], el = cardEl(id); if (!p || !el) return;
  el.innerHTML = cardHTML(p);
  el.classList.toggle('unborn', !!p.fate); el.classList.toggle('deceased', !p.alive && !p.fate); el.classList.toggle('index', state.indexPerson === id);
  for (const g of ['m', 'f', 'x']) el.classList.toggle('g-' + g, p.gender === g);
}
function refreshSheetPhoto() {
  const p = state.people[sheetId]; if (!p) return;
  sh('sh-photo').innerHTML = (p.photo ? `<img src="${p.photo}" alt="">` : `<span>${initials(p.name)}</span>`) + '<div class="cam">📷</div>';
}
function closeSheet() {
  if (!sheetId) return;
  const id = sheetId; sheetId = null; editingId = null;
  sheet.classList.remove('show');
  if (sheetSnapshot && sheetSnapshot !== snapshot()) { undoStack.push(sheetSnapshot); redoStack = []; dirty = true; scheduleDraft(); }
  sheetSnapshot = null;
  document.activeElement?.blur?.();
  render();
  if (state.people[id]) select(id, { scroll: false });
  return id;
}
sheet.addEventListener('input', (e) => {
  const p = state.people[sheetId]; if (!p) return;
  switch (e.target.id) {
    case 'sh-name': p.name = e.target.value; if (!p.photo) refreshSheetPhoto(); break;
    case 'sh-bname': p.birthName = e.target.value; break;
    case 'sh-place': p.birthplace = e.target.value; break;
    case 'sh-prof': p.profession = e.target.value; break;
    case 'sh-notes': p.notes = e.target.value; break;
    case 'sh-birth': p.birth = e.target.value; break;
    case 'sh-death': p.death = e.target.value; break;
    case 'sh-fate': p.fate = e.target.value; break;
    case 'sh-illness': p.illness = e.target.value; break;
    case 'sh-substance': p.substance = e.target.value; break;
    case 'sh-index': state.indexPerson = e.target.checked ? p.id : null; break;
    case 'sh-kind': setKind(p.id, { type: e.target.value }); break;
    case 'sh-twin': setKind(p.id, { twin: e.target.value }); sh('sh-identical').disabled = !e.target.value; break;
    case 'sh-identical': setKind(p.id, { identical: e.target.checked }); break;
    case 'sh-ended': p.lineEnded = e.target.checked; break;
    case 'sh-alive': p.alive = e.target.checked; sh('sh-death-row').hidden = p.alive; if (p.alive) { p.death = ''; sh('sh-death').value = ''; } break;
  }
  refreshCard(p.id); refreshOrderRow(p.id); touch();
});
function refreshOrderRow(id) {
  const p = state.people[id], f = childFamily(id), sibs = f ? f.children.length : 0;
  sh('sh-order-row').hidden = sibs < 2;
  sh('sh-order-hint').hidden = sibs < 2 || !p.birth;
  for (const b of sh('sh-order').children) b.disabled = !!p.birth;
}
sh('sh-order').addEventListener('click', (e) => {
  const b = e.target.closest('button'), p = state.people[sheetId]; if (!b || !p || b.disabled) return;
  moveChild(p.id, +b.dataset.ord); render(); touch();
});
function setGenderSeg(g) { for (const b of sh('sh-gender').children) b.classList.toggle('on', b.dataset.v === g); }
sh('sh-gender').addEventListener('click', (e) => {
  const b = e.target.closest('button'), p = state.people[sheetId]; if (!b || !p) return;
  p.gender = p.gender === b.dataset.v ? '' : b.dataset.v;
  setGenderSeg(p.gender); refreshCard(p.id); touch();
});
sheet.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
  else if (e.key === 'Enter' && !e.target.matches('select, textarea')) { e.preventDefault(); closeSheet(); }
  e.stopPropagation();
});
sheet.addEventListener('pointerdown', (e) => { if (e.target === sheet) closeSheet(); });
sh('sh-done').addEventListener('click', () => closeSheet());
sh('sh-close').addEventListener('click', () => closeSheet());
sh('sh-delete').addEventListener('click', () => { const id = closeSheet(); if (id) { selectedId = id; removeSelected(); } });
sh('sh-photo').addEventListener('click', () => photoAction(sheetId, sh('sh-photo')));

function removePhoto(p) { p.photo = null; p.photoSrc = null; p.crop = null; }
function pickPhoto(id) { photoInput.dataset.target = id; photoInput.click(); }
function photoAction(id, anchor) {
  const p = state.people[id];
  if (!p.photo) return pickPhoto(id);
  openMenu(anchor, t('photo'), [
    { label: t('adjust_crop'), run: () => openCropper(id, p.photoSrc || p.photo, p.crop) },
    { label: t('change_photo'), run: () => pickPhoto(id) },
    { label: t('remove_photo'), run: () => mutate(() => removePhoto(p)) },
  ]);
}
photoInput.addEventListener('change', async () => {
  const file = photoInput.files[0]; const id = photoInput.dataset.target; photoInput.value = '';
  if (!file || !state.people[id]) return;
  try { openCropper(id, await loadScaled(file, 1024), null); } catch (_) { toast(t('open_failed')); }
});
function loadScaled(file, max) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

const cropEl = $('#crop'), cropCanvas = $('#crop-canvas'), cropZoom = $('#crop-zoom'), cropAngle = $('#crop-angle');
const cropCtx = cropCanvas.getContext('2d');
let cr = null;
function normCrop(crop, img) {
  if (!crop || !crop.s) return null;
  if ('ox' in crop) return { ox: crop.ox, oy: crop.oy, s: crop.s, rot: crop.rot || 0 };
  return { ox: crop.x + crop.s / 2 - img.width / 2, oy: crop.y + crop.s / 2 - img.height / 2, s: crop.s, rot: 0 };
}
function openCropper(pid, src, crop) {
  const img = new Image();
  img.onload = () => {
    cr = { pid, src, img, s: 0, ox: 0, oy: 0, base: 0, fine: 0 };
    const c = normCrop(crop, img);
    if (c) { cr.s = c.s; cr.ox = c.ox; cr.oy = c.oy; cr.base = Math.round(c.rot / 90) * 90; cr.fine = c.rot - cr.base; }
    rotatedDims(); if (!c) cr.s = cr.maxS;
    clampCrop(); cropEl.classList.add('show'); drawCrop();
  };
  img.src = src;
}
const cropRot = () => cr.base + cr.fine;
function rotatedDims() {
  const a = cropRot() * Math.PI / 180, w = cr.img.width, h = cr.img.height;
  cr.rw = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a));
  cr.rh = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
  cr.maxS = Math.min(cr.rw, cr.rh); cr.minS = Math.max(16, cr.maxS * 0.1);
}
function clampCrop() {
  cr.s = Math.min(cr.maxS, Math.max(cr.minS, cr.s));
  const lx = (cr.rw - cr.s) / 2, ly = (cr.rh - cr.s) / 2;
  cr.ox = Math.min(lx, Math.max(-lx, cr.ox)); cr.oy = Math.min(ly, Math.max(-ly, cr.oy));
}
function drawCropTo(ctx, size) {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2); ctx.scale(size / cr.s, size / cr.s);
  ctx.translate(-cr.ox, -cr.oy); ctx.rotate(cropRot() * Math.PI / 180);
  ctx.drawImage(cr.img, -cr.img.width / 2, -cr.img.height / 2);
  ctx.restore();
}
function drawCrop() {
  drawCropTo(cropCtx, cropCanvas.width);
  cropZoom.value = Math.round(1000 * (cr.maxS - cr.s) / Math.max(1, cr.maxS - cr.minS));
  cropAngle.value = Math.round(cr.fine); $('#crop-deg').textContent = Math.round(cropRot()) + '°';
}
function zoomCrop(factor, fx = 0.5, fy = 0.5) {
  const ns = Math.min(cr.maxS, Math.max(cr.minS, cr.s * factor));
  cr.ox += (fx - 0.5) * (cr.s - ns); cr.oy += (fy - 0.5) * (cr.s - ns); cr.s = ns;
  clampCrop(); drawCrop();
}
cropZoom.addEventListener('input', () => { cr.s = cr.maxS - (cropZoom.value / 1000) * (cr.maxS - cr.minS); clampCrop(); drawCrop(); });
cropAngle.addEventListener('input', () => { cr.fine = +cropAngle.value; rotatedDims(); clampCrop(); drawCrop(); });
cropAngle.addEventListener('dblclick', () => { cr.fine = 0; rotatedDims(); clampCrop(); drawCrop(); });
function rotate90(dir) {
  cr.base = (cr.base + dir * 90 + 360) % 360;
  [cr.ox, cr.oy] = dir > 0 ? [-cr.oy, cr.ox] : [cr.oy, -cr.ox];
  rotatedDims(); clampCrop(); drawCrop();
}
$('#crop-rl').addEventListener('click', () => rotate90(-1));
$('#crop-rr').addEventListener('click', () => rotate90(1));
const cps = new Map(); let cpinch = null;
const stage = cropCanvas.parentElement;
stage.addEventListener('pointerdown', (e) => { cps.set(e.pointerId, { x: e.clientX, y: e.clientY }); stage.setPointerCapture(e.pointerId); if (cps.size === 2) { const [a, b] = [...cps.values()]; cpinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: cr.s }; } });
stage.addEventListener('pointermove', (e) => {
  if (!cps.has(e.pointerId) || !cr) return;
  const prev = cps.get(e.pointerId); cps.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const k = cr.s / stage.clientWidth;
  if (cps.size === 2 && cpinch) { const [a, b] = [...cps.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); cr.s = cpinch.s * cpinch.d / d; clampCrop(); drawCrop(); return; }
  cr.ox -= (e.clientX - prev.x) * k; cr.oy -= (e.clientY - prev.y) * k; clampCrop(); drawCrop();
});
const cropUp = (e) => { cps.delete(e.pointerId); if (cps.size < 2) cpinch = null; };
stage.addEventListener('pointerup', cropUp); stage.addEventListener('pointercancel', cropUp);
stage.addEventListener('wheel', (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomCrop(Math.exp(e.deltaY * 0.002), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); }, { passive: false });
function closeCropper() { cropEl.classList.remove('show'); cr = null; }
$('#crop-cancel').addEventListener('click', closeCropper);
cropEl.addEventListener('pointerdown', (e) => { if (e.target === cropEl) closeCropper(); });
$('#crop-ok').addEventListener('click', () => {
  const { pid, src } = cr;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  drawCropTo(c.getContext('2d'), 256);
  const thumb = c.toDataURL('image/jpeg', 0.85);
  const crop = { ox: Math.round(cr.ox), oy: Math.round(cr.oy), s: Math.round(cr.s), rot: Math.round(cropRot() * 10) / 10 };
  closeCropper();
  const p = state.people[pid]; if (!p) return;
  mutate(() => { p.photo = thumb; p.photoSrc = src; p.crop = crop; });
  select(pid, { scroll: false });
});
document.addEventListener('keydown', (e) => {
  if (!cropEl.classList.contains('show')) return;
  if (e.key === 'Escape') closeCropper(); else if (e.key === 'Enter') $('#crop-ok').click(); else return;
  e.preventDefault(); e.stopPropagation();
}, true);

const PAPERS = { a4: [210, 297], a3: [297, 420], letter: [215.9, 279.4] };
const PDF_KEY = 'familytree.pdf';
const pdfOpts = () => ({ paper: $('#pd-paper').value, mode: $('#pd-mode').value, scale: +$('#pd-scale').value, orient: $('#pd-orient').value, gray: $('#pd-gray').checked, plain: $('#pd-plain').checked });
function pdfPlan(o) {
  const PX = 96 / 25.4, margin = (o.mode === 'fit' ? 10 : 14) * PX, overlap = 10 * PX, footer = 9 * PX, pad = 24;
  const b = bbox(), [sw, sh] = PAPERS[o.paper];
  const orient = (pw, ph) => {
    const aw = pw - 2 * margin, ah = ph - 2 * margin - footer;
    if (o.mode === 'fit') return { pw, ph, aw, ah, margin, footer, s: Math.min(aw / (b.w + 2 * pad), ah / (b.h + 2 * pad)), cols: 1, rows: 1, tw: aw, th: ah };
    const s = o.scale, tw = aw - overlap, th = ah - overlap;
    return { pw, ph, aw, ah, margin, footer, overlap, s, tw, th, cols: Math.max(1, Math.ceil((b.w + 2 * pad) * s / tw)), rows: Math.max(1, Math.ceil((b.h + 2 * pad) * s / th)) };
  };
  const cards = [...positions.values()];
  const withTiles = (plan) => {
    plan.landscape = plan.pw > plan.ph;
    plan.tiles = [];
    const fit = o.mode === 'fit';
    const totalW = fit ? plan.aw / plan.s : 0, totalH = fit ? plan.ah / plan.s : 0;
    const ox = fit ? b.x + b.w / 2 - totalW / 2 : b.x - pad, oy = fit ? b.y + b.h / 2 - totalH / 2 : b.y - pad;
    for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
      const x0 = ox + c * plan.tw / plan.s, y0 = oy + r * plan.th / plan.s;
      const w = (c < plan.cols - 1 ? plan.tw : plan.aw) / plan.s, h = (r < plan.rows - 1 ? plan.th : plan.ah) / plan.s;
      const used = fit || cards.some(p => p.x < x0 + w && p.x + CARD_W > x0 && p.y < y0 + h && p.y + CARD_H > y0);
      if (used) plan.tiles.push({ r, c, x0, y0 });
    }
    return plan;
  };
  const L = withTiles(orient(sh * PX, sw * PX)), P = withTiles(orient(sw * PX, sh * PX));
  const plan = o.orient === 'landscape' ? L : o.orient === 'portrait' ? P : o.mode === 'fit' ? (L.s >= P.s ? L : P) : (L.tiles.length <= P.tiles.length ? L : P);
  plan.paperMM = plan.pw > plan.ph ? [sh, sw] : [sw, sh];
  if (o.mode === 'poster' && plan.tiles.length === 1) { const f = pdfPlan({ ...o, mode: 'fit' }); if (f.s > plan.s) return f; }
  return plan;
}
function pdfHint() {
  if (!positions.size) return '';
  const plan = pdfPlan(pdfOpts());
  $('#pd-scale-row').hidden = pdfOpts().mode === 'fit';
  drawPdfPreview(plan);
  return t('pd_pages').replace('{n}', plan.tiles.length).replace('{s}', Math.round(plan.s * 100)) + ' · ' + t('pd_print_hint').replace('{p}', $('#pd-paper').selectedOptions[0].textContent).replace('{o}', t(plan.landscape ? 'pd_landscape' : 'pd_portrait').toLowerCase());
}
function drawPdfPreview(plan) {
  const svg = $('#pd-preview'), W = 340, H = 120, pad = 6;
  const sheets = plan.tiles.map(tl => ({ ...tl, w: plan.aw / plan.s, h: plan.ah / plan.s }));
  const xs = sheets.map(t => t.x0), ys = sheets.map(t => t.y0);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...sheets.map(t => t.x0 + t.w)), maxY = Math.max(...sheets.map(t => t.y0 + t.h));
  const k = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxY - minY));
  const ox = pad + ((W - 2 * pad) - (maxX - minX) * k) / 2, oy = pad + ((H - 2 * pad) - (maxY - minY) * k) / 2;
  const X = (v) => ox + (v - minX) * k, Y = (v) => oy + (v - minY) * k;
  const cards = [...positions.values()].map(p => `<rect x="${X(p.x)}" y="${Y(p.y)}" width="${Math.max(1, CARD_W * k)}" height="${Math.max(1, CARD_H * k)}" rx="1" fill="var(--accent)" opacity=".55"/>`).join('');
  const fs = Math.max(5, Math.min(11, plan.aw / plan.s * k * 0.28));
  const tiles = sheets.map(t => `<rect x="${X(t.x0)}" y="${Y(t.y0)}" width="${t.w * k}" height="${t.h * k}" fill="var(--card)" stroke="var(--border-strong)" stroke-width=".8"/>` +
    (plan.tiles.length > 1 ? `<text x="${X(t.x0) + 3}" y="${Y(t.y0) + fs + 1}" font-size="${fs}" font-weight="600" fill="var(--muted)">${String.fromCharCode(65 + t.r)}${t.c + 1}</text>` : '')).join('');
  svg.innerHTML = tiles + cards;
}
function exportPdf() {
  stopEditing();
  if (!positions.size) return toast(t('nothing_export'));
  try { const saved = JSON.parse(localStorage.getItem(PDF_KEY) || '{}'); if (saved.paper) $('#pd-paper').value = saved.paper; if (saved.mode) $('#pd-mode').value = saved.mode; if (saved.scale) $('#pd-scale').value = String(saved.scale); $('#pd-gray').checked = !!saved.gray; $('#pd-plain').checked = !!saved.plain; if (saved.orient) $('#pd-orient').value = saved.orient; } catch (_) {}
  $('#pd-hint').textContent = pdfHint();
  $('#pdfdlg').classList.add('show');
}
$('#pdfdlg').addEventListener('change', () => { $('#pd-hint').textContent = pdfHint(); });
$('#pd-cancel').addEventListener('click', () => $('#pdfdlg').classList.remove('show'));
$('#pdfdlg').addEventListener('pointerdown', (e) => { if (e.target === $('#pdfdlg')) $('#pdfdlg').classList.remove('show'); });
$('#pd-go').addEventListener('click', () => { const o = pdfOpts(); localStorage.setItem(PDF_KEY, JSON.stringify(o)); $('#pdfdlg').classList.remove('show'); printPdf(o); });
function printPdf(o) {
  const plan = pdfPlan(o);
  const css = [...document.styleSheets].filter(ss => !ss.href || new URL(ss.href).origin === location.origin).flatMap(ss => [...ss.cssRules].map(r => r.cssText)).join('\n');
  const cardsCopy = cardsEl.cloneNode(true);
  cardsCopy.querySelectorAll('.card').forEach(c => c.classList.remove('selected', 'multi', 'common', 'onpath', 'editing', 'link-source', 'enter'));
  const world = `${edgesSvg.outerHTML}${badgesEl.outerHTML}<div id="cards">${cardsCopy.innerHTML}</div>`;
  const multi = plan.tiles.length > 1;
  const id = (r, c) => `${String.fromCharCode(65 + r)}${c + 1}`;
  const has = (r, c) => plan.tiles.some(t => t.r === r && t.c === c);
  const label = (tl) => multi ? id(tl.r, tl.c) : '';
  const guides = (tl) => !multi ? '' : [
    has(tl.r, tl.c - 1) ? `<div class="guide l">← ${id(tl.r, tl.c - 1)}</div>` : '',
    has(tl.r, tl.c + 1) ? `<div class="guide r">${id(tl.r, tl.c + 1)} →</div>` : '',
    has(tl.r - 1, tl.c) ? `<div class="guide t">↑ ${id(tl.r - 1, tl.c)}</div>` : '',
    has(tl.r + 1, tl.c) ? `<div class="guide b">↓ ${id(tl.r + 1, tl.c)}</div>` : '',
    `<div class="sheet-id">${label(tl)}</div>`,
  ].join('');
  const glue = (tl) => !multi ? '' : (has(tl.r, tl.c + 1) ? '<i class="glue r"></i>' : '') + (has(tl.r + 1, tl.c) ? '<i class="glue b"></i>' : '');
  const date = new Date().toLocaleDateString(lang);
  const pages = plan.tiles.map(tl => `<section class="page"><div class="clip"><div id="world" style="transform: translate(${-tl.x0 * plan.s}px, ${-tl.y0 * plan.s}px) scale(${plan.s})">${world}</div>${glue(tl)}</div>
    ${guides(tl)}
    <div class="foot"><span>${esc(shownName(fileName))}</span><span>${date} · ${Math.round(plan.s * 100)}%${multi ? ` · ${label(tl)} (${plan.rows}×${plan.cols})` : ''}</span></div>
    <i class="mark tl"></i><i class="mark tr"></i><i class="mark bl"></i><i class="mark br"></i></section>`).join('');
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(shownName(fileName))}</title><style>${css}
    @page { size: ${plan.paperMM[0]}mm ${plan.paperMM[1]}mm; margin: 0; }
    :root { color-scheme: light; --card-w: ${CARD_W}px; --card-h: ${CARD_H}px; --shadow-sm: none; --shadow: none; --shadow-lg: none; }
    .card, .card.selected, .card.multi, .marriage, .relbadge, .ord { box-shadow: none; }
    ${o.plain ? `:root { --bg: #fff; --card: #fff; --panel: #fff; --panel-2: #f1f3f8; --border: #9aa0ad; --border-strong: #6b7280; --text: #000; --muted: #4b5563; --line: #5b6373; --shadow-sm: none; --shadow: none; }
    .card, .card.selected, .card.multi { box-shadow: none; border-color: var(--border); }
    .card.index { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #000; }
    .photo { background: #e5e7eb !important; color: #374151 !important; border-color: #fff; box-shadow: 0 0 0 1px #9aa0ad; }
    .marriage, .relbadge, .ord { box-shadow: none; border-color: var(--border); }
    #edges path { stroke-width: 2.2; }
    #edges path.past { opacity: .6; }` : `.card.selected, .card.multi { border-color: var(--border); }`}
    html, body { overflow: visible; background: #fff; width: ${plan.paperMM[0]}mm; height: auto; margin: 0; }
    .page { position: relative; width: ${plan.paperMM[0]}mm; height: ${plan.paperMM[1]}mm; overflow: hidden; break-inside: avoid; page-break-inside: avoid; background: #fff; }
    .page + .page { break-before: page; page-break-before: always; }
    .clip { position: absolute; left: ${plan.margin}px; top: ${plan.margin}px; width: ${plan.aw}px; height: ${plan.ah}px; overflow: hidden; contain: strict; }
    #world { will-change: auto; }
    .foot { position: absolute; left: ${plan.margin}px; right: ${plan.margin}px; bottom: ${plan.margin * 0.4}px; display: flex; justify-content: space-between; font-size: 10px; color: #4b5563; }
    .guide { position: absolute; font-size: 11px; font-weight: 600; color: #6b7280; letter-spacing: .02em; }
    .guide.l { left: ${plan.margin * 0.25}px; top: 50%; transform: translateY(-50%) rotate(-90deg); transform-origin: center; white-space: nowrap; }
    .guide.r { right: ${plan.margin * 0.25}px; top: 50%; transform: translateY(-50%) rotate(90deg); transform-origin: center; white-space: nowrap; }
    .guide.t { left: 50%; top: ${plan.margin * 0.3}px; transform: translateX(-50%); }
    .guide.b { left: 50%; bottom: ${plan.margin * 0.3 + plan.footer}px; transform: translateX(-50%); }
    .sheet-id { position: absolute; left: ${plan.margin}px; top: ${plan.margin * 0.2}px; font-size: 14px; font-weight: 700; color: #374151; }
    .glue { position: absolute; border: 0 dashed #b9bfcc; pointer-events: none; }
    .glue.r { top: 0; bottom: 0; right: ${plan.overlap || 0}px; border-left-width: 1px; }
    .glue.b { left: 0; right: 0; bottom: ${plan.overlap || 0}px; border-top-width: 1px; }
    .mark { position: absolute; width: 14px; height: 14px; border: 0 solid #999; }
    .mark.tl { left: ${plan.margin - 15}px; top: ${plan.margin - 15}px; border-right-width: 1px; border-bottom-width: 1px; }
    .mark.tr { right: ${plan.margin - 15}px; top: ${plan.margin - 15}px; border-left-width: 1px; border-bottom-width: 1px; }
    .mark.bl { left: ${plan.margin - 15}px; bottom: ${plan.margin + plan.footer - 15}px; border-right-width: 1px; border-top-width: 1px; }
    .mark.br { right: ${plan.margin - 15}px; bottom: ${plan.margin + plan.footer - 15}px; border-left-width: 1px; border-top-width: 1px; }
    .plus, .photo .cam, .photo-x, .edit { display: none !important; }
    .card.leave { display: none; }
    .card { cursor: default; }
    .photo img { filter: ${o.gray ? 'grayscale(1)' : 'none'}; }
    .marriage.empty { display: none; }
  </style></head><body class="${compact ? 'compact' : ''} ${orderBadges ? '' : 'no-ord'}">${pages}
  <script>window.onload = () => setTimeout(() => { window.print(); }, 200);<\/script></body></html>`;
  const win = window.open('', '_blank');
  if (!win) return toast(t('save_failed'));
  win.document.open(); win.document.write(html); win.document.close();
}

function createRelative(id, kind, anchor, familyId) {
  spawnFrom = id;
  if (kind === 'parent' && !familyId && parentsOf(id).length >= 2) {
    return openMenu(anchor || cardEl(id), t('two_parents'), parentsOf(id).map(old => ({ label: t('replace') + ' ' + (state.people[old]?.name || t('unnamed')), run: () => createRelative(id, 'parent', null, old) })));
  }
  if (kind === 'child' && !familyId) {
    const fams = parentFamilies(id);
    if (fams.length > 1) {
      const items = fams.map(f => ({
        label: t('with') + ' ' + (f.parents.filter(x => x !== id).map(x => state.people[x]?.name || t('unnamed')).join(', ') || t('no_partner')),
        run: () => createRelative(id, 'child', null, f.id),
      }));
      return openMenu(anchor || cardEl(id), t('add_child_menu'), items);
    }
  }
  const p = mutate(() => {
    if (kind === 'parent') return addParent(id, familyId);
    if (kind === 'child') return addChild(id, familyId);
    if (kind === 'spouse') return addSpouse(id);
    return addSibling(id, kind === 'sibling-left' ? 'left' : 'right');
  });
  if (!p) return toast(t('two_parents'));
  startEditing(p.id, '.f-name', true);
  ensureVisible(p.id);
}
function createFirst() {
  const p = mutate(() => newPerson());
  resetView();
  startEditing(p.id, '.f-name', true);
}
emptyEl.addEventListener('click', createFirst);

function removeSelected() {
  if (!selectedId) return;
  const id = selectedId;
  const next = nearestRelative(id);
  stopEditing();
  mutate(() => deletePerson(id));
  select(next);
  toast(t('deleted'));
}

function navigate(dir) {
  if (!selectedId) { const first = people()[0]; if (first) select(first.id); return; }
  const id = selectedId;
  let target = null;
  if (dir === 'up') target = parentsOf(id)[0];
  else if (dir === 'down') target = childrenOf(id)[0];
  else {
    const sibs = siblingsOf(id); const i = sibs.indexOf(id);
    target = sibs[i + (dir === 'left' ? -1 : 1)];
    if (!target) target = spousesOf(id).find(sp => (positions.get(sp).x - positions.get(id).x) * (dir === 'left' ? -1 : 1) > 0);
  }
  if (!target) target = spatialNeighbour(id, dir);
  if (target) select(target);
}
function spatialNeighbour(id, dir) {
  const a = positions.get(id); let best = null, bestD = Infinity;
  for (const [oid, b] of positions) {
    if (oid === id) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    let ok;
    if (dir === 'up') ok = dy < 0 && Math.abs(dx) <= Math.abs(dy) * 2 + CARD_W;
    else if (dir === 'down') ok = dy > 0 && Math.abs(dx) <= Math.abs(dy) * 2 + CARD_W;
    else if (dir === 'left') ok = dx < 0 && Math.abs(dy) <= Math.abs(dx);
    else ok = dx > 0 && Math.abs(dy) <= Math.abs(dx);
    if (!ok) continue;
    const d = (dir === 'up' || dir === 'down') ? Math.abs(dy) * 2 + Math.abs(dx) : Math.abs(dx) * 2 + Math.abs(dy);
    if (d < bestD) { bestD = d; best = oid; }
  }
  return best;
}

document.addEventListener('keydown', (e) => {
  const inField = e.target.matches('input, textarea, [contenteditable]');
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(e.shiftKey); return; }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); open(); return; }
  if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); newTree(); return; }
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'f' && people().length) { e.preventDefault(); openSearch(); return; }
  if (inField) return;
  if (e.key === 'Escape') {
    if ($('#help').classList.contains('show')) return $('#help').classList.remove('show');
    if ($('#legend').classList.contains('show')) return $('#legend').classList.remove('show');
    if (welcome.classList.contains('show') && people().length) return hideWelcome();
    if (mpopFamily) return closeMarriage();
    if (linkFrom) return cancelLink();
    if (rpopId) return closeRelation();
    return select(null);
  }
  if (e.key === ' ') { e.preventDefault(); spaceDown = true; viewport.classList.add('panning'); return; }
  if (e.key === '?') return $('#help').classList.toggle('show');
  if (e.key === 'g' || e.key === 'G') { $('#help').classList.remove('show'); return $('#legend').classList.toggle('show'); }
  if (e.key === 'f' || e.key === 'F') return fitView();
  if (e.key === 'v' || e.key === 'V') return toggleCompact();
  if (e.key === '0') return resetView();
  if (e.key === '+' || e.key === '=') return zoomAt(1.2, viewport.clientWidth / 2, viewport.clientHeight / 2, true);
  if (e.key === '-' || e.key === '_') return zoomAt(1 / 1.2, viewport.clientWidth / 2, viewport.clientHeight / 2, true);

  if (!people().length && (e.key === 'Enter' || e.key.toLowerCase() === 'n')) { e.preventDefault(); return createFirst(); }
  const dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  if (dirs[e.key]) {
    e.preventDefault();
    if (e.shiftKey && selectedId) {
      const kind = { up: 'parent', down: 'child', left: 'sibling-left', right: 'sibling-right' }[dirs[e.key]];
      return createRelative(selectedId, kind);
    }
    return navigate(dirs[e.key]);
  }
  if (!selectedId) { if (e.key === 'Tab') { e.preventDefault(); navigate('right'); } return; }
  if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); return startEditing(selectedId); }
  if (e.key === 'Tab') { e.preventDefault(); return navigate(e.shiftKey ? 'left' : 'right'); }
  if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); return removeSelected(); }
  const k = e.key.toLowerCase();
  if (k === 'l') { e.preventDefault(); return startLink(selectedId); }
  if (k === 'i') { e.preventDefault(); const id = selectedId; return mutate(() => { state.indexPerson = state.indexPerson === id ? null : id; }); }
  if (k === 'p' || k === 'c' || k === 's' || k === 'm') {
    e.preventDefault();
    createRelative(selectedId, { p: 'parent', c: 'child', s: 'sibling-right', m: 'spouse' }[k]);
  }
});
document.addEventListener('keyup', (e) => {
  if (e.key === ' ') { spaceDown = false; if (!pan) viewport.classList.remove('panning'); }
});

document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
  const c = viewport.clientWidth / 2, m = viewport.clientHeight / 2;
  ({
    new: newTree, open, save: () => save(false), saveas: () => save(true), undo, redo, pdf: exportPdf, download,
    filemenu: () => openMenu(b, shownName(fileName), [
      { label: t('new'), run: newTree }, { label: t('open'), run: open }, { label: t('save'), run: () => save(false) }, { label: t('saveas'), run: () => save(true) },
      ...(hasFS ? [] : [{ label: t('download'), run: download }]), { label: t('export_pdf'), run: exportPdf },
    ]),
    zoomin: () => zoomAt(1.2, c, m, true), zoomout: () => zoomAt(1 / 1.2, c, m, true), fit: fitView, compact: toggleCompact,
    help: () => $('#help').classList.toggle('show'),
    legend: () => { $('#help').classList.remove('show'); $('#legend').classList.toggle('show'); },
  })[b.dataset.act]();
}));
$('#actions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sel]'); if (!b || !selectedId) return;
  const a = b.dataset.sel;
  if (a === 'edit') startEditing(selectedId);
  else if (a === 'link') startLink(selectedId);
  else if (a === 'photo') photoAction(selectedId, b);
  else if (a === 'delete') removeSelected();
  else createRelative(selectedId, a, b);
});
$('#help').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('show'); });
$('#legend').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('show'); });

const hasFS = 'showSaveFilePicker' in window;
const EXT = '.ftree';
const shownName = (n) => (n || '').replace(/\.(ftree|json)$/i, '');
const pickerOpts = { suggestedName: 'family-tree' + EXT, types: [{ description: 'Family tree', accept: { 'application/octet-stream': [EXT] } }] };
const openTypes = [{ description: 'Family tree', accept: { 'application/octet-stream': [EXT], 'application/json': ['.json'] } }];
const MAGIC = [0x46, 0x54, 0x52, 0x45, 0x45, 0x01];

function serialize() {
  const blobs = [];
  const ref = (url) => { if (!url) return null; const { mime, bytes } = dataUrlToBytes(url); blobs.push({ mime, bytes }); return blobs.length - 1; };
  const people = {};
  for (const p of Object.values(state.people)) {
    const { photo, photoSrc, ...rest } = p;
    people[p.id] = { ...rest, thumbRef: ref(photo), photoRef: ref(photoSrc) };
  }
  const meta = new TextEncoder().encode(JSON.stringify({ version: 1, people, families: state.families, relations: state.relations, indexPerson: state.indexPerson || null, households: state.households || [], blobs: blobs.map(b => b.mime) }));
  const head = new Uint8Array(MAGIC.length + 4); head.set(MAGIC);
  new DataView(head.buffer).setUint32(MAGIC.length, meta.length, true);
  const parts = [head, meta];
  for (const b of blobs) { const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, b.bytes.length, true); parts.push(len, b.bytes); }
  return new Blob(parts, { type: 'application/octet-stream' });
}
function deserialize(buf) {
  const u8 = new Uint8Array(buf);
  if (!MAGIC.slice(0, 5).every((b, i) => u8[i] === b)) {
    const text = new TextDecoder().decode(u8).trim();
    if (!text.startsWith('{')) throw new Error(t('not_tree'));
    return JSON.parse(text);
  }
  const dv = new DataView(buf);
  let off = MAGIC.length;
  const metaLen = dv.getUint32(off, true); off += 4;
  const meta = JSON.parse(new TextDecoder().decode(u8.subarray(off, off + metaLen))); off += metaLen;
  const blobs = [];
  for (const mime of meta.blobs || []) {
    const len = dv.getUint32(off, true); off += 4;
    blobs.push(bytesToDataUrl(u8.subarray(off, off + len), mime)); off += len;
  }
  const people = {};
  for (const p of Object.values(meta.people || {})) {
    const { thumbRef, photoRef, ...rest } = p;
    people[p.id] = { ...rest, photo: thumbRef == null ? null : blobs[thumbRef], photoSrc: photoRef == null ? null : blobs[photoRef] };
  }
  return { version: 1, people, families: meta.families || {}, relations: meta.relations || [], indexPerson: meta.indexPerson || null, households: meta.households || [] };
}

async function save(as) {
  stopEditing();
  clearTimeout(scheduleAutosave.t);
  const blob = serialize();
  try {
    if (hasFS) {
      if (!fileHandle || as) {
        fileHandle = await window.showSaveFilePicker({ ...pickerOpts, suggestedName: fileHandle?.name || pickerOpts.suggestedName });
        fileName = fileHandle.name; recents.remember(fileHandle);
      }
      const w = await fileHandle.createWritable(); await w.write(blob); await w.close();
    } else {
      if (isUntitled() || as || !libraryId) {
        const n = prompt(t('file_name'), isUntitled() ? 'family-tree' + EXT : fileName.replace(/\.json$/, EXT));
        if (!n) return; fileName = n.endsWith(EXT) ? n : n + EXT;
      }
      await saveToLibrary(blob, as);
      dirty = false; render(); scheduleDraft(); toast(t('saved_local'));
      return;
    }
    dirty = false; render(); toast(t('saved') + ' ' + shownName(fileName));
  } catch (err) { if (err.name !== 'AbortError') toast(t('save_failed') + ': ' + err.message); }
}

async function open(fromWelcome) {
  if (!hasFS) return showWelcome();
  if (dirty && !fromWelcome && !confirm(t('discard'))) return;
  try {
    if (hasFS) {
      const [h] = await window.showOpenFilePicker({ types: openTypes, multiple: false });
      const buf = await (await h.getFile()).arrayBuffer();
      loadData(buf, h.name); fileHandle = h.name.endsWith(EXT) ? h : null;
      if (fileHandle) recents.remember(h);
    } else fileInput.click();
  } catch (err) { if (err.name !== 'AbortError') toast(t('open_failed') + ': ' + err.message); }
}
fileInput.addEventListener('change', async () => {
  const f = fileInput.files[0]; fileInput.value = ''; if (!f) return;
  try {
    const buf = await f.arrayBuffer();
    loadData(buf, f.name); hideWelcome();
    if (!hasFS) { libraryId = await library.add({ name: fileName, data: buf, time: Date.now() }); dirty = false; render(); scheduleDraft(); }
  } catch (err) { toast(t('open_failed') + ': ' + err.message); }
});
function loadData(buf, name) {
  const data = deserialize(buf);
  if (!data || typeof data.people !== 'object' || typeof data.families !== 'object') throw new Error(t('not_tree'));
  setState({ version: 1, people: data.people, families: data.families, relations: Array.isArray(data.relations) ? data.relations : [], indexPerson: null, households: [] });
  for (const p of Object.values(state.people)) { p.alive = p.alive ?? !p.death; p.name ??= ''; p.birthName ??= ''; p.birthplace ??= ''; p.profession ??= ''; p.notes ??= ''; p.birth ??= ''; p.death ??= ''; p.photo ??= null; p.photoSrc ??= null; p.crop ??= null; p.fate ??= ''; p.lineEnded ??= false; p.gender ??= ''; p.illness ??= ''; p.substance ??= ''; }
  state.households = Array.isArray(data.households) ? data.households.map(h => ({ ...h, members: h.members.filter(id => state.people[id]) })).filter(h => h.members.length > 1) : [];
  state.indexPerson = data.indexPerson && state.people[data.indexPerson] ? data.indexPerson : null;
  for (const f of Object.values(state.families)) { f.married ??= ''; f.ended ??= ''; f.status ??= 'married'; f.parents ??= []; f.children ??= []; f.kinds ??= {}; }
  fileName = name.replace(/\.json$/, EXT); fileHandle = null; libraryId = null; dirty = name.endsWith('.json'); undoStack = []; redoStack = []; selectedId = null; editingId = null;
  render(); fitView(); scheduleDraft(); toast(t('opened') + ' ' + name);
}
function newTree() {
  if (dirty && !confirm(t('discard'))) return;
  setState(emptyState()); fileHandle = null; libraryId = null; fileName = t('untitled'); dirty = false;
  undoStack = []; redoStack = []; selectedId = null; editingId = null;
  render(); resetView(); scheduleDraft();
}

function isUntitled() { return Object.values(I18N).some(d => d.untitled === fileName); }
let idbPromise = null;
function idb() {
  return idbPromise ??= new Promise((res, rej) => {
    const r = indexedDB.open('familytree', 2);
    r.onupgradeneeded = () => { const db = r.result; for (const n of ['recent', 'library']) if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: 'id', autoIncrement: true }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function store(name) {
  const tx = async (mode, fn) => {
    const db = await idb();
    return new Promise((res, rej) => { const req = fn(db.transaction(name, mode).objectStore(name)); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  };
  return {
    async all() { try { return (await tx('readonly', st => st.getAll())).sort((a, b) => b.time - a.time); } catch (_) { return []; } },
    get: (id) => tx('readonly', st => st.get(id)),
    add: (rec) => tx('readwrite', st => st.add(rec)),
    put: (rec) => tx('readwrite', st => st.put(rec)),
    async remove(id) { try { await tx('readwrite', st => st.delete(id)); } catch (_) {} },
  };
}
const recents = Object.assign(store('recent'), {
  async remember(handle) {
    try {
      for (const r of await this.all()) if (await r.handle.isSameEntry(handle)) await this.remove(r.id);
      await this.add({ handle, name: handle.name, time: Date.now() });
      for (const r of (await this.all()).slice(8)) await this.remove(r.id);
    } catch (_) {}
  },
});
const library = store('library');
let libraryId = null;
async function saveToLibrary(blob, asNew) {
  const data = await blob.arrayBuffer();
  if (libraryId && !asNew) await library.put({ id: libraryId, name: fileName, data, time: Date.now() });
  else libraryId = await library.add({ name: fileName, data, time: Date.now() });
}
async function openLibrary(id) {
  const rec = await library.get(id);
  if (!rec) return toast(t('file_missing'));
  loadData(rec.data, rec.name); libraryId = rec.id; hideWelcome();
}
function download() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(serialize()); a.download = isUntitled() ? 'family-tree' + EXT : fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const welcome = $('#welcome');
async function openHandle(h, id) {
  try {
    let perm = await h.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') perm = await h.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return toast(t('perm_denied'));
    const buf = await (await h.getFile()).arrayBuffer();
    loadData(buf, h.name); fileHandle = h; recents.remember(h);
    hideWelcome();
  } catch (err) {
    if (err.name === 'NotFoundError') { if (id != null) await recents.remove(id); toast(t('file_missing')); showWelcome(); }
    else toast(t('open_failed') + ': ' + err.message);
  }
}
async function showWelcome() {
  const list = hasFS ? await recents.all() : await library.all();
  $('#w-list-title').textContent = t(hasFS ? 'recent' : 'library');
  $('#w-open').textContent = t(hasFS ? 'open_file' : 'import_file');
  const cont = $('#w-continue');
  cont.hidden = !(dirty && people().length);
  cont.textContent = `${t('continue_draft')} · ${shownName(fileName)}`;
  const box = $('#w-recent');
  box.innerHTML = list.length ? '' : `<div class="none">${esc(t('no_recent'))}</div>`;
  for (const r of list) {
    const b = document.createElement('button'); b.className = 'recent';
    b.innerHTML = `<span class="ic">🌳</span><span class="nm">${esc(shownName(r.name))}</span><span class="dt">${esc(new Date(r.time).toLocaleDateString(lang))}</span><span class="x" title="${esc(t(hasFS ? 'forget' : 'delete'))}">×</span>`;
    b.addEventListener('click', async (e) => {
      if (e.target.classList.contains('x')) {
        if (!hasFS && !confirm(t('delete_tree'))) return;
        await (hasFS ? recents : library).remove(r.id); if (libraryId === r.id) libraryId = null;
        b.remove(); if (!box.children.length) box.innerHTML = `<div class="none">${esc(t('no_recent'))}</div>`; return;
      }
      if (hasFS) openHandle(r.handle, r.id); else openLibrary(r.id);
    });
    box.appendChild(b);
  }
  welcome.classList.add('show');
}
function hideWelcome() { welcome.classList.remove('show'); }
$('#w-continue').addEventListener('click', hideWelcome);
$('#w-open').addEventListener('click', async () => { if (hasFS) { hideWelcome(); await open(true); } else fileInput.click(); });
$('#w-new').addEventListener('click', () => { if (dirty && people().length && !confirm(t('discard'))) return; dirty = false; newTree(); hideWelcome(); });
welcome.addEventListener('pointerdown', (e) => { if (e.target === welcome && (people().length || !hasFS)) hideWelcome(); });

function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ state, fileName, dirty, libraryId })); } catch (_) {}
}
function scheduleDraft() {
  clearTimeout(scheduleDraft.t);
  scheduleDraft.t = setTimeout(saveDraft, 400);
  if (dirty) scheduleAutosave();
}
const canAutosave = () => hasFS ? !!fileHandle : true;
function scheduleAutosave() {
  if (!canAutosave()) return;
  clearTimeout(scheduleAutosave.t);
  scheduleAutosave.t = setTimeout(autosave, 900);
}
let autosaving = false, autosaveAgain = false;
async function autosave() {
  if (!dirty || !canAutosave()) return;
  if (autosaving) { autosaveAgain = true; return; }
  autosaving = true;
  try {
    const blob = serialize();
    if (hasFS) { const w = await fileHandle.createWritable(); await w.write(blob); await w.close(); }
    else await saveToLibrary(blob, false);
    dirty = false; $('#filename').classList.remove('dirty'); document.title = shownName(fileName) + ' — ' + t('app');
    scheduleDraft();
  } catch (err) {
    if (!autosave.warned) { autosave.warned = true; toast(t('autosave_failed') + ': ' + err.message); }
  } finally {
    autosaving = false;
    if (autosaveAgain) { autosaveAgain = false; scheduleAutosave(); }
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) { clearTimeout(scheduleAutosave.t); autosave(); } });
function restoreDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && d.state && Object.keys(d.state.people).length) { setState(d.state); state.relations ??= []; state.indexPerson ??= null; state.households ??= []; fileName = d.fileName || fileName; dirty = !!d.dirty; libraryId = d.libraryId || null; return true; }
  } catch (_) {}
  return false;
}
window.addEventListener('beforeunload', (e) => { if (reloading) return; if (dirty && !canAutosave()) { e.preventDefault(); e.returnValue = ''; } else if (dirty) { clearTimeout(scheduleAutosave.t); autosave(); } });

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

fileName = t('untitled');
const restored = restoreDraft();
applyI18n(); renderLegend();
render();
document.getElementById('lang').addEventListener('change', (e) => setLang(e.target.value));
if (restored) fitView(); else resetView();
$('[data-act=download]').hidden = hasFS;
navigator.storage?.persist?.().catch(() => {});
let appVersion = null, updateReady = false, reloading = false;
async function applyUpdate() {
  reloading = true; clearTimeout(scheduleDraft.t); saveDraft();
  // GitHub Pages serves index.html with max-age=600, so refresh the HTTP cache before reloading
  try { await fetch('./', { cache: 'reload' }); } catch (_) {}
  location.reload();
}
async function checkUpdate() {
  let v;
  try { v = (await (await fetch('version.json', { cache: 'no-store' })).json()).v; } catch (_) { return; }
  if (!appVersion) appVersion = v;
  else if (v !== appVersion) { updateReady = true; $('#update').classList.add('show'); }
}
$('#update').addEventListener('click', applyUpdate);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (updateReady && !dirty && !sheetId) applyUpdate(); else checkUpdate();
});
setInterval(checkUpdate, 30 * 60_000);
checkUpdate();

const INSTALL_KEY = 'familytree.installDismissed';
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(navigator.userAgent);
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let installEvent = null;
function renderInstall() {
  sh('inst-go').hidden = !installEvent;
  sh('inst-steps').hidden = !!installEvent;
  sh('inst-steps').innerHTML = t(isIOS ? 'inst_ios' : 'inst_android').map(x => `<li><span>${x}</span></li>`).join('');
}
function closeInstall() { $('#install').classList.remove('show'); localStorage.setItem(INSTALL_KEY, '1'); }
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; renderInstall(); });
window.addEventListener('appinstalled', closeInstall);
sh('inst-later').addEventListener('click', closeInstall);
sh('inst-go').addEventListener('click', async () => { installEvent.prompt(); await installEvent.userChoice; installEvent = null; closeInstall(); });
if ((isIOS || isAndroid) && !isStandalone && !localStorage.getItem(INSTALL_KEY)) setTimeout(() => { renderInstall(); $('#install').classList.add('show'); }, 1200);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (params) => {
    const h = params.files?.[0]; if (!h) return;
    try { await openHandle(h); } catch (_) {}
  });
}
(async () => {
  const last = (hasFS ? await recents.all() : await library.all())[0];
  if (last && !(restored && dirty)) {
    try {
      if (!hasFS) { await openLibrary(last.id); return; }
      if (await last.handle.queryPermission({ mode: 'readwrite' }) === 'granted') { await openHandle(last.handle, last.id); return; }
    } catch (_) {}
  }
  showWelcome();
})();
