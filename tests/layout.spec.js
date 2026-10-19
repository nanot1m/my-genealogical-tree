import { test, expect } from '@playwright/test';
import { newTree, firstPerson, addRelative, positions, rows, overlapCount, select } from './helpers.js';

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
    expect(Math.abs(secondKids - center(pos, 'Second'))).toBeLessThan(2);
    expect(center(pos, 'Kid B')).toBeGreaterThan(center(pos, 'Kid A'));
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
    const d = await page.locator('#edges > path').first().getAttribute('d');
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
