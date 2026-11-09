// Pure layout engine: people + families in, positions out. No DOM, no app state.

export function computeLayout(model, opts) {
  const { CARD_W, CARD_H, COUPLE_GAP, H_GAP, V_GAP, TREE_GAP } = opts;
  const people = model.people || {}, families = model.families || {};
  const famList = Object.values(families);
  const famIndex = new Map(famList.map((f, i) => [f.id, i]));
  const isMale = (id) => people[id]?.gender === 'm';

  const parentFams = new Map(), childFam = new Map();
  for (const f of famList) {
    for (const p of f.parents) { if (!parentFams.has(p)) parentFams.set(p, []); parentFams.get(p).push(f); }
    for (const c of f.children) if (!childFam.has(c)) childFam.set(c, f);
  }
  const marriageKey = (f) => [f.order ?? Infinity, f.married || '9999', famIndex.get(f.id)];
  const cmpKeys = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };
  for (const list of parentFams.values()) list.sort((a, b) => cmpKeys(marriageKey(a), marriageKey(b)));
  const spousesOf = (id) => (parentFams.get(id) || []).flatMap(f => f.parents.filter(x => x !== id && people[x]));
  const childrenOf = (id) => (parentFams.get(id) || []).flatMap(f => f.children.filter(c => people[c]));
  const parentsOf = (id) => (childFam.get(id)?.parents || []).filter(p => people[p]);
  const byBirth = (ids) => {
    const dated = ids.filter(id => people[id]?.birth).sort((a, b) => people[a].birth.localeCompare(people[b].birth));
    let k = 0; return ids.map(id => people[id]?.birth ? dated[k++] : id);
  };
  const husbandOf = (id) => { if (!people[id] || isMale(id)) return null; return spousesOf(id).find(h => isMale(h) && parentsOf(h).length) || null; };

  // ---- 1. visibility
  const hidden = new Set();
  const descend = (id, out) => { for (const c of childrenOf(id)) if (!out.has(c)) { out.add(c); descend(c, out); } };
  for (const id of model.collapsed || []) { if (!people[id]) continue; const d = new Set(); descend(id, d); for (const x of d) { hidden.add(x); for (const sp of spousesOf(x)) hidden.add(sp); } }
  for (const id of model.collapsed || []) hidden.delete(id);
  for (let grew = true; grew;) {
    grew = false;
    for (const id of Object.keys(people)) {
      if (hidden.has(id)) continue;
      const kids = childrenOf(id);
      if (!kids.length || !kids.every(c => hidden.has(c))) continue;
      if (parentsOf(id).length || spousesOf(id).some(sp => !hidden.has(sp))) continue;
      hidden.add(id); grew = true;
    }
  }
  const visible = Object.keys(people).filter(id => !hidden.has(id));
  const vis = new Set(visible);
  const positions = new Map();
  if (!visible.length) return { positions, hidden };

  // ---- 2. units: everyone joined by marriage, men first then women (rules 1, 5, 6)
  const vSpouses = (id) => spousesOf(id).filter(x => vis.has(x)), vParents = (id) => parentsOf(id).filter(x => vis.has(x));
  const unitOf = new Map(); const units = [];
  for (const id of visible) {
    if (unitOf.has(id)) continue;
    const members = []; const q = [id]; const seen = new Set([id]);
    while (q.length) { const x = q.shift(); members.push(x); for (const sp of vSpouses(x)) if (!seen.has(sp)) { seen.add(sp); q.push(sp); } }
    const men = members.filter(isMale), women = members.filter(m => !isMale(m));
    const marriageIdx = (a, b) => { const fams = parentFams.get(a) || []; const i = fams.findIndex(f => f.parents.includes(b)); return i < 0 ? 99 : i; };
    const first = (list, other) => Math.min(99, ...list.map(o => marriageIdx(o, other)));
    women.sort((a, b) => first(men, a) - first(men, b) || visible.indexOf(a) - visible.indexOf(b));
    men.sort((a, b) => first(women, b) - first(women, a) || visible.indexOf(a) - visible.indexOf(b));
    const u = { id: units.length, members: [...men, ...women], row: null, kids: [], left: [], right: [], frame: null };
    u.width = u.members.length * CARD_W + (u.members.length - 1) * COUPLE_GAP;
    for (const m of u.members) unitOf.set(m, u);
    units.push(u);
  }
  const memberOffset = (u, m) => u.members.indexOf(m) * (CARD_W + COUPLE_GAP);

  // ---- 3 + 4. placement tree with rows assigned along it (rules 2, 3, 4, 7, 9, 10)
  const parentUnit = (m) => { const ps = vParents(m); return ps.length ? unitOf.get(ps[0]) : null; };
  function build(u, row) {
    u.row = row;
    for (const m of u.members.filter(isMale)) { const pu = parentUnit(m); if (pu && pu.row === null) { build(pu, row - 1); u.left.push(pu); } }
    for (const w of u.members.filter(m => !isMale(m))) { const pu = parentUnit(w); if (pu && pu.row === null) { build(pu, row - 1); u.right.push(pu); } }
    const fams = [...new Set(u.members.flatMap(m => parentFams.get(m) || []))].sort((a, b) => cmpKeys(marriageKey(a), marriageKey(b)));
    const sided = (c) => isMale(c) && vSpouses(c).some(w => !isMale(w) && vParents(w).length);
    for (const f of fams) {
      const kids = byBirth(f.children.filter(c => vis.has(c))).filter(c => { const h = husbandOf(c); return !(h && vis.has(h)); });
      for (const c of [...kids.filter(c => !sided(c)), ...kids.filter(sided)]) { const cu = unitOf.get(c); if (cu.row === null) { build(cu, row + 1); u.kids.push(cu); } }
    }
    return u;
  }
  // components and roots: husband-side roots before wife-side roots
  const compOf = new Map(); const comps = [];
  for (const id of visible) {
    if (compOf.has(id)) continue;
    const members = []; const q = [id]; compOf.set(id, comps.length);
    while (q.length) { const x = q.shift(); members.push(x); for (const n of [...vParents(x), ...vSpouses(x), ...childrenOf(x).filter(c => vis.has(c))]) if (!compOf.has(n)) { compOf.set(n, comps.length); q.push(n); } }
    comps.push(members);
  }
  const rootsAbove = (id) => { const out = new Set(); const seen = new Set([id]); const q = [id]; while (q.length) { const x = q.shift(); const ps = vParents(x); if (!ps.length) { if (x !== id) out.add(unitOf.get(x)); continue; } for (const p of ps) if (!seen.has(p)) { seen.add(p); q.push(p); } } if (!out.size && !vParents(id).length) out.add(unitOf.get(id)); return out; };
  const idxComp = model.indexPerson && vis.has(model.indexPerson) ? compOf.get(model.indexPerson) : -1;
  const compOrder = comps.map((_, i) => i).sort((a, b) => (a === idxComp ? -1 : b === idxComp ? 1 : 0) || a - b);
  const trees = [];
  for (const ci of compOrder) {
    const cunits = units.filter(u => compOf.get(u.members[0]) === ci);
    const roots = cunits.filter(u => u.members.every(m => !vParents(m).length));
    const before = new Map(roots.map(u => [u.id, new Set()]));
    for (const u of cunits) {
      const men = u.members.filter(isMale), women = u.members.filter(m => !isMale(m));
      for (const h of men) for (const w of women) for (const rh of rootsAbove(h)) for (const rw of rootsAbove(w)) { if (rh !== rw && before.has(rw.id) && before.has(rh.id)) before.get(rw.id).add(rh.id); }
    }
    // start from the roots above the index couple's husband so the wife's ancestry attaches on her side
    const preferred = new Set();
    if (ci === idxComp) {
      const me = model.indexPerson, spouse = vSpouses(me)[0];
      const husband = isMale(me) ? me : spouse && isMale(spouse) ? spouse : me;
      for (const r of rootsAbove(husband)) preferred.add(r.id);
      if (!preferred.size) preferred.add(unitOf.get(husband).id);
    }
    const rank = (u) => preferred.has(u.id) ? 0 : 1;
    const done = new Set(); const ordered = [];
    while (ordered.length < roots.length) {
      const ready = roots.filter(u => !done.has(u.id) && [...before.get(u.id)].every(x => done.has(x)));
      const pick = (ready.length ? ready : roots.filter(u => !done.has(u.id))).sort((a, b) => rank(a) - rank(b))[0];
      done.add(pick.id); ordered.push(pick);
    }
    const compTrees = [];
    for (const r of [...ordered, ...cunits]) if (r.row === null) compTrees.push(build(r, 0));
    trees.push(compTrees);
  }

  // ---- 5. coordinates by subtree contours (rule 8 where free; no overlaps by construction)
  // contour: Map(row -> sorted disjoint [l, r] intervals); frame: { contour, x: Map(unit -> relative x) }
  const addSeg = (list, seg) => { const all = [...list, seg].sort((a, b) => a[0] - b[0]); const out = []; for (const s of all) { const last = out[out.length - 1]; if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]); else out.push([s[0], s[1]]); } return out; };
  const shiftContour = (c, dx) => { const m = new Map(); for (const [r, segs] of c) m.set(r, segs.map(([l, rr]) => [l + dx, rr + dx])); return m; };
  const merge = (a, b) => { const m = new Map(a); for (const [r, segs] of b) { let cur = m.get(r) || []; for (const s of segs) cur = addSeg(cur, s); m.set(r, cur); } return m; };
  const pushNeeded = (acc, c, dir) => {
    let need = 0;
    for (const [r, segs] of c) for (const a of acc.get(r) || []) for (const sg of segs) {
      if (sg[0] >= a[1] + H_GAP || a[0] >= sg[1] + H_GAP) continue;
      need = Math.max(need, dir > 0 ? a[1] + H_GAP - sg[0] : sg[1] + H_GAP - a[0]);
    }
    return need;
  };
  const settle = (acc, c, dir) => { let dx = 0; for (let i = 0; i < 200; i++) { const need = pushNeeded(acc, shiftContour(c, dx), dir); if (!need) break; dx += dir * need; } return dx; };
  function layoutNode(u, align = 'center') {
    let contour = new Map([[u.row, [[0, u.width]]]]);
    const xs = new Map([[u, 0]]);
    const place = (frame, dx) => { for (const [k, v] of frame.x) xs.set(k, v + dx); contour = merge(contour, shiftContour(frame.contour, dx)); };
    // a spouse's parents start above that spouse and extend outward (rule 4); inside a side block everything keeps opening outward
    const anchorOf = (b) => u.members.find(m => parentUnit(m) === b);
    const putLeft = (b) => { const f = layoutNode(b, 'right'); const dx0 = memberOffset(u, anchorOf(b)) + CARD_W - b.width; place(f, dx0 + settle(contour, shiftContour(f.contour, dx0), -1)); };
    const putRight = (b) => { const f = layoutNode(b, 'left'); const dx0 = memberOffset(u, anchorOf(b)); place(f, dx0 + settle(contour, shiftContour(f.contour, dx0), 1)); };
    const blocksAfterKids = align !== 'center';
    if (!blocksAfterKids) { for (const b of u.left) putLeft(b); for (const b of u.right) putRight(b); }
    if (u.kids.length) {
      let acc = null; const placed = [];
      for (const k of u.kids) {
        const f = layoutNode(k);
        const dx = acc ? settle(acc, f.contour, 1) : 0;
        placed.push([k, f, dx]); acc = acc ? merge(acc, shiftContour(f.contour, dx)) : shiftContour(f.contour, dx);
      }
      const first = placed[0], last = placed[placed.length - 1];
      const firstLeft = first[2] + first[1].x.get(first[0]), lastRight = last[2] + last[1].x.get(last[0]) + last[0].width;
      const kidsCenter = (firstLeft + first[0].width / 2 + lastRight - last[0].width / 2) / 2;
      let shift = align === 'left' ? -firstLeft : align === 'right' ? u.width - lastRight : u.width / 2 - kidsCenter;
      // children's frames carry hoisted in-law blocks in the rows above; keep them clear of this unit and its own blocks
      shift += settle(contour, shiftContour(acc, shift), 1);
      for (const [, f, dx] of placed) place(f, dx + shift);
    }
    if (blocksAfterKids) { for (const b of [...u.left, ...u.right]) (align === 'left' ? putRight : putLeft)(b); }
    return { contour, x: xs };
  }
  let offset = 0;
  for (const compTrees of trees) {
    let acc = null; const frames = [];
    for (const t of compTrees) { const f = layoutNode(t); const dx = acc ? settle(acc, f.contour, 1) : 0; frames.push([f, dx]); acc = acc ? merge(acc, shiftContour(f.contour, dx)) : shiftContour(f.contour, dx); }
    let minX = Infinity, maxX = -Infinity, minRow = Infinity;
    for (const segs of acc.values()) for (const [l, r] of segs) { minX = Math.min(minX, l); maxX = Math.max(maxX, r); }
    for (const r of acc.keys()) minRow = Math.min(minRow, r);
    for (const [f, dx] of frames) for (const [u, x] of f.x) { u.x = x + dx + offset - minX; u.row -= minRow; }
    offset += maxX - minX + TREE_GAP;
  }
  for (const u of units) for (const m of u.members) positions.set(m, { x: u.x + memberOffset(u, m), y: u.row * (CARD_H + V_GAP) });
  return { positions, hidden };
}
