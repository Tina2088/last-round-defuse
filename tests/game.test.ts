import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EASY_AI, OPENING_FIRE_GRACE, weapons } from '../src/game.ts';
import { sites, move, free, path, visible, distance } from '../src/world.ts';
import { en, zh } from '../src/i18n.ts';

function advance(g: Game, seconds: number, held = false, ai = false) {
  for (let i = 0; i < Math.round(seconds * 100); i++) g.step(0.01, held, ai);
}
function atSite(g: Game) { Object.assign(g.player, sites[0]); }
function plant(g: Game) { atSite(g); advance(g, 3, true); assert.ok(g.bomb); }

test('both starting sides hold rounds 1–4, swap for 5–8, preserve team scores and restart choice', () => {
  for (const startSide of ['attack', 'defend'] as const) for (const size of [1, 2, 3]) {
    const g = new Game(size, 'easy', () => 1, startSide);
    for (let round = 1; round <= 8; round++) {
      const expected = round <= 4 ? startSide : startSide === 'attack' ? 'defend' : 'attack';
      assert.equal(g.round, round); assert.equal(g.side(0), expected);
      for (const a of g.actors) {
        const attack = g.side(a.team) === 'attack';
        assert.equal(a.z, attack ? 23 : -23); assert.equal(a.yaw, attack ? 0 : Math.PI);
      }
      assert.notEqual(g.side(0), g.side(1));
      g.end(g.side((round - 1) % 2), 'elimination');
      assert.deepEqual(g.score, [Math.ceil(round / 2), Math.floor(round / 2)]);
      if (round < 8) advance(g, 4.01);
    }
    assert.equal(g.phase, 'finished'); g.restart();
    assert.equal(g.startSide, startSide); assert.equal(g.side(0), startSide);
    assert.equal(g.elapsed, 0); assert.equal(g.round, 1); assert.deepEqual(g.score, [0, 0]);
  }
});

test('defender start cannot plant and can defuse an attacker plant via held E', () => {
  const g = new Game(1, 'easy', () => 1, 'defend'); atSite(g);
  advance(g, 3, true); assert.equal(g.bomb, null);
  Object.assign(g.actors[1], sites[0]); g.interact(g.actors[1], true, 3);
  assert.ok(g.bomb); assert.equal(g.interaction(g.player), 'defuse');
  advance(g, 4.99, true); assert.equal(g.phase, 'live'); advance(g, 0.01, true);
  assert.equal(g.result?.reason, 'defused'); assert.deepEqual(g.score, [1, 0]);
});

function duel(difficulty: 'easy' | 'normal', rolls: number[]) {
  const g = new Game(1, difficulty, () => rolls.shift() ?? 1);
  g.elapsed = 3; Object.assign(g.player, { x: 0, z: 10 });
  Object.assign(g.actors[1], { x: 0, z: 0 });
  assert.ok(visible(g.player, g.actors[1])); return g;
}

test('all weapons kill with default toggle, use balanced body/head damage when off, never hurt allies', () => {
  assert.deepEqual(weapons.map(w => w.damage), [34, 28, 55]);
  for (const difficulty of ['easy', 'normal'] as const) for (const enabled of [true, false]) for (const weapon of weapons) for (const head of [true, false]) {
    const g = new Game(2, difficulty); assert.equal(g.oneShotKill, true); g.oneShotKill = enabled;
    const enemy = g.actors[2], ally = g.actors[1]; const hp = enemy.hp;
    g.damage(ally, g.player, weapon.damage, head); assert.equal(ally.hp, hp);
    g.damage(enemy, g.player, weapon.damage, head);
    assert.equal(enemy.hp, enabled ? 0 : Math.max(0, hp - weapon.damage * (head ? 2 : 1)));
    g.resetRound(); assert.equal(g.oneShotKill, enabled);
    g.restart(); assert.equal(g.oneShotKill, enabled);
  }
});

test('pause toggle affects the next hit without resetting match; AI damage unaffected in both directions', () => {
  const g = new Game(2); g.oneShotKill = false; const enemy = g.actors[2];
  g.damage(enemy, g.player, 34); assert.equal(enemy.hp, 66);
  g.paused = true; g.oneShotKill = true;
  g.damage(enemy, g.player, 34); assert.equal(enemy.hp, 66);
  g.paused = false; g.damage(enemy, g.player, 34); assert.equal(enemy.hp, 0);
  for (const difficulty of ['easy', 'normal'] as const) for (const enabled of [true, false]) {
    const duelGame = duel(difficulty, [0, 1]); duelGame.oneShotKill = enabled;
    duelGame.bot(duelGame.actors[1], 1); assert.equal(duelGame.player.hp, 72);
    const teamGame = new Game(2, difficulty); teamGame.oneShotKill = enabled;
    const hp = teamGame.actors[2].hp; teamGame.damage(teamGame.actors[2], teamGame.actors[1], 28);
    assert.equal(teamGame.actors[2].hp, hp - 28);
  }
});

