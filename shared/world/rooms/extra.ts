// Extra task rooms for maps with more than the four main ones: small windowless rooms the
// generator drops wherever there's space. Each has two stations of one need along its back
// wall, a door facing the middle of the floor, and a vent. Solid walls → sniper-safe.

import type { NeedKind } from "../../constants.ts";
import { FACE } from "../build.ts";
import type { RoomDef } from "../types.ts";

/** Real size — never scaled. Long side along x, or along z when `rotated`. */
export const EXTRA_W = 5.6;
export const EXTRA_D = 4.4;

const KINDS: NeedKind[] = ["power", "oil", "software", "gears"];
const LOOK: Record<NeedKind, { names: string[]; light: number }> = {
  power: { names: ["Power Closet", "Battery Room", "Charging Nook", "Fuse Room"], light: 0x7dff6a },
  oil: { names: ["Oil Closet", "Lube Station", "Fuel Depot", "Grease Pit"], light: 0xff4fd8 },
  software: { names: ["Data Closet", "Patch Room", "Server Nook", "Uplink Room"], light: 0x34e8ff },
  gears: { names: ["Parts Closet", "Gear Locker", "Tool Crib", "Spares Room"], light: 0xffb13b },
};

/**
 * Build extra room `index` centred at (cx, cz). The door goes on the side facing the
 * floor's centre; the two stations line the opposite wall, facing the door.
 */
export function extraRoom(
  index: number,
  cx: number,
  cz: number,
  rotated = false,
  /** Room-size scale (1 = 5.6 × 4.4 m). */
  k = 1,
): { room: RoomDef; vent: { x: number; z: number } } {
  const kind = KINDS[index % KINDS.length]!;
  const look = LOOK[kind];
  const name = look.names[Math.floor(index / KINDS.length) % look.names.length]!;
  const w = (rotated ? EXTRA_D : EXTRA_W) * k, d = (rotated ? EXTRA_W : EXTRA_D) * k;
  const x1 = cx - w / 2, x2 = cx + w / 2, z1 = cz - d / 2, z2 = cz + d / 2;

  // door on the wall facing the floor's centre (pick the dominant direction)
  const towardX = Math.abs(cx) / w > Math.abs(cz) / d;
  let doors: RoomDef["doors"];
  let stations: RoomDef["stations"];
  let vent: { x: number; z: number };
  if (towardX) {
    const doorEast = cx < 0; // west-side rooms open east, toward the middle
    doors = doorEast ? { e: [cz] } : { w: [cz] };
    const sx = doorEast ? x1 + 0.7 : x2 - 0.7;
    const face = doorEast ? FACE.E : FACE.W;
    stations = [
      { kind, x: sx, z: cz - 1.2 * k, face },
      { kind, x: sx, z: cz + 1.2 * k, face },
    ];
    vent = { x: doorEast ? x2 - 1.2 * k : x1 + 1.2 * k, z: cz - 1.2 * k };
  } else {
    const doorSouth = cz < 0; // north-side rooms open south
    doors = doorSouth ? { s: [cx] } : { n: [cx] };
    const sz = doorSouth ? z1 + 0.7 : z2 - 0.7;
    const face = doorSouth ? FACE.S : FACE.N;
    stations = [
      { kind, x: cx - 1.6 * k, z: sz, face },
      { kind, x: cx + 1.6 * k, z: sz, face },
    ];
    vent = { x: cx + 1.6 * k, z: doorSouth ? z2 - 1.0 * k : z1 + 1.0 * k };
  }
  const room: RoomDef = {
    id: `extra-${index}`,
    name,
    x1,
    z1,
    x2,
    z2,
    safe: true,
    light: look.light,
    doors,
    stations,
    props: [],
  };
  return { room, vent };
}
