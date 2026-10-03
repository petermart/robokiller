// Named spots: vents, elevators, the distant sniper towers and the spawn ring — laid out
// relative to the floor so they move with the map size.

import type { Floor, Nest, Vent } from "./types.ts";

/**
 * The six main vents: four inside the main rooms (they move with their room) and two in
 * the north/south corridors (they scale with the floor). `place` maps a point in a main
 * room's original layout to where it ends up on this floor (see placeRoom).
 */
export function mainVents(s: number, place: (roomId: string, x: number, z: number) => { x: number; z: number }): Vent[] {
  const inRoom = (id: number, roomId: string, x: number, z: number): Vent => ({ id, ...place(roomId, x, z) });
  return [
    inRoom(0, "server", -10.6, -4.2),
    { id: 1, x: 0 * s, z: -12.4 * s },
    inRoom(2, "medbay", 10.6, -4.2),
    inRoom(3, "bar", 10.6, 4.2),
    { id: 4, x: 0 * s, z: 12.4 * s },
    inRoom(5, "garage", -10.6, 4.2),
  ];
}

/** The service elevators the impostor leaves by, in the middle of the east and west walls. */
export function elevators(f: Floor) {
  return [
    { id: 0, x: f.x1 + 0.9, z: 0 },
    { id: 1, x: f.x2 - 0.9, z: 0 },
  ];
}

/**
 * Sniper towers, in the order they're added as the host raises the count: the three
 * originals (north, east, south), then west, then the four diagonals. Each window sits
 * 1.2 m proud of its tower's facade, facing the floor along x or z.
 */
export function towers(f: Floor, count: number): Nest[] {
  const { x1, z1, x2, z2 } = f;
  const all: Omit<Nest, "id">[] = [
    { name: "North tower", x: -4, y: 1.4, z: z1 - 41.8, bx: -4, bz: z1 - 49, bw: 16, bd: 12, bh: 70 },
    { name: "East tower", x: x2 + 37.8, y: 1.4, z: 5, bx: x2 + 45, bz: 5, bw: 12, bd: 18, bh: 85 },
    { name: "South tower", x: 6, y: 1.4, z: z2 + 39.8, bx: 6, bz: z2 + 47, bw: 18, bd: 12, bh: 60 },
    { name: "West tower", x: x1 - 39, y: 1.4, z: -6, bx: x1 - 46.2, bz: -6, bw: 12, bd: 16, bh: 75 },
    { name: "North-east tower", x: x2 + 30, y: 1.4, z: z1 - 28, bx: x2 + 37.2, bz: z1 - 28, bw: 12, bd: 14, bh: 90 },
    { name: "South-west tower", x: x1 - 30, y: 1.4, z: z2 + 28, bx: x1 - 37.2, bz: z2 + 28, bw: 12, bd: 14, bh: 65 },
    { name: "North-west tower", x: x1 - 28, y: 1.4, z: z1 - 30, bx: x1 - 28, bz: z1 - 37.2, bw: 14, bd: 12, bh: 80 },
    { name: "South-east tower", x: x2 + 28, y: 1.4, z: z2 + 30, bx: x2 + 28, bz: z2 + 37.2, bw: 14, bd: 12, bh: 70 },
  ];
  return all.slice(0, Math.max(1, Math.min(all.length, count))).map((n, id) => ({ id, ...n }));
}
export const MAX_TOWERS = 8;

/** Robots start (and meet) on a ring round the boardroom table. */
export function spawnPoint(i: number, n: number) {
  const a = (i / Math.max(1, n)) * Math.PI * 2;
  return { x: Math.cos(a) * 3.7, z: Math.sin(a) * 2.4 };
}
