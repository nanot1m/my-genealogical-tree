import { test, expect } from '@playwright/test';
import { newTree, cardOf, addRelative } from './helpers.js';

test.describe('localization', () => {
  test('switching language translates UI, dates and née, and persists across reload', async ({ page }) => {
    await newTree(page);
    await expect(page.locator('[data-act=new]')).toHaveText('New');
    await page.click('#empty');
    await page.keyboard.type('Mary Smith'); await page.keyboard.press('Tab'); await page.keyboard.type('Jones');
    await page.fill('#sh-birth', '1950-03-04'); await page.keyboard.press('Enter');
    await page.selectOption('#lang', 'ru');
    await expect(page.locator('[data-act=new]')).toHaveText('Новое');
    await expect(cardOf(page, 'Mary Smith').locator('.name')).toContainText('урожд. Jones');
    await expect(cardOf(page, 'Mary Smith').locator('.dates')).toContainText('р. 4 мар. 1950');
    await expect(page.locator('#filename')).toHaveText('Новое дерево');
    await addRelative(page, null, 'm', 'Иван');
    await expect(page.locator('#actions [data-sel=spouse]')).toHaveText('+ Супруг');
    await page.keyboard.press('?');
    await expect(page.locator('#help h2')).toHaveText('Горячие клавиши');
    await page.keyboard.press('Escape');
    await page.selectOption('#lang', 'de');
    await expect(cardOf(page, 'Mary Smith').locator('.name')).toContainText('geb. Jones');
    await expect(cardOf(page, 'Mary Smith').locator('.dates')).toContainText('geb. 4. März 1950');
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.locator('#lang')).toHaveValue('de');
    await expect(page.locator('[data-act=save]')).toHaveText('Speichern');
  });

  test('Russian UI does not overflow in editing, popover, menu and cropper states', async ({ page }) => {
    await newTree(page, { lang: 'ru' });
    await page.click('#empty');
    await page.keyboard.type('Анастасия Константинопольская'); await page.keyboard.press('Tab'); await page.keyboard.type('Иванова');
    await page.fill('#sh-birth', '1950-03-04');
    await page.locator('#sh-alive').uncheck();
    await page.fill('#sh-death', '2020-01-01');
    const overflow = () => page.evaluate(() => [...document.querySelectorAll('.bar, .bar button, .card .edit label, .card .edit .row, #mpop, #menu, #crop .panel, #help .panel, #help .grid div')]
      .filter(el => el.offsetParent !== null)
      .filter(el => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > innerWidth + 1 || el.getBoundingClientRect().left < -1)
      .map(el => el.className + ':' + (el.textContent || '').trim().slice(0, 20)));
    expect(await overflow()).toEqual([]);
    await page.keyboard.press('Enter');
    await addRelative(page, null, 'm', 'Владимир');
    await page.locator('.marriage').first().click();
    expect(await overflow()).toEqual([]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('?');
    expect(await overflow()).toEqual([]);
  });
});
