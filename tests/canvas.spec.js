import { test, expect } from '@playwright/test';
import {
  newTree,
  firstPerson,
  addRelative,
  cardOf,
  cards,
  select,
  deselect,
  positions,
  attachConsoleGuard,
  reloadApp,
  setGender,
} from './helpers.js';

test.describe('canvas and first person', () => {
  test('starts with an empty grid and a plus button, click creates the first card', async ({ page }) => {
    await newTree(page);
    await expect(page.locator('#empty')).toBeVisible();
    await expect(page.locator('#empty p')).toHaveText('Click to add the first person');
    await page.click('#empty');
    await expect(page.locator('#empty')).toBeHidden();
    await expect(page.locator('#sh-name')).toBeFocused();
    await page.keyboard.type('Anna Smith');
    await page.keyboard.press('Enter');
    await expect(cardOf(page, 'Anna Smith')).toBeVisible();
  });

  test('wheel pans, ctrl+wheel zooms at the cursor, F fits, 0 resets', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'Root');
    const transform = () => page.evaluate(() => document.getElementById('world').style.transform);
    const before = await transform();
    await page.mouse.move(700, 450);
    await page.mouse.wheel(0, 120);
    expect(await transform()).not.toBe(before);
    const zoomBefore = await page.locator('#zoomlvl').textContent();
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -200);
    await page.keyboard.up('Control');
    expect(await page.locator('#zoomlvl').textContent()).not.toBe(zoomBefore);
    await page.keyboard.press('0');
    await expect(page.locator('#zoomlvl')).toHaveText('100%');
    await page.keyboard.press('f');
    await expect(page.locator('#zoomlvl')).not.toHaveText('100%');
  });

  test('double-click on empty canvas zooms in, space+drag pans', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'Root');
    await page.keyboard.press('Escape');
    await page.mouse.dblclick(200, 700);
    await expect(page.locator('#zoomlvl')).toHaveText('150%');
    const before = await page.evaluate(() => document.getElementById('world').style.transform);
    await page.keyboard.down(' ');
    await page.mouse.move(300, 300);
    await page.mouse.down();
    await page.mouse.move(400, 350, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up(' ');
    expect(await page.evaluate(() => document.getElementById('world').style.transform)).not.toBe(before);
  });
});

test.describe('hover plus buttons', () => {
  test('shows parent, sibling and child buttons, parent hidden once two parents exist', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'Kid');
    await cardOf(page, 'Kid').hover();
    await expect(cardOf(page, 'Kid').locator('.plus[data-add=parent]')).toHaveCount(1);
    await expect(cardOf(page, 'Kid').locator('.plus.left, .plus.right, .plus.bottom, .plus.spouse')).toHaveCount(4);
    await cardOf(page, 'Kid').locator('.plus.top').click();
    await page.keyboard.type('Dad');
    await page.keyboard.press('Enter');
    await select(page, 'Kid');
    await cardOf(page, 'Kid').locator('.plus.top').click();
    await page.keyboard.type('Mom');
    await page.keyboard.press('Enter');
    await expect(cardOf(page, 'Kid').locator('.plus.top')).toHaveCount(0);
    await select(page, 'Kid');
    await cardOf(page, 'Kid').locator('.plus.bottom').click();
    await page.keyboard.type('Grandkid');
    await page.keyboard.press('Enter');
    await select(page, 'Kid');
    await cardOf(page, 'Kid').locator('.plus.right').click();
    await page.keyboard.type('Sister');
    await page.keyboard.press('Enter');
    const pos = await positions(page);
    expect(pos.map((p) => p.name)).toEqual(['Dad', 'Mom', 'Kid', 'Sister', 'Grandkid']);
  });
});