test('easy bot health resets to 80 and fire/movement multipliers leave player and normal unchanged', () => {
  for (const difficulty of ['easy', 'normal'] as const) {
    const g = new Game(3, difficulty);
    for (const reset of [() => {}, () => { g.round = 5; g.resetRound(); }, () => g.restart()]) {
      reset(); assert.equal(g.player.hp, 100);
      assert.ok(g.actors.slice(1).every(a => a.hp === (difficulty === 'easy' ? 80 : 100)));
    }
    for (const weapon of [0, 1, 2] as const) {
      const bot = g.actors[1]; bot.weapon = weapon; bot.cooldown = 0;
      assert.ok(g.fire(bot)); assert.equal(bot.cooldown, weapons[weapon].delay * (difficulty === 'easy' ? 1.6 : 1));
      assert.equal(g.fire(bot), false);
      g.step(bot.cooldown - 0.001, false, false); assert.equal(g.fire(bot), false);
      g.step(0.002, false, false); assert.ok(g.fire(bot));
      g.player.weapon = weapon; g.player.cooldown = 0; assert.ok(g.fire(g.player));
      assert.equal(g.player.cooldown, weapons[weapon].delay);
    }
    const bot = g.actors[1]; Object.assign(bot, { x: 0, z: 10, route: [{ x: 0, z: 12 }], routeTimer: 10 });
    g.actors.filter(a => a.team === 1).forEach(a => { a.hp = 0; });
    g.bot(bot, 0.1); assert.ok(Math.abs(bot.z - 10 - 3.4 * 0.1 * (difficulty === 'easy' ? 0.85 : 1)) < 1e-9);
  }
});

test('final easy tuning and normal reaction thresholds govern actual shots', () => {
  assert.deepEqual(EASY_AI, { reaction: 0.9, accuracy: 0.28, headshot: 0.02, fireDelay: 1.6, move: 0.85, hp: 80 });
  assert.equal(OPENING_FIRE_GRACE, 3);
  for (const difficulty of ['easy', 'normal'] as const) {
    const g = duel(difficulty, [1]); const bot = g.actors[1];
    g.bot(bot, difficulty === 'easy' ? 0.9 : 0.45); assert.equal(bot.ammo[0], 30);
    g.bot(bot, 0.001); assert.equal(bot.ammo[0], 29);
  }
});

test('easy hit/headshot boundaries and crouch scaling; normal probabilities unchanged', () => {
  for (const [difficulty, accuracy, headshot] of [['easy', 0.28, 0.02], ['normal', 0.3, 0.08]] as const) {
    for (const crouch of [false, true]) for (const hit of [false, true]) for (const head of [false, true]) {
      const limit = accuracy * (crouch ? 0.7 : 1);
      const g = duel(difficulty, [limit - (hit ? 0.0001 : 0), headshot - (head ? 0.0001 : 0)]);
      g.player.crouch = crouch; g.bot(g.actors[1], 2);
      assert.equal(g.actors[1].ammo[0], 29);
      assert.equal(g.player.hp, !hit ? 100 : head ? 44 : 72);
    }
  }
});

