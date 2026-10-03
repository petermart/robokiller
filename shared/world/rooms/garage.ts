import { FACE } from "../build.ts";
import type { RoomDef } from "../types.ts";

/** South-west. Gears, on the lift and the bench. */
export const GARAGE: RoomDef = {
  id: "garage",
  name: "Garage",
  x1: -13,
  z1: 3,
  x2: -5,
  z2: 9,
  safe: true,
  light: 0xffb13b,
  doors: { e: [6.8], n: [-11] },
  stations: [
    { kind: "gears", x: -12.3, z: 7.5, face: FACE.E },
    { kind: "gears", x: -12.3, z: 4.6, face: FACE.E },
    { kind: "oil", x: -7, z: 8.3, face: FACE.N },
  ],
  props: [
    { x: -9.2, z: 6.2, w: 2.4, d: 1.4, h: 1.1, kind: "prop", style: "lift" },
    { x: -7.0, z: 4.0, w: 0.9, d: 0.9, h: 1.6, kind: "prop", style: "crate" },
  ],
};
