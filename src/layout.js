import { state, people, fam, childFamily, parentFamilies, parentsOf, childrenOf, spousesOf, siblingsOf, husbandOf, coupled, byBirth, ancestorsOf, hiddenSet } from './model.js';

let CARD_W, CARD_H, COUPLE_GAP, H_GAP, V_GAP, TREE_GAP, strictOrder;
let hidden = new Set();
let positions = new Map();

export function computeLayout(cfg) {
  ({ CARD_W, CARD_H, COUPLE_GAP, H_GAP, V_GAP, TREE_GAP, strictOrder } = cfg);
  hidden = hiddenSet();
  let best = null, pref = new Map();
  for (let pass = 0; pass < 4; pass++) {
    const pos = layoutPass(pref);
    const crossings = countCrossings(pos);
    if (!best || crossings < best.crossings) best = { pos, crossings };
    if (crossings === 0 || strictOrder) break;
    const next = barycenterOrder(pos);
    if ([...next].every(([k, v]) => pref.get(k)?.join() === v.join())) break;
    pref = next;
  }
  return best.pos;
}

function barycenterOrder(pos) {
  const STEP = CARD_W + COUPLE_GAP;
  const cx = (id) => pos.get(id).x + CARD_W / 2;
  const pref = new Map();
  for (const f of Object.values(state.families)) {
    const kids = f.children.filter(id => pos.has(id));
    if (kids.length < 2) continue;
    const key = (id) => {
      const pts = [];
      for (const pf of parentFamilies(id)) for (const sp of pf.parents) {
        if (sp === id || !pos.has(sp)) continue;
        if (Math.abs(cx(sp) - cx(id)) > STEP + 1) pts.push(cx(sp));
        for (const gp of parentsOf(sp)) if (pos.has(gp)) pts.push(cx(gp));
      }
      return pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : cx(id);
    };
    const order = kids.map(id => [id, key(id)]).sort((a, b) => a[1] - b[1]).map(([id]) => id);
    if (order.join() !== kids.join()) pref.set(f.id, order);
  }
  return pref;
}

function countCrossings(pos) {
  const H = [], V = [];
  for (const f of Object.values(state.families)) {
    const ps = f.parents.filter(id => pos.has(id)).map(id => pos.get(id)).sort((a, b) => a.x - b.x);
    const cs = f.children.filter(id => pos.has(id)).map(id => pos.get(id));
    let ox = null, oy = null;
    if (ps.length === 2) { ox = (ps[0].x + ps[1].x) / 2 + CARD_W / 2; oy = ps[0].y + CARD_H / 2; }
    else if (ps.length === 1) { ox = ps[0].x + CARD_W / 2; oy = ps[0].y + CARD_H; }
    if (!cs.length) continue;
    const top = Math.min(...cs.map(c => c.y)), busY = top - V_GAP / 2;
    const xs = cs.map(c => c.x + CARD_W / 2);
    if (ox !== null) { xs.push(ox); V.push({ f, x: ox, y1: oy, y2: busY }); }
    H.push({ f, y: busY, x1: Math.min(...xs), x2: Math.max(...xs) });
    for (const c of cs) V.push({ f, x: c.x + CARD_W / 2, y1: busY, y2: c.y });
  }
  let n = 0;
  for (const h of H) {
    for (const v of V) if (v.f !== h.f && v.x > h.x1 && v.x < h.x2 && h.y > Math.min(v.y1, v.y2) && h.y < Math.max(v.y1, v.y2)) n++;
    for (const g of H) if (g !== h && g.f !== h.f && g.y === h.y && g.x1 < h.x2 && h.x1 < g.x2) n += 0.5;
  }
  return n;
}

