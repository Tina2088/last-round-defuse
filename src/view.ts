import * as THREE from 'three';
import { blocks, sites, LIMIT } from './world';
import { Game, type Actor } from './game';
import { FPWeapons } from './fp-weapons';
export class View {
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.06, 180);
  renderer: THREE.WebGLRenderer; models = new Map<number, THREE.Group>(); solids: THREE.Object3D[] = [];
  ray = new THREE.Raycaster(); bomb = new THREE.Group(); fp: FPWeapons;
  get gun() { return this.fp.root; }
  get flash() { return this.fp.flash; }
  get assetsReady() { return this.fp.ready; }
  traces: { line: THREE.Line; life: number }[] = []; recoil = 0;
  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true }); this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(innerWidth, innerHeight); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.25;
    host.prepend(this.renderer.domElement); this.renderer.domElement.id = 'scene';
    this.scene.background = new THREE.Color(0xb5c9d2); this.scene.fog = new THREE.Fog(0xb5c9d2, 42, 135);
    this.scene.add(new THREE.HemisphereLight(0xe4f3ff, 0x67727a, 2.3));
    const sun = new THREE.DirectionalLight(0xffe3b7, 3.4); sun.position.set(-22, 40, 12); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 100 }); sun.shadow.bias = -0.001; this.scene.add(sun);
    this.box(0, -0.3, 0, 54, 0.6, 54, 0x7c898d);
    const sea = this.box(0, -1.3, 0, 260, 0.5, 260, 0x517c90); sea.receiveShadow = false;
    for (const b of blocks) {
      const m = this.box(b.x, b.h / 2, b.z, b.w, b.h, b.d, b.color); this.solids.push(m);
      if (b.h < 4) {
        for (let x = -b.w / 2 + 0.3; x < b.w / 2; x += 0.65) this.box(b.x + x, b.h / 2, b.z + b.d / 2 + 0.025, 0.05, b.h - 0.2, 0.05, 0x394e58);
        this.box(b.x, b.h + 0.04, b.z, b.w + 0.1, 0.08, b.d + 0.1, 0xadb7b7);
      } else {
        this.box(b.x, b.h + 0.15, b.z, b.w + 0.8, 0.3, b.d + 0.8, 0x3b525f);
        for (const x of [-4, 0, 4]) this.box(x, 3.9, b.z + b.d / 2 + 0.02, 2.3, 1.1, 0.04, 0x426270);
        this.sign('NORTH PIER  /  07', 0, 2.5, -2.97, 6, 0xeeeecc);
      }
    }
    for (const [x, z, w, d] of [[-27, 0, 2, 56], [27, 0, 2, 56], [0, -27, 56, 2], [0, 27, 56, 2]]) {
      const m = this.box(x, 1.5, z, w, 3, d, 0x546c77); this.solids.push(m);
      this.box(x, 3.05, z, w, 0.12, d, 0xa4b0b2);
    }
    for (const s of sites) {
      // Shared A/B markings: a 0.65 m bright band with a dark outline on either edge.
      // Keep the outer edge at the original site boundary; this is only ground paint.
      const outline = new THREE.Mesh(new THREE.RingGeometry(2.25, 3.17, 96), new THREE.MeshBasicMaterial({ color: 0x172630, side: THREE.DoubleSide, toneMapped: false }));
      outline.rotation.x = -Math.PI / 2; outline.position.set(s.x, 0.02, s.z); this.scene.add(outline);
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.05, 96), new THREE.MeshBasicMaterial({ color: 0xffdf32, side: THREE.DoubleSide, toneMapped: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.025, s.z); this.scene.add(ring);
      const letter = this.label(s.name, 256, '#ffdf32'); const plane = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: letter, transparent: true, depthWrite: false, toneMapped: false }));
      plane.rotation.x = -Math.PI / 2; plane.position.set(s.x, 0.03, s.z); this.scene.add(plane);
      this.sign(s.name, s.x, 4.1, -25.9, 3, 0xf3d36c);
    }
    // Lane paint, dock bollards and a crane beyond the playable boundary.
    for (let z = -24; z < 26; z += 4) for (const x of [-24, 24]) this.box(x, 0.012, z, 0.14, 0.02, 2, 0xd6c487);
    for (const x of [-33, 34]) { this.box(x, 12, -26, 1, 24, 1, 0x465d6b); this.box(x + (x < 0 ? 9 : -9), 24, -26, 20, 1, 1, 0x465d6b); this.box(x + (x < 0 ? 17 : -17), 19, -26, 0.1, 10, 0.1, 0x344954); }
    for (let x = -24; x <= 24; x += 8) this.box(x, 4, -27, 0.1, 2, 0.1, 0x344954);
    this.scene.add(this.bomb); this.bomb.visible = false;
    this.fp = new FPWeapons(this.renderer, model => { model.scale.setScalar(1.7); model.position.set(0,.09,.34); this.bomb.add(model); });
    this.camera.rotation.order = 'YXZ'; this.scene.add(this.camera);
    this.renderer.info.autoReset = false;
    this.setWeapon(0);
    addEventListener('resize', () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.fp.resize(); this.renderer.setSize(innerWidth, innerHeight); });
  }
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: number, parent: THREE.Object3D = this.scene) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.85 })); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  label(text: string, size: number, color: string) {
    const c = document.createElement('canvas'); c.width = size; c.height = size; const ctx = c.getContext('2d')!;
    ctx.fillStyle = color; ctx.font = `bold ${size * (text.length > 2 ? 0.09 : 0.7)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, size / 2, size / 2); return new THREE.CanvasTexture(c);
  }
  sign(text: string, x: number, y: number, z: number, size: number, color: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: this.label(text, 512, '#' + color.toString(16)), transparent: true, depthWrite: false })); m.position.set(x, y, z); this.scene.add(m);
  }
  disposeTree(group: THREE.Object3D) {
    group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); } });
  }
  setWeapon(index: number) {
    this.fp.select(index);
  }
  reset(game: Game) {
    this.fp.select(game.player.weapon); this.fp.reset(); this.recoil = 0;
    for (const t of this.traces) { this.scene.remove(t.line); t.line.geometry.dispose(); (t.line.material as THREE.Material).dispose(); } this.traces = [];
    for (const m of this.models.values()) { this.scene.remove(m); this.disposeTree(m); } this.models.clear();
    for (const a of game.actors) {
      const g = new THREE.Group(); const attack = game.side(a.team) === 'attack'; const color = attack ? 0xf49b4b : 0x47ccd2;
      this.box(0, 0.95, 0, 0.58, 0.75, 0.36, color, g);
      for (const x of [-0.18, 0.18]) this.box(x, 0.36, 0, 0.2, 0.72, 0.25, 0x283b47, g);
      this.box(0, 1.52, 0, 0.35, 0.35, 0.33, 0xb5a696, g);
      if (attack) { const cap = new THREE.Mesh(new THREE.ConeGeometry(0.29, 0.25, 4), new THREE.MeshStandardMaterial({ color })); cap.position.y = 1.82; g.add(cap); }
      else this.box(0, 1.76, 0, 0.49, 0.19, 0.45, color, g);
      for (const x of [-0.37, 0.37]) {
        const shoulder = this.box(x, 1.16, 0, 0.16, 0.24, 0.4, color, g);
        // Raised triangular orange insignia versus rectangular cyan insignia.
        // Decorative badges do not change the original shoulder hit volumes.
        const badge = new THREE.Mesh(attack ? new THREE.ConeGeometry(0.16, 0.24, 3) : new THREE.BoxGeometry(0.27, 0.17, 0.06), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
        if (attack) badge.scale.z = 0.22;
        badge.position.set(x, 1.18, -0.23); badge.raycast = () => {};
        g.add(badge);
        (shoulder.material as THREE.MeshStandardMaterial).color.setHex(0x263b47);
      }
      this.box(0.25, 1.04, -0.38, 0.12, 0.14, 0.7, 0x1d2a31, g);
      g.traverse(o => { o.userData.actor = a.id; }); this.models.set(a.id, g); this.scene.add(g);
    }
  }
  syncActors(game: Game, playing: boolean) {
    for (const a of game.actors) {
      const m = this.models.get(a.id)!; m.position.set(a.x, a.y, a.z); m.rotation.y = a.yaw; m.scale.y = a.crouch ? 0.7 : 1; m.visible = a.hp > 0 && (a.id !== 0 || !playing);
    }
  }
  syncPlayerCamera(game: Game, pitch: number) {
    const p = game.player; this.camera.position.set(p.x, p.y + (p.crouch ? 1.12 : 1.65), p.z); this.camera.rotation.set(pitch, p.yaw, 0);
  }
  shoot(game: Game, pitch = this.camera.rotation.x): { actor?: Actor; head: boolean; point: THREE.Vector3 } {
    // Input and simulation can move the aim/target before the next render.
    this.syncActors(game, true); this.syncPlayerCamera(game, pitch);
    this.camera.updateMatrixWorld(); this.scene.updateMatrixWorld(true); this.ray.setFromCamera(new THREE.Vector2(), this.camera);
    // Enemy models take priority; scenery only supplies the tracer endpoint on a miss.
    const enemies = game.actors.filter(a => a.hp > 0 && a.team !== game.player.team).map(a => this.models.get(a.id)!);
    const actorHit = this.ray.intersectObjects(enemies, true)[0];
    const actor = actorHit ? game.actors.find(a => a.id === actorHit.object.userData.actor) : undefined;
    const point = actorHit?.point ?? this.ray.intersectObjects(this.solids, true)[0]?.point ?? this.ray.ray.at(70, new THREE.Vector3());
    this.recoil = 1; this.fp.select(game.player.weapon); this.fp.fire();
    this.gun.updateMatrixWorld(true);
    const muzzle = this.fp.muzzle.clone().applyMatrix4(this.gun.matrixWorld);
    const geo = new THREE.BufferGeometry().setFromPoints([this.camera.localToWorld(muzzle), point]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd89b, transparent: true, opacity: 0.75 })); this.scene.add(line); this.traces.push({ line, life: 0.06 });
    return { actor, head: !!actor && point.y > actor.y + (actor.crouch ? 1.03 : 1.35), point };
  }
  render(game: Game, dt: number, playing: boolean, pitch: number, time: number) {
    this.syncActors(game, playing);
    if (!playing) { this.camera.position.set(37 * Math.sin(0.75 + time * 0.015), 29, 37 * Math.cos(0.75 + time * 0.015)); this.camera.lookAt(0, 0, -4); this.gun.visible = false; }
    else if (game.player.hp > 0) {
      this.syncPlayerCamera(game, pitch); this.gun.visible = game.phase === 'live';
    } else {
      const target = game.actors.find(a => a.id !== 0 && a.team === 0 && a.hp > 0);
      if (target) { this.camera.position.set(target.x, 2.2, target.z); this.camera.rotation.set(-0.15, target.yaw, 0); this.models.get(target.id)!.visible = false; }
      else { this.camera.position.set(0, 32, 24); this.camera.lookAt(game.bomb?.x ?? 0, 0, game.bomb?.z ?? -8); }
      this.gun.visible = false;
    }
    this.bomb.visible = !!game.bomb; if (game.bomb) this.bomb.position.set(game.bomb.x, 0, game.bomb.z);
    this.fp.update(game.player, dt, time, playing && game.player.hp > 0 && game.phase === 'live');
    this.recoil = this.fp.motion.recoil;
    this.traces = this.traces.filter(t => { t.life -= dt; if (t.life > 0) return true; this.scene.remove(t.line); t.line.geometry.dispose(); (t.line.material as THREE.Material).dispose(); return false; });
    this.renderer.info.reset(); this.renderer.render(this.scene, this.camera);
    if (this.gun.visible) { this.renderer.autoClear = false; this.renderer.clearDepth(); this.renderer.render(this.fp.scene, this.fp.camera); this.renderer.autoClear = true; }
  }
}
