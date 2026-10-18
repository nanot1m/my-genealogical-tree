import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { openApp, newTree, firstPerson, addRelative, cardOf, cards, libraryEntries, PHOTO } from './helpers.js';

const opfsSavePicker = (name) => `window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle(${JSON.stringify(name)}, { create: true });`;

test.describe('binary file format', () => {
  test('download produces a FTREE binary with raw JPEG, reopens with photo and relatives, legacy JSON imports', async ({ page }, testInfo) => {
    page.on('dialog', d => d.accept('mytree'));
    await newTree(page, { noFS: true });
    await firstPerson(page, 'Anna Müller');
    await cardOf(page, 'Anna Müller').locator('.photo').click();
    await page.locator('#photoInput').setInputFiles(PHOTO);
    await page.click('#crop-ok');
    await addRelative(page, null, 'm', 'Ivan');
    await addRelative(page, 'Anna Müller', 'c', 'Kid');
    await page.click('[data-act=save]');
    await expect(page.locator('#filename')).toHaveText('mytree.ftree');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=download]')]);
    const path = testInfo.outputPath('mytree.ftree');
    await dl.saveAs(path);
    const buf = fs.readFileSync(path);
    expect(buf.subarray(0, 5).toString()).toBe('FTREE');
    expect(buf.includes(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);
    expect(buf.includes('/9j/4AA')).toBe(false);

    await page.click('[data-act=new]');
    await expect(cards(page)).toHaveCount(0);
    await page.locator('#fileInput').setInputFiles(path);
    await expect(cards(page)).toHaveCount(3);
    await expect(cardOf(page, 'Anna Müller').locator('.photo img')).toHaveCount(1);
    await expect(page.locator('#filename')).toHaveText('mytree.ftree');

    const legacy = testInfo.outputPath('legacy.json');
    fs.writeFileSync(legacy, JSON.stringify({ people: { a: { id: 'a', name: 'Old Guy', birth: '1900-01-01' } }, families: {} }));
    await page.locator('#fileInput').setInputFiles(legacy);
    await expect(cardOf(page, 'Old Guy')).toBeVisible();
    await expect(page.locator('#filename')).toHaveText('legacy.ftree');
  });

  test('iOS-style picker has no accept filter', async ({ page }) => {
    await openApp(page, { noFS: true });
    await expect(page.locator('#fileInput')).not.toHaveAttribute('accept', /.+/);
  });
});

test.describe('library mode (no File System Access API)', () => {
  test('changes autosave into the library, launch reopens the last tree, Open lists saved trees', async ({ page }) => {
    await newTree(page, { noFS: true });
    await firstPerson(page, 'Auto One');
    await expect.poll(async () => (await libraryEntries(page)).length).toBe(1);
    await expect(page.locator('#filename')).not.toHaveClass(/dirty/);
    const before = (await libraryEntries(page))[0].bytes;
    await addRelative(page, null, 'c', 'Auto Kid');
    await expect.poll(async () => (await libraryEntries(page))[0].bytes).toBeGreaterThan(before);
    expect(await libraryEntries(page)).toHaveLength(1);
    await page.waitForTimeout(600);
    await page.reload();
    await expect(cards(page)).toHaveCount(2);
    await expect(page.locator('#welcome.show')).toHaveCount(0);
    await page.click('[data-act=open]');
    await expect(page.locator('#w-list-title')).toHaveText('Saved trees');
    await expect(page.locator('#w-recent .recent .nm')).toHaveText(['Untitled tree']);
    await expect(page.locator('#w-open')).toHaveText('Import file…');
  });

  test('phone-sized file menu offers Download when there is no file API', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await newTree(page, { noFS: true });
    await expect(page.locator('[data-act=filemenu]')).toBeVisible();
    await expect(page.locator('[data-act=new]')).toBeHidden();
    await page.click('[data-act=filemenu]');
    await expect(page.locator('#menu button')).toHaveText(['New', 'Open', 'Save', 'Save as', 'Download file', 'Export PDF']);
    await ctx.close();
  });
});

test.describe('file handles and launch screen (File System Access API)', () => {
  test('recent files persist in IndexedDB, auto-reopen when permitted, prompt otherwise, draft takes precedence', async ({ page }) => {
    await page.addInitScript(opfsSavePicker('test.ftree') + `
      if (localStorage.getItem('mockPrompt')) {
        FileSystemFileHandle.prototype.queryPermission = async () => 'prompt';
        FileSystemFileHandle.prototype.requestPermission = async () => { window.__asked = true; return 'granted'; };
      }`);
    await openApp(page);
    await expect(page.locator('#w-recent .none')).toHaveCount(1);
    await expect(page.locator('#w-continue')).toBeHidden();
    await page.click('#w-new');
    await firstPerson(page, 'Persisted');
    await page.keyboard.press('Meta+s');
    await expect(page.locator('#filename')).toHaveText('test.ftree');
    await expect(page.locator('#filename')).not.toHaveClass(/dirty/);
    await page.waitForTimeout(600);
    await page.reload();
    await expect(cardOf(page, 'Persisted')).toBeVisible();
    await expect(page.locator('#welcome.show')).toHaveCount(0);

    await page.evaluate(() => localStorage.setItem('mockPrompt', '1'));
    await page.reload();
    await expect(page.locator('#w-recent .recent .nm')).toHaveText(['test.ftree']);
    await page.click('#w-recent .recent');
    await expect(cardOf(page, 'Persisted')).toBeVisible();
    expect(await page.evaluate(() => window.__asked)).toBe(true);

    await addRelative(page, 'Persisted', 'c', 'Unsaved Kid');
    await page.evaluate(() => { FileSystemFileHandle.prototype.createWritable = async () => { throw new Error('offline'); }; });
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.locator('#w-continue')).toBeVisible();
    await page.click('#w-continue');
    await expect(cards(page)).toHaveCount(2);
  });

  test('autosave writes to the open file after the first manual save', async ({ page }) => {
    await page.addInitScript(opfsSavePicker('auto.ftree'));
    await newTree(page);
    await firstPerson(page, 'FS One');
    await page.waitForTimeout(1500);
    await expect(page.locator('#filename')).toHaveClass(/dirty/);
    await page.keyboard.press('Meta+s');
    const size = () => page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('auto.ftree')).getFile()).size);
    const s1 = await size();
    await addRelative(page, null, 'c', 'FS Kid');
    await expect.poll(size, { timeout: 5000 }).toBeGreaterThan(s1);
    await expect(page.locator('#filename')).not.toHaveClass(/dirty/);
  });
});

test.describe('PDF export', () => {
  test('opens a print page sized to the tree without controls', async ({ page, context }) => {
    await newTree(page);
    await firstPerson(page, 'Anna');
    await addRelative(page, null, 'c', 'Kid');
    const [popup] = await Promise.all([context.waitForEvent('page'), page.click('[data-act=pdf]')]);
    await popup.waitForLoadState();
    await expect(popup.locator('.card')).toHaveCount(2);
    await expect(popup.locator('.plus').first()).toBeHidden();
    const css = await popup.evaluate(() => document.querySelector('style:last-of-type').textContent);
    expect(css).toMatch(/@page \{ size: [\d.]+mm [\d.]+mm/);
  });
});
