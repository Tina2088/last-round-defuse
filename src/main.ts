import './style.css';
import { Game, weapons, type GameEvent, type Weapon, type Side } from './game';
import { distance, move, sites, blocks } from './world';
import { View } from './view';
import { zh, en, type Key } from './i18n';

const app = document.querySelector<HTMLDivElement>('#app')!;
let language: 'zh' | 'en' = localStorage.getItem('lrd-language') === 'en' ? 'en' : 'zh';
const t = (key: Key) => (language === 'zh' ? zh : en)[key];
let startSide: Side = 'defend';
let game = new Game(); let started = false; let pitch = 0; let audioEnabled = true; let pointerError = false;
let view: View;
try { view = new View(app); } catch (error) { app.textContent = t('unsupported'); throw error; }
view.reset(game);
app.insertAdjacentHTML('beforeend', `
  <div id="damage"></div><div id="hit">×</div>
  <header id="brand"><span class="brand-mark">╱╱</span><span id="brand-name"></span><small>v0.1.2.2</small></header>
  <div id="top-actions"><button id="sound"></button><button id="language"></button></div>
  <main id="menu"></main>
  <section id="hud" hidden>
    <button id="hud-language" aria-keyshortcuts="L"></button>
    <div id="scoreboard"><div class="team-score"><small id="ours-label"></small><b id="ours">0</b><span id="our-side"></span></div><div id="clock-panel"><small id="round"></small><strong id="clock">1:45</strong><span id="clock-label"></span></div><div class="team-score"><small id="theirs-label"></small><b id="theirs">0</b><span id="their-side"></span></div></div>
    <div id="objective"></div><div id="site-arrows"></div><canvas id="minimap" width="170" height="170"></canvas>
    <div id="feed" aria-live="polite"></div><div id="crosshair"><i></i><i></i><i></i><i></i></div>
    <div id="interaction"><strong></strong><div class="progress"><i></i></div><small></small></div>
    <div id="round-result" aria-live="polite"></div><div id="spectator"></div>
    <div id="bottom"><div id="vitals"><small></small><b></b><span class="health-track"><i></i></span></div><div id="bottom-hint"></div><div id="weapon"><small></small><b></b><span></span></div></div>
  </section><div id="toast" role="status"></div>`);
