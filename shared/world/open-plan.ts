// Everything outside the rooms: the glass perimeter, the two service elevators, and the
// open-plan offices along the windows — cubicles, columns, lounges and plants for cover.
// Positions are authored for the 100% floor and scale with it; furniture keeps its size.

import { CEILING_H, box, wallLine } from "./build.ts";
import type { Floor, Rect } from "./types.ts";

/** The outer glass, with a gap in the east and west walls for the elevators. */
export function perimeter(f: Floor): Rect[] {
  return [
    ...wallLine("x", f.z1, f.x1, f.x2, [], "glass"),
    ...wallLine("x", f.z2, f.x1, f.x2, [], "glass"),
    ...wallLine("z", f.x1, f.z1, f.z2, [[0, 3]], "glass"),
    ...wallLine("z", f.x2, f.z1, f.z2, [[0, 3]], "glass"),
    box(f.x1 - 0.2, 0, 0.6, 3.2, CEILING_H, "wall", "elevator"),
    box(f.x2 + 0.2, 0, 0.6, 3.2, CEILING_H, "wall", "elevator"),
  ];
}

/** An L of partition with two desks: hides a robot, not a sniper's whole view. */
export function cubicle(cx: number, cz: number): Rect[] {
  return [
    box(cx, cz, 2.6, 0.12, 1.7, "partition", "partition"),
    box(cx, cz - 0.9, 0.12, 1.8, 1.7, "partition", "partition"),
    box(cx - 0.6, cz - 0.5, 1.0, 0.6, 0.78, "prop", "desk"),
    box(cx + 0.6, cz + 0.5, 1.0, 0.6, 0.78, "prop", "desk"),
  ];
}

/** The hand-placed open-plan furniture, at scale `s`. */
export function openPlanProps(s: number): Rect[] {
  const r: Rect[] = [];
  // structural columns
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      r.push(box(sx * 16.5 * s, sz * 11.5 * s, 0.8, 0.8, CEILING_H, "wall", "column"));
      r.push(box(sx * 8.5 * s, sz * 11.5 * s, 0.8, 0.8, CEILING_H, "wall", "column"));
      r.push(box(sx * 16.5 * s, sz * 5.5 * s, 0.8, 0.8, CEILING_H, "wall", "column"));
    }
  }
  // cubicle clusters: east and west strips, then north and south
  for (const [x, z] of [
    [-16.5, -8.2], [-16.5, 8.8], [16.5, -8.2], [16.5, 8.8], [-15.6, -2.6], [15.6, 3.2], [-12.5, -11.6], [12.5, 11.8],
  ] as [number, number][]) r.push(...cubicle(x * s, z * s));
  r.push(box(4.2 * s, -11.4 * s, 3.0, 0.12, 1.7, "partition", "partition"));
  r.push(box(-4.2 * s, 11.4 * s, 3.0, 0.12, 1.7, "partition", "partition"));
  // lounges
  r.push(box(-4.6 * s, -12.6 * s, 2.2, 0.9, 0.8, "prop", "couch"));
  r.push(box(12.4 * s, -12.6 * s, 2.2, 0.9, 0.8, "prop", "couch"));
  r.push(box(4.6 * s, 12.6 * s, 2.2, 0.9, 0.8, "prop", "couch"));
  r.push(box(-12.4 * s, 12.6 * s, 2.2, 0.9, 0.8, "prop", "couch"));
  // plants and vending — tall enough to hide behind
  for (const [x, z] of [
    [-19, -13], [19, -13], [-19, 13], [19, 13], [-5.6, -2.4], [5.6, 2.4], [0, -9.6], [0, 9.6],
  ] as [number, number][]) r.push(box(x * s, z * s, 0.7, 0.7, 1.7, "prop", "plant"));
  r.push(box(-19.2 * s, -5.5 * s, 0.8, 1.0, 2.1, "prop", "vending"));
  r.push(box(19.2 * s, 5.5 * s, 0.8, 1.0, 2.1, "prop", "vending"));
  return r;
}
