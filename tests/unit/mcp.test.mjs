import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../mcp/server.mjs';
import { Store } from '../../mcp/store.mjs';
import { decodeTree } from '../../src/ftree.js';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'ftree-'));
  const path = join(dir, 'family.ftree');
  const store = new Store();
  const server = createServer(store);
  const client = new Client({ name: 'test', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const txt = r.content[0].text;
    if (r.isError) throw new Error(txt);
    try {
      return JSON.parse(txt);
    } catch {
      return txt;
    }
  };
  return { path, store, call, client, server };
}

test('open_tree creates, add_relative builds a family, file round-trips', async () => {
  const { path, call } = await setup();
  const s = await call('open_tree', { path, create: true });
  assert.equal(s.people, 0);
  const dad = await call('add_person', { name: 'Dad', gender: 'm', birth: '1950' });
  const mom = await call('add_relative', { person: dad.id, relation: 'spouse', name: 'Mom', gender: 'f' });
  const kid = await call('add_relative', { person: 'Dad', relation: 'child', name: 'Kid', birth: '1980-05-01' });
  assert.deepEqual(kid.parents.map((p) => p.name).sort(), ['Dad', 'Mom']);
  assert.equal(mom.spouses[0].name, 'Dad');
  const onDisk = decodeTree(new Uint8Array(await readFile(path)));
  assert.equal(Object.keys(onDisk.people).length, 3);
  const outline = await call('tree_outline');
  assert.match(outline, /Dad.*\n⚭ Mom.*\n  Kid/);
});

test('update_person, set_marriage, link_people, remove_person', async () => {
  const { path, call } = await setup();
  await call('open_tree', { path, create: true });
  const a = await call('add_person', { name: 'Anna' });
  const b = await call('add_person', { name: 'Boris' });
  const c = await call('add_person', { name: 'Child' });
  await call('link_people', { a: a.id, b: b.id, relation: 'spouse' });
  const linked = await call('link_people', { a: c.id, b: a.id, relation: 'child_of' });
  assert.deepEqual(linked.a.parents.map((p) => p.name).sort(), ['Anna', 'Boris']);
  const view = await call('get_person', { person: 'Anna' });
  const fam = view.marriages[0];
  await call('set_marriage', { familyId: fam.familyId, married: '1975', status: 'divorced' });
  const upd = await call('update_person', { person: 'Boris', death: '2000' });
  assert.equal(upd.alive, false);
  const again = await call('get_person', { person: 'Anna' });
  assert.equal(again.marriages[0].status, 'divorced');
  await assert.rejects(call('link_people', { a: a.id, b: c.id, relation: 'child_of' }), /ancestor|cycle|already/i);
  const removed = await call('remove_person', { person: 'Child' });
  assert.equal(removed.people, 2);
});

test('dry_run leaves the file untouched; stale file is refused without force', async () => {
  const { path, call, store } = await setup();
  await call('open_tree', { path, create: true });
  await call('add_person', { name: 'Real' });
  const before = await readFile(path);
  const r = await call('add_person', { name: 'Ghost', dryRun: true });
  assert.equal(r.dryRun, true);
  assert.deepEqual(await readFile(path), before);
  assert.equal((await call('list_people')).length, 1);
  const t = new Date(Date.now() + 5000);
  await utimes(path, t, t);
  await assert.rejects(call('add_person', { name: 'Late' }), /changed on disk/);
  await call('add_person', { name: 'Late', force: true });
  assert.equal((await call('list_people')).length, 2);
  void store;
});

test('name resolution: unique names work, ambiguous names ask for an id', async () => {
  const { path, call } = await setup();
  await call('open_tree', { path, create: true });
  await call('add_person', { name: 'Ivan' });
  await call('add_person', { name: 'Ivan' });
  await assert.rejects(call('get_person', { person: 'Ivan' }), /Several people/);
  await writeFile(path + '.keep', '');
});
