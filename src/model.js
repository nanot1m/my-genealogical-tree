import { t } from './i18n.js';
import { uid } from './util.js';

export let state = emptyState();
export function setState(s) {
  state = s;
}
export const people = () => Object.values(state.people);
export const fam = (id) => state.families[id];

export function emptyState() {
  return { version: 1, people: {}, families: {}, relations: [], indexPerson: null, households: [], collapsed: [] };
}
export function descendantsOf(pid) {
  const seen = new Set();
  const q = [pid];
  while (q.length) {
    const x = q.shift();
    for (const c of childrenOf(x))
      if (!seen.has(c)) {
        seen.add(c);
        q.push(c);
      }
  }
  return seen;
}
export function hiddenSet() {
  const hidden = new Set();
  for (const id of state.collapsed || []) {
    if (!state.people[id]) continue;
    for (const d of descendantsOf(id)) {
      hidden.add(d);
      for (const sp of spousesOf(d)) hidden.add(sp);
    }
  }
  for (const id of state.collapsed || []) hidden.delete(id);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of people()) {
      if (hidden.has(p.id)) continue;
      const kids = childrenOf(p.id);
      if (!kids.length || !kids.every((c) => hidden.has(c))) continue;
      if (childFamily(p.id) || spousesOf(p.id).some((sp) => !hidden.has(sp))) continue;
      hidden.add(p.id);
      grew = true;
    }
  }
  return hidden;
}
export function isCollapsed(pid) {
  return (state.collapsed || []).includes(pid);
}
export function toggleCollapsed(pid) {
  state.collapsed ??= [];
  const i = state.collapsed.indexOf(pid);
  if (i >= 0) state.collapsed.splice(i, 1);
  else state.collapsed.push(pid);
}

export function childFamily(pid) {
  return Object.values(state.families).find((f) => f.children.includes(pid));
}

export function parentFamilies(pid) {
  return Object.values(state.families)
    .filter((f) => f.parents.includes(pid))
    .sort(
      (a, b) =>
        (a.order ?? Infinity) - (b.order ?? Infinity) || (a.married || '9999').localeCompare(b.married || '9999'),
    );
}

export function moveMarriage(fid, dir) {
  const f = fam(fid);
  if (!f) return;
  const pid = f.parents.find((id) => parentFamilies(id).length > 1);
  if (!pid) return;
  const fams = parentFamilies(pid),
    i = fams.indexOf(f),
    j = i + dir;
  if (j < 0 || j >= fams.length) return;
  [fams[i], fams[j]] = [fams[j], fams[i]];
  fams.forEach((x, k) => {
    x.order = k;
  });
}

export function replaceParent(child, oldParent, newParent) {
  const cf = childFamily(child);
  const keep = cf.parents.filter((x) => x !== oldParent);
  const kind = cf.kinds?.[child];
  cf.children = cf.children.filter((x) => x !== child);
  if (cf.kinds) delete cf.kinds[child];
  if (!cf.children.length && cf.parents.length < 2) delete state.families[cf.id];
  const want = [newParent, ...keep];
  let f = Object.values(state.families).find(
    (x) => x.parents.length === want.length && want.every((id) => x.parents.includes(id)),
  );
  if (f) f.children.push(child);
  else f = newFamily(want, [child]);
  if (kind) {
    f.kinds ??= {};
    f.kinds[child] = kind;
  }
}

export function parentsOf(pid) {
  const f = childFamily(pid);
  return f ? f.parents : [];
}

export function childrenOf(pid) {
  return parentFamilies(pid).flatMap((f) => f.children);
}

export function spousesOf(pid) {
  return parentFamilies(pid).flatMap((f) => f.parents.filter((x) => x !== pid));
}

export function siblingsOf(pid) {
  const f = childFamily(pid);
  return f ? f.children : [pid];
}

export function newPerson() {
  const p = {
    id: uid('p'),
    name: '',
    birthName: '',
    birthplace: '',
    profession: '',
    notes: '',
    birth: '',
    death: '',
    alive: true,
    photo: null,
    photoSrc: null,
    crop: null,
    fate: '',
    lineEnded: false,
    gender: '',
    illness: '',
    substance: '',
  };
  state.people[p.id] = p;
  return p;
}

export function newFamily(parents, children) {
  const f = { id: uid('f'), parents, children, married: '', ended: '', status: 'married', kinds: {} };
  state.families[f.id] = f;
  return f;
}

export function addParent(pid, replacing) {
  const f = childFamily(pid);
  if (f && f.parents.length >= 2 && !replacing) return null;
  const p = newPerson();
  if (replacing) replaceParent(pid, replacing, p.id);
  else if (f) f.parents.push(p.id);
  else newFamily([p.id], [pid]);
  return p;
}

export function addChild(pid, familyId) {
  const p = newPerson();
  const f = familyId ? fam(familyId) : parentFamilies(pid)[0];
  if (f) f.children.push(p.id);
  else newFamily([pid], [p.id]);
  return p;
}

export function addSpouse(pid) {
  const p = newPerson();
  const single = parentFamilies(pid).find((f) => f.parents.length === 1);
  if (single) single.parents.push(p.id);
  else newFamily([pid, p.id], []);
  return p;
}

