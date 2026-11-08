import { test, expect } from '@playwright/test';
import { openApp, newTree, firstPerson, addRelative, cardOf, positions, rows, overlapCount, select } from './helpers.js';

const center = (pos, name) => { const p = pos.find(x => x.name === name); return p.x + 140; };

test.describe('layout', () => {
  test.setTimeout(180_000);
  test('in-law parents sit above their child on the outer side, no overlaps', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'Artur');
    await addRelative(page, null, 'm', 'Gulishat');
    await addRelative(page, 'Gulishat', 'p', 'Sharip');
    await addRelative(page, 'Gulishat', 'p', 'Patimat');
    await addRelative(page, 'Artur', 'p', 'Omar');
    await addRelative(page, 'Artur', 'p', 'Natella');
    await addRelative(page, 'Artur', 'c', 'Timur');
    const pos = await positions(page);
    expect(await overlapCount(page)).toBe(0);
    const r = rows(pos);
    expect(r).toHaveLength(3);
    expect(r[1]).toHaveLength(2);
    expect(r[2]).toEqual(['Timur']);
    const artur = center(pos, 'Artur'), gul = center(pos, 'Gulishat');
    const omarSide = Math.sign((center(pos, 'Omar') + center(pos, 'Natella')) / 2 - artur);
    const sharipSide = Math.sign((center(pos, 'Sharip') + center(pos, 'Patimat')) / 2 - gul);
    expect([0, Math.sign(artur - gul)]).toContain(omarSide);
    expect([0, Math.sign(gul - artur)]).toContain(sharipSide);
    expect(Math.abs((center(pos, 'Omar') + center(pos, 'Natella')) / 2 - artur)).toBeLessThan(400);
    expect(Math.abs((center(pos, 'Sharip') + center(pos, 'Patimat')) / 2 - gul)).toBeLessThan(400);
  });

  test('married children move to the ends with the spouse outward; extended family has no overlaps', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'Sharip');
    await addRelative(page, null, 'm', 'Patimat');
    for (const k of ['Gulishat', 'Patimat jr', 'Magomed', 'Gulnara']) await addRelative(page, 'Sharip', 'c', k);
    await addRelative(page, 'Gulishat', 'm', 'Artur');
    await addRelative(page, 'Artur', 'p', 'Omar'); await addRelative(page, 'Artur', 'p', 'Natella');
    await addRelative(page, 'Omar', 'c', 'Murad');
    await addRelative(page, 'Artur', 'c', 'Timur');
    await addRelative(page, 'Timur', 'm', 'Hadia');
    await addRelative(page, 'Hadia', 'p', 'Zilmira'); await addRelative(page, 'Hadia', 'p', 'Ravshan');
    await addRelative(page, 'Zilmira', 'p', 'Papa Z'); await addRelative(page, 'Zilmira', 'p', 'Mama Z');
    await addRelative(page, 'Ravshan', 'p', 'Papa R'); await addRelative(page, 'Ravshan', 'p', 'Mama R');
    for (const [who, sp, kids] of [['Patimat jr', 'Karzin', ['P2', 'Marina']], ['Magomed', 'Zaira', ['Eldar', 'Hadizhat']], ['Gulnara', 'Said', ['Asiyat', 'Jamal']]]) {
      await addRelative(page, who, 'm', sp);
      for (const k of kids) await addRelative(page, who, 'c', k);
    }
    const pos = await positions(page);
    expect(await overlapCount(page)).toBe(0);
    const r = rows(pos);
    expect(r[1].indexOf('Artur')).toBeLessThan(r[1].indexOf('Gulishat'));
    expect(r[1].indexOf('Gulishat')).toBeLessThan(r[1].indexOf('Patimat jr'));
    const inlaws = ['Papa Z', 'Mama Z', 'Papa R', 'Mama R', 'Omar', 'Natella'];
    for (const n of inlaws) expect(center(pos, n)).toBeLessThan(center(pos, 'Sharip'));
    expect(center(pos, 'Omar')).toBeGreaterThan(center(pos, 'Mama Z'));
  });

  test('children of each marriage sit under their own couple, marriages are numbered', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'John');
    await addRelative(page, null, 'm', 'Mary');
    await addRelative(page, 'John', 'c', 'Kid A');
    await addRelative(page, 'John', 'm', 'Second');
    await select(page, 'John'); await page.keyboard.press('c'); await page.keyboard.press('2');
    await page.keyboard.type('Kid B'); await page.keyboard.press('Enter');
    await select(page, 'John'); await page.keyboard.press('c'); await page.keyboard.press('2');
    await page.keyboard.type('Kid C'); await page.keyboard.press('Enter');
    const pos = await positions(page);
    expect(await overlapCount(page)).toBe(0);
    const firstMid = (center(pos, 'John') + center(pos, 'Mary')) / 2;
    expect(Math.abs(center(pos, 'Kid A') - firstMid)).toBeLessThan(2);
    const secondKids = (center(pos, 'Kid B') + center(pos, 'Kid C')) / 2;
    const secondMid = (center(pos, 'John') + center(pos, 'Second')) / 2;
    expect(Math.abs(secondKids - secondMid)).toBeLessThan(2);
    expect(center(pos, 'Kid B')).toBeGreaterThan(center(pos, 'Kid A'));
    expect(rows(pos)[0]).toEqual(['Mary', 'John', 'Second']);
    const badges = await page.locator('.marriage .h').allTextContents();
    expect(new Set(badges)).toEqual(new Set(['♥¹', '♥²']));
  });

  test('siblings are ordered by birth date, undated keep their slot', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'Root');
    await addRelative(page, null, 'c', 'Carl', '1990-01-01');
    await addRelative(page, 'Root', 'c', 'Bob', '1985-01-01');
    await addRelative(page, 'Root', 'c', 'Alice', '1980-01-01');
    await addRelative(page, 'Root', 'c', 'Undated');
    const r = rows(await positions(page));
    expect(r[1]).toEqual(['Alice', 'Bob', 'Carl', 'Undated']);
  });

  test('three married siblings with in-laws: all in-law parents on the top row, no overlaps', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'Pa');
    await addRelative(page, null, 'm', 'Ma');
    for (const k of ['K1', 'K2', 'K3']) {
      await addRelative(page, 'Pa', 'c', k);
      await addRelative(page, k, 'm', 'S' + k[1]);
      await addRelative(page, 'S' + k[1], 'p', 'F' + k[1]);
      await addRelative(page, 'S' + k[1], 'p', 'M' + k[1]);
    }
    const r = rows(await positions(page));
    expect(await overlapCount(page)).toBe(0);
    expect(r[0].sort()).toEqual(['F1', 'F2', 'F3', 'M1', 'M2', 'M3', 'Ma', 'Pa'].sort());
    expect(r[1]).toEqual(['S1', 'K1', 'K2', 'S2', 'K3', 'S3']);
    const d = await page.locator('#edges > path:not([class])').first().getAttribute('d');
    const busYs = new Set();
    let prev = null;
    for (const m of d.matchAll(/([MLQ])((?:\s*-?[\d.]+){2,4})/g)) {
      const nums = m[2].trim().split(/\s+/).map(Number);
      const pt = { x: nums[nums.length - 2], y: nums[nums.length - 1] };
      if (m[1] === 'L' && prev && prev.y === pt.y && Math.abs(prev.x - pt.x) > 40) busYs.add(pt.y);
      prev = m[1] === 'M' ? pt : pt;
    }
    expect(busYs.size).toBeGreaterThan(1);
  });
});

