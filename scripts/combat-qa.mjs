import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { rendered, frozenClock } from './qa-helpers.mjs';

const base = process.env.QA_URL ?? 'http://127.0.0.1:5173/last-round-defuse/';
await mkdir('docs/qa', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [], errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
const check = async (name, fn) => { await fn(); checks.push(name); console.log(`PASS ${name}`); };
try {
  const qaUrl = new URL(base); qaUrl.searchParams.set('qa', '1');
  await page.goto(qaUrl.href); await page.waitForFunction(() => !!window.__qa); await rendered(page);
  await check('v0.1.2.2 title, brand and opt-in HP API', async () => {
    assert.equal(await page.locator('#brand small').innerText(), 'v0.1.2.2');
    assert.match(await page.title(), /v0\.1\.2\.2$/);
    assert.deepEqual(await page.evaluate(() => {
      const q = window.__LRD__;
      const snapshot = q.actors(); snapshot[0].hp = -1;
      return { version: q.version, oneShotKill: q.oneShotKill, keys: Object.keys(q).sort(),
        actors: q.actors(), expected: window.__qa.game.actors.map(({id,team,hp,x,z}) => ({id,team,hp,x,z})) };
    }).then(({actors, expected, ...rest}) => { assert.deepEqual(actors, expected); return rest; }),
    { version: 'v0.1.2.2', oneShotKill: true, keys: ['actors', 'oneShotKill', 'version'] });
  });
  await check('default ON; start-menu choice survives language changes and match creation', async () => {
    assert.ok(await page.isChecked('#one-shot'));
    await page.uncheck('#one-shot'); await page.selectOption('#size', '3');
    await page.click('#language'); assert.match(await page.locator('.one-shot-setting').innerText(), /One-shot kill/);
    assert.equal(await page.isChecked('#one-shot'), false);
    await page.screenshot({ path: 'docs/qa/combat-start-en.png' });
    await page.click('#play'); await page.waitForFunction(() => !!document.pointerLockElement);
    assert.equal(await page.evaluate(() => window.__qa.game.oneShotKill), false);
    assert.equal(await page.evaluate(() => window.__LRD__.oneShotKill), false);
    assert.equal(await page.evaluate(() => window.__LRD__.actors().length), 6);
    await page.evaluate(() => { window.__qa.game.bot = () => {}; });
  });
  await check('pause changes toggle immediately; translations, resume and restart retain choice', async () => {
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.pointerLockElement);
    await frozenClock(page); await page.check('#one-shot');
    assert.equal(await page.evaluate(() => window.__qa.game.oneShotKill), true);
    assert.equal(await page.evaluate(() => window.__LRD__.oneShotKill), true);
    await page.click('#language'); assert.ok(await page.isChecked('#one-shot'));
    await page.uncheck('#one-shot'); await page.click('#restart');
    await page.waitForFunction(() => !!document.pointerLockElement);
    assert.equal(await page.evaluate(() => window.__qa.game.oneShotKill), false);
    await page.evaluate(() => { window.__qa.game.bot = () => {}; });
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.pointerLockElement);
    await page.screenshot({ path: 'docs/qa/combat-pause-zh.png' });
    await page.click('#play'); await page.waitForFunction(() => !!document.pointerLockElement);
  });
  await check('same-frame standing/crouched hits, enemy priority through walls/allies, dead exclusion and tracer fallback', async () => {
    const results = await page.evaluate(() => {
      const {game:g,view:v} = window.__qa; const results = [];
      g.resetRound(); g.actors.slice(1).forEach(a => { a.x = 24; a.z = 24; });
      const target = g.actors[3];
      for (const crouch of [false, true]) for (const head of [false, true]) for (const yaw of [0, Math.PI / 2]) {
        Object.assign(g.player, { x: 0, z: 10, yaw: 1, crouch: false, y: 0 });
        Object.assign(target, { x: 3, z: 0, crouch: false, y: 0 });
        v.render(g, 0, true, 0, 0);
        Object.assign(target, { x: 0, z: 0, crouch, yaw });
        g.player.yaw = 0; g.player.y = 0.3;
        const targetY = (head ? 1.52 : 0.95) * (crouch ? 0.7 : 1);
        const hit = v.shoot(g, -Math.atan2(1.95 - targetY, 10));
        results.push({ actor: hit.actor?.id, head: hit.head, expectedHead: head });
      }
      const miss = v.shoot(g, 0.5); results.push({ miss: miss.actor === undefined });
      Object.assign(g.player, { x: -18, z: 5, yaw: 0, y: 0 });
      Object.assign(target, { x: -18, z: -5, crouch: false });
      const wallPitch = -Math.atan2(0.7, 10);
      const wall = v.shoot(g, wallPitch); results.push({ throughWall: wall.actor?.id === target.id });
      target.hp = 0;
      const solid = v.shoot(g, wallPitch);
      const expectedSolid = v.ray.intersectObjects(v.solids, true)[0];
      results.push({ solidFallback: solid.actor === undefined && !!expectedSolid && solid.point.distanceTo(expectedSolid.point) < 1e-6 });
      Object.assign(g.player, { x: 0, z: 10, yaw: 0, y: 0 });
      Object.assign(target, { x: 0, z: 0, hp: 100 });
      Object.assign(g.actors[1], { x: 0, z: 5 });
      Object.assign(g.actors[4], { x: 0, z: -4 });
      results.push({ allyIgnoredAndNearestEnemy: v.shoot(g, -Math.atan2(0.7, 10)).actor?.id === target.id });
      g.actors.filter(a => a.team !== g.player.team).forEach(a => { a.hp = 0; });
      const sky = v.shoot(g, 1.2);
      results.push({ skyFallback: sky.actor === undefined && Math.abs(sky.point.distanceTo(v.camera.position) - 70) < 1e-6 });
      return results;
    });
    for (const hit of results.slice(0, 8)) { assert.equal(hit.actor, 3); assert.equal(hit.head, hit.expectedHead); }
    assert.ok(results[8].miss); assert.ok(results[9].throughWall);
    assert.ok(results[10].solidFallback); assert.ok(results[11].allyIgnoredAndNearestEnemy); assert.ok(results[12].skyFallback);
  });
  for (const difficulty of ['normal', 'easy']) for (const enabled of [false, true]) for (const weapon of [0, 1, 2]) {
    await check(`${difficulty}, toggle ${enabled}, weapon ${weapon}: real center-body hit and hit marker`, async () => {
      await page.evaluate(({ difficulty, enabled, weapon }) => {
        const q = window.__qa, g = q.game; g.difficulty = difficulty; g.oneShotKill = enabled; g.resetRound();
        Object.assign(g.player, { x: 0, z: 2, yaw: 0, weapon });
        g.actors.slice(1).forEach(a => { a.x = 24; a.z = 24; });
        Object.assign(g.actors[3], { x: 0, z: 0 });
        q.setPitch(-Math.atan2(0.7, 2)); q.view.reset(g);
      }, { difficulty, enabled, weapon });
      await rendered(page);
      const initial = difficulty === 'easy' ? 80 : 100;
      if (difficulty === 'normal' && !enabled && weapon === 0) await page.screenshot({ path: 'docs/qa/combat-body-aim.png' });
      await page.mouse.down();
      await page.waitForFunction(hp => window.__qa.game.actors[3].hp < hp, initial);
      await page.mouse.up();
      assert.equal(await page.evaluate(() => window.__qa.game.actors[3].hp), enabled ? 0 : initial - [34, 28, 55][weapon]);
      assert.equal(await page.evaluate(() => window.__LRD__.actors().find(a => a.id === 3).hp), enabled ? 0 : initial - [34, 28, 55][weapon]);
      await page.waitForFunction(() => document.getElementById('hit').style.opacity === '1');
    });
  }
  await check('short bilingual menus keep toggle and play accessible; fresh page defaults ON', async () => {
    await page.reload(); await page.waitForSelector('#one-shot'); assert.ok(await page.isChecked('#one-shot'));
    await page.setViewportSize({ width: 960, height: 540 });
    for (const language of ['zh', 'en']) {
      if ((await page.getAttribute('html', 'lang')).startsWith(language) === false) await page.click('#language');
      await page.locator('#one-shot').scrollIntoViewIfNeeded(); await page.uncheck('#one-shot'); await page.check('#one-shot');
      await page.locator('#play').scrollIntoViewIfNeeded();
      const box = await page.locator('#play').boundingBox(); assert.ok(box.y >= 0 && box.y + box.height <= 540);
      await page.screenshot({ path: `docs/qa/combat-menu-960-${language}.png` });
    }
  });
  assert.deepEqual(errors, []);
  await writeFile('docs/qa/combat-qa.json', JSON.stringify({ base, testedAt: new Date().toISOString(), checks, errors }, null, 2));
} finally { await browser.close(); }
