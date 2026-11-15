// WebGL view of the tree. The DOM keeps semantics, hit testing and tests; it is made transparent while this layer draws.
import {
  Application,
  Container,
  Graphics,
  GraphicsPath,
  BitmapText,
  BitmapFontManager,
  TextStyle,
  Texture,
  Sprite,
  Mesh,
  Geometry,
  Shader,
  CanvasTextMetrics,
  Color,
} from '../vendor/pixi.min.mjs';
import { state } from './model.js';
import { t } from './i18n.js';
import { initials, hueOf } from './util.js';
import { datesText, marriageOrdinal, marriageText, edgeData } from './render.js';

let app = null,
  ctx = null,
  worldC,
  edgesG,
  cardsC,
  badgesC,
  overlayC,
  grid,
  gridU = null;
let cards = new Map(),
  badges = [],
  pos = new Map(),
  view = { x: 0, y: 0, s: 1 },
  hovered = null,
  hoveredPlus = null,
  theme = null,
  dirty = false,
  sceneDirty = true,
  viewTween = null;
const photoTex = new Map(),
  imgCache = new Map(),
  shadowTex = new Map();
export let glActive = false;

const FONT = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif";

export async function initGL(c, els) {
  ctx = c;
  const { viewport, cardsEl } = els;
  let a;
  try {
    a = new Application();
    await a.init({
      backgroundAlpha: 0,
      antialias: true,
      resolution: devicePixelRatio || 1,
      autoDensity: true,
      resizeTo: viewport,
      autoStart: false,
      preference: 'webgl',
    });
  } catch (e) {
    console.warn('WebGL layer unavailable, using DOM rendering', e);
    return false;
  }
  app = a;
  app.canvas.id = 'gl';
  Object.assign(app.canvas.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' });
  viewport.insertBefore(app.canvas, viewport.firstChild);
  readTheme();
  grid = makeGrid();
  app.stage.addChild(grid);
  worldC = new Container();
  edgesG = new Graphics();
  cardsC = new Container();
  badgesC = new Container();
  overlayC = new Container();
  worldC.addChild(edgesG, cardsC, badgesC, overlayC);
  app.stage.addChild(worldC);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    readTheme();
    photoTex.clear();
    shadowTex.clear();
    gridU.uDotColor = new Color(theme.grid).toArray();
    glSync();
  });
  const watchDpr = () => {
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener(
      'change',
      () => {
        app.renderer.resolution = devicePixelRatio || 1;
        app.resize();
        invalidate();
        watchDpr();
      },
      { once: true },
    );
  };
  watchDpr();
  new MutationObserver(() => glSync()).observe(cardsEl, {
    attributes: true,
    attributeFilter: ['class'],
    subtree: true,
    childList: true,
  });
  // only body classes that change how cards look trigger a rebuild; zooming/panning/selection flags do not
  const styleSig = () =>
    ['has-multi', 'linking', 'no-ord', 'compact'].map((k) => document.body.classList.contains(k)).join();
  let sig = styleSig();
  new MutationObserver(() => {
    const next = styleSig();
    if (next === sig) return;
    sig = next;
    for (const card of cards.values()) card.redraw = true;
    sceneDirty = true;
    invalidate();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  cardsEl.addEventListener('pointerover', (e) => {
    const el = e.target.closest('.card');
    const id = el?.dataset.id || null;
    const plus = e.target.closest('.plus');
    const nextPlus = plus ? { id, kind: plus.dataset.add, tip: plus.dataset.tip } : null;
    if (id !== hovered || (nextPlus?.kind || null) !== (hoveredPlus?.kind || null)) {
      hovered = id;
      hoveredPlus = nextPlus;
      invalidate(true);
    }
  });
  cardsEl.addEventListener('pointerout', (e) => {
    if (
      e.relatedTarget &&
      cardsEl.contains(e.relatedTarget) &&
      e.relatedTarget.closest('.card')?.dataset.id === hovered
    ) {
      if (hoveredPlus && !e.relatedTarget.closest('.plus')) {
        hoveredPlus = null;
        invalidate(true);
      }
      return;
    }
    if (hovered) {
      hovered = null;
      hoveredPlus = null;
      invalidate(true);
    }
  });
  new ResizeObserver(() => {
    app.resize();
    invalidate();
  }).observe(viewport);
  // one glyph atlas per font weight, shared by every label. Dynamic fonts rasterize at a 100px base, so the
  // resolution is chosen to give ~64 device px per 16px label on this screen: sharp up to about 2x zoom.
  BitmapFontManager.defaultOptions.resolution = Math.min(2, ((devicePixelRatio || 1) * 32) / 100);
  BitmapFontManager.defaultOptions.textureSize = 512;
  glActive = true;
  window.__gl = {
    app,
    cards,
    stats,
    get pos() {
      return pos;
    },
    get view() {
      return view;
    },
  };
  document.body.classList.add('gl');
  return true;
}

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  theme = {
    dark,
    bg: v('--bg'),
    grid: v('--grid'),
    card: v('--card'),
    panel2: v('--panel-2'),
    border: v('--border'),
    borderStrong: v('--border-strong'),
    text: v('--text'),
    muted: v('--muted'),
    accent: v('--accent'),
    accent2: v('--accent-2'),
    accentSoft: v('--accent-soft'),
    line: v('--line'),
    danger: v('--danger'),
    love: v('--love'),
    ended: '#9aa2b8',
    common: '#e39b12',
  };
}

