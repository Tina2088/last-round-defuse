import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.QA_URL ?? 'http://127.0.0.1:5173/last-round-defuse/';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; const checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
async function check(name, fn) { await fn(); checks.push(name); console.log(`PASS ${name}`); }
const state = () => page.evaluate(() => { const g = window.__qa.game; return { x: g.player.x, z: g.player.z, y: g.player.y, crouch: g.player.crouch, ammo: g.player.ammo, hp: g.player.hp, weapon: g.player.weapon, paused: g.paused, timer: g.timer, round: g.round, bomb: g.bomb, phase: g.phase, progress: g.player.progress }; });
async function setupAttack() {
  await page.evaluate(() => { const q = window.__qa; const g = q.game; g.round = 1; g.resetRound(); g.player.x = -17; g.player.z = -13; g.actors.slice(1).forEach(a => { a.x = -8; a.z = 7; }); q.view.reset(g); });
}
try {
  await page.goto(base); await page.waitForSelector('#play'); await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/01-start-zh.png' });
  await check('start screen, bilingual menus, all team sizes and difficulty', async () => {
    assert.match(await page.locator('h1').innerText(), /守住/);
    assert.equal(await page.locator('#size option').count(), 3); assert.equal(await page.locator('#difficulty option').count(), 2);
    await page.click('#language'); assert.equal(await page.locator('h1').innerText(), 'Hold the final second.');
    await page.screenshot({ path: 'test-results/02-start-en.png' });
    await page.selectOption('#size', '1'); await page.selectOption('#difficulty', 'easy');
  });
  await check('real pointer lock and first person render', async () => {
    await page.click('#play'); await page.waitForFunction(() => !!document.pointerLockElement && !window.__qa.game.paused);
    await page.waitForTimeout(150); await page.screenshot({ path: 'test-results/03-first-person.png' });
  });
  await check('WASD, walking speed, jump and crouch', async () => {
    const a = await state(); await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW'); const b = await state(); assert.ok(b.z < a.z - 1);
    await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft'); const c = await state(); assert.ok(b.z - c.z < a.z - b.z);
    await page.keyboard.down('Space'); await page.waitForTimeout(150); assert.ok((await state()).y > 0.3); await page.keyboard.up('Space'); await page.waitForTimeout(650); assert.equal((await state()).y, 0);
    await page.keyboard.down('ControlLeft'); await page.waitForTimeout(100); assert.equal((await state()).crouch, true); await page.keyboard.up('ControlLeft');
  });
  await check('mouse aim, firing, reload and all three weapons', async () => {
    const yaw = await page.evaluate(() => window.__qa.game.player.yaw); await page.mouse.move(500, 450); await page.mouse.move(620, 440); assert.notEqual(await page.evaluate(() => window.__qa.game.player.yaw), yaw);
    await page.mouse.down(); await page.waitForTimeout(300); await page.mouse.up(); assert.ok((await state()).ammo[0] < 30);
    await page.keyboard.press('KeyR'); await page.waitForTimeout(2200); assert.equal((await state()).ammo[0], 30);
    await page.keyboard.press('Digit2'); assert.equal((await state()).weapon, 1); await page.keyboard.press('Digit3'); assert.equal((await state()).weapon, 2); await page.keyboard.press('Digit1'); assert.equal((await state()).weapon, 0);
  });
  await check('rendered raycast headshots and solid-wall shot occlusion', async () => {
    await page.evaluate(() => { const q = window.__qa; const g = q.game; g.resetRound(); Object.assign(g.player, { x: 0, z: 10, yaw: 0 }); Object.assign(g.actors[1], { x: 0, z: 0, reaction: -100 }); q.setPitch(0); q.view.reset(g); });
    await page.waitForTimeout(150); await page.mouse.down(); await page.waitForTimeout(30); await page.mouse.up();
    assert.equal(await page.evaluate(() => window.__qa.game.actors[1].hp), 44);
    await page.evaluate(() => { const g = window.__qa.game; Object.assign(g.player, { x: -18, z: 5, yaw: 0 }); Object.assign(g.actors[1], { x: -18, z: -5, reaction: -100 }); });
    await page.waitForTimeout(200); await page.mouse.down(); await page.waitForTimeout(30); await page.mouse.up(); assert.equal(await page.evaluate(() => window.__qa.game.actors[1].hp), 44);
  });
  await check('E plant progress, release reset, planted timer HUD', async () => {
    await setupAttack(); await page.keyboard.down('KeyE'); await page.waitForTimeout(1000); assert.ok((await state()).progress > 0.5); await page.keyboard.up('KeyE'); assert.equal((await state()).progress, 0);
    await page.keyboard.down('KeyE'); await page.waitForTimeout(3200); await page.keyboard.up('KeyE'); assert.ok((await state()).bomb); assert.match(await page.locator('#clock-label').innerText(), /Charge planted/);
    await page.screenshot({ path: 'test-results/04-planted.png' });
  });
  await check('Escape freezes game, releases pointer, language changes HUD', async () => {
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.pointerLockElement && window.__qa.game.paused);
    const before = (await state()).bomb.timer; await page.waitForTimeout(400); assert.equal((await state()).bomb.timer, before);
    await page.click('#language'); await page.waitForTimeout(100); assert.match(await page.locator('#clock-label').innerText(), /炸弹已部署/); await page.screenshot({ path: 'test-results/05-pause-zh.png' });
    await page.click('#play'); await page.waitForFunction(() => !!document.pointerLockElement && !window.__qa.game.paused);
  });
  await check('death spectating, postplant elimination invariant, explosion and reset', async () => {
    await page.evaluate(() => { const g = window.__qa.game; g.damage(g.player, g.actors[1], 100); }); await page.waitForFunction(() => document.getElementById('spectator').textContent.includes('等待下一回合'));
    assert.equal((await state()).phase, 'live'); assert.match(await page.locator('#spectator').innerText(), /等待下一回合/);
    await page.screenshot({ path: 'test-results/06-spectator.png' });
    await page.evaluate(() => { window.__qa.game.bomb.timer = 0.08; }); await page.waitForTimeout(200); assert.equal((await state()).phase, 'between');
    await page.screenshot({ path: 'test-results/07-round-end.png' }); await page.waitForTimeout(4100); const s = await state(); assert.equal(s.round, 2); assert.equal(s.hp, 100); assert.equal(s.bomb, null); assert.deepEqual(s.ammo, [30, 12, 0]);
  });
  await check('real E defuse finishes in five seconds', async () => {
    await page.evaluate(() => { const q = window.__qa; const g = q.game; g.round = 5; g.resetRound(); g.player.x = 17; g.player.z = -13; g.bomb = { x: 17, z: -13, site: 'B', timer: 40 }; g.actors.slice(1).forEach(a => { a.x = -8; a.z = 7; }); q.view.reset(g); });
    await page.waitForTimeout(150); await page.keyboard.down('KeyE'); await page.waitForTimeout(4600); assert.equal((await state()).phase, 'live'); assert.ok((await state()).progress > 4); await page.waitForTimeout(700); await page.keyboard.up('KeyE'); assert.equal((await state()).phase, 'between'); assert.match(await page.locator('#round-result').innerText(), /拆除成功/);
  });
  await check('timeout, preplant elimination, half switch and match end', async () => {
    await page.evaluate(() => { const q = window.__qa; const g = q.game; g.round = 4; g.resetRound(); g.timer = 0.1; q.view.reset(g); }); await page.waitForTimeout(250); assert.match(await page.locator('#round-result').innerText(), /回合超时/); await page.waitForTimeout(4100); assert.equal((await state()).round, 5);
    await page.evaluate(() => { const g = window.__qa.game; g.score = [4, 0]; g.damage(g.actors[1], g.player, 100); }); await page.waitForTimeout(150); assert.equal((await state()).phase, 'finished'); assert.match(await page.locator('h1').innerText(), /比赛胜利/); assert.equal(await page.evaluate(() => !!document.pointerLockElement), false);
    await page.screenshot({ path: 'test-results/08-match-end.png' });
    await page.keyboard.press('KeyR'); await page.waitForFunction(() => document.pointerLockElement && window.__qa.game.round === 1); assert.equal((await state()).hp, 100);
  });
  await check('tab visibility automatically pauses', async () => {
    // Headless tabs do not synthesize OS visibility; emit the browser lifecycle event deterministically.
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal((await state()).paused, true); await page.evaluate(() => { delete document.hidden; });
  });
  assert.deepEqual(errors, [], 'browser must have no JavaScript or resource errors');
  await writeFile('test-results/browser-qa.json', JSON.stringify({ base, checks, errors }, null, 2));
} finally { await browser.close(); }
