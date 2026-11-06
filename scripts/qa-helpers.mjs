// Wait for actual renderer progress after changing a controlled development scene.
export async function rendered(page) {
  const frame = await page.evaluate(() => window.__qa.view.renderer.info.render.frame);
  await page.waitForFunction(frame => window.__qa.view.renderer.info.render.frame > frame, frame);
}

// Observe every animation frame, rather than sleeping and sampling only the end.
// This also works on production pages without exposing development state.
export async function frozenClock(page) {
  const stable = await page.evaluate(() => new Promise(resolve => {
    const clock = document.getElementById('clock');
    const before = clock.textContent;
    let frames = 0;
    function observe() {
      if (document.pointerLockElement || clock.textContent !== before) return resolve(false);
      if (++frames >= 90) return resolve(true);
      requestAnimationFrame(observe);
    }
    requestAnimationFrame(observe);
  }));
  if (!stable) throw new Error('Paused clock or pointer lock changed during rendered frames');
}
