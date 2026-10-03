// Collision, line of sight and the camera boom — all against the 2D rectangles.

import { RECTS, ROOMS } from "./assemble.ts";
import { FLOOR } from "./build.ts";
import type { Rect, Room } from "./types.ts";

export function roomAt(x: number, z: number): Room | undefined {
  return ROOMS.find((r) => x > r.x1 && x < r.x2 && z > r.z1 && z < r.z2);
}

/** Push a circle out of every solid rectangle. Returns the corrected position. */
export function collide(x: number, z: number, r: number): { x: number; z: number } {
  for (let pass = 0; pass < 3; pass++) {
    for (const b of RECTS) {
      const cx = Math.max(b.x1, Math.min(x, b.x2));
      const cz = Math.max(b.z1, Math.min(z, b.z2));
      const dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // Centre is inside the box: leave by the nearest face.
        const out = [x - b.x1, b.x2 - x, z - b.z1, b.z2 - z];
        const m = Math.min(...out);
        if (m === out[0]) x = b.x1 - r;
        else if (m === out[1]) x = b.x2 + r;
        else if (m === out[2]) z = b.z1 - r;
        else z = b.z2 + r;
      }
    }
  }
  x = Math.max(FLOOR.x1 + r, Math.min(FLOOR.x2 - r, x));
  z = Math.max(FLOOR.z1 + r, Math.min(FLOOR.z2 - r, z));
  return { x, z };
}

/** Fraction t∈[0,1] along a→b where the segment first enters the rect, or null. */
function segRect(ax: number, az: number, bx: number, bz: number, r: Rect): number | null {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [
    [-dx, ax - r.x1],
    [dx, r.x2 - ax],
    [-dz, az - r.z1],
    [dz, r.z2 - az],
  ] as [number, number][]) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return null;
    }
  }
  return t0;
}

/** Whether anything at or above `minH` blocks the straight line between two points. */
export function blocked(ax: number, az: number, bx: number, bz: number, minH = 1.45, ignoreGlass = true): boolean {
  for (const r of RECTS) {
    if (r.h < minH) continue;
    if (ignoreGlass && r.kind === "glass") continue;
    const t = segRect(ax, az, bx, bz, r);
    if (t !== null && t < 0.999) return true;
  }
  return false;
}

/** First hit fraction along a→b against full-height walls (for the camera boom). */
export function firstWallHit(ax: number, az: number, bx: number, bz: number): number {
  let best = 1;
  for (const r of RECTS) {
    if (r.h < 2.6) continue;
    const t = segRect(ax, az, bx, bz, r);
    if (t !== null && t < best) best = t;
  }
  return best;
}

export function dist(ax: number, az: number, bx: number, bz: number) {
  return Math.hypot(ax - bx, az - bz);
}
