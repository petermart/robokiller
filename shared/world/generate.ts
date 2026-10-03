// Builds a floor from the host's map options. Deterministic: the server and every client
// call this with the same options + seed and get the same map, so only those few numbers
// travel over the network. At the default options it reproduces the original hand-made
// map exactly (checked by scripts/map-snapshot.ts); scripts/test-maps.ts proves every
// generated map stays fully reachable.

import { CEILING_H } from "./build.ts";
import { BASE_FLOOR, box, mainRoomTransform, overlaps, placeRoom, roomDoors, roomWalls } from "./build.ts";
import { cubicle, openPlanProps, perimeter } from "./open-plan.ts";
import { elevators, mainVents, towers } from "./places.ts";
import { BOARDROOM } from "./rooms/boardroom.ts";
import { CHARGING_BAY } from "./rooms/charging-bay.ts";
import { EXTRA_D, EXTRA_W, extraRoom } from "./rooms/extra.ts";
import { GARAGE } from "./rooms/garage.ts";
import { OIL_BAR } from "./rooms/oil-bar.ts";
import { SERVER_ROOM } from "./rooms/server-room.ts";
import type { Floor, MapOptions, Rect, Room, RoomDef, Station, Vent } from "./types.ts";
import { WorldMap } from "./worldmap.ts";

export const DEFAULT_MAP_OPTIONS: MapOptions = { size: 100, roomSize: 100, rooms: 4, props: 1, towers: 3, seed: 0 };
export const MAP_LIMITS = {
  size: [100, 200, 10],
  roomSize: [70, 150, 10],
  rooms: [4, 16, 1],
  props: [0, 5, 1],
  towers: [1, 8, 1],
} as const;
export const PROP_LEVELS = ["Sparse", "Normal", "Busy", "Packed", "Maze", "Labyrinth"] as const;

/** Per furniture level: floor area (m²) per extra piece, share of tall pieces, gap kept round each. */
const DENSITY = [
  null,
  null,
  { areaPer: 55, tall: 0.25, gap: 1.1, roomPad: 1.2, clear: 2.4 },
  { areaPer: 26, tall: 0.45, gap: 1.0, roomPad: 1.2, clear: 2.4 },
  { areaPer: 13, tall: 0.65, gap: 0.95, roomPad: 1.05, clear: 2.1 },
  { areaPer: 7, tall: 0.8, gap: 0.92, roomPad: 1.0, clear: 1.9 },
] as const;

const clamp = (v: number, [lo, hi]: readonly [number, number, number]) =>
  Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));

