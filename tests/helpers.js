import { expect } from '@playwright/test';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function openApp(page, { lang = 'en', noFS = false, draft = null } = {}) {
  if (noFS) await page.addInitScript(() => { delete window.showSaveFilePicker; });
  await page.goto('/');
  await page.evaluate(({ lang, draft }) => {
    localStorage.clear();
    localStorage.setItem('familytree.lang', lang);
    if (draft) localStorage.setItem('familytree.draft', JSON.stringify(draft));
    indexedDB.deleteDatabase('familytree');
  }, { lang, draft });
  await page.reload();
  await page.waitForSelector('#welcome.show');
}

export async function newTree(page, opts) {
  await openApp(page, opts);
  await page.click('#w-new');
  await expect(page.locator('#welcome.show')).toHaveCount(0);
}

export const cardOf = (page, name) =>
  page.locator('.card:not(.leave)').filter({ has: page.locator('.name .nm', { hasText: new RegExp('^' + escapeRe(name) + '$') }) }).first();

export const cards = (page) => page.locator('.card:not(.leave)');

export async function deselect(page) {
  await page.mouse.click(5, 450);
}

export async function select(page, name) {
  await deselect(page);
  await cardOf(page, name).click();
  await expect(cardOf(page, name)).toHaveClass(/selected/);
}

export async function finishEditing(page) {
  await page.keyboard.press('Enter');
  await expect(page.locator('.card.editing')).toHaveCount(0);
}

export async function firstPerson(page, name, birth) {
  await page.click('#empty');
  await page.keyboard.type(name);
  if (birth) await page.fill('.card.editing .f-birth', birth);
  await finishEditing(page);
}

export async function addRelative(page, who, key, name, birth) {
  if (who) await select(page, who);
  await page.keyboard.press(key);
  await expect(page.locator('.card.editing')).toHaveCount(1);
  await page.keyboard.type(name);
  if (birth) await page.fill('.card.editing .f-birth', birth);
  await finishEditing(page);
  await page.waitForTimeout(80);
}

export async function settle(page) {
  await page.keyboard.press('f');
  await page.waitForTimeout(500);
}

export async function positions(page) {
  await settle(page);
  return page.evaluate(() => [...document.querySelectorAll('.card:not(.leave)')]
    .map(c => ({ name: c.querySelector('.name .nm').textContent.trim(), x: Math.round(parseFloat(c.style.left)), y: Math.round(parseFloat(c.style.top)) }))
    .sort((a, b) => a.y - b.y || a.x - b.x));
}

export function rows(pos) {
  const out = new Map();
  for (const p of pos) out.set(p.y, [...(out.get(p.y) || []), p.name]);
  return [...out.values()];
}

export async function overlapCount(page) {
  return page.evaluate(() => {
    const r = [...document.querySelectorAll('.card:not(.leave)')].map(c => c.getBoundingClientRect());
    let n = 0;
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      if (r[i].left < r[j].right - 2 && r[j].left < r[i].right - 2 && r[i].top < r[j].bottom - 2 && r[j].top < r[i].bottom - 2) n++;
    }
    return n;
  });
}

export async function draftState(page) {
  await page.waitForTimeout(500);
  return page.evaluate(() => JSON.parse(localStorage.getItem('familytree.draft')).state);
}

export function familiesByName(state) {
  const name = (id) => state.people[id]?.name;
  return Object.values(state.families).map(f => ({ parents: f.parents.map(name), children: f.children.map(name), status: f.status, married: f.married, ended: f.ended }));
}

export async function libraryEntries(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const q = indexedDB.open('familytree');
    q.onsuccess = () => {
      const g = q.result.transaction('library').objectStore('library').getAll();
      g.onsuccess = () => resolve(g.result.map(x => ({ id: x.id, name: x.name, bytes: x.data.byteLength })));
    };
  }));
}

export function attachConsoleGuard(page, errors) {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
}

export const PHOTO = new URL('./fixtures/photo.png', import.meta.url).pathname;
