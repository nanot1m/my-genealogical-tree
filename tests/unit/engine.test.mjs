import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeLayout } from '../../src/engine.js';

const OPTS = { CARD_W: 280, CARD_H: 112, COUPLE_GAP: 76, H_GAP: 36, V_GAP: 96, TREE_GAP: 100 };
const STEP = OPTS.CARD_W + OPTS.COUPLE_GAP;

function build(spec) {
  // spec.people: [id, gender?, birth?]; spec.families: [[parents], [children], extra?]
  const people = {},
    families = {};
  for (const [id, gender = '', birth = ''] of spec.people) people[id] = { id, name: id, gender, birth, alive: true };
  spec.families.forEach(([parents, children, extra = {}], i) => {
    families['f' + i] = { id: 'f' + i, parents, children, status: 'married', ...extra };
  });
  return { people, families, collapsed: spec.collapsed || [], indexPerson: spec.indexPerson || null };
}
const x = (res, id) => res.positions.get(id).x,
  y = (res, id) => res.positions.get(id).y;
const adjacent = (res, a, b) => Math.abs(x(res, b) - x(res, a)) === STEP && y(res, a) === y(res, b);
function noOverlap(res) {
  const ps = [...res.positions.values()];
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++)
      if (ps[i].y === ps[j].y && Math.abs(ps[i].x - ps[j].x) < OPTS.CARD_W) return false;
  return true;
}

test('rule 1: man left of woman, unknown gender counts as woman', () => {
  const res = computeLayout(
    build({
      people: [
        ['w', 'f'],
        ['m', 'm'],
        ['u', ''],
        ['m2', 'm'],
      ],
      families: [
        [['w', 'm'], []],
        [['u', 'm2'], []],
      ],
    }),
    OPTS,
  );
  assert.ok(x(res, 'm') < x(res, 'w') && adjacent(res, 'm', 'w'));
  assert.ok(x(res, 'm2') < x(res, 'u') && adjacent(res, 'm2', 'u'));
});

test('rule 2: children by birth date, undated keep added order', () => {
  const res = computeLayout(
    build({
      people: [
        ['p', 'm'],
        ['a', 'm', '1990'],
        ['b', 'm', ''],
        ['c', 'm', '1980'],
        ['d', 'm', ''],
      ],
      families: [[['p'], ['a', 'b', 'c', 'd']]],
    }),
    OPTS,
  );
  const row = ['a', 'b', 'c', 'd'].sort((i, j) => x(res, i) - x(res, j));
  assert.deepEqual(row, ['c', 'b', 'a', 'd']);
  assert.ok(noOverlap(res));
});

test('rule 3: married daughter sits next to her husband when he has parents', () => {
  const res = computeLayout(
    build({
      people: [
        ['pa', 'm'],
        ['d1', 'f', '1970'],
        ['d2', 'f', '1972'],
        ['hp', 'm'],
        ['h', 'm', '1969'],
        ['hs', 'm', '1971'],
      ],
      families: [
        [['pa'], ['d1', 'd2']],
        [['hp'], ['h', 'hs']],
        [['h', 'd2'], []],
      ],
    }),
    OPTS,
  );
  assert.ok(adjacent(res, 'h', 'd2'));
  assert.ok(x(res, 'h') < x(res, 'd2'));
  assert.equal(y(res, 'd2'), y(res, 'd1'));
  assert.ok(noOverlap(res));
});

test('rule 4: husband relatives left of the couple, wife relatives right', () => {
  const res = computeLayout(
    build({
      people: [
        ['hp', 'm'],
        ['hm', 'f'],
        ['h', 'm', '1970'],
        ['hsis', 'f', '1968'],
        ['hbro', 'm', '1975'],
        ['wp', 'm'],
        ['wm', 'f'],
        ['w', 'f', '1971'],
        ['wbro', 'm', '1969'],
        ['wsis', 'f', '1974'],
        ['kid', 'm', '2000'],
      ],
      families: [
        [
          ['hp', 'hm'],
          ['hsis', 'h', 'hbro'],
        ],
        [
          ['wp', 'wm'],
          ['wbro', 'w', 'wsis'],
        ],
        [['h', 'w'], ['kid']],
      ],
    }),
    OPTS,
  );
  assert.ok(adjacent(res, 'h', 'w'));
  for (const id of ['hp', 'hm', 'hsis', 'hbro'])
    assert.ok(x(res, id) < x(res, 'w'), id + ' should be left of the wife');
  for (const id of ['wp', 'wm', 'wbro', 'wsis'])
    assert.ok(x(res, id) > x(res, 'h'), id + ' should be right of the husband');
  assert.ok(noOverlap(res));
});

