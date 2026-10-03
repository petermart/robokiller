// Small builders that turn authored shapes into collision rectangles.

import type { Floor, Rect, RectKind, PropStyle, RoomDef } from "./types.ts";

/** The original floor (map size 100%): 40 × 28 m. Larger maps scale it. */
export const BASE_FLOOR: Floor = { x1: -20, z1: -14, x2: 20, z2: 14 };
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

/** Door centres of a room, in world coordinates (kept clear of extra furniture). */
export function roomDoors(r: RoomDef): { x: number; z: number }[] {
  const d = r.doors;
  if (!d) return [];
  return [
    ...(d.n ?? []).map((x) => ({ x, z: r.z1 })),
    ...(d.s ?? []).map((x) => ({ x, z: r.z2 })),
    ...(d.w ?? []).map((z) => ({ x: r.x1, z })),
    ...(d.e ?? []).map((z) => ({ x: r.x2, z })),
  ];
}

/**
 * Where a point inside a main room ends up when the floor scales by `s` and rooms by `k`.
 * Rooms keep their inner edges a scaled corridor away from the boardroom (x ±5, z ±3 at
 * 100%) and grow outward from there; things inside keep their place relative to the walls.
 */
export function mainRoomTransform(r: { x1: number; z1: number; x2: number; z2: number }, s: number, k: number) {
  const cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
  const hw = (r.x2 - r.x1) / 2, hd = (r.z2 - r.z1) / 2;
  const sx = Math.sign(cx), sz = Math.sign(cz);
  const inner = { x: Math.abs(cx) - hw, z: Math.abs(cz) - hd }; // 5 and 3 for the originals
  const ncx = sx * (inner.x * s + hw * k);
  const ncz = sz * (inner.z * s + hd * k);
  return {
    point: (x: number, z: number) => ({ x: ncx + (x - cx) * k, z: ncz + (z - cz) * k }),
    x: (x: number) => ncx + (x - cx) * k,
    z: (z: number) => ncz + (z - cz) * k,
  };
}

/**
 * Place an authored main room for this floor (`s`) and room size (`k`). Walls, doors,
 * stations and furniture move with it; furniture and stations keep their real size.
 */
export function placeRoom(r: RoomDef, s: number, k = 1): RoomDef {
  if (s === 1 && k === 1) return r;
  const t = mainRoomTransform(r, s, k);
  return {
    ...r,
    x1: t.x(r.x1),
    z1: t.z(r.z1),
    x2: t.x(r.x2),
    z2: t.z(r.z2),
    doors: r.doors && {
      n: r.doors.n?.map(t.x),
      s: r.doors.s?.map(t.x),
      w: r.doors.w?.map(t.z),
      e: r.doors.e?.map(t.z),
    },
    stations: r.stations.map((st) => ({ ...st, ...pushOff(t.point(st.x, st.z), st, r, t) })),
    props: r.props.map((p) => ({ ...p, ...t.point(p.x, p.z) })),
  };
}

/**
 * Stations hug their wall: keep each one's original distance from the nearest wall rather
 * than scaling it, so shrinking a room never pushes a station into the wall.
 */
function pushOff(
  p: { x: number; z: number },
  st: { x: number; z: number },
  r: { x1: number; z1: number; x2: number; z2: number },
  t: ReturnType<typeof mainRoomTransform>,
) {
  const gaps = [st.x - r.x1, r.x2 - st.x, st.z - r.z1, r.z2 - st.z];
  const m = Math.min(...gaps);
  if (m === gaps[0]) return { x: t.x(r.x1) + gaps[0], z: p.z };
  if (m === gaps[1]) return { x: t.x(r.x2) - gaps[1], z: p.z };
  if (m === gaps[2]) return { x: p.x, z: t.z(r.z1) + gaps[2] };
  return { x: p.x, z: t.z(r.z2) - gaps[3] };
}

export function shiftRoom(r: RoomDef, tx: number, tz: number): RoomDef {
  return {
    ...r,
    x1: r.x1 + tx,
    z1: r.z1 + tz,
    x2: r.x2 + tx,
    z2: r.z2 + tz,
    doors: r.doors && {
      n: r.doors.n?.map((v) => v + tx),
      s: r.doors.s?.map((v) => v + tx),
      w: r.doors.w?.map((v) => v + tz),
      e: r.doors.e?.map((v) => v + tz),
    },
    stations: r.stations.map((st) => ({ ...st, x: st.x + tx, z: st.z + tz })),
    props: r.props.map((p) => ({ ...p, x: p.x + tx, z: p.z + tz })),
  };
}

/** Do two rectangles overlap once `a` is grown by `pad` on every side? */
export function overlaps(a: { x1: number; z1: number; x2: number; z2: number }, b: typeof a, pad = 0) {
  return a.x1 - pad < b.x2 && a.x2 + pad > b.x1 && a.z1 - pad < b.z2 && a.z2 + pad > b.z1;
}