test.describe('keyboard', () => {
  test('arrows navigate, P/C/S create, Backspace deletes, undo and redo work', async ({ page }) => {
    const errors = [];
    attachConsoleGuard(page, errors);
    await newTree(page);
    await firstPerson(page, 'Anna', '1950-03-04');
    await page.keyboard.press('p');
    await page.keyboard.type('Grandpa');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await expect(cardOf(page, 'Anna')).toHaveClass(/selected/);
    await page.keyboard.press('c');
    await page.keyboard.type('Kid One');
    await page.keyboard.press('Enter');
    await page.keyboard.press('s');
    await page.keyboard.type('Kid Two');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowLeft');
    await expect(cardOf(page, 'Kid One')).toHaveClass(/selected/);
    await page.keyboard.press('ArrowUp');
    await expect(cardOf(page, 'Anna')).toHaveClass(/selected/);
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.type('Grandma');
    await page.keyboard.press('Enter');
    await expect(cards(page)).toHaveCount(5);
    await page.keyboard.press('Meta+z');
    await expect(cards(page)).toHaveCount(4);
    await page.keyboard.press('Shift+Meta+z');
    await expect(cards(page)).toHaveCount(5);
    await select(page, 'Kid Two');
    await page.keyboard.press('Backspace');
    await expect(cards(page)).toHaveCount(4);
    await expect(page.locator('#toast')).toContainText('Deleted');
    await page.keyboard.press('?');
    await expect(page.locator('#help.show h2')).toHaveText('Keyboard shortcuts');
    await page.keyboard.press('Escape');
    await expect(page.locator('#help.show')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('typing shortcut letters into a freshly created card does not leak into the name', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'Anna');
    await page.keyboard.press('c');
    await page.keyboard.type('pcsm');
    await page.keyboard.press('Enter');
    await expect(cardOf(page, 'pcsm')).toBeVisible();
  });

  test('name inputs opt out of password managers', async ({ page }) => {
    await newTree(page);
    await page.click('#empty');
    await expect(page.locator('#sh-name')).toHaveAttribute('data-1p-ignore', '');
    await expect(page.locator('#sh-name')).toHaveAttribute('autocomplete', 'off');
  });
});

test.describe('animations', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('cards glide to new positions, new cards enter, deleted cards leave', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'Root');
    await addRelative(page, null, 'c', 'A');
    await page.waitForTimeout(500);
    const sampling = page.evaluate(async () => {
      const el = document.querySelectorAll('.card')[0];
      const seen = new Set();
      const t0 = performance.now();
      while (performance.now() - t0 < 500) {
        await new Promise((r) => requestAnimationFrame(r));
        seen.add(el.style.translate);
      }
      return seen.size;
    });
    await page.waitForTimeout(50);
    await page.keyboard.press('s');
    expect(await sampling).toBeGreaterThan(3);
    await expect(page.locator('.card.enter')).toHaveCount(0, { timeout: 2000 });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Backspace');
    await expect(page.locator('.card.leave')).toHaveCount(1);
    await expect(page.locator('.card.leave')).toHaveCount(0, { timeout: 2000 });
  });
});

test('Cmd+F finds a person by name and centers the view on them', async ({ page }) => {
  await newTree(page);
  await firstPerson(page, 'Anna');
  await addRelative(page, 'Anna', 'c', 'Boris');
  await addRelative(page, 'Anna', 'c', 'Clara Ivanova');
  await deselect(page);
  await page.keyboard.press('Meta+f');
  await expect(page.locator('#search')).toBeVisible();
  await page.keyboard.type('ivan');
  await expect(page.locator('#s-list button')).toHaveText([/Clara Ivanova/]);
  await page.keyboard.press('Enter');
  await expect(page.locator('#search')).toBeHidden();
  await expect(cardOf(page, 'Clara Ivanova')).toHaveClass(/selected/);
  await page.waitForTimeout(400);
  const box = await cardOf(page, 'Clara Ivanova').boundingBox();
  const vp = page.viewportSize();
  expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThan(5);
  await page.keyboard.press('Meta+f');
  await page.keyboard.type('zzz');
  await expect(page.locator('#s-list .none')).toHaveText('No matches');
  await page.keyboard.press('Escape');
  await expect(page.locator('#search')).toBeHidden();
});

