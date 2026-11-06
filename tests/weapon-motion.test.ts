import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, weapons } from '../src/game.ts';
import { WeaponMotion } from '../src/weapon-motion.ts';

test('switch during reload cannot refill either weapon or consume reserve later', () => {
  const g = new Game(1); const p = g.player; p.ammo[0] = 9;
  g.reload(p); g.step(1, false, false); g.switch(p, 1); g.switch(p, 0);
  g.step(2, false, false); assert.equal(p.ammo[0], 9); assert.equal(p.reserve[0], 90); assert.equal(p.ammo[1], 12);
  g.reload(p); g.step(weapons[0].reload, false, false); assert.equal(p.ammo[0], 30); assert.equal(p.reserve[0], 69);
});
test('death and round end cancel reload; reset restores equipment', () => {
  for (const death of [true, false]) {
    const g = new Game(2); g.player.ammo[0] = 3; g.reload(g.player);
    if (death) g.damage(g.player,g.actors[2],100); else g.end('attack','elimination');
    assert.equal(g.player.reload,0); assert.equal(g.player.ammo[0],3);
    g.resetRound(); assert.equal(g.player.reload,0); assert.equal(g.player.ammo[0],30);
  }
});
test('visual reload interruption restores magazine and clears fire on switch/reset', () => {
  const m = new WeaponMotion(); m.fire();
  assert.ok(m.step(0,1.2,2.4).magazine > .99);
  m.switch(); const switched = m.step(0,0,2.4);
  assert.equal(switched.magazine,0); assert.equal(switched.reload,0); assert.equal(switched.recoil,0);
  assert.equal(m.step(.22,0,2.4).switch,0);
  m.fire(); m.reset(); assert.deepEqual(m.step(0,0,2.4),{recoil:0,switch:0,reload:0,magazine:0});
});
