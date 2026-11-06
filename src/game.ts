import { distance, move, path, sites, visible, type Point } from './world';
export type Side = 'attack' | 'defend';
export type Phase = 'live' | 'between' | 'finished';
export type Reason = 'elimination' | 'explosion' | 'defused' | 'timeout';
export type Weapon = 0 | 1 | 2;
// Planner finals; retain the existing easy headshot chance.
export const EASY_AI = { reaction: 0.9, accuracy: 0.28, headshot: 0.02, fireDelay: 1.6, move: 0.85, hp: 80 } as const;
export const OPENING_FIRE_GRACE = 3;
// Player weapon balancing must not increase bot damage.
const BOT_DAMAGE = [28, 24, 55] as const;
export const weapons = [
  { name: 'rifle', size: 30, reserve: 90, damage: 34, delay: 0.13, reload: 2.4, range: 80 },
  { name: 'pistol', size: 12, reserve: 48, damage: 28, delay: 0.32, reload: 1.4, range: 65 },
  { name: 'knife', size: 0, reserve: 0, damage: 55, delay: 0.6, reload: 0, range: 2.3 },
] as const;
export type Actor = Point & { id: number; team: 0 | 1; hp: number; y: number; vy: number; crouch: boolean; yaw: number; weapon: Weapon; ammo: number[]; reserve: number[]; cooldown: number; reload: number; progress: number; action: 'plant' | 'defuse' | null; hurt: boolean; route: Point[]; routeTimer: number; reaction: number };
export type GameEvent = { type: 'kill'; killer: number; victim: number; head: boolean } | { type: 'plant' | 'defuse' } | { type: 'round'; side: Side; reason: Reason };
export class Game {
  actors: Actor[] = []; round = 1; score = [0, 0]; phase: Phase = 'live'; timer = 105;
  bomb: (Point & { site: string; timer: number }) | null = null;
  paused = false; between = 0; elapsed = 0; events: GameEvent[] = [];
  result: { side: Side; reason: Reason } | null = null;
  constructor(public size = 2, public difficulty: 'easy' | 'normal' = 'normal', private random = Math.random, public startSide: Side = 'attack', public oneShotKill = true) { this.resetRound(); }
  side(team: number): Side {
    const playerSide = this.round <= 4 ? this.startSide : this.startSide === 'attack' ? 'defend' : 'attack';
    return team === 0 ? playerSide : playerSide === 'attack' ? 'defend' : 'attack';
  }
  get player() { return this.actors[0]; }
  resetRound() {
    this.phase = 'live'; this.timer = 105; this.bomb = null; this.between = 0; this.result = null; this.elapsed = 0;
    this.actors = [];
    for (let team = 0; team < 2; team++) for (let n = 0; n < this.size; n++) {
      const attack = this.side(team) === 'attack';
      this.actors.push({ id: this.actors.length, team: team as 0 | 1, x: (n - (this.size - 1) / 2) * 3 + (attack ? -3 : 3), z: attack ? 23 : -23, hp: 100, y: 0, vy: 0, crouch: false, yaw: attack ? 0 : Math.PI, weapon: 0, ammo: weapons.map(w => w.size), reserve: weapons.map(w => w.reserve), cooldown: 0, reload: 0, progress: 0, action: null, hurt: false, route: [], routeTimer: 0, reaction: 0 });
    }
    if (this.difficulty === 'easy') this.actors.slice(1).forEach(a => { a.hp = EASY_AI.hp; });
  }
  restart() { this.round = 1; this.score = [0, 0]; this.events = []; this.resetRound(); }
  cancel(a: Actor) { a.progress = 0; a.action = null; }
  reload(a: Actor) { if (a.weapon !== 2 && !a.reload && a.ammo[a.weapon] < weapons[a.weapon].size && a.reserve[a.weapon] > 0) { a.reload = weapons[a.weapon].reload; this.cancel(a); } }
  switch(a: Actor, weapon: Weapon) { a.weapon = weapon; a.reload = 0; this.cancel(a); }
  fire(a: Actor): boolean {
    if (this.paused || this.phase !== 'live' || a.hp <= 0 || a.cooldown > 0 || a.reload > 0 || (a.weapon !== 2 && a.ammo[a.weapon] <= 0)) return false;
    a.cooldown = weapons[a.weapon].delay * (a !== this.player && this.difficulty === 'easy' ? EASY_AI.fireDelay : 1); if (a.weapon !== 2) a.ammo[a.weapon]--; this.cancel(a); return true;
  }
  damage(target: Actor, shooter: Actor, amount: number, head = false) {
    if (this.phase !== 'live' || this.paused || target.hp <= 0 || target.team === shooter.team) return;
    const damage = this.oneShotKill && shooter === this.player ? Math.max(100, amount * (head ? 2 : 1)) : amount * (head ? 2 : 1);
    target.hp = Math.max(0, target.hp - damage); target.hurt = true; this.cancel(target);
    if (!target.hp) { target.reload = 0; this.events.push({ type: 'kill', killer: shooter.id, victim: target.id, head }); }
    this.checkElimination();
  }
  interaction(a: Actor): 'plant' | 'defuse' | null {
    if (a.hp <= 0 || this.phase !== 'live' || a.reload > 0 || a.y > 0.05) return null;
    if (this.side(a.team) === 'attack' && !this.bomb && sites.some(s => distance(a, s) <= 3)) return 'plant';
    if (this.side(a.team) === 'defend' && this.bomb && distance(a, this.bomb) <= 2.6) return 'defuse';
    return null;
  }
  interact(a: Actor, held: boolean, dt: number) {
    const kind = this.interaction(a);
    if (!held || !kind || a.hurt) { this.cancel(a); return; }
    if (a.action !== kind) a.progress = 0;
    a.action = kind; a.progress += dt;
    if (a.progress + 1e-8 >= (kind === 'plant' ? 3 : 5)) {
      if (kind === 'plant') { const site = sites.find(s => distance(a, s) <= 3)!; this.bomb = { x: a.x, z: a.z, site: site.name, timer: 40 }; this.events.push({ type: 'plant' }); }
      else { this.events.push({ type: 'defuse' }); this.end('defend', 'defused'); }
      this.cancel(a);
    }
  }
  checkElimination() {
    if (this.bomb) {
      if (!this.actors.some(a => this.side(a.team) === 'defend' && a.hp > 0)) this.end('attack', 'elimination');
      return; // Dead attackers leave a live charge for defenders to defuse.
    }
    for (const side of ['attack', 'defend'] as Side[]) if (!this.actors.some(a => this.side(a.team) === side && a.hp > 0)) this.end(side === 'attack' ? 'defend' : 'attack', 'elimination');
  }
  end(side: Side, reason: Reason) {
    if (this.phase !== 'live') return;
    const team = this.side(0) === side ? 0 : 1; this.score[team]++;
    this.result = { side, reason }; this.events.push({ type: 'round', side, reason });
    this.phase = this.score[team] >= 5 || this.round >= 8 ? 'finished' : 'between'; this.between = 4;
    this.actors.forEach(a => { this.cancel(a); a.reload = 0; });
  }
  step(dt: number, eHeld = false, ai = true) {
    if (this.paused || this.phase === 'finished') return;
    if (this.phase === 'between') { this.between -= dt; if (this.between <= 0) { this.round++; this.resetRound(); } return; }
    this.elapsed += dt;
    // Expiry wins an exact timestamp tie. A fresh plant starts with all 40 seconds.
    if (this.bomb) { this.bomb.timer -= dt; if (this.bomb.timer <= 0) { this.bomb.timer = 0; this.end('attack', 'explosion'); return; } }
    else { this.timer -= dt; if (this.timer <= 0) { this.timer = 0; this.end('defend', 'timeout'); return; } }
    for (const a of this.actors) {
      a.cooldown = Math.max(0, a.cooldown - dt);
      if (a.reload > 0) { a.reload -= dt; if (a.reload <= 0) { const n = Math.min(weapons[a.weapon].size - a.ammo[a.weapon], a.reserve[a.weapon]); a.ammo[a.weapon] += n; a.reserve[a.weapon] -= n; a.reload = 0; } }
      if (a.hp <= 0) continue;
      if (a.id === 0) this.interact(a, eHeld, dt);
      else if (ai) this.bot(a, dt);
    }
    this.actors.forEach(a => { a.hurt = false; });
    this.checkElimination();
  }
  bot(a: Actor, dt: number) {
    if (this.phase !== 'live') return;
    const side = this.side(a.team);
    const opponents = this.actors.filter(b => b.team !== a.team && b.hp > 0 && distance(a, b) < 34 && visible(a, b)).sort((b, c) => distance(a, b) - distance(a, c));
    const enemy = opponents[0];
    const objective = this.bomb ?? sites[(this.round + (side === 'defend' ? a.id % 2 : 0)) % 2];
    const canAct = this.interaction(a);
    // A defender prioritizes the charge when the clock is short; teammates cover.
    const urgent = !!this.bomb && this.bomb.timer < 12;
    if (canAct && (!enemy || urgent)) { this.interact(a, true, dt); return; }
    this.cancel(a);
    if (enemy) {
      a.yaw = Math.atan2(-(enemy.x - a.x), -(enemy.z - a.z));
      a.reaction += dt;
      if (!a.ammo[0]) this.reload(a);
      const tuning = this.difficulty === 'easy' ? EASY_AI : { reaction: 0.45, accuracy: 0.3, headshot: 0.08 };
      // First round only, on the simulation clock: pausing cannot spend the grace.
      const openingGrace = this.round === 1 && this.elapsed < OPENING_FIRE_GRACE;
      if (!openingGrace && a.reaction > tuning.reaction && this.fire(a) && this.random() < tuning.accuracy * (enemy.crouch ? 0.7 : 1)) this.damage(enemy, a, BOT_DAMAGE[a.weapon], this.random() < tuning.headshot);
      if (!urgent) return;
    } else a.reaction = 0;
    if (this.bomb && side === 'attack' && distance(a, objective) < 5) return;
    a.routeTimer -= dt;
    if (a.routeTimer <= 0 || !a.route.length) { a.route = path(a, objective); a.routeTimer = 1.5; }
    while (a.route.length && distance(a, a.route[0]) < 0.4) a.route.shift();
    const target = a.route[0];
    if (target) { const d = distance(a, target); const speed = Math.min(d, 3.4 * dt * (this.difficulty === 'easy' ? EASY_AI.move : 1)); move(a, (target.x - a.x) / d * speed, (target.z - a.z) / d * speed); if (!enemy) a.yaw = Math.atan2(-(target.x - a.x), -(target.z - a.z)); }
  }
}
