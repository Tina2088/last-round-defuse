// Animation derives from authoritative remaining reload time; no deferred callbacks
// can refill a switched weapon or revive a cancelled visual state.
export class WeaponMotion {
  recoil = 0;
  switchRemaining = 0;
  reset() { this.recoil = 0; this.switchRemaining = 0; }
  switch() { this.reset(); this.switchRemaining = 0.22; }
  fire() { this.recoil = 1; }
  step(dt: number, remaining: number, duration: number) {
    this.recoil = Math.max(0, this.recoil - dt * 12);
    this.switchRemaining = Math.max(0, this.switchRemaining - dt);
    const progress = remaining > 0 ? Math.max(0, Math.min(1, 1 - remaining / duration)) : 0;
    const reload = remaining > 0 ? Math.sin(Math.PI * progress) : 0;
    const magazine = remaining > 0 ? Math.sin(Math.PI * Math.max(0, Math.min(1, (progress - 0.12) / 0.76))) : 0;
    return { recoil: this.recoil, switch: this.switchRemaining / 0.22, reload, magazine };
  }
}
