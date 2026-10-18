import { test, expect } from '@playwright/test';
import { newTree, firstPerson, addRelative, cardOf, select, draftState, familiesByName, positions, rows } from './helpers.js';

test.describe('spouses and marriages', () => {
  test('add spouse, multiple spouses, child menu asks which partner', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'John');
    await addRelative(page, null, 'm', 'Mary');
    await addRelative(page, 'John', 'c', 'Kid A');
    await addRelative(page, 'John', 'm', 'Second Wife');
    await select(page, 'John');
    await page.keyboard.press('c');
    await expect(page.locator('#menu button')).toHaveText(['With Mary', 'With Second Wife']);
    await page.keyboard.press('2');
    await page.keyboard.type('Kid B'); await page.keyboard.press('Enter');
    const fams = familiesByName(await draftState(page));
    expect(fams).toEqual(expect.arrayContaining([
      expect.objectContaining({ parents: ['John', 'Mary'], children: ['Kid A'] }),
      expect.objectContaining({ parents: ['John', 'Second Wife'], children: ['Kid B'] }),
    ]));
    const r = rows(await positions(page));
    expect([...r[0]].sort()).toEqual(['John', 'Mary', 'Second Wife']);
    expect(Math.abs(r[0].indexOf('John') - r[0].indexOf('Mary'))).toBe(1);
  });

  test('marriage badge edits dates and status, shows divorce and partner notation, unlink', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'John');
    await addRelative(page, null, 'm', 'Mary');
    await page.locator('.marriage').first().click();
    await expect(page.locator('#mpop-title')).toHaveText('John & Mary');
    await page.fill('#m-from', '1975-06-01'); await page.fill('#m-to', '1990-01-01');
    await page.keyboard.press('Enter');
    await expect(page.locator('.marriage').first()).toContainText('1975 – 1990');
    await page.locator('.marriage').first().click();
    await page.selectOption('#m-status', 'divorced'); await page.keyboard.press('Enter');
    await expect(page.locator('.marriage').first()).toContainText('⚡');
    expect((await page.locator('#edges path.slash').getAttribute('d')).length).toBeGreaterThan(0);
    await page.locator('.marriage').first().click();
    await page.selectOption('#m-status', 'partners'); await page.keyboard.press('Enter');
    expect((await page.locator('#edges path.partners').getAttribute('d')).length).toBeGreaterThan(0);
    for (let i = 0; i < 5 && (await page.locator('.marriage').first().textContent()) !== '♥'; i++) await page.keyboard.press('Meta+z');
    await expect(page.locator('.marriage').first()).toHaveText('♥');
    await page.locator('.marriage').first().click();
    await page.click('#m-unlink');
    await expect(page.locator('.marriage')).toHaveCount(0);
  });
});

test.describe('linking existing people', () => {
  test.setTimeout(120_000);
  test('L enters link mode, spouse/child/parent links, cycle and duplicate rejection', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'PX');
    await addRelative(page, 'PX', 'c', 'X1');
    await addRelative(page, 'PX', 'c', 'X2');
    await addRelative(page, 'X1', 'm', 'Y2');
    await addRelative(page, 'Y2', 'p', 'PY');
    await addRelative(page, 'PY', 'c', 'Y1');
    await select(page, 'X2');
    await page.keyboard.press('l');
    await expect(page.locator('body')).toHaveClass(/linking/);
    await cardOf(page, 'Y1').click();
    await expect(page.locator('#menu button').first()).toHaveText('Set as spouse');
    await page.locator('#menu button', { hasText: 'Set as spouse' }).click();
    await expect(page.locator('#toast')).toHaveText('Linked');
    let fams = familiesByName(await draftState(page));
    expect(fams).toContainEqual(expect.objectContaining({ parents: ['X2', 'Y1'] }));
    await select(page, 'X1'); await page.keyboard.press('l'); await cardOf(page, 'PX').click();
    await page.locator('#menu button', { hasText: 'Set as child' }).click();
    await expect(page.locator('#toast')).toHaveText('That would make someone their own ancestor');
    await select(page, 'X1'); await page.keyboard.press('l'); await cardOf(page, 'Y2').click();
    await page.locator('#menu button', { hasText: 'Set as spouse' }).click();
    await expect(page.locator('#toast')).toHaveText('These people are already linked this way');
    await addRelative(page, 'PY', 'c', 'Orphan');
    await select(page, 'X1'); await page.keyboard.press('l'); await cardOf(page, 'Orphan').click();
    await page.locator('#menu button', { hasText: 'Set as child' }).click();
    fams = familiesByName(await draftState(page));
    expect(fams.find(f => f.children.includes('Orphan')).parents).toEqual(['PY', 'X1']);
    await select(page, 'X2'); await page.keyboard.press('l'); await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveClass(/linking/);
  });

  test('relationship arrows: create, relabel, change type, delete', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'A');
    await addRelative(page, null, 'c', 'B');
    await select(page, 'A'); await page.keyboard.press('l'); await cardOf(page, 'B').click();
    await page.locator('#menu button', { hasText: 'Conflict' }).click();
    await expect(page.locator('#edges path.rel.conflict')).toHaveCount(1);
    await expect(page.locator('.relbadge')).toHaveText('Conflict');
    await page.locator('.relbadge').click();
    await expect(page.locator('#rpop')).toBeVisible();
    await page.fill('#r-label', 'feud'); await page.selectOption('#r-type', 'close'); await page.keyboard.press('Enter');
    await expect(page.locator('.relbadge')).toHaveText('feud');
    await expect(page.locator('#edges path.rel.close')).toHaveCount(1);
    expect((await draftState(page)).relations).toEqual([expect.objectContaining({ type: 'close', label: 'feud' })]);
    await page.locator('.relbadge').click();
    await page.click('#r-delete');
    await expect(page.locator('.relbadge')).toHaveCount(0);
  });
});

test.describe('genogram markers', () => {
  test('miscarriage/abortion/stillborn cards and line-ended glyph', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'Mom');
    await addRelative(page, null, 'c', 'Z');
    await cardOf(page, 'Z').dblclick();
    await page.selectOption('.card.editing .f-fate', 'miscarriage');
    await page.locator('.card.editing .f-ended').check();
    await page.keyboard.press('Enter');
    await expect(cardOf(page, 'Z')).toHaveClass(/unborn/);
    await expect(cardOf(page, 'Z').locator('.fate-chip')).toHaveText('Miscarriage');
    expect((await page.locator('#edges path.ended').getAttribute('d')).length).toBeGreaterThan(0);
    const p = Object.values((await draftState(page)).people).find(x => x.name === 'Z');
    expect(p.fate).toBe('miscarriage');
    expect(p.lineEnded).toBe(true);
  });
});
