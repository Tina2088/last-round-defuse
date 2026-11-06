import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { WeaponMotion } from './weapon-motion';
import { weapons, type Actor } from './game';

export class FPWeapons {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.01, 10);
  root = new THREE.Group();
  assets = new Map<number, THREE.Group>();
  motion = new WeaponMotion();
  active = -1;
  model?: THREE.Group;
  ready: Promise<void>;
  error = false;
  flash = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.19, 7), new THREE.MeshBasicMaterial({ color: 0xffda87, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  muzzle = new THREE.Vector3();
  constructor(renderer: THREE.WebGLRenderer, onCharge: (model: THREE.Group) => void) {
    const room = new RoomEnvironment(); const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(room, .04).texture; this.scene.environmentIntensity = .75;
    room.dispose(); pmrem.dispose();
    this.scene.add(this.camera, this.root, new THREE.HemisphereLight(0xe1efff, 0x61615a, 2.6));
    const key = new THREE.DirectionalLight(0xffe5bf, 3); key.position.set(-2, 4, 1); this.scene.add(key);
    this.flash.geometry.rotateX(-Math.PI / 2); this.flash.visible = false; this.root.add(this.flash);
    const loader = new GLTFLoader();
    this.ready = Promise.all(['rifle_fp', 'pistol', 'c4'].map(async (name, i) => {
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
      this.assets.set(i === 2 ? 3 : i, gltf.scene);
      if (i === 2) onCharge(gltf.scene.clone(true));
    })).then(() => { this.attach(); }).catch(error => { this.error = true; console.error('Weapon model loading failed', error); });
    const knife = new THREE.Group();
    for (const [w,h,d,y,z,color] of [[.045,.018,.27,.01,-.2,0xaebdc4],[.052,.06,.11,-.02,-.02,0x25363b],[.12,.022,.03,.01,-.07,0x56656c]]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial({color,metalness:.6,roughness:.4})); mesh.position.set(0,y,z); knife.add(mesh);
    }
    this.assets.set(2,knife); this.select(0);
  }
  select(index: number) { if (this.active === index) return; this.active = index; this.motion.switch(); this.flash.visible = false; this.attach(); }
  attach() {
    if (this.model) this.root.remove(this.model);
    this.model = this.assets.get(this.active);
    if (this.model) { this.root.add(this.model); this.clearParts(); }
  }
  clearParts() {
    for (const name of ['magazine','leftHand']) { const part = this.model?.getObjectByName(name); if (part) { part.position.set(0,0,0); part.rotation.set(0,0,0); } }
  }
  reset() { this.motion.reset(); this.flash.visible = false; this.clearParts(); this.root.position.set(0,0,0); this.root.rotation.set(0,0,0); }
  fire() { this.motion.fire(); this.flash.rotation.z = Math.random() * Math.PI; }
  update(p: Actor, dt: number, time: number, live: boolean) {
    this.select(p.action === 'plant' ? 3 : p.weapon);
    if (!live) this.reset();
    const pose = this.motion.step(dt, p.reload, weapons[p.weapon].reload || 1);
    const charge = this.active === 3;
    this.root.position.set(charge ? .13 : .22, (charge ? -.25 : -.19) + Math.sin(time * 3) * .003 - pose.reload * .11 - pose.switch * .22, (charge ? -.64 : -.48) + pose.recoil * .055);
    this.root.rotation.set(pose.recoil * .065 - pose.reload * .18, .18, pose.reload * -.27);
    if (charge) this.root.rotation.x = .38;
    const magazine = this.model?.getObjectByName('magazine');
    if (magazine) { magazine.position.y = pose.magazine ? -pose.magazine * .22 : 0; magazine.position.z = pose.magazine * .04; magazine.rotation.x = pose.magazine * .18; }
    const hand = this.model?.getObjectByName('leftHand');
    if (hand) { hand.position.y = -pose.magazine * .16; hand.position.z = pose.magazine * .19; hand.rotation.x = pose.magazine * -.18; }
    this.muzzle.set(0, this.active === 0 ? .015 : .03, this.active === 0 ? -1.06 : -.36);
    this.flash.position.copy(this.muzzle); this.flash.position.z -= .09;
    this.flash.visible = live && this.active < 2 && pose.recoil > .3;
    this.root.visible = live;
  }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
}