test('rule 5: several wives to the right in marriage order, several husbands to the left', () => {
  const res = computeLayout(
    build({
      people: [
        ['m', 'm'],
        ['w1', 'f'],
        ['w2', 'f'],
        ['f', 'f'],
        ['h1', 'm'],
        ['h2', 'm'],
      ],
      families: [
        [['m', 'w1'], [], { order: 0 }],
        [['m', 'w2'], [], { order: 1 }],
        [['f', 'h1'], [], { order: 0 }],
        [['f', 'h2'], [], { order: 1 }],
      ],
    }),
    OPTS,
  );
  assert.ok(x(res, 'm') < x(res, 'w1') && x(res, 'w1') < x(res, 'w2'));
  assert.ok(x(res, 'h2') < x(res, 'h1') && x(res, 'h1') < x(res, 'f'));
});

test('rule 6: in-law husband without parents sits left of his wife in her row', () => {
  const res = computeLayout(
    build({
      people: [
        ['p', 'm'],
        ['a', 'f', '1970'],
        ['b', 'f', '1972'],
        ['h', 'm'],
      ],
      families: [
        [['p'], ['a', 'b']],
        [['h', 'a'], []],
      ],
    }),
    OPTS,
  );
  assert.ok(adjacent(res, 'h', 'a') && x(res, 'h') < x(res, 'a') && x(res, 'a') < x(res, 'b'));
  assert.equal(y(res, 'a'), y(res, 'b'));
});

test('rule 7: generations are rows; in-law parents one row above their child', () => {
  const res = computeLayout(
    build({
      people: [
        ['g', 'm'],
        ['p', 'm'],
        ['c', 'm'],
        ['w', 'f'],
        ['wp', 'm'],
        ['wgp', 'm'],
      ],
      families: [
        [['g'], ['p']],
        [['p'], ['c']],
        [['c', 'w'], []],
        [['wp'], ['w']],
        [['wgp'], ['wp']],
      ],
    }),
    OPTS,
  );
  const rowH = OPTS.CARD_H + OPTS.V_GAP;
  assert.equal(y(res, 'c'), y(res, 'w'));
  assert.equal(y(res, 'wp'), y(res, 'c') - rowH);
  assert.equal(y(res, 'wgp'), y(res, 'c') - 2 * rowH);
});

test('rule 8: a parent is centred over a single child', () => {
  const res = computeLayout(
    build({
      people: [
        ['p', 'm'],
        ['c', 'm'],
      ],
      families: [[['p'], ['c']]],
    }),
    OPTS,
  );
  assert.equal(x(res, 'p'), x(res, 'c'));
});

test('rule 13: components ordered with the index person first, separated by a gap', () => {
  const res = computeLayout(
    build({
      people: [
        ['a', 'm'],
        ['b', 'm'],
        ['c', 'm'],
        ['d', 'm'],
      ],
      families: [
        [['a'], ['b']],
        [['c'], ['d']],
      ],
      indexPerson: 'd',
    }),
    OPTS,
  );
  assert.ok(x(res, 'c') < x(res, 'a'));
  assert.ok(x(res, 'a') - (x(res, 'c') + OPTS.CARD_W) >= OPTS.TREE_GAP);
});

test('rule 14: collapsed branches disappear, the collapsed person stays', () => {
  const res = computeLayout(
    build({
      people: [
        ['g', 'm'],
        ['p', 'm'],
        ['c', 'm'],
        ['cw', 'f'],
      ],
      families: [
        [['g'], ['p']],
        [['p'], ['c']],
        [['c', 'cw'], []],
      ],
      collapsed: ['p'],
    }),
    OPTS,
  );
  assert.ok(res.positions.has('p') && res.positions.has('g'));
  assert.ok(!res.positions.has('c') && !res.positions.has('cw'));
});

test('rule 16: deterministic', () => {
  const spec = {
    people: [
      ['a', 'm'],
      ['b', 'f'],
      ['c', 'm', '1990'],
      ['d', 'f', '1992'],
    ],
    families: [
      [
        ['a', 'b'],
        ['c', 'd'],
      ],
    ],
  };
  const r1 = computeLayout(build(spec), OPTS),
    r2 = computeLayout(build(spec), OPTS);
  assert.deepEqual([...r1.positions], [...r2.positions]);
});

test('wide fixture: no overlaps, rules hold', () => {
  const state = JSON.parse(readFileSync(new URL('../fixtures/wide-tree.json', import.meta.url), 'utf8'));
  const t0 = performance.now();
  const res = computeLayout(state, OPTS);
  const ms = performance.now() - t0;
  assert.ok(noOverlap(res), 'overlap');
  assert.equal(res.positions.size, Object.keys(state.people).length);
  for (const f of Object.values(state.families)) {
    if (f.parents.length !== 2) continue;
    const [a, b] = f.parents;
    const ga = state.people[a].gender,
      gb = state.people[b].gender;
    const man = ga === 'm' ? a : gb === 'm' ? b : null;
    if (!man) continue;
    const woman = man === a ? b : a;
    assert.ok(x(res, man) < x(res, woman), `man left: ${state.people[man].name}`);
  }
  console.log(`  wide fixture: ${res.positions.size} people in ${ms.toFixed(1)} ms`);
  assert.ok(ms < 200, 'too slow: ' + ms);
});