const $ = (id: string) => document.getElementById(id)!;
const keys = new Set<string>(); let firing = false; let lastRound = 1; let selectedWeapon = 0;
let audio: AudioContext | undefined; let damageUntil = 0; let hitUntil = 0; let previousHp = 100; let bombBeep = -1; let footstep = 0;
const feed: { event: GameEvent; until: number }[] = [];
function tone(frequency: number, duration: number, volume = 0.04, type: OscillatorType = 'sine') {
  if (!audioEnabled || !audio) return;
  const oscillator = audio.createOscillator(); const gain = audio.createGain(); oscillator.type = type; oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration);
}
function clearInput() { keys.clear(); firing = false; game.actors.forEach(a => game.cancel(a)); }
function pause() {
  if (!started || game.phase === 'finished') return;
  game.paused = true; clearInput(); if (document.pointerLockElement) document.exitPointerLock(); renderMenu();
}
function lock() {
  pointerError = false;
  audio ??= new AudioContext(); void audio.resume();
  const promise = view.renderer.domElement.requestPointerLock();
  if (promise) promise.catch(() => { pointerError = true; game.paused = true; renderMenu(); });
}
function restart() {
  game = new Game(game.size, game.difficulty, undefined, game.startSide, game.oneShotKill); game.paused = true; pitch = 0; lastRound = 1; previousHp = 100; feed.length = 0; selectedWeapon = 0; bombBeep = -1;
  view.reset(game); view.setWeapon(0); clearInput(); renderMenu(); lock();
}
function renderMenu() {
  $('toast').textContent = view.fp.error ? t('modelError') : '';
  $('brand-name').textContent = t('title'); $('language').textContent = t('lang'); $('sound').textContent = `${t('audio')} ${t(audioEnabled ? 'on' : 'off')}`;
  $('hud-language').textContent = `${t('lang')} · L`;
  $('hud-language').setAttribute('aria-label', t('languageHint'));
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'; document.title = `${t('title')} · v0.1.2.2`;
  const show = !started || game.paused || game.phase === 'finished'; $('menu').hidden = !show; $('hud').hidden = !started;
  $('hud-language').hidden = show;
  $('brand').classList.toggle('compact', started); $('top-actions').hidden = started && !show;
  if (!show) return;
  const finished = game.phase === 'finished';
  const title = !started ? t('briefing') : finished ? t(game.score[0] === game.score[1] ? 'draw' : game.score[0] > game.score[1] ? 'victory' : 'defeat') : t('paused');
  $('menu').innerHTML = `<div class="menu-panel ${started ? 'in-match' : ''}"><p class="location"><span></span>${t('harbor')}</p><h1>${title}</h1><p class="intro">${!started ? t('intro') : finished ? `${t('yourTeam')} ${game.score[0]} : ${game.score[1]} ${t('enemyTeam')}` : t('pauseHint')}</p>
    ${!started ? `<div class="rules"><div><b>${t('rule1')}</b><span>${t('rule1body')}</span></div><div><b>${t('rule2')}</b><span>${t('rule2body')}</span></div><div><b>${t('rule3')}</b><span>${t('rule3body')}</span></div></div><div class="settings"><label>${t('size')}<select id="size"><option value="1">1 v 1</option><option value="2" selected>2 v 2</option><option value="3">3 v 3</option></select></label><label>${t('difficulty')}<select id="difficulty"><option value="easy">${t('easy')}</option><option value="normal" selected>${t('normal')}</option></select></label></div>` : ''}
    ${!started ? `<fieldset class="side-picker"><legend>${t('startSide')}</legend><div>${(['attack', 'defend'] as const).map(side => `<label class="${side}"><input type="radio" name="start-side" id="side-${side}" value="${side}" ${startSide === side ? 'checked' : ''}><span>${t(side)}</span></label>`).join('')}</div><p>${t('startSideHint')}</p></fieldset>` : ''}
    <label class="one-shot-setting"><input type="checkbox" id="one-shot" ${game.oneShotKill ? 'checked' : ''} aria-describedby="one-shot-hint"><span>${t('oneShotKill')}<small id="one-shot-hint">${t('oneShotHint')}</small></span></label>
    <div class="menu-buttons">${!finished ? `<button id="play" class="primary">${t(started ? 'resume' : 'start')}<span>↗</span></button>` : ''}${started ? `<button id="restart">${t('restart')}</button>` : ''}</div>
    <p class="match-rule">${t('matchRule')}</p><p class="match-rule">${t('plantedRule')}</p><div class="controls"><b>${t('help')}</b><p>${t('controls')}</p><p>${t('controls2')}</p><p>${t('controls3')}</p></div><p class="desktop">${pointerError ? t('pointerError') : t('desktop')}</p></div><div class="map-caption"><span>07</span><div>${t('harbor')}<small>A / B · 52 × 52 m</small></div></div>`;
  $('play')?.addEventListener('click', () => {
    if (!started) { game = new Game(Number(($('size') as HTMLSelectElement).value), ($('difficulty') as HTMLSelectElement).value as 'easy' | 'normal', undefined, startSide, game.oneShotKill); started = true; game.paused = true; view.reset(game); }
    lock(); renderMenu();
  });
  $('restart')?.addEventListener('click', restart);
  $('one-shot').addEventListener('change', () => { game.oneShotKill = ($('one-shot') as HTMLInputElement).checked; });
  document.querySelectorAll<HTMLInputElement>('input[name="start-side"]').forEach(input => input.addEventListener('change', () => { startSide = input.value as Side; }));
}
function toggleLanguage() {
  const size = ($('size') as HTMLSelectElement | null)?.value; const difficulty = ($('difficulty') as HTMLSelectElement | null)?.value;
  language = language === 'zh' ? 'en' : 'zh'; localStorage.setItem('lrd-language', language); renderMenu();
  if (size) ($('size') as HTMLSelectElement).value = size; if (difficulty) ($('difficulty') as HTMLSelectElement).value = difficulty;
}
$('language').addEventListener('click', toggleLanguage);
$('hud-language').addEventListener('click', toggleLanguage);
$('sound').addEventListener('click', () => { audioEnabled = !audioEnabled; renderMenu(); });
view.renderer.domElement.addEventListener('click', () => { if (started && game.phase !== 'finished' && !document.pointerLockElement) lock(); });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === view.renderer.domElement) { game.paused = false; clearInput(); renderMenu(); }
  else pause();
});
document.addEventListener('pointerlockerror', () => { pointerError = true; pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('blur', pause);
addEventListener('keydown', e => {
  if (['Space', 'ControlLeft', 'ControlRight', 'Tab'].includes(e.code) && started) e.preventDefault();
  if (e.code === 'Escape') { pause(); return; }
  if (!started || e.repeat) return;
  if (e.code === 'KeyL') { toggleLanguage(); return; }
  if (e.code === 'KeyR' && (game.paused || game.phase === 'finished')) { restart(); return; }
  if (game.paused || game.phase !== 'live' || game.player.hp <= 0) return;
  keys.add(e.code);
  if (e.code === 'KeyR') game.reload(game.player);
  if (/^Digit[123]$/.test(e.code)) game.switch(game.player, (Number(e.code.at(-1)) - 1) as Weapon);
  if (e.code === 'Space' && game.player.y === 0) game.player.vy = 5.8;
});
addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'KeyE') game.cancel(game.player); });
addEventListener('mousedown', e => { if (e.button === 0 && document.pointerLockElement && !game.paused) firing = true; });
addEventListener('mouseup', e => { if (e.button === 0) firing = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => { if (!document.pointerLockElement || game.paused || game.player.hp <= 0) return; game.player.yaw -= e.movementX * 0.002; pitch = Math.max(-1.48, Math.min(1.48, pitch - e.movementY * 0.002)); });
function playerStep(dt: number) {
  const p = game.player; if (p.hp <= 0 || game.phase !== 'live') return;
  p.crouch = keys.has('ControlLeft') || keys.has('ControlRight');
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS')); const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const norm = Math.max(1, Math.hypot(forward, right));
  const speed = p.crouch ? 2.2 : keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.8 : 5;
  if (!keys.has('KeyE')) move(p, (-Math.sin(p.yaw) * forward + Math.cos(p.yaw) * right) / norm * speed * dt, (-Math.cos(p.yaw) * forward - Math.sin(p.yaw) * right) / norm * speed * dt);
  footstep -= dt;
  if ((forward || right) && !p.y && speed === 5 && !keys.has('KeyE') && footstep <= 0) { tone(65, 0.045, 0.018, 'triangle'); footstep = 0.36; }
  p.vy -= 16 * dt; p.y = Math.max(0, p.y + p.vy * dt); if (!p.y) p.vy = 0;
  if (p.weapon !== selectedWeapon) { selectedWeapon = p.weapon; view.setWeapon(selectedWeapon); }
  if (firing && !keys.has('KeyE') && game.fire(p)) {
    const hit = view.shoot(game, pitch); tone(p.weapon === 2 ? 210 : 110, 0.08, 0.035, 'sawtooth');
    if (hit.actor && distance(p, hit.actor) <= weapons[p.weapon].range && hit.actor.team !== p.team) { game.damage(hit.actor, p, weapons[p.weapon].damage, hit.head); hitUntil = performance.now() + 140; tone(800, 0.05); }
  }
}
function actorName(id: number) { return id === 0 ? t('you') : `${t(game.actors[id]?.team === 0 ? 'ally' : 'enemy')} ${id}`; }
function eventText(event: GameEvent) {
  if (event.type === 'kill') return `${actorName(event.killer)}  ›  ${actorName(event.victim)}${event.head ? ` · ${t('headshot')}` : ''}`;
  if (event.type === 'round') return `${t(event.side)} ${t('wins')} · ${t(event.reason)}`;
  return t(event.type === 'plant' ? 'planted' : 'defused');
}
const mini = ($('minimap') as HTMLCanvasElement).getContext('2d')!;
function minimap() {
  const scale = 170 / 56; const xy = (v: number) => (v + 28) * scale;
  mini.clearRect(0, 0, 170, 170); mini.fillStyle = '#183340de'; mini.fillRect(0, 0, 170, 170); mini.strokeStyle = '#8da6ad'; mini.strokeRect(xy(-26), xy(-26), 52 * scale, 52 * scale);
  mini.fillStyle = '#72858b'; for (const b of blocks) mini.fillRect(xy(b.x - b.w / 2), xy(b.z - b.d / 2), b.w * scale, b.d * scale);
  mini.font = 'bold 12px sans-serif'; mini.textAlign = 'center';
  for (const s of sites) { mini.strokeStyle = '#f3d36c'; mini.beginPath(); mini.arc(xy(s.x), xy(s.z), 10, 0, Math.PI * 2); mini.stroke(); mini.fillStyle = '#f3d36c'; mini.fillText(s.name, xy(s.x), xy(s.z) + 4); }
  for (const a of game.actors.filter(a => a.hp > 0 && a.team === 0)) { mini.fillStyle = a.id === 0 ? '#ffffff' : game.side(0) === 'attack' ? '#f49b4b' : '#47ccd2'; mini.beginPath(); mini.arc(xy(a.x), xy(a.z), a.id === 0 ? 3.5 : 2.5, 0, Math.PI * 2); mini.fill(); if (a.id === 0) { mini.strokeStyle = '#ffffff'; mini.beginPath(); mini.moveTo(xy(a.x), xy(a.z)); mini.lineTo(xy(a.x - Math.sin(a.yaw) * 3), xy(a.z - Math.cos(a.yaw) * 3)); mini.stroke(); } }
  if (game.bomb) { mini.fillStyle = '#fff0b1'; mini.fillRect(xy(game.bomb.x) - 3, xy(game.bomb.z) - 3, 6, 6); }
}
function hud(now: number) {
  if (!started) return;
  const p = game.player; const side = game.side(0); const remaining = Math.ceil(game.bomb?.timer ?? game.timer);
  $('ours-label').textContent = t('yourTeam'); $('theirs-label').textContent = t('enemyTeam'); $('ours').textContent = String(game.score[0]); $('theirs').textContent = String(game.score[1]);
  $('our-side').textContent = t(side); $('their-side').textContent = t(game.side(1)); $('our-side').className = side; $('their-side').className = game.side(1);
  $('round').textContent = `${t('round')} ${game.round} / 8`; $('clock').textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  $('clock-panel').classList.toggle('armed', !!game.bomb); $('clock-label').textContent = game.bomb ? `${t('planted')} · ${game.bomb.site}` : t('roundDuration');
  $('objective').textContent = t(game.bomb ? side === 'attack' ? 'objectiveArmedAttack' : 'objectiveArmedDefend' : side === 'attack' ? 'objectiveAttack' : 'objectiveDefend');
  $('site-arrows').innerHTML = sites.map(s => { const angle = Math.atan2(s.x - p.x, -(s.z - p.z)) + p.yaw; return `<span><i style="transform:rotate(${angle}rad)">↑</i> ${s.name} <small>${Math.round(distance(p, s))} m</small></span>`; }).join('');
  $('vitals').querySelector('small')!.textContent = t('health'); $('vitals').querySelector('b')!.textContent = String(p.hp); ($('vitals').querySelector('i') as HTMLElement).style.width = `${p.hp}%`;
  $('weapon').querySelector('small')!.textContent = `${p.weapon + 1} / ${t(weapons[p.weapon].name)}`; $('weapon').querySelector('b')!.textContent = p.weapon === 2 ? '—' : `${p.ammo[p.weapon]} / ${p.reserve[p.weapon]}`;
  $('weapon').querySelector('span')!.textContent = p.reload > 0 ? `${t('reload')} ${p.reload.toFixed(1)} s` : p.weapon !== 2 && !p.ammo[p.weapon] ? t('empty') : t('ammo');
  $('bottom-hint').textContent = t('hint'); $('crosshair').hidden = p.hp <= 0 || game.phase !== 'live' || game.paused;
  const action = game.interaction(p); $('interaction').hidden = !action || game.paused;
  if (action) { $('interaction').querySelector('strong')!.textContent = t(action); ($('interaction').querySelector('i') as HTMLElement).style.width = `${p.progress / (action === 'plant' ? 3 : 5) * 100}%`; $('interaction').querySelector('small')!.textContent = `${p.progress.toFixed(1)} / ${action === 'plant' ? '3.0' : '5.0'} s`; }
  const watched = game.actors.find(a => a.id && a.team === 0 && a.hp > 0);
  $('spectator').textContent = p.hp <= 0 ? `${t('spectate')}${watched ? ` · ${t('watching')} ${actorName(watched.id)}` : ''}` : '';
  $('round-result').hidden = game.phase !== 'between'; if (game.phase === 'between' && game.result) $('round-result').innerHTML = `<b>${t(game.result.side)} ${t('wins')}</b><span>${t(game.result.reason)} · ${t(game.round === 4 ? 'swap' : 'next')} ${Math.ceil(game.between)}</span>`;
  while (feed.length && feed[0].until < now) feed.shift(); $('feed').innerHTML = feed.slice(-5).map(f => `<div>${eventText(f.event)}</div>`).join('');
  $('damage').style.opacity = now < damageUntil ? '1' : '0'; $('hit').style.opacity = now < hitUntil ? '1' : '0'; minimap();
}
renderMenu(); void view.assetsReady.then(renderMenu); let last = performance.now(); let uiClock = 0;
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (started && !game.paused) {
    playerStep(dt); game.step(dt, keys.has('KeyE'));
    if (game.round !== lastRound) { lastRound = game.round; pitch = 0; selectedWeapon = 0; previousHp = 100; bombBeep = -1; clearInput(); view.reset(game); view.setWeapon(0); }
    if (game.player.hp < previousHp) { damageUntil = now + 230; tone(80, 0.13, 0.06, 'triangle'); } previousHp = game.player.hp;
    for (const event of game.events.splice(0)) { feed.push({ event, until: now + 6500 }); if (event.type === 'plant') tone(600, 0.3); if (event.type === 'round') tone(event.reason === 'explosion' ? 45 : 420, 0.6, 0.08, 'triangle'); }
    if (game.bomb && Math.ceil(game.bomb.timer) !== bombBeep) { bombBeep = Math.ceil(game.bomb.timer); tone(game.bomb.timer < 10 ? 1000 : 700, 0.07); }
    if (game.phase === 'finished') { game.paused = true; clearInput(); if (document.pointerLockElement) document.exitPointerLock(); renderMenu(); }
  }
  view.render(game, game.paused ? 0 : dt, started, pitch, now / 1000);
  uiClock += dt; if (uiClock > 0.04) { hud(now); uiClock = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Development-only state access for reproducible browser QA. Removed from production builds.
if (import.meta.env.DEV) Object.assign(window, { __qa: { get game() { return game; }, view, pause, keys, setPitch: (value: number) => { pitch = value; } } });
// Opt-in production QA exposes snapshots only; getters follow match replacement and toggles.
if (new URLSearchParams(location.search).get('qa') === '1') Object.assign(window, { __LRD__: {
  version: 'v0.1.2.2',
  actors: () => game.actors.map(({ id, team, hp, x, z }) => ({ id, team, hp, x, z })),
  get oneShotKill() { return game.oneShotKill; },
} });
