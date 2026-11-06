import { chromium } from '@playwright/test';
import { writeFile, readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const label = process.argv[2] ?? 'weapons';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:5173/last-round-defuse/');
  await page.waitForFunction(() => !!window.__qa);
  await page.evaluate(async () => { const q = window.__qa; if (q.view.assetsReady) await q.view.assetsReady; });
  await page.click('#play'); await page.waitForFunction(() => !!document.pointerLockElement);
  await page.evaluate(() => { window.__qa.game.paused = true; });
  const samples = [];
  for (let run = 0; run < 3; run++) samples.push(await page.evaluate(() => new Promise(resolve => {
    let count = 0, start = 0; const intervals = []; let last = 0;
    function tick(t) { if (!start) start = t; if (last) intervals.push(t - last); last = t;
      if (++count < 181) requestAnimationFrame(tick); else { intervals.sort((a,b) => a-b); resolve({ fps: 180000 / (t-start), p95Ms: intervals[Math.floor(intervals.length*.95)], render: window.__qa.view.renderer.info.render }); }
    } requestAnimationFrame(tick);
  })));
  const files = [];
  async function scan(dir) { for (const e of await readdir(dir, { withFileTypes: true })) { const p = `${dir}/${e.name}`; if(e.isDirectory()) await scan(p); else { const b = await readFile(p); files.push({ path:p, bytes:b.length, gzipBytes:gzipSync(b).length }); } } }
  await scan('dist');
  const gpu = await page.evaluate(() => { const gl = window.__qa.view.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
  const result = { label, testedAt: new Date().toISOString(), viewport:'1440x900 DPR1', method:'Chrome headless; stationary spawn; paused AI; 3 x 180 rAF intervals; same renderer settings', gpu, samples, files, totalBytes:files.reduce((s,f)=>s+f.bytes,0), gzipBytes:files.reduce((s,f)=>s+f.gzipBytes,0) };
  await writeFile(`docs/qa/benchmark-${label}.json`, JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2));
} finally { await browser.close(); }
