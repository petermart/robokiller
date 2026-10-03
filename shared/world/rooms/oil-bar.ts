import { FACE } from "../build.ts";
import type { RoomDef } from "../types.ts";

/** South-east. Fluid / oil on tap. */
export const OIL_BAR: RoomDef = {
  id: "bar",
  name: "Oil Bar",
  x1: 5,
  z1: 3,
  x2: 13,
  z2: 9,
  safe: true,
  light: 0xff4fd8,
  doors: { w: [6.8], n: [11] },
  stations: [
    { kind: "oil", x: 12.3, z: 7.5, face: FACE.W },
    { kind: "oil", x: 12.3, z: 4.6, face: FACE.W },
    { kind: "power", x: 7, z: 8.3, face: FACE.N },
  ],
  props: [
    { x: 9.0, z: 6.0, w: 0.6, d: 3.4, h: 1.1, kind: "prop", style: "counter" },
    { x: 7.6, z: 4.2, w: 0.9, d: 0.7, h: 2.1, kind: "prop", style: "vending" },
  ],
};
