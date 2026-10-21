import { test, expect } from '@playwright/test';
import { openApp, newTree, cardOf } from './helpers.js';

test.describe('installable app', () => {
  test('manifest, icons, iOS meta tags and service worker are served and wired up', async ({ page, request }) => {
    await openApp(page);
    await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', 'manifest.webmanifest');
    await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute('href', /apple-touch-icon\.png$/);
    await expect(page.locator('meta[name=apple-mobile-web-app-capable]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[name=theme-color]')).toHaveCount(1);
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./');
    expect(manifest.icons.map(i => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some(i => i.purpose === 'maskable')).toBe(true);
    expect(manifest.file_handlers[0].accept['application/octet-stream']).toEqual(['.ftree']);
    for (const icon of manifest.icons) {
      const res = await request.get('/' + icon.src);
      expect(res.status(), icon.src).toBe(200);
      expect(res.headers()['content-type']).toBe('image/png');
    }
    const sw = await request.get('/sw.js');
    expect(sw.status()).toBe(200);
    expect(await sw.text()).toContain("addEventListener('fetch'");
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), { timeout: 10_000 }).toBe(1);
  });

  test('cached shell loads while offline', async ({ page, context }) => {
    await openApp(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async () => !!(await caches.match('./index.html'))), { timeout: 10_000 }).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#welcome.show')).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe('auto-update', () => {
  test.use({ serviceWorkers: 'block' });

  test('new deployed version shows an update button that reloads and keeps the draft', async ({ page }) => {
    let v = 'a';
    await page.route('**/version.json', r => r.fulfill({ json: { v } }));
    await newTree(page);
    await page.click('#empty');
    await page.keyboard.type('Mary'); await page.keyboard.press('Enter');
    v = 'b';
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('#update')).toBeVisible();
    await Promise.all([page.waitForEvent('load'), page.click('#update')]);
    await expect(cardOf(page, 'Mary')).toBeVisible();
    await expect(page.locator('#update')).toBeHidden();
  });

  test('unchanged version shows nothing', async ({ page }) => {
    await newTree(page);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(300);
    await expect(page.locator('#update')).toBeHidden();
  });
});

test.describe('in-app documentation', () => {
  test('symbol guide opens from the toolbar and G, link menu explains each option', async ({ page }) => {
    const { newTree, firstPerson, addRelative, cardOf, select } = await import('./helpers.js');
    await newTree(page);
    await firstPerson(page, 'A');
    await addRelative(page, null, 'c', 'B');
    await page.click('[data-act=legend]');
    await expect(page.locator('#legend.show')).toBeVisible();
    await expect(page.locator('#legend .item')).toHaveCount(29);
    await expect(page.locator('#legend h3')).toHaveText(['Couples', 'Children', 'People', 'Relationships']);
    await page.keyboard.press('Escape');
    await expect(page.locator('#legend.show')).toHaveCount(0);
    await page.keyboard.press('g');
    await expect(page.locator('#legend.show')).toBeVisible();
    await page.keyboard.press('Escape');
    await select(page, 'A'); await page.keyboard.press('l'); await cardOf(page, 'B').click();
    await expect(page.locator('#menu button small').first()).toHaveText('Draw a marriage line between the two');
    await expect(page.locator('#menu button', { hasText: 'Conflict' }).locator('small')).toHaveText('Zigzag: frequent conflict');
    await page.keyboard.press('Escape');
    await page.selectOption('#lang', 'ru');
    await page.keyboard.press('g');
    await expect(page.locator('#legend h2')).toHaveText('Обозначения и связи');
  });
});