const mix = (c, a) => {
  const col = new Color(c);
  return { color: col.toNumber(), alpha: a };
};

export function glSetView(v, animate) {
  if (!app) return;
  if (animate && !viewTween) viewTween = { from: { ...view }, start: performance.now() };
  view = { ...v };
  if (!animate) viewTween = null;
  invalidate();
}

export function glSetPositions(map) {
  if (!app) return;
  pos = map;
  sceneDirty = true;
  invalidate();
}

export function invalidate() {
  if (!app || dirty) return;
  dirty = true;
  requestAnimationFrame(frame);
}

function ease(k) {
  return 1 - Math.pow(1 - k, 3);
}

const stats = { frames: 0, ms: 0, max: 0, edges: 0, badges: 0, cards: 0, render: 0 };
function frame(now) {
  dirty = false;
  if (!app) return;
  const t0 = performance.now();
  let v = view;
  if (viewTween) {
    const k = Math.min(1, (now - viewTween.start) / 280);
    const e = ease(k),
      f = viewTween.from;
    v = { x: f.x + (view.x - f.x) * e, y: f.y + (view.y - f.y) * e, s: f.s + (view.s - f.s) * e };
    if (k >= 1) viewTween = null;
    else invalidate();
  }
  worldC.position.set(v.x, v.y);
  worldC.scale.set(v.s);
  const vw = app.screen.width,
    vh = app.screen.height;
  drawGrid(v, vw, vh);
  const left = -v.x / v.s - 60,
    top = -v.y / v.s - 60,
    right = (vw - v.x) / v.s + 60,
    bottom = (vh - v.y) / v.s + 60;
  const body = document.body.classList;
  const multi = body.contains('has-multi');
  if (sceneDirty) {
    const t1 = performance.now();
    drawEdges(multi);
    const t2 = performance.now();
    drawBadges(multi);
    stats.edges += t2 - t1;
    stats.badges += performance.now() - t2;
    sceneDirty = false;
  }
  const t3 = performance.now();
  for (const [id, card] of cards) {
    const p = pos.get(id);
    if (!p) {
      card.root.visible = false;
      continue;
    }
    card.root.position.set(p.x, p.y);
    const vis = p.x + ctx.CARD_W > left && p.x < right && p.y + ctx.CARD_H + 40 > top && p.y < bottom;
    card.root.visible = vis;
    if (!vis) continue;
    const isHot = hovered === id;
    if (card.redraw || card.hot !== isHot || card.plusKind !== (isHot ? hoveredPlus?.kind : null))
      drawCard(card, isHot);
    if (card.fade != null) {
      const k = Math.min(1, (now - card.fade) / 320);
      card.root.alpha = card.alphaTarget * ease(k);
      if (k >= 1) card.fade = null;
      else invalidate();
    }
  }
  const t4 = performance.now();
  stats.cards += t4 - t3;
  app.renderer.render(app.stage);
  stats.render += performance.now() - t4;
  const dt = performance.now() - t0;
  stats.frames++;
  stats.ms += dt;
  stats.max = Math.max(stats.max, dt);
}

const GRID = 24;
// the dot grid is one full-screen quad; the fragment shader places the dots from the camera offset and spacing
function makeGrid() {
  const geometry = new Geometry({
    attributes: { aPosition: [0, 0, 1, 0, 1, 1, 0, 1] },
    indexBuffer: [0, 1, 2, 0, 2, 3],
  });
  gridU = {
    uSize: { value: [1, 1], type: 'vec2<f32>' },
    uOffset: { value: [0, 0], type: 'vec2<f32>' },
    uSpacing: { value: GRID, type: 'f32' },
    uDotColor: { value: new Color(theme.grid).toArray(), type: 'vec4<f32>' },
  };
  const shader = Shader.from({
    gl: {
      vertex: `
        in vec2 aPosition;
        out vec2 vPos;
        uniform mat3 uProjectionMatrix;
        uniform mat3 uWorldTransformMatrix;
        uniform mat3 uTransformMatrix;
        uniform vec2 uSize;
        void main() {
          vec2 p = aPosition * uSize;
          vPos = p;
          mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
          gl_Position = vec4((mvp * vec3(p, 1.0)).xy, 0.0, 1.0);
        }`,
      fragment: `
        in vec2 vPos;
        out vec4 finalColor;
        uniform vec2 uOffset;
        uniform float uSpacing;
        uniform vec4 uDotColor;
        void main() {
          vec2 q = mod(vPos - uOffset, uSpacing) - uSpacing * 0.5;
          float d = length(q);
          float a = (1.0 - smoothstep(1.0, 1.5, d)) * uDotColor.a;
          finalColor = vec4(uDotColor.rgb * a, a);
        }`,
    },
    resources: { gridUniforms: gridU },
  });
  gridU = shader.resources.gridUniforms.uniforms;
  return new Mesh({ geometry, shader });
}
function drawGrid(v, vw, vh) {
  let g = GRID * v.s;
  while (g < 16) g *= 2;
  gridU.uSize[0] = vw;
  gridU.uSize[1] = vh;
  gridU.uOffset[0] = v.x;
  gridU.uOffset[1] = v.y;
  gridU.uSpacing = g;
}