test('shift-click selects several people and highlights their nearest common ancestors', async ({ page }) => {
  await newTree(page);
  await firstPerson(page, 'Grandpa');
  await addRelative(page, null, 'm', 'Grandma');
  await addRelative(page, 'Grandpa', 'c', 'Aunt');
  await addRelative(page, 'Grandpa', 'c', 'Dad');
  await addRelative(page, 'Aunt', 'c', 'Cousin');
  await addRelative(page, 'Dad', 'c', 'Me');
  await addRelative(page, 'Me', 'c', 'Kid');
  await select(page, 'Me');
  await cardOf(page, 'Cousin').click({ modifiers: ['Shift'] });
  await expect(page.locator('#relbar')).toBeVisible();
  await expect(page.locator('#relbar')).toHaveText('Me is the first cousin of Cousin');
  await expect(cardOf(page, 'Grandpa')).toHaveClass(/common/);
  await expect(cardOf(page, 'Grandma')).toHaveClass(/common/);
  await expect(cardOf(page, 'Dad')).toHaveClass(/onpath/);
  await expect(cardOf(page, 'Kid')).not.toHaveClass(/onpath|common|multi/);
  expect((await page.locator('#edges path.hi').getAttribute('d')).length).toBeGreaterThan(20);
  await expect(page.locator('#actions')).not.toHaveClass(/show/);
  await cardOf(page, 'Kid').click({ modifiers: ['Meta'] });
  await expect(page.locator('#relbar')).toHaveText('Common ancestors: Grandpa, Grandma');
  await cardOf(page, 'Kid').click({ modifiers: ['Meta'] });
  await cardOf(page, 'Cousin').click({ modifiers: ['Meta'] });
  await expect(cardOf(page, 'Me')).toHaveClass(/selected/);
  await expect(page.locator('body')).not.toHaveClass(/has-multi/);
  await select(page, 'Dad');
  await cardOf(page, 'Me').click({ modifiers: ['Shift'] });
  await expect(page.locator('#relbar')).toHaveText('Dad is the parent of Me · Me is the child of Dad');
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/has-multi/);
  await expect(page.locator('#relbar')).toBeHidden();
  await cardOf(page, 'Grandpa').dblclick();
  await page.click('#sh-gender [data-v=m]');
  await page.keyboard.press('Escape');
  await cardOf(page, 'Me').dblclick();
  await page.click('#sh-gender [data-v=f]');
  await page.keyboard.press('Escape');
  await select(page, 'Grandpa');
  await cardOf(page, 'Me').click({ modifiers: ['Shift'] });
  await expect(page.locator('#relbar')).toHaveText(
    'Grandpa is the grandfather of Me · Me is the granddaughter of Grandpa',
  );
  await select(page, 'Grandpa');
  await cardOf(page, 'Kid').click({ modifiers: ['Shift'] });
  await expect(page.locator('#relbar')).toContainText('great-grandfather');
  await select(page, 'Aunt');
  await cardOf(page, 'Me').click({ modifiers: ['Shift'] });
  await expect(page.locator('#relbar')).toHaveText('Aunt is the uncle/aunt of Me · Me is the niece of Aunt');
  await expect(page.locator('#bottom')).toBeHidden();
  await page.selectOption('#lang', 'ru');
  await select(page, 'Me');
  await cardOf(page, 'Cousin').click({ modifiers: ['Shift'] });
  await expect(page.locator('#relbar')).toHaveText('Me — двоюродная сестра Cousin');
  await select(page, 'Cousin');
  await cardOf(page, 'Kid').click({ modifiers: ['Shift'] });
  await expect(page.locator('#relbar')).toHaveText('Cousin — двоюродный дядя Kid · Kid — двоюродный племянник Cousin');
  await page.selectOption('#lang', 'en');
  await select(page, 'Cousin');
  await cardOf(page, 'Kid').click({ modifiers: ['Shift'] });
  await expect(page.locator('#relbar')).toHaveText('Cousin is the first cousin once removed of Kid');
});

