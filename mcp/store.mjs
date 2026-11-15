import { readFile, writeFile, rename, stat } from 'node:fs/promises';
import { encodeTree, decodeTree } from '../src/ftree.js';
import * as M from '../src/model.js';

export class Store {
  constructor() {
    this.path = null;
    this.mtime = 0;
  }

  async open(path) {
    const buf = await readFile(path);
    M.setState(decodeTree(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)));
    this.path = path;
    this.mtime = (await stat(path)).mtimeMs;
    return this.summary();
  }

  async create(path) {
    M.setState(M.emptyState());
    this.path = path;
    this.mtime = 0;
    await this.save(true);
    return this.summary();
  }

  requireOpen() {
    if (!this.path) throw new Error('No tree is open. Call open_tree first.');
  }

  // write goes to a temp file and is renamed over the target; refuse if someone else changed the file meanwhile
  async save(force = false) {
    this.requireOpen();
    if (!force && this.mtime) {
      const cur = (await stat(this.path).catch(() => null))?.mtimeMs ?? 0;
      if (cur && Math.abs(cur - this.mtime) > 1)
        throw new Error('The file changed on disk since it was read. Call open_tree again or pass force: true.');
    }
    const tmp = this.path + '.tmp';
    await writeFile(tmp, encodeTree(M.state));
    await rename(tmp, this.path);
    this.mtime = (await stat(this.path)).mtimeMs;
  }

  async mutate(fn, { dryRun = false, force = false } = {}) {
    this.requireOpen();
    const before = JSON.stringify(M.state);
    const result = fn();
    if (dryRun) {
      M.setState(JSON.parse(before));
      return { dryRun: true, ...result };
    }
    try {
      await this.save(force);
    } catch (e) {
      M.setState(JSON.parse(before));
      throw e;
    }
    return result;
  }

  person(id) {
    const p = M.state.people[id];
    if (!p) throw new Error(`Unknown person id: ${id}`);
    return p;
  }

  resolve(ref) {
    if (M.state.people[ref]) return ref;
    const q = ref.trim().toLowerCase();
    const hits = M.people().filter((p) => (p.name || '').trim().toLowerCase() === q);
    if (hits.length === 1) return hits[0].id;
    if (hits.length > 1)
      throw new Error(`Several people are named "${ref}"; use an id: ${hits.map((p) => p.id).join(', ')}`);
    throw new Error(`No person matches "${ref}"`);
  }

  view(id) {
    const p = this.person(id);
    const { photo, photoSrc, crop, ...rest } = p;
    const name = (x) => ({ id: x, name: M.state.people[x]?.name || '' });
    return {
      ...rest,
      hasPhoto: !!photo,
      parents: M.parentsOf(id).map(name),
      spouses: M.spousesOf(id).map(name),
      children: M.childrenOf(id).map(name),
      siblings: M.siblingsOf(id)
        .filter((x) => x !== id)
        .map(name),
      birthOrder: M.birthOrder(id) || null,
      kind: M.kindOf(id),
      isIndexPerson: M.state.indexPerson === id,
      marriages: M.parentFamilies(id).map((f) => ({
        familyId: f.id,
        with: f.parents.filter((x) => x !== id).map(name),
        married: f.married,
        ended: f.ended,
        status: f.status,
        children: f.children.map(name),
      })),
    };
  }

  summary() {
    const ps = M.people();
    return {
      path: this.path,
      people: ps.length,
      families: Object.keys(M.state.families).length,
      relations: M.state.relations.length,
      indexPerson: M.state.indexPerson
        ? { id: M.state.indexPerson, name: M.state.people[M.state.indexPerson]?.name }
        : null,
    };
  }

  outline() {
    const seen = new Set();
    const lines = [];
    const label = (p) =>
      `${p.name || '(unnamed)'}${p.birth || p.death ? ` (${p.birth || '?'}–${p.alive ? '' : p.death || '?'})` : ''} [${p.id}]`;
    const walk = (id, depth) => {
      if (seen.has(id)) return;
      seen.add(id);
      const p = M.state.people[id];
      lines.push('  '.repeat(depth) + label(p));
      for (const f of M.parentFamilies(id)) {
        const others = f.parents.filter((x) => x !== id);
        for (const sp of others) {
          seen.add(sp);
          lines.push('  '.repeat(depth) + '⚭ ' + label(M.state.people[sp]) + (f.married ? ` m. ${f.married}` : ''));
        }
        for (const c of M.byBirth(f.children)) walk(c, depth + 1);
      }
    };
    const roots = M.people()
      .filter((p) => !M.parentsOf(p.id).length)
      .sort((a, b) => (a.birth || '9999').localeCompare(b.birth || '9999'));
    for (const r of roots) walk(r.id, 0);
    for (const p of M.people()) walk(p.id, 0);
    return lines.join('\n');
  }
}

export { M };