// ---- cards
export function glSync() {
  if (!app) return;
  const seen = new Set();
  for (const el of document.querySelectorAll('#cards .card')) {
    const id = el.dataset.id;
    seen.add(id);
    let card = cards.get(id);
    if (!card) {
      card = {
        id,
        root: new Container(),
        shadow: null,
        body: new Graphics(),
        photo: new Sprite(),
        texts: [],
        extras: new Graphics(),
        fade: performance.now(),
        alphaTarget: 1,
        hot: false,
        plusKind: null,
      };
      card.root.addChild(card.body, card.photo, card.extras);
      cardsC.addChild(card.root);
      cards.set(id, card);
    }
    const cls = el.classList;
    const next = {
      selected: cls.contains('selected'),
      editing: cls.contains('editing'),
      multi: cls.contains('multi'),
      common: cls.contains('common'),
      onpath: cls.contains('onpath'),
      link: cls.contains('link-source'),
      leave: cls.contains('leave'),
      fold: el.querySelector('.fold')?.textContent.trim() || '',
      foldOn: !!el.querySelector('.fold.on'),
      ord: el.querySelector('.ord')?.textContent.trim() || '',
      h: ctx.compact ? el.offsetHeight : 0,
    };
    const key = JSON.stringify(next) + JSON.stringify(state.people[id] || {}) + ctx.compact + document.body.className;
    if (card.key !== key) {
      card.key = key;
      card.st = next;
      card.redraw = true;
    }
    if (next.leave && card.alphaTarget !== 0) {
      card.alphaTarget = 0;
      card.fade = performance.now();
    }
  }
  for (const [id, card] of cards) {
    if (seen.has(id)) continue;
    card.root.destroy({ children: true });
    cards.delete(id);
  }
  sceneDirty = true;
  invalidate();
}

function text(str, style) {
  return new BitmapText({ text: str, style: { fontFamily: FONT, ...style } });
}

function clampLines(str, style, width, maxLines) {
  const m = CanvasTextMetrics.measureText(
    str,
    new TextStyle({ fontFamily: FONT, wordWrap: true, wordWrapWidth: width, breakWords: true, ...style }),
  );
  let lines = m.lines;
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    const fits = (s) =>
      CanvasTextMetrics.measureText(s + '…', new TextStyle({ fontFamily: FONT, ...style })).width <= width;
    while (last.length && !fits(last)) last = last.slice(0, -1);
    lines[maxLines - 1] = last.trimEnd() + '…';
  }
  return lines;
}