function layoutPass(pref) {
  positions = new Map();
  const claimed = new Set();
  const STEP = CARD_W + COUPLE_GAP;

  function spreadMarried(kids, side) {
    if (strictOrder) return kids;
    const married = kids.map((c, i) => [c, i]).filter(([c]) => c.unit.length > 1);
    if (!married.length || kids.length < 2 || kids.every(c => c.fixed)) return kids;
    const [firstC, firstI] = married[0], [lastC] = married[married.length - 1];
    const rest = kids.filter(c => c !== firstC && c !== lastC);
    if (married.length === 1) {
      const left = side < 0 || (side === 0 && firstI < kids.length / 2);
      return left ? [firstC, ...rest] : [...rest, firstC];
    }
    return [firstC, ...rest, lastC];
  }
  function assignSides(n, side) {
    n.side = side;
    const ownIdx = n.unit.indexOf(n.own);
    if (side < 0 && ownIdx === 0 && n.unit.length > 1) n.unit.reverse();
    if (side > 0 && ownIdx > 0) n.unit.reverse();
    if (n.unit.length === 2) {
      const [a, b] = n.unit.map(id => state.people[id]?.gender);
      if (a !== 'm' && b === 'm') n.unit.reverse();
    }
    for (const g of n.groups) {
      g.children = spreadMarried(g.children, side);
      g.children.forEach((c, i, arr) => {
        let cs = 0;
        if (arr.length === 1) cs = side;
        else if (i === 0 && side <= 0) cs = -1;
        else if (i === arr.length - 1 && side >= 0) cs = 1;
        assignSides(c, cs);
      });
    }
    for (const { node: a, anchor } of n.ancestors) {
      const k = n.unit.indexOf(anchor), o = n.unit.indexOf(n.own);
      assignSides(a, k < o ? -1 : k > o ? 1 : (k === 0 ? -1 : 1));
    }
  }

  function marriageChain(unit, pid, ownSpouses) {
    if (unit.length < 3) return null;
    const adj = new Map(unit.map(id => [id, []]));
    for (const id of unit) for (const f of parentFamilies(id)) for (const sp of f.parents) if (sp !== id && adj.has(sp) && !adj.get(id).includes(sp)) adj.get(id).push(sp);
    if ([...adj.values()].some(a => a.length > 2)) return null;
    const start = unit.find(id => adj.get(id).length === 1); if (!start) return null;
    const path = [start]; let prev = null;
    while (path.length < unit.length) {
      const cur = path[path.length - 1], next = adj.get(cur).find(x => x !== prev); if (!next) return null;
      prev = cur; path.push(next);
    }
    const first = ownSpouses[0];
    return first && path.indexOf(first) > path.indexOf(pid) ? path.reverse() : path;
  }
  function buildNode(pid) {
    const unit = [pid]; claimed.add(pid);
    for (let i = 0; i < unit.length; i++) {
      for (const f of parentFamilies(unit[i])) for (const sp of f.parents) if (!claimed.has(sp) && !hidden.has(sp)) { claimed.add(sp); unit.push(sp); }
    }
    const ownSpouses = parentFamilies(pid).flatMap(f => f.parents.filter(x => x !== pid)).filter(x => unit.includes(x));
    const chain = marriageChain(unit, pid, ownSpouses);
    if (chain) unit.splice(0, unit.length, ...chain);
    else if (ownSpouses.length >= 3 && unit.length === ownSpouses.length + 1) unit.splice(0, unit.length, pid, ...ownSpouses);
    const n = { own: pid, unit, groups: [], ancestors: [] };
    for (const m of unit) {
      const f = childFamily(m); if (!f) continue;
      const top = f.parents.find(id => !claimed.has(id) && !hidden.has(id)); if (!top) continue;
      n.ancestors.push({ node: buildNode(top), anchor: m });
    }
    for (const f of [...new Set(unit.flatMap(parentFamilies))]) {
      let ids = byBirth(f.children.filter(id => !claimed.has(id) && !hidden.has(id)));
      const p = pref.get(f.id);
      if (p) ids = [...ids].sort((a, b) => p.indexOf(a) - p.indexOf(b));
      for (const id of [...ids]) {
        const tw = f.kinds?.[id]?.twin;
        if (tw && ids.includes(tw) && Math.abs(ids.indexOf(tw) - ids.indexOf(id)) > 1) { ids.splice(ids.indexOf(tw), 1); ids.splice(ids.indexOf(id) + 1, 0, tw); }
      }
      const fixed = !!p || ids.every(id => state.people[id]?.birth);
      const kids = []; for (const id of ids) { if (claimed.has(id)) continue; const h = husbandOf(id); if (h && !claimed.has(h)) continue; kids.push(buildNode(id)); }
      kids.forEach(c => { c.fixed = fixed; });
      if (kids.length) n.groups.push({ f, children: kids });
    }
    return n;
  }

  const shift = (ext, dx, dr) => { const m = new Map(); for (const [r, segs] of ext) m.set(r + dr, segs.map(([l, rt]) => [l + dx, rt + dx])); return m; };
  const union = (a, b) => {
    const m = new Map(a || []);
    for (const [r, segs] of b) {
      const all = [...(m.get(r) || []), ...segs].sort((x, y) => x[0] - y[0]);
      const out = [];
      for (const sg of all) { const last = out[out.length - 1]; if (last && sg[0] <= last[1]) last[1] = Math.max(last[1], sg[1]); else out.push([sg[0], sg[1]]); }
      m.set(r, out);
    }
    return m;
  };
  const pushNeeded = (base, e, dir) => {
    let need = 0;
    for (const [r, segs] of e) {
      for (const b of base.get(r) || []) for (const sg of segs) {
        if (sg[0] >= b[1] + H_GAP || b[0] >= sg[1] + H_GAP) continue;
        need = Math.max(need, dir > 0 ? b[1] + H_GAP - sg[0] : sg[1] + H_GAP - b[0]);
      }
    }
    return need;
  };
  const settle = (base, e, dir) => {
    let dx = 0;
    for (let i = 0; i < 100; i++) { const need = pushNeeded(base, shift(e, dx, 0), dir); if (!need) break; dx += dir * need; }
    return dx;
  };
  const freeSlot = (segs, want, w) => {
    const fits = (l) => segs.every(([a, b]) => l >= b + H_GAP || a >= l + w + H_GAP);
    if (fits(want)) return want;
    const cands = segs.flatMap(([a, b]) => [b + H_GAP, a - H_GAP - w]).filter(fits);
    return cands.length ? cands.reduce((best, c) => Math.abs(c - want) < Math.abs(best - want) ? c : best) : want;
  };

  function measure(n) {
    n.ux = n.unit.map((_, i) => i * STEP);
    const ownIdx = n.unit.indexOf(n.own);
    const parentIdx = (f) => f.parents.map(id => n.unit.indexOf(id)).filter(i => i >= 0).sort((a, b) => a - b);
    const originRel = (f) => {
      const idx = parentIdx(f);
      if (!idx.length) return (n.ux[n.ux.length - 1] + CARD_W) / 2;
      if (idx.length === 1 || idx[1] - idx[0] > 1) return n.ux[idx[idx.length - 1]] + CARD_W / 2;
      return (n.ux[idx[0]] + n.ux[idx[1]]) / 2 + CARD_W / 2;
    };
    n.groups.sort((a, b) => originRel(a.f) - originRel(b.f));
    let comp = null; n.kids = [];
    for (const g of n.groups) {
      let gExt = null; const local = [];
      for (const c of g.children) {
        measure(c);
        const e = shift(c.ext, 0, 1);
        const dx = gExt ? settle(gExt, e, 1) : 0;
        gExt = union(gExt, shift(e, dx, 0));
        local.push({ c, dx });
      }
      const avgOwn = local.reduce((a, k) => a + k.dx + k.c.ownCenter, 0) / local.length;
      let gdx = originRel(g.f) - avgOwn;
      if (comp) {
        const push = settle(comp, shift(gExt, gdx, 0), 1);
        const idx = parentIdx(g.f);
        if (push > 0 && idx.length === 2 && idx[1] - idx[0] === 1 && idx[1] > 0) {
          const spread = Math.min(push, STEP / 2);
          for (let j = idx[1]; j < n.ux.length; j++) n.ux[j] += 2 * spread;
        }
        gdx += push;
      }
      comp = union(comp, shift(gExt, gdx, 0));
      for (const k of local) n.kids.push({ c: k.c, dx: k.dx + gdx });
    }
    n.uw = n.ux[n.ux.length - 1] + CARD_W;
    n.ownCenter = n.ux[ownIdx] + CARD_W / 2;
    if (strictOrder && comp) {
      const f = childFamily(n.own), order = f ? byBirth(f.children) : [], i = order.indexOf(n.own);
      const later = i >= 0 && i < order.length - 1, earlier = i > 0;
      const segs = [...comp.values()].flat();
      const minL = Math.min(...segs.map(sg => sg[0])), maxR = Math.max(...segs.map(sg => sg[1]));
      const shiftX = later && !earlier ? Math.min(0, n.uw - maxR) : earlier && !later ? Math.max(0, -minL) : 0;
      if (shiftX) { comp = shift(comp, shiftX, 0); for (const k of n.kids) k.dx += shiftX; }
    }
    n.ext = union(comp, new Map([[0, [[0, n.uw]]]]));
    return n;
  }
  function relaxRows() {
    const rows = new Map();
    for (const [id, p] of positions) { if (!rows.has(p.y)) rows.set(p.y, []); rows.get(p.y).push(id); }
    const units = [];
    const unitOf = new Map();
    for (const [y, ids] of rows) {
      ids.sort((a, b) => positions.get(a).x - positions.get(b).x);
      let cur = null;
      for (const id of ids) {
        const p = positions.get(id);
        const joined = cur && cur.ids.some(o => coupled(o, id));
        if (joined) { cur.ids.push(id); cur.right = p.x + CARD_W; }
        else { cur = { y, ids: [id], right: p.x + CARD_W }; units.push(cur); }
        unitOf.set(id, cur);
      }
    }
    const cx = (id) => positions.get(id).x + CARD_W / 2;
    const byRow = new Map();
    for (const u of units) { if (!byRow.has(u.y)) byRow.set(u.y, []); byRow.get(u.y).push(u); }
    const target = (u) => {
      let sum = 0, w = 0;
      for (const id of u.ids) for (const f of parentFamilies(id)) {
        const kids = f.children.filter(c => positions.has(c) && !husbandOf(c)); if (!kids.length) continue;
        const inUnit = f.parents.filter(x => u.ids.includes(x));
        const from = inUnit.reduce((a, b) => a + cx(b), 0) / inUnit.length;
        sum += kids.reduce((a, b) => a + cx(b), 0) / kids.length - from; w += 1;
      }
      if (!w) for (const id of u.ids) {
        const ps = parentsOf(id).filter(a => positions.has(a));
        if (ps.length) { sum += ps.reduce((a, b) => a + cx(b), 0) / ps.length - cx(id); w += 1; }
      }
      return w ? sum / w : null;
    };
    const famKey = (u) => new Set(u.ids.map(id => childFamily(id)?.id).filter(Boolean));
    const swappable = (a, b) => { const fa = famKey(a); return ![...famKey(b)].some(k => fa.has(k)); };
    const width = (u) => u.right - positions.get(u.ids[0]).x;
    for (const row of byRow.values()) {
      for (let pass = 0; pass < row.length; pass++) {
        let swapped = false;
        for (let i = 0; i + 1 < row.length; i++) {
          const a = row[i], b = row[i + 1], ta = target(a), tb = target(b);
          if (ta === null || tb === null || !swappable(a, b)) continue;
          const ax = positions.get(a.ids[0]).x, bx = positions.get(b.ids[0]).x;
          if (ax + ta <= bx + tb + CARD_W / 2) continue;
          const start = ax, wa = width(a), wb = width(b), gap = bx - a.right;
          const da = start + wb + gap - ax, db = start - bx;
          for (const id of a.ids) positions.get(id).x += da; a.right += da;
          for (const id of b.ids) positions.get(id).x += db; b.right += db;
          row[i] = b; row[i + 1] = a; swapped = true;
        }
        if (!swapped) break;
      }
    }
    const ordered = [...units].sort((a, b) => b.y - a.y);
    for (let iter = 0; iter < 40; iter++) {
      let moved = 0;
      for (const u of ordered) {
        let sum = 0, w = 0;
        for (const id of u.ids) for (const f of parentFamilies(id)) {
          const kids = f.children.filter(c => positions.has(c) && !husbandOf(c)); if (!kids.length) continue;
          const inUnit = f.parents.filter(x => u.ids.includes(x));
          const from = inUnit.reduce((a, b) => a + cx(b), 0) / inUnit.length;
          sum += kids.reduce((a, b) => a + cx(b), 0) / kids.length - from; w += 1;
        }
        if (!w) for (const id of u.ids) {
          const ps = parentsOf(id).filter(a => positions.has(a));
          if (ps.length) { sum += ps.reduce((a, b) => a + cx(b), 0) / ps.length - cx(id); w += 1; }
        }
        if (!w) continue;
        let d = sum / w;
        const row = byRow.get(u.y), i = row.indexOf(u);
        const left = row[i - 1], right = row[i + 1];
        const lo = left ? left.right + H_GAP - positions.get(u.ids[0]).x : -Infinity;
        const hi = right ? positions.get(right.ids[0]).x - H_GAP - u.right : Infinity;
        d = Math.max(lo, Math.min(hi, d));
        if (Math.abs(d) < 0.5) continue;
        for (const id of u.ids) positions.get(id).x += d;
        u.right += d; moved++;
      }
      if (!moved) break;
    }
  }
  let occupied = new Map();
  const pending = [];
  function placeKidsStrict(n, x, row) {
    const rowY = row * (CARD_H + V_GAP);
    const placedX = (id) => { const p = positions.get(id); return p && p.y === rowY ? p.x : null; };
    const unitBounds = (id, y = rowY) => {
      const rowCards = [...positions.entries()].filter(([, p]) => p.y === y).sort((a, b) => a[1].x - b[1].x);
      let i = rowCards.findIndex(([cid]) => cid === id), j = i; const members = [id];
      while (i > 0 && members.some(m => coupled(m, rowCards[i - 1][0]))) { i--; members.push(rowCards[i][0]); }
      while (j < rowCards.length - 1 && members.some(m => coupled(m, rowCards[j + 1][0]))) { j++; members.push(rowCards[j][0]); }
      return [rowCards[i][1].x, rowCards[j][1].x + CARD_W];
    };
    const groups = new Map();
    for (const k of n.kids) { const f = childFamily(k.c.own); const key = f ? f.id : k.c.own; if (!groups.has(key)) groups.set(key, { f, kids: [] }); groups.get(key).kids.push(k); }
    for (const { f, kids } of groups.values()) {
      const order = f ? byBirth(f.children).filter(id => !hidden.has(id) && (kids.some(k => k.c.own === id) || !husbandOf(id))) : [];
      const complete = order.every(id => kids.some(k => k.c.own === id));
      if (!f || complete) { for (const { c, dx } of kids) place(c, x + dx, row); continue; }
      const nodeFor = (id) => {
        const k = kids.find(k => k.c.own === id); if (k) return k.c;
        const e = pending.find(e => !e.done && e.a.own === id); if (!e) return null;
        e.done = true; measure(e.a); return e.a;
      };
      const p0 = order.findIndex(id => placedX(id) !== null);
      const anchorSide = (() => {
        if (p0 < 0) return null; const a = order[p0], [lo, hi] = unitBounds(a), ax = positions.get(a).x;
        if (hi - lo <= CARD_W + 1) return null;
        return ax <= lo + 1 ? 'left' : ax + CARD_W >= hi - 1 ? 'right' : null;
      })();
      const FAR = 2 * (CARD_W + H_GAP);
      const extBounds = (node) => { const segs = [...node.ext.values()].flat(); return { l: Math.min(...segs.map(v => v[0])), r: Math.max(...segs.map(v => v[1])) }; };
      const insertColumn = (node, cut, dir) => {
        const { l, r } = extBounds(node), S = r - l + H_GAP;
        const rowsHit = new Set([...node.ext.keys()].map(k => (k + row) * (CARD_H + V_GAP)));
        const bounds = new Map([...positions.entries()].map(([id, p]) => [id, unitBounds(id, p.y)]));
        for (let guard = 0; guard < 50; guard++) {
          const st = [...positions.entries()].filter(([id, p]) => rowsHit.has(p.y) && bounds.get(id)[0] < cut && bounds.get(id)[1] > cut);
          if (!st.length) break;
          cut = dir > 0 ? Math.max(...st.map(([id]) => bounds.get(id)[1])) + H_GAP / 2 : Math.min(...st.map(([id]) => bounds.get(id)[0])) - H_GAP / 2;
        }
        const movers = [...positions.entries()].filter(([id, p]) => { const [lo, hi] = bounds.get(id); return dir > 0 ? lo >= cut : hi <= cut; }).map(([, p]) => p);
        for (const p of movers) p.x += dir * S;
        occupied = new Map();
        for (const p of positions.values()) occupied = union(occupied, new Map([[Math.round(p.y / (CARD_H + V_GAP)), [[p.x, p.x + CARD_W]]]]));
        return dir > 0 ? cut + H_GAP / 2 - l : cut - H_GAP / 2 - r;
      };
      let edge = p0 >= 0 ? unitBounds(order[p0])[1] : x + Math.min(...kids.map(k => k.dx)) - H_GAP;
      let leftEdge = p0 >= 0 ? unitBounds(order[p0])[0] : edge + H_GAP;
      const rightIds = anchorSide === 'left' ? [] : anchorSide === 'right' ? order.filter((id, i) => i !== p0) : order.slice(p0 >= 0 ? p0 + 1 : 0);
      const leftIds = anchorSide === 'left' ? order.filter((id, i) => i !== p0).reverse() : anchorSide === 'right' ? [] : order.slice(0, Math.max(0, p0)).reverse();
      for (const id of rightIds) {
        const px = placedX(id); if (px !== null) { const [lo, hi] = unitBounds(id); edge = Math.max(edge, hi); leftEdge = Math.min(leftEdge, lo); continue; }
        const node = nodeFor(id); if (!node) continue;
        let kx = edge + H_GAP;
        const pushR = settle(occupied, shift(node.ext, kx, row), 1);
        if (pushR > FAR) {
          const ix = insertColumn(node, edge + H_GAP / 2, 1);
          place(node, ix, row, node.anchorId); edge = ix + node.uw; continue;
        }
        kx += pushR; place(node, kx, row, node.anchorId); edge = kx + node.uw;
      }
      if (leftIds.length) {
        let ledge = leftEdge, redge = edge;
        for (const id of leftIds) {
          const px = placedX(id); if (px !== null) { const [lo, hi] = unitBounds(id); ledge = Math.min(ledge, lo); redge = Math.max(redge, hi); continue; }
          const node = nodeFor(id); if (!node) continue;
          let kx = ledge - H_GAP - node.uw;
          const pushL = settle(occupied, shift(node.ext, kx, row), -1);
          if (-pushL > FAR) {
            const ix = insertColumn(node, ledge - H_GAP / 2, -1);
            place(node, ix, row, node.anchorId); ledge = ix; continue;
          }
          kx += pushL; place(node, kx, row, node.anchorId); ledge = kx;
        }
      }
    }
  }
  function place(n, x, row, anchor) {
    const y = row * (CARD_H + V_GAP);
    n.unit.forEach((id, i) => positions.set(id, { x: x + n.ux[i], y }));
    occupied = union(occupied, new Map([[row, [[x, x + n.uw]]]]));
    if (strictOrder) placeKidsStrict(n, x, row + 1);
    else for (const { c, dx } of n.kids) place(c, x + dx, row + 1);
    const ownIdx = n.unit.indexOf(n.own);
    const list = n.ancestors.map(({ node: a, anchor }) => {
      const k = n.unit.indexOf(anchor);
      const dir = n.unit.length > 1 ? (k === 0 ? -1 : k === n.unit.length - 1 ? 1 : (k < ownIdx ? -1 : 1)) : (n.side < 0 ? -1 : n.side > 0 ? 1 : -1);
      return { a, k, dir };
    }).sort((p, q) => (p.dir < 0 ? q.k - p.k : p.k - q.k));
    for (const { a, k, dir } of list) { a.anchorId = n.unit[k]; pending.push({ a, row: row - 1, center: x + n.ux[k] + CARD_W / 2, dir, order: row, anchor: n.unit[k], sided: n.unit.length > 1 }); }
  }
  function placeAncestors() {
    pending.sort((p, q) => p.order - q.order);
    for (let i = 0; i < pending.length; i++) {
      const { a, row, center, dir, anchor, sided } = pending[i];
      if (pending[i].done) continue;
      measure(a);
      let dx = center - a.uw / 2;
      const push = settle(occupied, shift(a.ext, dx, row), dir), back = settle(occupied, shift(a.ext, dx, row), -dir);
      dx += !sided && Math.abs(back) < Math.abs(push) / 2 ? back : push;
      const before = pending.length, placedBefore = positions.size;
      place(a, dx, row, anchor);
      blocks.push({ ids: [...positions.keys()].slice(placedBefore), center });
      for (let j = before; j < pending.length; j++) pending[j].order = Infinity;
    }
  }
  const blocks = [];
  function compactBlocks() {
    for (const { ids, center } of blocks) {
      const set = new Set(ids);
      const mine = ids.map(id => positions.get(id)).filter(Boolean);
      if (!mine.length) continue;
      const bc = (Math.min(...mine.map(p => p.x)) + Math.max(...mine.map(p => p.x + CARD_W))) / 2;
      const dir = Math.sign(center - bc); if (!dir) continue;
      let room = Math.abs(center - bc);
      for (const p of mine) for (const [id, q] of positions) {
        if (set.has(id) || q.y !== p.y) continue;
        const ahead = dir > 0 ? q.x >= p.x + CARD_W - 1 : q.x + CARD_W <= p.x + 1;
        if (!ahead) continue;
        const gap = dir > 0 ? q.x - (p.x + CARD_W) - H_GAP : p.x - (q.x + CARD_W) - H_GAP;
        room = Math.min(room, Math.max(0, gap));
      }
      if (room > 0.5) for (const p of mine) p.x += dir * room;
    }
    blocks.length = 0;
    occupied = new Map();
    for (const p of positions.values()) occupied = union(occupied, new Map([[Math.round(p.y / (CARD_H + V_GAP)), [[p.x, p.x + CARD_W]]]]));
  }

  const descCount = (pid, seen = new Set()) => { let n = 0; for (const c of childrenOf(pid)) if (!seen.has(c) && !husbandOf(c)) { seen.add(c); n += 1 + descCount(c, seen); } return n; };
  const idx = state.indexPerson && state.people[state.indexPerson] ? state.indexPerson : null;
  const sideSets = { husband: new Set(), wife: new Set() };
  if (idx) {
    const me = state.people[idx], spouse = spousesOf(idx)[0];
    const isMale = (id) => state.people[id]?.gender === 'm';
    const husband = isMale(idx) ? idx : spouse && isMale(spouse) ? spouse : null;
    const wife = husband === idx ? spouse : idx;
    if (husband) { sideSets.husband = ancestorsOf(husband); sideSets.husband.add(husband); }
    if (wife) { sideSets.wife = ancestorsOf(wife); sideSets.wife.add(wife); }
  }
  const sideOf = (pid) => sideSets.husband.has(pid) ? -1 : sideSets.wife.has(pid) ? 1 : 0;
  const bySize = (list) => list.map(p => [p, descCount(p.id), sideOf(p.id)]).sort((a, b) => a[2] - b[2] || b[1] - a[1]).map(([p]) => p);
  const roots = bySize(people().filter(p => !childFamily(p.id) && !hidden.has(p.id)));
  const cluster = (pid) => { const seen = new Set([pid]); for (const a of seen) for (const sp of spousesOf(a)) seen.add(sp); return [...seen]; };
  const topRoots = roots.filter(p => cluster(p.id).every(id => !childFamily(id)));
  let x = 0;
  for (const list of [topRoots, roots, people().filter(p => !hidden.has(p.id))]) {
    for (const p of list) {
      if (claimed.has(p.id)) continue;
      const root = buildNode(p.id); assignSides(root, 0);
      const n = measure(root);
      const before = positions.size;
      place(n, x, 0);
      placeAncestors(); pending.length = 0; compactBlocks();
      let R = -Infinity, L = Infinity;
      for (const p of [...positions.values()].slice(before)) { L = Math.min(L, p.x); R = Math.max(R, p.x + CARD_W); }
      if (L < x) { for (const p of [...positions.values()].slice(before)) p.x += x - L; R += x - L; }
      x = R + TREE_GAP;
      occupied = new Map();
    }
  }
  relaxRows();
  if (positions.size) {
    let L = Infinity, R = -Infinity, T = Infinity;
    for (const p of positions.values()) { L = Math.min(L, p.x); R = Math.max(R, p.x + CARD_W); T = Math.min(T, p.y); }
    const cx = (L + R) / 2;
    for (const p of positions.values()) { p.x -= cx; p.y -= T; }
  }
  return positions;
}
