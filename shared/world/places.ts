// Named spots: vents, elevators, the distant sniper towers and the spawn ring.

import type { Nest, Vent } from "./types.ts";

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

/** The service elevators the impostor leaves by to reach a sniper nest. */
export const ELEVATORS = [
  { id: 0, x: -19.1, z: 0 },
  { id: 1, x: 19.1, z: 0 },
];

/** Distant towers with a sniper's window. Eye positions sit just proud of each facade. */
export const NESTS: Nest[] = [
  { id: 0, name: "North tower", x: -4, y: 1.4, z: -55.8, bx: -4, bz: -63, bw: 16, bd: 12, bh: 70 },
  { id: 1, name: "East tower", x: 57.8, y: 1.4, z: 5, bx: 65, bz: 5, bw: 12, bd: 18, bh: 85 },
  { id: 2, name: "South tower", x: 6, y: 1.4, z: 53.8, bx: 6, bz: 61, bw: 18, bd: 12, bh: 60 },
];

/** Robots start (and meet) on a ring round the boardroom table. */
export function spawnPoint(i: number, n: number) {
  const a = (i / Math.max(1, n)) * Math.PI * 2;
  return { x: Math.cos(a) * 3.7, z: Math.sin(a) * 2.4 };
}
