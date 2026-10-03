// Small builders that turn authored shapes into collision rectangles.

import type { Rect, RectKind, PropStyle, RoomDef } from "./types.ts";

export const FLOOR = { x1: -20, z1: -14, x2: 20, z2: 14 };
export const CEILING_H = 3.4;
const T = 0.25; // wall thickness
const DOOR = 1.9;

/** Facings for stations (radians): the robot stands on this side of it. */
export const FACE = { N: Math.PI, S: 0, E: Math.PI / 2, W: -Math.PI / 2 };

export function box(cx: number, cz: number, w: number, d: number, h: number, kind: RectKind, style: PropStyle): Rect {
  return { x1: cx - w / 2, z1: cz - d / 2, x2: cx + w / 2, z2: cz + d / 2, h, kind, style };
}

/** A straight wall from a→b along one axis, with door gaps [centre, width]. */
export function wallLine(
  axis: "x" | "z",
  fixed: number,
  from: number,
  to: number,
  doors: [number, number][],
  kind: RectKind = "wall",
  h = CEILING_H,
): Rect[] {
  const cuts = doors.map(([c, w]) => [c - w / 2, c + w / 2] as const).sort((a, b) => a[0] - b[0]);
  let cur = from;
  const segs: [number, number][] = [];
  for (const [a, b] of cuts) {
    if (a > cur) segs.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < to) segs.push([cur, to]);
  const out: Rect[] = [];
  for (const [a, b] of segs) {
    if (b - a < 0.05) continue;
    const style = kind === "glass" ? "glass" : "wall";
    if (axis === "x") out.push(box((a + b) / 2, fixed, b - a, T, h, kind, style));
    else out.push(box(fixed, (a + b) / 2, T, b - a, h, kind, style));
  }
  return out;
}

/** The four walls of a room, with its doors cut out. */
export function roomWalls(r: RoomDef): Rect[] {
  if (!r.doors) return [];
  const d = r.doors;
  return [
    ...wallLine("x", r.z1, r.x1, r.x2, (d.n ?? []).map((c) => [c, DOOR])),
    ...wallLine("x", r.z2, r.x1, r.x2, (d.s ?? []).map((c) => [c, DOOR])),
    ...wallLine("z", r.x1, r.z1, r.z2, (d.w ?? []).map((c) => [c, DOOR])),
    ...wallLine("z", r.x2, r.z1, r.z2, (d.e ?? []).map((c) => [c, DOOR])),
  ];
}
