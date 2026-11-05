export type Point = { x: number; z: number };
export type Block = Point & { w: number; d: number; h: number; color: number };
export const LIMIT = 26;
export const RADIUS = 0.38;
export const sites = [{ x: -17, z: -13, name: 'A' }, { x: 17, z: -13, name: 'B' }] as const;
// Shared by renderer, collision, ray visibility and navigation. No decorative solid is invisible to physics.
export const blocks: Block[] = [
  { x: -8, z: 7, w: 5, d: 9, h: 3.6, color: 0x526e78 },
  { x: 8, z: 7, w: 5, d: 9, h: 3.6, color: 0x65757d },
  { x: 0, z: -7, w: 13, d: 8, h: 5.5, color: 0x8d999d },
  { x: -18, z: 0, w: 5, d: 4, h: 2.8, color: 0x72888a },
  { x: 18, z: 0, w: 5, d: 4, h: 2.8, color: 0x72888a },
  { x: -11, z: -17, w: 3, d: 3, h: 2.4, color: 0x998b6d },
  { x: 11, z: -17, w: 3, d: 3, h: 2.4, color: 0x998b6d },
  { x: 0, z: 18, w: 4, d: 2, h: 2.5, color: 0x998b6d },
];
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export function free(p: Point, radius = RADIUS): boolean {
  return Math.abs(p.x) <= LIMIT - radius && Math.abs(p.z) <= LIMIT - radius &&
    !blocks.some(b => Math.abs(p.x - b.x) < b.w / 2 + radius && Math.abs(p.z - b.z) < b.d / 2 + radius);
}
export function move(p: Point, dx: number, dz: number): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15));
  for (let i = 0; i < steps; i++) {
    if (free({ x: p.x + dx / steps, z: p.z })) p.x += dx / steps;
    if (free({ x: p.x, z: p.z + dz / steps })) p.z += dz / steps;
  }
}
export function visible(a: Point, b: Point): boolean {
  const n = Math.ceil(distance(a, b) / 0.25);
  for (let i = 0; i <= n; i++) if (!free({ x: a.x + (b.x - a.x) * i / Math.max(n, 1), z: a.z + (b.z - a.z) * i / Math.max(n, 1) }, 0)) return false;
  return true;
}
// BFS over a 2 m grid; the clearance test keeps bots away from crate corners.
export function path(start: Point, end: Point): Point[] {
  const key = (x: number, z: number) => `${x},${z}`;
  const snap = (v: number) => Math.round(v / 2) * 2;
  const s = { x: snap(start.x), z: snap(start.z) };
  const goal = { x: snap(end.x), z: snap(end.z) };
  const queue = [s]; const prev = new Map<string, Point | null>([[key(s.x, s.z), null]]);
  let found: Point | undefined;
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (distance(p, goal) < 1) { found = p; break; }
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const q = { x: p.x + dx, z: p.z + dz }; const k = key(q.x, q.z);
      if (!prev.has(k) && free(q, 0.6) && visible(p, q)) { prev.set(k, p); queue.push(q); }
    }
  }
  if (!found) return [];
  const result: Point[] = [end];
  for (let p: Point | null = found; p; p = prev.get(key(p.x, p.z)) ?? null) result.unshift(p);
  return result;
}
