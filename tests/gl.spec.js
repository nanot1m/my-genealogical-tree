import { test, expect } from '@playwright/test';
import { openApp, cardOf } from './helpers.js';
import fs from 'node:fs';

test.describe('WebGL layer', () => {
  test('draws the tree on a canvas, follows hover, selection and theme changes without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const state = JSON.parse(fs.readFileSync(new URL('./fixtures/wide-tree.json', import.meta.url), 'utf8'));
    await openApp(page, { gl: true, draft: { state, fileName: 'wide.ftree', dirty: true } });
    await page.click('#w-continue');
    await page.waitForSelector('body.gl');
    await expect(page.locator('#gl')).toHaveCount(1);
    await page.waitForSelector('body[data-settled]');
    const frames = () => page.evaluate(() => window.__gl.stats.frames);
    const before = await frames();
    await page.keyboard.press('Meta+f');
    await page.keyboard.type('Person 24');
    await page.keyboard.press('Enter');
    await expect(cardOf(page, 'Person 24')).toHaveClass(/selected/);
    await cardOf(page, 'Person 24').hover();
    await page.waitForTimeout(100);
    expect(await frames()).toBeGreaterThan(before);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(200);
    const px = await page.evaluate(() => {
      const c = document.querySelector('#gl');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      return !!gl && c.width > 0;
    });
    expect(px).toBe(true);
    expect(errors).toEqual([]);
  });
});
