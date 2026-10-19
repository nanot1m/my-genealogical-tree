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
    await expect(page.locator('#menu button').first()).toContainText('Set as spouse');
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
    await expect(page.locator('#edges path.rel.inner')).toHaveCount(1);
    expect((await draftState(page)).relations).toEqual([expect.objectContaining({ type: 'close', label: 'feud' })]);
    await page.locator('.relbadge').click();
    await page.click('#r-delete');
    await expect(page.locator('.relbadge')).toHaveCount(0);
  });
});

test.describe('genogram markers', () => {
  test('standard symbols: deceased cross, index person, gender ordering, pregnancy, adopted/foster, twins, line styles', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'Anna');
    await addRelative(page, null, 'm', 'Boris');
    const edit = async (name, fn) => { await select(page, name); await cardOf(page, name).dblclick(); await fn(); await page.keyboard.press('Enter'); await page.waitForTimeout(150); };
    await edit('Anna', async () => { await page.selectOption('.card.editing .f-gender', 'f'); });
    await edit('Boris', async () => {
      await page.selectOption('.card.editing .f-gender', 'm');
      await page.locator('.card.editing .f-alive').uncheck();
      await page.fill('.card.editing .f-death', '2010-01-01');
      await page.locator('.card.editing .f-index').check();
    });
    await expect(cardOf(page, 'Boris')).toHaveClass(/deceased/);
    await expect(cardOf(page, 'Boris')).toHaveClass(/index/);
    await expect(cardOf(page, 'Boris')).toHaveClass(/g-m/);
    await expect(cardOf(page, 'Anna')).toHaveClass(/g-f/);
    let r = rows(await positions(page));
    expect(r[0]).toEqual(['Boris', 'Anna']);
    for (const k of ['Twin1', 'Twin2', 'Adopted', 'Foster', 'Preg']) await addRelative(page, 'Anna', 'c', k);
    await edit('Twin1', async () => { await page.selectOption('.card.editing .f-twin', { label: 'Twin2' }); await page.locator('.card.editing .f-identical').check(); });
    await edit('Adopted', async () => { await page.selectOption('.card.editing .f-kind', 'adopted'); });
    await edit('Foster', async () => { await page.selectOption('.card.editing .f-kind', 'foster'); });
    await edit('Preg', async () => { await page.selectOption('.card.editing .f-fate', 'pregnancy'); });
    await expect(cardOf(page, 'Preg').locator('.photo svg.fg path')).toHaveCount(1);
    expect((await page.locator('#edges path.adopted').getAttribute('d')).length).toBeGreaterThan(0);
    expect((await page.locator('#edges path.foster').getAttribute('d')).length).toBeGreaterThan(0);
    r = rows(await positions(page));
    expect(r[1].indexOf('Twin2') - r[1].indexOf('Twin1')).toBe(1);
    await select(page, 'Twin1'); await page.keyboard.press('l'); await cardOf(page, 'Adopted').click();
    await page.locator('#menu button', { hasText: 'Fused' }).click();
    await expect(page.locator('#edges path.rel.fused')).toHaveCount(2);
    await expect(page.locator('#edges path.rel.inner')).toHaveCount(1);
    await select(page, 'Anna'); await page.keyboard.press('l'); await cardOf(page, 'Foster').click();
    await page.locator('#menu button', { hasText: 'Focused' }).click();
    await expect(page.locator('#edges path.rel.focused')).toHaveAttribute('marker-end', /arrow-head/);
    await expect(page.locator('#edges path.rel.close[marker-start]')).toHaveCount(0);
    await select(page, 'Boris'); await page.keyboard.press('i');
    await expect(cardOf(page, 'Boris')).not.toHaveClass(/index/);
    await page.locator('.marriage').first().click(); await page.selectOption('#m-status', 'reconciled_div'); await page.keyboard.press('Enter');
    expect(((await page.locator('#edges path.slash').getAttribute('d')).match(/M/g) || []).length).toBe(3);
    await edit('Boris', async () => { await page.selectOption('.card.editing .f-illness', 'active'); await page.selectOption('.card.editing .f-substance', 'recovered'); });
    await expect(cardOf(page, 'Boris').locator('.photo .hx.ill.active')).toHaveCount(1);
    await expect(cardOf(page, 'Boris').locator('.photo .hx.sub.recovered')).toHaveCount(1);
    await select(page, 'Anna'); await page.keyboard.press('l'); await cardOf(page, 'Twin1').click();
    await page.locator('#menu button', { hasText: 'household' }).click();
    await expect(page.locator('.relbadge.house')).toHaveText('⌂ 2');
    expect((await page.locator('#edges path.house').getAttribute('d')).length).toBeGreaterThan(0);
    await page.locator('.relbadge.house').click();
    await page.locator('#menu button', { hasText: 'Dissolve' }).click();
    await expect(page.locator('.relbadge.house')).toHaveCount(0);
    const st = await draftState(page);
    expect(Object.values(st.families).find(f => f.children.length === 5).kinds).toEqual(expect.objectContaining({ [Object.keys(st.people).find(k => st.people[k].name === 'Adopted')]: expect.objectContaining({ type: 'adopted' }) }));
  });

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