function roundRectPath(g, x, y, w, h, r) {
  g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

function drawCard(card, hot) {
  card.redraw = false;
  card.hot = hot;
  card.plusKind = hot ? hoveredPlus?.kind || null : null;
  const p = state.people[card.id];
  if (!p) return;
  const st = card.st || {};
  const body = document.body.classList;
  const compact = ctx.compact,
    W = ctx.CARD_W,
    H = compact ? Math.min(ctx.CARD_H, st.h || ctx.CARD_H) : ctx.CARD_H;
  const multiMode = body.contains('has-multi');
  const linking = body.contains('linking');
  const unborn = !!p.fate,
    deceased = !p.alive && !unborn,
    index = state.indexPerson === card.id;
  const active = st.selected || st.multi || st.common;
  const dimmed = multiMode && !st.multi && !st.common && !st.onpath;
  card.root.alpha = card.fade != null ? card.root.alpha : card.alphaTarget * (dimmed ? 0.35 : 1);
  for (const tx of card.texts) tx.destroy();
  card.texts = [];
  for (const ch of [...card.root.children])
    if (ch !== card.body && ch !== card.photo && ch !== card.extras) ch.destroy({ children: true });
  const g = card.body;
  g.clear();
  const ex = card.extras;
  ex.clear();
  const radius = compact ? 16 : 14;
  const showBox = !compact || hot || active;
  const borderColor =
    st.selected || st.multi ? theme.accent : st.common ? theme.common : hot ? theme.borderStrong : theme.border;
  // shadow
  const shadowKind = !showBox || compact ? null : active || hot ? 'lg' : 'sm';
  if (shadowKind) {
    const sp = shadowSprite(shadowKind, W, H);
    card.root.addChildAt(sp, 0);
  }
  if (showBox) {
    const fill = unborn ? theme.panel2 : compact ? mix(theme.card, 0.7) : theme.card;
    roundRectPath(g, 0, 0, W, H, radius);
    g.fill(fill);
    if (unborn && !compact) dashedRoundRect(g, 0.5, 0.5, W - 1, H - 1, radius, { width: 1, color: borderColor }, 5, 4);
    else {
      roundRectPath(g, 0.5, 0.5, W - 1, H - 1, radius);
      g.stroke({ width: 1, color: borderColor });
    }
    if (active) {
      roundRectPath(g, -1.5, -1.5, W + 3, H + 3, radius + 1.5);
      g.stroke({ width: 3, color: st.common ? theme.common : theme.accentSoft, alpha: st.common ? 0.3 : 1 });
    }
  }
  if (index && !compact) {
    roundRectPath(g, -1, -1, W + 2, H + 2, radius + 1);
    g.stroke({ width: 2, color: theme.card });
    roundRectPath(g, -3, -3, W + 6, H + 6, radius + 3);
    g.stroke({ width: 2, color: st.selected ? theme.accent : theme.text });
  }
  if (linking && st.link)
    dashedRoundRect(ex, -3, -3, W + 6, H + 6, radius + 3, { width: 2, color: theme.accent }, 6, 4);
  // photo
  const ps = compact ? 84 : 64;
  const px = compact ? (W - ps) / 2 : 14,
    py = compact ? 4 : (H - ps) / 2;
  const tex = photoTexture(p, ps, deceased, index && compact ? (st.selected ? 'accent' : 'text') : null);
  card.photo.texture = tex;
  card.photo.width = card.photo.height = ps + 16;
  card.photo.position.set(px - 8, py - 8);
  // texts
  const infoX = compact ? 4 : px + ps + 12,
    infoW = compact ? W - 8 : W - infoX - 14;
  const nameSize = compact ? 13.5 : 15.5,
    nameLH = nameSize * 1.2;
  const nameStyle = {
    fontSize: nameSize,
    fontWeight: p.name ? '650' : '400',
    fill: unborn || !p.name ? theme.muted : theme.text,
    letterSpacing: -0.15,
  };
  const neeStyle = { fontSize: compact ? 11.5 : 13, fontWeight: '400', fill: theme.muted };
  const nameStr = p.name || t('unnamed');
  const maxLines = compact ? 3 : 2;
  let lines = clampLines(nameStr, nameStyle, infoW, maxLines);
  let neeLines = [];
  if (p.birthName && lines.length < maxLines) {
    neeLines = clampLines(`${t('nee')} ${p.birthName}`, neeStyle, infoW, maxLines - lines.length);
  }
  const dt = datesText(p);
  const datesStyle = { fontSize: compact ? 11.5 : 12.5, fill: theme.muted, fontWeight: '400' };
  const dateLines = dt ? clampLines(dt, datesStyle, infoW, compact ? 3 : 2) : [];
  const neeLH = neeStyle.fontSize * 1.2,
    dateLH = datesStyle.fontSize * 1.3;
  const chipH = p.fate ? 16 : 0;
  const blockH =
    lines.length * nameLH +
    neeLines.length * neeLH +
    (dateLines.length || p.fate ? 4 : 0) +
    Math.max(dateLines.length * dateLH, chipH);
  let y = compact ? py + ps + 6 : (H - blockH) / 2;
  const place = (str, style, lh, align) => {
    const tx = text(str, style);
    tx.anchor.set(align === 'center' ? 0.5 : 0, 0);
    tx.position.set(align === 'center' ? W / 2 : infoX, y + (lh - style.fontSize * 1.15) / 2);
    card.root.addChild(tx);
    card.texts.push(tx);
    y += lh;
    return tx;
  };
  const align = compact ? 'center' : 'left';
  for (const l of lines) place(l, nameStyle, nameLH, align);
  for (const l of neeLines) place(l, neeStyle, neeLH, align);
  if (dateLines.length || p.fate) y += 4;
  for (const l of dateLines) place(l, datesStyle, dateLH, align);
  if (p.fate) {
    const label = text(t('fate_' + p.fate), { fontSize: 11, fill: theme.accent, fontWeight: '400' });
    const cw = label.width + 12;
    const cx = compact ? W / 2 - cw / 2 : infoX + (dateLines.length ? 0 : 0);
    const cy = dateLines.length ? y - dateLH : y;
    const chip = new Graphics();
    chip.roundRect(cx + (dateLines.length ? 0 : 0), cy, cw, 16, 8).fill(theme.accentSoft);
    label.position.set(cx + 6, cy + 1.5);
    card.root.addChild(chip, label);
    card.texts.push(label);
  }
  // birth order badge
  if (st.ord && !body.contains('no-ord')) {
    const tx = text(st.ord, { fontSize: 10.5, fontWeight: '600', fill: theme.muted });
    const bw = Math.max(18, tx.width + 10);
    const bx = compact ? W / 2 - 50 : -7,
      by = compact ? 0 : -7;
    ex.roundRect(bx, by, bw, 18, 9).fill(theme.panel2).stroke({ width: 1, color: theme.border });
    tx.anchor.set(0.5);
    tx.position.set(bx + bw / 2, by + 9);
    card.root.addChild(tx);
    card.texts.push(tx);
  }
  // fold chip
  if (st.fold && (hot || st.selected || st.foldOn)) {
    const tx = text(st.fold, { fontSize: 11, fontWeight: '600', fill: st.foldOn ? theme.accent : theme.muted });
    const fw = Math.max(22, tx.width + 14);
    const fx = compact ? W - 4 - fw : W + 8 - fw,
      fy = compact ? 70 : H + 11 - 22;
    ex.roundRect(fx, fy, fw, 22, 11)
      .fill(st.foldOn ? theme.accentSoft : theme.card)
      .stroke({ width: 1, color: st.foldOn ? theme.accent : theme.borderStrong });
    tx.anchor.set(0.5);
    tx.position.set(fx + fw / 2, fy + 11);
    card.root.addChild(tx);
    card.texts.push(tx);
  }
  // plus buttons
  if ((hot || st.selected) && !linking) {
    const canParent = card.st && !!document.querySelector(`#cards .card[data-id="${card.id}"] .plus.top`);
    const btns = [
      canParent && { k: 'parent', x: W / 2, y: 0, sym: '+' },
      { k: 'child', x: W / 2, y: H, sym: '+' },
      { k: 'sibling-left', x: 0, y: compact ? 59 : H / 2, sym: '+' },
      { k: 'sibling-right', x: W, y: compact ? 59 : H / 2, sym: '+' },
      { k: 'spouse', x: compact ? W - 27 : W, y: compact ? 13 : 0, sym: '♥', love: true },
    ].filter(Boolean);
    for (const b of btns) {
      const over = card.plusKind === b.k;
      const r = over ? 14.5 : 13;
      const col = b.love ? (over ? '#c93579' : theme.love) : over ? theme.accent2 : theme.accent;
      ex.circle(b.x, b.y, r + 2).fill(theme.card);
      ex.circle(b.x, b.y, r).fill(col);
      const tx = text(b.sym, { fontSize: b.love ? 13 : 19, fill: '#ffffff', fontWeight: '500' });
      tx.anchor.set(0.5, b.love ? 0.5 : 0.56);
      tx.position.set(b.x, b.y);
      card.root.addChild(tx);
      card.texts.push(tx);
    }
    if (hoveredPlus && hoveredPlus.id === card.id && hoveredPlus.tip) {
      const b = btns.find((x) => x.k === hoveredPlus.kind);
      if (b) {
        const tip = text(hoveredPlus.tip, { fontSize: 11, fill: '#ffffff' });
        const tw = tip.width + 14,
          th = 19;
        let tx0 = b.x - tw / 2,
          ty0 = b.y - 30 - th;
        if (b.k === 'child') ty0 = b.y + 30;
        if (b.k === 'sibling-left') {
          tx0 = b.x - 30 - tw;
          ty0 = b.y - th / 2;
        }
        if (b.k === 'sibling-right' || b.k === 'spouse') {
          tx0 = b.x + 30;
          ty0 = b.y - th / 2;
        }
        const bg = new Graphics().roundRect(tx0, ty0, tw, th, 5).fill('#1f2430');
        tip.position.set(tx0 + 7, ty0 + 4);
        card.root.addChild(bg, tip);
        card.texts.push(tip);
      }
    }
  }
}

function dashedRoundRect(g, x, y, w, h, r, style, dash, gap) {
  r = Math.min(r, w / 2, h / 2);
  const pts = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  pts.push(pts[0]);
  dashPolyline(g, pts, dash, gap);
  g.stroke(style);
}

function dashPolyline(g, pts, dash, gap) {
  let on = true,
    rem = dash;
  for (let i = 0; i < pts.length - 1; i++) {
    let a = pts[i];
    const b = pts[i + 1];
    let len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) continue;
    const ux = (b.x - a.x) / len,
      uy = (b.y - a.y) / len;
    if (on) g.moveTo(a.x, a.y);
    while (len > 0) {
      const step = Math.min(rem, len);
      const nx = a.x + ux * step,
        ny = a.y + uy * step;
      if (on) g.lineTo(nx, ny);
      else g.moveTo(nx, ny);
      a = { x: nx, y: ny };
      len -= step;
      rem -= step;
      if (rem <= 0) {
        on = !on;
        rem = on ? dash : gap;
        if (on) g.moveTo(a.x, a.y);
      }
    }
  }
}