/** Small fast seeded RNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateMap(raw: MapOptions): WorldMap {
  const o: MapOptions = {
    size: clamp(raw.size, MAP_LIMITS.size),
    roomSize: clamp(raw.roomSize ?? 100, MAP_LIMITS.roomSize),
    rooms: clamp(raw.rooms, MAP_LIMITS.rooms),
    props: clamp(raw.props, MAP_LIMITS.props),
    towers: clamp(raw.towers, MAP_LIMITS.towers),
    seed: raw.seed >>> 0,
  };
  const s = o.size / 100;
  const k = o.roomSize / 100;
  const floor: Floor = { x1: BASE_FLOOR.x1 * s, z1: BASE_FLOOR.z1 * s, x2: BASE_FLOOR.x2 * s, z2: BASE_FLOOR.z2 * s };

  // the four main rooms move outward with the floor (keeping their size); the boardroom
  // stays in the middle round the table
  const authored = [SERVER_ROOM, CHARGING_BAY, GARAGE, OIL_BAR];
  const main = authored.map((r) => placeRoom(r, s, k));
  const defs: RoomDef[] = [...main, BOARDROOM];
  const place = (id: string, x: number, z: number) => {
    if (s === 1 && k === 1) return { x, z };
    return mainRoomTransform(authored.find((r) => r.id === id)!, s, k).point(x, z);
  };
  const vents: Vent[] = mainVents(s, place);
  const lifts = elevators(floor);

  // extra rooms, each in the most open spot left
  const extras = placeExtraRooms(o.rooms - 4, floor, defs, vents, lifts, k);
  for (const e of extras) {
    defs.push(e.room);
    vents.push({ id: vents.length, ...e.vent });
  }

  const rooms: Room[] = defs.map(({ id, name, x1, z1, x2, z2, safe, light }) => ({ id, name, x1, z1, x2, z2, safe, light }));
  const stations: Station[] = [];
  const rects: Rect[] = [...perimeter(floor)];
  for (const room of defs) {
    rects.push(...roomWalls(room));
    for (const st of room.stations) {
      stations.push({ id: stations.length, ...st });
      rects.push(box(st.x, st.z, 0.9, 0.9, 1.3, "prop", "station"));
    }
    for (const p of room.props) rects.push(box(p.x, p.z, p.w, p.d, p.h, p.kind, p.style));
  }

  // open-plan furniture: the hand-placed set, minus anything crowding an extra room
  // (1.3 m keeps a robot-wide way round it and through its door)…
  const extraDefs = extras.map((e) => e.room);
  let furniture = openPlanProps(s).filter(
    (p) => !extraDefs.some((c) => overlaps(p, c, 1.3)) && !main.some((r) => overlaps(p, r, k > 1 ? 1.3 : 0)),
  );
  // …thinned out for "sparse" (columns, plants and vending stay for some cover)…
  if (o.props === 0) furniture = furniture.filter((p) => p.style === "column" || p.style === "plant" || p.style === "vending");
  rects.push(...furniture);

  // …or topped up with seeded extras from "busy" upward
  if (o.props >= 2) {
    const keepClear = [...defs.flatMap(roomDoors), ...vents, ...lifts];
    rects.push(...extraFurniture(o, floor, rects, defs, keepClear));
  }

  return new WorldMap(o, floor, rects, rooms, stations, vents, lifts, towers(floor, o.towers));
}

/**
 * Drop up to `count` extra rooms, one at a time, each at the candidate spot farthest from
 * every room so far — corners first, then along the walls, then the open middle. A spot
 * must leave a 1.5 m corridor round every room and keep elevators, vents and doors clear.
 */
function placeExtraRooms(
  count: number,
  f: Floor,
  existing: RoomDef[],
  vents: Vent[],
  lifts: { x: number; z: number }[],
  k: number,
) {
  const placed: ReturnType<typeof extraRoom>[] = [];
  const all = [...existing];
  const centre = (r: RoomDef) => ({ x: (r.x1 + r.x2) / 2, z: (r.z1 + r.z2) / 2 });
  const doors = existing.flatMap(roomDoors);
  for (let i = 0; i < count; i++) {
    let best: { x: number; z: number; rotated: boolean; score: number } | null = null;
    for (const rotated of [false, true]) {
      const w = (rotated ? EXTRA_D : EXTRA_W) * k, d = (rotated ? EXTRA_W : EXTRA_D) * k;
      for (let cx = f.x1 + 0.6 + w / 2; cx <= f.x2 - 0.6 - w / 2; cx += 1) {
        for (let cz = f.z1 + 0.6 + d / 2; cz <= f.z2 - 0.6 - d / 2; cz += 1) {
          const b = { x1: cx - w / 2, z1: cz - d / 2, x2: cx + w / 2, z2: cz + d / 2 };
          if (all.some((r) => overlaps(b, r, 1.5))) continue;
          if (lifts.some((e) => overlaps(b, { x1: e.x - 4.5, z1: e.z - 2.6, x2: e.x + 4.5, z2: e.z + 2.6 }))) continue;
          if (vents.some((v) => overlaps(b, { x1: v.x, z1: v.z, x2: v.x, z2: v.z }, 1.4))) continue;
          if (doors.some((d) => overlaps(b, { x1: d.x, z1: d.z, x2: d.x, z2: d.z }, 2.2))) continue;
          let score = Infinity;
          for (const r of all) {
            const c = centre(r);
            score = Math.min(score, Math.hypot(c.x - cx, c.z - cz));
          }
          if (!best || score > best.score + 1e-9) best = { x: cx, z: cz, rotated, score };
        }
      }
    }
    if (!best) break; // nothing else fits at this size
    const e = extraRoom(i, best.x, best.z, best.rotated, k);
    placed.push(e);
    all.push(e.room);
    doors.push(...roomDoors(e.room));
    vents.push({ id: -1, ...e.vent }); // reserve its vent spot for later candidates
  }
  vents.splice(vents.length - placed.length, placed.length); // the caller assigns real ids
  return placed;
}

