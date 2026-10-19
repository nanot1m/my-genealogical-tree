import { test, expect } from '@playwright/test';
import { openApp, cardOf, cards, PHOTO } from './helpers.js';

async function newTreeTouch(page, opts) {
  await openApp(page, opts);
  await page.tap('#w-new');
  await expect(page.locator('#welcome.show')).toHaveCount(0);
}

test.describe('touch devices', () => {
  test('tap creates and selects, the edit sheet replaces inline editing, action bar adds relatives', async ({ page }) => {
    await newTreeTouch(page, { lang: 'ru' });
    await page.tap('#empty');
    await expect(page.locator('#sheet')).toBeVisible();
    await expect(page.locator('#sh-name')).toBeFocused();
    await page.keyboard.type('Анастасия'); await page.keyboard.press('Tab'); await page.keyboard.type('Иванова');
    await page.fill('#sh-birth', '1950-03-04');
    await page.locator('#sh-alive').uncheck();
    await page.fill('#sh-death', '2020-01-01');
    await page.tap('#sh-done');
    await expect(page.locator('#sheet')).toBeHidden();
    await expect(cardOf(page, 'Анастасия').locator('.name')).toContainText('урожд. Иванова');
    await expect(cardOf(page, 'Анастасия').locator('.dates')).toContainText('4 мар. 1950 – 1 янв. 2020 (69)');
    await expect(page.locator('.card.editing')).toHaveCount(0);
    await expect(page.locator('#actions')).toBeVisible();
    await page.tap('#actions [data-sel=child]');
    await expect(page.locator('#sheet')).toBeVisible();
    await page.keyboard.type('Дитя'); await page.tap('#sh-done');
    await expect(cards(page)).toHaveCount(2);
    await page.keyboard.press('Meta+z');
    await expect(cards(page)).toHaveCount(1);
  });

  test('tap selected card opens the sheet; photo, crop and delete work from the sheet', async ({ page }) => {
    await newTreeTouch(page);
    await page.tap('#empty'); await page.keyboard.type('Touch'); await page.tap('#sh-done');
    await expect(cardOf(page, 'Touch')).toHaveClass(/selected/);
    await page.tap('.card');
    await expect(page.locator('#sheet')).toBeVisible();
    await page.tap('#sh-photo');
    await page.locator('#photoInput').setInputFiles(PHOTO);
    await expect(page.locator('#crop.show')).toBeVisible();
    await page.tap('#crop-ok');
    await expect(page.locator('#sheet')).toBeVisible();
    await expect(page.locator('#sh-photo img')).toHaveCount(1);
    await page.tap('#sh-photo');
    await expect(page.locator('#menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.tap('#sh-delete');
    await expect(cards(page)).toHaveCount(0);
  });

  test('pinch zooms and a single finger pans', async ({ page }) => {
    await newTreeTouch(page);
    await page.tap('#empty'); await page.keyboard.type('A'); await page.tap('#sh-done');
    const transform = () => page.evaluate(() => document.getElementById('world').style.transform);
    const before = await transform();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 30, y: 200 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 90, y: 240 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 130, y: 260 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const panned = await transform();
    expect(panned).not.toBe(before);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 400 }, { x: 250, y: 400 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100, y: 400 }, { x: 300, y: 400 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await transform()).toContain('scale(2)');
  });

  test('phone layout: toolbars stack, action bar fits, sheet does not overflow in Russian', async ({ page }) => {
    await newTreeTouch(page, { lang: 'ru' });
    await page.tap('#empty'); await page.keyboard.type('Анастасия Константинопольская'); await page.keyboard.press('Tab'); await page.keyboard.type('Иванова');
    const overflow = () => page.evaluate(() => [...document.querySelectorAll('.bar, #sheet input, #sheet .sh-row, #sheet .foot button, #actions button')]
      .filter(el => el.offsetParent !== null)
      .filter(el => el.getBoundingClientRect().right > innerWidth + 1 || el.getBoundingClientRect().left < -1)
      .map(el => el.id || el.className));
    expect(await overflow()).toEqual([]);
    await page.tap('#sh-done');
    expect(await overflow()).toEqual([]);
    const top = await page.locator('#topleft').boundingBox();
    const right = await page.locator('#topright').boundingBox();
    expect(right.y).toBeGreaterThan(top.y + top.height - 1);
  });
});