export function addSibling(pid, side) {
  const p = newPerson();
  let f = childFamily(pid);
  if (!f) f = newFamily([], [pid]);
  const i = f.children.indexOf(pid) + (side === 'left' ? 0 : 1);
  f.children.splice(i, 0, p.id);
  return p;
}

export function deletePerson(pid) {
  delete state.people[pid];
  if (state.indexPerson === pid) state.indexPerson = null;
  state.households = (state.households || [])
    .map((h) => ({ ...h, members: h.members.filter((x) => x !== pid) }))
    .filter((h) => h.members.length > 1);
  state.relations = state.relations.filter((r) => r.from !== pid && r.to !== pid);
  for (const f of Object.values(state.families)) {
    if (f.kinds) {
      delete f.kinds[pid];
      for (const k of Object.values(f.kinds)) if (k.twin === pid) k.twin = '';
    }
  }
  for (const f of Object.values(state.families)) {
    f.parents = f.parents.filter((x) => x !== pid);
    f.children = f.children.filter((x) => x !== pid);
    const meaningless =
      (f.parents.length === 0 && f.children.length <= 1) || (f.children.length === 0 && f.parents.length <= 1);
    if (f.parents.length === 0 && f.children.length === 0) delete state.families[f.id];
    if (meaningless) delete state.families[f.id];
  }
}

export function ancestorsOf(pid) {
  const seen = new Set();
  const q = [pid];
  while (q.length) {
    const x = q.shift();
    for (const a of parentsOf(x))
      if (!seen.has(a)) {
        seen.add(a);
        q.push(a);
      }
  }
  return seen;
}

export function linkSpouse(a, b) {
  if (a === b || spousesOf(a).includes(b)) return t('already_linked');
  const single = parentFamilies(a).find((f) => f.parents.length === 1);
  if (single) single.parents.push(b);
  else newFamily([a, b], []);
  return null;
}

export function linkChild(parent, child, familyId) {
  if (parent === child || parentsOf(child).includes(parent)) return t('already_linked');
  if (ancestorsOf(parent).has(child)) return t('cycle');
  const cf = childFamily(child);
  if (cf) {
    if (cf.parents.length >= 2)
      return cf.parents.map((old) => ({
        label: t('replace') + ' ' + (state.people[old]?.name || t('unnamed')),
        run: () => replaceParent(child, old, parent),
      }));
    cf.parents.push(parent);
    return null;
  }
  const f = familyId ? fam(familyId) : parentFamilies(parent)[0];
  if (f) f.children.push(child);
  else newFamily([parent], [child]);
  return null;
}

export function addRelation(a, b, type) {
  if (a === b || state.relations.some((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a)))
    return t('already_linked');
  state.relations.push({ id: uid('r'), from: a, to: b, type, label: '' });
  return null;
}

export function joinHousehold(a, b) {
  state.households ??= [];
  const ha = state.households.find((h) => h.members.includes(a)),
    hb = state.households.find((h) => h.members.includes(b));
  if (ha && ha === hb) return t('already_linked');
  if (ha && hb) {
    ha.members.push(...hb.members.filter((x) => !ha.members.includes(x)));
    state.households = state.households.filter((h) => h !== hb);
  } else if (ha) ha.members.push(b);
  else if (hb) hb.members.push(a);
  else state.households.push({ id: uid('h'), members: [a, b] });
  return null;
}

export function birthOrder(pid) {
  const f = childFamily(pid);
  return f && f.children.length > 1 ? byBirth(f.children).indexOf(pid) + 1 : 0;
}

export function moveChild(pid, dir) {
  const f = childFamily(pid);
  if (!f) return;
  const i = f.children.indexOf(pid),
    j = i + dir;
  if (i < 0 || j < 0 || j >= f.children.length) return;
  [f.children[i], f.children[j]] = [f.children[j], f.children[i]];
}

export function husbandOf(id) {
  const p = state.people[id];
  if (!p || p.gender === 'm') return null;
  return spousesOf(id).find((h) => state.people[h]?.gender === 'm' && childFamily(h)) || null;
}

export function coupled(a, b) {
  if (a === b) return false;
  const sa = spousesOf(a);
  if (sa.includes(b)) return true;
  const sb = spousesOf(b);
  return sa.some((x) => sb.includes(x));
}

export function kindOf(pid) {
  const f = childFamily(pid);
  return (f && f.kinds && f.kinds[pid]) || { type: 'bio', twin: '', identical: false };
}

export function setKind(pid, patch) {
  const f = childFamily(pid);
  if (!f) return;
  f.kinds ??= {};
  f.kinds[pid] = { ...kindOf(pid), ...patch };
}

export function nearestRelative(pid) {
  return spousesOf(pid)[0] || parentsOf(pid)[0] || siblingsOf(pid).find((x) => x !== pid) || childrenOf(pid)[0] || null;
}

export function byBirth(ids) {
  const dated = ids
    .filter((id) => state.people[id]?.birth)
    .sort((a, b) => state.people[a].birth.localeCompare(state.people[b].birth));
  let k = 0;
  return ids.map((id) => (state.people[id]?.birth ? dated[k++] : id));
}
