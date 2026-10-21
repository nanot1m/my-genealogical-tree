import { test, expect } from '@playwright/test';
import { newTree, firstPerson, cardOf, draftState, PHOTO } from './helpers.js';

test.describe('card fields', () => {
  test('name, birth surname, dates, living toggle and age', async ({ page }) => {
    await newTree(page);
    await page.click('#empty');
    await page.keyboard.type('Mary Smith');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Jones');
    await page.fill('#sh-birth', '1950-03-04');
    await page.keyboard.press('Enter');
    await expect(cardOf(page, 'Mary Smith').locator('.name')).toContainText('née Jones');
    await expect(cardOf(page, 'Mary Smith').locator('.dates')).toContainText('b. Mar 4, 1950');
    await expect(cardOf(page, 'Mary Smith').locator('.dates')).toContainText(/\d+ y/);
    await cardOf(page, 'Mary Smith').dblclick();
    await page.locator('#sh-alive').uncheck();
    await page.fill('#sh-death', '2020-01-01');
    await page.keyboard.press('Enter');
    await expect(cardOf(page, 'Mary Smith').locator('.dates')).toContainText('Mar 4, 1950 – Jan 1, 2020 (69)');
  });

  test('Tab cycles fields, Escape finishes, edits are a single undo step', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'Anna');
    await cardOf(page, 'Anna').dblclick();
    await expect(page.locator('#sh-name')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#sh-bname')).toBeFocused();
    await page.keyboard.type('Birth');
    await page.keyboard.press('Escape');
    await expect(cardOf(page, 'Anna').locator('.nee')).toHaveText('née Birth');
    await page.keyboard.press('Meta+z');
    await expect(cardOf(page, 'Anna').locator('.nee')).toHaveCount(0);
  });
});

test.describe('photos and cropper', () => {
  test('upload opens the cropper, zoom and drag, apply stores source and crop, re-crop and remove', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'Anna');
    await cardOf(page, 'Anna').locator('.photo').click();
    await page.locator('#photoInput').setInputFiles(PHOTO);
    await expect(page.locator('#crop.show')).toBeVisible();
    await page.locator('#crop-zoom').fill('500');
    await page.mouse.move(700, 400); await page.mouse.down(); await page.mouse.move(740, 420, { steps: 3 }); await page.mouse.up();
    await page.click('#crop-ok');
    await expect(cardOf(page, 'Anna').locator('.photo img')).toHaveCount(1);
    const p = Object.values((await draftState(page)).people)[0];
    expect(p.photo.startsWith('data:image/jpeg')).toBe(true);
    expect(p.photoSrc.length).toBeGreaterThan(1000);
    expect(p.crop.s).toBeGreaterThan(0);
    await cardOf(page, 'Anna').locator('.photo').click();
    await expect(page.locator('#menu button')).toHaveText(['Adjust crop', 'Change photo', 'Remove photo']);
    await page.locator('#menu button').first().click();
    await expect(page.locator('#crop.show')).toBeVisible();
    await expect(page.locator('#crop-zoom')).toHaveValue('500');
    await page.keyboard.press('Escape');
    await cardOf(page, 'Anna').locator('.photo').click();
    await page.locator('#menu button').last().click();
    await expect(cardOf(page, 'Anna').locator('.photo img')).toHaveCount(0);
  });

  test('rotation: quarter turns, straighten slider, angle persists', async ({ page }) => {
    await newTree(page);
    await firstPerson(page, 'Rot');
    await cardOf(page, 'Rot').locator('.photo').click();
    await page.locator('#photoInput').setInputFiles(PHOTO);
    await expect(page.locator('#crop.show')).toBeVisible();
    const hash = () => page.evaluate(() => { const c = document.getElementById('crop-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 4 * 97) h = (h * 31 + d[i] + d[i + 1] + d[i + 2]) >>> 0; return h; });
    const h0 = await hash();
    await page.click('#crop-rr');
    await expect(page.locator('#crop-deg')).toHaveText('90°');
    expect(await hash()).not.toBe(h0);
    await page.locator('#crop-angle').fill('15');
    await expect(page.locator('#crop-deg')).toHaveText('105°');
    await page.click('#crop-ok');
    const crop = Object.values((await draftState(page)).people)[0].crop;
    expect(crop.rot).toBe(105);
    await cardOf(page, 'Rot').locator('.photo').click();
    await page.locator('#menu button').first().click();
    await expect(page.locator('#crop-deg')).toHaveText('105°');
    await expect(page.locator('#crop-angle')).toHaveValue('15');
  });
});

test('desktop editor pops up next to the edited card and follows it', async ({ page }) => {
  await newTree(page);
  await page.click('#empty');
  await page.keyboard.type('Mary'); await page.keyboard.press('Enter');
  await cardOf(page, 'Mary').dblclick();
  const box = page.locator('#sheet .sheet');
  await expect(box).toBeVisible();
  const near = async () => {
    const c = await cardOf(page, 'Mary').boundingBox(), b = await box.boundingBox();
    return Math.abs(b.x - (c.x + c.width)) < 40 || Math.abs(b.x + b.width - c.x) < 40;
  };
  await expect.poll(near).toBe(true);
  await page.mouse.move(700, 450); await page.mouse.wheel(-200, 0);
  await expect.poll(near).toBe(true);
});
