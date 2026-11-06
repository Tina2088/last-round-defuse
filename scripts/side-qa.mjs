import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { rendered } from './qa-helpers.mjs';

const url = process.env.QA_URL ?? 'http://127.0.0.1:5173/last-round-defuse/';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(30_000);
const checks = []; const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
async function verifySide(side) {
  await page.waitForFunction(side => document.getElementById('our-side').className === side, side);
  const state = await page.evaluate(() => {
    const { game: g, view } = window.__qa;
    const ally = g.actors[1];
    const ctx = document.getElementById('minimap').getContext('2d');
    const pixel = Array.from(ctx.getImageData(Math.round((ally.x + 28) * 170 / 56), Math.round((ally.z + 28) * 170 / 56), 1, 1).data).slice(0, 3);
    return { side: g.side(0), z: g.player.z, yaw: g.player.yaw, color: view.models.get(ally.id).children[0].material.color.getHex(), pixel, score: g.score };
  });
  assert.equal(state.side, side); assert.equal(state.z, side === 'attack' ? 23 : -23);
  assert.equal(state.yaw, side === 'attack' ? 0 : Math.PI);
  assert.equal(state.color, side === 'attack' ? 0xf49b4b : 0x47ccd2);
  assert.deepEqual(state.pixel, side === 'attack' ? [244, 155, 75] : [71, 204, 210]);
  return state;
}
try {
  for (const side of ['defend', 'attack']) {
    await page.goto(url); await page.waitForSelector('#play');
    await page.evaluate(() => window.__qa.view.assetsReady);
    assert.equal(await page.locator('#side-defend').isChecked(), true);
    await page.check(`#side-${side}`); await page.click('#language');
    assert.equal(await page.locator(`#side-${side}`).isChecked(), true);
    assert.match(await page.locator('.side-picker').innerText(), /Starting side|开局阵营/);
    await page.click('#sound'); assert.equal(await page.locator(`#side-${side}`).isChecked(), true);
    await page.screenshot({ path: `test-results/side-menu-${side}.png` });
    await page.click('#play'); await page.waitForFunction(() => !!document.pointerLockElement);
    await page.evaluate(() => { window.__qa.game.actors.slice(1).forEach(a => a.reaction = -1000); });
    await verifySide(side); checks.push(`${side}: bilingual selection, spawn, yaw, HUD, ally model and minimap color`);
    await page.screenshot({ path: `test-results/side-hud-${side}.png` });
    if (side === 'defend') {
      await page.evaluate(() => {
        const g = window.__qa.game;
        g.actors.slice(1).forEach(a => { a.x = -8; a.z = 7; });
        const attacker = g.actors.find(a => g.side(a.team) === 'attack');
        Object.assign(attacker, { x: 17, z: -13 }); g.interact(attacker, true, 3);
        Object.assign(attacker, { x: -8, z: 7 });
        Object.assign(g.player, { x: 17, z: -13 });
      });
      await page.keyboard.down('KeyE');
      await page.waitForFunction(() => window.__qa.game.result?.reason === 'defused');
      await page.keyboard.up('KeyE');
      assert.deepEqual(await page.evaluate(() => window.__qa.game.score), [1, 0]);
      checks.push('defender round 1: attacker plants, real held E defuses and scores for team 0');
    }
    await page.evaluate(() => {
      const g = window.__qa.game; g.round = 4; g.score = [2, 1]; g.resetRound();
      g.end(g.side(0), 'elimination'); g.between = 0;
    });
    await page.waitForFunction(() => window.__qa.game.round === 5);
    await page.evaluate(() => { window.__qa.game.actors.slice(1).forEach(a => a.reaction = -1000); });
    const state = await verifySide(side === 'attack' ? 'defend' : 'attack');
    assert.deepEqual(state.score, [3, 1]); checks.push(`${side}: actual 4→5 transition, colors and score retained`);
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.pointerLockElement);
    await page.click('#restart'); await page.waitForFunction(() => !!document.pointerLockElement && window.__qa.game.round === 1);
    await verifySide(side); checks.push(`${side}: UI restart retains starting side`);
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.pointerLockElement);
  }
  await page.goto(url); await page.waitForSelector('#play');
  await page.setViewportSize({ width: 960, height: 540 });
  await page.locator('#side-attack').scrollIntoViewIfNeeded(); await rendered(page);
  await page.screenshot({ path: 'test-results/side-menu-960.png' });
  const bounds = await page.locator('.side-picker').boundingBox();
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 540);
  checks.push('960×540 side selection accessible'); assert.deepEqual(errors, []);
  const result = { testedAt: new Date().toISOString(), url, checks, errors };
  await writeFile('docs/qa/side-qa.json', JSON.stringify(result, null, 2)); console.log(result);
} finally { await browser.close(); }
