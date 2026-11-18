import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeTree, decodeTree } from '../../src/ftree.js';

test('visibility state round-trips through the .ftree container', () => {
  const state = {
    people: {
      a: { id: 'a', name: 'A', photo: null, photoSrc: null },
      b: { id: 'b', name: 'B', photo: null, photoSrc: null },
    },
    families: { f: { id: 'f', parents: ['a'], children: ['b'] } },
    relations: [],
    indexPerson: 'a',
    households: [],
    collapsed: ['a'],
    cutAbove: ['b'],
    focus: 'b',
    focusMode: 'line',
    focusDegree: 2,
    hiddenPeople: ['b'],
  };
  const back = decodeTree(encodeTree(state));
  assert.deepEqual(back.collapsed, ['a']);
  assert.deepEqual(back.cutAbove, ['b']);
  assert.equal(back.focus, 'b');
  assert.equal(back.focusMode, 'line');
  assert.equal(back.focusDegree, 2);
  assert.deepEqual(back.hiddenPeople, ['b']);
});