test('viewport position and zoom survive a reload', async ({ page }) => {
  await newTree(page);
  await firstPerson(page, 'Anna');
  await addRelative(page, null, 'c', 'Kid');
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, -240);
  await page.mouse.wheel(300, 120);
  await page.waitForTimeout(500);
  const transform = () => page.evaluate(() => document.getElementById('world').style.transform);
  const before = await transform();
  await reloadApp(page);
  await page.click('#w-continue');
  await page.waitForTimeout(300);
  expect(await transform()).toBe(before);
});

test('undo selects the person it changed and brings them into view', async ({ page }) => {
  await newTree(page);
  await firstPerson(page, 'Root');
  for (let i = 0; i < 6; i++) await addRelative(page, 'Root', 'c', 'Kid ' + i);
  await select(page, 'Kid 0');
  await page.keyboard.press('Backspace');
  await expect(cardOf(page, 'Kid 0')).toHaveCount(0);
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await page.keyboard.press('Meta+z');
  await expect(cardOf(page, 'Kid 0')).toHaveClass(/selected/);
  const box = await cardOf(page, 'Kid 0').boundingBox();
  const vp = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
});

test('toolbar search opens the finder; statistics panel counts people, genders and lifespans', async ({ page }) => {
  await newTree(page);
  await firstPerson(page, 'Anna', '1950-01-01');
  await addRelative(page, 'Anna', 'c', 'Kid', '1980-05-05');
  await setGender(page, 'Anna', 'f');
  await page.click('[data-act=search]');
  await expect(page.locator('#search')).toHaveClass(/show/);
  await page.keyboard.type('Kid');
  await page.keyboard.press('Enter');
  await expect(cardOf(page, 'Kid')).toHaveClass(/selected/);
  await page.click('[data-act=stats]');
  await expect(page.locator('#stats')).toHaveClass(/show/);
  const text = await page.locator('#stats .panel').innerText();
  expect(text).toContain('People');
  expect(text).toMatch(/People\s*2/);
  expect(text).toMatch(/Women\s*1/);
  expect(text).toMatch(/Births from – to\s*1950 – 1980/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#stats')).not.toHaveClass(/show/);
});

test('hide a person with their branch, the parent shows a count, reload keeps it, paper overlay and compose modes work', async ({
  page,
}) => {
  await newTree(page);
  await firstPerson(page, 'Grandpa');
  await addRelative(page, 'Grandpa', 'c', 'Dad');
  await addRelative(page, 'Dad', 'c', 'Me');
  await addRelative(page, 'Grandpa', 'c', 'Uncle');
  await select(page, 'Dad');
  await page.click('#actions [data-sel=hide]');
  await expect(cards(page)).toHaveCount(2);
  await expect(cardOf(page, 'Grandpa').locator('.fold')).toHaveText('▸ 2');
  await reloadApp(page);
  await page.click('#w-continue');
  await expect(cards(page)).toHaveCount(2);
  await page.click('[data-act=paper]');
  await expect(page.locator('#paper rect')).toHaveCount(1);
  await page.click('[data-act=pdf]');
  await page.selectOption('#pd-mode', 'compose4');
  await expect(page.locator('#pd-hint')).toContainText('4 sheet');
  await expect(page.locator('#paper rect')).toHaveCount(4);
  await page.selectOption('#pd-paper', 'a2');
  await page.selectOption('#pd-mode', 'fit');
  await expect(page.locator('#paper rect')).toHaveCount(1);
  await page.click('#pd-cancel');
  await cardOf(page, 'Grandpa').locator('.fold').click();
  await expect(cards(page)).toHaveCount(4);
});

test('hide ancestors and focus mode hide the right people; search reveals them again', async ({ page }) => {
  await newTree(page);
  await firstPerson(page, 'Grandpa');
  await addRelative(page, 'Grandpa', 'c', 'Dad');
  await addRelative(page, 'Dad', 'c', 'Me');
  await addRelative(page, 'Me', 'c', 'Kid');
  await addRelative(page, 'Me', 'm', 'Wife');
  await addRelative(page, 'Grandpa', 'c', 'Uncle');
  await select(page, 'Me');
  await page.click('#actions [data-sel=cut]');
  await expect(cards(page)).toHaveCount(3);
  await expect(cardOf(page, 'Grandpa')).toHaveCount(0);
  await expect(cardOf(page, 'Uncle')).toHaveCount(0);
  await expect(page.locator('#actions [data-sel=cut]')).toHaveText('Show ancestors');
  await page.click('#actions [data-sel=cut]');
  await expect(cards(page)).toHaveCount(6);
  await select(page, 'Dad');
  await page.click('#actions [data-sel=focus]');
  await expect(cards(page)).toHaveCount(4);
  await expect(cardOf(page, 'Uncle')).toHaveCount(0);
  await expect(page.locator('#actions [data-sel=focus]')).toHaveText('Show all');
  await select(page, 'Me');
  await page.click('#actions [data-sel=lineage]');
  await expect(cardOf(page, 'Grandpa')).toHaveCount(1);
  await expect(cardOf(page, 'Kid')).toHaveCount(1);
  await expect(cardOf(page, 'Uncle')).toHaveCount(0);
  await expect(page.locator('#actions [data-sel=lineage]')).toHaveText('Show all');
  await page.click('#actions [data-sel=lineage]');
  await expect(cards(page)).toHaveCount(6);
  await select(page, 'Dad');
  await page.click('#actions [data-sel=focus]');
  await page.keyboard.press('Meta+f');
  await page.keyboard.type('Uncle');
  await page.keyboard.press('Enter');
  await expect(cards(page)).toHaveCount(6);
  await expect(cardOf(page, 'Uncle')).toHaveClass(/selected/);
});

test('collapsing a branch hides descendants, survives reload, and search expands it', async ({ page }) => {
  await newTree(page);
  await firstPerson(page, 'Grandpa');
  await addRelative(page, 'Grandpa', 'c', 'Dad');
  await addRelative(page, 'Dad', 'c', 'Me');
  await addRelative(page, 'Me', 'c', 'Kid');
  await addRelative(page, 'Me', 'm', 'Wife');
  await select(page, 'Dad');
  await page.keyboard.press('h');
  await expect(cards(page)).toHaveCount(2);
  await expect(cardOf(page, 'Dad').locator('.fold')).toHaveText('▸ 2');
  await expect(page.locator('#actions [data-sel=fold]')).toHaveText('Expand branch');
  await page.waitForTimeout(600);
  await reloadApp(page);
  await page.click('#w-continue');
  await expect(cards(page)).toHaveCount(2);
  await page.keyboard.press('Meta+f');
  await page.keyboard.type('Kid');
  await page.keyboard.press('Enter');
  await expect(cards(page)).toHaveCount(5);
  await expect(cardOf(page, 'Kid')).toHaveClass(/selected/);
  await select(page, 'Dad');
  await page.keyboard.press('h');
  await expect(cards(page)).toHaveCount(2);
  await expect(page.locator('[data-act=unfold]')).toBeVisible();
  await page.click('[data-act=unfold]');
  await expect(cards(page)).toHaveCount(5);
  await expect(page.locator('[data-act=unfold]')).toBeHidden();
  await page.keyboard.press('Meta+z');
  await expect(cards(page)).toHaveCount(2);
  await page.keyboard.press('Meta+z');
  await expect(cards(page)).toHaveCount(5);
});
