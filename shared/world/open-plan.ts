// Everything outside the rooms: the glass perimeter, the two service elevators, and the
// open-plan offices along the windows — cubicles, columns, lounges and plants for cover.

import { CEILING_H, FLOOR, box, wallLine } from "./build.ts";
import type { Rect } from "./types.ts";

const r: Rect[] = [];

// glass all round, except the two service elevators
r.push(...wallLine("x", FLOOR.z1, FLOOR.x1, FLOOR.x2, [], "glass"));
r.push(...wallLine("x", FLOOR.z2, FLOOR.x1, FLOOR.x2, [], "glass"));
r.push(...wallLine("z", FLOOR.x1, FLOOR.z1, FLOOR.z2, [[0, 3]], "glass"));
r.push(...wallLine("z", FLOOR.x2, FLOOR.z1, FLOOR.z2, [[0, 3]], "glass"));
r.push(box(FLOOR.x1 - 0.2, 0, 0.6, 3.2, CEILING_H, "wall", "elevator"));
r.push(box(FLOOR.x2 + 0.2, 0, 0.6, 3.2, CEILING_H, "wall", "elevator"));

// structural columns
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    r.push(box(sx * 16.5, sz * 11.5, 0.8, 0.8, CEILING_H, "wall", "column"));
    r.push(box(sx * 8.5, sz * 11.5, 0.8, 0.8, CEILING_H, "wall", "column"));
    r.push(box(sx * 16.5, sz * 5.5, 0.8, 0.8, CEILING_H, "wall", "column"));
  }
}

/** An L of partition with two desks: hides a robot, not a sniper's whole view. */
function cubicles(cx: number, cz: number) {
  r.push(box(cx, cz, 2.6, 0.12, 1.7, "partition", "partition"));
  r.push(box(cx, cz - 0.9, 0.12, 1.8, 1.7, "partition", "partition"));
  r.push(box(cx - 0.6, cz - 0.5, 1.0, 0.6, 0.78, "prop", "desk"));
  r.push(box(cx + 0.6, cz + 0.5, 1.0, 0.6, 0.78, "prop", "desk"));
}
// east and west strips
cubicles(-16.5, -8.2);
cubicles(-16.5, 8.8);
cubicles(16.5, -8.2);
cubicles(16.5, 8.8);
cubicles(-15.6, -2.6);
cubicles(15.6, 3.2);
// north and south strips
cubicles(-12.5, -11.6);
cubicles(12.5, 11.8);
r.push(box(4.2, -11.4, 3.0, 0.12, 1.7, "partition", "partition"));
r.push(box(-4.2, 11.4, 3.0, 0.12, 1.7, "partition", "partition"));

// lounges
r.push(box(-4.6, -12.6, 2.2, 0.9, 0.8, "prop", "couch"));
r.push(box(12.4, -12.6, 2.2, 0.9, 0.8, "prop", "couch"));
r.push(box(4.6, 12.6, 2.2, 0.9, 0.8, "prop", "couch"));
r.push(box(-12.4, 12.6, 2.2, 0.9, 0.8, "prop", "couch"));

// plants and vending — tall enough to hide behind
for (const [x, z] of [
  [-19, -13], [19, -13], [-19, 13], [19, 13], [-5.6, -2.4], [5.6, 2.4], [0, -9.6], [0, 9.6],
] as [number, number][]) r.push(box(x, z, 0.7, 0.7, 1.7, "prop", "plant"));
r.push(box(-19.2, -5.5, 0.8, 1.0, 2.1, "prop", "vending"));
r.push(box(19.2, 5.5, 0.8, 1.0, 2.1, "prop", "vending"));

export const OPEN_PLAN: Rect[] = r;
