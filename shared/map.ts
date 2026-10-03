// The one floor of the tower, as plain 2D data. The server uses it for range, collision
// and sniper line-of-sight; the client builds its 3D scene from the same rectangles.
//
// Axes: x east, z south, y up. Floor is y = 0. Everything here is in metres.

import type { NeedKind } from "./constants.ts";

export type RectKind = "wall" | "glass" | "partition" | "prop";
export type PropStyle =
  | "wall"
  | "glass"
  | "partition"
  | "column"
  | "rack"
  | "vending"
  | "couch"
  | "plant"
  | "desk"
  | "bed"
  | "counter"
  | "lift"
  | "bench"
  | "table"
  | "elevator"
  | "station"
  | "crate";

export interface Rect {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  h: number;
  kind: RectKind;
  style: PropStyle;
}

export interface Room {
  id: string;
  name: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  /** Task rooms cannot be sniped into. */
  safe: boolean;
  /** Neon accent for the room's lighting. */
  light: number;
}

export interface Station {
  id: number;
  kind: NeedKind;
  x: number;
  z: number;
  /** Direction the station faces (radians, 0 = +z). The robot stands in front of it. */
  face: number;
}

export interface Vent {
  id: number;
  x: number;
  z: number;
}

export interface Nest {
  id: number;
  name: string;
  /** Eye position of the sniper. */
  x: number;
  y: number;
  z: number;
  /** Footprint of the building the nest sits in. */
  bx: number;
  bz: number;
  bw: number;
  bd: number;
  bh: number;
}

export const FLOOR = { x1: -20, z1: -14, x2: 20, z2: 14 };
export const CEILING_H = 3.4;
const T = 0.25; // wall thickness

const rects: Rect[] = [];

function box(cx: number, cz: number, w: number, d: number, h: number, kind: RectKind, style: PropStyle) {
  rects.push({ x1: cx - w / 2, z1: cz - d / 2, x2: cx + w / 2, z2: cz + d / 2, h, kind, style });
}

/** A straight wall from a→b along one axis, with door gaps [centre, width]. */
function wallLine(
  axis: "x" | "z",
  fixed: number,
  from: number,
  to: number,
  doors: [number, number][],
  kind: RectKind = "wall",
  h = CEILING_H,
) {
  const cuts = doors
    .map(([c, w]) => [c - w / 2, c + w / 2] as const)
    .sort((a, b) => a[0] - b[0]);
  let cur = from;
  const segs: [number, number][] = [];
  for (const [a, b] of cuts) {
    if (a > cur) segs.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < to) segs.push([cur, to]);
  for (const [a, b] of segs) {
    if (b - a < 0.05) continue;
    if (axis === "x") box((a + b) / 2, fixed, b - a, T, h, kind, kind === "glass" ? "glass" : "wall");
    else box(fixed, (a + b) / 2, T, b - a, h, kind, kind === "glass" ? "glass" : "wall");
  }
}

// --- perimeter: glass all round, except the two service elevators -------------------
wallLine("x", FLOOR.z1, FLOOR.x1, FLOOR.x2, [], "glass");
wallLine("x", FLOOR.z2, FLOOR.x1, FLOOR.x2, [], "glass");
wallLine("z", FLOOR.x1, FLOOR.z1, FLOOR.z2, [[0, 3]], "glass");
wallLine("z", FLOOR.x2, FLOOR.z1, FLOOR.z2, [[0, 3]], "glass");
box(FLOOR.x1 - 0.2, 0, 0.6, 3.2, CEILING_H, "wall", "elevator");
box(FLOOR.x2 + 0.2, 0, 0.6, 3.2, CEILING_H, "wall", "elevator");

