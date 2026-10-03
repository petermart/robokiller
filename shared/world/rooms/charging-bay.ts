import { FACE } from "../build.ts";
import type { RoomDef } from "../types.ts";

/** North-east. Electricity: the robots' med bay. */
export const CHARGING_BAY: RoomDef = {
  id: "medbay",
  name: "Charging Bay",
  x1: 5,
  z1: -9,
  x2: 13,
  z2: -3,
  safe: true,
  light: 0x7dff6a,
  doors: { w: [-6.8], s: [11] },
  stations: [
    { kind: "power", x: 12.3, z: -7.5, face: FACE.W },
    { kind: "power", x: 12.3, z: -4.6, face: FACE.W },
    { kind: "software", x: 7, z: -8.3, face: FACE.S },
  ],
  props: [
    { x: 9.2, z: -7.6, w: 2.0, d: 0.9, h: 0.7, kind: "prop", style: "bed" },
    { x: 9.2, z: -4.8, w: 2.0, d: 0.9, h: 0.7, kind: "prop", style: "bed" },
  ],
};