function shadowSprite(kind, w, h) {
  const key = `${kind}:${w}x${h}:${theme.dark}`;
  let tex = shadowTex.get(key);
  const pad = 40;
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = w + pad * 2;
    c.height = h + pad * 2;
    const x = c.getContext('2d');
    const draw = (blur, oy, alpha) => {
      x.save();
      x.shadowColor = theme.dark ? `rgba(0,0,0,${alpha})` : `rgba(20,24,40,${alpha})`;
      x.shadowBlur = blur;
      x.shadowOffsetY = oy;
      x.fillStyle = '#000';
      x.beginPath();
      x.roundRect(pad, pad, w, h, 14);
      x.fill();
      x.restore();
    };
    x.globalCompositeOperation = 'source-over';
    if (kind === 'sm') {
      draw(2, 1, theme.dark ? 0.4 : 0.06);
      draw(8, 2, theme.dark ? 0.2 : 0.06);
    } else {
      draw(2, 1, theme.dark ? 0.35 : 0.05);
      draw(24, 8, theme.dark ? 0.35 : 0.08);
    }
    x.globalCompositeOperation = 'destination-out';
    x.beginPath();
    x.roundRect(pad + 0.5, pad + 0.5, w - 1, h - 1, 14);
    x.fill();
    tex = Texture.from(c);
    shadowTex.set(key, tex);
  }
  const sp = new Sprite(tex);
  sp.position.set(-pad, -pad);
  return sp;
}