/**
 * Scatter extra cover into open floor, placed by trial and error so each piece keeps a
 * robot-wide gap round it and stays out of rooms, doorways, vents and elevators. Higher
 * levels add more pieces and a bigger share of tall ones (dividers, shelving, crate
 * stacks, pillars) that actually break up sightlines.
 */
function extraFurniture(
  o: MapOptions,
  f: Floor,
  existing: Rect[],
  rooms: RoomDef[],
  keepClear: { x: number; z: number }[],
): Rect[] {
  const d = DENSITY[o.props]!;
  const rand = rng(o.seed * 7919 + o.size * 31 + o.rooms * 7 + o.props);
  const area = (f.x2 - f.x1) * (f.z2 - f.z1);
  const want = Math.round(area / d.areaPer);
  const placed: Rect[] = [];
  let pieces = 0;
  const solid = existing.filter((r) => r.kind !== "glass");
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;

  const tallPiece = (x: number, z: number): Rect[] => {
    const roll = rand();
    const along = rand() < 0.5; // orientation: long side along x or z
    if (roll < 0.4) {
      // office divider: a tall wall panel
      // the maze levels get longer walls, which read as corridors rather than clutter
      const len = 3 + rand() * 2.5 + Math.max(0, o.props - 3) * 1.2;
      return [along ? box(x, z, len, 0.16, 2.7, "partition", "divider") : box(x, z, 0.16, len, 2.7, "partition", "divider")];
    }
    if (roll < 0.55) {
      // L of dividers
      const a = 2.6 + rand() * 1.6, b = 2 + rand() * 1.4;
      const sx = rand() < 0.5 ? -1 : 1, sz = rand() < 0.5 ? -1 : 1;
      return [
        box(x, z, a, 0.16, 2.7, "partition", "divider"),
        box(x + (sx * a) / 2, z + (sz * b) / 2, 0.16, b, 2.7, "partition", "divider"),
      ];
    }
    if (roll < 0.8) {
      // storage shelving
      return [along ? box(x, z, 2.4, 0.7, 2.6, "prop", "shelf") : box(x, z, 0.7, 2.4, 2.6, "prop", "shelf")];
    }
    if (roll < 0.93) {
      // crate stack, two high, with a loose one beside it
      return [box(x, z, 1.0, 1.0, 2.0, "prop", "crate"), box(x + 1.05, z + pick([-0.3, 0.3]), 0.9, 0.9, 1.0, "prop", "crate")];
    }
    return [box(x, z, 0.8, 0.8, CEILING_H, "wall", "column")];
  };
  const shortPiece = (x: number, z: number): Rect[] => {
    const roll = rand();
    if (roll < 0.4) return cubicle(x, z);
    if (roll < 0.65) return [box(x, z, 0.7, 0.7, 1.7, "prop", "plant")];
    if (roll < 0.85) return [box(x, z, 2.2, 0.9, 0.8, "prop", "couch")];
    return [box(x, z, 0.9, 0.9, 1.6, "prop", "crate"), box(x + 0.95, z + 0.1, 0.9, 0.9, 1.1, "prop", "crate")];
  };

  for (let tries = 0; tries < want * 140 && pieces < want; tries++) {
    const x = f.x1 + 2 + rand() * (f.x2 - f.x1 - 4);
    const z = f.z1 + 2 + rand() * (f.z2 - f.z1 - 4);
    const piece = rand() < d.tall ? tallPiece(x, z) : shortPiece(x, z);
    const bounds = {
      x1: Math.min(...piece.map((p) => p.x1)),
      z1: Math.min(...piece.map((p) => p.z1)),
      x2: Math.max(...piece.map((p) => p.x2)),
      z2: Math.max(...piece.map((p) => p.z2)),
    };
    if (bounds.x1 < f.x1 + 1.2 || bounds.x2 > f.x2 - 1.2 || bounds.z1 < f.z1 + 1.2 || bounds.z2 > f.z2 - 1.2) continue;
    if (rooms.some((r) => overlaps(bounds, r, d.roomPad))) continue;
    if (piece.some((p) => [...solid, ...placed].some((r) => overlaps(p, r, d.gap)))) continue;
    const c = d.clear;
    if (keepClear.some((p) => p.x > bounds.x1 - c && p.x < bounds.x2 + c && p.z > bounds.z1 - c && p.z < bounds.z2 + c)) continue;
    placed.push(...piece);
    pieces++;
  }
  return placed;
}
