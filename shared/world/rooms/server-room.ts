import { FACE } from "../build.ts";
import type { RoomDef } from "../types.ts";

/** North-west. Software updates; doors face the inner corridors, never a window. */
export const SERVER_ROOM: RoomDef = {
  id: "server",
  name: "Server Room",
  x1: -13,
  z1: -9,
  x2: -5,
  z2: -3,
  safe: true,
  light: 0x34e8ff,
  doors: { e: [-6.8], s: [-11] },
  stations: [
    { kind: "software", x: -12.3, z: -7.5, face: FACE.E },
    { kind: "software", x: -12.3, z: -4.6, face: FACE.E },
    { kind: "gears", x: -7, z: -8.3, face: FACE.S },
  ],
  props: [
    { x: -9.6, z: -6.8, w: 0.7, d: 2.6, h: 2.3, kind: "prop", style: "rack" },
    { x: -8.2, z: -6.8, w: 0.7, d: 2.6, h: 2.3, kind: "prop", style: "rack" },
  ],
};
