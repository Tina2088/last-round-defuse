import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.QA_URL ?? 'https://tina2088.github.io/last-round-defuse/';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
try {
  const response = await page.goto(url);
  assert.equal(response.status(), 200); await page.waitForSelector('#play');
  assert.equal(await page.evaluate(() => typeof window.__qa), 'undefined');
  await page.screenshot({ path: 'test-results/public-start.png' });
  await page.selectOption('#size', '3'); await page.selectOption('#difficulty', 'easy');
  await page.click('#play'); await page.waitForFunction(() => !!document.pointerLockElement);
  await page.waitForTimeout(200); assert.equal(await page.locator('#weapon b').innerText(), '30 / 90');
  await page.mouse.down(); await page.waitForTimeout(300); await page.mouse.up();
  assert.notEqual(await page.locator('#weapon b').innerText(), '30 / 90');
  await page.keyboard.press('Digit2'); await page.waitForTimeout(100); assert.match(await page.locator('#weapon small').innerText(), /手枪/);
  await page.keyboard.press('Digit3'); await page.waitForTimeout(100); assert.match(await page.locator('#weapon small').innerText(), /刀/);
  await page.keyboard.press('Digit1'); await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
  await page.screenshot({ path: 'test-results/public-gameplay.png' });
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.pointerLockElement);
  assert.match(await page.locator('h1').innerText(), /作战暂停/);
  const before = await page.locator('#clock').innerText(); await page.waitForTimeout(1100); assert.equal(await page.locator('#clock').innerText(), before);
  await page.click('#language'); assert.equal(await page.locator('h1').innerText(), 'Operation paused');
  await page.screenshot({ path: 'test-results/public-pause-en.png' });
  assert.deepEqual(errors, []);
  const result = { url, status: response.status(), testedAt: new Date().toISOString(), version: 'v0.1.0', checks: ['production WebGL render', 'no development state hook', 'real pointer lock', '3v3 start', 'fire and weapon switch', 'move', 'Escape and frozen clock', 'Chinese/English'], errors };
  await writeFile('test-results/public-smoke.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