function photoTexture(p, size, deceased, ring) {
  const hue = hueOf(p.id);
  const key = [
    p.photo || '',
    p.gender,
    hue,
    deceased,
    p.illness,
    p.substance,
    p.fate,
    initials(p.name),
    size,
    ring,
    theme.dark,
  ].join('|');
  const cached = photoTex.get(key);
  if (cached) return cached;
  const S = 2;
  const pad = 8;
  const c = document.createElement('canvas');
  c.width = c.height = (size + pad * 2) * S;
  const x = c.getContext('2d');
  x.scale(S, S);
  x.translate(pad, pad);
  const male = p.gender === 'm';
  const r = male ? (16 / 64) * size : size / 2;
  const shape = () => {
    x.beginPath();
    x.roundRect(0, 0, size, size, r);
  };
  if (ring) {
    shape();
    x.lineWidth = 2;
    x.strokeStyle = theme.border;
    x.stroke();
    x.beginPath();
    x.roundRect(-5, -5, size + 10, size + 10, r + 5);
    x.lineWidth = 2;
    x.strokeStyle = ring === 'accent' ? theme.accent : theme.text;
    x.stroke();
  }
  shape();
  x.save();
  x.clip();
  if (p.fate) x.fillStyle = theme.panel2;
  else {
    const gr = x.createLinearGradient(0, size, size, 0);
    if (theme.dark) {
      gr.addColorStop(0, `hsl(${hue} 40% 28%)`);
      gr.addColorStop(1, `hsl(${hue + 40} 35% 24%)`);
    } else {
      gr.addColorStop(0, `hsl(${hue} 85% 92%)`);
      gr.addColorStop(1, `hsl(${hue + 40} 80% 88%)`);
    }
    x.fillStyle = gr;
  }
  x.fillRect(0, 0, size, size);
  const img = p.photo && !p.fate ? imageFor(p.photo) : null;
  if (img && img.complete && img.naturalWidth) {
    if (deceased && 'filter' in x) x.filter = 'grayscale(0.6)';
    const k = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    const dw = img.naturalWidth * k,
      dh = img.naturalHeight * k;
    x.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
    x.filter = 'none';
  } else if (p.fate) {
    x.strokeStyle = x.fillStyle = theme.text;
    x.lineWidth = 2.2;
    x.lineCap = x.lineJoin = 'round';
    const u = 34 / 32,
      o = (size - 34) / 2;
    x.save();
    x.translate(o, o);
    x.scale(u, u);
    x.beginPath();
    if (p.fate === 'pregnancy') {
      x.moveTo(16, 6);
      x.lineTo(27, 26);
      x.lineTo(5, 26);
      x.closePath();
      x.stroke();
    } else if (p.fate === 'miscarriage') {
      x.arc(16, 16, 6, 0, Math.PI * 2);
      x.fill();
    } else {
      if (p.fate === 'stillborn') {
        x.roundRect(7, 7, 18, 18, 2);
        x.stroke();
        x.beginPath();
      }
      x.moveTo(9, 9);
      x.lineTo(23, 23);
      x.moveTo(23, 9);
      x.lineTo(9, 23);
      x.stroke();
    }
    x.restore();
  } else {
    x.fillStyle = theme.dark ? `hsl(${hue} 80% 82%)` : `hsl(${hue} 45% 42%)`;
    x.font = `700 ${size === 84 ? 26 : 20}px ${FONT}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(initials(p.name), size / 2, size / 2 + 1);
  }
  const tint = mixCss(theme.text, 0.35);
  const hatch = (rx, ry, rw, rh) => {
    x.save();
    x.beginPath();
    x.rect(rx, ry, rw, rh);
    x.clip();
    x.strokeStyle = tint;
    x.lineWidth = 2;
    for (let d = -size; d < size * 2; d += 5) {
      x.beginPath();
      x.moveTo(rx + d, ry + rh);
      x.lineTo(rx + d + rh, ry);
      x.stroke();
    }
    x.restore();
  };
  if (p.illness === 'active') {
    x.fillStyle = tint;
    x.fillRect(0, 0, size / 2, size);
  } else if (p.illness === 'recovered') hatch(0, 0, size / 2, size);
  if (p.substance === 'active') {
    x.fillStyle = tint;
    x.fillRect(0, size / 2, size, size / 2);
  } else if (p.substance === 'recovered') hatch(0, size / 2, size, size / 2);
  if (deceased) {
    x.globalAlpha = 0.7;
    x.strokeStyle = theme.text;
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(0, size);
    x.lineTo(size, 0);
    x.moveTo(0, 0);
    x.lineTo(size, size);
    x.stroke();
    x.globalAlpha = 1;
  }
  x.restore();
  shape();
  x.lineWidth = 4;
  x.strokeStyle = theme.card;
  x.save();
  x.clip();
  x.stroke();
  x.restore();
  if (p.fate) {
    x.setLineDash(p.fate ? [4, 3] : []);
    x.lineWidth = 2;
    x.strokeStyle = theme.borderStrong;
    shape();
    x.stroke();
    x.setLineDash([]);
  } else if (!ring) {
    x.beginPath();
    x.roundRect(-0.5, -0.5, size + 1, size + 1, r + 0.5);
    x.lineWidth = 1;
    x.strokeStyle = theme.border;
    x.stroke();
  }
  const tex = Texture.from(c);
  photoTex.set(key, tex);
  return tex;
}

function mixCss(c, a) {
  const col = new Color(c);
  const [r, g, b] = col.toRgbArray();
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
}

function imageFor(src) {
  let img = imgCache.get(src);
  if (!img) {
    img = new Image();
    img.onload = () => {
      for (const [k] of photoTex) if (k.startsWith(src + '|')) photoTex.delete(k);
      for (const card of cards.values()) card.redraw = true;
      invalidate();
    };
    img.src = src;
    imgCache.set(src, img);
  }
  return img;
}

// ---- edges
const DASH = { partners: [6, 5], adopted: [2, 5], foster: [7, 5], distant: [8, 6], house: [6, 5] };

function strokeFor(cls, multi) {
  const c = cls.split(' ');
  const has = (k) => c.includes(k);
  let color = theme.line,
    width = 2,
    alpha = 1;
  if (has('slash')) color = theme.danger;
  if (has('ended')) color = theme.ended;
  if (has('hi')) {
    color = theme.accent;
    width = 3;
  }
  if (has('rel')) {
    color = theme.text;
    alpha = 0.85;
    if (has('inner')) color = theme.bg;
    if (has('conflict')) color = theme.danger;
    if (has('distant')) color = theme.muted;
  }
  if (has('house')) {
    color = theme.muted;
    width = 1.5;
  }
  if (has('past')) alpha *= 0.45;
  if (multi && !has('hi') && !has('rel')) alpha *= 0.45;
  return { color, width, alpha };
}

function drawEdges(multi) {
  const g = edgesG;
  g.clear();
  const data = edgeData();
  if (!data) return;
  for (const layer of data.layers) {
    if (!layer.d) continue;
    const st = strokeFor(layer.cls, multi);
    if (layer.width) st.width = layer.width;
    const dash = Object.keys(DASH).find((k) => layer.cls.split(' ').includes(k));
    if (layer.cls.split(' ').includes('house')) {
      const path = new GraphicsPath(layer.d);
      g.path(path).fill({ color: new Color(theme.accent).toNumber(), alpha: 0.05 });
    }
    if (dash) {
      for (const poly of flatten(layer.d)) dashPolyline(g, poly, DASH[dash][0], DASH[dash][1]);
      g.stroke({ ...st, cap: 'round', join: 'round' });
    } else {
      g.path(new GraphicsPath(layer.d)).stroke({ ...st, cap: 'round', join: 'round' });
    }
    if (layer.arrow) {
      const polys = flatten(layer.d);
      const poly = polys[polys.length - 1];
      if (poly && poly.length >= 2) {
        const b = poly[poly.length - 1],
          a = poly[poly.length - 2];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const L = 9;
        g.moveTo(b.x, b.y)
          .lineTo(b.x - L * Math.cos(ang - 0.45), b.y - L * Math.sin(ang - 0.45))
          .lineTo(b.x - L * Math.cos(ang + 0.45), b.y - L * Math.sin(ang + 0.45))
          .closePath()
          .fill({ color: new Color(theme.text).toNumber(), alpha: st.alpha });
      }
    }
  }
}

function flatten(d) {
  const polys = [];
  let cur = null,
    pt = { x: 0, y: 0 };
  for (const m of d.matchAll(/([MLQAZ])([^MLQAZ]*)/g)) {
    const n = m[2]
      .trim()
      .split(/[\s,]+/)
      .filter((s) => s !== '')
      .map(Number);
    const cmd = m[1];
    if (cmd === 'M') {
      cur = [{ x: n[0], y: n[1] }];
      polys.push(cur);
      pt = cur[0];
    } else if (cmd === 'L') {
      for (let i = 0; i < n.length; i += 2) {
        pt = { x: n[i], y: n[i + 1] };
        cur.push(pt);
      }
    } else if (cmd === 'Q') {
      const c = { x: n[0], y: n[1] },
        e = { x: n[2], y: n[3] },
        s = pt;
      for (let i = 1; i <= 8; i++) {
        const k = i / 8;
        cur.push({
          x: (1 - k) * (1 - k) * s.x + 2 * (1 - k) * k * c.x + k * k * e.x,
          y: (1 - k) * (1 - k) * s.y + 2 * (1 - k) * k * c.y + k * k * e.y,
        });
      }
      pt = e;
    } else if (cmd === 'A') {
      for (let i = 0; i + 6 < n.length + 1 && i + 6 <= n.length; i += 7) {
        const [rx, ry, , large, sweep, ex, ey] = n.slice(i, i + 7);
        for (const q of arcPoints(pt, { x: ex, y: ey }, rx, ry, large, sweep)) cur.push(q);
        pt = { x: ex, y: ey };
      }
    } else if (cmd === 'Z' && cur) cur.push(cur[0]);
  }
  return polys;
}

function arcPoints(p0, p1, rx, ry, large, sweep) {
  const out = [];
  const dx = (p0.x - p1.x) / 2,
    dy = (p0.y - p1.y) / 2;
  let lam = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const sign = large === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx;
  const den = rx * rx * dy * dy + ry * ry * dx * dx;
  const co = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * dy) / ry,
    cyp = (-co * ry * dx) / rx;
  const cx = cxp + (p0.x + p1.x) / 2,
    cy = cyp + (p0.y + p1.y) / 2;
  const ang = (ux, uy, vx, vy) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const a0 = ang(1, 0, (dx - cxp) / rx, (dy - cyp) / ry);
  let da = ang((dx - cxp) / rx, (dy - cyp) / ry, (-dx - cxp) / rx, (-dy - cyp) / ry);
  if (!sweep && da > 0) da -= Math.PI * 2;
  if (sweep && da < 0) da += Math.PI * 2;
  const n = 10;
  for (let i = 1; i <= n; i++) {
    const a = a0 + (da * i) / n;
    out.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return out;
}

// ---- badges
function drawBadges(multi) {
  for (const b of badges) b.root.destroy({ children: true });
  badges = [];
  const data = edgeData();
  if (!data) return;
  const dim = multi ? 0.45 : 1;
  const pill = (x, y, parts, opts = {}) => {
    const root = new Container();
    const texts = parts.map((pt) => text(pt.s, { fontSize: pt.size, fill: pt.fill, fontWeight: pt.weight || '400' }));
    const padX = opts.padX ?? 8,
      gap = 4;
    const w = texts.reduce((a, tx) => a + tx.width, 0) + gap * (texts.length - 1) + padX * 2;
    const h = 22;
    const g = new Graphics()
      .roundRect(-w / 2, -h / 2, w, h, 11)
      .fill(theme.card)
      .stroke({ width: 1, color: theme.borderStrong });
    root.addChild(g);
    let cx = -w / 2 + padX;
    for (const tx of texts) {
      tx.anchor.set(0, 0.5);
      tx.position.set(cx, 0.5);
      root.addChild(tx);
      cx += tx.width + gap;
    }
    root.position.set(x, y);
    root.alpha = (opts.alpha ?? 1) * dim;
    badgesC.addChild(root);
    badges.push({ root, texts });
  };
  for (const m of data.marriages) {
    const txt = marriageText(m.f);
    const parts = [{ s: '♥' + marriageOrdinal(m.f), size: 10, fill: theme.love }];
    if (txt) parts.push({ s: txt, size: 11, fill: theme.muted });
    pill(m.x, m.y, parts, { alpha: m.past ? 0.65 : 1, padX: txt ? 8 : 6 });
  }
  for (const h of data.houseBadges)
    pill(h.x, h.y, [{ s: '⌂ ' + h.h.members.length, size: 11, fill: theme.muted, weight: '600' }]);
  for (const r of data.relBadges)
    pill(r.x, r.y, [{ s: r.r.label || t('rel_' + r.r.type), size: 11, fill: theme.muted }]);
}
