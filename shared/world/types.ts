// Shapes of the map data. The server uses it for range, collision and sniper
// line-of-sight; the client builds its 3D scene from the same rectangles.
//
// Axes: x east, z south, y up. Floor is y = 0. Everything is in metres.

import type { NeedKind } from "../constants.ts";

export type RectKind = "wall" | "glass" | "partition" | "prop";
export type PropStyle =
  | "wall"
  | "glass"
  | "partition"
  | "column"
  | "rack"
  | "vending"
  | "couch"
  | "plant"
  | "desk"
  | "bed"
  | "counter"
  | "lift"
  | "bench"
  | "table"
  | "elevator"
  | "station"
  | "crate";

export interface Rect {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  h: number;
  kind: RectKind;
  style: PropStyle;
}

export interface Room {
  id: string;
  name: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  /** Task rooms cannot be sniped into. */
  safe: boolean;
  /** Neon accent for the room's lighting. */
  light: number;
}

/** A room as authored in its own file: footprint plus doors, stations and furniture. */
export interface RoomDef extends Room {
  /** Walls with door gaps at these centres; omit `doors` for an open room with no walls. */
  doors?: { n?: number[]; s?: number[]; w?: number[]; e?: number[] };
  stations: { kind: NeedKind; x: number; z: number; face: number }[];
  /** Furniture: centre, footprint, height, how it blocks, how it looks. */
  props: { x: number; z: number; w: number; d: number; h: number; kind: RectKind; style: PropStyle }[];
}

export interface Station {
  id: number;
  kind: NeedKind;
  x: number;
  z: number;
  /** Direction the station faces (radians, 0 = +z). The robot stands in front of it. */
  face: number;
}

export interface Vent {
  id: number;
  x: number;
  z: number;
}

export interface Nest {
  id: number;
  name: string;
  /** Eye position of the sniper. */
  x: number;
  y: number;
  z: number;
  /** Footprint of the building the nest sits in. */
  bx: number;
  bz: number;
  bw: number;
  bd: number;
  bh: number;
}