test('a late spouse stays next to the person even when earlier children have wide subtrees', async ({ page }) => {
  const people = {}, families = {};
  const person = (id, name) => { people[id] = { id, name, alive: true }; };
  person('hub', 'Hub'); person('wife', 'Wife'); person('late', 'Late');
  families.fa = { id: 'fa', parents: ['hub'], children: [], status: 'married' };
  families.fb = { id: 'fb', parents: ['hub', 'wife'], children: ['late'], status: 'married' };
  for (const k of ['k1', 'k2', 'k3']) {
    person(k, k.toUpperCase()); person(k + 'w', k.toUpperCase() + 'W'); person(k + 'a', k.toUpperCase() + 'a'); person(k + 'b', k.toUpperCase() + 'b');
    families.fa.children.push(k);
    families['f' + k] = { id: 'f' + k, parents: [k, k + 'w'], children: [k + 'a', k + 'b'], status: 'married' };
  }
  await openApp(page, { draft: { state: { people, families, relations: [] }, fileName: 'wide.ftree', dirty: true } });
  await page.click('#w-continue');
  const pos = await positions(page);
  const hub = pos.find(p => p.name === 'Hub'), wife = pos.find(p => p.name === 'Wife');
  expect(wife.y).toBe(hub.y);
  expect(Math.abs(wife.x - hub.x)).toBeLessThanOrEqual(2 * 356 + 1);
  expect(await overlapCount(page)).toBe(0);
});