test('opening grace blocks all AI fire until 3s, freezes on pause, only applies to round 1 and renews on restart', () => {
  for (const difficulty of ['easy', 'normal'] as const) for (const startSide of ['attack', 'defend'] as const) {
    const g = new Game(2, difficulty, () => 0, startSide);
    const arrange = () => g.actors.forEach((a, i) => Object.assign(a, { x: i, z: 0, reaction: 10 }));
    arrange(); g.step(2.99); assert.ok(g.actors.every(a => a.ammo[0] === 30 && a.hp === (a.id && difficulty === 'easy' ? 80 : 100)));
    g.paused = true; g.step(10); assert.equal(g.elapsed, 2.99);
    g.paused = false; assert.ok(g.fire(g.player), 'player can shoot during grace');
    g.step(0.01); assert.equal(g.elapsed, 3); assert.ok(g.actors.slice(1).every(a => a.ammo[0] === 29));
    g.round = 2; g.resetRound(); arrange(); g.step(0.01);
    assert.ok(g.actors.slice(1).every(a => a.ammo[0] === 29));
    g.restart(); arrange(); g.step(0.01); assert.ok(g.actors.slice(1).every(a => a.ammo[0] === 30));
  }
});
test('105 second timeout awards defenders', () => { const g = new Game(1); advance(g, 104.99); assert.equal(g.phase, 'live'); advance(g, 0.02); assert.equal(g.result?.reason, 'timeout'); assert.deepEqual(g.score, [0, 1]); });
test('plant requires site and full 3 seconds', () => { const g = new Game(1); advance(g, 3, true); assert.equal(g.bomb, null); atSite(g); advance(g, 2.99, true); assert.equal(g.bomb, null); advance(g, 0.01, true); assert.equal(g.bomb?.timer, 40); });
test('release and damage reset plant progress', () => { const g = new Game(1); atSite(g); advance(g, 1, true); g.step(0.01, false); assert.equal(g.player.progress, 0); advance(g, 1, true); g.damage(g.player, g.actors[1], 10); assert.equal(g.player.progress, 0); g.step(0.01, true); assert.equal(g.player.progress, 0); });
test('leaving site or jumping interrupts plant', () => { const g = new Game(1); atSite(g); advance(g, 1, true); g.player.x = 0; g.step(0.01, true); assert.equal(g.player.progress, 0); atSite(g); g.player.y = 1; advance(g, 4, true); assert.equal(g.bomb, null); });
test('fresh bomb gets 40 seconds and explosion awards attack', () => { const g = new Game(1); plant(g); advance(g, 39.99); assert.equal(g.phase, 'live'); advance(g, 0.02); assert.equal(g.result?.reason, 'explosion'); assert.deepEqual(g.score, [1, 0]); });
test('planted bomb supersedes round timer', () => { const g = new Game(1); g.timer = 4; plant(g); advance(g, 3); assert.equal(g.phase, 'live'); assert.ok(g.bomb!.timer > 36); });
test('attackers eliminated after plant does not end round', () => { const g = new Game(1); plant(g); g.damage(g.player, g.actors[1], 100); assert.equal(g.phase, 'live'); advance(g, 40.01); assert.equal(g.result?.reason, 'explosion'); });
test('defenders eliminated after plant immediately awards attack by elimination, before and after side swap', () => { for (const round of [1, 5]) { const g = new Game(1); g.round = round; g.resetRound(); g.bomb = { ...sites[0], site: 'A', timer: 40 }; const attacker = g.actors.find(a => g.side(a.team) === 'attack')!; const defender = g.actors.find(a => g.side(a.team) === 'defend')!; g.damage(defender, attacker, 100); assert.equal(g.phase, 'between'); assert.deepEqual(g.result, { side: 'attack', reason: 'elimination' }); assert.equal(g.bomb.timer, 40); assert.equal(g.score[attacker.team], 1); g.checkElimination(); assert.equal(g.score[attacker.team], 1); } });
test('5 second defusal, release and damage reset', () => { const g = new Game(1); g.oneShotKill = false; plant(g); const d = g.actors[1]; Object.assign(d, { x: g.bomb!.x, z: g.bomb!.z }); g.interact(d, true, 2); g.interact(d, false, 0.1); assert.equal(d.progress, 0); g.interact(d, true, 2); g.damage(d, g.player, 10); assert.equal(d.progress, 0); d.hurt = false; g.interact(d, true, 4.99); assert.equal(g.phase, 'live'); g.interact(d, true, 0.01); assert.equal(g.result?.reason, 'defused'); assert.deepEqual(g.score, [0, 1]); });
test('defusing outside range is rejected', () => { const g = new Game(1); plant(g); g.interact(g.actors[1], true, 10); assert.equal(g.phase, 'live'); });
test('preplant elimination resolves both sides', () => { for (const victim of [0, 1]) { const g = new Game(1); g.damage(g.actors[victim], g.actors[1 - victim], 100); assert.equal(g.result?.reason, 'elimination'); assert.equal(g.score[1 - victim], 1); } });
test('headshot doubles damage, no friendly fire', () => { const g = new Game(2); g.oneShotKill = false; g.damage(g.actors[2], g.player, 28, true); assert.equal(g.actors[2].hp, 44); g.damage(g.actors[1], g.player, 100); assert.equal(g.actors[1].hp, 100); });
test('fire cooldown, empty magazine, reload and weapon switch', () => { const g = new Game(1); assert.equal(g.fire(g.player), true); assert.equal(g.player.ammo[0], 29); assert.equal(g.fire(g.player), false); g.reload(g.player); assert.equal(g.fire(g.player), false); advance(g, 2.41); assert.equal(g.player.ammo[0], 30); assert.equal(g.player.reserve[0], 89); g.player.ammo[0] = 0; assert.equal(g.fire(g.player), false); g.reload(g.player); g.switch(g.player, 1); assert.equal(g.player.reload, 0); assert.equal(g.player.ammo[1], 12); g.switch(g.player, 2); assert.equal(g.fire(g.player), true); });
test('pause freezes round, bomb, reload, intermission and AI', () => { const g = new Game(2); plant(g); g.player.ammo[0] = 1; g.reload(g.player); g.paused = true; const before = JSON.stringify(g); advance(g, 10, true, true); assert.equal(JSON.stringify(g), before); g.paused = false; g.end('attack', 'explosion'); g.paused = true; advance(g, 6); assert.equal(g.round, 1); });
test('next round resets all equipment, health, objective and actors', () => { const g = new Game(3); plant(g); g.player.hp = 1; g.player.weapon = 2; g.player.ammo[0] = 0; g.player.reserve[0] = 0; g.player.y = 1; g.player.yaw = 2; g.end('attack', 'explosion'); advance(g, 4.01); assert.equal(g.round, 2); assert.equal(g.player.hp, 100); assert.equal(g.player.weapon, 0); assert.deepEqual(g.player.ammo, [30, 12, 0]); assert.deepEqual(g.player.reserve, [90, 48, 0]); assert.equal(g.player.y, 0); assert.equal(g.player.yaw, 0); assert.equal(g.player.z, 23); assert.equal(g.bomb, null); assert.equal(g.timer, 105); assert.equal(g.actors.length, 6); assert.equal(g.player.progress, 0); });
test('swap after round four, score stays with team, first to five ends', () => { const g = new Game(1); for (let i = 0; i < 4; i++) { g.end('attack', 'elimination'); advance(g, 4.01); } assert.equal(g.round, 5); assert.equal(g.side(0), 'defend'); assert.deepEqual(g.score, [4, 0]); g.end('defend', 'defused'); assert.equal(g.phase, 'finished'); assert.deepEqual(g.score, [5, 0]); });
test('8 round match can finish 4:4 and restart clears score', () => { const g = new Game(1); for (let i = 0; i < 8; i++) { g.end(g.side(i % 2), 'elimination'); if (i < 7) advance(g, 4.01); } assert.equal(g.round, 8); assert.equal(g.phase, 'finished'); assert.deepEqual(g.score, [4, 4]); g.restart(); assert.deepEqual(g.score, [0, 0]); assert.equal(g.round, 1); assert.equal(g.bomb, null); });
test('no movement tunnels through walls or map boundary', () => { const p = { x: -8, z: 20 }; move(p, 0, -40); assert.ok(p.z >= 11.87); assert.ok(free(p)); const q = { x: 24, z: 24 }; move(q, 100, 100); assert.ok(q.x <= 25.62 && q.z <= 25.62); assert.ok(free(q)); });
test('both spawns can reach both sites with clearance', () => { for (const z of [-23, 23]) for (const s of sites) { const route = path({ x: 3, z }, s); assert.ok(route.length > 0); let last = { x: 3, z }; for (const p of route) { assert.ok(free(p)); assert.ok(visible(last, p)); last = p; } assert.equal(distance(last, s), 0); } });
test('AI attackers navigate and plant on their own', () => { const g = new Game(2, 'easy', () => 1); g.actors.filter(a => a.team === 1).forEach(a => { a.x = -8; a.z = 7; }); g.player.hp = 0; for (let i = 0; i < 7000 && !g.bomb; i++) { g.step(0.01, false, false); g.bot(g.actors[1], 0.01); } assert.ok(g.bomb, 'bot must reach site and finish planting'); });
test('AI defenders reach bomb and defuse with dead attackers', () => { const g = new Game(1, 'easy', () => 1); plant(g); g.player.hp = 0; for (let i = 0; i < 4000 && g.phase === 'live'; i++) g.step(0.01, false, true); assert.equal(g.result?.reason, 'defused'); });
test('all 1v1–3v3 sizes and both difficulties complete an eight-round chain or first-to-five', () => { for (const size of [1, 2, 3]) for (const difficulty of ['easy', 'normal'] as const) { let seed = 7; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; const g = new Game(size, difficulty, random); g.player.hp = 0; for (let i = 0; i < 26000 && g.phase !== 'finished'; i++) { g.step(0.05, false, true); if (g.phase === 'live') g.bot(g.player, 0.05); } assert.equal(g.phase, 'finished'); assert.ok(g.round <= 8); } });
test('Chinese and English have complete, nonempty matching dictionaries', () => { assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort()); assert.ok(Object.values(en).every(Boolean)); assert.ok(Object.values(zh).every(Boolean)); assert.ok(Object.values(en).every(s => !/[\u4e00-\u9fff]/.test(s) || s === '中文')); });
