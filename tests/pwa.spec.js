import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

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