test('compact view: V toggles column cards, narrows the tree, persists across reload', async ({ page }) => {
  await newTree(page);
  await firstPerson(page, 'Anna');
  await addRelative(page, null, 'm', 'Boris');
  await addRelative(page, 'Anna', 'c', 'Clara');
  await addRelative(page, 'Anna', 'c', 'Dima');
  const width = async () => { const pos = await positions(page); return Math.max(...pos.map(p => p.x)) - Math.min(...pos.map(p => p.x)); };
  const wide = await width();
  await page.keyboard.press('v');
  await expect(page.locator('body')).toHaveClass(/compact/);
  await page.waitForTimeout(600);
  const photo = await cardOf(page, 'Anna').locator('.photo').boundingBox(), info = await cardOf(page, 'Anna').locator('.info').boundingBox();
  expect(photo.y + photo.height).toBeLessThanOrEqual(info.y + 1);
  expect(await width()).toBeLessThan(wide);
  expect(await overlapCount(page)).toBe(0);
  await page.reload();
  await page.click('#w-continue');
  await expect(page.locator('body')).toHaveClass(/compact/);
  await page.click('[data-act=compact]');
  await expect(page.locator('body')).not.toHaveClass(/compact/);
});

test.describe('wide real-world tree (anonymized)', () => {
  const load = async (page, cross) => {
    const fs = await import('node:fs');
    const state = JSON.parse(fs.readFileSync(new URL('./fixtures/wide-tree.json', import.meta.url), 'utf8'));
    await openApp(page, { draft: { state, fileName: 'wide.ftree', dirty: true } });
    if (cross) { await page.evaluate((c) => localStorage.setItem('familytree.cross', c), cross); await page.reload(); }
    await page.click('#w-continue');
    await page.waitForTimeout(600);
  };
  const crossingsLeft = (page) => page.evaluate(() => {
    const segs = [];
    for (const p of document.querySelectorAll('#edges path:not(.rel):not(.house)')) {
      let cur = null;
      for (const m of (p.getAttribute('d') || '').matchAll(/([MLQA])([^MLQA]*)/g)) {
        const n = m[2].trim().split(/[\s,]+/).map(Number);
        if (m[1] === 'M') cur = { x: n[0], y: n[1] };
        else if (m[1] === 'L') { segs.push({ x1: cur.x, y1: cur.y, x2: n[0], y2: n[1] }); cur = { x: n[0], y: n[1] }; }
        else cur = { x: n[n.length - 2], y: n[n.length - 1] };
      }
    }
    const hs = segs.filter(s => s.y1 === s.y2 && s.x1 !== s.x2), vs = segs.filter(s => s.x1 === s.x2 && s.y1 !== s.y2);
    let n = 0;
    for (const h of hs) for (const v of vs) {
      const hx1 = Math.min(h.x1, h.x2) + 1, hx2 = Math.max(h.x1, h.x2) - 1, vy1 = Math.min(v.y1, v.y2) + 1, vy2 = Math.max(v.y1, v.y2) - 1;
      if (v.x1 > hx1 && v.x1 < hx2 && h.y1 > vy1 && h.y1 < vy2) n++;
    }
    return n;
  });

  test('no overlaps, no card stranded far from its spouse or siblings', async ({ page }) => {
    await load(page);
    expect(await overlapCount(page)).toBe(0);
    const far = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem('familytree.draft')).state, out = [];
      const at = (id) => { const el = [...document.querySelectorAll('.card')].find(c => c.dataset.id === id); return el && { x: parseFloat(el.style.left), y: parseFloat(el.style.top) }; };
      for (const f of Object.values(st.families)) {
        if (f.parents.length !== 2) continue;
        const [a, b] = f.parents.map(at); if (!a || !b) continue;
        if (a.y === b.y && Math.abs(a.x - b.x) > 3 * 356 + 1) out.push(f.id);
      }
      return out;
    });
    expect(far).toEqual([]);
  });

  test('plain mode has crossings, jump and gap modes resolve every one', async ({ page }) => {
    await load(page);
    expect(await crossingsLeft(page)).toBeGreaterThan(0);
    await load(page, 'jump');
    expect(await crossingsLeft(page)).toBe(0);
    await load(page, 'gap');
    expect(await crossingsLeft(page)).toBe(0);
  });
});