// --- rooms ---------------------------------------------------------------------------
export const ROOMS: Room[] = [
  { id: "server", name: "Server Room", x1: -13, z1: -9, x2: -5, z2: -3, safe: true, light: 0x34e8ff },
  { id: "medbay", name: "Charging Bay", x1: 5, z1: -9, x2: 13, z2: -3, safe: true, light: 0x7dff6a },
  { id: "garage", name: "Garage", x1: -13, z1: 3, x2: -5, z2: 9, safe: true, light: 0xffb13b },
  { id: "bar", name: "Oil Bar", x1: 5, z1: 3, x2: 13, z2: 9, safe: true, light: 0xff4fd8 },
  { id: "board", name: "Boardroom", x1: -5, z1: -3, x2: 5, z2: 3, safe: false, light: 0xffe7b0 },
];

function roomWalls(r: Room, doors: { n?: number[]; s?: number[]; w?: number[]; e?: number[] }) {
  const D = 1.9;
  wallLine("x", r.z1, r.x1, r.x2, (doors.n ?? []).map((c) => [c, D]));
  wallLine("x", r.z2, r.x1, r.x2, (doors.s ?? []).map((c) => [c, D]));
  wallLine("z", r.x1, r.z1, r.z2, (doors.w ?? []).map((c) => [c, D]));
  wallLine("z", r.x2, r.z1, r.z2, (doors.e ?? []).map((c) => [c, D]));
}
// Doors face the inner corridors only, so nothing in a task room lines up with a window.
roomWalls(ROOMS[0]!, { e: [-6.8], s: [-11] });
roomWalls(ROOMS[1]!, { w: [-6.8], s: [11] });
roomWalls(ROOMS[2]!, { e: [6.8], n: [-11] });
roomWalls(ROOMS[3]!, { w: [6.8], n: [11] });

// --- stations: two of a room's own kind, plus one of another kind ------------------
export const STATIONS: Station[] = [];
function station(kind: NeedKind, x: number, z: number, face: number) {
  STATIONS.push({ id: STATIONS.length, kind, x, z, face });
  box(x, z, 0.9, 0.9, 1.3, "prop", "station");
}
const N = Math.PI, S = 0, E = Math.PI / 2, W = -Math.PI / 2;
station("software", -12.3, -7.5, E);
station("software", -12.3, -4.6, E);
station("gears", -7, -8.3, S);
station("power", 12.3, -7.5, W);
station("power", 12.3, -4.6, W);
station("software", 7, -8.3, S);
station("gears", -12.3, 7.5, E);
station("gears", -12.3, 4.6, E);
station("oil", -7, 8.3, N);
station("oil", 12.3, 7.5, W);
station("oil", 12.3, 4.6, W);
station("power", 7, 8.3, N);

// --- room dressing --------------------------------------------------------------------
// server racks
box(-9.6, -6.8, 0.7, 2.6, 2.3, "prop", "rack");
box(-8.2, -6.8, 0.7, 2.6, 2.3, "prop", "rack");
// charging beds
box(9.2, -7.6, 2.0, 0.9, 0.7, "prop", "bed");
box(9.2, -4.8, 2.0, 0.9, 0.7, "prop", "bed");
// garage lift + crates
box(-9.2, 6.2, 2.4, 1.4, 1.1, "prop", "lift");
box(-7.0, 4.0, 0.9, 0.9, 1.6, "prop", "crate");
// oil bar counter
box(9.0, 6.0, 0.6, 3.4, 1.1, "prop", "counter");
box(7.6, 4.2, 0.9, 0.7, 2.1, "prop", "vending");

// --- boardroom ------------------------------------------------------------------------
export const TABLE = { x: 0, z: 0, w: 4.6, d: 2.0 };
box(TABLE.x, TABLE.z, TABLE.w, TABLE.d, 0.8, "prop", "table");
export const BUTTON = { x: 0, z: 0 };

