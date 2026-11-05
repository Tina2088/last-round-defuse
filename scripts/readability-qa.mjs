import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// Controlled development-only scenes for repeatable visual review, not production hooks.
const base = process.env.QA_URL ?? 'http://127.0.0.1:5173/last-round-defuse/';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = []; const checks = [];
page.on('pageerror', e => errors.push(e.message));
try {
  for (const [width, height] of [[1440, 900], [1280, 720], [960, 540]]) {
    await page.setViewportSize({ width, height });
    await page.goto(base); await page.waitForSelector('#play');
    for (const language of ['zh', 'en']) {
      if (await page.evaluate(() => document.documentElement.lang) !== (language === 'zh' ? 'zh-CN' : 'en')) await page.click('#language');
      // Enlarged footnotes must remain reachable on short desktop windows.
      await page.locator('.desktop').scrollIntoViewIfNeeded();
      const bounds = await page.locator('.desktop').boundingBox();
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= height + 1);
      await page.screenshot({ path: `test-results/readability-menu-${width}-${language}.png` });
      checks.push(`${width}x${height} ${language} menu footer reachable`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.click('#play'); await page.waitForFunction(() => !!document.pointerLockElement);
  await page.evaluate(() => {
    const g = window.__qa.game;
    g.actors.slice(1).forEach(a => { a.reaction = -100; });
    g.events.push({ type: 'kill', killer: 0, victim: 2, head: true });
  });
  await page.waitForFunction(() => !!document.getElementById('feed').textContent);
  await page.screenshot({ path: 'test-results/readability-hud-en.png' });
  await page.keyboard.press('KeyL');
  await page.waitForFunction(() => document.getElementById('feed').textContent.includes('爆头'));
  await page.screenshot({ path: 'test-results/readability-hud-zh.png' });
  checks.push('active kill feed and HUD translate in place');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.pointerLockElement && window.__qa.game.paused);
  await page.addStyleTag({ content: '#menu,#hud,#brand,#top-actions{display:none!important}' });
  await page.evaluate(() => {
    const q = window.__qa;
    q.game.paused = true;
    for (const id of ['menu', 'hud', 'brand', 'top-actions']) document.getElementById(id).hidden = true;
    q.view.gun.visible = false;
    // Front view of both factions using the actual round models and scene lighting.
    q.view.render = () => {
      q.view.models.forEach((m, id) => { m.visible = id === 0 || id === 2; });
      const attack = q.view.models.get(0), defend = q.view.models.get(2);
      attack.position.set(-0.8, 0, 14); defend.position.set(0.8, 0, 14);
      attack.rotation.y = 0; defend.rotation.y = 0;
      q.view.camera.position.set(0, 1.65, 10.5); q.view.camera.lookAt(0, 1, 14);
      q.view.renderer.render(q.view.scene, q.view.camera);
    };
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/readability-models.png' });
  for (const [site, x] of [['A', -17], ['B', 17]]) {
    await page.evaluate(x => {
      const v = window.__qa.view;
      v.render = () => {
        v.models.forEach(m => { m.visible = false; });
        // Approach at standing eye height, 20 m from each site's centre; retain occlusion.
        v.camera.position.set(x > 0 ? 24 : -24, 1.65, 5.73); v.camera.lookAt(x, 0, -13);
        v.renderer.render(v.scene, v.camera);
      };
    }, x);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `test-results/readability-site-${site}-20m.png` });
  }
  assert.deepEqual(errors, []);
  await writeFile('test-results/readability-qa.json', JSON.stringify({ base, testedAt: new Date().toISOString(), checks, visualReview: ['readability-models.png', 'readability-site-A-20m.png', 'readability-site-B-20m.png', 'readability-hud-en.png', 'readability-hud-zh.png'], errors }, null, 2));
  console.log('PASS responsive bilingual menus and live kill-feed translation; visual review screenshots saved');
} finally { await browser.close(); }
