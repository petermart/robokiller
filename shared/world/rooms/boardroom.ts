import type { RoomDef } from "../types.ts";

/** The long table everyone gathers round; the emergency button sits in its middle. */
export const TABLE = { x: 0, z: 0, w: 4.6, d: 2.0 };
export const BUTTON = { x: 0, z: 0 };

/** Centre of the floor. Open on all sides (no walls), so it can be sniped. */
export const BOARDROOM: RoomDef = {
  id: "board",
  name: "Boardroom",
  x1: -5,
  z1: -3,
  x2: 5,
  z2: 3,
  safe: false,
  light: 0xffe7b0,
  stations: [],
  props: [{ x: TABLE.x, z: TABLE.z, w: TABLE.w, d: TABLE.d, h: 0.8, kind: "prop", style: "table" }],
};