// --- open-plan perimeter offices: cubicles, columns, lounges --------------------------
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    box(sx * 16.5, sz * 11.5, 0.8, 0.8, CEILING_H, "wall", "column");
    box(sx * 8.5, sz * 11.5, 0.8, 0.8, CEILING_H, "wall", "column");
    box(sx * 16.5, sz * 5.5, 0.8, 0.8, CEILING_H, "wall", "column");
  }
}
// cubicle clusters, east and west strips
function cubicles(cx: number, cz: number) {
  box(cx, cz, 2.6, 0.12, 1.7, "partition", "partition");
  box(cx, cz - 0.9, 0.12, 1.8, 1.7, "partition", "partition");
  box(cx - 0.6, cz - 0.5, 1.0, 0.6, 0.78, "prop", "desk");
  box(cx + 0.6, cz + 0.5, 1.0, 0.6, 0.78, "prop", "desk");
}
cubicles(-16.5, -8.2);
cubicles(-16.5, 8.8);
cubicles(16.5, -8.2);
cubicles(16.5, 8.8);
cubicles(-15.6, -2.6);
cubicles(15.6, 3.2);
// north and south strips
cubicles(-12.5, -11.6);
cubicles(12.5, 11.8);
box(4.2, -11.4, 3.0, 0.12, 1.7, "partition", "partition");
box(-4.2, 11.4, 3.0, 0.12, 1.7, "partition", "partition");
// lounges
box(-4.6, -12.6, 2.2, 0.9, 0.8, "prop", "couch");
box(12.4, -12.6, 2.2, 0.9, 0.8, "prop", "couch");
box(4.6, 12.6, 2.2, 0.9, 0.8, "prop", "couch");
box(-12.4, 12.6, 2.2, 0.9, 0.8, "prop", "couch");
// plants and vending — tall enough to hide behind
for (const [x, z] of [
  [-19, -13], [19, -13], [-19, 13], [19, 13], [-5.6, -2.4], [5.6, 2.4], [0, -9.6], [0, 9.6],
] as [number, number][]) box(x, z, 0.7, 0.7, 1.7, "prop", "plant");
box(-19.2, -5.5, 0.8, 1.0, 2.1, "prop", "vending");
box(19.2, 5.5, 0.8, 1.0, 2.1, "prop", "vending");

export const RECTS: Rect[] = rects;

// --- vents ----------------------------------------------------------------------------
export const VENTS: Vent[] = [
  { id: 0, x: -10.6, z: -4.2 },
  { id: 1, x: 0, z: -12.4 },
  { id: 2, x: 10.6, z: -4.2 },
  { id: 3, x: 10.6, z: 4.2 },
  { id: 4, x: 0, z: 12.4 },
  { id: 5, x: -10.6, z: 4.2 },
];
/** Vents form one loop; a crawler steps to the neighbour either way. */
export function ventNeighbour(id: number, dir: 1 | -1): number {
  return (id + dir + VENTS.length) % VENTS.length;
}

// --- elevators the impostor leaves by ---------------------------------------------------
export const ELEVATORS = [
  { id: 0, x: -19.1, z: 0 },
  { id: 1, x: 19.1, z: 0 },
];

// --- distant towers with a sniper's window ----------------------------------------------
export const NESTS: Nest[] = [
  // eye positions sit just proud of each facade, in an open window box
  { id: 0, name: "North tower", x: -4, y: 1.4, z: -55.8, bx: -4, bz: -63, bw: 16, bd: 12, bh: 70 },
  { id: 1, name: "East tower", x: 57.8, y: 1.4, z: 5, bx: 65, bz: 5, bw: 12, bd: 18, bh: 85 },
  { id: 2, name: "South tower", x: 6, y: 1.4, z: 53.8, bx: 6, bz: 61, bw: 18, bd: 12, bh: 60 },
];

// --- spawn ring around the boardroom table ---------------------------------------------
export function spawnPoint(i: number, n: number) {
  const a = (i / Math.max(1, n)) * Math.PI * 2;
  return { x: Math.cos(a) * 3.7, z: Math.sin(a) * 2.4 };
}

// --- geometry helpers --------------------------------------------------------------------

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
